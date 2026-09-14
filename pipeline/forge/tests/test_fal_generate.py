"""fal client: key never leaks, dry-run by default, dedupe by input hash, queue polling."""
from __future__ import annotations
import io, json, os, tempfile, unittest, urllib.error
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'integrations' / 'mesh3d'))
from forge._shared.png import write_rgb
import fal_generate as fg


class FakeResponse(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


class FakeOpener:
    def __init__(self, storage_response=None):
        self.calls = []; self.status_polls = 0; self.puts = []; self.tripo_post_body = None
        self.storage_response = {'upload_url': 'https://u/x', 'file_url': 'https://cdn/x.png'} if storage_response is None else storage_response
    def open(self, req, timeout=0):
        url = req.full_url; self.calls.append((url, dict(req.header_items())))
        if req.get_method() == 'PUT':
            self.puts.append({'url': url, 'headers': dict(req.header_items()), 'data': req.data})
            return FakeResponse(b'')
        if url == 'https://rest.alpha.fal.ai/storage/upload/initiate':
            return FakeResponse(json.dumps(self.storage_response).encode())
        if url == 'https://queue.fal.run/fal-ai/hyper3d/rodin':
            return FakeResponse(json.dumps({'request_id': 'r1', 'status_url': 'https://q/status', 'response_url': 'https://q/result'}).encode())
        if url == 'https://queue.fal.run/tripo3d/tripo/v2.5/multiview-to-3d':
            self.tripo_post_body = json.loads(req.data.decode())
            return FakeResponse(json.dumps({'request_id': 't1', 'status_url': 'https://q/status', 'response_url': 'https://q/result'}).encode())
        if url == 'https://q/status':
            self.status_polls += 1
            return FakeResponse(json.dumps({'status': 'IN_PROGRESS' if self.status_polls < 3 else 'COMPLETED'}).encode())
        if url == 'https://q/result':
            return FakeResponse(json.dumps({'model_mesh': {'url': 'https://cdn/m.glb', 'file_name': 'm.glb'}, 'pbr_model': {'url': 'https://cdn/m.glb'},
                                            'textures': [{'url': 'https://cdn/t.png', 'file_name': 't.png'}], 'seed': 5}).encode())
        if url == 'https://cdn/m.glb': return FakeResponse(b'glTF-bytes')
        if url == 'https://cdn/t.png': return FakeResponse(b'\x89PNG-bytes')
        raise AssertionError(url)


class DownloadFailsOpener(FakeOpener):
    """Like FakeOpener, but the model download itself fails (HTTP 500) after the job
    completes and the request_id is known -- exercises the partial-provenance path."""
    def open(self, req, timeout=0):
        url = req.full_url if hasattr(req, 'full_url') else req
        if url == 'https://cdn/m.glb':
            raise urllib.error.HTTPError(url, 500, 'download boom', {}, None)
        return super().open(req, timeout)


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

    def test_dedupe_check_does_not_apply_to_dry_runs(self):
        """A pre-existing provenance.json for the same input must not make a dry run raise;
        the dedupe guard only protects paid submissions."""
        out = self.root / 'gen'
        payload = fg.build_payload('rodin', self.views, 9)
        h = fg.input_hash(payload)
        prov_dir = out / 'rodin'; prov_dir.mkdir(parents=True)
        (prov_dir / 'provenance.json').write_text(json.dumps({'inputHash': h, 'requestId': 'old-request'}))
        res = fg.generate('rodin', self.views, 9, out, key='abc:secret123', opener=FakeOpener(), confirm_paid=False, force=False, sleep=lambda s: None)
        self.assertTrue(res['dryRun'])
        self.assertTrue((prov_dir / 'dry-run.json').is_file())

    def test_paid_run_polls_downloads_and_dedupes(self):
        out = self.root / 'gen'; opener = FakeOpener()
        res = fg.generate('rodin', self.views, 9, out, key='abc:secret123', opener=opener, confirm_paid=True, force=False, sleep=lambda s: None)
        self.assertEqual(res['requestId'], 'r1'); self.assertEqual(opener.status_polls, 3)
        self.assertEqual(opener.calls[0][1].get('Authorization'), 'Key abc:secret123')
        self.assertEqual((out / 'rodin' / 'model.glb').read_bytes(), b'glTF-bytes')
        self.assertTrue((out / 'rodin' / 'textures' / 't.png').is_file())
        prov = json.loads((out / 'rodin' / 'provenance.json').read_text())
        self.assertNotIn('secret123', json.dumps(prov)); self.assertEqual(prov['paid'], True)
        self.assertEqual(prov['status'], 'complete'); self.assertEqual(prov['submittedVia'], 'data-uri')
        with self.assertRaises(RuntimeError): fg.generate('rodin', self.views, 9, out, key='k', opener=opener, confirm_paid=True, force=False, sleep=lambda s: None)

    def test_partial_provenance_written_before_download_survives_download_failure(self):
        out = self.root / 'gen'; opener = DownloadFailsOpener(b'unused')
        with self.assertRaises(urllib.error.HTTPError):
            fg.generate('rodin', self.views, 9, out, key='abc:secret123', opener=opener, confirm_paid=True, force=False, sleep=lambda s: None)
        prov = json.loads((out / 'rodin' / 'provenance.json').read_text())
        self.assertEqual(prov['requestId'], 'r1')
        self.assertEqual(prov['status'], 'submitted')
        self.assertEqual(prov['paid'], True)
        self.assertNotIn('outputs', prov)

    def test_upload_to_fal_storage_initiates_then_puts(self):
        opener = FakeOpener()
        url = fg.upload_to_fal_storage(self.views['front'], 'abc:secret123', opener)
        self.assertEqual(url, 'https://cdn/x.png')
        self.assertEqual(len(opener.puts), 1)
        put = opener.puts[0]
        self.assertEqual(put['url'], 'https://u/x')
        self.assertEqual(put['headers'].get('Content-type'), 'image/png')
        self.assertEqual(put['data'], self.views['front'].read_bytes())

    def test_upload_to_fal_storage_rejects_malformed_initiate(self):
        opener = FakeOpener(storage_response={})
        with self.assertRaises(RuntimeError) as cm:
            fg.upload_to_fal_storage(self.views['front'], 'abc:secret123', opener)
        self.assertIn('file_url', str(cm.exception))

    def test_tripo_paid_submission_uses_uploaded_urls_but_provenance_keeps_data_uris(self):
        out = self.root / 'gen'; opener = FakeOpener()
        res = fg.generate('tripo', self.views, 9, out, key='abc:secret123', opener=opener, confirm_paid=True, force=False, sleep=lambda s: None)
        self.assertIsNotNone(opener.tripo_post_body)
        for field in ('front_image_url', 'left_image_url', 'right_image_url'):
            self.assertEqual(opener.tripo_post_body[field], 'https://cdn/x.png')
            self.assertFalse(opener.tripo_post_body[field].startswith('data:'))
        prov = json.loads((out / 'tripo' / 'provenance.json').read_text())
        text = json.dumps(prov)
        self.assertNotIn('base64,', text)
        for field in ('front_image_url', 'left_image_url', 'right_image_url'):
            self.assertTrue(prov['parameters'][field].startswith('<data-uri '))
        self.assertEqual(prov['submittedVia'], 'fal-storage')

    def test_http_error_body_is_surfaced_without_headers(self):
        class RaisingOpener:
            def open(self, req, timeout=0):
                raise urllib.error.HTTPError(req.full_url, 422, 'Unprocessable Entity', {}, io.BytesIO(b'{"detail":"boom"}'))
        opener = RaisingOpener()
        with self.assertRaises(RuntimeError) as cm:
            fg.run_job('fal-ai/hyper3d/rodin', {'seed': 1}, 'SECRET-KEY-VALUE', opener, sleep=lambda s: None)
        msg = str(cm.exception)
        self.assertIn('422', msg); self.assertIn('boom', msg); self.assertNotIn('SECRET-KEY-VALUE', msg)


if __name__ == '__main__':
    unittest.main()
