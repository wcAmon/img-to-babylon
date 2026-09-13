"""C4 head-only correction from rejected frozen C3 GPU; no body recipe changes."""
import json,hashlib,shutil,math
from pathlib import Path
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];A=D.parent/'c3-archive'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
s=json.loads((M/'canonical-spec.json').read_text())['extensions']['babylon-sculpt-v1']['source'];old=json.loads(json.dumps(s));b={c['id']:c for c in s['componentTree']}
assert not s.get('round4Correction4')
files=[ROOT/'.img2babylon/shots'/f'round4-c3-{v}.png' for v in ['hero','front','right','rear','left','face','face-plus','face-minus','orbit-plus','orbit-minus','rear-quarter']]+[ROOT/'.img2babylon/cli/desktop-c3-tier1.json',D.parent/'c3/capture-handoff.json',ROOT/'viewer/public/female-tactical-round4/c3-batch.json']
for f in files:shutil.copy2(f,A/f.name)
for name in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','round4/compile_surfaces.py']:shutil.copy2(M/name,A/(Path(name).name+'.snapshot'))
review={'passId':'blockout','round':4,'action':'refine-spec','summary':'C3 actual GPU rejected: IoU .6101 < .85, aspect and scale failures, missing map-stripped evidence; mask-like lower face, undefined nasal tip/ala, detached-looking lip transition, skinny ponytail. C4 head-only geometry refinement; no gate acceptance.','evidence':[str(f.relative_to(ROOT)) for f in files],'evidenceHashes':{str(f.relative_to(ROOT)):sha(f) for f in files},'desktopReported':{'views':11,'viewport':[585,1024],'errors':0},'pendingBodyCorrection':'C5: rear MOLLE floats behind vest in side view; preserve C3 body for C4.'}
save(A/'rejected-review.json',review);s['reviewHistory'].append(review)
# Preserve upper cranium exactly for existing scalp bindings. Reshape lower jaw smoothly.
g=b['head']['geometry']
for ring in g['rings']:
 y=ring[0];weight=math.exp(-((y+.34)/.125)**2)
 ring[1]*=1-.13*weight
 # Shorter chin with a continuous blend to unmodified cheek/temple sections.
 if y<-.20:ring[0]+=.047*((-.20-y)/.30)**2
 # Mouth-support muzzle avoids a separate lip strip on a receding oval.
 ring[4]+=.025*math.exp(-((y+.285)/.095)**2)
g['relief']=[]
def relief(x,y,rx,ry,d):g['relief'].append({'center':[x,y],'radius':[rx,ry],'depth':d})
relief(0,-.025,.046,.105,.053);relief(0,-.135,.060,.055,.086)
relief(0,-.178,.065,.025,.026);relief(0,-.233,.025,.035,-.010)
relief(0,-.287,.14,.057,.043);relief(0,-.365,.10,.030,-.012)
relief(0,-.407,.14,.058,.025)
for sign in [-1,1]:
 relief(sign*.245,-.035,.135,.095,.049)
 relief(sign*.25,-.19,.105,.10,-.026)
 relief(sign*.19,.046,.115,.045,-.036)
 relief(sign*.18,.104,.13,.035,.018)
 relief(sign*.061,-.158,.037,.033,.033)
 relief(sign*.064,-.183,.022,.013,-.019)
 relief(sign*.025,-.229,.016,.040,.014)
 relief(sign*.104,-.284,.033,.030,-.009)
# Retain named nose as fully embedded legacy guide; actual visible anatomy is continuous head relief.
b['nose']['dimensions'].update(w=.012,h=.008,d=.005);b['nose']['transform']['position']=[0,-.032,.083]
for cid,y in [('upper-lip',-.066),('lower-lip',-.070)]:
 c=b[cid];c['transform']['position']=[0,y,.078];c['dimensions'].update(w=.037,h=.007,d=.003)
 c['geometry']['dome']=.30
 c['geometry']['nativeRecipe']={'kind':'facial-overlay','support':'head actual native triangles','edgeClearance':.0002,'centralVolume':.0012 if cid=='upper-lip' else .0015}
 # Bury lateral corners into continuous muzzle, retain soft centre volume.
 for p in c['geometry']['outline']:p[2]=-.38*abs(p[0])*2
b['lower-lip']['geometry']['outline']=[[-0.5, 0.1, 0], [-0.25, 0.24, 0], [0, 0.27, 0], [0.25, 0.24, 0], [0.5, 0.1, 0], [0.28, -0.24, 0], [0, -0.36, 0], [-0.28, -0.24, 0]]
for side,sign in [('l',1),('r',-1)]:
 b['eye-white-'+side]['dimensions']['h']=.0125
 b['eyelid-'+side]['dimensions'].update(w=.044,h=.017,d=.002)
 b['eyelid-'+side]['geometry']['dome']=.18
 b['eyelid-'+side]['geometry']['outline']=[[-.5,0,0],[-.34,.35,0],[-.1,.53,0],[.16,.52,0],[.39,.29,0],[.54,.01,0],[.43,.03,0],[.29,.20,0],[.13,.33,0],[-.1,.34,0],[-.32,.19,0]]
 c=b['brow-'+side];c['dimensions'].update(h=.014,w=.044);c['transform']['rotation'][2]=sign*-.14
 c['geometry']['outline']=[[-.5,-.17,0],[-.33,.24,0],[-.05,.34,0],[.22,.24,0],[.5,-.16,0],[.20,-.02,0],[-.04,.02,0],[-.34,-.19,0]]
# Scalp-rooted directional crest: thickness changes only named crest locks, not whole cap.
for cid in ['fringe-sweep','fringe-layer-0','fringe-layer-1','fringe-layer-2']:
 r=b[cid]['geometry']['nativeRecipe'];r['thickness']*=1.25
# Broad posterior arc and explicit sustained middle-volume profile, same root/tie/IDs.
for idx,cid in enumerate(['ponytail','tail-lock-0','tail-lock-1','tail-lock-2']):
 r=b[cid]['geometry']['nativeRecipe'];shift=0 if idx==0 else (idx-2)*.018
 r['controls']=[[0,.079,-.08],[shift,.108,-.105],[shift-.012,.089,-.151],[shift-.024,.006,-.173],[shift-.008,-.102,-.151]]
 r['volumeProfile']=[[0,.72],[.20,1.02],[.48,1.0],[.70,.85],[.87,.49],[1,.09]]
 r['width']=.072 if idx==0 else .031;r['thickness']=.045 if idx==0 else .024
changed=[c['id'] for c,p in zip(s['componentTree'],old['componentTree']) if c!=p]
assert len(s['componentTree'])==125
for cid in changed:b[cid]['optimization']['lastChange']='C4 continuous facial anatomy / sustained ponytail volume; density preserved'
body=[c for c in s['componentTree'] if c['id'] not in changed]
assert body==[c for c in old['componentTree'] if c['id'] not in changed]
s['round4Correction4']={'scope':'head/face/hair only; C3 body and materials unchanged','targetTriangles':[25000,30000],'pendingC5':'Rear MOLLE floats behind vest; requires actual contact/side-view correction.','visualAcceptance':False}
save(M/'spec.json',s);save(D/'changes.json',{'round':4,'correction':4,'changedPartIDs':changed,'newPartIDs':[],'removedPartIDs':[],'unchangedPartIDs':[c['id'] for c in body],'bodyRecipesUnchanged':True,'materialsUnchanged':s['materials']==old['materials'],'physics':'unchanged single55kg compound'})
print(changed)
