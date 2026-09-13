# Native Babylon generator/runtime port

Engine subtask implementation, 2026-09-14. Integration, workflow/state routing, browser capture,
existing female figure refinement and Havok wiring remain desktop-owned. No existing model or
upstream generator was changed by this subtask.

## Entry point and integration contract

`pipeline/forge/stage3_build/generate_babylon_factory.py SPEC --out OUTPUT.ts`

The CLI preserves upstream strict-quality, pass-unlock, pass-specific-gap, overwrite and BLOCKED
report behavior. `--allow-nonstrict` remains explicitly fixture-only and cannot accompany
`--pass-id`. Output imports native runtime files by a relative path calculated from the output
location. Do not move a generated file without regenerating or updating its import paths.

Generated API:

- `create<Name>Model(scene: Scene, options?: ModelOptions): TransformNode`
- `create<Name>LookDevLights(scene, mode)` returns a native lights root with ShadowGenerator.
- `create<Name>Environment(scene)` is **async**: await native probe capture and GGX prefiltering.
- `frame<Name>Camera(camera: TargetCamera, object, options)` consumes Babylon radian FOV.
- `configure<Name>Renderer(scene)` configures native ACES image processing.
- `create<Name>PresentationComposer(scene, camera, options)` returns DefaultRenderingPipeline.
- `create<Name>InspectControls(camera: ArcRotateCamera, element)` attaches native controls.

The model root stores `metadata.sculptRuntime` with native `nodes`, `meshes`, `sockets`, collider
**descriptions**, destruction groups and RH numerical `geometry` data. A declared component named
`root` receives its own pivot below the returned container. Dimensions are baked into vertex data;
pivot scaling remains identity. Collider descriptions are not claimed to instantiate Havok bodies.
The host owns actual Havok integration, constraints, picking handlers and explosion interaction.

`metadata.rig` contains Babylon Bone/Skeleton objects, stable bone index mapping, computed bound
status and fallback counts. Skinning first bakes the rest geometry into model space, then computes
weights, binds a shared skeleton and applies authored XYZ poses. Rigid descendants remain on the
posed pivot tree. Meshes with bones stay active to prevent stale rest bounds from hiding posed parts.

## What runs natively

| Source route | Native implementation |
| --- | --- |
| box, sphere/ellipsoid, cylinder, cone, torus, plane-card | Numerical vertex generation; Babylon VertexData and Mesh |
| capsule | Shared-pole watertight numerical capsule, outward winding corrected |
| extrude and oval/polygon holes | Earcut triangulation plus hard-edged extrusion, source world-space UV recipe |
| ground-blade | Station loft with primary bevel and swedge |
| lathe | Revolved profile, matching source meridian normals and UVs |
| tube and curve-sweep | Centripetal Catmull–Rom, arc-length sampling, transported/Frenet frames, closed-path correction |
| tapered-sweep | Parallel-transport sections, pointed ends, twist and caps |
| implicit SDF | Surface nets; all five primitive fields, smooth union, subtraction, intersection; tier cap |
| visual hull | Orthographic silhouette occupancy, bounded surface and explicit empty/budget failures |
| subdivision / decimation | UV-aware Catmull–Clark and guarded quadric collapse before binding |
| hair | Stand-proud marching with unresolved count; root-tip linear colour; vertex paint predicates |
| repetition | Native thin instances; source radius/2 placement and absolute per-instance dimensions |
| materials | Native PBR scalars, clearcoat, sheen, iridescence, anisotropy, refraction/thickness/attenuation |
| textures | Deterministic RGBA RawTextures or reference URLs; separate albedo, roughness, normal, AO and height |
| displacement | Native PBR GLSL material plugin; height sampler and UV matrix, before skin deformation |
| hierarchy / rigs | TransformNode, Mesh, Bone, Skeleton and actual matricesIndices/matricesWeights |
| morphs | Native MorphTargetManager; `applyMorphSet` consumes forge relative-delta output |
| lights / camera / presentation | Native lights/shadows, radian FOV, ArcRotate controls, probe environment, ACES, bloom/DOF |

All 15 validator primitives have a native construction route; there is no unknown-primitive box
fallback. Missing material, malformed geometry, unsupported attributes or unresolved analytic
stand-proud targets throw instead of quietly disappearing. A capped stand-proud march retains its
measured `unresolved` value; it is not a coverage pass. The source fixture still has 11/35 unresolved
crown vertices; the native positions agree within 7.5e-9 and do **not** relabel that fixture as fixed.

The Python boundary reuses only upstream engine-neutral validation, pass/tessellation decisions,
geometry descriptor defaults and envelope-radius derivation. It never invokes `oracle.generate()`
in production. The intact Three emitter is invoked only by the parity tests. Its SHA-256 matches the read-only reference: `b090d5258a8009570ef24d6de2b84651c8bcc5e7c8b065905e47755f63acdbbb`.

## Coordinate and data conversions

CPU geometry stays in metres, RH, Y up, with outward CCW winding. `applyMeshData` chooses the
scene boundary without changing the host's `scene.useRightHandedSystem`:

- RH scenes preserve coordinates. LH scenes reflect Z, reverse each triangle and convert normals.
- Quaternions reflect as `(-x,-y,z,w)` for LH; matrices are conjugated by `diag(1,1,-1,1)`.
- Source XYZ Euler triples use an explicit quaternion formula; Babylon's YXZ default is not used.
- Negative geometry dimensions transform normals by inverse transpose and reverse winding once.
- Vertex colours expand RGB to RGBA, skin buffers retain four influences, tangent W flips under
  reflection, and material groups become SubMeshes. Relative morph positions become native absolute
  target positions with the base added exactly once.
- `configureCamera` converts source degrees to Babylon vertical radians. The optional object adapter
  also preserves a supplied projection matrix, including RH/LH and half-Z projection conversion.
- Hex albedo is decoded from sRGB once. Existing Three Color objects are already linear and are
  copied without decoding again. The procedural source's binary-metalness policy is retained;
  the optional object adapter preserves fractional physical-material metalness.
- Procedural grayscale roughness uses Babylon's independent microSurface texture red multiplier;
  albedo is sRGB, data maps are linear. No roughness map is misinterpreted as a metallic channel.
- The optional object adapter preserves independent G roughness and B metallic maps with a native
  PBR plugin, UV channel 0/1, and exact source UV matrices, including offset, nonuniform repeat,
  rotation and center. Arbitrary same-scene texture changes are not synchronized automatically.

`objectConversion.ts` is an explicit adapter for live Three objects or equivalent numeric records.
It imports no Three runtime. It supports Mesh/Group/TransformNode equivalents, material groups,
instances, vertex attributes, morphs, cameras, lights and skeletons with nonidentity bind matrices.
It snapshots source transforms; native consumers animate the returned Babylon objects. Arbitrary
mesh transform shear is retained through a pretransform matrix.

## Lossless legacy import and resource ownership

The generator consumes the `nativeVertexData` / `nativeTransform` contract documented in
[legacy-import.md](legacy-import.md). It validates packed buffers, units, local space, winding
record, unit quaternion and matrix consistency at both Python and runtime boundaries. Missing
native data on a recipe-only import is an error. Native data is selected **before** primitive,
attachment, dimensions, scale, subdivision, dense maps, vertex paint and stand-proud processing.
Archival recipes never cause remeshing. Source component order is retained; all pivots exist before
parent links are assigned. Dimensions stay baked and effective node scaling stays identity.

Legacy `useExactRGB` is honored as raw numeric `StandardMaterial.diffuseColor`, with the original
0.05 specular colour and power 24. It does not pass through hex quantization, gamma decoding or
PBR reinterpretation. Nonlegacy generated materials remain native PBR. Canonical RH vertices and
quaternions cross the same explicit scene RH/LH boundary as all other runtime data.

`root.metadata.ownedResources` and `root.metadata.sculptRuntime.ownedResources` expose explicit
sets of all allocated materials, textures, skeletons and morph managers. This includes unused spec
materials and superseded dense/vertex-painted variants. `root.dispose()` disposes owned resources
once; failed construction cleans its allocations. Material disposal does not recursively dispose
texture slots, so a later host-assigned shared texture survives. Scene-cached BRDF textures remain
scene-owned. Host Havok bodies and host-created scene resources remain desktop's responsibility.
The host adapter must use this ownership contract instead of inferring ownership from live material
slots; otherwise it can dispose a caller's shared material/texture after the runtime has cleaned up.

The real emitter roundtrip test uses the existing **unassessed internal numerical fixture** at
`.img2babylon/cli/legacy-female-canonical.json`. Only the test mocks upstream intake/schema
validation; native validation, code generation and runtime execute unchanged. Production CLI
continues to return BLOCKED, and neither the canonical fixture nor the female spec is changed.
The test independently builds the archived original with the existing legacy builder and compares
all 125 components / 23,799 vertices / 19,762 triangles / 13 material IDs in both RH and LH scenes.
Local/world position error is at most 3.715e-9 m; world matrices match exactly. Normals, UVs, scene
index winding, quaternion hierarchy and exact RGB/material IDs are checked. A separate test reverses
source component order and injects nonexecutable archival scale/primitive metadata to verify precedence.

## Desktop GPU specimen

[Pipeline smoke README](../../viewer/models/pipeline-smoke/README.md) documents the authored,
reference-free strict-valid specimen. Its spec passes the unchanged production blockout CLI, with
empty review history and no completed passes. `generatedFactory.ts` is genuine generator output;
`createPipelineSmokeModel.ts` exports the host's default `ModelFactory` returning `BuiltModel`.
Desktop registry: `'pipeline-smoke': () => import('../models/pipeline-smoke/createPipelineSmokeModel')`.

The generated box, tapered sweep and torus exercise five independent PBR maps, local vertex paint,
GLSL height displacement, plus an explicitly authored two-bone mechanism and actual MorphTarget.
The 35-degree bone pose yields 0.241153335 m maximum vertex displacement through Babylon's palette.
A transformed UV checker and vertical-FOV projection test exercise texture/camera matrices. This is
not photo projection, de-lighting, character intake or visual approval. The wrapper leaves host lights,
camera and Havok unchanged. No browser automation was run by this subtask.

## Measured validation

Installed APIs inspected: Babylon **8.56.2** declarations and implementation for VertexData,
mesh side orientation, Bone/Skeleton rest/bind matrices, PBR texture channel processing,
MaterialPluginBase, ReflectionProbe, HDRFiltering and DefaultRenderingPipeline. No new package
manifest dependency is needed. Existing TypeScript/tsx and Babylon dependencies suffice.

Run from repository root:

```sh
/opt/homebrew/bin/python3.11 pipeline/forge/tests/test_native_babylon.py
/opt/homebrew/bin/python3.11 pipeline/forge/tests/test_legacy_generator_babylon.py
/opt/homebrew/bin/python3.11 pipeline/forge/tests/test_smoke_babylon.py
```

Run from `viewer/`:

```sh
npx tsc --noEmit
node --import tsx scripts/native_babylon_test.ts
node --import tsx scripts/parity_babylon_test.ts
node --import tsx scripts/helpers_babylon_test.ts
```

Use `node --import tsx` if `tsx` CLI's IPC socket is rejected by a sandbox; this actually executes
the same TS modules and does not require a permission escalation. Both parity scripts default to `.img2babylon/cli/three-oracle/node_modules/three/build/three.module.js`
(version 0.183.2 in this workspace). `THREE_PARITY_MODULE` may override it for another test oracle.
Missing oracle files fail the tests; they do not silently skip. Production has no Three import.

Results obtained:

- Four legacy integration tests and three strict smoke/resource tests pass. Repeated create/dispose
  checks retain caller-owned materials/textures, reject malformed morphs without allocations and
  return scene counts to baseline, including skeletons and morph managers.

- Seven Python tests pass: all fixture emitters are native; all valid primitives dispatch; unknown
  primitive rejection; strict failure preserves existing output; runtime numerical test; four
  generated fixture factories execute in RH and LH scenes; a canonical synthetic 61-component,
  49-bone fixture executes with normalized weights in RH and LH scenes.
- Native numerical tests pass for outward volume, reflection/winding, group material index, morph
  positions/influence, FOV, XYZ rotation, linear albedo, PBR values, deterministic independent maps,
  subdivision, decimation, analytic hair clearance, and actual Babylon rest/posed skin palettes.
- Installed Three comparisons: box, plane and tube positions/UVs/normals have zero max error;
  sphere/torus only have trigonometric roundoff (~1e-16); lathe positions/UVs/normals match.
- Full intact-emitter comparisons pass for 15 primitives, subdivision, SDF, visual hull and the
  stand-proud fixture. With the requested Three 0.183.2 oracle, maximum position difference across the
  15-primitive fixture is 7.093e-6 m (tolerance 1e-5);
  subdivision/SDF/hull fixtures are exactly equal. Extrude and curve-sweep compare unique surface
  positions **and position-to-UV correspondence**, accounting for different triangle ordering.
- Object conversion passes noncommuting hierarchy, linear PBR values, fractional metalness,
  exact rotated/nonuniform UV transforms, nonidentity bind matrices and posed skins in both frames.
- TypeScript check passes for the combined viewer workspace at the final check.

One source defect was intentionally corrected: the upstream watertight capsule has inward winding.
The native capsule reverses its triangles before normal calculation; its test volume is positive
0.422531. Source capsule coordinates are retained. Cylinder/cone cap centres are shared, reducing
redundant coincident vertices while preserving surface positions, UVs and triangle counts.

## Remaining parity and evidence gaps — not completion claims

1. **GPU/browser visual evidence remains outstanding.** NullEngine proves object creation, data and
   numerical deformation, not rendered shader pixels. Desktop must verify GLSL displacement and
   independently mapped PBR materials, normal-map orientation, URL upload/flipY, culling, shadow
   appearance, transparent/refraction materials and camera screenshots using the actual viewer.
2. The procedural probe room, shadow filtering and native DOF are functional Babylon routes, but
   their appearance is not pixel-identical to Three RoomEnvironment/PCF/BokehPass. The f-stop mapping
   from Three's artistic aperture is an approximation. Reference-matched GPU review is required.
   Environment generation is async and needs a real rendering engine; it was not executed on GPU.
3. Custom PBR plugins currently target **GLSL/WebGL**, matching the source WebGL renderer. WGSL/
   WebGPU is not ported and is not claimed supported by these plugins.
4. The optional structural object adapter fails explicitly for arbitrary ShaderMaterial/RawShader
   programs, unequal X/Y tangent normal scales, bump-only/light/alpha/environment map adaptation,
   independent roughness/metallic UV channels above 1, arbitrary displacement bias, and camera/light
   shear. These are **incomplete adapter routes**, not silently flattened materials. They are outside
   the source factory's emitted material set but must be ported before accepting such external objects.
5. Physics material/collider instantiation, state/workflow routing, host mesh export/capture bridges,
   browser interaction handlers and the existing female figure are outside this subtask's ownership.
   A complete repository migration cannot be claimed until desktop integrates and validates them.

## Source and licenses

Geometry algorithms and deterministic material sampling derive from the read-only locally imported
img2threejs generator (Apache-2.0). Source remains intact for comparison. Native object assembly is
separate from those numerical buffers; it is not a Three Object3D emulation layer.

The only vendored utility is CPU polygon triangulation: earcut 3.0.2, copied from an installed Three
bundle. `viewer/src/pipeline/earcut.LICENSE` preserves its [upstream ISC license](https://github.com/mapbox/earcut/blob/v3.0.2/LICENSE)
and the containing distribution's MIT license. There is no Three runtime import or dependency in
`viewer/src/pipeline/`.

## Desktop integration follow-through

Desktop updated `pipelineAdapter.ts` to dispose Havok first and delegate owned
resources to `root.dispose()`. Live host/shared material slots are not destroyed.
The repeated-allocation test now exercises disposal both directly and through
this adapter. Native `configureRenderer` applies Three's ACES exposure factor
`1/0.6`; the stricter capture profile uses the exact attributed source tone shader.
The host enables exact sRGB conversions at engine creation. Actual generated-model
GPU evidence, including a visible two-bone bend, morph, PBR maps and UV checker,
is archived under `docs/migration/evidence/`; see `pixel-verification.json`.
