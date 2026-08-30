import io, json, os, tempfile, unittest
from unittest import mock
from forge import tomato


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeOpener:
    """依序回放 responses；記錄每次請求。"""

    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def open(self, req, timeout=None):
        self.requests.append(req)
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return FakeResponse(r)


def http503(retry_after="1"):
    import urllib.error
    return urllib.error.HTTPError(
        "u", 503, "busy", {"Retry-After": retry_after}, io.BytesIO(b""))


class TomatoTest(unittest.TestCase):
    def test_post_json_success(self):
        opener = FakeOpener([json.dumps({"job_id": "j1", "status": "done"}).encode()])
        job = tomato._post_json("http://x/image", {"prompt": "p"}, opener)
        self.assertEqual(job["job_id"], "j1")
        body = json.loads(opener.requests[0].data.decode())
        self.assertEqual(body["prompt"], "p")

    @mock.patch("forge.tomato.time.sleep")
    def test_post_json_retries_on_503(self, sleep):
        opener = FakeOpener([http503("2"), json.dumps({"job_id": "j2"}).encode()])
        job = tomato._post_json("http://x/image", {"prompt": "p"}, opener)
        self.assertEqual(job["job_id"], "j2")
        sleep.assert_called_once_with(2)

    @mock.patch("forge.tomato.time.sleep")
    def test_post_json_gives_up_after_retries(self, _):
        opener = FakeOpener([http503(), http503(), http503(), http503()])
        with self.assertRaises(Exception):
            tomato._post_json("http://x/image", {"prompt": "p"}, opener, retries=3)

    def test_view_prompts_cover_side_and_rear(self):
        self.assertIn("side", tomato.VIEW_PROMPTS)
        self.assertIn("rear", tomato.VIEW_PROMPTS)

    def test_gen_creates_missing_output_directory(self):
        opener = FakeOpener([
            json.dumps({"job_id": "j3", "mode": "generate"}).encode(),
            b"\x89PNG fake bytes",
        ])
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "nested", "sub", "hero.png")
            args = mock.Mock(prompt="p", aspect="16:9", seed=None, out=out)
            rc = tomato.cmd_gen(args, opener)
            self.assertEqual(rc, 0)
            self.assertTrue(os.path.isfile(out))
            with open(out, "rb") as f:
                self.assertEqual(f.read(), b"\x89PNG fake bytes")


if __name__ == "__main__":
    unittest.main()
