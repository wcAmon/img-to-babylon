import json,hashlib,shutil
from pathlib import Path
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];A=D.parent/'c1-archive'
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
s=json.loads((M/'canonical-spec.json').read_text())['extensions']['babylon-sculpt-v1']['source'];old=json.loads(json.dumps(s));b={c['id']:c for c in s['componentTree']};assert not s.get('round5Correction2')
files=list((ROOT/'.img2babylon/shots').glob('round5-c1-*.png'))+list((ROOT/'.img2babylon/cli').glob('round5-c1-*.json'))+[D.parent/'c1/capture-handoff.json']
for f in files:shutil.copy2(f,A/f.name)
for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','iteration.json','round5/compile_surfaces.py']:shutil.copy2(M/n,A/(Path(n).name+'.snapshot'))
review={'passId':'blockout','round':5,'action':'refine-spec','summary':'C1 actual GPU modest proportions improvement, readable features retained; NOT accepted likeness. Undefined nasal wings/tip, masked orbit and smooth cap/fringe remain. C2 head anatomy/frontal hair only.','evidence':[str(f.relative_to(ROOT)) for f in files],'evidenceHashes':{str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in files},'desktopReported':{'views':11,'viewport':[585,1024],'errors':0}};s['reviewHistory'].append(review);save(A/'review.json',review)
g=b['head']['geometry'];original=g['rings'];ys=sorted(set([r[0] for r in original]+[-.11,-.13,-.15,-.165,-.18,-.195,-.21,-.225]))
def interp(y):
 for a,z in zip(original,original[1:]):
  if a[0]<=y<=z[0]:
   t=(y-a[0])/(z[0]-a[0]);return [y]+[a[k]+t*(z[k]-a[k]) for k in range(1,5)]
 return original[-1]
g['rings']=[interp(y) for y in ys];g['segments']=80
# Same connected loft; refine actual local depth field rather than overlay nose spheres.
g['relief']=[r for r in g['relief'] if not (r['center'][0]==0 and r['center'][1]>-.24) and not (abs(r['center'][0])<.08 and -.21<r['center'][1]<-.10)]
def relief(x,y,rx,ry,d):g['relief'].append({'center':[x,y],'radius':[rx,ry],'depth':d})
relief(0,-.010,.034,.103,.063);relief(0,-.120,.062,.044,.110)
relief(0,-.171,.025,.024,.018);relief(0,-.224,.025,.036,-.002)
for sign in [-1,1]:
 relief(sign*.067,-.151,.032,.030,.060)
 relief(sign*.064,-.179,.021,.012,-.014)
 relief(sign*.10,-.148,.025,.048,-.008)
 relief(sign*.225,-.035,.13,.036,.019)
 relief(sign*.30,.015,.052,.065,.017)
for side in ['l','r']:
 b['brow-'+side]['geometry']['nativeRecipe'].update(browThickness=.0048,browArch=.0032,browApex=.34,browTailTaper=.85)
# Scalp-bound frontal arc crosses the exposed cap boundary at one temple.
paths={'fringe-sweep':[[.38,.92],[.29,.91],[.19,.76],[.085,.49]],'fringe-layer-0':[[.43,.94],[.34,.94],[.23,.82],[.095,.565]],'fringe-layer-1':[[.38,.965],[.29,.97],[.16,.88],[.025,.67]],'fringe-layer-2':[[.31,.97],[.20,.975],[.08,.93],[-.045,.78]],'fringe-side':[[.47,.82],[.49,.72],[.50,.59],[.52,.465]]}
for cid,uvs in paths.items():
 r=b[cid]['geometry']['nativeRecipe'];r['uvControls']=uvs;r['tipRatio']=.025 if cid=='fringe-sweep' else .045;r['samples']=28 if cid=='fringe-sweep' else 24;r['radialSegments']=6;r['flattenedFacet']=True
 b[cid]['hairRootBinding'].update(u=uvs[0][0],v=uvs[0][1])
 if cid=='fringe-sweep':r['thickness']=.019;r['width']=.043
 if cid=='fringe-side':r['width']=.014;r['thickness']=.007
s['round5Correction2']={'scope':'continuous nasal/orbital anatomy and scalp-rooted asymmetric frontal silhouette','triangleBudget':35000,'unchanged':'eye/lip dimensions, jaw silhouette, neck, ponytail, body, materials','visualAcceptance':False}
changed=[c['id'] for c,p in zip(s['componentTree'],old['componentTree']) if c!=p]
for cid in changed:b[cid]['optimization']['lastChange']='R5 C2 connected nasal wings/tip and temple-crossing fringe controls'
save(M/'spec.json',s);save(D/'changes.json',{'round':5,'correction':2,'authoredPartIDs':changed,'changedPartIDs':changed,'newPartIDs':[],'removedPartIDs':[]})
save(D/'measurements.json',{'authority':'reference/female.png; C1 actual GPU is defect evidence only','referenceApproxPixels':{'nearEyeCorners':[[276,128],[299,137]],'noseTip':[313,156],'alaSpan':[[305,157],[321,159]],'frontLockEnd':[253,140]},'confidence':{'nose':.55,'lockSilhouette':.75,'hiddenBack':.3},'method':'Manual image reading with perspective/yaw uncertainty; not automatic landmark detection','localTargets':{'bridgeHalfWidthMetres':.0058,'alaCentersMetres':[-.0115,.0115],'mainLockTipUV':[.085,.49]},'samplingReason':'C1 angular intervals undersample ~6mm nasal wings;80sections plus8local nasal rings resolve connected field within35k budget'})
