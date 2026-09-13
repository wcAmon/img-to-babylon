#!/usr/bin/env python3
"""Report the complete source inventory and native engine boundaries; never infer visual acceptance."""
import argparse,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BOUNDARIES={
 'forge/stage3_build/generate_threejs_factory.py':'forge/stage3_build/generate_babylon_factory.py',
 'forge/stage5_rig/emit_rig.py':'forge/stage5_rig/emit_babylon_rig.py',
 'forge/stage4_review/render_bridge.py':'forge/stage4_review/babylon_render_bridge.py',
 'scripts/capture_threejs_playwright.py':'scripts/capture_babylon_playwright.py',
}
def audit():
 inventory=json.loads((ROOT/'docs/migration/upstream-inventory.json').read_text());entries=[];missing=[]
 for entry in inventory['files']:
  p=ROOT/'pipeline'/entry['path'];exists=p.is_file()
  if not exists:missing.append(entry['path'])
  row=dict(entry,present=exists,unchanged=exists and hashlib.sha256(p.read_bytes()).hexdigest()==entry['sha256'])
  if entry['path'] in BOUNDARIES:
   row.update(nativeRoute=BOUNDARIES[entry['path']],nativePresent=(ROOT/'pipeline'/BOUNDARIES[entry['path']]).is_file())
  entries.append(row)
 return {'sourceCommit':inventory['commit'],'sourceFileCount':len(entries),'missingSourceFiles':missing,'nativeBoundaries':[{ 'source':s,'native':n,'present':(ROOT/'pipeline'/n).is_file()} for s,n in BOUNDARIES.items()], 'files':entries,'acceptance':'Inventory only. Native numerical tests, browser evidence and complete parity review are independently required.'}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',type=Path);args=p.parse_args();result=audit()
 if args.out:args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({k:v for k,v in result.items() if k!='files'},indent=2))
 return 2 if result['missingSourceFiles'] else 0
if __name__=='__main__':raise SystemExit(main())
