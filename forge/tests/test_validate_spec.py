import copy, json, os, unittest
from forge import validate_spec

HERE = os.path.dirname(__file__)
SAMPLE = os.path.join(HERE, "..", "..", "viewer", "models", "sample-crate", "spec.json")


def minimal_spec():
    with open(SAMPLE) as f:
        return json.load(f)


class ValidateSpecTest(unittest.TestCase):
    def test_sample_crate_passes(self):
        errors, _ = validate_spec.validate(minimal_spec(), strict=True)
        self.assertEqual(errors, [])

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
