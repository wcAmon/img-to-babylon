import json
from pathlib import Path
D=Path(__file__).resolve().parent;M=D.parents[1]
def load(folder):return {m['componentId']:m for m in json.loads((folder/'native-meshes.json').read_text())['meshes']}
a=load(D.parent/'c1');b=load(D.parent/'c2');old=load(D.parent/'c3');cur=load(D);source=json.loads((M/'spec.json').read_text());hair=[c['id'] for c in source['componentTree'] if c['group']=='hair'];keys=['vertices','positions','normals','worldNormals','indices','worldMatrix']
def compare(x,y):return {k:x.get(k)==y.get(k) for k in keys}
report={'headVsC1':compare(cur['head'],a['head']),'hairVsC2':{cid:compare(cur[cid],b[cid]) for cid in hair},'browRecipes':'C2 authored brow geometry retained; projected surface necessarily follows restored C1 head','all125IDs':set(cur)==set(a)==set(b),'bodyVsC3':{cid:compare(m,old[cid]) for cid,m in cur.items() if cid not in hair and cid not in [c['id'] for c in source['componentTree'] if c['parent']=='head'] and cid!='head'}}
report['exactHeadPass']=all(report['headVsC1'].values());report['exactHairPass']=all(all(v.values()) for v in report['hairVsC2'].values());(D/'parity.json').write_text(json.dumps(report,indent=2)+'\n');print('head exact',report['exactHeadPass'],'hair exact',report['exactHairPass']);print([(cid,k) for cid,v in report['hairVsC2'].items() for k,ok in v.items() if not ok])
changes=json.loads((D/'changes.json').read_text());actual=[cid for cid,m in cur.items() if any(m.get(k)!=old[cid].get(k) for k in keys)];changes.update(changedPartIDs=actual,dependentGeometryChanges=[cid for cid in actual if cid!='head'],actualUnchangedMeshCount=125-len(actual));(D/'changes.json').write_text(json.dumps(changes,indent=2)+'\n')
