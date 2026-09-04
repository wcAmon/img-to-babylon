import copy, json, os, unittest
from forge import validate_spec

HERE = os.path.dirname(__file__)
SAMPLE = os.path.join(HERE, "..", "..", "viewer", "models", "sample-crate", "spec.json")
ACTION_FIGURE = os.path.join(
    HERE, "..", "..", "viewer", "models", "action-figure", "spec.json")


def minimal_spec():
    with open(SAMPLE) as f:
        return json.load(f)


class ValidateSpecTest(unittest.TestCase):
    def test_sample_crate_passes(self):
        errors, _ = validate_spec.validate(minimal_spec(), strict=True)
        self.assertEqual(errors, [])

    def _with_rupture(self, rupture):
        spec = minimal_spec()
        spec["physics"]["bodies"][0]["rupture"] = rupture
        return spec

    def test_rupture_valid_passes(self):
        spec = self._with_rupture(
            {"impulseThreshold": 2.0, "emptiedMass": 0.04, "puddleRadius": 0.3, "droplets": 12})
        errors, _ = validate_spec.validate(spec, strict=True)
        self.assertEqual(errors, [])

    def test_rupture_threshold_must_be_positive(self):
        spec = self._with_rupture(
            {"impulseThreshold": 0, "emptiedMass": 0.04, "puddleRadius": 0.3, "droplets": 12})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("rupture" in e and "impulseThreshold" in e for e in errors))

    def test_rupture_emptied_mass_below_mass(self):
        spec = self._with_rupture(
            {"impulseThreshold": 2.0, "emptiedMass": 5.0, "puddleRadius": 0.3, "droplets": 12})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("rupture" in e and "emptiedMass" in e for e in errors))

    def test_rupture_droplets_non_negative_int(self):
        spec = self._with_rupture(
            {"impulseThreshold": 2.0, "emptiedMass": 0.04, "puddleRadius": 0.3, "droplets": -1})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("rupture" in e and "droplets" in e for e in errors))
        spec = self._with_rupture(
            {"impulseThreshold": 2.0, "emptiedMass": 0.04, "puddleRadius": 0.3, "droplets": 2.5})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("rupture" in e and "droplets" in e for e in errors))

    def test_rupture_missing_field(self):
        spec = self._with_rupture({"impulseThreshold": 2.0, "emptiedMass": 0.04})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("rupture" in e and "puddleRadius" in e for e in errors))

    def test_action_figure_leg_chain_mass_contract(self):
        with open(ACTION_FIGURE) as handle:
            spec = json.load(handle)
        masses = {body["id"]: body["mass"] for body in spec["physics"]["bodies"]}
        for side in ("l", "r"):
            self.assertEqual(masses[f"thigh-{side}"], 0.005)
            self.assertEqual(masses[f"calf-{side}"], 0.008)
            self.assertEqual(masses[f"boot-{side}"], 0.005)
        self.assertAlmostEqual(sum(masses.values()), 0.106)

    def test_missing_top_level_key(self):
        spec = minimal_spec()
        del spec["physics"]
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("physics" in e for e in errors))

    def test_macro_without_collider_fails(self):
        spec = minimal_spec()
        del spec["componentTree"][0]["collider"]
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("collider" in e for e in errors))

    def test_component_not_assigned_to_body(self):
        spec = minimal_spec()
        spec["physics"]["bodies"][0]["components"] = []
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("未指派" in e for e in errors))

    def test_component_in_two_bodies(self):
        spec = minimal_spec()
        spec["physics"]["bodies"].append(
            {"id": "dup", "components": ["crate"], "mass": 1.0})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("同時屬於" in e for e in errors))

    def test_hinge_constraint_requires_axis_limits(self):
        spec = minimal_spec()
        spec["physics"]["bodies"].append({"id": "cap", "components": [], "mass": 0.01})
        spec["physics"]["constraints"] = [
            {"type": "hinge", "bodyA": "crate", "bodyB": "cap"}]
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("axis" in e for e in errors))

    def test_hinge_attachment_pivot_mismatch(self):
        spec = minimal_spec()
        cap = copy.deepcopy(spec["componentTree"][0])
        cap.update({"id": "cap", "parent": "crate",
                    "attachment": {"type": "hinge",
                                   "hinge": {"pivot": [0, 0, 0], "axis": [1, 0, 0],
                                             "limits": [0, 1.9]}}})
        spec["componentTree"].append(cap)
        spec["physics"]["bodies"].append(
            {"id": "cap", "components": ["cap"], "mass": 0.01})
        spec["physics"]["constraints"] = [
            {"type": "hinge", "bodyA": "crate", "bodyB": "cap",
             "pivotA": [0, 0, 0], "pivotB": [0, 0, 0.02],  # 20mm 偏差 > 5mm 容差
             "axis": [1, 0, 0], "limits": [0, 1.9]}]
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("pivot" in e for e in errors))

    def test_strict_complex_needs_three_components(self):
        spec = minimal_spec()
        spec["silhouette"]["complexity"] = "complex"
        errors, _ = validate_spec.validate(spec, strict=True)
        self.assertTrue(any("complex" in e for e in errors))


if __name__ == "__main__":
    unittest.main()


class HingeLimitsFormatTest(unittest.TestCase):
    """M1 契約：hinge limits 必須是 [lo, hi] 數字對（lo < hi）或字串 "free"。"""

    def _spec_with_limits(self, limits):
        spec = minimal_spec()
        spec["physics"]["bodies"].append({"id": "cap", "components": [], "mass": 0.01})
        spec["physics"]["constraints"] = [
            {"type": "hinge", "bodyA": "crate", "bodyB": "cap",
             "pivotA": [0, 0, 0], "pivotB": [0, 0, 0],
             "axis": [1, 0, 0], "limits": limits}]
        return spec

    def test_limits_garbage_string_fails(self):
        errors, _ = validate_spec.validate(self._spec_with_limits("banana"), strict=False)
        self.assertTrue(any("limits" in e for e in errors))

    def test_limits_wrong_length_fails(self):
        errors, _ = validate_spec.validate(self._spec_with_limits([0, 1, 2]), strict=False)
        self.assertTrue(any("limits" in e for e in errors))

    def test_limits_min_not_below_max_fails(self):
        errors, _ = validate_spec.validate(self._spec_with_limits([1.9, 0]), strict=False)
        self.assertTrue(any("limits" in e for e in errors))

    def test_limits_free_passes(self):
        errors, _ = validate_spec.validate(self._spec_with_limits("free"), strict=False)
        self.assertEqual([e for e in errors if "limits" in e], [])

    def test_limits_pair_passes(self):
        errors, _ = validate_spec.validate(self._spec_with_limits([0, 1.92]), strict=False)
        self.assertEqual([e for e in errors if "limits" in e], [])


class HingeAttachmentLimitsDriftTest(unittest.TestCase):
    """attachment.hinge.limits 與 constraint.limits 漂移必須被抓到。"""

    def _spec(self, att_limits, con_limits):
        spec = minimal_spec()
        cap = copy.deepcopy(spec["componentTree"][0])
        cap.update({"id": "cap", "parent": "crate",
                    "attachment": {"type": "hinge",
                                   "hinge": {"pivot": [0, 0, 0], "axis": [1, 0, 0],
                                             "limits": att_limits}}})
        spec["componentTree"].append(cap)
        spec["physics"]["bodies"].append(
            {"id": "cap", "components": ["cap"], "mass": 0.01})
        spec["physics"]["constraints"] = [
            {"type": "hinge", "bodyA": "crate", "bodyB": "cap",
             "pivotA": [0, 0, 0], "pivotB": [0, 0, 0],
             "axis": [1, 0, 0], "limits": con_limits}]
        return spec

    def test_attachment_limits_drift_fails(self):
        errors, _ = validate_spec.validate(self._spec([0, 1.9], "free"), strict=False)
        self.assertTrue(any("limits" in e and "cap" in e for e in errors))

    def test_attachment_limits_match_passes(self):
        errors, _ = validate_spec.validate(self._spec("free", "free"), strict=False)
        self.assertEqual([e for e in errors if "limits" in e], [])


class JointConstraintFormatTest(unittest.TestCase):
    """M2 契約：joint constraint 需 axis 與 angular；angular 逐軸 [lo,hi]/"free"/"locked"。"""

    def _spec_with_joint(self, con):
        spec = minimal_spec()
        spec["physics"]["bodies"].append({"id": "arm", "components": [], "mass": 0.01})
        base = {"type": "joint", "bodyA": "crate", "bodyB": "arm",
                "pivotA": [0, 0, 0], "pivotB": [0, 0, 0]}
        base.update(con)
        spec["physics"]["constraints"] = [base]
        return spec

    def test_joint_requires_axis_and_angular(self):
        errors, _ = validate_spec.validate(self._spec_with_joint({}), strict=False)
        self.assertTrue(any("joint" in e and "angular" in e for e in errors))

    def test_joint_unknown_angular_key_fails(self):
        spec = self._spec_with_joint({"axis": [1, 0, 0], "angular": {"w": [0, 1]}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("angular" in e for e in errors))

    def test_joint_bad_angular_value_fails(self):
        spec = self._spec_with_joint({"axis": [1, 0, 0], "angular": {"x": "banana"}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("angular" in e for e in errors))

    def test_joint_reversed_pair_fails(self):
        spec = self._spec_with_joint({"axis": [1, 0, 0], "angular": {"x": [1.0, -1.0]}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("angular" in e for e in errors))

    def test_joint_valid_mixed_passes(self):
        spec = self._spec_with_joint({"axis": [1, 0, 0],
                                      "angular": {"x": [-0.5, 0.5], "y": "free",
                                                  "z": "locked"}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertEqual([e for e in errors if "joint" in e or "angular" in e], [])


class JointAttachmentDriftTest(unittest.TestCase):
    """attachment.type=joint 必須對到 physics.constraints 的 joint，且 angular 不可漂移。"""

    def _spec(self, att_angular, con_angular):
        spec = minimal_spec()
        arm = copy.deepcopy(spec["componentTree"][0])
        arm.update({"id": "arm", "parent": "crate",
                    "attachment": {"type": "joint",
                                   "joint": {"pivot": [0, 0, 0], "axis": [1, 0, 0],
                                             "angular": att_angular}}})
        spec["componentTree"].append(arm)
        spec["physics"]["bodies"].append(
            {"id": "arm", "components": ["arm"], "mass": 0.01})
        spec["physics"]["constraints"] = [
            {"type": "joint", "bodyA": "crate", "bodyB": "arm",
             "pivotA": [0, 0, 0], "pivotB": [0, 0, 0],
             "axis": [1, 0, 0], "angular": con_angular}]
        return spec

    def test_joint_attachment_without_constraint_fails(self):
        spec = self._spec({"x": [0, 1]}, {"x": [0, 1]})
        spec["physics"]["constraints"] = []
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("arm" in e and "無對應" in e for e in errors))

    def test_joint_angular_drift_fails(self):
        errors, _ = validate_spec.validate(
            self._spec({"x": [0, 1]}, {"x": [0, 2]}), strict=False)
        self.assertTrue(any("arm" in e and "angular" in e for e in errors))

    def test_joint_match_passes(self):
        ang = {"x": [-0.5, 0.5], "y": "locked", "z": [0, 2.6]}
        errors, _ = validate_spec.validate(self._spec(ang, dict(ang)), strict=False)
        self.assertEqual(errors, [])


class ProportionsGateTest(unittest.TestCase):
    """M2 契約：proportions 頭身比 gate——head 高 ≈ head_unit、全高 ≈ head_unit×total_heads。"""

    def _character_spec(self, head_h=0.03, total_h=0.12, proportions=None):
        """crate 當軀幹（含腿），上面疊一顆 head。總高 = total_h。"""
        spec = minimal_spec()
        torso = spec["componentTree"][0]
        body_h = total_h - head_h
        torso["dimensions"].update({"w": 0.04, "h": body_h, "d": 0.02})
        torso["transform"]["position"] = [0, body_h / 2, 0]
        head = copy.deepcopy(torso)
        head.update({"id": "head", "parent": None})
        head["dimensions"] = dict(torso["dimensions"], h=head_h)
        head["transform"] = {"position": [0, body_h + head_h / 2, 0],
                             "rotation": [0, 0, 0], "scale": [1, 1, 1]}
        spec["componentTree"].append(head)
        spec["physics"]["bodies"].append(
            {"id": "head", "components": ["head"], "mass": 0.01})
        spec["proportions"] = proportions or {
            "head_component": "head", "head_unit": head_h,
            "total_heads": total_h / head_h, "tolerance": 0.15}
        return spec

    def test_proportions_ok_passes(self):
        errors, _ = validate_spec.validate(self._character_spec(), strict=False)
        self.assertEqual(errors, [])

    def test_head_unit_mismatch_fails(self):
        spec = self._character_spec(head_h=0.03)
        spec["proportions"]["head_unit"] = 0.05  # 實際 head 只有 0.03
        spec["proportions"]["total_heads"] = 0.12 / 0.05
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("head_unit" in e for e in errors))

    def test_total_heads_mismatch_fails(self):
        spec = self._character_spec(head_h=0.03, total_h=0.12)
        spec["proportions"]["total_heads"] = 7.5  # 宣告 7.5 頭身，實際 4 頭身
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("total_heads" in e or "頭身" in e for e in errors))

    def test_missing_head_component_fails(self):
        spec = self._character_spec()
        spec["proportions"]["head_component"] = "noggin"
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("noggin" in e for e in errors))

    def test_spec_without_proportions_unaffected(self):
        errors, _ = validate_spec.validate(minimal_spec(), strict=True)
        self.assertEqual(errors, [])


class ActuationTest(unittest.TestCase):
    """M4 契約：constraint 上的 actuation（drive/steer/servo）與 component 上的 light。"""

    def _spec(self, con_extra=None, comp_extra=None):
        spec = minimal_spec()
        spec["physics"]["bodies"].append({"id": "cap", "components": [], "mass": 0.01})
        con = {"type": "hinge", "bodyA": "crate", "bodyB": "cap",
               "pivotA": [0, 0, 0], "pivotB": [0, 0, 0],
               "axis": [1, 0, 0], "limits": "free"}
        con.update(con_extra or {})
        spec["physics"]["constraints"] = [con]
        if comp_extra:
            spec["componentTree"][0].update(comp_extra)
        return spec

    def test_valid_drive_passes(self):
        spec = self._spec({"actuation": {"type": "drive", "targetSpeed": 20, "maxForce": 0.5}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertEqual([e for e in errors if "actuation" in e], [])

    def test_drive_requires_free_limits(self):
        spec = self._spec({"limits": [0, 1.5],
                           "actuation": {"type": "drive", "targetSpeed": 20, "maxForce": 0.5}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("drive" in e and "free" in e for e in errors))

    def test_steer_range_within_limits(self):
        spec = self._spec({"limits": [-0.5, 0.5],
                           "actuation": {"type": "steer", "range": [-0.6, 0.6], "maxForce": 1.0}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("steer" in e and "range" in e for e in errors))

    def test_valid_steer_passes(self):
        spec = self._spec({"limits": [-0.5, 0.5],
                           "actuation": {"type": "steer", "range": [-0.4, 0.4], "maxForce": 1.0}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertEqual([e for e in errors if "actuation" in e], [])

    def test_servo_requires_limits_or_joint(self):
        spec = self._spec({"actuation": {"type": "servo", "maxForce": 0.3}})  # limits "free"
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("servo" in e for e in errors))

    def test_valid_servo_on_joint_passes(self):
        spec = self._spec({"type": "joint", "angular": {"x": [-0.6, 0.6]},
                           "actuation": {"type": "servo", "maxForce": 0.3}})
        del spec["physics"]["constraints"][0]["limits"]
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertEqual([e for e in errors if "actuation" in e or "servo" in e], [])

    def test_unknown_type_fails(self):
        spec = self._spec({"actuation": {"type": "rocket", "maxForce": 1.0}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("actuation" in e and "rocket" in e for e in errors))

    def test_missing_max_force_fails(self):
        spec = self._spec({"actuation": {"type": "drive", "targetSpeed": 20}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("maxForce" in e for e in errors))

    def test_light_requires_material(self):
        spec = self._spec()
        spec["componentTree"][0].pop("material", None)
        spec["componentTree"][0]["actuation"] = {
            "type": "light", "emissive": {"on": "#ffffcc", "off": "#000000"}}
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("light" in e and "material" in e for e in errors))

    def test_valid_light_passes(self):
        spec = self._spec(comp_extra={"actuation": {
            "type": "light", "emissive": {"on": "#ffffcc", "off": "#000000"}}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertEqual([e for e in errors if "actuation" in e], [])

    def test_light_bad_emissive_fails(self):
        spec = self._spec(comp_extra={"actuation": {"type": "light", "emissive": {"on": "#ffffcc"}}})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("emissive" in e for e in errors))
