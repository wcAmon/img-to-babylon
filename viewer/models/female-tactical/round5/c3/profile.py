import json,math
from pathlib import Path
D=Path(__file__).resolve().parent;M=D.parents[1]
out={}
for label,folder in [('rejectedC2',D.parent/'c2'),('candidateC3',D)]:
 mesh=next(m for m in json.loads((folder/'native-meshes.json').read_text())['meshes'] if m['componentId']=='head');norms=mesh['worldNormals'];norms=[norms[i:i+3] for i in range(0,len(norms),3)] if isinstance(norms[0],(float,int)) else norms
 selected=[]
 for p,n in zip(mesh['vertices'],norms):
  x,y,z=p;y-=1.574
  if abs(x)<.020 and -.055<y<-.018 and z<-.04:selected.append({'x':x,'localY':y,'frontDepth':-z-.006,'normalY':n[1]})
 out[label]={'actualWorldVertexNormalSamples':len(selected),'minimumNormalY':min(p['normalY'] for p in selected),'strongDownwardNormals':sum(p['normalY']<-.45 for p in selected),'maxFrontDepth':max(p['frontDepth'] for p in selected),'samples':selected}
(D/'nose-profile.json').write_text(json.dumps(out,indent=2)+'\n')
print({k:{a:b for a,b in v.items() if a!='samples'} for k,v in out.items()})
