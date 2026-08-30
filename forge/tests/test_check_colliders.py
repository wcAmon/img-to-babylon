import copy, unittest
from forge import check_colliders


def rt(**over):
    base = {
        "model": "t",
        "meshes": [{"component": "a",
                    "aabb": {"min": [0, 0, 0], "max": [0.1, 0.1, 0.1]}}],
        "bodies": [{
            "id": "a", "mass": 0.5, "centerOfMassWorld": [0.05, 0.05, 0.05],
            "colliders": [{"component": "a", "type": "box",
                           "aabb": {"min": [0, 0, 0], "max": [0.1, 0.1, 0.1]},
                           "volume": 0.001}],
        }],
    }
    base.update(over)
    return base


class CheckCollidersTest(unittest.TestCase):
    def test_good_runtime_passes(self):
        self.assertEqual(check_colliders.check(rt()), [])

    def test_collider_too_small_fails(self):
        bad = rt()
        bad["bodies"][0]["colliders"][0]["aabb"] = {
            "min": [0.03, 0.03, 0.03], "max": [0.07, 0.07, 0.07]}
        errors = check_colliders.check(bad)
        self.assertTrue(any("未包住" in e for e in errors))

    def test_density_out_of_band(self):
        bad = rt()
        bad["bodies"][0]["mass"] = 100.0  # 100/0.001 = 100000 kg/m³
        errors = check_colliders.check(bad)
        self.assertTrue(any("密度" in e for e in errors))

    def test_sibling_overlap(self):
        bad = rt()
        bad["bodies"][0]["colliders"].append(
            {"component": "b", "type": "box",
             "aabb": {"min": [0, 0, 0], "max": [0.09, 0.09, 0.09]},
             "volume": 0.0007})
        errors = check_colliders.check(bad)
        self.assertTrue(any("重疊" in e for e in errors))

    def test_com_outside_union(self):
        bad = rt()
        bad["bodies"][0]["centerOfMassWorld"] = [0.5, 0.5, 0.5]
        errors = check_colliders.check(bad)
        self.assertTrue(any("質心" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
