"""Model-specific readable round4 authoring; no baked vertex edits. Python stdlib only."""
from pathlib import Path
import json, sys, copy, math
ROOT=Path(__file__).resolve().parents[4]
MODEL=ROOT/'viewer/models/female-tactical'
WORK=ROOT/'.img2babylon/female-tactical/pipeline'
sys.path.insert(0,str(ROOT/'pipeline'))
from forge.stage2_spec.new_sculpt_spec import make_spec, make_character_build_passes, make_character_feature_targets

def save(p,v): p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
def intake():
 a=json.loads((WORK/'assessment-seed.json').read_text()); p=a['preSpecAssessment']
 p['objectClass']={'primaryType':'stylized female tactical character','primaryDomain':'character','formLanguage':['organic','fabric-like','character-like'],'structureKind':['compound object','layered shell'],'motionPotential':['whole-object transform'],'materialFamilies':['skin-like','cloth','rubber','mixed'],'notes':'Measured approved female.png; static compound body; no animated skeleton.'}
 p['complexity']['scores']=dict(zip(p['complexity']['scores'],[3,3,2,2,3,2,3,1]))
 p['complexity']['estimatedCounts']={'macroComponents':17,'mesoComponents':50,'microFeatureGroups':12,'materialLayers':13,'repetitionSystems':3}
 p['complexity']['reasoning']=['Layered tactical gear, continuous head/cloth surfaces and swept ponytail; single-view occlusion limits back geometry.']
 p['specDepthDecision']['rationale']='Named continuous anatomy and fabric volumes with separate carrier, pouches, straps and facial feature shells.'
 p['unknownsToResolveBeforeImplementation']=[]
 p['acceptedSingleViewInferences']=['Back geometry and depth inferred as authorized; camera GPU overlay and fine feature refinement remain review gates.']
 p['anatomy']={'applies':True,'source':'manual-reference-pixel-measurements','styleHeads':901/118,'proportions':{'headUnit':118/1024,'torso':340/118,'legs':561/118,'shoulderWidth':243/118,'hipWidth':177/118},'pose':{'type':'relaxed wide stance, elbows slightly flexed, hands at lateral thighs','jointAngles':{},'note':'Projected joint readings in intake.md; do not claim solved skeletal angles.'},'faceLandmarks':{'eyeLine':67/118,'eyeSpacing':.18,'noseBase':88/118,'mouthLine':102/118,'hairline':31/118},'features':['tapered jaw','cheek planes','almond eyes','swept high ponytail'],'confidence':.72,'evidenceRef':'round4/intake.md','note':'Manual measurements, not guide detections; head depth and obscured anatomical crown inferred.'}
 p['detailInventory']={'scanMethod':'component-zones','targetMinDetails':10,'details':[]}
 details=[('collar-l','ridge','raised orange collar',[.41,.17,.15,.07]),('molle-front-0','seam','stacked vest webbing',[.45,.24,.18,.06]),('pouch-flap-0','seam','pouch flap',[.45,.30,.06,.05]),('pouch-tab-0','ridge','pouch closure tab',[.48,.33,.025,.03]),('belt-buckle','bevel','central buckle',[.50,.39,.07,.035]),('knee-shell-l','bevel','faceted knee shell',[.29,.62,.12,.075]),('lace-l-0','ridge','crossed boot laces',[.20,.84,.085,.055]),('boot-accent-l','contour','teal boot side panel',[.20,.83,.025,.06]),('eyelid-l','contour','almond upper lid',[.475,.124,.04,.016]),('upper-lip','ridge','cupid bow lip volume',[.49,.16,.055,.015]),('fringe-sweep','ridge','broad swept lock',[.43,.07,.15,.06]),('hair-tie','contour','teal high tie',[.45,.06,.04,.015])]
 source=json.loads((MODEL/'spec.json').read_text()); ids={c['id'] for c in source['componentTree']}
 for cid,kind,name,region in details:
  if cid not in ids: raise ValueError(cid)
  p['detailInventory']['details'].append({'id':cid+'-observed','kind':kind,'name':name,'region':region,'evidenceRef':'reference/female.png','confidence':.75,'mapsTo':{'ref':cid+'/reference-form'},'implementation':'existing recipe geometry; visual adequacy pending'})
 a['qualityContract']['definitionOfDone']=['Approved reference proportions, tapered facial planes and coherent brown swept ponytail; orange shirt/navy vest/teal accents; named parts and stable 55kg compound body.','All fixed/orbit/face GPU images reviewed; no inference promoted to observed evidence; no gate bypass.']
 a['referenceCamera']={'solved':False,'fovDegrees':28,'aspect':585/1024,'orientation':{'yaw':-12,'pitch':2,'roll':0},'note':'Authored framing candidate; GPU calibration pending. See round4/intake.md.'}
 a['suitability']='conditional'; save(MODEL/'round4/assessment.json',a); save(MODEL/'round4/landmarks.json',p['anatomy'])

def canonical():
 s=json.loads((MODEL/'canonical-spec.json').read_text()); a=json.loads((MODEL/'round4/assessment.json').read_text()); seed=make_spec('female-tactical',s['sourceImage'],a)
 for k in ['preSpecAssessment','qualityContract','localSpecSearch','qualityTargets','selfCorrectLoop','lookDevTargets','sculptPipeline']: s[k]=seed[k]
 s['referenceCamera']=a['referenceCamera']; ids=[c['id'] for c in s['componentTree']]
 s['buildPasses']=make_character_build_passes()
 s['buildPasses'].insert(2,{'id':'structural-pass','goal':'Verify separate gear and continuous anatomy assembly','componentRefs':['torso','head','vest-front'],'acceptance':['No detached parts or unintended surface seams.']})
 for p in s['buildPasses']: p['componentRefs']=ids if p['id']=='blockout' else [i for i in p['componentRefs'] if i in ids] or ['torso']
 s['buildPasses'][0]['goal']='Refine existing macro head/body/hair silhouette; retain all imported detail as unapproved carry-forward context.'
 s['sculptPipeline']['passOrder']=[p['id'] for p in s['buildPasses']]
 s['featureReviewTargets']=make_character_feature_targets()
 remap={'root':'torso','chest':'torso','eye-l':'eye-white-l','eye-cavity-l':'head','pants':'pelvis','shoes':'boot-l'}
 for t in s['featureReviewTargets']: t['componentRefs']=[remap.get(i,i) for i in t['componentRefs']]
 s['featureReviewTargets'].append({'id':'scalp-and-swept-silhouette','name':'Scalp attachment and swept hair silhouette','tier':'critical','passIds':['blockout','feature-placement'],'minimumScore':.75,'mustPass':True,'componentRefs':['head','hair-cap','fringe-sweep','ponytail'],'evidenceRefs':['reference/female.png']})
 for c in s['componentTree']:
  g=c['extensions']['babylon-sculpt-v1']['source']['geometry']; cid=c['id']
  c['topologyClass']='assembled-solid' if g['kind']=='box' else 'surface-relief' if g['kind']=='patch' else 'continuous-sculpt'
  c['topologyRationale']='Discrete authored gear solid.' if g['kind']=='box' else 'Existing finite facial surface overlay; not closed volume.' if g['kind']=='patch' else 'Continuous procedural ring/ellipsoid volume; no box substitution.'
  c['primaryGeometryLayer']='L3' if g['kind']=='box' or c.get('group')=='hair' else 'L2' if 'eye' in cid or 'iris' in cid or 'pupil' in cid else 'L0' if cid in ['head','neck'] or 'forearm' in cid else 'L4'
  c['evidenceRefs']=['reference/female.png','round4/intake.md']; c['localFeatures']=[{'id':'reference-form','type':'geometry','description':'Authored geometry recipe consumed through nativeVertexData; '+c['name']}]
  m=next(m for m in s['materials'] if m['id']==c['material'])
  rgb=m['extensions']['babylon-sculpt-v1']['baseColorRGB']; rgba='rgba(%d, %d, %d, 1)'%tuple(round(v*255) for v in rgb)
  mc='skin' if c['material'] in ['skin','lips'] else 'fabric' if c['material'] in ['orange','navy','pants','teal'] else 'rubber' if c['material']=='sole' else 'metal' if c['material']=='steel' else 'unknown'
  c['colorMaterialRecipe']={'dominantAlbedo':rgba,'secondaryAlbedo':rgba,'materialClass':mc,'materialClassConfidence':.65,'evidenceRefs':['reference/female.png','round4/intake.md'],'note':'Retained legacy numeric RGB, not extracted albedo. Palette/PBR review pending.'}
  c['inference']={'hiddenBack':True,'confidence':.25} if 'back' in cid else {'visibleReference':True,'confidence':.75}
 # Preserve malformed original evidence object exactly in archival source; normalize only canonical interface.
 for i,r in enumerate(s.get('reviewHistory',[])):
  if isinstance(r.get('evidence'),(dict,str)):
   r['legacyEvidenceObject']=r['evidence']; r['evidence']=['extensions.babylon-sculpt-v1.source.reviewHistory[%d].evidence'%i]
 s['referenceHistory']=[{'path':'reference/female.png','authority':'approved','unchanged':True}]
 s['lookDevTargets']['materialPass']['acceptedLimitation']='PBR extraction and conversion deferred to locked material-pass; exact legacy StandardMaterial preserved at blockout.'
 s['lookDevTargets']['materialPass']['albedoPalette']=['#E97835','#30394A','#53617F','#268B9D','#352923']
 s['lookDevTargets']['lightingPass']['lights']=[{'type':'directional','role':'key','position':[-3,5,4],'intensity':1},{'type':'hemisphere','role':'fill','intensity':.5},{'type':'directional','role':'rim','position':[2,3,-3],'intensity':.3}]
 s['lightingFromPhoto']=s['lookDevTargets']['lightingPass']['lights']+[{'exposure':1,'toneMapping':'neutral capture initially; match pending','contact shadow':'ground shadow required in GPU review'}]
 # These are lookdev intents, not material modifications or claimed extracted maps.
 for m in s['materials']:
  m['textureless']={'declared':True,'evidence':['reference/female.png: visible regions show solid color zones with faceted geometry and lighting, no resolved print, grain, pores or weave at 585x1024; round4/intake.md.']}
  m['colorVariation']={'referencePalette':s['lookDevTargets']['materialPass']['albedoPalette'],'realization':'separate existing component material regions; not procedural noise'}
  m['localOverrides']=[{'id':'reference-zone','type':'color-zone','description':'Existing separate material region; exact legacy RGB retained; roughness intent pending material pass.'}]
 s['repetitionSystems']=[{'id':'vest-webbing','componentRefs':[i for i in ids if i.startswith('molle-')],'realization':'existing-components','buildsGeometry':True,'distribution':'four parallel rows, already authored; no duplicate emission'}]
 save(MODEL/'canonical-spec.json',s)


def refine():
 # Read exact archival recipe authority; refuse repeating the first correction.
 s=json.loads((MODEL/'canonical-spec.json').read_text())['extensions']['babylon-sculpt-v1']['source']
 if s.get('round4Recipe'): raise ValueError('First correction already authored; use next and new review before further edits')
 before=copy.deepcopy(s); by={c['id']:c for c in s['componentTree']}
 head=by['head']; g=head['geometry']
 # Continuous skull/jaw planes. Broad zygoma and a defined tapered chin, not an oval.
 keys=[[-.5,.16,.21,0,.025],[-.44,.23,.29,0,.03],[-.32,.355,.38,0,.005],[-.20,.425,.43,0,-.008],[-.08,.505,.47,0,0],[.04,.50,.49,0,0],[.18,.47,.49,0,0],[.30,.445,.48,0,0],[.4,.36,.41,0,0],[.47,.21,.25,0,0],[.5,.08,.10,0,0]]
 def interp(y):
  lo,hi=next((a,b) for a,b in zip(keys,keys[1:]) if a[0]-1e-9<=y<=b[0]+1e-9)
  t=(y-lo[0])/(hi[0]-lo[0]); return [y]+[a+(b-a)*t for a,b in zip(lo[1:],hi[1:])]
 g['rings']=[interp(-.5+i/64) for i in range(65)]
 g['relief']=[{'center':[0,-.045],'radius':[.067,.17],'depth':.080},{'center':[0,-.16],'radius':[.09,.065],'depth':.065}]
 for side in [-1,1]:
  g['relief'] += [{'center':[side*.22,-.075],'radius':[.16,.095],'depth':.037},{'center':[side*.20,.055],'radius':[.12,.055],'depth':-.030}]
 by['torso']['dimensions']['w']=.385
 by['torso']['geometry']['rings']=[[-.5,.34,.42],[-.28,.345,.44],[.12,.46,.5],[.36,.50,.47],[.50,.435,.36]]
 by['pelvis']['dimensions']['w']=.32
 by['pelvis']['geometry']['rings']=[[-.5,.34,.35],[-.3,.44,.46],[0,.50,.50],[.3,.47,.48],[.5,.36,.38]]
 for side,sign in [('l',1),('r',-1)]:
  arm=by['upper-arm-'+side]; arm['transform']['position'][0]=sign*.224
  arm['geometry']['rings']=[[-.5,.38,.40],[-.36,.49,.48],[-.21,.42,.44],[.03,.50,.50],[.26,.49,.47],[.43,.43,.43],[.5,.32,.34]]
  thigh=by['thigh-'+side]; thigh['geometry']['rings']=[[-.5,.34,.35],[-.32,.39,.40],[-.12,.46,.48],[.13,.51,.5],[.32,.515,.48],[.5,.49,.45]]
  calf=by['calf-'+side]; calf['transform']['position'][0]=sign*.174
  calf['geometry']['rings']=[[-.5,.31,.32],[-.37,.37,.35],[-.26,.45,.41],[-.05,.48,.47],[.17,.50,.5],[.33,.43,.43],[.5,.35,.40]]
  # Preserve child equipment relative to its limb. Shift foot below widened stance.
  by['boot-'+side]['transform']['position'][0]+=sign*.018
 by['eye-glint-l']['transform']['position'][0]=abs(by['eye-glint-r']['transform']['position'][0])
 # Cover only anatomical crown; offset head-derived ring sections, no whole-mass widening.
 cap=by['hair-cap']; cap['transform']['position']=[0,0,0]; cap['dimensions'].update(w=1,h=1,d=1)
 caprings=[]
 for y,rx,rz,cx,cz in g['rings']:
  if y < .20: continue
  caprings.append([y*.235+.004,rx*.172+.005,rz*.174+.005,0,cz*.174])
 caprings.append([.129,.006,.008,0,-.001])
 cap['geometry']={'kind':'loft','segments':64,'rings':caprings,'smooth':True}
 # Root-bound swept locks: u is azimuth, v bottom-to-top on the head ring field.
 sys.path.insert(0,str(ROOT/'pipeline/forge/_shared'))
 from scalp_field import ScalpField
 field=ScalpField([[y*.235,rx*.172,rz*.174,cz*.174] for y,rx,rz,cx,cz in g['rings']])
 bindings=[]
 # Reuse surviving lock IDs. Five continuous broad sweeps replace competing jagged blades.
 locks=[('fringe-sweep',.30,.92,.072,.024,[.064,.023,.074]),('fringe-layer-0',.34,.95,.036,.016,[.060,.041,.071]),('fringe-layer-1',.29,.96,.038,.016,[.044,.050,.083]),('fringe-layer-2',.24,.95,.034,.015,[.018,.068,.091]),('fringe-side',.12,.82,.022,.016,[-.078,-.022,.040])]
 for cid,u,v,width,depth,tip in locks:
  root=list(field.sample(u,v)); root[1]+=.004
  c=by[cid]; c['transform']['position']=[0,0,0]; c['dimensions'].update(w=1,h=1,d=1)
  rings=[]
  # Decreasing y guide is sampled then stored ascending for the legacy loft compiler.
  for j in range(13):
   t=j/12; blend=t*t*(3-2*t)
   x=root[0]+(tip[0]-root[0])*blend; y=root[1]+(tip[1]-root[1])*t; z=root[2]+(tip[2]-root[2])*blend+.019*math.sin(math.pi*t)
   taper=(1-t)**.65; rx=max(.0006,width*.5*taper); rz=max(.0006,depth*.5*taper)
   rings.append([y,rx,rz,x,z])
  c['geometry']={'kind':'loft','segments':12,'rings':sorted(rings),'smooth':True}
  binding={'id':cid,'root':{'u':u,'v':v},'rootPoint':root,'tip':tip,'width':width,'thickness':depth,'rootEmbedDepth':.003,'uncalibrated':True}
  c['hairRootBinding']=binding; bindings.append(binding)
 s['round4Recipe']={'scope':'first macro blockout correction','headKeys':keys,'hairRoots':bindings,'scalpClearanceTarget':.004,'pending':'Actual scalp coverage and native geometry audit; GPU review required.'}
 changes=[]
 for c,old in zip(s['componentTree'],before['componentTree']):
  if c!=old:
   c['optimization']['lastChange']='round4 correction1: measured macro silhouette and scalp-bound sweep'
   changes.append(c['id'])
 # Count one authored correction without inventing a visual score or continue review.
 s['reviewHistory'].append({'passId':'blockout','round':4,'action':'refine-spec','summary':'First user-authorized native macro head/body/hair refinement; no new GPU capture or likeness score.','evidence':['round4/intake.md','round4/changes.json'],'mismatches':['Visual result pending desktop capture; facial micros and materials remain later passes.']})
 save(MODEL/'spec.json',s); save(MODEL/'round4/changes.json',{'round':4,'correction':1,'changedPartIDs':changes,'newPartIDs':[],'deletedPartIDs':[],'source':'canonical extensions[babylon-sculpt-v1].source','recipes':'spec.json round4Recipe + component geometry','materialChanges':[],'physicsChanges':[]})
 save(MODEL/'round4/hair-roots.json',bindings)

if __name__=='__main__': globals()[sys.argv[1]]()
