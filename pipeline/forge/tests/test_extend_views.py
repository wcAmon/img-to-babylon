"""tomato edit is exercised through an injected opener; no network in tests."""
from __future__ import annotations
import base64, io, json, tempfile, unittest, urllib.error
from pathlib import Path
from forge._shared.png import write_rgb
from forge.stage1_intake.extend_views import EXTEND_PROMPT, MAX_RETRIES, extend_views, tomato_edit


class FakeResponse(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


class FakeOpener:
    """Generalised fake: fails the `/image` POST `fail_times` times with `fail_code` before
    succeeding (`fail_times=float('inf')` never succeeds). `busy_first=True` is sugar for a
    single 503 failure, kept for the pre-existing test."""
    def __init__(self, png: bytes, busy_first=False, fail_code=503, fail_times=0):
        self.png = png; self.calls = []
        if busy_first:
            fail_times = max(fail_times, 1); fail_code = 503
        self.fail_code = fail_code; self.fail_times = fail_times

    def open(self, req, timeout=0):
        url = req.full_url if hasattr(req, 'full_url') else req
        self.calls.append(url)
        if url.endswith('/image'):
            if self.fail_times:
                if self.fail_times != float('inf'): self.fail_times -= 1
                headers = {'Retry-After': '0'} if self.fail_code == 503 else {}
                raise urllib.error.HTTPError(url, self.fail_code, 'busy' if self.fail_code == 503 else 'error', headers, None)
            body = json.loads(req.data.decode())
            assert body['prompt'] == EXTEND_PROMPT and base64.b64decode(body['image'])[:4] == b'\x89PNG'
            return FakeResponse(json.dumps({'job_id': 'job-1', 'status': 'done', 'mode': 'edit', 'width': 4, 'height': 8}).encode())
        if url.endswith('/assets/job-1'):
            return FakeResponse(self.png)
        raise AssertionError(url)


class ExtendViews(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); root = Path(self.tmp.name)
        self.views = root / 'views'; (self.views / 'padded').mkdir(parents=True)
        for role in ('left', 'front', 'right'):
            write_rgb(self.views / 'padded' / f'{role}.png', 4, 8, b'\xff' * (4 * 8 * 3))
        (self.views / 'views.json').write_text(json.dumps({'views': [
            {'role': r, 'file': f'{r}.png', 'padded': f'padded/{r}.png', 'bustBox': [0, 0, 4, 3]} for r in ('left', 'front', 'right')]}))
        buf = root / 'out.png'; write_rgb(buf, 4, 8, bytes([1, 2, 3]) * 32); self.png = buf.read_bytes()

    def tearDown(self): self.tmp.cleanup()

    def test_edit_retries_on_503(self):
        opener = FakeOpener(self.png, busy_first=True)
        png, job = tomato_edit(self.views / 'padded' / 'front.png', EXTEND_PROMPT, 7, opener, 'https://t')
        self.assertEqual(png, self.png); self.assertEqual(job['job_id'], 'job-1')
        self.assertEqual(opener.calls, ['https://t/image', 'https://t/image', 'https://t/assets/job-1'])

    def test_extend_writes_three_outputs_and_manifest(self):
        out = Path(self.tmp.name) / 'extended'
        meta = extend_views(self.views, out, seed=7, opener=FakeOpener(self.png), base='https://t')
        self.assertEqual([v['role'] for v in meta['views']], ['left', 'front', 'right'])
        self.assertEqual(meta['seed'], 7)
        self.assertTrue((out / 'front.png').read_bytes() == self.png)
        self.assertEqual(json.loads((out / 'extend.json').read_text())['views'][2]['jobId'], 'job-1')
        self.assertEqual(meta['views'][0]['bustBox'], [0, 0, 4, 3])

    def test_edit_raises_after_retries_exhausted(self):
        opener = FakeOpener(self.png, fail_code=503, fail_times=float('inf'))
        with self.assertRaises(urllib.error.HTTPError):
            tomato_edit(self.views / 'padded' / 'front.png', EXTEND_PROMPT, 7, opener, 'https://t')
        self.assertEqual(opener.calls, ['https://t/image'] * (MAX_RETRIES + 1))

    def test_edit_does_not_retry_non_503(self):
        opener = FakeOpener(self.png, fail_code=500, fail_times=1)
        with self.assertRaises(urllib.error.HTTPError):
            tomato_edit(self.views / 'padded' / 'front.png', EXTEND_PROMPT, 7, opener, 'https://t')
        self.assertEqual(opener.calls, ['https://t/image'])


if __name__ == '__main__':
    unittest.main()
