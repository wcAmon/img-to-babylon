"""Freeze tested C5 inputs and byte-identical C4 cameras. No GPU acceptance."""
from pathlib import Path
import json,hashlib,shutil,datetime
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];P=ROOT/'viewer/public/female-tactical-round4'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
views=[]
for name in ['hero','front','right','rear','left','face','face-plus','face-minus','orbit-plus','orbit-minus','rear-quarter']:
 src=P/f'c4-{name}.json';dest=P/f'c5-{name}.json';shutil.copyfile(src,dest)
 views.append({'id':name,'path':str(dest.relative_to(ROOT)),'sha256':sha(dest),'sameAsC4Sha256':sha(src),'camera':read(dest),'url':f'http://127.0.0.1:5182/#model=female-tactical&physics=0&shot=1&exportPNG=1&reviewCamera=/female-tactical-round4/c5-{name}.json&reviewPass=beauty'})
inputs={n:sha(M/n) for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','createFemaleTacticalModel.ts','round4/compile_surfaces.py','reference/female.png']}
a=read(D/'attachments.json');g=read(D/'geometry.json');si=read(D/'self-intersection.json');v=read(D/'visibility.json');changes=read(D/'changes.json');tri=sum(x['triangles'] for x in g['checks'])
assert read(D/'strict.json')['ok'] and read(D/'physics.json')['pass'] and 25000<=tri<=30000
assert all(x['degenerateTriangles']==0 and x['normalDisagreements']==0 for x in g['checks'])
assert all(x['missingSupport']==0 and x['interiorOccludedSamples']==0 for x in v['features'])
assert all(x['interiorMaxGap']<=0 for x in v['gearAttachments'])
checks={'strict':True,'typecheck':'passed','productionBuild':'passed','Havok':'passed same55kg compound body','nativeInspection':'passed NullEngine isolate/explode/reset/pick/disposal; not GPU evidence','triangles':tri,'invalidTriangles':0,'normalDisagreements':0,'actualSurfaceVisibility':'visibility.json: positive interior depth for all14 face layers, no missing support; head occludes0 aperture samples','gearContact':'17 mounted parts; actual back-surface interior gaps -0.752 to -0.396mm; deliberate shallow seating, no floating gap','hairRoots':a['rootPass'],'hairCoverage':a['coveragePass'],'hairNonRootClearance':a['clearancePass'],'changedClosedSelfTest':{k:si[k] for k in ['meshCount','sampledVertexCount','insideVertexCount','undecidedVertexCount','selfIntersecting']}}
gates=['C5 fresh GPU 11views and map-stripped diagnostics pending; no visual acceptance','C4 visually REJECTED regression archived; prior Tier1 and geometry failure records preserved','Reference likeness and full assembly penetration gates remain unpassed','Front depth sampling does not certify off-axis visibility or rendered expression','One correction remains in round4; no automatic new round','Runtime duplication optimization pending: preserve exact source/provenance and coordinate any shared loader change with desktop owner']
manifest={'modelId':'female-tactical','frozenAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'round':4,'correction':5,'limit':6,'remaining':1,'lifetimeCorrections':20,'pass':'blockout','visualStatus':'unaccepted C5 GPU pending','viewport':[585,1024],'devicePixelRatio':1,'inputs':inputs,'views':views,'changedPartIDs':changes['changedPartIDs'],'newPartIDs':[],'removedPartIDs':[],'parts':125,'triangles':tri,'checks':checks,'remainingGates':gates,'captureInstructions':['Same exact C4 cameras all11, 585x1024 DPR1; port5182 physics0 shot1 exportPNG1','Reload and observe actual readiness/errors; record runtime input hashes','Save and read .img2babylon/shots/round4-c5-<view>.png; record new PNG hashes','Capture required map-stripped evidence separately; never reuse stale C4 screenshots','No model/factory/compiler edits after freeze until desktop resume']}
save(D/'capture-handoff.json',manifest);save(P/'c5-batch.json',manifest)
save(D/'triangle-budget.json',{'totalTriangles':tri,'target':[25000,30000],'parts':[{'id':x['id'],'triangles':x['triangles'],'optimizationPath':f'spec.json#/componentTree/{x["id"]}/optimization'} for x in g['checks']]})
archive=D.parent/'c4-archive';frozen=read(D.parent/'c4/capture-handoff.json')['inputs'];save(archive/'source-hash-readback.json',{n:{'frozenC4':h,'archivedSha256':sha(archive/(Path(n).name+'.snapshot')),'matches':sha(archive/(Path(n).name+'.snapshot'))==h} for n,h in frozen.items() if (archive/(Path(n).name+'.snapshot')).exists()})
size={n:(M/n).stat().st_size for n in inputs};chunks={str(p.relative_to(ROOT)):p.stat().st_size for p in (ROOT/'viewer/dist/assets').glob('*FemaleTacticalModel*.js')};save(D/'runtime-optimization.json',{'desktopReportedRuntimeDuplication':'approximately15MB; retained observation, not measured browser heap in this CLI','measuredLocalInputBytes':size,'measuredProductionModelChunksBytes':chunks,'sourceAndNativeDuplication':'exact source archived in canonical, readable spec and generated arrays coexist','optimizationPath':'After visual correction, design model-specific build artifact/source separation; preserve exact archival source and provenance, avoid shared loader edits without desktop ownership. Not implemented.','performanceGatePassed':False})
(D/'HANDOFF.md').write_text(f'''# C5 frozen desktop handoff

Round4 **5/6**, lifetime20, **one correction remaining**, blockout still unaccepted. Same125 IDs, {tri:,} triangles. No browser, new screenshots, commit or new round.

Batch: `viewer/public/female-tactical-round4/c5-batch.json`; all11 cameras byte-identical to C4 at585×1024 DPR1. Hero/front/right/rear/left/face/face±/fullbody±35/rear135 included. URLs use port5182, physics=0, shot=1, exportPNG=1. Exact camera JSON/hash, source hashes and 31changedPartIDs: `capture-handoff.json`.

C4 eleven GPU images, frozen source snapshots, SHA256 readback and actual rejected review are in `../c4-archive/`. No passing likeness score or changed threshold. C4 original head/jaw/nose and all hair remain exact; native geometry comparison verifies 94unchanged meshes including stance. Materials and one55kg physics remain unchanged.

C5 fixes eyelid topology: thin upper strip, no centre fan filling the eye. Shared eye aperture/bulge controls place warm sclera, brown iris, pupil and glint using actual compiled head triangle depths and ordered clearances. Lips use smooth widthwise strips with a shared closed seam, mild cupid bow and corners behind central volume. Features use finer local sampling only where curvature requires it. Early feature oversampling31,720 triangles was reduced purposefully to29,504; initial pouch smooth-normal conflict and glint support mismatch remain in `geometry-before-gear-normal-fix.json` and `visibility-before-density-fix.json`. Final geometry has zero degenerate triangles or normal conflicts.

Actual native triangle-interior visibility report: `visibility.json`. All14 feature layers have positive sampled depth above their support, minimum about0.283mm; no missing support, no occluded interior samples. Both eye apertures have readable frontmost sclera samples and zero head-occluded samples; this is numerical visibility only, not GPU likeness or off-axis acceptance. Upperlid coverage is a small rim rather than a black filled patch.

Eight MOLLE strips consume the actual front/back vest surfaces, with4mm thickness and0.5mm intended embedding. Three magazine bodies mount on the actual vest; six flap/tab components mount on actual magazine surfaces. Actual back-surface interior sampling finds -0.752 to -0.396mm seating, no floating gaps. Hard edge normals are deliberately split for gear. No blanket collision exemption.

Strict, final TypeScript/build, real Havok settling and root's native inspection test passed. Changed closed self-test:17 mounted parts,1480samples, no detected self-intersection and no undecided samples. Hair checks unchanged: all11 roots attached, coverage0.4258% exposure below5%, no non-root skull intrusion. These bounded tests do not pass full assembly penetration or visual gates. Open facial layers are surface-depth tested rather than incorrectly classified as closed volumes.

Runtime duplication TODO retained in `runtime-optimization.json`: desktop reports approximately15MB runtime duplication; local source sizes and actual production model chunk are recorded separately, without inventing browser-memory measurements. Source/archive preservation and root-owned runtime boundaries apply to future deduplication.

Factory SHA256: `{inputs['createNativeFemaleTactical.ts']}`

Capture current C5 beauty and required map-stripped diagnostics. Save `.img2babylon/shots/round4-c5-<view>.png`, read pixels back and record actual hashes. **Frozen; no further model/compiler/factory edits until desktop resumes.**
''')
print(views[0]['url']);print('factory',inputs['createNativeFemaleTactical.ts']);print('manifest',sha(D/'capture-handoff.json'))
