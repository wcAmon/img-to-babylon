"""Executable native Babylon capsule gate; stdlib, existing local Node deps only."""
import inspect
import json
import math
from pathlib import Path
import re
import struct
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'pipeline/forge'))
from stage5_rig.emit_babylon_rig import emit_typescript
from stage5_rig.emit_rig import emit_typescript as source_emit
from stage5_rig.rig_spec import BoneSpec, RigSpec, derive_envelope_radius
from stage5_rig.validate_rig_payload import validate


def fixture(n=3, direction=-1, offset=0):
    return RigSpec('1.0', 'T', '+Z', [
        BoneSpec(f'b{i}', None if i == 0 else f'b{i-1}', (0, offset + direction*i, 0),
                 'arm', 'skinned', 'arm',
                 tip_pos=(0, offset+direction*(i+0.4), 0) if i == n-1 else None)
        for i in range(n)])


def f32(value):
    return struct.unpack('f', struct.pack('f', value))[0]


class BabylonRig(unittest.TestCase):
    def run_rig(self, spec, extents=None, **options):
        extents = extents or {'arm': (0.6, 0.6)}
        args = dict(spec=spec, component_extents=extents, capsule_radius=0.3, **options)
        emitted = emit_typescript(**args)
        self.assertEqual(emitted, emit_typescript(**args))
        self.assertNotIn("from 'three'", emitted)
        # Numeric constants are derived from exactly the existing Python emitter inputs.
        source = source_emit(**args)
        constants = {}
        for name in ['BONE_IDS', 'PARENT', 'JOINT_POS', 'TIP_POS', 'ENVELOPE_RADIUS',
                     'OVERLAP_FACTOR', 'CAPSULE_RADIUS', 'CAPSULE_CYL_LENGTH', 'CAPSULE_CENTER_Y',
                     'CAP_SEGMENTS', 'RADIAL_SEGMENTS', 'HEIGHT_SEGMENTS']:
            read = lambda text: json.loads(re.search(r'const '+name+r'(?:\s*:[^=]+)? = (.*);', text)[1])
            self.assertEqual(read(emitted), read(source), name)
            constants[name] = read(source)
        scratch = ROOT / '.img2babylon/cli/rig-port'
        scratch.mkdir(parents=True, exist_ok=True)
        deps = scratch / 'node_modules'
        if not deps.exists():
            deps.symlink_to(ROOT / 'viewer/node_modules', target_is_directory=True)
        entry, result = scratch / 'emitted.mts', scratch / 'result.json'
        entry.write_text(emitted)
        if result.exists():
            result.unlink()
        proc = subprocess.run(['node', '--import', str(ROOT / 'viewer/node_modules/tsx/dist/loader.mjs'),
                               str(ROOT / 'viewer/scripts/rig_babylon_test.ts'), str(entry), str(result)],
                              capture_output=True, text=True, timeout=90, cwd=ROOT / 'viewer')
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        data = json.loads(result.read_text())
        print(proc.stdout.strip())
        # Independently sample the source capsule formula, including its two
        # Float32 quantizations around translation. Verify every runtime vertex.
        r, length = constants['CAPSULE_RADIUS'], constants['CAPSULE_CYL_LENGTH']
        cap, radial, height = (constants[k] for k in ['CAP_SEGMENTS', 'RADIAL_SEGMENTS', 'HEIGHT_SEGMENTS'])
        cy = constants['CAPSULE_CENTER_Y']
        expected_positions = [0, f32(f32(-length/2-r)+cy), 0]
        rings = []
        for k in range(1, cap+1):
            phi = math.pi/2*k/cap
            rings.append((r*math.sin(phi), -length/2-r*math.cos(phi)))
        rings.extend((r, -length/2+length*k/height) for k in range(1,height+1))
        for k in range(cap-1,0,-1):
            phi = math.pi/2*k/cap
            rings.append((r*math.sin(phi), length/2+r*math.cos(phi)))
        for radius, y in rings:
            for k in range(radial):
                theta = k/radial*math.pi*2
                expected_positions.extend([f32(radius*math.cos(theta)), f32(f32(y)+cy), f32(radius*math.sin(theta))])
        expected_positions.extend([0, f32(f32(length/2+r)+cy), 0])
        self.assertEqual(len(data['positions']), len(expected_positions))
        for a,b in zip(data['positions'], expected_positions):
            self.assertAlmostEqual(a,b,delta=1e-7)
        self.assertEqual(len(data['indices'])//3, 2*radial*len(rings))
        ids = [b.id for b in spec.bones]
        tips = spec.resolve_tip_positions()
        fallback = []
        for v in range(len(data['positions'])//3):
            point = data['positions'][v*3:v*3+3]
            distances = []
            for bone in spec.bones:
                start, end = bone.joint_pos, tips[bone.id]
                ab = [end[k]-start[k] for k in range(3)]
                denom = sum(x*x for x in ab)
                t = max(0, min(1, sum((point[k]-start[k])*ab[k] for k in range(3))/denom)) if denom > 1e-12 else 0
                distances.append(math.dist(point, [start[k]+t*ab[k] for k in range(3)]))
            raw = [max(0, 1-(d/derive_envelope_radius(*extents[b.component], options.get('overlap_factor', 1.2)))**2)**2
                   for d, b in zip(distances, spec.bones)]
            kept = sorted(range(len(ids)), key=lambda i: -raw[i])[:4]
            total = sum(raw[i] for i in kept)
            if total:
                expected_i = kept + [0]*(4-len(kept))
                expected_w = [f32(raw[i]/total) for i in kept] + [0]*(4-len(kept))
            else:
                fallback.append(v)
                expected_i = [min(range(len(ids)), key=lambda i: distances[i]), 0, 0, 0]
                expected_w = [1, 0, 0, 0]
            self.assertEqual(data['skinIndices'][v*4:v*4+4], expected_i)
            for a, b in zip(data['skinWeights'][v*4:v*4+4], expected_w):
                self.assertAlmostEqual(a, b, delta=1e-7)
        self.assertEqual(data['meta']['fallbackVertices'], fallback)
        # Convert Babylon column-major arrays to payload validator row-major convention.
        order = sorted(range(len(ids)), key=lambda i: int(ids[i][1:]))
        remap = {old: new for new, old in enumerate(order)}
        matrices = []
        for i, bone in enumerate(spec.bones):
            parent = spec.bone_by_id().get(bone.parent)
            translation = [bone.joint_pos[k] - (parent.joint_pos[k] if parent else 0) for k in range(3)]
            expected = [1,0,0,0, 0,1,0,0, 0,0,1,0, *translation,1]
            for a, b in zip(data['localMatrices'][i], expected):
                self.assertAlmostEqual(a,b,delta=1e-6)
            for k in range(3):
                self.assertAlmostEqual(data['inverseMatrices'][i][12+k], -bone.joint_pos[k], delta=1e-6)
            m = data['localMatrices'][i]
            matrices.append([m[c*4+r] for r in range(4) for c in range(4)])
        payload = dict(schemaVersion=1, coordinateSystem=dict(up='Y', handedness='right', unit='m'),
                       joints=[list(spec.bones[i].joint_pos) for i in order], names=[ids[i] for i in order],
                       parents=[None if spec.bones[i].parent is None else remap[ids.index(spec.bones[i].parent)] for i in order],
                       matrix_local=[matrices[i] for i in order],
                       skinIndex=[[remap[int(x)] for x in data['skinIndices'][v:v+4]] for v in range(0,len(data['skinIndices']),4)],
                       skinWeight=[data['skinWeights'][v:v+4] for v in range(0,len(data['skinWeights']),4)])
        self.assertTrue(validate(payload)['passed'], validate(payload))
        return data

    def test_signature(self):
        self.assertEqual(inspect.signature(emit_typescript), inspect.signature(source_emit))

    def test_three_bone_default_and_blending(self):
        data = self.run_rig(fixture())
        self.assertTrue(all(p['moved'] > 0 for p in data['poses']))
        self.assertGreater(data['poses'][1]['blended'], 0)
        self.assertEqual(data['meta']['fallbackVertices'], [])

    def test_upwards_offset_unsorted_chain_top_four(self):
        spec = fixture(6, 1, 2)
        spec.bones.reverse()
        data = self.run_rig(spec, {'arm': (8, 7)}, height_segments=20, cap_segments=4, radial_segments=8)
        self.assertTrue(any(all(w > 0 for w in data['skinWeights'][i:i+4]) for i in range(0,len(data['skinWeights']),4)))

    def test_nearest_fallback(self):
        data = self.run_rig(fixture(), {'arm': (0.1,0.1)}, height_segments=10)
        self.assertGreater(len(data['meta']['fallbackVertices']),0)
        self.assertTrue(any(data['skinIndices'][v*4] != 0 for v in data['meta']['fallbackVertices']))

    def test_source_rejections_and_invalid_parameters(self):
        cases = []
        spec = fixture(); spec.bones[-1].tip_pos = None; cases.append(spec)
        spec = fixture(); spec.bones[1].joint_pos = (1,-1,0); cases.append(spec)
        spec = fixture(); spec.bones[1].component = 'missing'; cases.append(spec)
        spec = fixture(); spec.bones[1].component = None; cases.append(spec)
        spec = fixture(); spec.bones[0].tip_pos = (0,-1,0); spec.bones[-1].parent = 'b0'; spec.bones[1].tip_pos = (0,-1.5,0); cases.append(spec)
        for spec in cases:
            for emitter in (emit_typescript, source_emit):
                with self.assertRaises(ValueError): emitter(spec, {'arm':(0.6,0.6)},0.3)
        for options in [dict(cap_segments=0),dict(radial_segments=2),dict(height_segments=0),dict(overlap_factor=float('nan'))]:
            with self.assertRaises(ValueError): emit_typescript(fixture(), {'arm':(0.6,0.6)},0.3,**options)
        spec=fixture(); spec.bones[-1].parent='b2'
        with self.assertRaises(ValueError): emit_typescript(spec, {'arm':(0.6,0.6)},0.3)


if __name__ == '__main__':
    unittest.main()
