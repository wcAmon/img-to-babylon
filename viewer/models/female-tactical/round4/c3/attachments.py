"""Actual c3 native geometry: full authored hairline coverage and cap-root distance."""
import json,math,sys
from pathlib import Path
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2]
sys.path.insert(0,str(ROOT/'pipeline/forge/_shared'));sys.path.insert(0,str(ROOT/'pipeline/forge/stage4_review'))
from scalp_field import ScalpField
from scalp_exposure import _PointGrid
s=json.loads((M/'spec.json').read_text());by={c['id']:c for c in s['componentTree']};raw=json.loads((D/'native-meshes.json').read_text());meshes={m['componentId']:m for m in raw['meshes']};h=by['head'];dim=h['dimensions'];origin=h['transform']['position'];field=ScalpField([[r[0]*dim['h'],r[1]*dim['w'],r[2]*dim['d'],r[4]*dim['d']] for r in h['geometry']['rings']])
def local(v):return [v[0]-origin[0],v[1]-origin[1],-v[2]-origin[2]]
def sub(a,b):return [x-y for x,y in zip(a,b)]
def add(a,b):return [x+y for x,y in zip(a,b)]
def scale(a,s):return [x*s for x in a]
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def dist2(p,a,b,c):
 ab=sub(b,a);ac=sub(c,a);ap=sub(p,a);d1=dot(ab,ap);d2=dot(ac,ap)
 if d1<=0 and d2<=0:return dot(ap,ap)
 bp=sub(p,b);d3=dot(ab,bp);d4=dot(ac,bp)
 if d3>=0 and d4<=d3:return dot(bp,bp)
 vc=d1*d4-d3*d2
 if vc<=0 and d1>=0 and d3<=0:q=add(a,scale(ab,d1/(d1-d3)));return dot(sub(p,q),sub(p,q))
 cp=sub(p,c);d5=dot(ab,cp);d6=dot(ac,cp)
 if d6>=0 and d5<=d6:return dot(cp,cp)
 vb=d5*d2-d1*d6
 if vb<=0 and d2>=0 and d6<=0:q=add(a,scale(ac,d2/(d2-d6)));return dot(sub(p,q),sub(p,q))
 va=d3*d6-d5*d4
 if va<=0 and d4-d3>=0 and d5-d6>=0:q=add(b,scale(sub(c,b),(d4-d3)/((d4-d3)+(d5-d6))));return dot(sub(p,q),sub(p,q))
 denom=1/(va+vb+vc);q=add(a,add(scale(ab,vb*denom),scale(ac,vc*denom)));return dot(sub(p,q),sub(p,q))
cap=meshes['hair-cap'];cv=[local(v) for v in cap['vertices']];tri=[[cv[q] for q in cap['indices'][j:j+3]] for j in range(0,len(cap['indices']),3)]
points=[];roots=[];intrusions=[]
for cid,c in by.items():
 if c['group']!='hair' or cid=='hair-tie':continue
 vs=[local(v) for v in meshes[cid]['vertices']];points.extend(vs);r=c['geometry'].get('nativeRecipe',{})
 if 'lock' not in r.get('kind',''):continue
 n=r['radialSegments'];center=[sum(p[k] for p in vs[:n])/n for k in range(3)];nearest=math.sqrt(min(dist2(center,*t) for t in tri));rootRadius=.72*r['thickness']*.5
 roots.append({'id':cid,'actualRootCenter':center,'distanceToActualCapTriangles':nearest,'rootHalfThickness':rootRadius,'rootEnvelopeGap':max(0,nearest-rootRadius),'attachedWithin2mm':nearest-rootRadius<=.002})
 # Exact local root-zone exception only: first two curve rings and duplicated start-cap ring.
 rootIndices=set(range(n*2))|set(range((r['samples']+1)*n,(r['samples']+2)*n+1))
 inside=[i for i,p in enumerate(vs) if field.distance(*p)<-.0001]
 intrusions.append({'id':cid,'embeddedRootPoints':sum(i in rootIndices for i in inside),'nonRootInsideSkullPoints':[i for i in inside if i not in rootIndices],'rootException':'Only first two authored root rings + duplicated root cap; posterior root seating or scalp lock embedding; no whole-hair exemption.'})
outside=[p for p in points if field.distance(*p)>0];lateral=.075*dim['h'];reach=.22*dim['h'];grid=_PointGrid(outside,lateral);total=exposed=0;samples=0;miss=[];profile=by['hair-cap']['geometry']['nativeRecipe']['hairline']
for sample in field.surface_samples(48,40):
 u=sample['u'];v=sample['v'];front=max(0,math.sin(2*math.pi*u));back=max(0,-math.sin(2*math.pi*u));low=profile['sideV']+(profile['frontV']-profile['sideV'])*front**2+(profile['rearV']-profile['sideV'])*back**2+.025*front*math.cos(2*math.pi*u)
 if v<low and not sample['cap']:continue
 samples+=1;total+=sample['weight'];covered=False
 for j in range(6):
  q=add(sample['point'],scale(sample['normal'],reach*j/5))
  if any(dot(sub(p,q),sub(p,q))<=lateral*lateral for p in grid.near(q)):covered=True;break
 if not covered:exposed+=sample['weight'];miss.append({'u':u,'v':v})
result={'actualNativeGeometry':True,'coverageDomain':'Full variable hairline: front .72, sides .49, rear .23; crown disc included. Inferred rear coverage, not reference likeness.','sampleCount':samples,'exposedAreaFraction':exposed/total,'hardMax':.05,'coveragePass':exposed/total<=.05,'rootContacts':roots,'rootPass':all(r['attachedWithin2mm'] for r in roots),'intrusions':intrusions,'clearancePass':all(not r['nonRootInsideSkullPoints'] for r in intrusions),'exposedSamples':miss,'visualAcceptance':False}
(D/'attachments.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['sampleCount','exposedAreaFraction','coveragePass','rootPass','clearancePass']}));print('root gaps',[(r['id'],round(r['rootEnvelopeGap'],5)) for r in roots])
# Limit self-test to changed closed volumetric parts. Open overlay domain separately recorded.
changed=set(json.loads((D/'changes.json').read_text())['changedPartIDs']);selected=[m for m in raw['meshes'] if m['componentId'] in changed and by[m['componentId']]['geometry']['kind']!='patch']
(D/'changed-closed-meshes.json').write_text(json.dumps({**raw,'meshes':selected})+'\n')
(D/'audit-scope.json').write_text(json.dumps({'selected':[m['componentId'] for m in selected],'unchangedNotReaudited':[m['componentId'] for m in raw['meshes'] if m['componentId'] not in changed],'openSurfacesNotClosedVolumeTests':[cid for cid in changed if by[cid]['geometry']['kind']=='patch'],'previousFailuresPreserved':['../native-audit/audit.json','../c2/audit/audit.json','../c2/audit-final/audit.json'],'boundary':'No blanket contact exemptions or full-assembly penetration pass; this is changed closed-part self-intersection only.'},indent=2)+'\n')
