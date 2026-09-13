"""Freeze C4 only after final native build and bounded tests. No rendering claims."""
from pathlib import Path
import json,hashlib,shutil,datetime
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];P=ROOT/'viewer/public/female-tactical-round4'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
views=[]
for name in ['hero','front','right','rear','left','face','face-plus','face-minus','orbit-plus','orbit-minus','rear-quarter']:
 src=P/f'c3-{name}.json';dest=P/f'c4-{name}.json';shutil.copyfile(src,dest)
 views.append({'id':name,'path':str(dest.relative_to(ROOT)),'sha256':sha(dest),'sameAsC3Sha256':sha(src),'camera':read(dest),'url':f'http://127.0.0.1:5182/#model=female-tactical&physics=0&shot=1&exportPNG=1&reviewCamera=/female-tactical-round4/c4-{name}.json&reviewPass=beauty'})
inputs={n:sha(M/n) for n in ['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','createFemaleTacticalModel.ts','round4/compile_surfaces.py','reference/female.png']}
a=read(D/'attachments.json');g=read(D/'geometry.json');si=read(D/'self-intersection.json');changes=read(D/'changes.json');tri=sum(x['triangles'] for x in g['checks'])
assert read(D/'strict.json')['ok'] and read(D/'physics.json')['pass']
assert a['rootPass'] and a['coveragePass'] and a['clearancePass']
assert all(x['degenerateTriangles']==0 and x['normalDisagreements']==0 for x in g['checks'])
checks={'strict':True,'typecheck':'passed','productionBuild':'passed','Havok':'passed; same single 55kg compound body','nativeInspection':'passed NullEngine isolate/explode/reset/pick/disposal; not a new GPU visual test','zeroDegenerateTriangles':True,'zeroNormalDisagreements':True,'hairRoots':a['rootPass'],'hairCoverage':{'samples':a['sampleCount'],'exposure':a['exposedAreaFraction'],'hardMax':a['hardMax']},'hairNonRootClearance':a['clearancePass'],'changedClosedSelfTest':{k:si[k] for k in ['meshCount','sampledVertexCount','insideVertexCount','undecidedVertexCount','selfIntersecting']}}
gates=['Fresh C4 11-view GPU and diagnostic/map-stripped evidence; all visual gates unaccepted','C3 Tier1 remains failed: IoU .6101 < .85, aspect .1123 > .05, scale .1564 > .08, missing map-stripped evidence','15 undecided self-test samples; full assembly penetration NOT passed','Open facial overlays need actual image and surface review, not closed-volume parity','C5 pending: rear MOLLE floating behind vest in side view; C3 body preserved','Materials remain exact existing StandardMaterial semantics; any later PBR correction needs explicit provenance/consumed roughness','No new round: two corrections remain after C4']
manifest={'modelId':'female-tactical','frozenAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'round':4,'correction':4,'limit':6,'remaining':2,'lifetimeCorrections':19,'pass':'blockout','visualStatus':'unaccepted; awaiting C4 GPU','viewport':[585,1024],'devicePixelRatio':1,'inputs':inputs,'views':views,'changedPartIDs':changes['changedPartIDs'],'authoredPartIDs':changes['authoredPartIDs'],'dependentGeometryChanges':changes['dependentGeometryChanges'],'parts':125,'triangles':tri,'checks':checks,'remainingGates':gates,'captureInstructions':['Use exactly these C3-equivalent cameras at 585x1024 DPR1','Reload each URL and wait for actual ready render; record errors and current input hashes','Save .img2babylon/shots/round4-c4-<view>.png and read actual pixels back','Record SHA256 for each PNG and camera; no stale C3 image hash for C4','Capture required diagnostic/map-stripped evidence as well as beauty','Frozen: no model/compiler/factory edits until desktop resumes']}
save(D/'capture-handoff.json',manifest);save(P/'c4-batch.json',manifest)
save(D/'triangle-budget.json',{'totalTriangles':tri,'target':[25000,30000],'parts':[{'id':x['id'],'triangles':x['triangles'],'optimizationPath':f'spec.json#/componentTree/{x["id"]}/optimization'} for x in g['checks']]})
old=read(D.parent/'c3/capture-handoff.json')['inputs'];archive=D.parent/'c3-archive'
match={n:{'frozenC3':h,'archivedSha256':sha(archive/(Path(n).name+'.snapshot')),'matches':sha(archive/(Path(n).name+'.snapshot'))==h} for n,h in old.items() if (archive/(Path(n).name+'.snapshot')).exists()}
save(archive/'source-hash-readback.json',match)
(D/'HANDOFF.md').write_text(f'''# C4 frozen desktop handoff

Round 4 correction **4/6**, lifetime **19**, remaining **2**. Blockout/geometry remains unaccepted. Same 125 IDs; {tri:,} triangles. No browser, new screenshots, commits or new round.

Open the eleven URLs in `viewer/public/female-tactical-round4/c4-batch.json`. Each camera is byte-identical to its C3 counterpart, including full-body ±35° and rear 135°. Viewport 585×1024, DPR1, port5182, physics=0, shot=1, exportPNG=1. Exact camera JSON, SHA256 and frozen source hashes are in `capture-handoff.json`.

C4 reshapes the connected head's cheek/orbital, nasal tip/ala/nostril, philtrum and mouth-support relief, narrows and shortens the lower jaw continuously, and adjusts upper lids/brows/eye opening. Nose ID remains embedded; visible anatomy is on the head. Existing lips now derive their positions from the actual head triangle surface with 0.2mm boundary clearance and 1.2/1.5mm central lip volume, so the source recipe controls attachment. The first lower-lip outline produced eight normal conflicts; its preserved failed report is `geometry-before-lower-lip-fix.json`; a convex authored outline fixes the fold. Final conflicts and degenerate triangles are zero.

Four ponytail clumps keep their root/tie positions and now retain volume through the middle of a broader posterior curve before distal taper. Crest locks gain controlled thickness while remaining scalp seated. Changing the head's lower extent also recomputes the cap and three unchanged scalp-lock recipes from their existing u/v bindings; these four dependent geometry IDs are included in changedPartIDs. C3 body geometry and all materials are unchanged. Rear MOLLE floating behind vest is explicitly retained for C5.

Strict validation, final typecheck/build, real Havok settling and root's native inspection test passed. Hair coverage: 1473 samples, exposure {a['exposedAreaFraction']:.6%} against unchanged 5% maximum; 11 root envelopes contact cap, no non-root skull intrusion. The exact first-two-ring posterior root seating exception remains recorded per vertex. Bounded self-test covers 14 closed meshes / 1246 samples: no detected self-intersection, **15 undecided samples**. Full assembly penetration and open facial surface visual quality are not passed.

C3's eleven actual PNGs, SHA256 evidence, source snapshots and rejected review are in `../c3-archive/`. C3 Tier1 IoU .6101, aspect and scale failures and missing map-stripped evidence remain failed. No likeness scores assigned. Capture current C4 beauty plus required diagnostics before advancing any visual gate.

Native authority: exact archived source recipes → canonical native compiler `round4/compile_surfaces.py c4` → strict native factory → same registry adapter. One55kg compound rigidbody, no animation/ragdoll claim. Head/hair alone changed: 18 authored IDs plus 4 dependent scalp meshes; body remains C3.

Factory SHA256: `{inputs['createNativeFemaleTactical.ts']}`

**Frozen; no further model/compiler/factory edits until desktop resume.**
''')
print(views[0]['url']);print('factory',inputs['createNativeFemaleTactical.ts']);print('manifest',sha(D/'capture-handoff.json'));print('C3 archive hashes',all(v['matches'] for v in match.values()))
