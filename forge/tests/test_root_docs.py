import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class RootDocsTest(unittest.TestCase):
    def test_skill_routes_to_glb_ready(self):
        text = (ROOT / 'SKILL.md').read_text()
        self.assertIn('version: 1.6.0', text)
        self.assertIn('## 交付物是 GLB 時', text)
        self.assertIn('glb-ready/SKILL.md', text)

    def test_readme_english_intro_and_no_internal_hosts(self):
        text = (ROOT / 'README.md').read_text()
        self.assertTrue(text.lstrip().startswith('# img-to-babylon'))
        self.assertIn('glb-ready/', text); self.assertIn('LICENSE', text)
        self.assertNotIn('.ts.net', text); self.assertNotIn('Player Garden', text)

    def test_blender_refinement_is_a_pointer(self):
        text = (ROOT / 'grimoire' / 'blender_refinement.md').read_text()
        self.assertLessEqual(len([l for l in text.splitlines() if l.strip()]), 4)
        self.assertIn('glb-ready/', text)

    def test_agents_and_claude_mention_glb_ready_tests(self):
        for name in ('AGENTS.md', 'CLAUDE.md'):
            text = (ROOT / name).read_text()
            self.assertIn("glb-ready/tests", text, name)
            self.assertNotIn('inspector.ts 的未提交修改', text, name)

    def test_env_example_lists_both_keys_without_values(self):
        text = (ROOT / '.env.example').read_text()
        self.assertIn('FAL_API_KEY=\n', text); self.assertIn('IMG2BABYLON_TOMATO_BASE=\n', text)
        self.assertFalse(re.search(r'=(\S+)', text.replace('# ', '')), 'no values in .env.example')

    def test_tracked_docs_carry_no_author_home_paths(self):
        # The repo is public: historical plans and specs must not name the author's home directories or machine labels.
        hits = subprocess.run(['git', 'grep', '-nIwE', 'wake', '--', '*.md', '*.json', ':!pipeline/**'], cwd=ROOT, capture_output=True, text=True).stdout
        self.assertEqual(hits, '', hits[:2000])
