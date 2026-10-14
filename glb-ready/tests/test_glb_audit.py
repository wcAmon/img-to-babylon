from __future__ import annotations
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'scripts'))
sys.path.insert(0, str(HERE))
import glb_audit  # noqa: E402
import synth  # noqa: E402


class GlbCase(unittest.TestCase):
    """Helpers only; no tests here, so subclasses do not inherit and re-run each other's tests."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def glb(self, name, doc, chunks):
        return synth.write(self.dir / name, synth.build_glb(doc, chunks))


class ReaderTest(GlbCase):
    def test_single_cube_has_12_triangles(self):
        path = self.glb('cube.glb', *synth.cube_doc())
        doc, binary = glb_audit.read_glb(path)
        self.assertEqual(glb_audit.scene_triangles(doc), 12)
        positions = glb_audit.accessor_values(doc, binary, 0)
        self.assertEqual(len(positions), 8)
        self.assertEqual(positions[0], (-0.5, 0.0, -0.5))

    def test_two_instances_of_one_mesh_count_twice(self):
        doc, chunks = synth.cube_doc(extra_nodes=[{'mesh': 0, 'translation': [2, 0, 0], 'name': 'cube-2'}])
        path = self.glb('two.glb', doc, chunks)
        doc, _ = glb_audit.read_glb(path)
        self.assertEqual(glb_audit.scene_triangles(doc), 24)
        matrices = glb_audit.node_world_matrices(doc)
        self.assertAlmostEqual(matrices[1][12], 2.0)  # column-major translation x

    def test_non_indexed_primitive_counts_positions(self):
        path = self.glb('plain.glb', *synth.cube_doc(indexed=False))
        doc, _ = glb_audit.read_glb(path)
        self.assertEqual(glb_audit.scene_triangles(doc), 12)

    def test_malformed_container_raises(self):
        bad = self.dir / 'bad.glb'; bad.write_bytes(b'not a glb at all')
        with self.assertRaises(glb_audit.GlbError):
            glb_audit.read_glb(bad)


class InspectTest(GlbCase):
    def test_png_and_jpeg_headers(self):
        self.assertEqual(glb_audit.image_dimensions(synth.png_header(3000, 10)), ('image/png', 3000, 10))
        self.assertEqual(glb_audit.image_dimensions(synth.jpeg_header(640, 480)), ('image/jpeg', 640, 480))
        self.assertIsNone(glb_audit.image_dimensions(b'\0' * 40))

    def test_embedded_texture_is_listed(self):
        doc, chunks = synth.cube_doc(texcoords=True, material=0,
                                     images=[{'bufferView': 99, 'mimeType': 'image/png'}],
                                     textures=[{'source': 0}])
        doc['materials'] = [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}]
        chunks.append(synth.png_header(512, 256))
        doc['images'][0]['bufferView'] = len(chunks) - 1
        path = self.glb('tex.glb', doc, chunks)
        info = glb_audit.inspect(*glb_audit.read_glb(path), path)
        self.assertEqual(info['textures'], [{'image': 0, 'mime': 'image/png', 'width': 512, 'height': 256, 'embedded': True}])
        self.assertTrue(info['imagesEmbedded'])
        self.assertTrue(info['hasTexcoord0'])

    def test_jpeg_with_long_app_segment_is_measured(self):
        # Real JPEGs carry JFIF/EXIF/ICC segments before SOF0; the size must still be read.
        app1 = b'\xff\xe1' + __import__('struct').pack('>H', 2 + 300) + b'\0' * 300
        data = synth.jpeg_header(512, 512)
        data = data[:2] + app1 + data[2:]
        doc, chunks = synth.cube_doc(texcoords=True, material=0, images=[{'bufferView': 0, 'mimeType': 'image/jpeg'}], textures=[{'source': 0}])
        doc['materials'] = [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}]
        chunks.append(data); doc['images'][0]['bufferView'] = len(chunks) - 1
        info = glb_audit.inspect(*glb_audit.read_glb(self.glb('jpg.glb', doc, chunks)), self.dir / 'jpg.glb')
        self.assertEqual((info['textures'][0]['width'], info['textures'][0]['height']), (512, 512))

    def test_external_uri_image_is_not_embedded(self):
        doc, chunks = synth.cube_doc(texcoords=True, material=0, images=[{'uri': 'skin.png'}], textures=[{'source': 0}])
        doc['materials'] = [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}]
        info = glb_audit.inspect(*glb_audit.read_glb(self.glb('ext.glb', doc, chunks)), self.dir / 'ext.glb')
        self.assertFalse(info['imagesEmbedded'])
        self.assertEqual(info['textures'][0]['embedded'], False)

    def test_texture_without_core_source_is_reported(self):
        doc, chunks = synth.cube_doc(texcoords=True, material=0, images=[], textures=[{'extensions': {'KHR_texture_basisu': {'source': 0}}}],
                                     extensions_used=['KHR_texture_basisu'])
        doc['materials'] = [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}]
        info = glb_audit.inspect(*glb_audit.read_glb(self.glb('ktx.glb', doc, chunks)), self.dir / 'ktx.glb')
        self.assertEqual(info['textures'][0]['embedded'], False)
        self.assertIn('no core image source', info['textures'][0]['note'])

    def test_skin_and_animation_are_summarised(self):
        doc, chunks = synth.cube_doc(extra_nodes=[{'name': 'root-joint'}, {'name': 'tip-joint'}])
        doc['nodes'][1]['children'] = [2]
        doc['scenes'][0]['nodes'] = [0, 1]
        chunks.append(synth.pack_f32([(0.0,), (1.0,)]))
        doc['accessors'].append({'bufferView': len(chunks) - 1, 'componentType': 5126, 'count': 2, 'type': 'SCALAR', 'min': [0.0], 'max': [1.0]})
        t_in = len(doc['accessors']) - 1
        chunks.append(synth.pack_f32([(0, 0, 0, 1), (0, 0.7071068, 0, 0.7071068)]))
        doc['accessors'].append({'bufferView': len(chunks) - 1, 'componentType': 5126, 'count': 2, 'type': 'VEC4'})
        t_out = len(doc['accessors']) - 1
        doc['skins'] = [{'joints': [1, 2]}]
        doc['animations'] = [{'name': 'Kimodo slow walk', 'channels': [{'sampler': 0, 'target': {'node': 2, 'path': 'rotation'}}],
                              'samplers': [{'input': t_in, 'output': t_out}]}]
        info = glb_audit.inspect(*glb_audit.read_glb(self.glb('anim.glb', doc, chunks)), self.dir / 'anim.glb')
        self.assertEqual(info['skins'], [{'joints': 2, 'hasInverseBindMatrices': False}])
        self.assertEqual(info['animations'], [{'name': 'Kimodo slow walk', 'channels': 1, 'duration': 1.0}])
        self.assertEqual(info['extensionsRequired'], [])


class AuditTest(GlbCase):
    def audit(self, name, doc, chunks, profile='nomen-land'):
        path = self.glb(name, doc, chunks)
        return glb_audit.audit(path, glb_audit.load_profile(profile))

    def test_grounded_cube_is_ok(self):
        result = self.audit('ok.glb', *synth.cube_doc())
        self.assertEqual(result['problems'], [])
        self.assertEqual(result['verdict'], 'ok')
        self.assertAlmostEqual(result['geometry']['minY'], 0.0)

    def test_floating_cube_is_fix(self):
        result = self.audit('float.glb', *synth.cube_doc(y_offset=0.3))
        self.assertEqual(result['verdict'], 'fix')
        self.assertTrue(any('not grounded' in p for p in result['problems']))

    def test_over_budget_is_reduce(self):
        doc, chunks = synth.cube_doc(extra_nodes=[{'mesh': 0, 'translation': [i * 1.5, 0, 0]} for i in range(1, 1667)])
        result = self.audit('many.glb', doc, chunks)
        self.assertEqual(result['triangles'], 12 * 1667)
        self.assertEqual(result['verdict'], 'reduce')

    def test_external_image_and_huge_texture_are_fix(self):
        doc, chunks = synth.cube_doc(texcoords=True, material=0, images=[{'bufferView': 0, 'mimeType': 'image/png'}], textures=[{'source': 0}])
        doc['materials'] = [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}]
        chunks.append(synth.png_header(3000, 3000)); doc['images'][0]['bufferView'] = len(chunks) - 1
        result = self.audit('big.glb', doc, chunks)
        self.assertTrue(any('3000' in p for p in result['problems']))
        doc, chunks = synth.cube_doc(texcoords=True, material=0, images=[{'uri': 'x.png'}], textures=[{'source': 0}])
        doc['materials'] = [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}]
        self.assertEqual(self.audit('uri.glb', doc, chunks)['verdict'], 'fix')

    def test_untextured_primitive_without_uv_next_to_textured_one_is_ok(self):
        # gltf-transform prune and many exporters drop TEXCOORD_0 from flat-colour parts; only textured parts need UVs.
        doc, chunks = synth.cube_doc(texcoords=True, material=0, images=[{'bufferView': 0, 'mimeType': 'image/png'}], textures=[{'source': 0}])
        doc['materials'] = [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}, {'pbrMetallicRoughness': {'baseColorFactor': [1, 0, 0, 1]}}]
        chunks.append(synth.png_header(64, 64)); doc['images'][0]['bufferView'] = len(chunks) - 1
        flat = {'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': doc['meshes'][0]['primitives'][0]['indices'], 'mode': 4, 'material': 1}
        doc['meshes'][0]['primitives'].append(flat)
        result = self.audit('mixed.glb', doc, chunks)
        self.assertEqual(result['problems'], [], result['problems'])
        self.assertEqual(result['verdict'], 'ok')

    def test_texture_without_core_source_is_fix(self):
        doc, chunks = synth.cube_doc(texcoords=True, material=0, images=[], textures=[{'extensions': {'KHR_texture_basisu': {'source': 0}}}], extensions_used=['KHR_texture_basisu'])
        doc['materials'] = [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}]
        result = self.audit('basisu.glb', doc, chunks)
        self.assertEqual(result['verdict'], 'fix')
        self.assertTrue(any('KHR_texture_basisu' in p for p in result['problems']))

    def test_draco_required_is_fix(self):
        result = self.audit('draco.glb', *synth.cube_doc(extensions_required=['KHR_draco_mesh_compression'], extensions_used=['KHR_draco_mesh_compression']))
        self.assertEqual(result['verdict'], 'fix')

    def test_nan_normal_and_missing_normal_are_fix(self):
        doc, chunks = synth.cube_doc()
        chunks[1] = synth.pack_f32([(float('nan'), 1.0, 0.0)] + [(0.0, 1.0, 0.0)] * 7)
        result = self.audit('nan.glb', doc, chunks)
        self.assertGreaterEqual(result['geometry']['nanCount'], 1)
        self.assertEqual(result['verdict'], 'fix')
        self.assertEqual(self.audit('nonormal.glb', *synth.cube_doc(normals=False))['verdict'], 'fix')

    def test_skin_over_joint_budget_is_fix(self):
        doc, chunks = synth.cube_doc(extra_nodes=[{'name': 'j%d' % i} for i in range(70)])
        doc['skins'] = [{'joints': list(range(1, 71))}]
        result = self.audit('joints.glb', doc, chunks)
        self.assertTrue(any('joints' in p for p in result['problems']))

    def test_cli_json_and_exit_codes(self):
        ok = self.glb('cli-ok.glb', *synth.cube_doc())
        bad = self.glb('cli-bad.glb', *synth.cube_doc(y_offset=0.5))
        script = str(HERE.parent / 'scripts' / 'glb_audit.py')
        run = subprocess.run([sys.executable, script, str(ok), '--json'], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        payload = json.loads(run.stdout)
        for key in ('triangles', 'textures', 'bounds', 'problems', 'warnings', 'verdict', 'profile', 'animations', 'skins'):
            self.assertIn(key, payload)
        self.assertEqual(subprocess.run([sys.executable, script, str(bad)], capture_output=True).returncode, 1)
        missing = subprocess.run([sys.executable, script, str(self.dir / 'nope.glb')], capture_output=True, text=True)
        self.assertEqual(missing.returncode, 2)
        self.assertIn('nope.glb', missing.stderr)


if __name__ == '__main__':
    unittest.main()
