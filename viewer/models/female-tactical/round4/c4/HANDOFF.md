# C4 frozen desktop handoff

Round 4 correction **4/6**, lifetime **19**, remaining **2**. Blockout/geometry remains unaccepted. Same 125 IDs; 25,770 triangles. No browser, new screenshots, commits or new round.

Open the eleven URLs in `viewer/public/female-tactical-round4/c4-batch.json`. Each camera is byte-identical to its C3 counterpart, including full-body ±35° and rear 135°. Viewport 585×1024, DPR1, port5182, physics=0, shot=1, exportPNG=1. Exact camera JSON, SHA256 and frozen source hashes are in `capture-handoff.json`.

C4 reshapes the connected head's cheek/orbital, nasal tip/ala/nostril, philtrum and mouth-support relief, narrows and shortens the lower jaw continuously, and adjusts upper lids/brows/eye opening. Nose ID remains embedded; visible anatomy is on the head. Existing lips now derive their positions from the actual head triangle surface with 0.2mm boundary clearance and 1.2/1.5mm central lip volume, so the source recipe controls attachment. The first lower-lip outline produced eight normal conflicts; its preserved failed report is `geometry-before-lower-lip-fix.json`; a convex authored outline fixes the fold. Final conflicts and degenerate triangles are zero.

Four ponytail clumps keep their root/tie positions and now retain volume through the middle of a broader posterior curve before distal taper. Crest locks gain controlled thickness while remaining scalp seated. Changing the head's lower extent also recomputes the cap and three unchanged scalp-lock recipes from their existing u/v bindings; these four dependent geometry IDs are included in changedPartIDs. C3 body geometry and all materials are unchanged. Rear MOLLE floating behind vest is explicitly retained for C5.

Strict validation, final typecheck/build, real Havok settling and root's native inspection test passed. Hair coverage: 1473 samples, exposure 0.425803% against unchanged 5% maximum; 11 root envelopes contact cap, no non-root skull intrusion. The exact first-two-ring posterior root seating exception remains recorded per vertex. Bounded self-test covers 14 closed meshes / 1246 samples: no detected self-intersection, **15 undecided samples**. Full assembly penetration and open facial surface visual quality are not passed.

C3's eleven actual PNGs, SHA256 evidence, source snapshots and rejected review are in `../c3-archive/`. C3 Tier1 IoU .6101, aspect and scale failures and missing map-stripped evidence remain failed. No likeness scores assigned. Capture current C4 beauty plus required diagnostics before advancing any visual gate.

Native authority: exact archived source recipes → canonical native compiler `round4/compile_surfaces.py c4` → strict native factory → same registry adapter. One55kg compound rigidbody, no animation/ragdoll claim. Head/hair alone changed: 18 authored IDs plus 4 dependent scalp meshes; body remains C3.

Factory SHA256: `92b8fb534e1ec4ff03df4a97ab163436bd9b3a8810a09fa3e157261185822a01`

**Frozen; no further model/compiler/factory edits until desktop resume.**
