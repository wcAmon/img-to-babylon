# Frozen round5 C3 nose-only handoff

Round5 **3/6**, lifetime24, remaining3. Same125IDs and32,492triangles. Native workflow active render-capture; visual-review-required. No fourth correction before desktop review.

`viewer/public/female-tactical-round5/c3-batch.json`:11 cameras byte-identical C2/C6,585×1024 DPR1. URLs port5182 physics=0 shot=1 exportPNG=1. Exact camera/source hashes and changedPartIDs in `capture-handoff.json`.110 native meshes unchanged; only head and14 surface-dependent facial layers change, with eye/lip/brow authored recipes unchanged. All C2 hair/body/materials retained.

C2 FAILURE: short high tip and bilateral alar relief (.110/.060 depth, .044/.030 vertical radii), neighbouring negative folds and fast return to the muzzle caused a wide downward-facing underside. Actual generated mesh116 vertex-normal samples in the fixed nasal region show28 normals with Y<-.45, minimumY=-.8257. The broad dark band in GPU is consistent with that geometry; no material change is used to hide it.

C3 reverts to C1's softer blending principle, not an exact wholesale C1 rollback. Exact removed/added fields are persisted in `changes.json`. Removed all C2 nasal lobes/folds in |x|≤.10 and -.26<y<.10; retained C2 head rings/80segments/local nose sampling, jaw, cheeks/orbit, eyes/lips/brows and hair. Replaced with weaker broad positive bridge (.042,.135 vertical radius), smaller tip (.041,.086), gentle base (.012,.070) and modest wings (.011,.063). No negative nostril cavity, no new notch or scalar vertex-Z hack. Nostril detail remains approximate rather than forcing a full-width crease.

Actual same-region C3 normal sample count116: zero normals below-.45, minimumY=-.3726; max frontal depth .10379→.09388m. `nose-profile.json` preserves every sampled value. These are numerical profile/normal comparisons, not passing likeness or a guarantee of GPU lighting.

Strict/typecheck/build, inspector immutable-source/repeated-create and real Havok settling passed. Same55kg compound body. Zero degenerate triangles/normal conflicts, all14 feature layers positive sampled clearance with no missing support or burial. Hair root/coverage/clearance checks preserved. Head closed-volume test96samples: no detected self-intersection, **1 undecided sample**. Full assembly penetration and visual gates remain unpassed.

C2 actual11images, Tier1/multi reports, hashes, failed review and source/compiler snapshots archived in `../c2-archive/`. `author.py` and `rebuild.sh` replay exact readable source → canonical archival recipes → persisted round5 compiler → root deduplicated native generator. No temporary seed/service, no alternate renderer, no new material pass. `iteration.json` and workflow synchronized3/6,total24.

Factory SHA256: `bc3bb2a6f8a8a6f0cb0c761de159d336b1203995bc851da2f4bfa56719705e86`

Save/read `.img2babylon/shots/round5-c3-<view>.png`, record fresh hashes and diagnostic evidence. **Frozen; no further source/model changes until actual desktop review.**
