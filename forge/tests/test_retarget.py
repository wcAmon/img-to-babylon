import json
import math
import os
import subprocess
import sys
import tempfile
import unittest

from forge import retarget
from forge.tests.make_fixture_glb import build_fixture_glb, write_fixture


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SPEC = os.path.join(ROOT, "viewer", "models", "action-figure", "spec.json")


class GlbParsingTest(unittest.TestCase):
    def test_rejects_non_glb_magic(self):
        with self.assertRaisesRegex(ValueError, "magic"):
            retarget.parse_glb(b"not a glb")

    def test_rejects_unsupported_glb_version(self):
        data = bytearray(build_fixture_glb())
        data[4:8] = (1).to_bytes(4, "little")
        with self.assertRaisesRegex(ValueError, "version"):
            retarget.parse_glb(bytes(data))

    def test_reads_fixture_nodes_and_rotation_channels(self):
        glb = retarget.parse_glb(build_fixture_glb())
        self.assertEqual([node["name"] for node in glb.nodes],
                         ["root", "L_Shoulder", "L_Elbow", "head"])
        self.assertEqual(glb.nodes[0]["children"], [1, 2, 3])
        self.assertEqual(glb.rotations["L_Shoulder"].times, [0.0, 0.5, 1.0])
        self.assertAlmostEqual(glb.rotations["L_Elbow"].values[-1][0],
                               math.sin(1.0), places=6)

    def test_rejects_truncated_chunk(self):
        with self.assertRaisesRegex(ValueError, "length|chunk"):
            retarget.parse_glb(build_fixture_glb()[:-5])


class RotationMathTest(unittest.TestCase):
    def test_xzy_known_angle_round_trip(self):
        angles = (0.35, -0.42, 0.27)
        quat = retarget.quat_from_euler_xzy(*angles)
        got = retarget.euler_xzy_from_quat(quat)
        for actual, expected in zip(got, angles):
            self.assertAlmostEqual(actual, expected, places=6)

    def test_relative_rotation_removes_rest_pose(self):
        rest = retarget.quat_from_euler_xzy(0.4, 0.0, 0.0)
        frame = retarget.quat_from_euler_xzy(0.7, 0.0, 0.0)
        relative = retarget.relative_quat(rest, frame)
        self.assertAlmostEqual(retarget.euler_xzy_from_quat(relative)[0], 0.3, places=6)

    def test_linear_quaternion_interpolation_normalizes(self):
        value = retarget.sample_quaternions(
            [0.0, 1.0], [(0.0, 0.0, 0.0, 1.0), (1.0, 0.0, 0.0, 0.0)], 0.5)
        self.assertAlmostEqual(sum(component * component for component in value), 1.0)
        self.assertAlmostEqual(value[0], math.sqrt(0.5), places=6)


class MappingAndProjectionTest(unittest.TestCase):
    def test_joint_map_contains_common_smpl_soma_aliases(self):
        for name in ("head", "neck", "L_Shoulder", "left_shoulder", "L_Elbow",
                     "L_Hip", "L_Knee", "R_Shoulder", "right_shoulder", "R_Elbow",
                     "R_Hip", "R_Knee"):
            self.assertIn(name, retarget.JOINT_MAP)

    def test_servo_tracks_are_exactly_the_19_spec_axes(self):
        with open(SPEC) as handle:
            spec = json.load(handle)
        tracks, limits = retarget.servo_tracks_from_spec(spec)
        self.assertEqual(len(tracks), 19)
        self.assertEqual(set(tracks), set(limits))
        self.assertIn("servo:forearm-l.x", tracks)
        self.assertNotIn("servo:forearm-l.y", tracks)

    def test_projection_clamps_to_spec_limits(self):
        with open(SPEC) as handle:
            spec = json.load(handle)
        timeline = retarget.retarget_glb(retarget.parse_glb(build_fixture_glb()), spec, 2)
        self.assertEqual(timeline["frames"], 3)
        self.assertAlmostEqual(timeline["tracks"]["servo:upper-arm-l.x"][-1], 1.6)

    def test_unmapped_servo_axes_are_zero_tracks(self):
        with open(SPEC) as handle:
            spec = json.load(handle)
        timeline = retarget.retarget_glb(retarget.parse_glb(build_fixture_glb()), spec, 2)
        self.assertEqual(timeline["tracks"]["servo:thigh-r.z"], [0.0, 0.0, 0.0])

    def test_resampling_uses_requested_fps_and_equal_track_lengths(self):
        with open(SPEC) as handle:
            spec = json.load(handle)
        timeline = retarget.retarget_glb(retarget.parse_glb(build_fixture_glb()), spec, 4)
        self.assertEqual((timeline["model"], timeline["fps"], timeline["frames"]),
                         ("action-figure", 4, 5))
        self.assertTrue(all(len(values) == 5 for values in timeline["tracks"].values()))


class CliTest(unittest.TestCase):
    def test_cli_writes_contract_json(self):
        with tempfile.TemporaryDirectory() as temp:
            glb_path = os.path.join(temp, "fixture.glb")
            out_path = os.path.join(temp, "timeline.json")
            write_fixture(glb_path)
            result = subprocess.run(
                [sys.executable, os.path.join(ROOT, "forge", "retarget.py"), glb_path,
                 "--spec", SPEC, "--out", out_path, "--fps", "4"],
                capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            with open(out_path) as handle:
                timeline = json.load(handle)
            self.assertEqual(len(timeline["tracks"]), 19)

    def test_cli_returns_one_for_invalid_input(self):
        with tempfile.TemporaryDirectory() as temp:
            bad_path = os.path.join(temp, "bad.glb")
            out_path = os.path.join(temp, "timeline.json")
            with open(bad_path, "wb") as handle:
                handle.write(b"bad")
            result = subprocess.run(
                [sys.executable, os.path.join(ROOT, "forge", "retarget.py"), bad_path,
                 "--spec", SPEC, "--out", out_path], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertFalse(os.path.exists(out_path))


if __name__ == "__main__":
    unittest.main()
