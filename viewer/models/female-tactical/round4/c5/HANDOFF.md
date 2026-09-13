# C5 frozen desktop handoff

Round4 **5/6**, lifetime20, **one correction remaining**, blockout still unaccepted. Same125 IDs, 29,504 triangles. No browser, new screenshots, commit or new round.

Batch: `viewer/public/female-tactical-round4/c5-batch.json`; all11 cameras byte-identical to C4 at585×1024 DPR1. Hero/front/right/rear/left/face/face±/fullbody±35/rear135 included. URLs use port5182, physics=0, shot=1, exportPNG=1. Exact camera JSON/hash, source hashes and 31changedPartIDs: `capture-handoff.json`.

C4 eleven GPU images, frozen source snapshots, SHA256 readback and actual rejected review are in `../c4-archive/`. No passing likeness score or changed threshold. C4 original head/jaw/nose and all hair remain exact; native geometry comparison verifies 94unchanged meshes including stance. Materials and one55kg physics remain unchanged.

C5 fixes eyelid topology: thin upper strip, no centre fan filling the eye. Shared eye aperture/bulge controls place warm sclera, brown iris, pupil and glint using actual compiled head triangle depths and ordered clearances. Lips use smooth widthwise strips with a shared closed seam, mild cupid bow and corners behind central volume. Features use finer local sampling only where curvature requires it. Early feature oversampling31,720 triangles was reduced purposefully to29,504; initial pouch smooth-normal conflict and glint support mismatch remain in `geometry-before-gear-normal-fix.json` and `visibility-before-density-fix.json`. Final geometry has zero degenerate triangles or normal conflicts.

Actual native triangle-interior visibility report: `visibility.json`. All14 feature layers have positive sampled depth above their support, minimum about0.283mm; no missing support, no occluded interior samples. Both eye apertures have readable frontmost sclera samples and zero head-occluded samples; this is numerical visibility only, not GPU likeness or off-axis acceptance. Upperlid coverage is a small rim rather than a black filled patch.

Eight MOLLE strips consume the actual front/back vest surfaces, with4mm thickness and0.5mm intended embedding. Three magazine bodies mount on the actual vest; six flap/tab components mount on actual magazine surfaces. Actual back-surface interior sampling finds -0.752 to -0.396mm seating, no floating gaps. Hard edge normals are deliberately split for gear. No blanket collision exemption.

Strict, final TypeScript/build, real Havok settling and root's native inspection test passed. Changed closed self-test:17 mounted parts,1480samples, no detected self-intersection and no undecided samples. Hair checks unchanged: all11 roots attached, coverage0.4258% exposure below5%, no non-root skull intrusion. These bounded tests do not pass full assembly penetration or visual gates. Open facial layers are surface-depth tested rather than incorrectly classified as closed volumes.

Runtime duplication TODO retained in `runtime-optimization.json`: desktop reports approximately15MB runtime duplication; local source sizes and actual production model chunk are recorded separately, without inventing browser-memory measurements. Source/archive preservation and root-owned runtime boundaries apply to future deduplication.

Factory SHA256: `0a6f1cce085975bc836895bb08f9263585f22427495cc4bb27e01c845f63677d`

Capture current C5 beauty and required map-stripped diagnostics. Save `.img2babylon/shots/round4-c5-<view>.png`, read pixels back and record actual hashes. **Frozen; no further model/compiler/factory edits until desktop resumes.**
