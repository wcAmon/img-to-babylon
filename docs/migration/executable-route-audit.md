# Executable source-route audit

Snapshot: 2026-09-14 Asia/Taipei (2026-09-13 17:03 UTC). Scope is read-only
inspection plus this document and `pipeline/NATIVE-COMMANDS.md`. No source,
female model, generator, runtime, workflow or capture implementation was edited.
No browser, model rendering, downloads, commits or agents were used.

The pinned original is
`/Users/wake/Desktop/local_three/reference/img2threejs`, commit
`9fbd0ca5bbcc3b13bebe712745d6784d33db0b85`, matching
[upstream-inventory.json](upstream-inventory.json). The reference checkout was
read, not modified. Exact runnable substitutions and flags are in
[NATIVE-COMMANDS.md](../../pipeline/NATIVE-COMMANDS.md).

## Method and coverage

Enumerated source `.py`, `.mjs`, `.sh`, `.ts` files excluding tests and git internals;
compared their relative paths and bytes with `pipeline/`; searched executable
bodies and emitted strings for Three constructors/imports, browser globals,
subprocesses, missing runtime paths and emitted module dependencies. Then read
native dispatch, mesh export, camera/profile/capture and desktop review route
consumers. CLI `--help` was run with bytecode writes disabled for generator,
camera, render bridge init/record, native profile validator, capture adapter,
projection plan, fit_params, pass orchestrator, material_views, self-intersection,
penetration and UV unwrap. TypeScript positional interfaces were read from code;
`--help` was not sent to scripts that would treat it as a model or file argument.

All **126** non-test executable-language source files have counterparts. **120**
were byte-identical; six differed: `forge/next.py`,
`forge/_shared/workflow_state.py` and four GLB integration Python files
(`bake_atlas_uvs.py`, `build_head_surface.py`, `build_cross_sections.py`,
`export_sdf_surfaces.py`). The latter contain Babylon-root path overrides; that
is not proof their complete companion build/capture route is native. This
inventory count includes library modules, not 126 independent CLIs.

This audit is code/command evidence, not rerun numerical or visual parity. The
accepted rig and legacy import have their own prior executable reports. Active
workers can change the snapshot below; close items from actual consumer code
and tests rather than editing status prose alone.

## Source execution surfaces and current disposition

| Source surface | What actually executes / emits | Current Babylon boundary and disposition |
| --- | --- | --- |
| `forge/stage3_build/generate_threejs_factory.py` | Emits Three constructors, geometry/material code, bones and browser scene helpers | Native `generate_babylon_factory.py` emits Babylon imports plus `viewer/src/pipeline/*` calls. Reuses source validation/descriptor calculations, not source `generate()`. Native runtime worker owns remaining parity; copy of the Three emitter remains an oracle. |
| `forge/stage5_rig/emit_rig.py` | Standalone synthetic straight-Y-chain capsule with skin weights, Bone/Skeleton | Accepted `emit_babylon_rig.py` has real native bind/deformation tests. Preserve milestone-zero limit; neither source nor port is a general character-rig CLI. |
| `forge/stage4_review/render_bridge.py` | Manifest/hash/controller; source browser globals, not a renderer | `babylon_render_bridge.py` uses actual Babylon ready/capture contracts, strict recorded readiness, hashes and native profile checks. Capture followup is in progress; inspect saved evidence before acceptance. |
| `scripts/capture_threejs_playwright.py` | Browser runner using `__IMG2THREEJS_*` | `capture_babylon_playwright.py` calls native setCamera/profile/reference/pass APIs, screenshots the selected canvas, records hashes and restores state. Requires optional Python Playwright/browser and running route. |
| `forge/stage4_review/validate_render_profile.py` | Source profile contract validator | Native wrapper retains source vocabulary and validates explicit native mappings; native profile/capture code consumes these mappings. AgX is deliberately unsupported. Source JSON field names alone do not mean Three is executing. |
| `forge/stage1_intake/solve_camera_pose.py` + `camera_fitting_*` | CLI creates a heuristic nested descriptor; Python API numerically fits supplied 3D/2D correspondences | Math is engine-neutral and copied. Native capture uses a different flat camera contract; no complete fitted-pose adapter was found (see G3). |
| `runtime/scripts/export_mesh_geometry.mjs` (documented) | Original documented URL/regex browser exporter | File is absent from pinned source **and** copied pipeline. Desktop supplied `viewer/scripts/export_pipeline_mesh.ts`: real Babylon current-pose world vertex export from registered default factory. Native numeric consumer now tested; default factory scope and limitations in G2. |
| `scripts/character_audit.sh` | Runs missing source exporter, then self-intersection/penetration/UV scripts | Original oracle remains unchanged. Native replacement `pipeline/scripts/character_audit_babylon.py` executes exporter and applicable source gates; see G2. |
| Source showcase query/global access | Source capture scripts directly manipulate Three camera/renderer/traversal | Desktop `reviewRoute.ts` is wired in main.ts; accepts native hash URL parameters and calls the capture API. It does not automatically write screenshot manifests. |
| `forge/stage3_build/bake_projected_texture.py` | Emits `projectedTextureBake` descriptor; explicitly no pixel sampling or rasterization | Engine-neutral plan producer. Source did not ship a rasterizer here; current native generator also has no descriptor consumer. Report as unimplemented execution of a source plan, not a lost working source bake. |
| `forge/stage4_review/material_views.py`, `fit_params.py` | Material review plans; bounded objective optimization (CLI quadratic fixture) | Engine-neutral. Neither source command supplies an automatic renderer callback. A future render-loop integration is beyond copied-tool parity, not a missing renamed CLI. |
| GLB `python/build_cross_sections.py`, `build_head_surface.py`, `export_sdf_surfaces.py`, `bake_atlas_uvs.py` | Numeric measurement, Surface Nets and data modules; opt-in UV transfer | Data/algorithm side is not intrinsically Three. Requires actual approved GLB, isolated deps and declared input files. Root overrides alone do not supply decoder/renderer integration. |
| GLB `node/verify_cells.mjs`, `encode_surfaces.mjs`, `emit_surface_module.mjs` | Connectivity/varint codec and TS `EncodedNode`/base64 data module | Not Three geometry emitters. `emit_surface_module` imports companion `surfaceCodec` type; source does not ship the actual companion decoder. Native data consumer still needed only if this opt-in route is selected. |
| GLB `node/verify_roundtrip.mjs` | Bundles external `CHARACTER_CODEC` with esbuild and compares decoded geometry | Depends on companion code/data, not self-contained native validation. Default `src/demos/girl-character/surfaceCodec.ts` is not in this repository. |
| GLB `node/capture-character.mjs`, `build-character.sh`, `compare_views.mjs` | Companion build/capture, Three globals/camera/render and browser pixel comparison | Build/capture remain source-showcase-specific. Native capture can replace final capture for a registered equivalent model; it does not replace external codec/model/build dependencies. `compare_views` pixel math is engine-neutral but its browser/provider dependency remains optional. |

## Engine-neutral tools that do not need an engine rename

The remaining source modules operate on images, JSON, numeric geometry or workflow
records. Their executable Python argument contracts remain under `pipeline/`:

- Intake probes/admission, semantic/detail inventories, material/hair evidence,
  gradient/color analysis, camera-fitting math and spec search. Distinguish
  measurements from scaffolds: `extract_landmarks.py` draws generic guides and
  scaffolds anatomy; it is not an automatic landmark detector. `new_sculpt_spec`
  creates a starter spec, not accepted evidence.
- Canonical spec/hair/rig validators and geometry derivation; material reference
  lookup and compatibility; pass orchestration. `orchestrate_passes` checks and
  synchronizes records; it does not itself render or invoke a factory.
- Python SDF/subdivision/visual-hull/decimation/morph/UV algorithms and
  geodesic skinning. Some have parallel **emitted JS** implementations in the
  source generator: those need native execution parity, which the runtime worker
  owns. A Python algorithm test alone does not cover the emitted implementation.
- Geometry/image gates: integrity, self-intersection, penetration, attachment,
  joint loops, scalp exposure, swept arcs, coverage, region/pixel/material checks,
  diagnostics, comparison sheets and turntable analysis. They need correct
  executed geometry/pixels and conventions; metadata is not replacement input.
- VLM gate, feedback/calibration/history utilities: source `vlm_sampler` is an
  injected callable. A deterministic stub test is policy coverage, not a running
  external visual judge.
- Release/issue metadata scripts are repository maintenance, not Babylon model
  emission. They were not executed by this audit.

Source `morph_targets.py` and geodesic outputs are useful independent JSON
algorithms. No automatic wiring to all canonical source generator paths should
be inferred: source generator itself does not consume every library output.
Native `meshData.ts` does instantiate MorphTargetManager for supplied morph
attributes; do not label that whole capability missing merely because a separate
Python descriptor is not automatically ingested.

## Concrete actionable gaps at the snapshot

### G1 — Legacy bridge still needs generator/host consumption (Desktop/runtime owner)

`generate_babylon_factory.geometry_expression()` at inspection dispatches
visualHull/SDF then source primitive expressions. Neither it nor
`viewer/src/pipeline/runtime.ts` reads `geometryDescriptor.nativeVertexData` or
`extensions["babylon-sculpt-v1"]`. The generic non-attachment runtime path scales geometry
by `_babylon.scale`. Thus the accepted import can preserve data perfectly while
generic dispatch still risks substituting its loft/patch descriptor or applying
dimensions again. Materials likewise do not consume the import's exact RGB
extension at this snapshot.

**Close with:** implement the documented native descriptor branch before generic
geometry/attachment/scaling, exact RGB and local-transform handling, and fail
closed on recipe-only imports. Test an imported nonzero nested fixture through
the **generated factory**, not only import verification. Keep canonical strict
gates intact. Adapt the generated `TransformNode` return/named export to the
viewer's `default ModelFactory → BuiltModel` contract before registration;
`export_pipeline_mesh.ts` expects `model.meshes`/`dispose()`. Existing native
numerical tests or bare emitted TypeScript do not register a new viewer route.

### G2 — Native numeric exporter and executable audit implemented

The bounded followup now owns and implements `viewer/scripts/export_pipeline_mesh.ts`
and `pipeline/scripts/character_audit_babylon.py`. The exporter is both a reusable
`exportMeshes` consumer and a registered-factory CLI. It evaluates current morph
then skin, expands regular/thin instances using actual world matrices, and emits
world positions/normals, RGB/alpha, UVs and triangle indices. Component-ID regex
selection and explicit/default model selection are available. Canonical RH is
the default; `--handedness left` is an explicit alternative. Reflection,
inverse-transpose normals, determinant-aware global winding and hierarchy are
numerically tested in LH and RH scenes, including real colored geometry,
nonuniform/mirrored scaling, parent rotation/translation and morphed/skinned
vertex movement. The exporter does not individually repair folded triangles.

The stdlib orchestrator invokes the actual exporter and original self-intersection
and pairwise-penetration CLIs, records every exit status/stdout/stderr and raw
result, expands authored `--allow` component pairs to placement names, and
requires an explicit positive `--max-samples`. Failed/unrun execution cannot
become a clean result. Open/nonmanifold/degenerate or uncertain volume coverage
is incomplete. The source sampling limitations remain: thin contacts can be
missed between samples. A single mesh/disjoint AABBs legitimately have no
penetration pair candidates; coverage records explain that scope.

Original `uv_unwrap.py` is a NEW unwrap operation and the original shell command
reads only its first mesh. Default authored UV verification is explicitly
unassessed. Optional `--unwrap-plan` runs separate analysis/planning on **each**
selected placement, captures failures, and never certifies existing UVs.

Verification: seven numeric scenario groups plus eight Python integration tests
passed, including real `sample-crate` registered export, actual overlapping boxes,
explicit allow exemptions, bounded sample counts, open-surface incompleteness,
export failure/unrun status and per-placement unwrap planning. Focused TypeScript
checking passed. Viewer-wide typechecking was rerun and found a separately owned
`viewer/src/reviewRoute.ts:27` `AbstractMesh.overrideMaterialSideOrientation`
error; that file was left untouched. Exact runnable commands and payload contract
are in [NATIVE-COMMANDS](../../pipeline/NATIVE-COMMANDS.md#native-mesh-export-and-geometry-gates).

Remaining scope is precise: headless CLI creates factory default pose without
advancing physics/animation; it cannot represent current browser edits or pixels.
Reusable API exports the supplied pose. Texture/material colors, per-instance
shader color multipliers and GPU-only displacement are not sampled. Missing
vertex colors stay null. No source URL/ready-flag browser adapter was supplied in
the pinned source. Reference-dependent color/landmark/visual gates still need
real reference/spec/capture inputs, and authored UV verification is still absent
from this source route. These are not fake zero-defect or production-acceptance
claims. Canonical intake/strict gates remain mandatory when production generation
is requested. No female model or visual gate was changed.

### G3 — Camera solver-to-capture adapter is incomplete (capture/integration owner)

`solve_camera_pose` CLI emits `referenceCamera.fovDegrees.value`,
`orientation.*Degrees.value`, `position.hint`; numerical fitter additionally
returns `fit.cameraParameters`. Capture accepts flat numeric `fovDegrees`,
position/target or orbit angles. `reviewRoute.ts` fetches a JSON object and passes
it directly to setCamera; it does not unwrap the solver descriptor.
`capture-camera.ts` currently has no roll/up-vector field. `pipeline/scene.ts`
`configureCamera` expects `fov`, while capture expects `fovDegrees`.

**Close with:** one explicit adapter for actual solver pose semantics, including
nonzero pitch/yaw/roll and RH→scene convention, with projected-landmark numeric
parity. Until then supply an authored flat capture camera/profile; do not call
heuristic descriptor output calibrated or silently drop fitted roll. This is a
specific handoff gap, not a request to replace the existing numerical solver.

### G4 — Capture execution/evidence followup remains owned and unverified here

Native profile/reference/pass/camera code exists; GLB loading uses Babylon
LoadAssetContainerAsync, diagnostic capture uses the native API, and desktop
hash route application is wired into main.ts. Do not describe it as metadata-only
or missing. At audit time, `AgXToneMapping` is explicitly rejected in both native
profile validator and runtime: source allowed it. **Close AgX parity** with an
exact pinned implementation and pixel tests, or continue declaring that profile
unsupported; ACES is not an equivalent replacement.

The current manifest init without a profile leaves distance/FOV absent and
preflight correctly rejects it. A profile fills those values, but named head
captures are not automatically head-framed. Manual record CLI writes hashes and
readiness, but does not populate `evidence.browser`, and validation does not
require that field; supply truthful desktop browser provenance as well. These are usable-command preconditions, not reasons
to synthesize evidence. The capture owner must finish actual browser/pass/profile
restoration and saved-evidence verification; this audit did not run a browser.

## Optional/unavailable source routes — not core Babylon regressions

- Default `pipeline/integrations/vision/.venv/bin/python` is absent. The wrapper
  allows `--vision-python` or the original environment override. Optional SAM2,
  Depth Anything and MediaPipe have code, but dependencies/weights were not
  loaded or downloaded. Do not claim these are available by copying the files.
- Default GLB integration `.venv/bin/python` and its Node `node_modules` are
  absent. Companion model/codec/work inputs are external; the pinned original
  itself has no `runtime/` directory or companion `surfaceCodec.ts`. A selected
  GLB reconstruction requires these source dependencies plus native consumption;
  without a GLB this route is explicitly inapplicable, not a reason to block the
  core image-driven pipeline.
- `integrations/mesh3d/generate_reference_mesh.py` calls a hosted TRELLIS provider
  and optional gradio/trimesh dependencies. `--from-glb` avoids remote generation
  but still needs conversion dependencies. No service reachability or credentials
  were checked. It remains opt-in reference generation, not the default model
  builder and not a missing Babylon renderer.
- Python 3.11 at the documented local path had no importable Playwright package.
  Capture code is present but execution requires an already provisioned capture
  interpreter/browser or the desktop owner. No dependency installation occurred.
- Projected-texture baking and renderer-driven fit/material plans remain
  descriptor/provider boundaries in source too. If the full workflow activates
  those plans, implement a genuine native consumer and evidence; do not claim a
  lost source executable or report the plan itself as a completed bake/render.

## Snapshot fingerprints and handoff

These SHA256 prefixes record the earlier read-only audit snapshot, not current
concurrent worker completion. G2 and the executable commands supersede the old
exporter snapshot and missing-wrapper findings:

| File | Prefix |
| --- | --- |
| `pipeline/forge/stage3_build/generate_babylon_factory.py` | `e26e736c8930706f` |
| `viewer/src/pipeline/runtime.ts` | `c6a752ed8c7d39bb` |
| `viewer/scripts/export_pipeline_mesh.ts` | `aaadb32de7ce1142` |
| `viewer/src/reviewRoute.ts` | `849151009f2cbf18` |
| `pipeline/scripts/capture_babylon_playwright.py` | `4c52d2bcdb33c128` |
| `viewer/src/capture-camera.ts` | `637ca0ad380fe6c4` |
| `pipeline/forge/stage4_review/validate_babylon_render_profile.py` | `0ecdafcdde4ecf7f` |

The earlier `port-status.md` still lists accepted rig work as in progress; it was
not edited because it is outside ownership. Use the accepted rig/import reports
and current consumer evidence rather than treating that summary as fresher than
this inspection. No claim is made that the in-progress generator/runtime worker
has finished full parity, or that the accepted infrastructure completes any
female visual gate.
