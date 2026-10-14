from __future__ import annotations
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class DocsTest(unittest.TestCase):
    def test_skill_frontmatter_and_sections(self):
        text = (ROOT / 'SKILL.md').read_text()
        self.assertTrue(text.startswith('---\nname: glb-ready\n'))
        self.assertIn('version: 1.0.0', text.split('---')[1])
        for heading in ('## Contract', '## Which path', '## Order of operations', '## Settled numbers', '## Do not repeat', '## Review', '## Environment'):
            self.assertIn(heading, text)
        self.assertLessEqual(len(text.splitlines()), 300)
        for script in ('glb_audit.py', 'reduce_mesh.py', 'repair_shell.py', 'bake_atlas.py', 'shrink_textures.py', 'render_review.py', 'retarget_clips.py', 'validate_retarget.py'):
            self.assertIn(script, text); self.assertTrue((ROOT / 'scripts' / script).exists(), script)
        self.assertIn('nomen-glb check', text)
        self.assertEqual(len(re.findall(r'^\d+\. ', text.split('## Do not repeat')[1].split('## Review')[0], re.M)), 15)

    def test_lessons_sections_and_no_private_paths(self):
        text = (ROOT / 'lessons.md').read_text()
        for n in range(1, 9):
            self.assertRegex(text, r'^## %d\. ' % n)
        self.assertNotIn('/Users/', text); self.assertNotIn('.ts.net', text)
        for word in ('yui_', 'lisa_', 'marry_', 'guava_'):
            self.assertNotIn(word, text.lower())

    def test_profiles_match_contract(self):
        import json
        p = json.loads((ROOT / 'profiles' / 'nomen-land.json').read_text())
        self.assertEqual((p['maxTriangles'], p['maxTextures'], p['maxTextureSize'], p['maxBytes'], p['maxNodes'], p['maxJoints']), (20000, 8, 2048, 20971520, 500, 64))
        self.assertTrue(p['requireGrounded'])
