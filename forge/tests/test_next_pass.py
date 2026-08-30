import json, os, tempfile, unittest
from forge import next_pass


class NextPassTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_init_creates_state(self):
        next_pass.cmd_init(self.root, "pill-bottle", force=False)
        state = next_pass.load_state(self.root)
        self.assertEqual(state["model"], "pill-bottle")
        self.assertEqual(state["currentIndex"], 0)
        self.assertEqual(state["passOrder"], next_pass.PASS_ORDER)

    def test_init_refuses_overwrite(self):
        next_pass.cmd_init(self.root, "a", force=False)
        with self.assertRaises(SystemExit):
            next_pass.cmd_init(self.root, "b", force=False)

    def test_done_advances_and_completes(self):
        next_pass.cmd_init(self.root, "x", force=False)
        for _ in next_pass.PASS_ORDER:
            code = next_pass.cmd_done(self.root)
        self.assertEqual(code, 0)
        state = next_pass.load_state(self.root)
        self.assertEqual(state["currentIndex"], len(next_pass.PASS_ORDER))

    def test_correction_limits(self):
        next_pass.cmd_init(self.root, "x", force=False)
        for _ in range(3):
            self.assertEqual(next_pass.cmd_correction(self.root), 0)
        self.assertEqual(next_pass.cmd_correction(self.root), 3)  # 第 4 次超出每 pass 上限

    def test_total_correction_limit(self):
        next_pass.cmd_init(self.root, "x", force=False)
        for _ in range(3):
            next_pass.cmd_correction(self.root)
        next_pass.cmd_done(self.root)
        for _ in range(3):
            code = next_pass.cmd_correction(self.root)
        self.assertEqual(code, 3)  # 總數第 7 次前，總上限 6 已在第 6 次後觸發


if __name__ == "__main__":
    unittest.main()
