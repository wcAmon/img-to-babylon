import json,math,hashlib,shutil
from pathlib import Path
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];A=D.parent/'round4-archive'
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
s=json.loads((M/'canonical-spec.json').read_text())['extensions']['babylon-sculpt-v1']['source'];old=json.loads(json.dumps(s));b={c['id']:c for c in s['componentTree']};assert not s.get('round5Correction1')
for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','iteration.json','round4/compile_surfaces.py']:shutil.copy2(M/n,A/(Path(n).name+'.snapshot'))
shutil.copytree(M/'evidence/round4-final',A/'evidence',dirs_exist_ok=True)
review={'passId':'blockout','round':5,'action':'refine-spec','summary':'Round4 final GPU remains unaccepted likeness: small button eyes, long generic lower face, exposed cylindrical neck, helmet-like hair. Round5 C1 authorized head/neck/hair only.','evidence':['evidence/round4-final/round4-c6-face.png','evidence/round4-final/reference-comparison.png'],'evidenceHashes':{str(p.relative_to(M)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (M/'evidence/round4-final').glob('*.png')}};s['reviewHistory'].append(review);save(A/'review.json',review)
# Manual image readings, not automatic landmarks: approximate pixels with yaw uncertainty.
measure={'referenceImage':[585,1024],'method':'manual visible landmarks from original; image yaw/occlusion prevents direct symmetric metric reconstruction','referencePixels':{'visibleFaceTop':[286,101],'chin':[296,193],'nearEyeCorners':[[276,128],[299,137]],'farEyeCorners':[[315,135],[334,144]],'mouthCorners':[[285,165],[313,176]],'hairTop':[276,46]},'confidence':{'eyeAndMouth':.65,'jaw':.65,'hiddenScalpAndBack':.3},'currentRecipeRatios':{'eyeWidthToHeadWidth':.041/.172,'lipWidthToHeadWidth':.037/.172},'authoredTargets':{'eyeWidthToHeadWidth':.048/.172,'lipWidthToHeadWidth':.044/.172,'eyeDownMetres':.004,'shortenLowerFaceMetres':.010,'headLowerMetres':.014},'interpretation':'Reference adult eye opening and mouth span larger relative visible face; front/back inferred geometry needs unchanged-camera GPU review.'};save(D/'measurements.json',measure)
b['head']['transform']['position'][1]-=.014
for ring in b['head']['geometry']['rings']:
 y=ring[0]
 if y<-.25:ring[0]+=.043*((-.25-y)/.203)**2
b['neck']['dimensions']['h']-=.008;b['neck']['dimensions']['w']*=.94;b['neck']['collider']['size']=[b['neck']['dimensions'][k] for k in ['w','h','d']]
for c in s['componentTree']:
 r=c['geometry'].get('nativeRecipe',{})
 if r.get('kind')=='surface-feature':
  if r['feature'] in ['upper-lip','lower-lip']:r.update(width=.044,height=.0035,cornerLift=.00085)
  else:
   r['center']=[r['side']*.033,.006];r['width']=.048;r['upperHeight']=.0078;r['lowerHeight']=.0053
   if r['feature']=='iris':r['irisRadius']=.0073
   if r['feature']=='brow':r.update(browBase=.019,browThickness=.0045,browArch=.0030)
# Expose a real layered fringe silhouette instead of hair ribbons hidden on a low cap border.
b['hair-cap']['geometry']['nativeRecipe']['hairline']['frontV']=.80
paths={'fringe-sweep':[[.37,.90],[.28,.90],[.17,.78],[.055,.57]],'fringe-layer-0':[[.42,.92],[.33,.94],[.22,.85],[.075,.65]],'fringe-layer-1':[[.38,.96],[.28,.97],[.15,.89],[.025,.73]],'fringe-layer-2':[[.31,.97],[.21,.975],[.095,.94],[-.035,.80]]}
for cid,uvs in paths.items():
 r=b[cid]['geometry']['nativeRecipe'];r.update(uvControls=uvs,thickness=.017 if cid=='fringe-sweep' else .013,samples=24,tipRatio=.06);b[cid]['hairRootBinding'].update(u=uvs[0][0],v=uvs[0][1]);r['width']*=1.08
for idx,cid in enumerate(['ponytail','tail-lock-0','tail-lock-1','tail-lock-2']):
 r=b[cid]['geometry']['nativeRecipe'];shift=0 if idx==0 else (idx-2)*.018
 r['controls']=[[0,.079,-.08],[shift,.139,-.115],[shift-.015,.119,-.167],[shift-.025,.022,-.184],[shift-.005,-.104,-.153]];r['width']*=1.16;r['thickness']*=1.10
for c in s['componentTree']:
 if c.get('hairRootBinding'):c['hairRootBinding']['consumedBy']='round5/compile_surfaces.py'
 if c['id']=='ponytail':c['geometry']['nativeRecipe']['curvatureLimit']=.28
s['round5Correction1']={'scope':'head/neck/face/hair only','compiler':'round5/compile_surfaces.py','visualAcceptance':False,'measurementEvidence':'round5/c1/measurements.json'}
changed=[c['id'] for c,p in zip(s['componentTree'],old['componentTree']) if c!=p]
for cid in changed:b[cid]['optimization']['lastChange']='R5 C1 measured face span, lower jaw/neck integration and asymmetric scalp-rooted clumps'
save(M/'spec.json',s);save(D/'changes.json',{'round':5,'correction':1,'authoredPartIDs':changed,'changedPartIDs':changed,'newPartIDs':[],'removedPartIDs':[],'preserved':'all torso, gear, limb and boot authoring recipes; material semantics unchanged'})
