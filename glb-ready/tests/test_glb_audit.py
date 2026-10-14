from __future__ import annotations
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


if __name__ == '__main__':
    unittest.main()
