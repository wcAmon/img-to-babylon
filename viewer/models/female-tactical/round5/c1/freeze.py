from pathlib import Path
import json,hashlib,shutil,datetime
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];P=ROOT/'viewer/public/female-tactical-round5';P.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
views=[]
for name in ['hero','front','right','rear','left','face','face-plus','face-minus','orbit-plus','orbit-minus','rear-quarter']:
 src=ROOT/'viewer/public/female-tactical-round4'/f'c6-{name}.json';dest=P/f'c1-{name}.json';shutil.copyfile(src,dest)
 views.append({'id':name,'path':str(dest.relative_to(ROOT)),'sha256':sha(dest),'sameAsC6Sha256':sha(src),'camera':read(dest),'url':f'http://127.0.0.1:5182/#model=female-tactical&physics=0&shot=1&exportPNG=1&reviewCamera=/female-tactical-round5/c1-{name}.json&reviewPass=beauty'})
inputs={n:sha(M/n) for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','createFemaleTacticalModel.ts','round5/compile_surfaces.py','iteration.json','reference/female.png','round5/c1/author.py','round5/c1/rebuild.sh','round4/prepare.py']}
a=read(D/'attachments.json');g=read(D/'geometry.json');v=read(D/'visibility.json');si=read(D/'self-intersection.json');changes=read(D/'changes.json');tri=sum(x['triangles'] for x in g['checks'])
assert read(D/'strict.json')['ok'] and read(D/'physics.json')['pass'] and tri<=35000
assert all(x['degenerateTriangles']==0 and x['normalDisagreements']==0 for x in g['checks'])
assert all(x['missingSupport']==0 and x['interiorOccludedSamples']==0 for x in v['features'])
checks={'strict':True,'typecheck':'passed','build':'passed','Havok':'passed single55kg compound body','nativeInspection':'passed including immutable source/repeated create','invalidTriangles':0,'normalDisagreements':0,'faceSurfaceVisibility':'all14 layers have positive sampled clearance; no missing support or occluded interior samples','hairRoots':a['rootPass'],'hairCoverage':{'pass':a['coveragePass'],'samples':a['sampleCount'],'exposedFraction':a['exposedAreaFraction'],'profile':'frontV .80 sides .49 rear .23'},'hairNonRootClearance':a['clearancePass'],'selfIntersection':{k:si[k] for k in ['meshCount','sampledVertexCount','insideVertexCount','undecidedVertexCount','selfIntersecting']}}
gates=['Actual R5 C1 GPU 11views and map-stripped diagnostics pending; no likeness acceptance','7 undecided self-intersection samples; full assembly penetration not passed','New fringe/hairline silhouette and face proportions need original-reference review','Manual reference landmarks have yaw/occlusion uncertainty; rear hair inferred','No further model edits after freeze until desktop feedback; round5 five corrections remain']
manifest={'modelId':'female-tactical','round':5,'correction':1,'limit':6,'remaining':5,'lifetimeCorrections':22,'frozenAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pass':'blockout','workflowStatus':'active render-capture','visualStatus':'unaccepted visual-review-required','viewport':[585,1024],'devicePixelRatio':1,'inputs':inputs,'sharedGeneratorSha256':sha(ROOT/'pipeline/forge/stage3_build/generate_babylon_factory.py'),'workflowSha256':sha(ROOT/'.img2babylon/female-tactical/pipeline/workflow.json'),'views':views,'changedPartIDs':changes['changedPartIDs'],'dependentGeometryChanges':changes['dependentGeometryChanges'],'parts':125,'triangles':tri,'checks':checks,'remainingGates':gates,'captureInstructions':['All cameras byte-identical C6; viewport585x1024 DPR1, port5182 physics0 shot1 exportPNG1','Save/read .img2babylon/shots/round5-c1-<view>.png; record fresh PNG hashes and errors','Capture required map-stripped diagnostics; no stale screenshot hashes','Frozen until desktop feedback; no auto new round']}
save(D/'capture-handoff.json',manifest);save(P/'c1-batch.json',manifest)
save(D/'triangle-budget.json',{'totalTriangles':tri,'max':35000,'parts':[{'id':x['id'],'triangles':x['triangles'],'optimizationPath':f'spec.json#/componentTree/{x["id"]}/optimization'} for x in g['checks']]})
(D/'HANDOFF.md').write_text(f'''# Frozen round5 C1 desktop handoff

Round5 **1/6**, lifetime22, remaining5. Same125 IDs; {tri:,} triangles. Native workflow active at render-capture; blockout and likeness unaccepted.

Use `viewer/public/female-tactical-round5/c1-batch.json` all11 views585×1024 DPR1. Camera files are byte-identical C6, including face± and body±35/rear135; no reframing. Exact URLs, source/camera SHA256 and changed IDs: `capture-handoff.json`. Port5182 physics=0 shot=1 exportPNG=1.

Manual reference landmarks and confidence are persisted in `measurements.json`. Eye width .041→.048m, eye centres4mm lower, mouth .037→.044m; angular brows repositioned with the larger eyes. Continuous jaw section shortened about10mm; head14mm lower and neck8mm shorter for collar integration. All working C5 surface-derived eye/lip layers preserved, no scalar depth placement. Hair cap frontal boundary raised to expose asymmetric scalp-bound swept locks and tips; layered locks have independent paths and volume, high ponytail arc enlarged. Hidden rear forms remain inferred.93 native meshes outside this local correction are unchanged; body/gear/boots recipes retained.

Compiler is now persisted at `round5/compile_surfaces.py` for independent evolution; root dedup generator unchanged. `author.py` consumes exact current archived canonical source; `rebuild.sh` gives full exporter/importer → persisted canonical intake augmentation (`round4/prepare.py canonical`) → round5 recipe compiler → strict native generator chain. No temporary seed or alternate renderer. Standard materials unchanged; no PBR claim.

Strict, final typecheck/build, inspector including immutable source/repeated-create, and real Havok settling passed. All14 feature layers have positive actual triangle-interior clearance; no sampled burial or missing support. Root/cap and non-root skull clearance tests pass. Full authored hairline coverage1435samples, exposed area{a['exposedAreaFraction']:.4%} below unchanged5% threshold; changed front boundary is explicitly documented. First ponytail had one normal conflict; retained in `geometry-before-tail-fix.json`. Local curvature thickness limit fixed it; final zero normal conflicts/degenerate triangles.18 changed closed meshes1499samples: no detected self-intersection, **7 undecided samples remain**; no comprehensive geometry or visual pass.

Round4 final source snapshots, actual GPU evidence and nonaccepted review archived in `../round4-archive/`; original round4 history remains intact. `iteration.json` updated for round5 1/6 and current canonical/optimization paths. Full reference likeness, off-axis silhouette and material/diagnostic gates remain unaccepted.

Factory SHA256: `{inputs['createNativeFemaleTactical.ts']}`

Save/read actual `round5-c1-<view>.png` images and diagnostics; do not reuse prior hashes. **Frozen. No further source/model/compiler edits until desktop feedback.**
''')
print(views[0]['url']);print('factory',inputs['createNativeFemaleTactical.ts']);print('manifest',sha(D/'capture-handoff.json'))
