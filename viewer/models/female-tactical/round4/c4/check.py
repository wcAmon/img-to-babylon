import json,sys,math
from pathlib import Path
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2]
sys.path.insert(0,str(ROOT/'pipeline/forge/_shared'));sys.path.insert(0,str(ROOT/'pipeline/forge/stage4_review'))
from scalp_field import ScalpField
from scalp_exposure import scalp_exposure
s=json.loads((M/'spec.json').read_text());by={c['id']:c for c in s['componentTree']};meshes=json.loads((D/'native-meshes.json').read_text())['meshes']; head=by['head'];dim=head['dimensions'];origin=head['transform']['position']
field=ScalpField([[r[0]*dim['h'],r[1]*dim['w'],r[2]*dim['d'],r[4]*dim['d']] for r in head['geometry']['rings']])
points=[];clearance=[];checks=[]
for m in meshes:
 cid=m['componentId'];vs=m['vertices'];ix=m['indices'];deg=bad=0
 for j in range(0,len(ix),3):
  a,b,c=[vs[i] for i in ix[j:j+3]];u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
  deg+=sum(x*x for x in n)<1e-24
  bad+=sum(n[k]*sum(m['normals'][q][k] for q in ix[j:j+3]) for k in range(3)) < -1e-12
 checks.append({'id':cid,'degenerateTriangles':deg,'normalDisagreements':bad,'triangles':len(ix)//3})
 if by[cid]['group']=='hair' and cid!='hair-tie':
  ps=[[v[0]-origin[0],v[1]-origin[1],-v[2]-origin[2]] for v in vs];points.extend(ps)
  distances=[field.distance(*v) for v in ps]
  clearance.append({'id':cid,'minimumApproxSignedClearance':min(distances),'insideSkullPointCount':sum(v<-.0001 for v in distances),'pointCount':len(ps),'rootBinding':by[cid].get('hairRootBinding'),'capInsteadOfLock':cid=='hair-cap'})
scalp=scalp_exposure(field,points,v_range=(.72,1),u_samples=48,v_samples=24)
scalp['scope']='Above front hairline crown band only, actual native GPU-independent geometry; all-azimuth point coverage; silhouette and side hairline require images.'
(D/'scalp.json').write_text(json.dumps(scalp,indent=2)+'\n')
(D/'geometry.json').write_text(json.dumps({'partCount':len(meshes),'expectedPartCount':125,'noAddedOrDeletedIDs':{m['componentId'] for m in meshes}==set(by),'checks':checks,'hairClearance':clearance,'scalpExposure':scalp['exposedFraction'],'visualAcceptance':False},indent=2)+'\n')
print(json.dumps({'scalp':scalp['exposedFraction'],'defects':[c for c in checks if c['degenerateTriangles'] or c['normalDisagreements']],'hairPenetrations':[c for c in clearance if c['insideSkullPointCount']]}))
