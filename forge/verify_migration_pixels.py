#!/usr/bin/env python3
"""Inspect persisted native WebGL fixture pixels. Stdlib; never generates evidence."""
import hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'pipeline/forge/stage1_intake'))
from extract_pbr_evidence import load_image
shots=ROOT/'.img2babylon/shots'
passes=['beauty','alpha-silhouette','semantic-id','depth','normal','roughness-material-id']
records=[];images={}
for model in ['glb','native']:
 for pid in passes:
  path=shots/f'migration-{model}-raw-{pid}.png'
  w,h,pixels,warnings=load_image(path)
  assert (w,h)==(1280,720),(path,w,h)
  images[model,pid]=(w,h,pixels)
  records.append({'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'width':w,'height':h,'warnings':warnings})
def pixel(model,pid,x,y):
 w,h,p=images[model,pid];return p[y*w+x]
def close(actual,expected,tolerance=1):
 assert len(actual)==len(expected) and all(abs(a-b)<=tolerance for a,b in zip(actual,expected)),(actual,expected)
# The source GLB has known +Z normals, roughness .35, region ID1, and depth2.5m.
close(pixel('glb','beauty',20,20),(238,242,255,255),0)
close(pixel('glb','alpha-silhouette',20,20),(0,0,0,0),0)
close(pixel('glb','alpha-silhouette',550,250),(255,255,255,255),0)
close(pixel('glb','semantic-id',550,250),(255,0,0,255),0)
close(pixel('glb','normal',550,250),(128,128,255,255))
close(pixel('glb','depth',550,250),(127,127,127,255))
close(pixel('glb','roughness-material-id',550,250),(89,0,1,255))
# Inspect the runtime-generated independent roughness map within beam's visible ID footprint.
_,_,ids=images['native','semantic-id'];_,_,rough=images['native','roughness-material-id']
values=[r[0] for p,r in zip(ids,rough) if p[:3]==(0,255,0) and p[3]==255]
assert len(values)>100 and max(values)-min(values)>2,(len(values),min(values),max(values))
result={'status':'PASS','scope':'Actual persisted browser canvas PNGs; no likeness score','browser':'Codex in-app browser / WebGL2 / exact sRGB','checks':['AgX bypass for exact solid background','transparent diagnostic background','semantic RGB','canonical front-facing normals','linear camera depth','roughness and ID byte encoding','independent roughness-map variation on posed native mesh'],'nativeBeamRoughnessBytes':{'min':min(values),'max':max(values),'sampledPixels':len(values)},'captures':records}
out=ROOT/'docs/migration/pixel-verification.json';out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='captures'},indent=2))
