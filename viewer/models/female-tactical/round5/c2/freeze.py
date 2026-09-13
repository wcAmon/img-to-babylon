from pathlib import Path
import json,hashlib,shutil,datetime
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];P=ROOT/'viewer/public/female-tactical-round5';P.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
views=[]
for name in ['hero','front','right','rear','left','face','face-plus','face-minus','orbit-plus','orbit-minus','rear-quarter']:
 src=ROOT/'viewer/public/female-tactical-round4'/f'c6-{name}.json';dest=P/f'c2-{name}.json';shutil.copyfile(src,dest)
 views.append({'id':name,'path':str(dest.relative_to(ROOT)),'sha256':sha(dest),'sameAsC6Sha256':sha(src),'camera':read(dest),'url':f'http://127.0.0.1:5182/#model=female-tactical&physics=0&shot=1&exportPNG=1&reviewCamera=/female-tactical-round5/c2-{name}.json&reviewPass=beauty'})
inputs={n:sha(M/n) for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','createFemaleTacticalModel.ts','round5/compile_surfaces.py','iteration.json','reference/female.png','round5/c2/author.py','round5/c2/rebuild.sh','round4/prepare.py']}
a=read(D/'attachments.json');g=read(D/'geometry.json');v=read(D/'visibility.json');si=read(D/'self-intersection.json');changes=read(D/'changes.json');tri=sum(x['triangles'] for x in g['checks'])
assert read(D/'strict.json')['ok'] and read(D/'physics.json')['pass'] and tri<=35000
assert all(x['degenerateTriangles']==0 and x['normalDisagreements']==0 for x in g['checks'])
assert all(x['missingSupport']==0 and x['interiorOccludedSamples']==0 for x in v['features'])
checks={'strict':True,'typecheck':'passed','build':'passed','Havok':'passed single55kg compound body','nativeInspection':'passed including immutable source/repeated create','invalidTriangles':0,'normalDisagreements':0,'faceSurfaceVisibility':'all14 layers have positive sampled clearance; no missing support or occluded interior samples','hairRoots':a['rootPass'],'hairCoverage':{'pass':a['coveragePass'],'samples':a['sampleCount'],'exposedFraction':a['exposedAreaFraction'],'profile':'frontV .80 sides .49 rear .23'},'hairNonRootClearance':a['clearancePass'],'selfIntersection':{k:si[k] for k in ['meshCount','sampledVertexCount','insideVertexCount','undecidedVertexCount','selfIntersecting']}}
gates=['Actual R5 C2 GPU 11views and map-stripped diagnostics pending; no likeness acceptance','4 undecided self-intersection samples; full assembly penetration not passed','New fringe/hairline silhouette and face proportions need original-reference review','Manual reference landmarks have yaw/occlusion uncertainty; rear hair inferred','No further model edits after freeze until desktop feedback; round5 four corrections remain']
manifest={'modelId':'female-tactical','round':5,'correction':2,'limit':6,'remaining':4,'lifetimeCorrections':23,'frozenAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pass':'blockout','workflowStatus':'active render-capture','visualStatus':'unaccepted visual-review-required','viewport':[585,1024],'devicePixelRatio':1,'inputs':inputs,'sharedGeneratorSha256':sha(ROOT/'pipeline/forge/stage3_build/generate_babylon_factory.py'),'workflowSha256':sha(ROOT/'.img2babylon/female-tactical/pipeline/workflow.json'),'views':views,'changedPartIDs':changes['changedPartIDs'],'dependentGeometryChanges':changes['dependentGeometryChanges'],'parts':125,'triangles':tri,'checks':checks,'remainingGates':gates,'captureInstructions':['All cameras byte-identical C6; viewport585x1024 DPR1, port5182 physics0 shot1 exportPNG1','Save/read .img2babylon/shots/round5-c2-<view>.png; record fresh PNG hashes and errors','Capture required map-stripped diagnostics; no stale screenshot hashes','Frozen until desktop feedback; no auto new round']}
save(D/'capture-handoff.json',manifest);save(P/'c2-batch.json',manifest)
save(D/'triangle-budget.json',{'totalTriangles':tri,'max':35000,'parts':[{'id':x['id'],'triangles':x['triangles'],'optimizationPath':f'spec.json#/componentTree/{x["id"]}/optimization'} for x in g['checks']]})
(D/'HANDOFF.md').write_text(f"""# Frozen round5 C2 handoff

Round5 **2/6**, lifetime23, remaining4. Same125 IDs, {tri:,} triangles. Blockout remains unaccepted and active at render-capture.

Batch: `viewer/public/female-tactical-round5/c2-batch.json`. All11 cameras exactly C1/C6 parameters,585×1024 DPR1; port5182 physics=0 shot=1 exportPNG=1. Exact source/camera hashes and20 changed geometry IDs in `capture-handoff.json` / `changes.json`.105 other native meshes unchanged, including ponytail, body and gear.

C2 creates a narrowed connected nasal bridge, rounded projecting tip, bilateral lateral wings and tiny nostril folds on the same head loft.80 angular sections plus8 local nose rings resolve the depth field; jaw silhouette, eye/mouth sizes and placement are preserved. Shallow under-eye/outer-orbit relief blends into cheeks. Brows now have thicker medial body, outer-third apex and tapered tail, conforming to actual head surface.

Frontal locks now cross the cap boundary with staggered tips. Main tip UV(.085,.49) lies below the local cap frontier; `fringe-boundary.json` records all five endpoints. Main sweep and opposite descending temple lock remain scalp-rooted. Six-sided flattened facets are actually consumed by the compiler through hard face normals, not metadata-only styling. Ponytail is preserved. No material/roughness/PBR claims.

Strict/typecheck/build, immutable-source/repeated-create inspector and real Havok settling passed; same single55kg compound. Zero degenerate triangles/normal conflicts. All14 surface feature layers have positive sampled support clearance and no missing support/burial. Full authored hairline coverage1435samples, exposure0.4362% against unchanged5% limit, all11root contacts and no non-root skull intrusion. Faceted lock roots are read from actual duplicated root-cap triangles, not obsolete first-ring indexing. No whole-hair exceptions.

Bounded self-test:6 changed closed meshes,551samples, no detected self-intersection, **4 undecided samples remain**. Full assembly penetration and rendered likeness are not passed. Front-layer visibility samples do not guarantee off-axis expression. Desktop must read new actual GPU beauty and map-stripped diagnostics before any acceptance.

C1 source snapshots, actual11GPU images/comparison, Tier1/multi reports, hashes and nonaccepted review archived in `../c1-archive/`. Historical failures remain. Original reference manual nose/fringe measurements and uncertainties are persisted in `measurements.json`. `iteration.json` and native workflow reflect2/6,total23.

Replay: `rebuild.sh` uses readable spec → legacy recipe data export/canonical import → persisted canonical augmentation → `round5/compile_surfaces.py c2` → updated root native generator. Exact legacy recipes remain in canonical extension source; dedup generator unchanged, no hidden seed/renderer or external services.

Factory SHA256: `{inputs['createNativeFemaleTactical.ts']}`

Save/read `.img2babylon/shots/round5-c2-<view>.png` and record fresh hashes/errors. **Frozen; no source/model/compiler edits until desktop feedback.**
""")
print(views[0]['url']);print('factory',inputs['createNativeFemaleTactical.ts']);print('manifest',sha(D/'capture-handoff.json'))
