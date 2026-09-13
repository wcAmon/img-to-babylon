#!/usr/bin/env python3
"""Bounded native numeric audit, not visual/UV/production acceptance. Stdlib only."""
import argparse
import json
import math
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'pipeline/forge/stage4_review'))
from geometry_integrity import mesh_edge_counts


def positive(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError('must be positive')
    return number


def execute(command, timeout, parse=True):
    record = {'command': [str(x) for x in command], 'exitStatus': None, 'status': 'error'}
    try:
        process = subprocess.run(record['command'], cwd=ROOT, capture_output=True, text=True, timeout=timeout)
        record.update(exitStatus=process.returncode, stdout=process.stdout, stderr=process.stderr)
        record['status'] = {0: 'passed', 1: 'failed'}.get(process.returncode, 'error')
        if parse:
            record['result'] = json.loads(process.stdout)
    except subprocess.TimeoutExpired as exc:
        record.update(status='error', error=str(exc), timedOut=True, stdout=exc.stdout.decode(errors='replace') if isinstance(exc.stdout, bytes) else exc.stdout, stderr=exc.stderr.decode(errors='replace') if isinstance(exc.stderr, bytes) else exc.stderr)
    except Exception as exc:
        record.update(status='error', error=str(exc))
    return record


def validate(payload):
    if payload.get('coordinateFrame') != {'handedness': 'right', 'up': 'y', 'units': 'metres'}:
        raise ValueError('gates require canonical RH Y-up metres')
    meshes = payload.get('meshes')
    if not isinstance(meshes, list) or not meshes:
        raise ValueError('no selected meshes')
    names = set()
    for mesh in meshes:
        name = mesh['name']
        if not isinstance(name, str) or not name or name in names:
            raise ValueError('missing/duplicate placement name')
        names.add(name)
        vertices, indices, normals = mesh['vertices'], mesh['indices'], mesh['normals']
        if not vertices or not indices or len(indices) % 3 or len(normals) != len(vertices):
            raise ValueError(f'{name}: incomplete geometry')
        if any(len(v) != 3 or any(not isinstance(x, (int, float)) or not math.isfinite(x) for x in v) for v in vertices + normals):
            raise ValueError(f'{name}: invalid vectors')
        if any(type(i) is not int or i < 0 or i >= len(vertices) for i in indices):
            raise ValueError(f'{name}: invalid indices')
    return meshes


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument('--model', help='registered factory ID; default sample-crate')
    source.add_argument('--input', type=Path, help='replay a canonical exported payload; no factory export in this mode')
    parser.add_argument('--out-dir', type=Path, required=True)
    parser.add_argument('--include', help='component ID regex (factory export only)')
    parser.add_argument('--max-samples', type=positive, required=True, help='upstream per-mesh/per-direction sample bound')
    parser.add_argument('--allow', action='append', default=[], help='intentional penetration exemption: component-or-placement,component-or-placement')
    parser.add_argument('--unwrap-plan', action='store_true', help='NEW unwrap planning separately for every selected placement; never authored UV verification')
    parser.add_argument('--timeout', type=positive, default=120, help='seconds per subprocess')
    parser.add_argument('--node', default='node', help='Node executable')
    args = parser.parse_args(argv)
    if args.input and args.include:
        parser.error('--include requires factory export; replay input must already be selected')
    out = args.out_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    report = {'schemaVersion': 1, 'scope': 'bounded numeric geometry audit; no production acceptance',
              'maxSamples': args.max_samples, 'status': 'error', 'gates': {},
              'authoredUVVerification': {'status': 'unassessed', 'reason': 'source uv_unwrap creates NEW UVs and wrapper reads only first mesh'},
              'unassessed': ['quality', 'anatomy', 'camera', 'pixels', 'materials/textures', 'canonical intake and strict production gates'],
              'unwrapPlanning': []}
    gates = report['gates']
    for name in ('export', 'selfIntersection', 'penetration'):
        gates[name] = {'status': 'unrun', 'exitStatus': None}
    try:
        meshfile = out / 'meshes.json'
        if args.input:
            payload = json.loads(args.input.read_text())
            gates['export'] = {'status': 'replayed', 'exitStatus': None, 'source': str(args.input.resolve()), 'reason': 'explicit replay; exporter not executed'}
        else:
            if meshfile.exists():
                meshfile.unlink()
            command = [args.node, '--import', ROOT / 'viewer/node_modules/tsx/dist/loader.mjs', ROOT / 'viewer/scripts/export_pipeline_mesh.ts', '--model', args.model or 'sample-crate', '--out', meshfile, '--handedness', 'right']
            if args.include is not None:
                command += ['--include', args.include]
            gates['export'] = execute(command, args.timeout, parse=False)
            if gates['export']['status'] != 'passed':
                raise ValueError('export did not complete')
            payload = json.loads(meshfile.read_text())
        meshes = validate(payload)
        meshfile.write_text(json.dumps(payload))
        topology = {m['name']: mesh_edge_counts(m['vertices'], m['indices']) for m in meshes}
        unsupported = [m['name'] for m in meshes if topology[m['name']]['boundaryEdges'] or topology[m['name']]['nonManifoldEdges'] or m.get('zeroNormals') or m.get('baseWindingInconsistentTriangles') or any(sum(x*x for x in n) < 1e-20 for n in m['normals'])]
        report['coverage'] = {'placements': len(meshes), 'vertices': sum(len(m['vertices']) for m in meshes), 'selection': payload.get('selection'), 'topology': topology, 'volumeUnsupported': unsupported,
                              'sampling': 'upstream deterministic stride; bounds per mesh/direction, not an exhaustive triangle collision test',
                              'penetrationPairs': 'all unordered selected pairs except explicit exemptions; disjoint AABBs omitted from upstream result.pairs'}
        allowed = []
        for pair in args.allow:
            tokens = pair.split(',')
            if len(tokens) != 2 or tokens[0] == tokens[1]:
                raise ValueError('--allow requires two distinct component/placement IDs')
            groups = [[m['name'] for m in meshes if token in (m['name'], m.get('componentId'))] for token in tokens]
            if not all(groups):
                raise ValueError(f'unknown --allow selection: {pair}')
            allowed.extend(sorted({','.join(sorted((a,b))) for a in groups[0] for b in groups[1] if a != b}))
        report['coverage']['expandedAllowPairs'] = sorted(set(allowed))
        for name, script in [('selfIntersection', 'self_intersection.py'), ('penetration', 'pairwise_penetration.py')]:
            command = [sys.executable, ROOT / 'pipeline/forge/stage4_review' / script, meshfile, '--max-samples', str(args.max_samples), '--json']
            if name == 'penetration':
                for pair in sorted(set(allowed)):
                    command += ['--allow', pair]
            gates[name] = execute(command, args.timeout)
            result = gates[name].get('result', {})
            if not isinstance(result, dict) or result.get('errors') or result.get('skippedMeshes') or result.get('meshCount') != len(meshes):
                gates[name].update(status='error', coverageError='missing/error/skipped mesh coverage')
        uncertain = []
        for name in ('selfIntersection', 'penetration'):
            result = gates[name].get('result', {})
            items = result.get('meshes', []) if name == 'selfIntersection' else result.get('pairs', [])
            for item in items:
                if item.get('undecidedVertexCount') or item.get('degenerateTriangleCount') or item.get('sampledVertexCount', 0) == 0:
                    uncertain.append({'gate': name, 'name': item.get('name'), 'a': item.get('a'), 'b': item.get('b'), 'reason': 'undecided, degenerate or zero-sample coverage'})
        report['coverage']['uncertain'] = uncertain
        if args.unwrap_plan:
            for index, mesh in enumerate(meshes):
                selected = out / f'unwrap-input-{index}.json'
                selected.write_text(json.dumps(mesh))
                item = execute([sys.executable, ROOT / 'pipeline/forge/stage3_build/uv_unwrap.py', selected, '--json'], args.timeout)
                item.update(placement=mesh['name'], purpose='NEW unwrap analysis/planning, not authored UV verification')
                report['unwrapPlanning'].append(item)
        statuses = [gates[n]['status'] for n in ('selfIntersection', 'penetration')] + [p['status'] for p in report['unwrapPlanning']]
        report['status'] = 'error' if any(s in ('error', 'unrun') for s in statuses) else 'failed' if 'failed' in statuses else 'incomplete' if unsupported or uncertain else 'passed'
    except Exception as exc:
        report['error'] = str(exc)
    report['exitStatus'] = {'passed': 0, 'failed': 1}.get(report['status'], 2)
    (out / 'audit.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'status': report['status'], 'report': str(out / 'audit.json')}))
    return report['exitStatus']


if __name__ == '__main__':
    raise SystemExit(main())
