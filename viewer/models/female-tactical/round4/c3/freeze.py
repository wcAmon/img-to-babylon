"""Run only after verification. Freeze c3 render inputs and desktop camera batch."""
from pathlib import Path
import json,hashlib,datetime
D=Path(__file__).resolve().parent;M=D.parents[1];ROOT=M.parents[2];P=ROOT/'viewer/public/female-tactical-round4'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
views=[]
for name in ['hero','front','right','rear','left','face','face-plus','face-minus','orbit-plus','orbit-minus','rear-quarter']:
 source=P/f'c2-{name}.json'
 if not source.exists():source=ROOT/'viewer/public/review-round4-baseline'/f'c2-{name}.json'
 if source.exists():camera=json.loads(source.read_text())
 else:
  camera=json.loads((P/'c2-hero.json').read_text());camera['azimuthDegrees']={'orbit-plus':35,'orbit-minus':-35,'rear-quarter':135}[name]
 file=P/f'c3-{name}.json';save(file,camera)
 views.append({'id':name,'path':str(file.relative_to(ROOT)),'sha256':sha(file),'camera':camera,'url':f'http://127.0.0.1:5182/#model=female-tactical&physics=0&shot=1&exportPNG=1&reviewCamera=/female-tactical-round4/c3-{name}.json&reviewPass=beauty'})
geometry=json.loads((D/'geometry.json').read_text());parts=geometry['checks'];attachments=json.loads((D/'attachments.json').read_text());selftest=json.loads((D/'self-intersection.json').read_text());changes=json.loads((D/'changes.json').read_text())
inputs=['spec.json','canonical-spec.json','createNativeFemaleTactical.ts','createFemaleTacticalModel.ts','round4/compile_surfaces.py','reference/female.png']
frozen={f:sha(M/f) for f in inputs}
manifest={'modelId':'female-tactical','frozenAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'round':4,'corrections':3,'limit':6,'remaining':3,'lifetimeCorrections':18,'pass':'blockout','visualStatus':'unaccepted; c2 Tier1 failed, c3 GPU evidence not yet captured','viewport':[585,1024],'devicePixelRatio':1,'inputs':frozen,'views':views,'changedPartIDs':changes['changedPartIDs'],'newPartIDs':[],'removedPartIDs':[],'triangles':sum(p['triangles'] for p in parts),'parts':125,'checks':{'strict':json.loads((D/'strict.json').read_text())['ok'],'typecheck':'passed','build':'passed','Havok':json.loads((D/'physics.json').read_text())['pass'],'invalidTriangles':sum(p['degenerateTriangles'] for p in parts),'normalDisagreements':sum(p['normalDisagreements'] for p in parts),'hairlineCoverage':attachments['coveragePass'],'hairRootContacts':attachments['rootPass'],'hairNonRootClearance':attachments['clearancePass'],'changedClosedPartsSelfIntersectionDetected':selftest['selfIntersecting'],'selfTestUndecidedSamples':selftest['undecidedVertexCount']},'remainingGates':['Fresh frozen-c3 GPU batch including diagnostic/map-stripped evidence','Reference silhouette Tier1 threshold unchanged .85; c2 IoU .5573 remains failure','Facial/pose/hair likeness and off-axis review; no passing scores','22 undecided self-test samples; complete assembly penetration review is NOT passed','Legacy open facial overlays need surface/visual review, not closed-volume parity','Material PBR conversion/provenance/consumed roughness remains later locked pass','Explode test not concluded; isolate UI root-reported verified only'],'captureInstructions':['Reload each URL; observe actual readiness and console errors','Save actual exported 585x1024 PNG to .img2babylon/shots/round4-c3-<view>.png, then read it back','Record browser/version, URL, camera and image SHA256 plus current input hashes','Use beauty and required diagnostic/map-stripped evidence; do not substitute camera descriptor for screenshot','No model or compiler edits after this freeze until desktop resume']}
save(D/'capture-handoff.json',manifest);save(P/'c3-batch.json',{'round':4,'correction':3,'viewport':[585,1024],'devicePixelRatio':1,'inputs':frozen,'views':views})
save(D/'triangle-budget.json',{'totalTriangles':manifest['triangles'],'target':[20000,30000],'parts':[{'id':p['id'],'triangles':p['triangles'],'recipe':f'canonical-spec.json#/extensions/babylon-sculpt-v1/source/componentTree[id={p["id"]}]/geometry','optimization':f'spec.json:componentTree[id={p["id"]}].optimization'} for p in parts]})
(D/'HANDOFF.md').write_text('''# Frozen c3 desktop capture handoff

Round 4: **3/6 corrections, lifetime 18**, blockout still blocked from acceptance. Same 125 IDs, 25,590 triangles. No new round, no browser run or invented likeness score.

Use `viewer/public/female-tactical-round4/c3-batch.json` for all eleven 585×1024 DPR1 views. Detailed input/camera SHA256 values, URLs and remaining gates are in `capture-handoff.json`. Port 5182, physics=0, shot=1, exportPNG=1. Original c2 cameras reused; ±35° full-body and 135° rear-quarter included.

C3: wider ankle stance and elbow/forearm pose from shared joint scaffold; higher belt/longer legs; child gear follows segment transforms; curved fitted vest panels and triangulated cloth folds. Scalp locks now overlap cap along their length, posterior ponytail roots sit in cap/tie junction, nape coverage extended. Nose guide embedded, continuous nasal/philtrum volume restrained, eyes less white. Head/hair sampling reduced purposefully.

Strict, TypeScript, production build and real Havok settling passed. Degenerate triangles=0 and normal disagreements=0. Full varying-hairline coverage uses 1473 points (exposure 0.5167%, hard max 5%); all eleven roots intersect cap envelopes. Embedded posterior root points are explicitly limited to first two rings and duplicated root-cap vertices, with no non-root skull intrusion. This is geometric evidence, not hair likeness acceptance.

Changed closed-volume self-test: 68 parts, 5156 samples, no detected self-intersection; **22 undecided samples remain**, so do not call this exhaustive passing geometry. The old open upper-lip parity failure and c1/c2 raw audits are retained. Full 125-part cross-penetration was not repeated or passed; no blanket exclusions were introduced. Exact intended contacts: neck/head, shirt/neck, pelvis/thigh, thigh/calf, upper-arm/forearm, forearm/hand and posterior hair root/cap remain overlapping construction joints; their visible seams still require GPU review. Clothing/gear containment is not automatically exempted.

No new visual acceptance. C2 Tier1 IoU .5573<.85 and missing map-stripped evidence remain failed. Capture c3 diagnostics and compare to approved reference, never reuse a c2 screenshot hash for c3. Current first-body physics stays one 55 kg compound body, no ragdoll/animation claim. Isolate UI verified by desktop; explode remains unconfirmed.

Authoritative pipeline: canonical archival source → legacy recipe exporter/importer → model-specific `round4/compile_surfaces.py c3` → native strict generator → same registry adapter. Do not omit the model compiler when regenerating; nativeRecipe surfaces are not represented by the archived legacy base geometry. Do not edit baked arrays. Full original source and failure history remain in prior snapshots/extensions.

**Frozen: no further source/factory/compiler changes until desktop resumes.**
''')
print(views[0]['url']);print('factory SHA256',frozen['createNativeFemaleTactical.ts']);print('handoff SHA256',sha(D/'capture-handoff.json'))
