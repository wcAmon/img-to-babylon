#!/usr/bin/env python3
"""Validate the full source profile, then its explicit native Babylon translation."""
from __future__ import annotations
import argparse
import json
import math
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_render_profile import validate_profile as validate_source


def validate_profile(profile: dict) -> dict:
    result = validate_source(profile)
    errors = result['errors']
    def finite(value):
        return type(value) in (int, float) and math.isfinite(value)
    def numbers(value, prefix='profile'):
        if isinstance(value, dict):
            for key, item in value.items(): numbers(item, f'{prefix}.{key}')
        elif isinstance(value, list):
            for i, item in enumerate(value): numbers(item, f'{prefix}[{i}]')
        elif isinstance(value, float) and not math.isfinite(value): errors.append(f'{prefix} must be finite')
    numbers(profile)
    r = profile.get('renderer', {})
    c = profile.get('camera', {})
    if c.get('projection') == 'perspective' and (not finite(c.get('fovDegrees')) or not 0 < c['fovDegrees'] < 180):
        errors.append('perspective camera.fovDegrees must be between 0 and 180')
    if c.get('projection') == 'orthographic':
        if not all(finite(c.get(k)) for k in ('left','right','top','bottom')) or c.get('left',0) >= c.get('right',0) or c.get('bottom',0) >= c.get('top',0):
            errors.append('orthographic camera requires ordered left/right/top/bottom bounds')
    b = profile.get('background', {})
    if b.get('kind') == 'solid' and not re.fullmatch(r'#[0-9a-fA-F]{6}', str(b.get('color',''))):
        errors.append('solid background requires #RRGGBB')
    if 'alpha' in b and (not finite(b['alpha']) or not 0 <= b['alpha'] <= 1): errors.append('background.alpha must be 0..1')
    env = profile.get('environment', {})
    if env.get('kind') != 'none' and not env.get('source'): errors.append('environment source is required')
    regions = profile.get('regions', [])
    colors = []
    for region in regions:
        color = region.get('idColor')
        if not isinstance(color, list) or len(color) != 3 or any(type(n) is not int or not 0 <= n <= 255 for n in color):
            errors.append(f'region {region.get("id")} requires RGB byte idColor')
        else: colors.append(tuple(color))
    if len(set(colors)) != len(colors): errors.append('semantic colors must be unique')
    if len(regions) > 65535: errors.append('region ID encoding supports at most 65535 regions')
    result['passed'] = not errors
    result['nativeMapping'] = {'toneMapping': {'NoToneMapping':'disabled','ACESFilmicToneMapping':'source-ACES-exposure-divided-by-0.6','NeutralToneMapping':'source-Neutral','AgXToneMapping':'source-AgX'}.get(r.get('toneMapping')), 'coordinateFrame':'source-rh (H_Z in LH scenes)','exactSrgbRequired':True,'workingColorSpace':'Linear-sRGB', 'roughnessMaterialId':'R=perceptual roughness,G=ID high byte,B=ID low byte; ID=sorted region index+1', 'environment':'Babylon HDRFiltering IBL; PMREM sampling differences require pixel tolerances'}
    return result


def validate_file(path: Path) -> dict:
    try:
        profile = json.loads(path.read_text())
        if not isinstance(profile, dict): raise ValueError('profile root must be object')
        return validate_profile(profile)
    except (ValueError, OSError, TypeError, KeyError, AttributeError) as exc:
        return {'passed':False,'errors':[str(exc)],'warnings':[]}

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('profile',type=Path)
    result=validate_file(parser.parse_args().profile)
    print(json.dumps(result,indent=2));raise SystemExit(0 if result['passed'] else 1)
