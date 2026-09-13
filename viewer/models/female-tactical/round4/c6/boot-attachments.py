"""Read actual world vertices, invert authored boot pose, inspect tongue/lace seats and collider bounds."""
import json,math
from pathlib import Path
D=Path(__file__).resolve().parent
namespace={'__file__':str(D/'visibility.py')};exec((D/'visibility.py').read_text().split("s=json.loads((D.parents[1]")[0],namespace)
meshes=namespace['meshes'];sample=namespace['surface'];s=json.loads((D.parents[1]/'spec.json').read_text());by={c['id']:c for c in s['componentTree']};out=[]
for side in ['l','r']:
 boot=by['boot-'+side];pos=boot['transform']['position'];angle=boot['transform']['rotation'][1];co=math.cos(angle);si=math.sin(angle)
 ids=[c['id'] for c in s['componentTree'] if c['id']=='boot-'+side or c['parent']=='boot-'+side]
 for cid in ids:
  vs=[]
  for x,y,z in meshes[cid]['vertices']:
   dx=x-pos[0];dz=-z-pos[2];vs.append([co*dx-si*dz,y-pos[1],-(si*dx+co*dz)])
  meshes[cid]['vertices']=vs
 upper='boot-upper-'+side;contact=[]
 for x,y,z in meshes[upper]['vertices']:
  target=sample('boot-'+side)(x,y)
  if target is not None and -z-target<.001:contact.append(-z-target)
 laces=[]
 for i in range(4):
  cid=f'lace-{side}-{i}';r=by[cid]['geometry']['nativeRecipe'];vs=meshes[cid]['vertices'];n=r['sides'];stride=(r['segments']+1)*n+2;ends=[]
  for start in [0,stride]:
   for row in [0,r['segments']]:
    points=vs[start+row*n:start+(row+1)*n];center=[sum(p[k] for p in points)/n for k in range(3)];target=sample(upper)(*center[:2]);ends.append(-center[2]-target if target is not None else None)
  laces.append({'id':cid,'fourEndpointCenterClearances':ends,'radius':r['radius'],'twoCrossingClosedTubesSameID':True})
 vertices=[v for cid in ids for v in meshes[cid]['vertices']];bounds=[[min(v[k] if k!=2 else -v[k] for v in vertices),max(v[k] if k!=2 else -v[k] for v in vertices)] for k in range(3)];size=boot['collider']['size'];offset=boot['collider']['offset'];overshoot=[max(0,offset[k]-size[k]/2-bounds[k][0],bounds[k][1]-(offset[k]+size[k]/2)) for k in range(3)]
 out.append({'boot':boot['id'],'tongueBackSeatMin':min(contact),'tongueBackSeatMax':max(contact),'laces':laces,'actualAssemblyLocalBounds':bounds,'colliderSize':size,'colliderOffset':offset,'assemblyBeyondApproxColliderMetres':overshoot})
(D/'boot-attachments.json').write_text(json.dumps({'actualNativeGeometry':True,'boots':out,'visualAcceptance':False,'colliderScope':'Approximate compound box; small decorative sole overshoot is reported, not hidden.'},indent=2)+'\n');print(json.dumps(out,indent=2))
