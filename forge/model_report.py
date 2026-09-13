#!/usr/bin/env python3
"""Validate persistent component/optimisation metadata and generate a model-local parts catalogue. Stdlib only."""
import argparse
from collections import Counter
import json
import math
from pathlib import Path


def validate(spec, manifest):
    errors=[]
    components={c['id']:c for c in spec['componentTree']}
    if spec['targetName'] != manifest.get('modelId'):
        errors.append('model identity mismatch')
    groups=manifest.get('groups',[])
    ids=[cid for g in groups for cid in g['componentIds']]
    counts=Counter(ids)
    for cid in set(ids) | set(components):
        if cid not in components or counts[cid] != 1:
            errors.append(f'component must be covered exactly once: {cid}')
    group_ids={g['id'] for g in groups}
    for g in groups:
        for cid in g['componentIds']:
            if cid in components and components[cid].get('group') != g['id']:
                errors.append(f'group mismatch: {cid}')
        for anchor in g['anchors']:
            if anchor not in components: errors.append(f'unknown anchor: {anchor}')
    tickets={t['id'] for t in manifest.get('optimizationPath',[])}
    for t in manifest.get('optimizationPath',[]):
        if not t.get('acceptance') or not t.get('edit'): errors.append(f'incomplete optimisation ticket: {t["id"]}')
        for dep in t.get('dependsOn',[]):
            if dep not in tickets or dep == t['id']: errors.append(f'invalid ticket dependency: {dep}')
        for group in t['groups']:
            if group not in group_ids: errors.append(f'unknown optimisation group: {group}')
    for cid,c in components.items():
        geo=c.get('geometry',{})
        for relief in geo.get('relief',[]):
            if (len(relief.get('center',[]))!=2 or len(relief.get('radius',[]))!=2
                or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in relief.get('center',[])+relief.get('radius',[])+[relief.get('depth')])
                or any(v<=0 for v in relief.get('radius',[]))):
                errors.append(f'invalid surface relief: {cid}')
        if geo.get('kind') not in ('box','ellipsoid','loft','patch'): errors.append(f'unknown geometry recipe: {cid}')
        if geo.get('kind') == 'patch':
            points=geo.get('outline',[])
            if len(points)<3 or any(len(p)!=3 or not all(isinstance(x,(int,float)) and math.isfinite(x) for x in p) for p in points):
                errors.append(f'invalid patch outline: {cid}')
        if not c.get('optimization',{}).get('parameterPath'): errors.append(f'missing edit locator: {cid}')
        if c['transform']['scale'] != [1,1,1]: errors.append(f'non-unit component scale: {cid}')
        if geo.get('kind') == 'loft':
            rings=geo.get('rings',[])
            if len(rings)<2 or any(len(r)<3 or not all(isinstance(x,(int,float)) and math.isfinite(x) for x in r) for r in rings):
                errors.append(f'invalid loft rings: {cid}')
            elif any(a[0]>=b[0] for a,b in zip(rings,rings[1:])):
                errors.append(f'loft ring heights must increase: {cid}')
            if not isinstance(geo.get('segments'),int) or geo['segments']<3: errors.append(f'invalid segment count: {cid}')
        seen={cid}; parent=c.get('parent')
        while parent:
            if parent in seen or parent not in components:
                errors.append(f'invalid parent chain: {cid}'); break
            seen.add(parent); parent=components[parent].get('parent')
    return errors


def report(spec, manifest):
    comps={c['id']:c for c in spec['componentTree']}
    lines=[f'# {manifest["modelId"]} — 零件與優化路徑', '',
           f'版本：{manifest["revision"]} · 狀態：{manifest["status"]} · {len(comps)} 個零件', '',
           '尺寸、位置和幾何配方以 `spec.json` 為準；用穩定 id 尋找元件。此表由 `forge/model_report.py` 產生。', '',
           '## 分拆零件', '']
    for g in manifest['groups']:
        lines += [f'### {g["name"]}', '', '| ID | 零件 | 配方 | 尺寸（mm） | 接合父節點 |', '|---|---|---|---|---|']
        for cid in g['componentIds']:
            c=comps[cid];d=c['dimensions'];dims=' × '.join(str(round(d[k]*1000,1)) for k in ('w','h','d'))
            lines.append(f'| `{cid}` | {c["name"]} | {c["geometry"]["kind"]} | {dims} | {c["parent"] or "root"} |')
        lines.append('')
    lines += ['## 優化順序', '']
    for t in manifest['optimizationPath']:
        lines += [f'### {t["priority"]} · {t["title"]}', '', f'狀態：{t["status"]}。影響：{", ".join(t["groups"])}。', '',
                  '修改入口：'+ '; '.join(t['edit']), '', '驗收：'+t['acceptance'], '']
    lines += ['## 物理範圍', '', manifest['physicsStatus']['implemented'], '',
              '尚未實作：'+', '.join(manifest['physicsStatus']['notImplemented']), '', '## 續作', '',
              '```sh', manifest['workflow']['resume'], manifest['workflow']['newRevision'], '```', '', manifest['workflow']['limits'], '']
    return '\n'.join(lines)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('model_dir',type=Path)
    ap.add_argument('--write',action='store_true')
    args=ap.parse_args()
    spec=json.loads((args.model_dir/'spec.json').read_text())
    manifest=json.loads((args.model_dir/'iteration.json').read_text())
    errors=validate(spec,manifest)
    if errors:
        print('\n'.join('FAIL: '+e for e in errors)); return 2
    if args.write: (args.model_dir/'PARTS.md').write_text(report(spec,manifest))
    print(f'OK: {len(spec["componentTree"])} components; {len(manifest["optimizationPath"])} optimisation tickets')
    return 0


if __name__=='__main__': raise SystemExit(main())
