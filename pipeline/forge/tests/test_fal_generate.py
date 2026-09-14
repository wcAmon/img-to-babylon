"""fal client: key never leaks, dry-run by default, dedupe by input hash, queue polling."""
from __future__ import annotations
import io, json, os, tempfile, unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'integrations' / 'mesh3d'))
from forge._shared.png import write_rgb
import fal_generate as fg


class FakeResponse(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


class FakeOpener:
    def __init__(self):
        self.calls = []; self.status_polls = 0
    def open(self, req, timeout=0):
        url = req.full_url; self.calls.append((url, dict(req.header_items())))
        if url == 'https://queue.fal.run/fal-ai/hyper3d/rodin':
            return FakeResponse(json.dumps({'request_id': 'r1', 'status_url': 'https://q/status', 'response_url': 'https://q/result'}).encode())
        if url == 'https://q/status':
            self.status_polls += 1
            return FakeResponse(json.dumps({'status': 'IN_PROGRESS' if self.status_polls < 3 else 'COMPLETED'}).encode())
        if url == 'https://q/result':
            return FakeResponse(json.dumps({'model_mesh': {'url': 'https://cdn/m.glb', 'file_name': 'm.glb'},
                                            'textures': [{'url': 'https://cdn/t.png', 'file_name': 't.png'}], 'seed': 5}).encode())
        if url == 'https://cdn/m.glb': return FakeResponse(b'glTF-bytes')
        if url == 'https://cdn/t.png': return FakeResponse(b'\x89PNG-bytes')
        raise AssertionError(url)


class FalGenerate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        self.views = {}
        for r in ('front', 'left', 'right'):
            p = self.root / f'{r}.png'; write_rgb(p, 2, 2, b'\x00' * 12); self.views[r] = p
        os.environ.pop('FAL_API_KEY', None)
    def tearDown(self): self.tmp.cleanup()

    def test_key_from_env_file_and_missing_key_message_has_no_value(self):
        env = self.root / '.env'; env.write_text('OTHER=1\nFAL_API_KEY=abc:secret123\n')
        self.assertEqual(fg.load_fal_key(env), 'abc:secret123')
        with self.assertRaises(SystemExit) as cm: fg.load_fal_key(self.root / 'nope.env')
        self.assertNotIn('secret', str(cm.exception))

    def test_payloads_match_endpoint_schemas(self):
        t = fg.build_payload('tripo', self.views, 9)
        self.assertEqual(t['texture'], 'HD'); self.assertTrue(t['pbr']); self.assertNotIn('back_image_url', t)
        self.assertTrue(t['front_image_url'].startswith('data:image/png;base64,'))
        r = fg.build_payload('rodin', self.views, 9)
        self.assertEqual(len(r['input_image_urls']), 3); self.assertTrue(r['TAPose']); self.assertEqual(r['condition_mode'], 'concat')

    def test_dry_run_without_confirm_and_no_key_in_files(self):
        out = self.root / 'gen'
        res = fg.generate('rodin', self.views, 9, out, key='abc:secret123', opener=FakeOpener(), confirm_paid=False, force=False, sleep=lambda s: None)
        self.assertTrue(res['dryRun'])
        text = (out / 'rodin' / 'dry-run.json').read_text()
        self.assertNotIn('secret123', text); self.assertNotIn('base64,', text)

    def test_paid_run_polls_downloads_and_dedupes(self):
        out = self.root / 'gen'; opener = FakeOpener()
        res = fg.generate('rodin', self.views, 9, out, key='abc:secret123', opener=opener, confirm_paid=True, force=False, sleep=lambda s: None)
        self.assertEqual(res['requestId'], 'r1'); self.assertEqual(opener.status_polls, 3)
        self.assertEqual(opener.calls[0][1].get('Authorization'), 'Key abc:secret123')
        self.assertEqual((out / 'rodin' / 'model.glb').read_bytes(), b'glTF-bytes')
        self.assertTrue((out / 'rodin' / 'textures' / 't.png').is_file())
        prov = json.loads((out / 'rodin' / 'provenance.json').read_text())
        self.assertNotIn('secret123', json.dumps(prov)); self.assertEqual(prov['paid'], True)
        with self.assertRaises(RuntimeError): fg.generate('rodin', self.views, 9, out, key='k', opener=opener, confirm_paid=True, force=False, sleep=lambda s: None)


if __name__ == '__main__':
    unittest.main()
