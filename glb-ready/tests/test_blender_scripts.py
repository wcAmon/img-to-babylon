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


if __name__ == '__main__':
    unittest.main()
