from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'scripts'))
sys.path.insert(0, str(HERE))
import blender_env  # noqa: E402
import glb_audit  # noqa: E402

SCRIPTS = HERE.parent / 'scripts'
FIXTURE_NAMES = ['sphere_lo', 'sphere_hi', 'sphere_flipped', 'sphere_vcolor', 'cube_tex1024', 'cube_two_materials']


class BlenderCase(unittest.TestCase):
    """One Blender run builds every fixture; each test gets a fresh temp dir for outputs."""
    fixtures = None
    fixture_tmp = None

    @classmethod
    def setUpClass(cls):
        if not blender_env.find_blender():
            raise unittest.SkipTest('Blender not found (set BLENDER=/path/to/blender)')
        cls.fixture_tmp = tempfile.TemporaryDirectory()
        cls.fixtures = Path(cls.fixture_tmp.name)
        run = blender_env.run_script(HERE / 'make_fixtures.py', [cls.fixtures] + FIXTURE_NAMES)
        if run.returncode != 0:
            raise RuntimeError('fixture generation failed:\n' + run.stdout[-2000:] + run.stderr[-2000:])

    @classmethod
    def tearDownClass(cls):
        if cls.fixture_tmp:
            cls.fixture_tmp.cleanup()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.out = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def fx(self, name):
        return self.fixtures / (name + '.glb')

    def run_tool(self, script, *args, expect=0, timeout=600):
        run = blender_env.run_script(SCRIPTS / script, list(args), timeout=timeout)
        self.assertEqual(run.returncode, expect, 'stdout:\n%s\nstderr:\n%s' % (run.stdout[-3000:], run.stderr[-3000:]))
        return run

    def tris(self, path):
        return glb_audit.scene_triangles(glb_audit.read_glb(path)[0])

    def report(self, out):
        return json.loads(Path(str(out) + '.report.json').read_text())


class HarnessTest(BlenderCase):
    def test_fixtures_have_expected_sizes(self):
        self.assertTrue(1400 <= self.tris(self.fx('sphere_lo')) <= 1600, self.tris(self.fx('sphere_lo')))
        self.assertTrue(13000 <= self.tris(self.fx('sphere_hi')) <= 15000, self.tris(self.fx('sphere_hi')))
        info = glb_audit.inspect(*glb_audit.read_glb(self.fx('cube_tex1024')), self.fx('cube_tex1024'))
        self.assertEqual((info['textures'][0]['width'], info['textures'][0]['height']), (1024, 1024))

    def test_common_module_guard_and_report(self):
        # Exercise blender_common through a tiny inline script: guard passes in background, report is written.
        probe = self.out / 'probe.py'
        probe.write_text(
            'import sys; sys.path.insert(0, %r)\n' % str(SCRIPTS) +
            'import blender_common as bc\nfrom pathlib import Path\n'
            'bc.guard_background(); args = bc.parse_args()\n'
            'src, dst = Path(args[0]), Path(args[1]); bc.require_new_output(dst, "--force" in args)\n'
            'bc.reset_scene(); objs = bc.import_glb(src); bc.export_glb(dst, objs)\n'
            'bc.write_report(dst, "probe", args, src, {"k": 1}, ["w"])\n')
        dst = self.out / 'copy.glb'
        run = blender_env.run_script(probe, [self.fx('sphere_lo'), dst])
        self.assertEqual(run.returncode, 0, run.stdout[-2000:] + run.stderr[-2000:])
        rep = self.report(dst)
        self.assertEqual(rep['script'], 'probe'); self.assertEqual(rep['params'], {'k': 1}); self.assertEqual(rep['warnings'], ['w'])
        self.assertEqual(rep['input']['triangles'], self.tris(self.fx('sphere_lo')))
        self.assertEqual(rep['output']['triangles'], self.tris(dst))
        self.assertEqual(len(rep['output']['sha256']), 64)
        again = blender_env.run_script(probe, [self.fx('sphere_lo'), dst])
        self.assertEqual(again.returncode, 2)
        self.assertIn('--force', again.stderr)


class ReduceTest(BlenderCase):
    def test_keep_uv_reaches_target_and_keeps_uv(self):
        out = self.out / 'lo.glb'
        self.run_tool('reduce_mesh.py', self.fx('sphere_hi'), out, '--target', '1000')
        n = self.tris(out)
        self.assertTrue(900 <= n <= 1000, n)
        doc, _ = glb_audit.read_glb(out)
        self.assertIn('TEXCOORD_0', doc['meshes'][0]['primitives'][0]['attributes'])
        self.assertEqual(len(doc.get('materials', [])), 1)
        rep = self.report(out)
        self.assertEqual(rep['params']['mode'], 'keep-uv'); self.assertFalse(rep['params']['requiresNewUV'])
        self.assertEqual(rep['output']['triangles'], n)
        self.assertTrue(any('30%' in w for w in rep['warnings']))  # 14k -> 1k keeps ~7%
        self.run_tool('reduce_mesh.py', self.fx('sphere_hi'), out, '--target', '1000', expect=2)

    def test_keep_uv_preserves_two_materials(self):
        out = self.out / 'two.glb'
        self.run_tool('reduce_mesh.py', self.fx('cube_two_materials'), out, '--target', '800')
        doc, _ = glb_audit.read_glb(out)
        self.assertEqual(len(doc['materials']), 2)
        self.assertEqual(len(doc['meshes'][0]['primitives']), 2)
        self.assertLessEqual(self.tris(out), 800)

    def test_rebuild_surface_drops_uv_and_flags_report(self):
        out = self.out / 'gray.glb'
        self.run_tool('reduce_mesh.py', self.fx('sphere_hi'), out, '--target', '2000', '--rebuild-surface')
        doc, _ = glb_audit.read_glb(out)
        self.assertNotIn('TEXCOORD_0', doc['meshes'][0]['primitives'][0]['attributes'])
        self.assertTrue(self.report(out)['params']['requiresNewUV'])
        self.assertLessEqual(self.tris(out), 2000)

    def test_already_within_target_passes_through(self):
        out = self.out / 'same.glb'
        self.run_tool('reduce_mesh.py', self.fx('sphere_lo'), out, '--target', '5000')
        self.assertEqual(self.tris(out), self.tris(self.fx('sphere_lo')))
        self.assertTrue(any('already' in w for w in self.report(out)['warnings']))

    def test_protect_box_on_edge_only_is_usage_error(self):
        out = self.out / 'p.glb'
        # sphere spans y 0..1 (glTF); a flat box at y=1.5 touches nothing
        run = self.run_tool('reduce_mesh.py', self.fx('sphere_hi'), out, '--target', '3000', '--protect', '-1,1.5,-1,1,1.5,1', expect=2)
        self.assertIn('protect', run.stderr.lower())

    def test_protect_box_keeps_cap_within_error(self):
        out = self.out / 'cap.glb'
        self.run_tool('reduce_mesh.py', self.fx('sphere_hi'), out, '--target', '3000', '--protect', '-1,0.9,-1,1,1.1,1', '--max-protected-error', '0.002')
        rep = self.report(out)
        self.assertLessEqual(rep['params']['protectedError']['maxDistance'], 0.002)
        self.assertLessEqual(self.tris(out), 3000)

    def test_rigged_input_is_rejected(self):
        rigged = self.fixtures / 'rig_base.glb'
        if not rigged.exists():
            self.skipTest('rig fixture arrives with Task 15')
        run = self.run_tool('reduce_mesh.py', rigged, self.out / 'r.glb', '--target', '100', expect=2)
        self.assertIn('rigged', run.stderr)


class RepairTest(BlenderCase):
    def test_mode_is_required(self):
        run = self.run_tool('repair_shell.py', self.fx('sphere_flipped'), self.out / 'x.glb', expect=2)
        self.assertIn('--orientation-only', run.stderr)

    def test_shell_repair_fixes_flipped_sphere(self):
        out = self.out / 'fixed.glb'
        self.run_tool('repair_shell.py', self.fx('sphere_flipped'), out, '--shell-repair', '--voxel-k', '0.01')
        rep = self.report(out)
        self.assertTrue(rep['params']['signedVolumeFlipped'])
        self.assertEqual(rep['params']['nonManifoldEdgesOut'], 0)
        self.assertEqual(rep['params']['boundaryEdgesOut'], 0)
        self.assertAlmostEqual(rep['params']['heightOut'], rep['params']['heightIn'], delta=0.05)
        result = glb_audit.audit(out, glb_audit.load_profile('nomen-land'))
        self.assertTrue(result['hasNormals'])

    def test_orientation_only_keeps_vertex_colors(self):
        out = self.out / 'vc.glb'
        self.run_tool('repair_shell.py', self.fx('sphere_vcolor'), out, '--orientation-only')
        doc, _ = glb_audit.read_glb(out)
        self.assertIn('COLOR_0', doc['meshes'][0]['primitives'][0]['attributes'])
        self.assertTrue(self.report(out)['params']['vertexColorsResampled'])
        self.assertTrue(any('geometry changed' in w for w in self.report(out)['warnings']))


if __name__ == '__main__':
    unittest.main()
