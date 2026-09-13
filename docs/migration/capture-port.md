# Native capture parity — desktop rerun handoff

This worker edited only the assigned capture bridge/adapter/tests/document and `viewer/src/capture*.ts`. Generator/runtime, reviewRoute/main, rig, workflow and female model files were not edited. Source Python bridge/profile validators remain unchanged oracles. No browser automation, agents, installs or commits were performed by this worker.

## Current result

The reported capture blockers are implemented: AgX (plus exact source ACES/Neutral), solid-background bypass, canonical RH view normals, GLB H_X→H_Z correction, source-camera coordinates, fitted-camera roll/projection, thin/regular instance expansion and actual independent roughness-map consumption. Desktop reported the GLB correction renders the same fixture on GPU without shader errors. The latest background/normal/postprocess changes still need the desktop GPU rerun; numerical/headless results are not substituted for pixels.

### Source tone/color/background ABI

`capture-tonemapping.ts` contains verbatim GLSL from pinned **Three.js 0.183.2**, including the MIT copyright/license. Oracle location: `.img2babylon/cli/three-oracle/node_modules/three`. Runtime imports no Three package.

- A Babylon half-float postprocess consumes linear radiance and performs the original source operator followed by its sRGB output transfer.
- AgX retains the original Rec.2020 conversions, inset/outset matrices, log EV range, polynomial and gamut clamp. No ACES substitution.
- ACES includes the source **exposure / 0.6** scaling. Neutral uses the source compression/desaturation equations. NoToneMapping bypasses exposure/tone mapping, as the source shader does.
- Babylon material image processing runs in `applyByPostProcess` mode, with exposure=1, built-in tone mapping disabled and pre-postprocess HDR clamp disabled. This prevents double exposure/gamma and premature radiance clipping.
- `useExactSrgbConversions=true` is a required immutable engine-creation option. The profile rejects a host without it. Antialias must also match the existing engine context.
- A solid source Color background is **not** tone-mapped. The radiance target clears to transparent black; the postprocess composites the exact declared display-space RGB/alpha afterward. `#eef2ff` remains `[238,242,255]` under AgX or any exposure. No compensated substitute color is used.
- The compositor recovers straight radiance from alpha coverage before tone mapping, then composites the declared background. Transparent backgrounds keep alpha. Multiple overlapping transparent layers remain subject to native blend/render ordering, described below.
- All diagnostic passes disable the postprocess entirely. Their color channels receive no exposure, tone mapping or output transfer. Returning to beauty restores the actual postprocess and original materials/resources.

**Runtime-worker interface:** generic `configureRenderer` is outside this worker's scope. When representing source ACES with Babylon's built-in ACES, root/runtime review must account for the source `/0.6` factor and exact-sRGB engine flag; when using this capture profile, do **not** additionally apply `/0.6` because the portable source shader already owns it. Existing main.ts reportedly enables exact sRGB. No runtime-worker files were overwritten.

### Coordinate ABI and fitted camera consumption

`CameraSpec.coordinateFrame` is explicit:

- Omitted or `native`: preserves legacy native alpha/beta/radius and native position/target behavior.
- `source-rh`: source position, target and up are reflected by H_Z (`diag(1,1,-1)`) only in LH scenes; RH scenes are identity. Source azimuth/elevation are degrees, converted through source position before reflection. Legacy radians are not accepted in a source-rh form.
- Source render profiles default to `source-rh`; profile-derived manifest cameras carry the marker. A caller can explicitly label already-native values.
- Distances, target, position, clipping and orthographic bounds use `physicsScale`; FOV stays vertical. Target precedes orbit assignment. Inertia/limits are cleared so the camera cannot silently clamp a prescribed pose.

`convertSolverCamera`, `api.setSolverCamera(output)` and `api.setCamera(output)` accept the actual stage-1 output: nested `referenceCamera.fit.cameraParameters`, direct `cameraParameters`, or descriptor `orientation.{yaw,pitch,roll}Degrees.value`, `position.hint` and `fovDegrees.value`.

The converter derives forward/up from **camera_fitting_math.py's pitch→yaw→roll world-to-camera convention**. It preserves roll through an explicit up vector and sets target to position+forward, never origin as a substitute for fitted orientation. Image aspect is retained through an explicit projection matrix. Orthographic direct profiles retain ordered left/right/top/bottom bounds.

Adapter `--solver-camera camera.json` consumes the same descriptor for selected shots and records file/hash/convention provenance. Without a render profile, descriptor image dimensions select the viewport. With a shared profile, dimensions must match its viewport or preflight rejects; it never silently mutates the hashed profile. An API-only host should likewise choose the fitted image aspect/viewport when comparing reference pixels.

### GLB reference and handedness

`setReferenceMode({kind:'glb',url|data,sha256?,expectedMeshCount?})` loads a real detached AssetContainer. Browser URL bytes are hashed before import when a hash is supplied; the adapter always supplies it. It validates a nonempty post-load renderable mesh set and optional explicit count. Imported animations stop and imported lights/cameras/environment do not replace the shared capture look.

Babylon glTF AUTO produces R_y(pi)·H_Z = H_X in an LH scene. The isolated reference wrapper applies another R_y(pi), producing the pipeline's canonical **H_Z**. RH scenes get no correction. Scene handedness, shared camera and culling are unchanged. Physical scale stays on the reference-owned wrapper.

Switches preserve procedural visibility and look. Returning to procedural disposes container-owned meshes/materials/textures/rigs and wrapper. Failed detached loads preserve the preceding reference; superseded/disposed loads release late assets. Profile material overrides are released before reference disposal and rebound to the new subject. Readiness is false during transitions; concurrent capture/screenshot operations reject. Scene disposal clears readiness/API.

### Six passes, deformation and instances

Diagnostics snapshot Babylon-evaluated morph targets and skinning using `getPositionData(true,true)` / `getNormalsData(true,true)`. They retain world transforms, indices, submesh groups and UVs, without rewriting original geometry, materials, skeletons or influences.

Thin-instance local matrices are multiplied by the source world matrix. Regular instances use their actual absolute world matrices. Each enabled/visible instance gets its own snapshot; thin batches do not emit a spurious extra source copy. All snapshots and temporary shader materials are disposed on pass switch/beauty/cleanup. Visibility, layers/effects/particles/sprites/fog and postprocessing are restored.

| Pass | Encoding |
| --- | --- |
| beauty | Original scene/materials plus selected exact source tone process |
| alpha-silhouette | White with visibility/material/albedo/opacity-map/vertex-alpha coverage and cutouts |
| semantic-id | Explicit declared RGB byte region palette |
| depth | `clamp((abs(viewZ)-near)/(far-near),0,1)` grayscale |
| normal | **Source RH view-space** geometric normal mapped −1…1 to 0…1 |
| roughness-material-id | R=perceptual roughness; G=ID high byte; B=ID low byte |

`sourceViewNormalMatrix()` applies inverse-transpose world/view then flips view-normal Z only for LH hosts. Same source mesh+camera therefore produces the same RGB normal in both handedness modes; front-facing surfaces have high blue. The shader consumes this matrix directly, not a metadata-only label.

IDs are 1-based indices in sorted profile region IDs; decode `round(G*255)*256+round(B*255)`. Reference and procedural share the same palette/IDs. Mappings require explicit semantic metadata or profile mesh/material bindings; anatomical labels are not guessed from arbitrary names.

### Roughness texture ABI

`capture-material.ts` resolves real live texture bindings:

1. Optional explicit `material.metadata.captureRoughness` (one binding or array).
2. Known public `material.pluginManager.getPlugin('IndependentPbrMaps').rough`: green channel, matching current objectConversion.ts.
3. Metallic texture's selected green/alpha channel.
4. Independent `microSurfaceTexture` red: multiplies roughness in metallic workflow, glossiness in specular workflow.
5. Reflectivity alpha when the material declares that glossiness source.

A binding is `{texture: BaseTexture, channel:'r'|'g'|'b'|'a', operation:'multiply-roughness'|'multiply-glossiness'}`. Explicit bindings replace inference and are the stable extension seam for runtime-worker plugins. Texture objects remain live references; no pixels are copied or metadata scalars substituted. UV set/transforms and all inferred multiplicative maps feed the diagnostic shader. Legacy StandardMaterial shininess has a documented deterministic roughness approximation `sqrt(2/(specularPower+2))`.

Tests instantiate the current runtime `convertMaterial` with a local RGBA roughness map and verify the registered plugin texture, green-channel arithmetic, UV set and actual diagnostic sampler/source. Runtime files are read/imported for this test, not edited.

## Evidence and validation

The native Python controller retains source capture IDs/order, probes, paths, SHA-256, readiness, console errors, atomic writes and per-pass records. Full unchanged source profile validation runs before native constraints. All six passes are required for v2 on both reference and procedural captures. Solver file hashes are also validated. The adapter uses native profile/mode/camera APIs, saves one actual canvas and immediately records each saved pass. Finally cleanup restores beauty, procedural mode, profile and simulation flags.

Verified headlessly in this follow-up:

- **10 native Python tests**: AgX accepted; profile constraints; all-six-pass GLB/procedural completeness; source/profile/solver/screenshot hashes; readiness/error failures; solver viewport contract.
- Pinned GLSL exact-text comparison and independent numeric samples: **18 AgX, 12 ACES, 12 Neutral** across color/HDR/exposure ranges. ACES `/0.6` is included.
- Actual profile supplies exact `#eef2ff` compositor uniforms and zero-alpha radiance clear; numeric solid/transparent/partial-alpha compositor tests under all four modes.
- Python `project_landmark` is called as the oracle; known landmarks with yaw=17°, pitch=−11°, roll=23° match Babylon in RH and LH scenes. Descriptor-only and nested fitted forms match.
- Generated GLB with a real skin+morph: known deformed positions, canonical H_Z world transform, source camera projections and all three source-view normal channels checked in both handedness modes.
- Six-pass lifecycle/restoration, thin/regular world expansion, runtime independent roughness texture path, malformed GLB, hash mismatch, disposal during load and readiness race tests pass.
- Full viewer TypeScript check passes at the final local check. NullEngine's instance capability flag and exact-sRGB property are explicitly enabled **only in the test harness** to exercise CPU paths; this does not claim GPU instancing/color conversion evidence.

Commands (repo root unless noted):

```sh
/opt/homebrew/bin/python3.11 -m unittest discover -s pipeline/forge/tests -p test_native_capture.py -v
cd viewer
./node_modules/.bin/tsc --noEmit
node --import tsx scripts/capture_babylon_test.ts
# source regression, from pipeline/:
/opt/homebrew/bin/python3.11 -m unittest forge.tests.test_render_bridge forge.tests.test_render_profile -v
```

## Desktop rerun and optical limits

Rerun the **same** deformed GLB/source profile URL first, with beauty then normal. Expected: nonblank correctly placed/culling-preserved triangle; declared `#eef2ff` background unchanged by AgX; RH/LH-equivalent normal channels, blue high on the front. Then native smoke with all six passes, repetition instances and roughness maps. Keep the exact-sRGB engine flag. Existing desktop GPU results are reported as desktop evidence; this worker did not run a browser.

Remaining differences requiring pixel tolerances are renderer optics: Babylon BRDF/IBL filtering versus Three PMREM, source shadow-rig implementation, precision/MSAA/texture filtering, transmission/refraction and order-dependent multilayer transparency. Diagnostic normals intentionally encode geometric/deformed normals, not beauty normal-map perturbations; labels/depth identify the nearest surviving surface rather than mixing transparent IDs. Arbitrary external shader programs or unexposed custom vertex plugins are not made equivalent by these capture shaders. None of these are treated as proof of visual parity or as completed character refinement.

## Desktop GPU acceptance (2026-09-14)

Desktop corrected the host to exact sRGB, applied the same GLB/source-profile route,
and verified the fixed coordinate/culling and normal convention. Twelve original
canvas PNGs (six native posed-smoke passes and six skinned/morphed GLB passes) are
archived in `docs/migration/evidence/`. They were produced through the app's explicit
PNG export control, not an injected render call or a JPEG screenshot relabelled as PNG.
`forge/verify_migration_pixels.py` checks their actual pixel values; results/hashes
are `pixel-verification.json`. The GLB solid background is exactly (238,242,255),
front normal is (128,128,255) within 1 byte, depth and roughness/ID agree with the
known fixture, and the native beam has 90–123 roughness bytes across 13,953 visible
pixels. These tests passed on the Codex in-app WebGL2 browser with no console errors.
The procedural room probe and native PBR/height/skin/morph/checker paths also rendered.
This is engineering fixture acceptance, not female-character likeness acceptance.
