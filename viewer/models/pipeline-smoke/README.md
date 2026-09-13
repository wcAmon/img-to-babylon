# Pipeline smoke specimen

This is an authored, reference-free engineering specimen for migration GPU checks, not a
character reconstruction and not visual evidence for female-tactical. Its source of truth is
spec.json and the numerical dimensions below. No photograph, likeness score or review approval
is implied. The first blockout pass is intentionally not reviewed or marked complete.

Design: a blue-grey pedestal 0.65 x 0.12 x 0.4 m, an upright tapered orange elastomer beam
with five measured-by-construction cross sections, and a small metallic annulus. The geometry
is deliberately simple enough to expose incorrect normals, displaced shadows, mirrored UVs
and skeletal pivot errors. The beam is a synthetic deformation specimen, not human anatomy.

GPU checks: inspect the beam before/after its authored 35-degree skeletal bend; inspect the
small morph tip offset and the repeatable normal/roughness/height maps. The checker projection test
is an authored UV/matrix test pattern, not a reference-photo projection or a de-lighted image.
Three-dimensional silhouettes must remain consistent from front, side and rear. Shadows,
displacement, normal orientation and material appearance still require actual browser evidence.

## Factory and regeneration

`createPipelineSmokeModel.ts` exports a default `ModelFactory(scene, options) => BuiltModel`.
It wraps `generatedFactory.ts`, which exports the native `createPipelineSmokeModel(scene,
options) => TransformNode` and look-dev/camera helpers. The wrapper adds an explicitly authored
two-bone mechanism, a 0.65-influence tip morph and a 2x2 checker with a nonidentity UV matrix.
The beam itself is the strict-generated five-station sweep (87 vertices). The tip section has
radii 0.045 / 0.028 m. No skeleton or motion is inferred from an image.

From the repository root:

```sh
/opt/homebrew/bin/python3.11 pipeline/forge/stage3_build/generate_babylon_factory.py viewer/models/pipeline-smoke/spec.json --out viewer/models/pipeline-smoke/generatedFactory.ts --pass-id blockout --force
/opt/homebrew/bin/python3.11 pipeline/forge/tests/test_smoke_babylon.py
```

Desktop registry entry (already observed integrated):

```ts
'pipeline-smoke': () => import('../models/pipeline-smoke/createPipelineSmokeModel'),
```

The wrapper does not add Havok, camera or lights to the host scene. Desktop owns those resources.
For native look-dev use the generated light/camera helper exports. Metadata `rig` and
`sculptRuntime.meshes.beam.morphTargetManager` expose the actual pose controls for before/after
GPU captures. Reset bone `bend` to identity and set morph influence to zero for the rest view.
All fixture allocations belong to `root.metadata.ownedResources`; dispose the returned model.
Headless evidence: 0.241153335 m maximum bone-only vertex displacement in both RH/LH scenes,
five distinct material maps, 0.006 m displacement amplitude, and six clean construction/disposal
cycles across both scene modes. Shader pixels and photography-derived projection are not covered.
