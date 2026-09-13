# Standalone RigSpec → native Babylon milestone zero

Implemented only in `pipeline/forge/stage5_rig/emit_babylon_rig.py`. The Python
`emit_typescript(spec, component_extents, capsule_radius, overlap_factor=1.2,
cap_segments=8, radial_segments=16, height_segments=None)` signature matches
`emit_rig.py`. The emitted module imports only `@babylonjs/core` and exports
`createRigMilestone0(scene)` returning `{ mesh, skeleton, bones, meta }`.
It does not call or integrate with the factory generator, viewer registry,
runtime/state/material infrastructure, CLI, or figure.

## Coordinates, binding and weights

- Input coordinates remain right-handed, Y-up, in metres. Set
  `scene.useRightHandedSystem = true` before calling the factory. A left-handed
  scene is rejected before any resources are created; the factory never changes
  the shared scene's handedness. There is no Z reflection or triangle reversal.
  `forward` and `bind_pose` retain the source's descriptive-only semantics.
- Geometry is the source's synthetic watertight capsule: shared poles and radial
  rings, modulo seam indices, identical triangle order, radius, Y centre and
  ring-resolution derivation (three rings per minimum envelope radius).
  Position storage preserves both source Float32 roundings around Y translation.
  Babylon normals are computed with the right-handed option. Dimensions are
  baked into vertices; the mesh starts with identity transforms.
- Each actual `Bone` receives a local translation matrix: root joint position,
  or child joint minus parent joint. That matrix also initializes its rest and
  bind matrices. Babylon derives absolute inverse bind matrices through the
  parent hierarchy. No joint-position-only placeholder matrices are used.
- Babylon bones are constructed parent-first. Explicit palette indices retain
  the original `RigSpec.bones` order, even for unsorted input. Consequently
  `skeleton.bones` construction order may differ from `BONE_IDS`; use the
  explicit bone index when addressing the skinning palette.
- `mesh.skeleton` attaches a real `Skeleton`; `numBoneInfluencers` is four.
  `VertexData.matricesIndices` and `matricesWeights` carry four packed slots per
  vertex. Babylon uses Float32 index attributes rather than Three's Uint16
  attribute. Weight attributes are Float32 in both implementations.
- The source's Euclidean envelope formula is unchanged:
  `R = 0.5 * max(width, depth) * overlap_factor`,
  `w = max(0, 1 - (distance_to_segment / R)^2)^2`.
  Stable descending order retains the top four, then normalizes. Zero total
  chooses the nearest segment over all bones, with input order breaking ties;
  padded slots are zero. `meta.fallbackVertices` reports those vertices.
- `validate_rig_payload.py` expects row-major affine matrices, with translation
  at indices 3, 7, 11. Babylon's flattened matrices place translation at
  12, 13, 14. The test transposes and topologically remaps its readback before
  invoking that structural validator. This emitter does not accept that payload
  as a substitute for RigSpec.

## Deliberate limits and validation differences

This is the source's milestone-zero straight vertical, single-chain capsule
experiment, **not production character rigging**. It accepts no subject-derived
mesh. Off-axis chains and branching chains are rejected. Leaf tips must be
explicit; single-child tips can default to the child joint. Component extents
are still a separate input rather than measured subject geometry.

The source checks constant X/Z, but centres capsule vertices at X=Z=0 even when
all joints share a nonzero X/Z offset. This port preserves that numeric behavior;
use origin-centred chains. It also retains the source's lack of monotonic-Y or
segment-continuity enforcement. Such accepted but unusual inputs are not a
claim of anatomical rig validity.

Additional port guards reject cyclic ancestry, non-finite positions/extents,
nonpositive/non-finite radius and overlap, and invalid integer tessellation
(cap ≥ 1, radial ≥ 3, height ≥ 1). The source's minimal validator misses some
of these cases. Valid source input derivation is otherwise unchanged.

`geodesic_skinning.py` is a separate voxel-distance binder, with rigid-role
partitioning and unreachable reporting. Neither the original milestone emitter
nor this port calls it. No geodesic/real-character binding, attachment/hair
partition integration, IK solver, animation clips, physics, export pipeline,
or editor integration is added. Role/IK/ellipsoid fields do not implement those
features merely by being present in RigSpec.

## Executable verification

From the repository root, without installs or downloads:

```sh
PYTHONDONTWRITEBYTECODE=1 /opt/homebrew/bin/python3.11 -m unittest discover -s pipeline/forge/tests -p test_babylon_rig.py -v
viewer/node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --types node --typeRoots viewer/node_modules/@types viewer/scripts/rig_babylon_test.ts .img2babylon/cli/rig-port/emitted.mts
```

The Python test writes the generated module and JSON readback beneath
`.img2babylon/cli/rig-port/`, linking only the existing viewer `node_modules`
for scratch module resolution. `.mts` explicitly selects ESM outside the viewer
package. It uses `node --import viewer/node_modules/tsx/dist/loader.mjs` rather
than the tsx CLI's IPC listener, which is prohibited in the restricted sandbox.
Missing dependencies or runtime errors fail the new suite; no silent skips.
The scratch module/result are overwritten per fixture and retain the final case.

To rerun that final generated module directly:

```sh
node --import ./viewer/node_modules/tsx/dist/loader.mjs viewer/scripts/rig_babylon_test.ts .img2babylon/cli/rig-port/emitted.mts .img2babylon/cli/rig-port/result.json
```

`rig_babylon_test.ts` creates a real Babylon `NullEngine`, scene, mesh, bones and
skeleton. It calls Babylon's `mesh.applySkeleton(skeleton)` and reads the changed
position buffer. Bind pose and return-to-rest must reproduce the original
vertices. Each bone rotates 90° about local Z separately; every runtime vertex
is compared against an independent closed-form weighted rotation around that
joint, including all descendants. Off-axis influenced vertices must move.
The gate also checks real hierarchy/palette indices, bind × inverse identity,
normalized weights and closed two-face-per-edge capsule topology.

Python independently checks every sampled capsule vertex, triangle count,
all four weight slots, nearest fallback, local/inverse translations and payload
structure. Derived constants are compared directly with output from the existing
Python Three emitter on identical inputs. Fixtures cover the default three-bone
arm, narrow-envelope fallback, and a reversed-input six-bone upward chain with
nonzero root Y and more than four candidate influences. Rejections and exact
Python signature parity are also tested.

Observed with local Babylon 8.56.2 / Node 22.22.2:

| Fixture | Vertices | Maximum weight-sum error | Maximum pose-coordinate error |
| --- | ---: | ---: | ---: |
| Default three-bone arm | 482 | 2.98e-8 | 1.37e-7 |
| Nearest fallback | 402 | 0 | 1.20e-7 |
| Reversed six-bone upward chain | 218 | 2.98e-8 | 7.71e-7 |

Bind/reset errors were zero for all three. The default elbow pose moved 289
vertices and exercised 48 blended vertices. All five new Python tests and the
focused strict TypeScript check passed. Existing geodesic tests (12) and payload
validation tests (4) passed. The existing Three milestone runtime classes (2)
skipped because `IMG2THREEJS_SHOWCASE_ROOT` was not configured; no Three
runtime A/B comparison is claimed. Source-Python parity and Babylon deformation
are executed independently here.

These are numerical CPU-skinning checks using Babylon's real palette and mesh
buffers. NullEngine does not validate GPU shader output, browser appearance,
visual elbow quality, lighting, culling, or production animation behavior. No
browser or GPU rendering evidence was obtained, as required by this task.
