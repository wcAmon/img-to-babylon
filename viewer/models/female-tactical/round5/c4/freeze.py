from pathlib import Path
import json,hashlib,shutil,datetime
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];P=ROOT/'viewer/public/female-tactical-round5';P.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
views=[]
for name in ['hero','front','right','rear','left','face','face-plus','face-minus','orbit-plus','orbit-minus','rear-quarter']:
 src=ROOT/'viewer/public/female-tactical-round4'/f'c6-{name}.json';dest=P/f'c4-{name}.json';shutil.copyfile(src,dest)
 views.append({'id':name,'path':str(dest.relative_to(ROOT)),'sha256':sha(dest),'sameAsC6Sha256':sha(src),'camera':read(dest),'url':f'http://127.0.0.1:5182/#model=female-tactical&physics=0&shot=1&exportPNG=1&reviewCamera=/female-tactical-round5/c4-{name}.json&reviewPass=beauty'})
inputs={n:sha(M/n) for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','createFemaleTacticalModel.ts','round5/compile_surfaces.py','iteration.json','reference/female.png','round5/c4/author.py','round5/c4/rebuild.sh','round4/prepare.py']}
a=read(D/'attachments.json');g=read(D/'geometry.json');v=read(D/'visibility.json');si=read(D/'self-intersection.json');changes=read(D/'changes.json');tri=sum(x['triangles'] for x in g['checks'])
assert read(D/'strict.json')['ok'] and read(D/'physics.json')['pass'] and tri<=35000
assert all(x['degenerateTriangles']==0 and x['normalDisagreements']==0 for x in g['checks'])
assert all(x['missingSupport']==0 and x['interiorOccludedSamples']==0 for x in v['features'])
checks={'strict':True,'typecheck':'passed','build':'passed','Havok':'passed single55kg compound body','nativeInspection':'passed including immutable source/repeated create','invalidTriangles':0,'normalDisagreements':0,'faceSurfaceVisibility':'all14 layers have positive sampled clearance; no missing support or occluded interior samples','hairRoots':a['rootPass'],'hairCoverage':{'pass':a['coveragePass'],'samples':a['sampleCount'],'exposedFraction':a['exposedAreaFraction'],'profile':'frontV .80 sides .49 rear .23'},'hairNonRootClearance':a['clearancePass'],'selfIntersection':{k:si[k] for k in ['meshCount','sampledVertexCount','insideVertexCount','undecidedVertexCount','selfIntersecting']}}
gates=['Actual R5 C4 GPU 11views and map-stripped diagnostics pending; no likeness acceptance','1 undecided self-intersection samples; full assembly penetration not passed','New fringe/hairline silhouette and face proportions need original-reference review','Manual reference landmarks have yaw/occlusion uncertainty; rear hair inferred','No further model edits after freeze until desktop feedback; round5 two corrections remain']
manifest={'modelId':'female-tactical','round':5,'correction':4,'limit':6,'remaining':2,'lifetimeCorrections':25,'frozenAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pass':'blockout','workflowStatus':'active render-capture','visualStatus':'unaccepted visual-review-required','viewport':[585,1024],'devicePixelRatio':1,'inputs':inputs,'sharedGeneratorSha256':sha(ROOT/'pipeline/forge/stage3_build/generate_babylon_factory.py'),'workflowSha256':sha(ROOT/'.img2babylon/female-tactical/pipeline/workflow.json'),'views':views,'changedPartIDs':changes['changedPartIDs'],'dependentGeometryChanges':changes['dependentGeometryChanges'],'parts':125,'triangles':tri,'checks':checks,'remainingGates':gates,'captureInstructions':['All cameras byte-identical C6; viewport585x1024 DPR1, port5182 physics0 shot1 exportPNG1','Save/read .img2babylon/shots/round5-c4-<view>.png; record fresh PNG hashes and errors','Capture required map-stripped diagnostics; no stale screenshot hashes','Frozen until desktop feedback; no auto new round']}
save(D/'capture-handoff.json',manifest);save(P/'c4-batch.json',manifest)
save(D/'triangle-budget.json',{'totalTriangles':tri,'max':35000,'parts':[{'id':x['id'],'triangles':x['triangles'],'optimizationPath':f'spec.json#/componentTree/{x["id"]}/optimization'} for x in g['checks']]})
(D/'HANDOFF.md').write_text(f"""# Frozen round5 C4 selected stable combination

Round5 **4/6**, lifetime25, remaining2. Same125IDs, {tri:,} triangles. Visual acceptance **false**; blockout at render-capture. No fifth correction or new round authorized.

Batch `viewer/public/female-tactical-round5/c4-batch.json`: all11 cameras byte-identical C3/C2/C6,585×1024 DPR1. Port5182 physics=0 shot=1 exportPNG=1. Source/camera SHA256 and changed IDs are in `capture-handoff.json`.

Explicit user selection: restored **entire head.geometry** from `round5/c1-archive/spec.json.snapshot`, including every ring, relief field and resolution parameter. No speculative nose tuning. Head dimensions/transform already match C1 exactly. All C2 hair and brow recipes retained; C1 short jaw/head-neck/eye-mouth dimensions unchanged, unrelated body/materials unchanged.

`parity.json` compares actual executed native geometry. Head vertices/positions/indices/normals/worldNormals/worldMatrix are **exactly equal to C1**. Every hair part is **exactly equal to C2** by the same fields. C2 brow authored shape remains unchanged; like the other surface-mounted features its depth follows restored C1 support.110 other meshes unchanged against C3. No baked-array replacement or hidden frozen renderer.

C2 and C3 are visually rejected, not normalized into improvements: C2 produced a wide dark nasal shelf; C3 removed that shelf but erased the tip. C3 normal statistics did not prove visual improvement. C3 actual11images, reports, source snapshots and rejected review are archived in `../c3-archive/`; older failures remain. C1's actual GPU nose was selected by the user as the best stable version, not assigned a new passing likeness score.

Strict/typecheck/build, inspector including immutable source/repeated-create, and real Havok passed. Single55kg compound body unchanged. Zero degenerate triangles/normal conflicts. All14 dependent face layers have positive actual sampled support clearance, no missing support/burial. Hair attachment/coverage/non-root clearance checks pass. Head self-test96samples has no detected self-intersection but **1 undecided sample**; full assembly penetration and visual gates remain unpassed.

`author.py` documents exact selection; `rebuild.sh` replays readable source → canonical exact archival recipes → round5 compiler → root deduplicated native generator. No hidden temporary seed, service, material pass, browser or commits. `iteration.json` and native workflow synchronized4/6,total25.

Factory SHA256: `{inputs['createNativeFemaleTactical.ts']}`

Save/read `.img2babylon/shots/round5-c4-<view>.png` and fresh diagnostic hashes. **Frozen; no model/source/compiler changes after handoff until desktop feedback.**
""")
print(views[0]['url']);print('factory',inputs['createNativeFemaleTactical.ts']);print('manifest',sha(D/'capture-handoff.json'))
