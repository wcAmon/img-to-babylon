# BabylonSculptSpec v1 explicit canonical import bridge

This is migration infrastructure, not a reconstruction or visual review. It adds
`pipeline/forge/stage2_spec/import_babylon_sculpt.py` and
`viewer/scripts/export_legacy_pipeline.ts`. It does not change the female model,
canonical validator, native generator, runtime, capture, or workflow. Native
production generator integration is a **later task**; do not send these imports
to an existing primitive fallback path.

## APIs and commands

Python stdlib API:

```python
canonical = import_spec(legacy, native_export=None, assessment=None)
original = restore_legacy(canonical)
```

`restore_legacy` returns a deep copy equal to the entire original parsed JSON,
including unknown fields. Lossless means JSON values, not source whitespace or
object-key formatting. `import_spec` does not mutate its arguments.

From repository root, using existing dependencies only:

```sh
node --import ./viewer/node_modules/tsx/dist/loader.mjs viewer/scripts/export_legacy_pipeline.ts viewer/models/female-tactical/spec.json .img2babylon/cli/legacy-female-export.json
PYTHONDONTWRITEBYTECODE=1 /opt/homebrew/bin/python3.11 pipeline/forge/stage2_spec/import_babylon_sculpt.py viewer/models/female-tactical/spec.json --native-export .img2babylon/cli/legacy-female-export.json --out .img2babylon/cli/legacy-female-canonical.json
node --import ./viewer/node_modules/tsx/dist/loader.mjs viewer/scripts/export_legacy_pipeline.ts viewer/models/female-tactical/spec.json .img2babylon/cli/legacy-female-report.json --verify .img2babylon/cli/legacy-female-canonical.json
```

Omit `--native-export` for a recipe-only import. That output is archival/editable
but not render-ready. `--assessment genuine-assessment.json` accepts only
`preSpecAssessment`, `qualityContract`, `referenceCamera`, `localSpecSearch`,
`viewEvidence`, `scores`, `suitability`, and `pipelineRouting`. Values pass through
verbatim; this is not evidence authentication or validation, and supplying them
does not set `productionReady` true. Complete the normal canonical intake and
strict gates separately. The importer prohibits overwriting its source path.

## Explicit field mapping and edit authority

Canonical schema version is `2.1`, as in upstream `new_sculpt_spec.py`; both legacy
`1` and `"1"` are accepted. Legacy ID spelling is never slugified: `targetName`
is retained, `targetId` uses existing `targetId`, then `id`, then `targetName`.
Existing `id`, seed, top-level optimization and proportions are retained too.

| Legacy data | Canonical location / conversion |
| --- | --- |
| Entire authored spec | `extensions["babylon-sculpt-v1"].source`, exact JSON snapshot and edit authority |
| Component IDs/order, groups, parents, names, levels, material refs, optimization entrypoints | Retained on every `componentTree` entry |
| All component fields, including attachment, extra pivot and collider metadata | `component.extensions["babylon-sculpt-v1"].source`, exact snapshot |
| `dimensions.w/h/d` | `dimensions.width/height/depth`, metres; other dimension fields retained |
| Geometry recipe including rings, smooth, power, relief, outline, dome and segments | `geometryDescriptor.extensions["babylon-sculpt-v1"].recipe`, exact authored recipe |
| Box / ellipsoid / loft / patch labels | `box` / `ellipsoid` / `extrude` / `extrude`; these are canonical descriptors, **not permission to substitute generic geometry** |
| Effective local position/rotation | RH `transform`, plus exact quaternion and local matrix contract below |
| Authored scale | `nativeTransform.authoredScale` plus full component snapshot; effective scale is identity |
| Effective pivot | `actionProfile.pivot` origin; authored extra pivot remains in component snapshot |
| Collider offset | Reflected Z in `actionProfile.collider`; sizes and other fields retained |
| Source images and provenance | `sourceImages` retained; `sourceImage` points to authored hero path if present |
| Review history | `reviewHistory` copied unchanged, including failures, actions, notes and evidence paths |
| Legacy build stage and passes | Extension `buildStage` / `buildPasses`; never promoted into completed canonical passes |
| Physics bodies, membership, mass/friction/restitution/COM, constraints and unknown physics fields | Extension `physics.recipe`, exact original, explicitly labelled `coordinateSystem: legacy-LH`, `status: preserved-not-simulated` |
| Materials | Stable IDs and scalar/custom parameters retained; `metallic` maps to `metalness`; exact original is in each material's extension |

The upstream material validator requires hexadecimal baseColor. `baseColor` is
therefore an 8-bit compatibility representation, while
`material.extensions["babylon-sculpt-v1"].baseColorRGB` preserves the original
floating-point RGB exactly. A bridge consumer **must use this exact RGB** when
`useExactRGB` is true. The values retain legacy `Color3` numeric semantics; no
sRGB/linear conversion is guessed. `kind` and every other authored parameter are
also recoverable from the original material snapshot. This adapter does not
claim PBR render equivalence: legacy `buildSculpt` used StandardMaterial and did
not consume its authored roughness as a PBR parameter.

Physics intentionally stays a tagged LH recipe because canonical ObjectSculptSpec
has no matching complete physics contract. It must not be treated as RH Havok
runtime data. A later physics adapter must convert points, rotation axes, limits
and body frames according to their semantics and test real constraints. Merely
recursively negating every Z-like number would corrupt axial vectors and angles.
No physics simulation or gate completion is claimed by this import.

The full original snapshot is authoritative for edits; component/material recipe
snapshots are convenient indexed copies. After editing the source snapshot,
regenerate the export and reimport. An exporter/source snapshot mismatch is a
hard error. Do not edit baked vertices as the ongoing sculpt recipe or silently
merge independently edited snapshots. Source and geometry-builder SHA256 values
are recorded in export provenance and carried into the canonical extension.

## Geometry integration format (version 1)

Each exported component optionally has:

```json
{
  "geometryDescriptor": {
    "nativeVertexData": {
      "version": 1,
      "coordinateSystem": {"handedness": "right", "up": "Y", "units": "m"},
      "space": "component-local",
      "dimensionsBaked": true,
      "transformBaked": false,
      "winding": "CCW-normal-consistent",
      "positions": [], "normals": [], "uvs": [], "indices": [],
      "windingFlippedTriangles": [],
      "provenance": {}
    }
  }
}
```

Arrays above illustrate field names, not valid empty geometry. Positions and
normals are packed XYZ, equal nonzero lengths divisible by three; UVs are packed
UV with two values per vertex or `[]` if the source has no UV channel. Indices are
nonempty triangle triples. Normals and positions are reflected from the actual
procedural mesh. UVs are unchanged; missing UVs are never fabricated. The exporter
uses the existing `createGeometry(component, scene, 1)` in a LH NullEngine scene,
including its real smooth/flat-shaded topology and patch triangulation.

A future native generator must:

1. Recognize the descriptor **before** generic primitive dispatch, attachment
   synthesis, dimension scaling or procedural deformation. Use these already
   dimensioned vertices directly to build `VertexData` in a RH scene.
2. Require the declared version/space/units and valid finite packed buffers.
   Preserve normals/UVs/indices; do not regenerate a primitive or apply dimensions
   a second time. Keep absent UVs absent.
3. Use the native local transform contract and original parent IDs. Never bake
   world transforms into local geometry or add an extra pivot translation.
4. Honor exact material RGB and parameter preservation. Read legacy physics only
   through a separate explicit adapter.
5. Reject recipe-only geometry when
   `geometryDescriptor.extensions["babylon-sculpt-v1"].requiresNativeVertexData`
   is true and `allowPrimitiveFallback` is false. **All imported geometry uses
   this guard**, including box/ellipsoid, to avoid accidental convention drift.
6. Require completed canonical intake/strict gates before production generation.
   The extension does not bypass canonical quality or topology rules.

The unchanged canonical validator does not validate this extension's buffers;
`validate_native` does so at import. The eventual consumer must also fail closed
at its own boundary. The executable `--verify` path already consumes this format
to construct real Babylon meshes; it is a numerical test consumer, not generator
integration.

## Handedness, winding and hierarchy

Let `H = diag(1,1,-1,1)`. Positions and direction normals become `H*p` and `H*n`.
The legacy matrices become `M_RH = H*M_LH*H`. Babylon's authored Euler tuple is
YXZ composition (`RotationYawPitchRoll(y,x,z)`); the quaternion conjugation is
`[qx,qy,qz,qw] → [-qx,-qy,qz,qw]`. Canonical `transform.rotation` is reconstructed
in upstream Three XYZ order. Copying `[-x,-y,z]` directly into an XYZ field would
be wrong for simultaneous nonzero rotations.

`component.extensions["babylon-sculpt-v1"].nativeTransform` declares version 1,
`space: parent-local`, a column-major `localMatrix` (translation indices 12–14),
`rotationQuaternion` in XYZW order, canonical `eulerOrder: XYZ`, `effectiveScale`
and `authoredScale`. A consumer may compose the quaternion with canonical
position, or use the matrix. It must preserve parent-local transforms and must
not assume input components are parent-first.

Actual `buildSculpt` ignores `transform.scale` and any extra authored pivot
metadata: dimensions are baked into geometry, pivots are TransformNode origins.
The adapter reproduces that behavior while retaining ignored authored values,
rather than silently introducing scale or pivot changes during migration.

Winding conversion deserves care: legacy Babylon normals are computed from the
**negative** triangle cross product (LH clockwise convention). Converting that
convention to canonical RH CCW reverses winding once; reflecting geometry has
negative determinant and reverses orientation again. For the existing builder's
meshes those two reversals cancel, so the final index order is unchanged while
Z positions/normals are reflected. Blindly swapping the final indices once
would invert their relationship with the retained outward normals. The exporter
checks each transformed triangle against its reflected shading normals, swaps
its last two indices when necessary, and records the triangle number in
`windingFlippedTriangles` for exact inverse conversion. Degenerate triangles
retain their source order. Tests assert geometric/shading-normal agreement and
recover the exact original index array using that conversion record. Both
current fixtures required zero additional swaps.

## Zero-gate state and evidence

Without caller assessment, qualityBar, anatomy and camera are explicitly
`unassessed`; camera `solved` is false. No measured landmarks, invented confidence,
review records or quality acceptance are produced. Canonical `buildPasses` starts
empty. Existing reviewHistory is preserved as history, not reinterpreted as
canonical approval. `productionReady` is always false; required gates include
canonical intake, canonical strict quality and native bridge integration.

Run the bounded checks:

```sh
PYTHONDONTWRITEBYTECODE=1 /opt/homebrew/bin/python3.11 -m unittest discover -s pipeline/forge/tests -p test_native_legacy_import.py -v
viewer/node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --types node --typeRoots viewer/node_modules/@types viewer/scripts/export_legacy_pipeline.ts
```

Five tests exercise source preservation, bad/stale exports, invalid buffers,
recipe-only imports and assessment passthrough. Runtime tests use both a simple
four-kind fixture (nonzero XYZ rotations/translations, authored nonidentity scale,
extra pivot metadata, nested parents and reversed input order) and the complete
existing female fixture. They regenerate source geometry independently, construct
RH meshes from imported buffers, verify every local/world vertex, normal, UV,
triangle roundtrip, H*M*H transform, XYZ/quaternion equivalence, IDs, hierarchy,
dimensions, material parameters and history. The unmodified canonical validator
is executed with `--strict-quality`; **failure is expected and required** for
both unassessed imports.

Observed with existing Babylon 8.56.2:

| Fixture | Components | Vertices | Triangles | Max local/world/matrix error |
| --- | ---: | ---: | ---: | ---: |
| Simple transformed hierarchy | 4 | 502 | 871 | 0 / 0 / 0 |
| Full female fixture | 125 | 23,799 | 19,762 | 0 / 0 / 0 |

Female fixture contained 13 materials, 77 lofts, 29 boxes, 12 patches and 7
ellipsoids. Its SHA256 for this run was
`3fdd3c63e931d2e7299b0f99a6384696e642c389b8212c58043608e931f6f1dc`;
the test verifies byte-for-byte source immutability. Reports and imported copies
are scratch `legacy-*` artifacts only. No female edits, visual/anatomy quality
acceptance, camera solve, GPU/browser rendering, material look-dev or Havok
simulation were performed. Generator consumption and production gates remain
explicit integration work.
