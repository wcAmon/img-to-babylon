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

    def test_servo_tracks_are_exactly_the_23_spec_axes(self):
        with open(SPEC) as handle:
            spec = json.load(handle)
        tracks, limits = retarget.servo_tracks_from_spec(spec)
        # M8 0014：踝關節 2 軸 ×2 → 19 + 4 = 23
        self.assertEqual(len(tracks), 23)
        self.assertIn("servo:boot-l.x", tracks)
        self.assertIn("servo:boot-l.z", tracks)
        self.assertNotIn("servo:boot-l.y", tracks)
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
            self.assertEqual(len(timeline["tracks"]), 23)

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


class KimodoAliasTest(unittest.TestCase):
    """kimodo.cpp soma30 命名（Mixamo 式）：Arm=肩、ForeArm=肘、Leg=髖、Shin=膝；
    Shoulder=鎖骨不得映射（會與 Arm 重複寫同軌）。"""

    def test_kimodo_names_mapped(self):
        expected = {
            "LeftArm": "upper-arm-l", "RightArm": "upper-arm-r",
            "LeftForeArm": "forearm-l", "RightForeArm": "forearm-r",
            "LeftLeg": "thigh-l", "RightLeg": "thigh-r",
            "LeftShin": "calf-l", "RightShin": "calf-r",
        }
        for name, body in expected.items():
            self.assertIn(name, retarget.JOINT_MAP, name)
            self.assertEqual(retarget.JOINT_MAP[name]["body"], body, name)

    def test_clavicle_not_mapped(self):
        self.assertNotIn("LeftShoulder", retarget.JOINT_MAP)
        self.assertNotIn("RightShoulder", retarget.JOINT_MAP)


class RebaseTest(unittest.TestCase):
    """--rebase first-frame：各軌減去首幀值（相對起始站姿），且發生在夾限之前——
    kimodo T-pose rest 與公仔 rest 的恆定偏移會把軌釘死在限位、拖累同關節其他軸追蹤。"""

    def test_rebase_helper_subtracts_first_frame(self):
        self.assertEqual(
            retarget.rebase_first_frame({"a": [0.5, 0.9, 0.5], "b": [0.0, 0.1, 0.0]}),
            {"a": [0.0, 0.4, 0.0], "b": [0.0, 0.1, 0.0]},
        )

    def test_rebase_happens_before_clamp(self):
        with open(SPEC) as handle:
            spec = json.load(handle)
        timeline = retarget.retarget_glb(
            retarget.parse_glb(build_fixture_glb()), spec, 2, rebase="first-frame")
        track = timeline["tracks"]["servo:upper-arm-l.x"]
        self.assertAlmostEqual(track[0], 0.0)
        for value in track:
            self.assertLessEqual(abs(value), 1.6 + 1e-9)

    def test_cli_accepts_rebase_flag(self):
        import subprocess, tempfile, os, sys
        with tempfile.TemporaryDirectory() as tmp:
            glb = os.path.join(tmp, "f.glb")
            out = os.path.join(tmp, "t.json")
            with open(glb, "wb") as handle:
                handle.write(build_fixture_glb())
            result = subprocess.run(
                [sys.executable, "forge/retarget.py", glb, "--spec", str(SPEC),
                 "--out", out, "--rebase", "first-frame"], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            with open(out) as handle:
                data = json.load(handle)
            self.assertEqual(len(data["tracks"]), 23)
