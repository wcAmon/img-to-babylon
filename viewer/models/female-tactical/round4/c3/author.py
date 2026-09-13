"""C3: measured stance/joint scaffold, cap-attached hair and restrained facial volumes."""
import json, math, hashlib
from pathlib import Path
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2]
s=json.loads((M/'canonical-spec.json').read_text())['extensions']['babylon-sculpt-v1']['source'];old=json.loads(json.dumps(s));b={c['id']:c for c in s['componentTree']}
if s.get('round4Correction3'):raise ValueError('C3 already authored')
# Fixed semantic joint positions drive the existing segment transforms and their child gear.
# These are procedural pose landmarks, not an animation skeleton or ragdoll.
joints={'shoulder':[.170,1.397,0],'elbow':[.280,1.135,.006],'wrist':[.340,.930,.018],'hip':[.106,1.025,-.009],'knee':[.187,.598,-.002],'ankle':[.252,.238,.015]}
def segment(cid,start,end,overlap):
 c=b[cid];dy=start[1]-end[1];dx=end[0]-start[0];length=math.hypot(dx,dy)
 c['transform']['position']=[(a+z)*.5 for a,z in zip(start,end)];c['transform']['rotation']=[0,0,math.atan2(dx,dy)];c['dimensions']['h']=length+overlap
 c['poseLandmarks']={'proximal':start,'distal':end,'endOverlap':overlap,'authority':'round4/c3/author.py joints'}
 c['collider']['size']=[c['dimensions'][k] for k in ['w','h','d']]
for side,sign in [('l',1),('r',-1)]:
 p={k:[sign*v[0],v[1],v[2]] for k,v in joints.items()}
 for cid,a,z,overlap in [('upper-arm','shoulder','elbow',.038),('forearm','elbow','wrist',.024),('thigh','hip','knee',.045),('calf','knee','ankle',.034)]:segment(cid+'-'+side,p[a],p[z],overlap)
 hand=b['hand-'+side];hand['transform']['position']=[sign*.354,.865,.025];hand['transform']['rotation']=[0,0,sign*.27]
 boot=b['boot-'+side];boot['transform']['position']=[sign*.257,.128,.045];boot['transform']['rotation']=[0,sign*.10,0]
 thigh=b['thigh-'+side];thigh['dimensions'].update(w=.208,d=.192);thigh['geometry']['segments']=14
 thigh['geometry']['rings']=[[-.5,.34,.35],[-.34,.42,.41],[-.12,.48,.46],[.09,.50,.50],[.30,.50,.49],[.5,.47,.43]]
 calf=b['calf-'+side];calf['dimensions'].update(w=.178,d=.159);calf['geometry']['segments']=14
 calf['geometry']['rings']=[[-.5,.30,.31],[-.36,.39,.36],[-.21,.47,.43],[-.03,.445,.47],[.16,.51,.50],[.32,.44,.43],[.5,.39,.41]]
 for cid in ['thigh-'+side,'calf-'+side,'upper-arm-'+side]:b[cid]['geometry']['nativeRecipe']={'kind':'faceted-cloth','ringTwist':.09,'foldAmplitude':.045,'flatNormals':True,'seed':13}
 for cid in ['knee-pad-'+side,'knee-shell-'+side,'knee-strap-'+side]:
  c=b[cid];c['transform']['position'][1]=(b['calf-'+side]['dimensions']['h']*.5)-.018
 b['sleeve-cuff-'+side]['transform']['position'][1]=-b['upper-arm-'+side]['dimensions']['h']*.5+.021
 b['wrist-cuff-'+side]['transform']['position'][1]=.064
b['torso']['transform']['position'][1]=1.255;b['torso']['dimensions'].update(w=.36,h=.305,d=.218)
b['torso']['geometry']['rings']=[[-.5,.34,.43],[-.30,.355,.45],[0,.44,.50],[.28,.49,.49],[.5,.435,.37]]
for c in s['componentTree']:
 if c['parent']=='torso':c['transform']['position'][1]*=.305/.35
b['pelvis']['transform']['position'][1]=1.014;b['pelvis']['dimensions'].update(w=.338,h=.17)
b['pelvis']['geometry']['nativeRecipe']={'kind':'faceted-cloth','ringTwist':.05,'foldAmplitude':.025,'flatNormals':True,'seed':17}
for cid,sign in [('vest-front',1),('vest-back',-1)]:
 c=b[cid];c['dimensions'].update(w=.269,h=.255,d=.025);c['transform']['position']=[0,.008,sign*.092]
 c['geometry']['nativeRecipe']={'kind':'vest-wrap','direction':sign,'width':.269,'height':.255,'depthRadius':.108,'bodyRadius':.185,'thickness':.016,'offset':.092,'uSegments':12,'vSegments':6}
# Smooth head normals with purposeful density, not 96x96 blanket tessellation.
h=b['head'];rings=h['geometry']['rings'];h['geometry']['rings']=[rings[i] for i in range(0,97,2)];h['geometry']['segments']=64
h['geometry']['relief']=[{'center':[0,-.065],'radius':[.075,.14],'depth':.064},{'center':[0,-.16],'radius':[.10,.065],'depth':.045},{'center':[0,-.25],'radius':[.055,.07],'depth':.010}]
for sign in [-1,1]:
 h['geometry']['relief'] += [{'center':[sign*.23,-.075],'radius':[.19,.16],'depth':.014},{'center':[sign*.20,.055],'radius':[.13,.055],'depth':-.018},{'center':[sign*.052,-.18],'radius':[.040,.032],'depth':.012},{'center':[sign*.055,-.21],'radius':[.027,.014],'depth':-.009}]
b['nose']['dimensions'].update(w=.014,h=.010,d=.006);b['nose']['transform']['position']=[0,-.036,.086]
for side,sign in [('l',1),('r',-1)]:
 b['eye-white-'+side]['dimensions']['h']=.014
 b['eyelid-'+side]['dimensions'].update(h=.015,w=.044);b['eyelid-'+side]['transform']['position'][1]=.009
 b['brow-'+side]['dimensions'].update(h=.014,w=.046);b['brow-'+side]['transform']['position'][1]=.029
 for cid in ['iris-'+side,'pupil-'+side]:b[cid]['dimensions']['h']*=.90
 # Eyebrow outer lift and thicker inner body, same finite surface IDs.
 b['brow-'+side]['geometry']['outline']=[[-.5,-.18,0],[-.32,.20,0],[-.06,.38,0],[.20,.31,0],[.5,-.15,0],[.24,.03,0],[0,.08,0],[-.31,-.10,0]]
# Warmer sclera remains a deliberate StandardMaterial color correction, not a PBR conversion.
for mat in s['materials']:
 if mat['id']=='white':
  mat['baseColor']=[.83,.81,.73];mat['round4ColorProvenance']='C2 whites visibly too bright; reference warm sclera, shared tiny catchlights retained. No roughness conversion.'
# Hair locks physically intersect cap by 1mm at the lower envelope; no hovering ribbons.
cap=b['hair-cap']['geometry']['nativeRecipe'];cap.update(uSegments=48,vSegments=18);cap['hairline'].update(sideV=.49,rearV=.23)
for cid in ['fringe-sweep','fringe-layer-0','fringe-layer-1','fringe-layer-2','fringe-side','hair-side-l','hair-side-r']:
 r=b[cid]['geometry']['nativeRecipe'];r.update(samples=20,radialSegments=8,capClearance=.0035,rootEmbed=.0015)
 r['width']*=1.10
 if cid.startswith('hair-side') or cid=='fringe-side':
  controls=r['uvControls'];controls[-1][1]=.54;controls[-2][1]=.60;r['tipRatio']=.16
# Thick high posterior clumps start inside the same teal tie/cap junction.
for idx,cid in enumerate(['ponytail','tail-lock-0','tail-lock-1','tail-lock-2']):
 r=b[cid]['geometry']['nativeRecipe'];shift=0 if idx==0 else (idx-2)*.016
 r.update(rootUV=[.75,.84],rootClearance=.001,samples=26,radialSegments=8,width=.065 if idx==0 else .025,thickness=.043 if idx==0 else .022,tipRatio=.10)
 r['controls']=[[0,.079,-.08],[shift,.118,-.103],[shift-.01,.105,-.140],[shift-.02,.022,-.156],[shift-.012,-.100,-.143]]
 b[cid]['hairRootBinding'].update(u=.75,v=.84)
b['hair-tie']['transform']['position']=[0,.085,-.086];b['hair-tie']['dimensions'].update(w=.056,h=.035,d=.050)
# Physics still one compound rigid body; update only collider sizes on changed major segments.
for c in s['componentTree']:
 if c.get('collider'):c['collider']['size']=[c['dimensions'][k] for k in ['w','h','d']]
s['round4Correction3']={'joints':joints,'poseType':'procedural static joint scaffold; no skinned rig','targetTriangles':[20000,30000],'hairAttachment':'cap-overlapping envelope and shared root/tie location; numeric plus GPU validation required','pending':'c3 images and full gate acceptance'}
paths=['.img2babylon/shots/round4-c2-comparison.png','.img2babylon/shots/round4-c2-face-plus.png','.img2babylon/shots/round4-c2-right.png','.img2babylon/cli/desktop-c2-tier1.json','.img2babylon/cli/desktop-c2-multi.json']
s['reviewHistory'].append({'passId':'blockout','round':4,'action':'refine-spec','summary':'C2 rejected: IoU .5573 below .85, missing map-stripped evidence, narrow pose, hovering fringe/ponytail, toy-white eyes and excessive topology. C3 geometry correction, no gate thresholds changed.','evidence':paths,'desktopCaptureVersion':'C2 GPU preceded subsequent C2 compiler normal/curvature fixes; images not represented as hashes of latest C2 source.','evidenceHashes':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}})
changed=[c['id'] for c,p in zip(s['componentTree'],old['componentTree']) if c!=p]
for cid in changed:b[cid]['optimization']['lastChange']='round4 c3: measured pose continuity, rooted clumps, nose/eye form and polygon budget'
(M/'spec.json').write_text(json.dumps(s,indent=2,ensure_ascii=False)+'\n');(D/'changes.json').write_text(json.dumps({'round':4,'correction':3,'changedPartIDs':changed,'newPartIDs':[],'removedPartIDs':[],'materialChanges':['white: warm sclera StandardMaterial RGB'],'physics':'same single55kg compound body; segment collider dimensions follow new pose'},indent=2)+'\n')
