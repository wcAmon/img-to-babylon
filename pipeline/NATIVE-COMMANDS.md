# Native executable commands from repository root

Audited 2026-09-14 Asia/Taipei against pinned source
`9fbd0ca5bbcc3b13bebe712745d6784d33db0b85`. This is a command reference,
not permission to skip intake or evidence gates. Commands below were checked
against CLI parsers/code. The native geometry followup executed numerical exporter
regressions and real sample-crate/fixture geometry gates; capture and visual gates
were not run. Native runtime and capture integration remain active
work. See [route audit](../docs/migration/executable-route-audit.md) for precise
boundaries and snapshot fingerprints.

## Paths and interpreter

Start in `/Users/wake/Desktop/local_three/img-to-babylon`. Set the example
variables to the actual task's existing inputs before using an input-dependent
command. None of these examples selects or edits female-tactical.

```sh
NATIVE_PY=/opt/homebrew/bin/python3.11
NATIVE_WORK="$PWD/.img2babylon/cli/native-example"
NATIVE_REFERENCE=/absolute/path/to/approved-reference.png
NATIVE_SPEC=/absolute/path/to/canonical-object-sculpt-spec.json
NATIVE_ASSESSMENT=/absolute/path/to/genuine-assessment.json
NATIVE_PROFILE=/absolute/path/to/authored-render-profile.json
NATIVE_MODEL=sample-crate
NATIVE_RUNTIME_URL="http://127.0.0.1:5173/#model=$NATIVE_MODEL"
export PYTHONDONTWRITEBYTECODE=1
mkdir -p "$NATIVE_WORK"
```

Use the local `tsx` loader with Node, not `npx` (which may fetch a missing package):
`node --import ./viewer/node_modules/tsx/dist/loader.mjs SCRIPT ...`.
Scripts below use positional arguments unless shown otherwise. In particular,
the mesh exporter has **no** `--url`, `--out`, `--include` or `--exclude` flags.

## Source command substitutions

| Original source entry | Current native entry |
| --- | --- |
| `forge/state.py init/mark`, `forge/next.py` | `pipeline/forge/babylon.py init/mark/next`; native six-corrections-per-round policy |
| `forge/stage3_build/generate_threejs_factory.py` | `pipeline/forge/stage3_build/generate_babylon_factory.py` |
| `forge/stage5_rig/emit_rig.py:emit_typescript` | `pipeline/forge/stage5_rig/emit_babylon_rig.py:emit_typescript`; Python API, not a CLI |
| `forge/stage1_intake/solve_camera_pose.py` | Same engine-neutral script under `pipeline/`; output needs explicit capture-camera conversion |
| `forge/stage4_review/validate_render_profile.py` | `pipeline/forge/stage4_review/validate_babylon_render_profile.py PROFILE` |
| `forge/stage4_review/render_bridge.py` | `pipeline/forge/stage4_review/babylon_render_bridge.py` |
| `scripts/capture_threejs_playwright.py` | `pipeline/scripts/capture_babylon_playwright.py --manifest ...` |
| `runtime/scripts/export_mesh_geometry.mjs --url ... --out ...` (not present in pinned tree) | `viewer/scripts/export_pipeline_mesh.ts REGISTERED_ID OUTPUT_JSON`, reduced interface |
| Showcase capture query strings / globals | Native hash parameters `reviewProfile`, `reviewCamera`, `reviewGLB`, `reviewPass`; `window.__IMG2BABYLON_READY__`, `window.__IMG2BABYLON_CAPTURE__` |
| `scripts/character_audit.sh` | `pipeline/scripts/character_audit_babylon.py` below; original shell oracle remains unchanged |
| GLB integration `node/capture-character.mjs` | Use native manifest/capture for a registered procedural model and GLB reference; this does not port the whole companion reconstruction pipeline |

For other engine-neutral Python tools, retain their arguments and prefix the
source-relative path with `pipeline/`. Do not substitute names inside preserved
schemas or run the old Three emitter on the assumption that the folder rename
changed its output engine.

## Workflow, canonical assessment and generation

```sh
"$NATIVE_PY" pipeline/forge/babylon.py init --state "$NATIVE_WORK/workflow.json" --reference "$NATIVE_REFERENCE" --spec "$NATIVE_SPEC" --profile character
"$NATIVE_PY" pipeline/forge/babylon.py next --state "$NATIVE_WORK/workflow.json"
"$NATIVE_PY" pipeline/forge/stage2_spec/new_sculpt_spec.py 'New model' --image "$NATIVE_REFERENCE" --assessment "$NATIVE_ASSESSMENT" --out "$NATIVE_WORK/new-canonical.json"
"$NATIVE_PY" pipeline/forge/stage2_spec/validate_sculpt_spec.py "$NATIVE_SPEC" --strict-quality --json
"$NATIVE_PY" pipeline/forge/stage3_build/orchestrate_passes.py status "$NATIVE_SPEC" --json
"$NATIVE_PY" pipeline/forge/stage3_build/orchestrate_passes.py check "$NATIVE_SPEC" --pass-id blockout --json
"$NATIVE_PY" pipeline/forge/stage3_build/generate_babylon_factory.py "$NATIVE_SPEC" --out "$NATIVE_WORK/createModel.ts" --pass-id blockout --blocked-report "$NATIVE_WORK/blocked.json"
```

Choose the actual unlocked pass, not always `blockout`. Generation defaults to
strict quality. `--allow-nonstrict` is test-only and cannot be combined with
`--pass-id`; it is not a zero-gate migration escape hatch. `--force` only permits
intentional output replacement. The CLI computes the relative runtime import
from the output location; generated modules still need access to existing
Babylon dependencies and host registration. It does not install or register them.

After completing a real step, use existing nonempty evidence:

```sh
"$NATIVE_PY" pipeline/forge/babylon.py mark image-analysis --state "$NATIVE_WORK/workflow.json" --evidence /absolute/path/to/completed-analysis.md
```

A separately authorized new correction round uses:

```sh
"$NATIVE_PY" pipeline/forge/babylon.py round --state "$NATIVE_WORK/workflow.json" --model-dir /absolute/path/to/model-source-directory --reason 'Approved scope of this new round'
```

This snapshots model/runtime/state; do not run it automatically at a stop. An
imported legacy spec retains unassessed intake and cannot be made production-ready
by copying old polish history. For the exact legacy exporter/importer commands,
see [legacy import](../docs/migration/legacy-import.md).

## Standalone milestone-zero rig

Neither source nor port exposes a RigSpec JSON CLI. In Python, with
`pipeline/forge` on `sys.path`, import `BoneSpec`, `RigSpec` from
`stage5_rig.rig_spec` and `emit_typescript` from
`stage5_rig.emit_babylon_rig`. The unchanged signature is:

```python
emit_typescript(spec, component_extents, capsule_radius,
                overlap_factor=1.2, cap_segments=8,
                radial_segments=16, height_segments=None)
```

The emitted factory is `createRigMilestone0(scene)` and requires
`scene.useRightHandedSystem = true`. It skins a synthetic straight-chain capsule,
not arbitrary character geometry. These exact commands emit and execute the
local fixtures, then rerun the last generated fixture:

```sh
"$NATIVE_PY" -m unittest discover -s pipeline/forge/tests -p test_babylon_rig.py -v
node --import ./viewer/node_modules/tsx/dist/loader.mjs viewer/scripts/rig_babylon_test.ts .img2babylon/cli/rig-port/emitted.mts .img2babylon/cli/rig-port/result.json
```

The Python suite creates the scratch dependency link for the generated ESM module.
Do not run `python emit_babylon_rig.py --out ...`: that CLI does not exist.

## Camera descriptors and native profile validation

The source camera CLI is still useful, with its actual flags:

```sh
"$NATIVE_PY" pipeline/forge/stage1_intake/solve_camera_pose.py "$NATIVE_REFERENCE" --fov-degrees 40 --yaw 0 --pitch 0 --roll 0 --distance 4 --height-offset 0 --out "$NATIVE_WORK/reference-camera-hint.json"
"$NATIVE_PY" pipeline/forge/stage4_review/validate_babylon_render_profile.py "$NATIVE_PROFILE"
```

The numbers above are explicit starting guesses, not calibration. The solver
CLI returns a nested `{referenceCamera: ...}` with `.value` and `.hint` fields.
Its numerical correspondence fitter is the Python API
`fit_camera_to_correspondences(correspondences, initial_camera)`; there is no
`--correspondences` CLI flag. Do not pass either nested result straight into
`setCamera`, `reviewCamera`, or the full render-profile validator.

Native `reviewCamera`/manifest camera records take a **flat** contract, e.g.:

```json
{
  "projection": "perspective",
  "target": [0, 0, 0],
  "azimuthDegrees": 0,
  "elevationDegrees": 0,
  "distance": 4,
  "fovDegrees": 40,
  "near": 0.01,
  "far": 100
}
```

That example is framing only. Use measured/approved framing for evidence. Native
orbit conversion is `alpha = pi/2 - azimuthDegrees*pi/180`,
`beta = pi/2 - elevationDegrees*pi/180`; positions/targets/distances/clips are
scaled by model physicsScale. Raw `alpha`/`beta` are radians; never mix them with
degree fields. Explicit `position` plus `target` is an alternative to orbit
fields, not an additional override. Orthographic records need ordered
`left/right/top/bottom`. Current capture camera has no roll/up-vector field;
nonzero fitted roll is not preserved by copying yaw/pitch into orbit angles.

A full profile is **not** this flat camera record: it contains renderer,
environment, camera, background, six passes, regions and feedbackGroups. The
native translator deliberately validates source `render-profile.v2` vocabulary:
keep `kind: threejs-render-profile`, `authority: browser-threejs` and
`renderer.backend: WebGLRenderer`; actual runtime evidence is `Babylon.Engine`.
Do not rename those fields to make a profile appear native. Source example
`pipeline/docs/specs/render-profile.v2.example.json` is a shape reference; author
real browser-visible environment URLs and model-specific semantic region mappings
(`meshNames`/`materialNames` or capture metadata). It is not a ready-to-use profile
for arbitrary models. AgX is explicitly rejected, not approximated with ACES.

## Manifest, capture and recorded evidence

Initialize an image-reference manifest with a validated, explicitly framed
profile:

```sh
"$NATIVE_PY" pipeline/forge/stage4_review/babylon_render_bridge.py init --reference "$NATIVE_REFERENCE" --runtime-url "$NATIVE_RUNTIME_URL" --render-profile "$NATIVE_PROFILE" --viewport 620x1000 --device-pixel-ratio 1 --output-dir captures --out "$NATIVE_WORK/render-manifest.json"
```

For a GLB baseline, use this **instead** (reference inputs are mutually exclusive):

```sh
"$NATIVE_PY" pipeline/forge/stage4_review/babylon_render_bridge.py init --reference-glb /absolute/path/to/authorized-reference.glb --reference-browser-url http://127.0.0.1:5173/reference/model.glb --runtime-url "$NATIVE_RUNTIME_URL" --render-profile "$NATIVE_PROFILE" --out "$NATIVE_WORK/render-manifest.json"
```

Profile viewport/DPR supersede init values. `--output-dir` is manifest-relative,
not repository-relative. Initialization without `--render-profile` leaves distance
and FOV unspecified: capture preflight rejects those defaults. Supply explicit
camera fields for each capture before using such a manifest. Default named head
views are not automatically fitted head crops; author their framing.

The following commands **launch a browser** and are listed for the capture owner;
they were not executed by this audit. They require a running registered route,
an existing Python Playwright installation and its browser binary. The current
`/opt/homebrew/bin/python3.11` could not import Playwright; nothing was installed.

```sh
npm --prefix viewer run dev -- --host 127.0.0.1 --port 5173
```

In a separate shell with the same variables, using the interpreter that already
has Playwright if different:

```sh
"$NATIVE_PY" pipeline/scripts/capture_babylon_playwright.py --manifest "$NATIVE_WORK/render-manifest.json" --mode procedural --capture-id hero --pass-id beauty --timeout-ms 120000
"$NATIVE_PY" pipeline/scripts/capture_babylon_playwright.py --manifest "$NATIVE_WORK/render-manifest.json" --mode reference --capture-id hero --timeout-ms 120000
```

`--mode reference` requires the GLB manifest and its browser URL. Repeat
`--capture-id`/`--pass-id` as needed; omit capture IDs to capture all views.
For a profile-backed `glb-mediated-v2` manifest the adapter always captures all
six passes, even when only beauty was requested. `--headed` shows the browser.
A hero-only run cannot satisfy `--require-complete` for the seven-view batch.

For already saved genuine desktop screenshots, record actual observed readiness
and actual console errors. Do not assert readiness merely to satisfy a flag:

```sh
"$NATIVE_PY" pipeline/forge/stage4_review/babylon_render_bridge.py record --manifest "$NATIVE_WORK/render-manifest.json" --capture-id hero --screenshot /absolute/path/to/hero.png --ready-signal true
"$NATIVE_PY" pipeline/forge/stage4_review/babylon_render_bridge.py record-pass --manifest "$NATIVE_WORK/render-manifest.json" --capture-id hero --pass-id beauty --image /absolute/path/to/hero.png --ready-signal true
"$NATIVE_PY" pipeline/forge/stage4_review/babylon_render_bridge.py record-reference --manifest "$NATIVE_WORK/render-manifest.json" --capture-id hero --screenshot /absolute/path/to/reference-hero.png --ready-signal true
"$NATIVE_PY" pipeline/forge/stage4_review/babylon_render_bridge.py record-pass --manifest "$NATIVE_WORK/render-manifest.json" --capture-id hero --pass-id normal --image /absolute/path/to/reference-normal.png --reference --ready-signal true
"$NATIVE_PY" pipeline/forge/stage4_review/babylon_render_bridge.py validate --manifest "$NATIVE_WORK/render-manifest.json" --require-complete
"$NATIVE_PY" pipeline/forge/stage4_review/babylon_render_bridge.py diagnose --manifest "$NATIVE_WORK/render-manifest.json" --out "$NATIVE_WORK/diagnostics.json"
```

Use JSON boolean `true`, not the JSON string `"true"`. Repeat `--console-error`
for observed errors; they correctly make evidence invalid. Manual record calls do not collect `evidence.browser` automatically, and the
current validator does not require that field. Attach truthful desktop browser
provenance; a successful manifest check alone does not prove it was recorded. Diagnostic passes
are `beauty`, `alpha-silhouette`, `semantic-id`, `depth`, `normal`, and
`roughness-material-id`.

Desktop review URL parameters belong **inside the hash**, because main.ts parses
`location.hash`, not `location.search`:

```text
http://127.0.0.1:5173/#model=sample-crate&reviewProfile=/review/profile.json&reviewCamera=/review/camera.json&reviewPass=normal
```

Add `&reviewGLB=/reference/model.glb` for reference mode. JSON/GLB paths must be
served by the viewer, not filesystem paths. URL-encode values containing `&` or
`#`. Application order is profile → GLB mode → camera → pass; completion sets
`document.documentElement.dataset.reviewReady = 'true'`. This route is wired
into main.ts, but is not itself a screenshot file or manifest recorder.

## Native mesh export and geometry gates

These commands run from repository root using installed dependencies:

```sh
node --import ./viewer/node_modules/tsx/dist/loader.mjs viewer/scripts/export_pipeline_mesh.ts --model sample-crate --include '^crate$' --handedness right --out /tmp/native-crate-meshes.json
PYTHONDONTWRITEBYTECODE=1 /opt/homebrew/bin/python3.11 pipeline/scripts/character_audit_babylon.py --model sample-crate --include '^crate$' --max-samples 256 --out-dir /tmp/native-crate-audit
```

`--model` defaults to `sample-crate`; `--include` is a component-ID JavaScript
regex, applied before instance expansion. Empty selections fail. Exporter also
retains positional `MODEL OUTPUT` compatibility. `--handedness right|left`
defaults to canonical RH, Y-up metres. The audit always requests RH.

```sh
# Replay explicitly selected exported geometry, without claiming a fresh factory run.
PYTHONDONTWRITEBYTECODE=1 /opt/homebrew/bin/python3.11 pipeline/scripts/character_audit_babylon.py --input /tmp/native-crate-meshes.json --max-samples 256 --out-dir /tmp/native-crate-replay
# Optional NEW unwrap planning for every selected placement, not authored UV verification.
PYTHONDONTWRITEBYTECODE=1 /opt/homebrew/bin/python3.11 pipeline/scripts/character_audit_babylon.py --model sample-crate --max-samples 256 --unwrap-plan --out-dir /tmp/native-crate-unwrap-plan
```

Add repeatable `--allow 'component-a,component-b'` for authored intentional-contact
exemptions. Each token can be a component or exact placement ID. The wrapper
expands component pairs into the placement **names** used by the upstream gate,
records the expansion, and rejects unknown IDs. No automatic exemptions exist.
`--max-samples` is required and positive: it bounds each upstream mesh/direction,
not total runtime. `--timeout 120` sets a per-subprocess timeout in seconds.

`audit.json` retains commands, stdout/stderr, actual exit statuses and complete
upstream JSON (sample counts, strides, undecided points, skips and failures).
Exit 0 means these bounded checks passed; 1 means a gate found defects; 2 means
error, unrun required work, or incomplete volume coverage. Closed-manifold
eligibility uses the upstream welded-edge counter at its default six-decimal
precision. Open/nonmanifold meshes, zero normals, inconsistent base winding,
degenerate triangles and undecided samples cannot earn a clean audit result.
Independent volume gates still both run after valid export. All-disjoint AABBs
or a single mesh legitimately produce no penetration pairs; allowed pairs are
explicitly recorded. Defect status takes priority over incomplete coverage,
while any execution error takes priority over defect status.

This invokes the actual `self_intersection.py` and `pairwise_penetration.py`
CLIs. It does not modify the original `character_audit.sh`. Their deterministic
sampling can miss thin intersections; a bounded pass is not exhaustive collision
proof. Original `uv_unwrap.py` creates new UVs and reads only the first mesh of a
wrapper. Default authored UV verification is therefore **unassessed**. Optional
`--unwrap-plan` invokes it separately for every selected placement; its failures
also affect the audit exit status, but never certify the existing UV channel.

Exporter integration format (`schemaVersion: 1`, `engine: Babylon.js`):

- `meshes[]`: stable placement `id` and `name`, original `componentId`, nested
  world `vertices` and `normals`, flat `positions` and `worldNormals`, flat triangle
  `indices`, unchanged UV pairs, raw RGB `colors` or null and separate `colorAlpha`.
- Morph evaluation precedes skin evaluation using Babylon CPU palette semantics.
  Every visible regular instance uses its actual world matrix; thin instances
  use their local matrix multiplied by the base world matrix. CLI enables
  NullEngine instancing capability before constructing the factory.
- Z reflection converts positions and normals when source/output handedness
  differ. Normals use inverse-transpose world transforms and normalization.
  RH indices have positive cross-product/normal orientation (CCW); LH indices
  have negative orientation (CW). A single base-mesh orientation decision plus
  world determinant/reflection changes winding globally, never per-face repair.
- `worldMatrix` maps source-local coordinates to output-world coordinates,
  column-major. It is provenance, not a transform to apply again to world data.
  `selection` records exclusions and placement counts.
- Colors are raw vertex channels, without gamma conversion, material/texture
  multiplication or per-instance shader color multipliers. Missing colors remain
  null, not manufactured white. UVs retain the Babylon authored convention.

`exportMeshes(meshes, options)` is reusable with a supplied in-memory pose.
The CLI creates a **registered factory default pose**, physics disabled, without
advancing animation. It does not export live browser edits, GPU-only displacement,
rendered materials, pixels or an arbitrary animation timestamp. Skinned normals
follow Babylon's CPU blending semantics. No intake, anatomy, camera, quality or
production acceptance is implied. Color/landmark-specific gates still require
their own genuine reference/spec inputs; this wrapper does not invent them.

Verification:

```sh
node --import ./viewer/node_modules/tsx/dist/loader.mjs viewer/scripts/export_pipeline_test.ts
PYTHONDONTWRITEBYTECODE=1 /opt/homebrew/bin/python3.11 -m unittest pipeline.forge.tests.test_native_geometry_audit -v
./viewer/node_modules/.bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck --types node --typeRoots ./viewer/node_modules/@types viewer/scripts/export_pipeline_mesh.ts viewer/scripts/export_pipeline_test.ts
```

Eight integration tests and focused TypeScript checking passed. The viewer-wide
check was rerun and reported a separately owned `viewer/src/reviewRoute.ts:27`
error: `overrideMaterialSideOrientation` is not a property of `AbstractMesh`.
That file was not changed by this work.

## Descriptor-only and optional routes

The projection command is usable as an engine-neutral plan producer, not a bake:

```sh
"$NATIVE_PY" pipeline/forge/stage3_build/bake_projected_texture.py --reference-image "$NATIVE_REFERENCE" --delit-image /absolute/path/to/delit.png --camera "$NATIVE_WORK/reference-camera-hint.json" --mesh-id target-component --projection-mode perspective-camera-projection --texture-size 1024 --unseen-strategy request-additional-view --out "$NATIVE_WORK/projection-plan.json"
```

Neither source nor copied script rasterizes pixels. There is no verified
`projectedTextureBake` consumer in the current native generator. Likewise,
`material_views.py` produces a review plan and `fit_params.py --input FILE --json`
fits the CLI's quadratic objective; neither launches a Babylon render loop.

Optional vision wrapper syntax, only with a pre-existing provisioned interpreter:

```sh
"$NATIVE_PY" pipeline/forge/stage1_intake/run_vision_adapter.py --vision-python /absolute/path/to/provisioned/python health
```

The default isolated vision interpreter, GLB integration interpreter and GLB
integration Node dependencies are absent in this checkout. No install/prefetch
commands are implied. Companion `build-character.sh`/`capture-character.mjs`
still target Three showcase code; do not run them against viewer as substitutes.

For upstream tests without root `forge` package shadowing:

```sh
(cd pipeline && PYTHONDONTWRITEBYTECODE=1 /opt/homebrew/bin/python3.11 -m unittest discover -s forge/tests)
```

Source showcase skips and native test results must be reported separately. A
copied source test or successful `--help` is not native rendering evidence.
