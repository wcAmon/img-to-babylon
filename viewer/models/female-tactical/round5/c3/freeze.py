from pathlib import Path
import json,hashlib,shutil,datetime
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];P=ROOT/'viewer/public/female-tactical-round5';P.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
views=[]
for name in ['hero','front','right','rear','left','face','face-plus','face-minus','orbit-plus','orbit-minus','rear-quarter']:
 src=ROOT/'viewer/public/female-tactical-round4'/f'c6-{name}.json';dest=P/f'c3-{name}.json';shutil.copyfile(src,dest)
 views.append({'id':name,'path':str(dest.relative_to(ROOT)),'sha256':sha(dest),'sameAsC6Sha256':sha(src),'camera':read(dest),'url':f'http://127.0.0.1:5182/#model=female-tactical&physics=0&shot=1&exportPNG=1&reviewCamera=/female-tactical-round5/c3-{name}.json&reviewPass=beauty'})
inputs={n:sha(M/n) for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','createFemaleTacticalModel.ts','round5/compile_surfaces.py','iteration.json','reference/female.png','round5/c3/author.py','round5/c3/rebuild.sh','round4/prepare.py']}
a=read(D/'attachments.json');g=read(D/'geometry.json');v=read(D/'visibility.json');si=read(D/'self-intersection.json');changes=read(D/'changes.json');tri=sum(x['triangles'] for x in g['checks'])
assert read(D/'strict.json')['ok'] and read(D/'physics.json')['pass'] and tri<=35000
assert all(x['degenerateTriangles']==0 and x['normalDisagreements']==0 for x in g['checks'])
assert all(x['missingSupport']==0 and x['interiorOccludedSamples']==0 for x in v['features'])
checks={'strict':True,'typecheck':'passed','build':'passed','Havok':'passed single55kg compound body','nativeInspection':'passed including immutable source/repeated create','invalidTriangles':0,'normalDisagreements':0,'faceSurfaceVisibility':'all14 layers have positive sampled clearance; no missing support or occluded interior samples','hairRoots':a['rootPass'],'hairCoverage':{'pass':a['coveragePass'],'samples':a['sampleCount'],'exposedFraction':a['exposedAreaFraction'],'profile':'frontV .80 sides .49 rear .23'},'hairNonRootClearance':a['clearancePass'],'selfIntersection':{k:si[k] for k in ['meshCount','sampledVertexCount','insideVertexCount','undecidedVertexCount','selfIntersecting']}}
gates=['Actual R5 C3 GPU 11views and map-stripped diagnostics pending; no likeness acceptance','1 undecided self-intersection samples; full assembly penetration not passed','New fringe/hairline silhouette and face proportions need original-reference review','Manual reference landmarks have yaw/occlusion uncertainty; rear hair inferred','No further model edits after freeze until desktop feedback; round5 three corrections remain']
manifest={'modelId':'female-tactical','round':5,'correction':3,'limit':6,'remaining':3,'lifetimeCorrections':24,'frozenAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pass':'blockout','workflowStatus':'active render-capture','visualStatus':'unaccepted visual-review-required','viewport':[585,1024],'devicePixelRatio':1,'inputs':inputs,'sharedGeneratorSha256':sha(ROOT/'pipeline/forge/stage3_build/generate_babylon_factory.py'),'workflowSha256':sha(ROOT/'.img2babylon/female-tactical/pipeline/workflow.json'),'views':views,'changedPartIDs':changes['changedPartIDs'],'dependentGeometryChanges':changes['dependentGeometryChanges'],'parts':125,'triangles':tri,'checks':checks,'remainingGates':gates,'captureInstructions':['All cameras byte-identical C6; viewport585x1024 DPR1, port5182 physics0 shot1 exportPNG1','Save/read .img2babylon/shots/round5-c3-<view>.png; record fresh PNG hashes and errors','Capture required map-stripped diagnostics; no stale screenshot hashes','Frozen until desktop feedback; no auto new round']}
save(D/'capture-handoff.json',manifest);save(P/'c3-batch.json',manifest)
save(D/'triangle-budget.json',{'totalTriangles':tri,'max':35000,'parts':[{'id':x['id'],'triangles':x['triangles'],'optimizationPath':f'spec.json#/componentTree/{x["id"]}/optimization'} for x in g['checks']]})
(D/'HANDOFF.md').write_text(f"""# Frozen round5 C3 nose-only handoff

Round5 **3/6**, lifetime24, remaining3. Same125IDs and32,492triangles. Native workflow active render-capture; visual-review-required. No fourth correction before desktop review.

`viewer/public/female-tactical-round5/c3-batch.json`:11 cameras byte-identical C2/C6,585×1024 DPR1. URLs port5182 physics=0 shot=1 exportPNG=1. Exact camera/source hashes and changedPartIDs in `capture-handoff.json`.110 native meshes unchanged; only head and14 surface-dependent facial layers change, with eye/lip/brow authored recipes unchanged. All C2 hair/body/materials retained.

C2 FAILURE: short high tip and bilateral alar relief (.110/.060 depth, .044/.030 vertical radii), neighbouring negative folds and fast return to the muzzle caused a wide downward-facing underside. Actual generated mesh116 vertex-normal samples in the fixed nasal region show28 normals with Y<-.45, minimumY=-.8257. The broad dark band in GPU is consistent with that geometry; no material change is used to hide it.

C3 reverts to C1's softer blending principle, not an exact wholesale C1 rollback. Exact removed/added fields are persisted in `changes.json`. Removed all C2 nasal lobes/folds in |x|≤.10 and -.26<y<.10; retained C2 head rings/80segments/local nose sampling, jaw, cheeks/orbit, eyes/lips/brows and hair. Replaced with weaker broad positive bridge (.042,.135 vertical radius), smaller tip (.041,.086), gentle base (.012,.070) and modest wings (.011,.063). No negative nostril cavity, no new notch or scalar vertex-Z hack. Nostril detail remains approximate rather than forcing a full-width crease.

Actual same-region C3 normal sample count116: zero normals below-.45, minimumY=-.3726; max frontal depth .10379→.09388m. `nose-profile.json` preserves every sampled value. These are numerical profile/normal comparisons, not passing likeness or a guarantee of GPU lighting.

Strict/typecheck/build, inspector immutable-source/repeated-create and real Havok settling passed. Same55kg compound body. Zero degenerate triangles/normal conflicts, all14 feature layers positive sampled clearance with no missing support or burial. Hair root/coverage/clearance checks preserved. Head closed-volume test96samples: no detected self-intersection, **1 undecided sample**. Full assembly penetration and visual gates remain unpassed.

C2 actual11images, Tier1/multi reports, hashes, failed review and source/compiler snapshots archived in `../c2-archive/`. `author.py` and `rebuild.sh` replay exact readable source → canonical archival recipes → persisted round5 compiler → root deduplicated native generator. No temporary seed/service, no alternate renderer, no new material pass. `iteration.json` and workflow synchronized3/6,total24.

Factory SHA256: `{inputs['createNativeFemaleTactical.ts']}`

Save/read `.img2babylon/shots/round5-c3-<view>.png`, record fresh hashes and diagnostic evidence. **Frozen; no further source/model changes until actual desktop review.**
""")
print(views[0]['url']);print('factory',inputs['createNativeFemaleTactical.ts']);print('manifest',sha(D/'capture-handoff.json'))
