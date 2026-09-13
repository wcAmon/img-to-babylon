"""Freeze final authorized C6. Workflow remains stopped; diagnostics only after handoff."""
from pathlib import Path
import json,hashlib,shutil,datetime
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];P=ROOT/'viewer/public/female-tactical-round4'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
views=[]
for name in ['hero','front','right','rear','left','face','face-plus','face-minus','orbit-plus','orbit-minus','rear-quarter']:
 src=P/f'c5-{name}.json';dest=P/f'c6-{name}.json';shutil.copyfile(src,dest)
 views.append({'id':name,'path':str(dest.relative_to(ROOT)),'sha256':sha(dest),'sameAsC5Sha256':sha(src),'camera':read(dest),'url':f'http://127.0.0.1:5182/#model=female-tactical&physics=0&shot=1&exportPNG=1&reviewCamera=/female-tactical-round4/c6-{name}.json&reviewPass=beauty'})
inputs={n:sha(M/n) for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','createFemaleTacticalModel.ts','round4/compile_surfaces.py','iteration.json','reference/female.png','round4/c6/author.py','round4/c6/rebuild.sh']}
g=read(D/'geometry.json');vis=read(D/'visibility.json');si=read(D/'self-intersection.json');a=read(D/'attachments.json');changes=read(D/'changes.json');tri=sum(x['triangles'] for x in g['checks'])
assert read(D/'strict.json')['ok'] and read(D/'physics.json')['pass'] and tri<=30000
assert all(x['degenerateTriangles']==0 and x['normalDisagreements']==0 for x in g['checks'])
assert all(x['missingSupport']==0 and x['interiorOccludedSamples']==0 for x in vis['features'])
checks={'strict':True,'typecheck':'passed','productionBuild':'passed','Havok':'passed single55kg compound body; updated two boot bounds','nativeInspection':'passed including immutable sculptSpec after explode/dispose and repeated creation','invalidTriangles':0,'normalDisagreements':0,'actualFaceInteriorVisibility':'all14 layers positive support clearance; no missing support or occluded samples','gearAttachment':'preserved C5 geometry; actual sample evidence visibility.json','bootAttachment':'boot-attachments.json: tongue seated0.5mm; all32 lace endpoints overlap tongue envelope','hairRootCoverageClearance':[a['rootPass'],a['coveragePass'],a['clearancePass']],'changedClosedSelfTest':{k:si[k] for k in ['meshCount','sampledVertexCount','insideVertexCount','undecidedVertexCount','selfIntersecting']}}
gates=['No C6 GPU evidence yet; likeness/visual gates UNACCEPTED','C5 GPU fixes confirmed by desktop but not likeness accepted; all prior failed reviews preserved','2 undecided head self-test samples; full assembly penetration not passed','Approximate boot collider excludes1mm decorative sole tip; documented, Havok settling passed','Map-stripped and fixed-camera multi-angle diagnostics remain required','Round4 exhausted6/6: model changes hard-stopped; desktop may record diagnostics only','Optional binary externalization/frame-time benchmarking remains future work; shared native-buffer serialization dedup is completed']
manifest={'modelId':'female-tactical','frozenAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'round':4,'correction':6,'limit':6,'remaining':0,'lifetimeCorrections':21,'pass':'blockout','workflowStatus':'stopped max-round-correction-loops-reached:4:6/6','visualStatus':'visual-review-required; unaccepted','viewport':[585,1024],'devicePixelRatio':1,'inputs':inputs,'sharedGeneratorSha256':sha(ROOT/'pipeline/forge/stage3_build/generate_babylon_factory.py'),'workflowSha256':sha(ROOT/'.img2babylon/female-tactical/pipeline/workflow.json'),'views':views,'changedPartIDs':changes['changedPartIDs'],'newPartIDs':[],'removedPartIDs':[],'parts':125,'triangles':tri,'checks':checks,'remainingGates':gates,'captureInstructions':['All11 cameras byte-identical C5 at585x1024 DPR1, port5182 physics0 shot1 exportPNG1','Save/read actual .img2babylon/shots/round4-c6-<view>.png and record fresh hashes/errors','Capture required map-stripped diagnostics; no stale C5 image hash','No seventh correction or new round; no model/source/compiler changes after freeze']}
save(D/'capture-handoff.json',manifest);save(P/'c6-batch.json',manifest)
save(D/'triangle-budget.json',{'totalTriangles':tri,'targetMax':30000,'parts':[{'id':x['id'],'triangles':x['triangles'],'optimizationPath':f'spec.json#/componentTree/{x["id"]}/optimization'} for x in g['checks']]})
archive=D.parent/'c5-archive';old=read(D.parent/'c5/capture-handoff.json')['inputs'];save(archive/'source-hash-readback.json',{n:{'frozenC5':h,'archivedSha256':sha(archive/(Path(n).name+'.snapshot')),'matches':sha(archive/(Path(n).name+'.snapshot'))==h} for n,h in old.items() if (archive/(Path(n).name+'.snapshot')).exists()})
save(D/'runtime-optimization.json',{'nativeBufferDeduplication':'completed root generator; not overwritten','evidence':'docs/migration/native-payload-deduplication.md','rootMeasuredFrozenC4Bytes':{'before':16256265,'after':4185796},'actualC6FactoryBytes':(M/'createNativeFemaleTactical.ts').stat().st_size,'actualC6ProductionChunks':{str(p.relative_to(ROOT)):p.stat().st_size for p in (ROOT/'viewer/dist/assets').glob('*FemaleTacticalModel*.js')},'inspection':'actual C6 immutable sculptSpec/repeated create test passed','remaining':'Optional binary externalization; frame-time/network/GPU-memory performance not measured here. Preserve readable recipe and archival source.'})
(D/'HANDOFF.md').write_text(f'''# FINAL round4 C6 frozen checkpoint

**6/6 corrections, total21, remaining0. Native workflow hard-stopped.** Same125 IDs, {tri:,} triangles. No seventh correction, no automatic round, no browser or commits. C6 is **visual-review-required**, not accepted likeness.

Desktop batch: `viewer/public/female-tactical-round4/c6-batch.json`. All11 cameras byte-identical C5,585×1024 DPR1: hero/front/right/rear/left/face/face±/fullbody±35°/rear135°. Port5182 physics=0 shot=1 exportPNG=1. Exact camera JSON/hashes, changed31 IDs and all frozen input hashes are in `capture-handoff.json`.

C6 keeps C5's successful actual-surface feature hierarchy and attached gear. Brows are lower, thicker with angular outer arch/taper; upper lid remains a narrow strip; iris area increased; shared Standard white RGB deliberately warmed to(.77,.75,.68), with provenance. Nasal tip/ala and philtrum depression moderated without altering head rings/jaw/hair. All14 facial layers still have positive actual interior sampled clearance; no missing support, no head-occluded aperture samples. No proof of rendered expression is claimed before C6 GPU.

Boots keep original foot poses and ground contact: narrower shafts, bevelled toe profile and sloped instep, fitted tongue panels. Eight existing lace IDs each contain two closed crossing cord paths; curves follow actual tongue triangles. Actual32 endpoint centres lie0.91mm above tongue with1.4mm cord radius, seating their envelopes. Tongue backs embed0.5mm. Updated boot collider bounds retain one55kg body. Decorative sole toe exceeds the approximate box by1mm; this is recorded in `boot-attachments.json`, not hidden.

Strict validation, final typecheck/build, real Havok settling and root's native inspection (including immutable source and repeated create) passed. Zero degenerate triangles/normal conflicts.17 changed closed meshes /1032samples: no detected self-intersection, **2 undecided head samples**. Full assembly penetration and visual gates are not passed. Hair coverage/root/non-root clearance checks unchanged. Native mesh comparison verifies94unchanged meshes; gear and hair geometry retained.

C5 actual11 images/hashes and review are archived in `../c5-archive/`; desktop confirms occlusion/gear fixes but not likeness acceptance. All earlier failures remain. C6 still needs actual GPU beauty and map-stripped diagnostic evidence; front depth samples cannot certify off-axis likeness.

Root native-buffer deduplication is consumed through normal updated generator; shared files untouched. C6 factory is {(M/'createNativeFemaleTactical.ts').stat().st_size:,} bytes. The root C4 comparison16,256,265→4,185,796 bytes describes generated source, not measured GPU memory. `runtime-optimization.json` records final sizes and optional binary externalization. `iteration.json` now reflects canonical source,6/6,total21,triangle count, optimization paths and visual-review-required status. Historical scores remain historical only.

Rebuild authority: `spec.json` readable recipes → exact canonical `extensions["babylon-sculpt-v1"].source` → model-specific `round4/compile_surfaces.py c6` → updated native generator → same registry adapter. Exact commands are in `rebuild.sh`; this reproduces the checkpoint, does not authorize edits or another round. Never use old buildSculpt/next_pass as runtime/workflow authority.

Native `next` correctly stopped at6/6. Attempting to mark the finished build returned `state is hard-stopped; do not mark more work complete`; the state is preserved, with final tests in these evidence files rather than falsely unlocking it. Desktop can record later diagnostics without a seventh correction.

Factory SHA256: `{inputs['createNativeFemaleTactical.ts']}`

**Frozen all model inputs. Stop model changes; desktop review only.**
''')
print(views[0]['url']);print('factory',inputs['createNativeFemaleTactical.ts']);print('manifest',sha(D/'capture-handoff.json'))
