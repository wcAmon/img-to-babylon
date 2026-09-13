"""Actual native triangle interior depth/visibility checks, not screenshot acceptance."""
import json,math
from pathlib import Path
D=Path(__file__).resolve().parent
raw=json.loads((D/'native-meshes.json').read_text());meshes={m['componentId']:m for m in raw['meshes']};cache={}
def surface(cid):
 if cid in cache:return cache[cid]
 m=meshes[cid];vs=[[x,y,-z] for x,y,z in m['vertices']];grid={};cell=.006
 for j in range(0,len(m['indices']),3):
  tri=[vs[k] for k in m['indices'][j:j+3]];a,b,c=tri;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
  if abs(den)<1e-15:continue
  for ix in range(math.floor(min(v[0] for v in tri)/cell),math.floor(max(v[0] for v in tri)/cell)+1):
   for iy in range(math.floor(min(v[1] for v in tri)/cell),math.floor(max(v[1] for v in tri)/cell)+1):grid.setdefault((ix,iy),[]).append((tri,den))
 def sample(x,y,sign=1):
  hits=[]
  for (a,b,c),den in grid.get((math.floor(x/cell),math.floor(y/cell)),[]):
   u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den
   if u>=-1e-7 and v>=-1e-7 and u+v<=1+1e-7:hits.append(u*a[2]+v*b[2]+(1-u-v)*c[2])
  return (max(hits) if sign>0 else min(hits)) if hits else None
 cache[cid]=sample;return sample
s=json.loads((D.parents[1]/'spec.json').read_text());by={c['id']:c for c in s['componentTree']};reports=[]
for cid,c in by.items():
 r=c['geometry'].get('nativeRecipe',{})
 if r.get('kind')!='surface-feature':continue
 support='head'
 for prefix,base in [('iris','eye-white'),('pupil','iris'),('eye-glint','pupil')]:
  if cid.startswith(prefix):support=base+'-'+cid[-1]
 m=meshes[cid];vs=[[x,y,-z] for x,y,z in m['vertices']];depths=[];missing=0
 for j in range(0,len(m['indices']),3):
  tri=[vs[k] for k in m['indices'][j:j+3]]
  for w in [(1/3,1/3,1/3),(.6,.2,.2),(.2,.6,.2),(.2,.2,.6)]:
   p=[sum(v[k]*a for v,a in zip(tri,w)) for k in range(3)];z=surface(support)(*p[:2])
   if z is None:missing+=1
   else:depths.append(p[2]-z)
 reports.append({'id':cid,'support':support,'samples':len(depths),'missingSupport':missing,'minClearance':min(depths) if depths else None,'maxClearance':max(depths) if depths else None,'interiorOccludedSamples':sum(d<=0 for d in depths)})
visible=[]
for side,sign in [('l',1),('r',-1)]:
 ids=['eye-white-'+side,'iris-'+side,'pupil-'+side,'eyelid-'+side,'eye-glint-'+side,'head'];counts={k:0 for k in ids}
 for i in range(81):
  x=sign*.033+(i/80-.5)*.048
  for j in range(31):
   y=by['head']['transform']['position'][1]+.006+(j/30-.5)*.017
   white=surface(ids[0])(x,y)
   if white is None:continue
   hits=[(surface(k)(x,y),k) for k in ids];hits=[v for v in hits if v[0] is not None];counts[max(hits)[1]]+=1
 visible.append({'side':side,'apertureFrontmostSampleCounts':counts})
gear=[]
for cid,c in by.items():
 r=c['geometry'].get('nativeRecipe',{})
 if r.get('kind')!='mounted-gear':continue
 sign=r['direction'];mesh=meshes[cid];n=r['widthSegments'];rows=r['heightSegments'];size=(n+1)*(rows+1);dist=[]
 for x,y,z in set(tuple(v) for v in mesh['vertices']):
  z=-z;target=surface(r['support'])(x,y,sign)
  if target is not None and sign*(z-target)<.001:dist.append(sign*(z-target))
 interior=[]
 xs=[v[0] for v in mesh['vertices']];ys=[v[1] for v in mesh['vertices']]
 for ix in range(1,13):
  for iy in range(1,9):
   x=min(xs)+(max(xs)-min(xs))*ix/13;y=min(ys)+(max(ys)-min(ys))*iy/9
   back=surface(cid)(x,y,-sign);target=surface(r['support'])(x,y,sign)
   if back is not None and target is not None:interior.append(sign*(back-target))
 gear.append({'interiorSamples':len(interior),'interiorMinGap':min(interior),'interiorMaxGap':max(interior),'id':cid,'support':r['support'],'samples':len(dist),'backSurfaceMinGap':min(dist),'backSurfaceMaxGap':max(dist),'intendedEmbed':r['clearance']})
out={'actualNativeGeometry':True,'features':reports,'scleraVisibility':visible,'gearAttachments':gear,'notVisualAcceptance':True};(D/'visibility.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
