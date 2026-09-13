# Babylon migration acceptance

Status: the pinned source workflow and its executable WebGL reconstruction core are ported and verified. Character refinement is the next stage, not accepted by these migration tests.

## Accepted scope

- All 322 source resources and all 126 non-test executable-language files are present with Apache-2.0 provenance. The read-only source checkout is unchanged. Source emitters remain numerical oracles; active routes use Babylon objects.
- All 15 supported primitives, SDF/visual hull, subdivision/decimation, hair clearance/vertex color, PBR maps, hierarchy/instances, skeletons/morphs, camera/lights/environment helpers have native consumers and numerical tests.
- Standalone rig emitter retains the original straight-chain milestone-zero scope. Full generator bone fixtures exercise 49 bones; neither is a claim of an animated female rig.
- Legacy BabylonSculptSpec import uses explicit native buffers/quaternions/material semantics. All 125 female parts and 23,799 vertices roundtrip through generated Babylon factories in RH/LH; maximum vertex error 3.715e-9 m, world matrices exact. Production generation correctly refuses its still-unassessed canonical intake.
- Native workflow gates require real files, preserve failed reviews and original cumulative15 corrections, and enforce six corrections per round. Ordered intake/build/review gates remain.
- Capture supports native and GLB modes, exact source tone shaders including AgX, fitted camera yaw/pitch/roll, canonical normals, instance expansion, independent roughness channels and restoration/disposal. Actual GLB loader H_X was corrected to the pipeline H_Z convention.
- Native geometry export and bounded character audit replace the unusable source showcase wrapper; report samples, skipped geometry and actual gate outcomes.
- Host adapter creates real Havok shapes/mass for explicit LH sculpture recipes, with safe owned-resource disposal. Collider metadata alone is never called physics.

## Final verification

- Integrated Python suite: **1,129 tests**, success, **38 upstream optional/runtime skips**.
- Legacy repository: **134 tests**, success.
- Viewer TypeScript and production build: success. Build retains the ordinary large-chunk advisory.
- Native capture lifecycle, seven-case exporter conversion, Havok adapter and repeated resource ownership tests: success.
- Exact source-emitter/Three numerical parity: all supported primitives plus advanced fixtures; differences and corrected upstream inward capsule are in runtime-port.md.
- Twelve real original-canvas WebGL2 PNGs: six posed native and six skin/morph GLB diagnostic passes. Pixel checks verify background, alpha, semantic IDs, canonical normals, depth and varying independent roughness maps. See pixel-verification.json and evidence/.

## Boundaries carried forward honestly

This is complete migration of the available source workflow/core, not pixel-identical renderer optics or installation of every optional external provider. Babylon BRDF, environment filtering, shadows, DOF and layered transparency need appropriate visual tolerances. WebGL is the source target; arbitrary external ShaderMaterial programs, unsupported object-adapter properties and WebGPU shaders require dedicated ports before accepting those inputs.

Original projection-bake scripts are descriptor producers, not a hidden working rasterizer. External neural/vision/GLB companion adapters retain their source opt-in/dependency limits; missing source companion codecs or services are not fabricated. UV unwrap is planning, not authored-UV acceptance. Geometry audit is headless factory-pose geometry, with sampling explicitly reported. Details are in executable-route-audit.md, runtime-port.md and capture-port.md.

## Character handoff

Proceed through the new character intake and native factory with Codex CLI. Preserve female-tactical identity, readable component recipes, source image, all prior records and the single compound body. New head/face/hair/body changes require their own true screenshot review. No migration test supplies a likeness pass.
