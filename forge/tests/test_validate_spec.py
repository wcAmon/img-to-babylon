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

    def _with_pour(self, pour, mass=1.0):
        """sample-crate 加一個 hinge 蓋（cap）當 pour 的 gate，再掛 pour。"""
        spec = minimal_spec()
        spec["componentTree"].append({
            "id": "cap", "name": "cap", "level": "macro", "primitive": "cylinder",
            "dimensions": {"w": 0.1, "h": 0.02, "d": 0.1, "units": "m", "confidence": 0.8},
            "transform": {"position": [0, 0.3, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "parent": spec["componentTree"][0]["id"],
            "attachment": {"type": "hinge", "socket": "crate:top",
                           "hinge": {"pivot": [0, -0.01, 0.05], "axis": [1, 0, 0], "limits": [0, 1.9]}},
            "material": spec["componentTree"][0]["material"],
            "collider": {"type": "cylinder", "size": [0.1, 0.02, 0.1], "offset": [0, 0, 0], "confidence": 0.8}})
        body = spec["physics"]["bodies"][0]
        body["mass"] = mass
        spec["physics"]["bodies"].append({"id": "cap", "components": ["cap"], "mass": 0.03})
        spec["physics"]["constraints"] = [{
            "type": "hinge", "bodyA": body["id"], "bodyB": "cap",
            "pivotA": [0, 0.25, 0.05], "pivotB": [0, -0.01, 0.05],
            "axis": [1, 0, 0], "limits": [0, 1.9]}]
        body["pour"] = pour
        return spec

    POUR_OK = {"tiltThreshold": 1.2, "grains": 40, "grainMass": 0.003, "ratePerSecond": 20,
               "gate": {"body": "cap", "minAngle": 1.0}}

    def test_pour_valid_passes(self):
        errors, _ = validate_spec.validate(self._with_pour(dict(self.POUR_OK)), strict=True)
        self.assertEqual(errors, [])

    def test_pour_without_gate_passes(self):
        pour = {k: v for k, v in self.POUR_OK.items() if k != "gate"}
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=True)
        self.assertEqual(errors, [])

    def test_pour_tilt_in_open_interval(self):
        for bad in (0, 3.2):
            pour = dict(self.POUR_OK, tiltThreshold=bad)
            errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
            self.assertTrue(any("pour" in e and "tiltThreshold" in e for e in errors), bad)

    def test_pour_grains_positive_int(self):
        for bad in (0, 2.5, -3):
            pour = dict(self.POUR_OK, grains=bad)
            errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
            self.assertTrue(any("pour" in e and "grains" in e for e in errors), bad)

    def test_pour_total_grain_mass_below_body_mass(self):
        pour = dict(self.POUR_OK, grainMass=0.1)  # 40 × 0.1 = 4 ≥ 1.0
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
        self.assertTrue(any("pour" in e and "grainMass" in e for e in errors))

    def test_pour_gate_body_must_be_hinged_to_this_body(self):
        pour = dict(self.POUR_OK, gate={"body": "nope", "minAngle": 1.0})
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
        self.assertTrue(any("pour" in e and "gate.body" in e for e in errors))

    def test_pour_gate_min_angle_within_hinge_limits(self):
        pour = dict(self.POUR_OK, gate={"body": "cap", "minAngle": 3.0})
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
        self.assertTrue(any("pour" in e and "minAngle" in e for e in errors))

    def test_pour_missing_field(self):
        pour = {k: v for k, v in self.POUR_OK.items() if k != "ratePerSecond"}
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
        self.assertTrue(any("pour" in e and "ratePerSecond" in e for e in errors))

    def test_pour_without_tilt_requires_gate(self):
        pour = {k: v for k, v in self.POUR_OK.items() if k not in ("tiltThreshold", "gate")}
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
        self.assertTrue(any("pour" in e and "gate" in e for e in errors))
        pour = {k: v for k, v in self.POUR_OK.items() if k != "tiltThreshold"}
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=True)
        self.assertEqual(errors, [])

    def test_pour_direction_unit_vector(self):
        for bad in ([0, 0, 2], [1, 0], "up", [0, 0, True]):
            pour = dict(self.POUR_OK, direction=bad)
            errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
            self.assertTrue(any("pour" in e and "direction" in e for e in errors), bad)
        pour = dict(self.POUR_OK, direction=[0, 0, 1])
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=True)
        self.assertEqual(errors, [])

    def test_pour_exit_speed_positive(self):
        for bad in (0, -1, "fast"):
            pour = dict(self.POUR_OK, exitSpeed=bad)
            errors, _ = validate_spec.validate(self._with_pour(pour), strict=False)
            self.assertTrue(any("pour" in e and "exitSpeed" in e for e in errors), bad)

    def test_pour_spray_shape_passes(self):
        pour = {"grains": 60, "grainMass": 0.002, "ratePerSecond": 30, "direction": [0, 0, 1],
                "exitSpeed": 2.5, "gate": {"body": "cap", "minAngle": 0.3}}
        errors, _ = validate_spec.validate(self._with_pour(pour), strict=True)
        self.assertEqual(errors, [])

    def _with_collect(self, collect, mass=0.2):
        spec = minimal_spec()
        body = spec["physics"]["bodies"][0]
        body["mass"] = mass
        body["collect"] = collect
        return spec

    COLLECT_OK = {"interior": {"size": [0.288, 0.35, 0.188], "offset": [0, 0.005, 0]}, "maxItemMass": 0.05}

    def test_collect_valid_passes(self):
        errors, _ = validate_spec.validate(self._with_collect(dict(self.COLLECT_OK)), strict=True)
        self.assertEqual(errors, [])

    def test_collect_interior_size_three_positive(self):
        for bad in ([0.1, 0, 0.1], [0.1, 0.1], "big", [0.1, -0.1, 0.1]):
            col = {"interior": {"size": bad, "offset": [0, 0, 0]}, "maxItemMass": 0.05}
            errors, _ = validate_spec.validate(self._with_collect(col), strict=False)
            self.assertTrue(any("collect" in e and "size" in e for e in errors), bad)

    def test_collect_interior_offset_three_numbers(self):
        for bad in ([0, 0], "center", [0, "a", 0]):
            col = {"interior": {"size": [0.1, 0.1, 0.1], "offset": bad}, "maxItemMass": 0.05}
            errors, _ = validate_spec.validate(self._with_collect(col), strict=False)
            self.assertTrue(any("collect" in e and "offset" in e for e in errors), bad)

    def test_collect_max_item_mass_positive(self):
        for bad in (0, -0.1, "light"):
            col = dict(self.COLLECT_OK, maxItemMass=bad)
            errors, _ = validate_spec.validate(self._with_collect(col), strict=False)
            self.assertTrue(any("collect" in e and "maxItemMass" in e for e in errors), bad)

    def test_collect_max_item_mass_below_body_mass(self):
        col = dict(self.COLLECT_OK, maxItemMass=0.5)  # body mass 0.2
        errors, _ = validate_spec.validate(self._with_collect(col), strict=False)
        self.assertTrue(any("collect" in e and "maxItemMass" in e for e in errors))
        errors, _ = validate_spec.validate(self._with_collect({"interior": "box", "maxItemMass": 0.05}), strict=False)
        self.assertTrue(any("collect" in e and "interior" in e for e in errors))

    def test_collect_trigger_values(self):
        for ok in ("manual", "contact"):
            errors, _ = validate_spec.validate(self._with_collect(dict(self.COLLECT_OK, trigger=ok)), strict=True)
            self.assertEqual(errors, [], ok)
        errors, _ = validate_spec.validate(self._with_collect(dict(self.COLLECT_OK, trigger="auto")), strict=False)
        self.assertTrue(any("collect.trigger" in e for e in errors))

    def _with_pour_collected(self, pour, collect=None, mass=0.08):
        spec = self._with_pour(pour, mass=mass)
        if collect is not None:
            spec["physics"]["bodies"][0]["collect"] = collect
        return spec

    POUR_COLLECTED_OK = {"source": "collected", "tiltThreshold": 1.0, "ratePerSecond": 20,
                         "direction": [0, 0, 1], "exitSpeed": 0.2}
    COLLECT_SCOOP = {"trigger": "contact", "interior": {"size": [0.152, 0.07, 0.146], "offset": [0, 0.015, 0.007]},
                     "maxItemMass": 0.005}

    def test_pour_source_collected_passes_with_collect(self):
        spec = self._with_pour_collected(dict(self.POUR_COLLECTED_OK), collect=dict(self.COLLECT_SCOOP))
        errors, _ = validate_spec.validate(spec, strict=True)
        self.assertEqual(errors, [])

    def test_pour_source_values(self):
        errors, _ = validate_spec.validate(self._with_pour(dict(self.POUR_OK, source="declared")), strict=True)
        self.assertEqual(errors, [])
        errors, _ = validate_spec.validate(self._with_pour(dict(self.POUR_OK, source="bucket")), strict=False)
        self.assertTrue(any("pour.source" in e for e in errors))

    def test_pour_source_collected_requires_collect(self):
        spec = self._with_pour_collected(dict(self.POUR_COLLECTED_OK))
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("pour.source" in e and "collect" in e for e in errors))

    def test_pour_source_collected_forbids_grains(self):
        for extra in ({"grains": 40}, {"grainMass": 0.003}):
            spec = self._with_pour_collected(dict(self.POUR_COLLECTED_OK, **extra), collect=dict(self.COLLECT_SCOOP))
            errors, _ = validate_spec.validate(spec, strict=False)
            self.assertTrue(any("pour.source" in e and "grains" in e for e in errors), extra)

    def test_pour_source_collected_still_needs_rate_and_tilt_or_gate(self):
        pour = {k: v for k, v in self.POUR_COLLECTED_OK.items() if k != "ratePerSecond"}
        errors, _ = validate_spec.validate(self._with_pour_collected(pour, collect=dict(self.COLLECT_SCOOP)), strict=False)
        self.assertTrue(any("ratePerSecond" in e for e in errors))
        pour = {k: v for k, v in self.POUR_COLLECTED_OK.items() if k != "tiltThreshold"}
        errors, _ = validate_spec.validate(self._with_pour_collected(pour, collect=dict(self.COLLECT_SCOOP)), strict=False)
        self.assertTrue(any("gate" in e for e in errors))

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
