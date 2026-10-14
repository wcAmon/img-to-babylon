from __future__ import annotations
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'scripts'))
sys.path.insert(0, str(HERE))
import synth  # noqa: E402
import validate_retarget as vr  # noqa: E402

SCRIPT = HERE.parent / 'scripts' / 'validate_retarget.py'


class ValidateRetargetTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def glb(self, name, doc, chunks):
        return synth.write(self.dir / name, synth.build_glb(doc, chunks))

    def test_identical_rig_is_ok(self):
        base = self.glb('base.glb', *synth.rig_doc()); clip = self.glb('clip.glb', *synth.rig_doc())
        result = vr.validate(base, [clip], source_path=clip, max_deg=0.1)
        self.assertEqual(result['problems'], []); self.assertTrue(result['ok'])
        self.assertEqual(result['clips'][0]['animations'][0]['name'], 'walk')
        self.assertAlmostEqual(result['clips'][0]['fkMaxDegrees']['walk'], 0.0, places=6)

    def test_renamed_joint_fails(self):
        base = self.glb('base.glb', *synth.rig_doc())
        clip = self.glb('clip.glb', *synth.rig_doc(joint_names=('mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Neck')))
        result = vr.validate(base, [clip], None, 0.1)
        self.assertTrue(any('joint names' in p for p in result['problems']))

    def test_weights_not_normalised_fails(self):
        base = self.glb('base.glb', *synth.rig_doc(weights=(0.9, 0, 0, 0)))
        result = vr.validate(base, [self.glb('clip.glb', *synth.rig_doc(weights=(0.9, 0, 0, 0)))], None, 0.1)
        self.assertTrue(any('weights' in p for p in result['problems']))

    def test_changed_mesh_fails(self):
        base = self.glb('base.glb', *synth.rig_doc())
        doc, chunks = synth.rig_doc(); chunks[0] = synth.pack_f32([(x * 1.01, y, z) for x, y, z in synth.CUBE_POSITIONS])
        result = vr.validate(base, [self.glb('clip.glb', doc, chunks)], None, 0.1)
        self.assertTrue(any('POSITION' in p for p in result['problems']))

    def test_fk_mismatch_fails_and_threshold_passes(self):
        base = self.glb('base.glb', *synth.rig_doc())
        clip = self.glb('clip.glb', *synth.rig_doc())
        source = self.glb('source.glb', *synth.rig_doc(spine_rotations=((0, 0, 0, 1), (0, 0, 0, 1), (0, 0, 0.5, 0.8660254))))
        result = vr.validate(base, [clip], source, 0.1)
        self.assertTrue(any('FK' in p for p in result['problems']))
        self.assertGreater(result['clips'][0]['fkMaxDegrees']['walk'], 20.0)
        self.assertTrue(vr.validate(base, [clip], source, 180.0)['ok'])

    def test_cli_exit_codes(self):
        base = self.glb('base.glb', *synth.rig_doc()); clip = self.glb('clip.glb', *synth.rig_doc())
        self.assertEqual(subprocess.run([sys.executable, str(SCRIPT), str(base), str(clip)], capture_output=True).returncode, 0)
        bad = self.glb('bad.glb', *synth.rig_doc(joint_names=('mixamorig:Hips', 'mixamorig:Spine', 'x:Neck')))
        self.assertEqual(subprocess.run([sys.executable, str(SCRIPT), str(base), str(bad)], capture_output=True).returncode, 1)
        self.assertEqual(subprocess.run([sys.executable, str(SCRIPT), str(base), str(self.dir / 'missing.glb')], capture_output=True).returncode, 2)


if __name__ == '__main__':
    unittest.main()
