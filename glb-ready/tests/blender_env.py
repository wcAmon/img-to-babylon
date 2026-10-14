"""Locate Blender and run glb-ready scripts for tests. Tests skip when Blender is absent."""
from __future__ import annotations
import os
import shutil
import subprocess
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / 'scripts'


def find_blender():
    candidates = [os.environ.get('BLENDER'), '/Applications/Blender.app/Contents/MacOS/Blender', shutil.which('blender')]
    for c in candidates:
        if c and Path(c).is_file():
            return c
    return None


def run_script(script, args, timeout=600):
    blender = find_blender()
    cmd = [blender, '-b', '--factory-startup', '--python-exit-code', '1', '--python', str(script), '--'] + [str(a) for a in args]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def require_blender(testcase):
    if not find_blender():
        testcase.skipTest('Blender not found (set BLENDER=/path/to/blender)')
