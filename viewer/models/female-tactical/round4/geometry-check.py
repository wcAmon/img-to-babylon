"""Audit actual native factory export, not intended recipe vertices."""
import json, math, sys
from pathlib import Path
D=Path(__file__).resolve().parent; ROOT=D.parents[3]
sys.path.insert(0,str(ROOT/'pipeline/forge/_shared'));sys.path.insert(0,str(ROOT/'pipeline/forge/stage4_review'))
from scalp_field import ScalpField
from scalp_exposure import scalp_exposure
s=json.loads((D.parent/'spec.json').read_text()); exported=json.loads((D/'native-meshes.json').read_text())
head=next(c for c in s['componentTree'] if c['id']=='head'); w,h,d=[head['dimensions'][k] for k in ['w','h','d']]
field=ScalpField([[r[0]*h,r[1]*w,r[2]*d,(r[4] if len(r)>4 else 0)*d] for r in head['geometry']['rings']])
hairids={c['id'] for c in s['componentTree'] if c['group']=='hair' and c['id']!='hair-tie'}; pos=head['transform']['position']
hair=[]
for m in exported['meshes']:
 if m['componentId'] in hairids:
  hair.extend((v[0]-pos[0],v[1]-pos[1],-v[2]-pos[2]) for v in m['vertices'])
result=scalp_exposure(field,hair,v_range=(.72,1),u_samples=48,v_samples=24)
result['scope']='Actual native RH world points converted to head-local LH; above observed crown hairline only. Side/nape silhouette and locks below this band not certified.'
result['rootBindings']=json.loads((D/'hair-roots.json').read_text())
result['unboundLegacyHairIDs']=sorted(hairids-{'hair-cap'}-{b['id'] for b in result['rootBindings']})
(D/'scalp-exposure.json').write_text(json.dumps(result,indent=2)+'\n')
checks=[]
for m in exported['meshes']:
 vs=m['vertices']; ix=m['indices']; deg=0; inward=0
 for j in range(0,len(ix),3):
  a,b,c=[vs[k] for k in ix[j:j+3]]; u=[b[k]-a[k] for k in range(3)]; v=[c[k]-a[k] for k in range(3)]
  cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
  if sum(x*x for x in cross)<1e-20: deg+=1
  if sum(cross[k]*sum(m['normals'][q][k] for q in ix[j:j+3]) for k in range(3)) < -1e-12: inward+=1
 checks.append({'id':m['componentId'],'vertices':len(vs),'triangles':len(ix)//3,'degenerate':deg,'normalDisagreement':inward})
report={'actualNativeFactory':True,'partCount':len(checks),'expected':len(s['componentTree']),'missing':sorted({c['id'] for c in s['componentTree']}-{c['id'] for c in checks}),'checks':checks,'scalpExposedFraction':result['exposedFraction'],'visualAcceptance':False}
(D/'geometry-check.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'parts':len(checks),'scalpExposure':result['exposedFraction'],'scalpPass':result.get('pass',result.get('verdict')),'defects':[c for c in checks if c['degenerate'] or c['normalDisagreement']],'unboundLegacyHairIDs':result['unboundLegacyHairIDs']}))
