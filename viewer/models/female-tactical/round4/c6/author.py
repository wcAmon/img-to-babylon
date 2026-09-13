import json,shutil,hashlib
from pathlib import Path
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];A=D.parent/'c5-archive'
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
s=json.loads((M/'canonical-spec.json').read_text())['extensions']['babylon-sculpt-v1']['source'];old=json.loads(json.dumps(s));b={c['id']:c for c in s['componentTree']};assert not s.get('round4Correction6')
files=[ROOT/'.img2babylon/shots'/f'round4-c5-{v}.png' for v in ['hero','front','right','rear','left','face','face-plus','face-minus','orbit-plus','orbit-minus','rear-quarter']]+[D.parent/'c5/capture-handoff.json',ROOT/'viewer/public/female-tactical-round4/c5-batch.json']
for f in files:shutil.copy2(f,A/f.name)
for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','round4/compile_surfaces.py','iteration.json']:shutil.copy2(M/n,A/(Path(n).name+'.snapshot'))
r={'passId':'blockout','round':4,'action':'refine-spec','summary':'C5 GPU: eye/lip occlusion fixed and gear attached, but likeness NOT accepted. Final C6 authorized for brow/eye expression, softer nasal/philtrum relief, narrower lace-up boots; stop after6/6.','evidence':[str(p.relative_to(ROOT)) for p in files],'evidenceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},'desktopReported':{'views':11,'viewport':[585,1024],'errors':0}}
s['reviewHistory'].append(r);save(A/'actual-review.json',r)
# Local relief corrections only, preserve head rings and all hair roots.
for r in b['head']['geometry']['relief']:
 x,y=r['center']
 if abs(y+.233)<1e-6:r['depth']*=.35
 if abs(y+.183)<1e-6:r['depth']*=.45
 if abs(y+.158)<1e-6:r['depth']*=.65
 if x==0 and abs(y+.135)<1e-6:r['depth']*=.80
for c in s['componentTree']:
 r=c['geometry'].get('nativeRecipe',{})
 if r.get('kind')!='surface-feature':continue
 r['expressionRevision']='C6 reference lower angular brows / iris dominance; preserve surface hierarchy'
 if r['feature']=='brow':r.update(browBase=.023,browThickness=.004,browArch=.0025,uSegments=20,vSegments=2)
 if r['feature']=='iris':r.update(irisRadius=.0069,vSegments=3)
 if r['feature']=='pupil':r.update(uSegments=12,vSegments=3)
 if r['feature']=='glint':r.update(uSegments=8,vSegments=2)
 if r['feature']=='lid':r['rimWidth']=.00135
# Slightly warmer sclera; exact StandardMaterial semantics retained and history archived.
for mat in s['materials']:
 if mat['id']=='white':mat['baseColor']=[.77,.75,.68];mat['round6ColorProvenance']='C6 approved reference warm reduced-white eye appearance; shared tiny catchlights. Standard RGB only, no PBR claim.'
for side,sign in [('l',1),('r',-1)]:
 c=b['boot-'+side];c['dimensions'].update(w=.126,h=.255,d=.250)
 c['geometry'].update(segments=12,power=.70,rings=[[-.5,.43,.44,0,.015],[-.39,.49,.49,0,.015],[-.28,.48,.47,0,.010],[-.16,.43,.39,0,-.045],[.02,.36,.31,0,-.11],[.20,.32,.27,0,-.13],[.50,.33,.28,0,-.13]])
 c['collider']['size']=[.134,.255,.263];c['collider']['offset']=[0,0,.007]
 sole=b['boot-sole-'+side];sole['dimensions'].update(w=.134,d=.263);sole['geometry']['segments']=12;sole['geometry']['power']=.68
 upper=b['boot-upper-'+side];upper['transform']['position']=[0,0,0];upper['transform']['rotation']=[0,0,0];upper['geometry']['nativeRecipe']={'kind':'boot-panel','support':'boot-'+side,'width':.055,'bottom':-.066,'top':.108,'thickness':.004,'segments':8,'rows':4,'flatNormals':True}
 for i in range(4):
  c=b[f'lace-{side}-{i}'];c['transform']['position']=[0,0,0];c['transform']['rotation']=[0,0,0];c['geometry']['nativeRecipe']={'kind':'cross-laces','support':'boot-upper-'+side,'centerY':.075-i*.037,'width':.046,'rise':.029,'radius':.0014,'segments':4,'sides':4}
 accent=b['boot-accent-'+side];accent['transform']['position'][0]=sign*.046;accent['dimensions'].update(w=.010,h=.047,d=.075)
changed=[c['id'] for c,p in zip(s['componentTree'],old['componentTree']) if c!=p]
for cid in changed:b[cid]['optimization']['lastChange']='C6 final authorized correction; reference expression and lace-up boot recipe'
s['round4Correction6']={'hardStopAfter':6,'scope':'final bounded expression/nasal relief/boot correction','visualAcceptance':False,'deduplication':{'status':'completed in root native generator','evidence':'docs/migration/native-payload-deduplication.md','remaining':'Optional binary externalization; no new service/hidden renderer'}}
save(M/'spec.json',s);save(D/'changes.json',{'round':4,'correction':6,'changedPartIDs':changed,'authoredPartIDs':changed,'newPartIDs':[],'removedPartIDs':[],'preserved':'head rings, all hair, stance and attached gear','materialChange':'white Standard RGB .77 .75 .68','physics':'same55kg body, two boot collider bounds updated'})
