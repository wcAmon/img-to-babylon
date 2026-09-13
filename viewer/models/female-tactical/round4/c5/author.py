import json,shutil,hashlib
from pathlib import Path
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];A=D.parent/'c4-archive'
def save(p,s):p.write_text(json.dumps(s,indent=2,ensure_ascii=False)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
s=json.loads((M/'canonical-spec.json').read_text())['extensions']['babylon-sculpt-v1']['source'];old=json.loads(json.dumps(s));b={c['id']:c for c in s['componentTree']};assert not s.get('round4Correction5')
files=list((ROOT/'.img2babylon/shots').glob('round4-c4-*.png'))+[D.parent/'c4/capture-handoff.json',ROOT/'viewer/public/female-tactical-round4/c4-batch.json']
for f in files:shutil.copy2(f,A/f.name)
for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','round4/compile_surfaces.py']:shutil.copy2(M/n,A/(Path(n).name+'.snapshot'))
review={'passId':'blockout','round':4,'action':'refine-spec','summary':'C4 GPU visually REJECTED regression: occluded sclera, dark triangle lids, floating pupils, jagged buried lips, worried brows. Floating MOLLE and magazine pouches confirmed. No passing score.','evidence':[str(f.relative_to(ROOT)) for f in files],'evidenceHashes':{str(f.relative_to(ROOT)):sha(f) for f in files},'desktopReported':{'views':11,'viewport':[585,1024],'errors':0}}
s['reviewHistory'].append(review);save(A/'rejected-review.json',review)
for side,sign in [('l',1),('r',-1)]:
 for prefix,feature in [('eye-white','sclera'),('iris','iris'),('pupil','pupil'),('eye-glint','glint'),('eyelid','lid'),('brow','brow')]:
  c=b[prefix+'-'+side];c['transform']['position']=[0,0,0];c['transform']['rotation']=[0,0,0]
  c['geometry']['nativeRecipe']={'kind':'surface-feature','feature':feature,'side':sign,'center':[sign*.034,.010],'support':'head','width':.041,'upperHeight':.0065,'lowerHeight':.0048,'bulge':.0022,'edgeClearance':.0008,'uSegments':32,'vSegments':6}
for cid,feature in [('upper-lip','upper-lip'),('lower-lip','lower-lip')]:
 c=b[cid];c['transform']['position']=[0,0,0];c['geometry']['nativeRecipe']={'kind':'surface-feature','feature':feature,'support':'head','width':.037,'seamY':-.0675,'height':.0032,'bulge':.0013,'edgeClearance':.0007,'uSegments':32,'vSegments':6}
# Preserve head, nose, jaw and all hair exactly. Each gear volume consumes actual support triangles.
for c in s['componentTree']:
 cid=c['id']
 if cid.startswith('molle-'):
  sign=-1 if 'back' in cid else 1;c['dimensions']['w']=.204;c['dimensions']['d']=.004
  c['geometry']['nativeRecipe']={'kind':'mounted-gear','support':'vest-back' if sign<0 else 'vest-front','direction':sign,'clearance':-.0005,'widthSegments':16,'heightSegments':2}
 elif cid.startswith('mag-pouch-'):
  c['geometry']['nativeRecipe']={'kind':'mounted-gear','support':'vest-front','direction':1,'clearance':-.0005,'widthSegments':8,'heightSegments':4}
 elif cid.startswith('pouch-flap-') or cid.startswith('pouch-tab-'):
  c['geometry']['nativeRecipe']={'kind':'mounted-gear','support':'mag-pouch-'+cid.split('-')[-1],'direction':1,'clearance':-.0005,'widthSegments':8,'heightSegments':4}
for c in s['componentTree']:
 r=c['geometry'].get('nativeRecipe',{})
 if r.get('kind')=='mounted-gear':r['flatNormals']=True
 if r.get('kind')=='surface-feature' and r['feature'] not in ['sclera','upper-lip','lower-lip']:r['uSegments']=20;r['vSegments']=4
changed=[c['id'] for c,p in zip(s['componentTree'],old['componentTree']) if c!=p]
for cid in changed:b[cid]['optimization']['lastChange']='C5 sampled actual support surface, controlled feature layers or seated gear'
s['round4Correction5']={'scope':'feature visibility and actual gear attachment; preserve head/hair/body pose','status':'unaccepted GPU pending','optimizationPath':{'issue':'Approx15MB runtime duplicated source/native arrays reported by desktop','pending':'Model-specific export payload deduplication after review; preserve exact archival source separately, coordinate with root runtime owner. Not implemented or benchmarked.'}}
save(M/'spec.json',s);save(D/'changes.json',{'round':4,'correction':5,'changedPartIDs':changed,'authoredPartIDs':changed,'dependentGeometryChanges':[],'newPartIDs':[],'removedPartIDs':[],'preserved':'C4 head geometry, hair, stance, materials, physics','optimizationTodo':s['round4Correction5']['optimizationPath']})
print(len(changed),changed)
