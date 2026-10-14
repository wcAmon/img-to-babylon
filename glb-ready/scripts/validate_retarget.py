#!/usr/bin/env python3
"""validate_retarget.py — prove a retargeted clip GLB kept the base skin and matches the source motion.

Usage: python3 glb-ready/scripts/validate_retarget.py base.glb clip.glb [more.glb ...] [--source source.glb] [--max-fk-deg 0.1] [--json]
Checks: mesh attributes and indices identical to base; inverseBindMatrices and joint names identical; <= 64 joints;
weights sum to 1 (1e-5); with --source, forward kinematics of the Mixamo segments differ by <= --max-fk-deg.
Exit 0 ok, 1 problems, 2 unreadable input. Python 3.9+ stdlib only.
"""
from __future__ import annotations
import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import glb_audit  # noqa: E402

SEGMENTS = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head',
            'LeftShoulder': 'LeftArm', 'LeftArm': 'LeftForeArm', 'LeftForeArm': 'LeftHand',
            'RightShoulder': 'RightArm', 'RightArm': 'RightForeArm', 'RightForeArm': 'RightHand',
            'LeftUpLeg': 'LeftLeg', 'LeftLeg': 'LeftFoot', 'LeftFoot': 'LeftToeBase',
            'RightUpLeg': 'RightLeg', 'RightLeg': 'RightFoot', 'RightFoot': 'RightToeBase'}


def joint_suffix(name):
    return (name or '').split(':')[-1]


class Rig:
    def __init__(self, path):
        self.path = Path(path)
        self.doc, self.bin = glb_audit.read_glb(path)
        self.nodes = self.doc.get('nodes', [])
        self.parent = {c: i for i, n in enumerate(self.nodes) for c in n.get('children', [])}
        self.by_suffix = {}
        for i, n in enumerate(self.nodes):
            self.by_suffix.setdefault(joint_suffix(n.get('name')), i)

    def values(self, index):
        return glb_audit.accessor_values(self.doc, self.bin, index)

    def prims(self):
        return [p for m in self.doc.get('meshes', []) for p in m.get('primitives', [])]

    def world_at(self, anim, time):
        """World matrices with the given animation's channels evaluated at `time` (nearest keyframe)."""
        local = {}
        for ch in anim.get('channels', []):
            path = ch['target']['path']
            if path == 'weights' or 'node' not in ch['target']:
                continue
            sampler = anim['samplers'][ch['sampler']]
            times = [t[0] for t in self.values(sampler['input'])]
            outputs = self.values(sampler['output'])
            k = min(range(len(times)), key=lambda i: abs(times[i] - time))
            value = outputs[k]
            if sampler.get('interpolation') == 'CUBICSPLINE':
                value = outputs[k * 3 + 1]
            local.setdefault(ch['target']['node'], {})[path] = list(value)
        world = {}

        def matrix(i):
            if i in world:
                return world[i]
            node = dict(self.nodes[i])
            if i in local:
                node.pop('matrix', None); node.update(local[i])
            m = glb_audit._node_local(node)
            world[i] = glb_audit._mat_mul(matrix(self.parent[i]), m) if i in self.parent else m
            return world[i]
        for i in range(len(self.nodes)):
            matrix(i)
        return world


def compare_skin(base, clip):
    problems = []
    bp, cp = base.prims(), clip.prims()
    if len(bp) != len(cp):
        return ['primitive count differs (%d vs %d)' % (len(bp), len(cp))]
    for i, (b, c) in enumerate(zip(bp, cp)):
        if set(b['attributes']) != set(c['attributes']):
            problems.append('primitive %d attribute set differs' % i); continue
        for key in b['attributes']:
            if base.values(b['attributes'][key]) != clip.values(c['attributes'][key]):
                problems.append('primitive %d %s data differs from base' % (i, key))
        if ('indices' in b) != ('indices' in c) or ('indices' in b and base.values(b['indices']) != clip.values(c['indices'])):
            problems.append('primitive %d indices differ from base' % i)
        if 'WEIGHTS_0' in c['attributes']:
            sums = [sum(r) for r in clip.values(c['attributes']['WEIGHTS_0'])]
            if 'WEIGHTS_1' in c['attributes']:
                sums = [s + sum(r) for s, r in zip(sums, clip.values(c['attributes']['WEIGHTS_1']))]
            worst = max(abs(s - 1.0) for s in sums) if sums else 0.0
            if worst > 1e-5:
                problems.append('primitive %d skin weights do not sum to 1 (max error %.2e)' % (i, worst))
    bs, cs = base.doc.get('skins', []), clip.doc.get('skins', [])
    if len(bs) != len(cs):
        problems.append('skin count differs (%d vs %d)' % (len(bs), len(cs)))
    for i, (b, c) in enumerate(zip(bs, cs)):
        bn = [joint_suffix(base.nodes[j].get('name')) for j in b['joints']]
        cn = [joint_suffix(clip.nodes[j].get('name')) for j in c['joints']]
        if bn != cn:
            problems.append('skin %d joint names differ from base' % i)
        if len(c['joints']) > 64:
            problems.append('skin %d has %d joints (> 64)' % (i, len(c['joints'])))
        if ('inverseBindMatrices' in b) != ('inverseBindMatrices' in c):
            problems.append('skin %d inverseBindMatrices presence differs' % i)
        elif 'inverseBindMatrices' in b:
            for bm, cm in zip(base.values(b['inverseBindMatrices']), clip.values(c['inverseBindMatrices'])):
                if max(abs(x - y) for x, y in zip(bm, cm)) > 1e-6:
                    problems.append('skin %d inverseBindMatrices differ from base' % i); break
    return problems


def _angle(a, b):
    la = math.sqrt(sum(v * v for v in a)); lb = math.sqrt(sum(v * v for v in b))
    if la < 1e-12 or lb < 1e-12:
        return 0.0
    cos = max(-1.0, min(1.0, sum(x * y for x, y in zip(a, b)) / (la * lb)))
    return math.degrees(math.acos(cos))


def fk_error_degrees(clip, source, segments=SEGMENTS):
    results = {}
    source_anims = {a.get('name', 'animation-%d' % i): a for i, a in enumerate(source.doc.get('animations', []))}
    for i, anim in enumerate(clip.doc.get('animations', [])):
        name = anim.get('name', 'animation-%d' % i)
        src = source_anims.get(name) or (next(iter(source_anims.values())) if len(source_anims) == 1 else None)
        if src is None:
            results[name] = float('inf'); continue
        times = sorted({t[0] for s in anim['samplers'] for t in clip.values(s['input'])})
        worst = 0.0
        for t in times:
            cw, sw = clip.world_at(anim, t), source.world_at(src, t)
            for joint, child in segments.items():
                if joint in clip.by_suffix and child in clip.by_suffix and joint in source.by_suffix and child in source.by_suffix:
                    a = [cw[clip.by_suffix[child]][12 + k] - cw[clip.by_suffix[joint]][12 + k] for k in range(3)]
                    b = [sw[source.by_suffix[child]][12 + k] - sw[source.by_suffix[joint]][12 + k] for k in range(3)]
                    worst = max(worst, _angle(a, b))
        results[name] = worst
    return results


def validate(base_path, clip_paths, source_path, max_deg):
    base = Rig(base_path)
    source = Rig(source_path) if source_path else None
    report = {'base': str(base_path), 'clips': [], 'problems': []}
    for path in clip_paths:
        clip = Rig(path)
        problems = ['%s: %s' % (Path(path).name, p) for p in compare_skin(base, clip)]
        entry = {'file': str(path), 'animations': glb_audit.inspect(clip.doc, clip.bin, path)['animations'], 'fkMaxDegrees': {}}
        if source is not None:
            entry['fkMaxDegrees'] = fk_error_degrees(clip, source)
            for name, deg in entry['fkMaxDegrees'].items():
                if deg > max_deg:
                    problems.append('%s: FK error %.4f deg in clip %r exceeds %.4f' % (Path(path).name, deg, name, max_deg))
        report['clips'].append(entry); report['problems'].extend(problems)
    report['ok'] = not report['problems']
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('base'); parser.add_argument('clips', nargs='+')
    parser.add_argument('--source'); parser.add_argument('--max-fk-deg', type=float, default=0.1); parser.add_argument('--json', action='store_true')
    args = parser.parse_args(argv)
    try:
        result = validate(args.base, args.clips, args.source, args.max_fk_deg)
    except (OSError, glb_audit.GlbError, KeyError, IndexError) as exc:
        print('validate_retarget: %s' % exc, file=sys.stderr); return 2
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for c in result['clips']:
            print('%s: %s' % (Path(c['file']).name, ', '.join('%s %.2fs' % (a['name'], a['duration']) for a in c['animations']) or 'no clips'))
            for name, deg in c['fkMaxDegrees'].items():
                print('  FK %r max %.4f deg' % (name, deg))
        for p in result['problems']:
            print('  PROBLEM  ' + p)
        print('OK' if result['ok'] else 'FAILED')
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
