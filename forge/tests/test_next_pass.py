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

    def test_round_allows_six_then_blocks_without_mutation(self):
        next_pass.cmd_init(self.root, "x", force=False)
        for _ in range(6):
            self.assertEqual(next_pass.cmd_correction(self.root), 0)
        before=next_pass.load_state(self.root)
        self.assertEqual(next_pass.cmd_correction(self.root), 3)
        self.assertEqual(next_pass.load_state(self.root), before)

    def test_history_does_not_limit_new_round(self):
        next_pass.cmd_init(self.root, "x", force=False)
        state=next_pass.load_state(self.root)
        state['corrections']['total']=60
        state['iterationRound']={'index':4,'corrections':0,'limit':6}
        next_pass.save_state(self.root,state)
        self.assertEqual(next_pass.cmd_correction(self.root),0)
        self.assertEqual(next_pass.load_state(self.root)['corrections']['total'],61)


if __name__ == "__main__":
    unittest.main()
