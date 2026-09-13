"""C2 corrective recipes, driven by actual rejected c1 GPU evidence."""
import json, math, sys, hashlib
from pathlib import Path
D=Path(__file__).resolve().parent; M=D.parents[1]; ROOT=M.parents[2]
sys.path.insert(0,str(ROOT/'pipeline/forge/_shared'))
from scalp_field import ScalpField
s=json.loads((M/'canonical-spec.json').read_text())['extensions']['babylon-sculpt-v1']['source']; old=json.loads(json.dumps(s))
if s.get('round4Correction2'): raise ValueError('C2 already authored')
b={c['id']:c for c in s['componentTree']}
# Hermite interpolation with continuous slopes; no piecewise-linear cheek ridges.
def spline(keys,y):
 j=next(i for i in range(len(keys)-1) if keys[i][0]-1e-8<=y<=keys[i+1][0]+1e-8)
 a,z=keys[j:j+2]; dt=z[0]-a[0]; t=(y-a[0])/dt; out=[y]
 for k in range(1,len(a)):
  def slope(i):
   lo=max(0,i-1);hi=min(len(keys)-1,i+1)
   return (keys[hi][k]-keys[lo][k])/(keys[hi][0]-keys[lo][0])
  out.append((2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*dt*slope(j)+(-2*t**3+3*t*t)*z[k]+(t**3-t*t)*dt*slope(j+1))
 return out
keys=[[-.5,.13,.19,0,.03],[-.43,.235,.285,0,.024],[-.30,.345,.39,0,.006],[-.12,.455,.462,0,0],[.06,.49,.49,0,0],[.23,.475,.49,0,0],[.36,.415,.455,0,0],[.46,.265,.30,0,0],[.50,.095,.115,0,0]]
g=b['head']['geometry'];g['rings']=[spline(keys,-.5+i/96) for i in range(97)];g['segments']=96
# Broad, weak cheek volume; nasal bridge and tip taper continuously into the same surface.
g['relief']=[{'center':[0,-.03],'radius':[.067,.20],'depth':.085},{'center':[0,-.16],'radius':[.095,.065],'depth':.057}]
for side in [-1,1]:
 g['relief'] += [{'center':[side*.23,-.075],'radius':[.19,.16],'depth':.012},{'center':[side*.20,.055],'radius':[.13,.06],'depth':-.014},{'center':[side*.055,-.19],'radius':[.025,.020],'depth':-.010}]
# Nose part survives as a small embedded tip rather than a disconnected bulb.
b['nose']['dimensions'].update(w=.017,h=.012,d=.008);b['nose']['transform']['position']=[0,-.035,.093]
# Close gaps by measured endpoint overlap, not by unrelated rigid root offsets.
for side,sign in [('l',1),('r',-1)]:
 a=b['upper-arm-'+side];a['dimensions']['h']=.292;a['transform']['position']=[sign*.211,1.27,0]
 a['geometry']['rings']=[[-.5,.39,.41],[-.37,.47,.48],[-.20,.43,.45],[.02,.50,.50],[.22,.50,.48],[.39,.46,.45],[.5,.40,.39]]
 f=b['forearm-'+side];f['transform']['position']=[sign*.272,1.035,.01];f['dimensions']['h']=.24
 # carry hand along with distal arm displacement; child cuffs/fingers retain named hierarchy.
 b['hand-'+side]['transform']['position'][0]-=sign*.02
 t=b['thigh-'+side];t['dimensions']['h']=.386;t['geometry']['rings'][0]=[-.5,.365,.385];t['geometry']['rings'][-1]=[.5,.495,.45]
 c=b['calf-'+side];c['transform']['position'][0]=sign*.152;c['dimensions']['h']=.331;c['geometry']['rings'][-1]=[.5,.415,.43]
 # align boot center with calf endpoint; widen lower-leg cloth before ankle taper.
 b['boot-'+side]['transform']['position'][0]-=sign*.012
b['pelvis']['geometry']['rings']=[[-.5,.38,.39],[-.3,.455,.47],[0,.50,.5],[.3,.47,.48],[.5,.36,.38]]
# Model-specific compiled surfaces retain the old base recipe snapshot, and are regenerated from these controls.
cap=b['hair-cap'];cap['geometry']['nativeRecipe']={'kind':'scalp-cap','hairline':{'frontV':.72,'sideV':.54,'rearV':.34},'clearance':.0035,'thickness':.003,'uSegments':96,'vSegments':32}
# u=0 at +X, .25 front, .5 -X, .75 rear; all paths are on the actual head field.
locks=[('fringe-sweep',[[.39,.89],[.31,.86],[.20,.78],[.08,.60]],.032,.009),('fringe-layer-0',[[.43,.91],[.34,.90],[.23,.86],[.10,.70]],.023,.007),('fringe-layer-1',[[.39,.95],[.29,.94],[.18,.90],[.05,.80]],.024,.008),('fringe-layer-2',[[.32,.97],[.22,.97],[.12,.94],[.01,.87]],.023,.008),('fringe-side',[[.48,.81],[.49,.71],[.50,.58],[.51,.46]],.017,.007),('hair-side-l',[[.01,.79],[0,.68],[.98,.55],[.96,.43]],.022,.009),('hair-side-r',[[.49,.79],[.50,.68],[.52,.55],[.54,.43]],.022,.009)]
# Unwrap the angular seam, taking the short continuous arc.
for cid,uvs,width,thick in locks:
 for i in range(1,len(uvs)):
  while uvs[i][0]-uvs[i-1][0]>.5:uvs[i][0]-=1
  while uvs[i][0]-uvs[i-1][0]<-.5:uvs[i][0]+=1
 c=b[cid];c['transform']['position']=[0,0,0];c['transform']['rotation']=[0,0,0];c['dimensions'].update(w=1,h=1,d=1)
 c['geometry']['nativeRecipe']={'kind':'scalp-lock','uvControls':uvs,'width':width,'thickness':thick,'clearance':.004,'samples':40,'radialSegments':12,'tipRatio':.04}
 c['hairRootBinding']={'u':uvs[0][0]%1,'v':uvs[0][1],'consumedBy':'round4/compile_surfaces.py','coordinateSystem':'head-local LH, scalp azimuth u and height v'}
# High posterior arched ponytail: curve leaves scalp toward the tie, then falls behind the head.
for idx,cid in enumerate(['ponytail','tail-lock-0','tail-lock-1','tail-lock-2']):
 c=b[cid]; shift=0 if idx==0 else (idx-2)*.019
 controls=[[shift*.4,.092,-.071],[shift,.142,-.115],[shift-.020,.102,-.163],[shift-.028,.010,-.174],[shift-.016,-.096,-.143]]
 c['transform']['position']=[0,0,0];c['transform']['rotation']=[0,0,0];c['dimensions'].update(w=1,h=1,d=1)
 c['geometry']['nativeRecipe']={'kind':'tail-lock','rootUV':[.75,.90],'controls':controls,'width':.056 if idx==0 else .024,'thickness':.038 if idx==0 else .020,'samples':48,'radialSegments':12,'tipRatio':.04}
 c['hairRootBinding']={'u':.75,'v':.9,'consumedBy':'round4/compile_surfaces.py','note':'Head-rooted to posterior tie; hidden rear form inferred.'}
b['hair-tie']['transform']['position']=[0,.108,-.09]
s['round4Correction2']={'headControlSections':keys,'interpolation':'C1 cubic Hermite, 96 samples','nativeSurfaceCompiler':'round4/compile_surfaces.py','sourceEvidence':['.img2babylon/shots/round4-c1-head.png','.img2babylon/shots/round4-c1-full.png'],'status':'awaiting new eight-view GPU evidence'}
changed=[c['id'] for c,p in zip(s['componentTree'],old['componentTree']) if c!=p]
for cid in changed:b[cid]['optimization']['lastChange']='round4 c2: rejected c1 facial ledge, hair wedge and shoulder/knee continuity remediation'
s['reviewHistory'].append({'passId':'blockout','round':4,'action':'refine-spec','summary':'C1 visually REJECTED by desktop: horizontal cheek ledge, straight scalp border, jagged fringe and cheek intrusion, shoulder/knee gaps. C2 corrective geometry; no passing likeness score.','evidence':s['round4Correction2']['sourceEvidence'],'mismatches':['C1 rejected; full c2 GPU batch pending'],'desktopEvidence':{'browserRender':True,'consoleErrors':[],'nativeFactoryActive':True,'provenance':'user desktop feedback','sha256':{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in s['round4Correction2']['sourceEvidence']}}})
(M/'spec.json').write_text(json.dumps(s,indent=2,ensure_ascii=False)+'\n')
(D/'changes.json').write_text(json.dumps({'round':4,'correction':2,'changedPartIDs':changed,'stableIDs':125,'added':[],'removed':[]},indent=2)+'\n')
