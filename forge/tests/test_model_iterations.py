import json
import tempfile
import unittest
from pathlib import Path
from forge import next_pass


class ModelIterationTest(unittest.TestCase):
    def test_independent_models_preserve_legacy_state(self):
        with tempfile.TemporaryDirectory() as root:
            next_pass.cmd_init(root, 'legacy', False)
            legacy = Path(root, '.img2babylon/state.json').read_bytes()
            self.assertEqual(next_pass.main(['--root', root, '--model', 'female', 'init', '--model', 'female']), 0)
            next_pass.main(['--root', root, '--model', 'female', 'done'])
            next_pass.main(['--root', root, '--model', 'male', 'init', '--model', 'male'])
            self.assertEqual(json.loads(Path(root, '.img2babylon/female/state.json').read_text())['currentIndex'], 1)
            self.assertEqual(Path(root, '.img2babylon/state.json').read_bytes(), legacy)

    def test_revision_requires_completed_cycle_and_keeps_snapshot(self):
        with tempfile.TemporaryDirectory() as root:
            args = ['--root', root, '--model', 'female']
            next_pass.main(args + ['init', '--model', 'female'])
            self.assertEqual(next_pass.main(args + ['revise', '--from-pass', 'structure', '--reason', 'Refine face']), 2)
            for _ in range(5):
                next_pass.main(args + ['done'])
            model = Path(root, 'viewer/models/female')
            model.mkdir(parents=True)
            (model / 'spec.json').write_text('{"targetName":"female"}')
            (model / 'iteration.json').write_text('{"revision":1,"status":"complete"}')
            self.assertEqual(next_pass.main(args + ['revise', '--from-pass', 'structure', '--reason', 'Refine face']), 0)
            state = json.loads(Path(root, '.img2babylon/female/state.json').read_text())
            self.assertEqual(state['revision'], 2)
            self.assertEqual(state['currentIndex'], 1)
            snapshot = Path(root, '.img2babylon/female/revisions/r001/model/spec.json')
            self.assertEqual(json.loads(snapshot.read_text())['targetName'], 'female')
            self.assertEqual(json.loads((model/'iteration.json').read_text())['revision'],2)
            self.assertEqual(json.loads((model/'spec.json').read_text())['buildStage'],'structure')
            Path(root,'.img2babylon/female/state.json').unlink()
            self.assertEqual(next_pass.load_state((root,'female'))['revision'],2, 'Tracked state supports fresh checkout resume')
            with self.assertRaises(SystemExit):
                next_pass.main(args + ['init','--model','female'])

    def test_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(SystemExit):
                next_pass.main(['--root', root, '--model', '../escape', 'status'])
