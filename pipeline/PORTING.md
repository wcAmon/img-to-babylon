# Babylon execution contract

This directory retains the complete source workflow and its domain corpus. UPSTREAM-SKILL.md and UPSTREAM-README.md are provenance. Run the native entry point from repository root:

```sh
python3.11 pipeline/forge/babylon.py init --state /absolute/workflow.json --reference /absolute/reference.png --spec /absolute/sculpt-spec.json --profile character
python3.11 pipeline/forge/babylon.py next --state /absolute/workflow.json
python3.11 pipeline/forge/babylon.py mark image-analysis --state /absolute/workflow.json --evidence /absolute/analysis.md
```

Keep the source's ordered intake, anatomy, topology, hair, material, action and visual gates. An unknown or unavailable adapter must report its original applicability/availability boundary. Missing evidence is not a passing result. A baseline Three.js-oriented test is not proof of native runtime parity.

Exact native command substitutions and prerequisites: `pipeline/NATIVE-COMMANDS.md`. Source-named emitters and source showcase scripts remain parity oracles, not production entry points. The route-by-route audit is `docs/migration/executable-route-audit.md`.

## Engine boundaries

- `stage3_build/generate_babylon_factory.py`: native generator; the preserved Three generator is only a parity oracle.
- `stage5_rig/emit_babylon_rig.py`: native equivalent of the original limited standalone RigSpec emitter; this does not expand the original milestone-zero scope.
- `stage4_review/babylon_render_bridge.py` and `scripts/capture_babylon_playwright.py`: native camera and evidence contracts. Desktop may use its browser tool instead, provided it persists real screenshots and records the same manifest evidence.
- Source camera angles are degrees; Babylon orbit alpha/beta are radians. A scene's handedness must be explicit and compatible with authored positions, normals, winding and bone bind matrices. Never change a running shared scene's convention silently.
- Source `Group` becomes a TransformNode hierarchy, BufferGeometry becomes VertexData/mesh attributes, `userData` becomes metadata. Preserve stable IDs and all referenced transforms, sockets and attachments.
- Source physical material values require corresponding Babylon PBR configuration, texture color-space/UV conventions and actual shader features; copying JSON roughness into unused metadata is not a port.
- Bone weights, morph data and inverse binds require numerical deformation tests. A hierarchy named after bones is not a working rig.
- Havok is authoritative for simulation. Original collider descriptions must be translated into actual shapes and constraints before claiming physics capability.

## User policy overrides

The user requested full migration, superseding the old object-only omissions (hair, likeness projection, material evidence and character workflow). The source's six-lifetime/three-per-pass cap is superseded by six corrections per round with cumulative history retained. Use the native `round` command with an authorized scope, which snapshots sources before a new round. Never automatically restart rounds to evade a limit.

Procedural reconstruction remains the default. Source projection/de-lighting routes may use the user's reference pixels as documented. Neural meshes, downloaded art and external services retain their source opt-in, provenance and licensing boundaries. Full migration does not mean silently using an external image-to-mesh service.

## Existing female-tactical model

Preserve model identity, component IDs, old checkpoints and failed visual reviews. Its existing spec is BabylonSculptSpec v1 and is not automatically an ObjectSculptSpec. Convert data explicitly, retain unsupported fields under a named extension with a tested consumer, and validate the canonical result before native generation. Do not mark the existing polish state complete to sidestep new required character intake.

The lossless import contract is `docs/migration/legacy-import.md`. Use `babylon.py init --legacy-state <old-state.json>` when entering an existing model: it retains the full old state, current round and historical corrections missing from canonical reviewHistory. Then use `round` with the newly authorized scope to snapshot sources and begin the next round. The six-correction budget resets only for that new round; lifetime totals include the imported history.

Desktop capture URLs accept `reviewProfile=<JSON URL>`, `reviewCamera=<native camera JSON URL>`, `reviewGLB=<GLB URL>` and `reviewPass=<pass ID>`. Changing a hash requires reload. `html[data-review-ready="true"]` is set only after the requested route completes; a failure is displayed rather than silently capturing the old view. Save screenshots through the desktop browser tool, with browser/version, URL, dimensions and hashes alongside them.

## Validation

```sh
cd pipeline
python3.11 -m unittest discover -s forge/tests
```

Native numerical tests live in viewer/scripts. Original source runtime tests may require a separate Three.js showcase; retain their skip evidence and run native tests independently. Consult docs/migration/port-status.md from the repository root for verified progress and remaining gaps.
