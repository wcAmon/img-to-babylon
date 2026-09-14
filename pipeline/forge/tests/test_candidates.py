from __future__ import annotations
import json, struct, sys, tempfile, unittest, zlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'integrations' / 'mesh3d'))
from forge.tests.test_glb_reference import write_triangle_glb
from forge._shared.png import write_rgba
import candidates


def write_scaled_textured_glb(path: Path) -> None:
    """A single-triangle GLB like write_triangle_glb, but with a node scale of [2,2,2] and
    one embedded 1x1 PNG image (bufferView-backed, referenced as a baseColorTexture)."""
    positions = struct.pack("<9f", -1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0)
    with tempfile.TemporaryDirectory() as d:
        png_path = Path(d) / "pixel.png"
        write_rgba(png_path, 1, 1, bytes([200, 30, 30, 255]))
        image_bytes = png_path.read_bytes()
    document = {
        "asset": {"version": "2.0", "generator": "test"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "Root", "mesh": 0, "scale": [2.0, 2.0, 2.0]}],
        "meshes": [{"name": "Triangle", "primitives": [{"attributes": {"POSITION": 0}, "material": 0}]}],
        "materials": [{"name": "TestMaterial", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}}],
        "textures": [{"source": 0}],
        "images": [{"mimeType": "image/png", "bufferView": 1}],
        "buffers": [{"byteLength": len(positions) + len(image_bytes)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(positions)},
            {"buffer": 0, "byteOffset": len(positions), "byteLength": len(image_bytes)},
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": 3,
                "type": "VEC3",
                "min": [-1.0, 0.0, 0.0],
                "max": [1.0, 1.0, 0.0],
            }
        ],
    }
    json_chunk = json.dumps(document, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    bin_raw = positions + image_bytes
    bin_chunk = bin_raw + b"\x00" * ((4 - len(bin_raw) % 4) % 4)
    total_length = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, total_length)
        + struct.pack("<II", len(json_chunk), 0x4E4F534A)
        + json_chunk
        + struct.pack("<II", len(bin_chunk), 0x004E4942)
        + bin_chunk
    )


class Candidates(unittest.TestCase):
    def test_summary_reads_provenance_and_probe(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for ep in ('tripo', 'rodin'):
                (root / ep).mkdir(); write_triangle_glb(root / ep / 'model.glb')
                (root / ep / 'provenance.json').write_text(json.dumps({'endpoint': ep, 'requestId': 'r-' + ep, 'outputs': []}))
            s = candidates.summarize_candidates(root)
            self.assertEqual([c['endpoint'] for c in s['candidates']], ['tripo', 'rodin'])
            self.assertEqual(s['candidates'][0]['requestId'], 'r-tripo')
            self.assertEqual(len(s['candidates'][0]['sha256']), 64)
            self.assertGreaterEqual(s['candidates'][0]['meshCount'], 1)

    def test_probe_path_excluded(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for ep in ('tripo', 'rodin'):
                (root / ep).mkdir(); write_triangle_glb(root / ep / 'model.glb')
                (root / ep / 'provenance.json').write_text(json.dumps({'endpoint': ep, 'requestId': 'r-' + ep, 'outputs': []}))
            s = candidates.summarize_candidates(root)
            self.assertNotIn('/Users/', json.dumps(s))
            self.assertNotIn('path', s['candidates'][0]['probe'])

    def test_extra_merged_per_endpoint(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for ep in ('tripo', 'rodin'):
                (root / ep).mkdir(); write_triangle_glb(root / ep / 'model.glb')
                (root / ep / 'provenance.json').write_text(json.dumps({'endpoint': ep, 'requestId': 'r-' + ep, 'outputs': []}))
            extra = {'tripo': {'viewerAzimuthOffsetDegrees': 90}}
            s = candidates.summarize_candidates(root, extra=extra)
            by_ep = {c['endpoint']: c for c in s['candidates']}
            self.assertEqual(by_ep['tripo']['viewerAzimuthOffsetDegrees'], 90)
            self.assertNotIn('viewerAzimuthOffsetDegrees', by_ep['rodin'])

    def test_triangle_vertex_texture_and_world_bounds(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / 'tripo').mkdir(); write_scaled_textured_glb(root / 'tripo' / 'model.glb')
            (root / 'tripo' / 'provenance.json').write_text(json.dumps({'endpoint': 'tripo', 'requestId': 'r', 'outputs': []}))
            s = candidates.summarize_candidates(root, endpoints=('tripo',))
            c = s['candidates'][0]
            self.assertEqual(c['triangleCount'], 1)
            self.assertEqual(c['vertexCount'], 3)
            self.assertNotIn('nonTriangleModes', c)
            local_size = c['bounds']['size']
            world_size = c['worldBounds']['size']
            for local, world in zip(local_size, world_size):
                self.assertAlmostEqual(world, local * 2.0, places=5)
            self.assertAlmostEqual(c['nodeScale'], 2.0, places=5)
            self.assertEqual(c['worldBounds']['space'], 'world-untransformed-by-viewer')
            self.assertEqual(len(c['embeddedTextures']), 1)
            tex = c['embeddedTextures'][0]
            self.assertEqual(tex['width'], 1)
            self.assertEqual(tex['height'], 1)
            self.assertEqual(tex['mimeType'], 'image/png')
            self.assertEqual(tex['usedBy'], ['materials[0].baseColorTexture'])
            self.assertEqual(c['separateTextureFiles'], 0)
            self.assertEqual(c['textureCount'], 1)
            self.assertIsInstance(c['warnings'], list)

    def test_jpeg_sof_parser_reads_dimensions_from_minimal_header(self):
        # SOI, a stub APP0 segment (payload length 2, i.e. no payload beyond the length field
        # itself), then SOF0 with precision 8, height 4, width 6, 0 components.
        app0 = b"\xff\xe0" + struct.pack(">H", 2)
        sof0 = b"\xff\xc0" + struct.pack(">H", 8) + bytes([8]) + struct.pack(">HH", 4, 6) + bytes([0])
        data = b"\xff\xd8" + app0 + sof0
        self.assertEqual(candidates._jpeg_dimensions(data), (6, 4))


if __name__ == '__main__':
    unittest.main()
