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


if __name__ == '__main__':
    unittest.main()
