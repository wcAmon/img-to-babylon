---
name: glb-ready
description: Turn a procedural Babylon model, a text-to-3D mesh or a messy GLB/FBX into a game-ready GLB within a triangle and texture budget, with clean normals, metres, Y-up, and animation clips preserved.
version: 1.0.0
---

# glb-ready

You are delivering a GLB that a web game will load. The site that receives it has its own checker; this skill gets you
to the point where that checker passes and the model looks right. Read this file once, run the scripts, read
`lessons.md` only when something goes wrong.

## Contract

The delivered GLB must satisfy the `nomen-land` profile (`profiles/nomen-land.json`) unless the target site says otherwise:

| Item | Default (profile `nomen-land`) |
|---|---|
| Triangles | <= 20,000, counted as GLB index count / 3 across every scene-node instance |
| Textures | <= 8 images, each side <= 2048, PNG or JPEG, all embedded (bufferView), no external URIs |
| File | <= 20 MB |
| Nodes | <= 500 |
| Units and axes | metres, glTF Y-up, front toward +Z; base on y = 0, XZ centred on the origin |
| Geometry | NORMAL present; TEXCOORD_0 present when textured; unit normals; no NaN; no zero-area triangles |
| Compression | no Draco, Meshopt or KTX2 |
| Animation | clips kept and named; skin joints <= 64; weights sum to 1 (1e-5) |
| Material | one PBR metallic-roughness; no extensions beyond KHR_materials_* |

`python3 glb-ready/scripts/glb_audit.py <file.glb> [--profile nomen-land|path.json] [--json]` checks all of this and
prints `OK`, `FIX` (textures, nodes, size, grounding, normals, compression) or `REDUCE` (triangles). Exit 0/1/2.

The last gate is always the target site's own checker. For Nomen Land it is `nomen-glb check`
(`{Origin}/skills/assets/glb-prep`); `glb_audit.py` covers what that checker does not (grounding, normals, skins, clips,
compression). Run both.

## Which path

| Input | Path |
|---|---|
| A procedural model of this repo (id in `viewer/src/registry.ts`) | `cd viewer && npm run export-glb -- <id> out.glb` then `glb_audit.py` |
| A text/image-to-3D mesh (Trellis, Tripo, Rodin, Hunyuan ...) | `repair_shell.py` -> `reduce_mesh.py` -> (`bake_atlas.py` or `shrink_textures.py` when textures fail) -> `render_review.py` -> `glb_audit.py` |
| Someone else's GLB/FBX/OBJ, no skeleton | same as above starting at `reduce_mesh.py` (Blender imports FBX/OBJ) |
| A rigged or morphed model | only `shrink_textures.py`, `retarget_clips.py`, `render_review.py`, `glb_audit.py`. **Never reduce it.** To cut triangles, go back to the unrigged mesh, reduce, re-UV, re-bake, re-rig |
| Already within budget | record the numbers, skip reduction, still run `glb_audit.py` |

All Blender scripts run as
`blender -b --factory-startup --python-exit-code 1 --python glb-ready/scripts/<script>.py -- <in> <out> [flags]`.
They refuse to overwrite an existing output without `--force`, write `<out>.report.json` (sha256, triangles, parameters,
warnings) and exit 0 ok / 1 target not met / 2 usage or unsupported input, with one stderr line saying what to do next.

Scripts:

- `glb_audit.py <glb> [--profile] [--json]` (system python3, stdlib): the checker above.
- `reduce_mesh.py in out --target N [--keep-uv | --rebuild-surface] [--protect x0,y0,z0,x1,y1,z1 --max-protected-error 0.001] [--min-part-faces 12]`:
  `--keep-uv` (default) decimates in place and keeps materials, UVs and textures; good for props that keep >= 30%.
  `--rebuild-surface` joins, welds, drops custom normals and small islands and outputs a grey mesh with no UV: follow with
  `bake_atlas.py`. `--protect` keeps a box (glTF metres) plus one ring of neighbouring vertices within the error you allow. Refuses rigged input.
- `repair_shell.py in out (--orientation-only | --shell-repair) [--voxel-k 0.0025] [--shell-k 0.006] [--smooth 0.25x2]`:
  for raw generated meshes. Welds split vertices, fixes face orientation, keeps the largest connected piece, optionally seals and remeshes.
  Output is still high-poly; `--orientation-only` still smooths a little.
- `bake_atlas.py in out [--size 2048] [--source vertex-color|material|high=<glb>] [--margin 16] [--height <m>] [--ground]`:
  new smart-UV atlas and one baked baseColor PNG; `--height`/`--ground` scale to metres and put the base on y = 0.
- `shrink_textures.py in out [--max 2048] [--jpeg-quality 82] [--max-textures 8]`: downscales and embeds images and
  nothing else. The only texture tool allowed on rigged models.
- `render_review.py in outdir [--views front,back,left,right,three-quarter,top] [--gray] [--unlit] [--size 1024]`:
  rest-pose orthographic renders plus `cameras.json`/`manifest.json`. Diagnostic only.
- `retarget_clips.py base.glb source.fbx|glb outdir [--in-place] [--ground-clearance 0.002]` and
  `validate_retarget.py base.glb clips.glb --source source.glb`: Mixamo-named skeletons only; skin bytes must not change,
  evaluated FK error <= 0.1 degrees.

## Order of operations

Raw mesh -> reduce or retopo -> UV -> bake -> rig -> morphs -> animation. Every step only goes forward; going back
means redoing everything after it. After reduction the old UVs and textures are void (`--keep-uv` is only for props with a
gentle ratio). After rigging, triangles are frozen.

## Settled numbers

| Topic | Value | Source |
|---|---|---|
| Triangle count | GLB index count / 3 across instances; never Blender polygons | web-game-asset-workflow, guava-bot README, triage spec |
| Bake margin | 16 px (0 opens seams) | yui R8, R9 |
| Skin influences | keep up to 8 (JOINTS_0/1, WEIGHTS_0/1); cutting to 4 causes discontinuities | kimodo |
| Shell thickness | model height x 0.004 to 0.006 | yui R7 C4, prepare_bust |
| Voxel size | height x 0.0015 (raw) to 0.0028 (with shell repair); props 0.008 to 0.01 m | yui R7, prepare_bust, VR remesh |
| De-stair smoothing | factor 0.25 x 2 (light) to 0.55 x 5 (heavy) | trellis refine, prepare_bust |
| Smart UV | angle limit 66 deg, island margin 0.015, area weight 0, correct aspect | yui R8, prepare_bust |
| High-to-low bake | Cycles 8 samples, cage 0.025 to 0.035, max ray 0.06 to 0.08, margin 4 | VR remesh |
| Protected-region error | sampled bidirectional BVH surface distance <= 0.001 m | reduce_web_mesh |
| Retarget error | serialized GLB FK <= 0.1 deg | kimodo-mixamo-retarget |
| Budgets | crowd 5k / 1024; mobile-bust 12k / 2048; hero-bust 25k / 2048; Nomen Land 20k / 2048 x 8 | web-game-asset-workflow, Nomen Land |

## Do not repeat

1. Voxel-remeshing a raw Trellis mesh directly, or remeshing repeatedly. Fix orientation, smooth lightly, seal the shell, then remesh once.
2. Scaling along normals or over-smoothing a face: scalp spikes and mushy features.
3. Global solidify or voxel on a mesh with thin sheets: the sheets vanish.
4. Decimating a rigged or morphed asset.
5. Keeping old UVs or textures after reduction.
6. Bake margin 0.
7. Treating a turnaround collage as three calibrated cameras.
8. Projecting onto the metre-scaled output; project in the original-scale .blend.
9. Applying Blender's axis compensation again to data that is already Y-up.
10. Multiplying the source rotation onto the target's A-pose basis when retargeting; replace the bind local quaternion instead.
11. Cutting skin weights to the top 4.
12. Reporting Blender polygon counts as triangles.
13. Treating a Blender render as final acceptance; accept in the target engine (Babylon).
14. Reducing or baking with a stale `custom_normal` attribute still on the mesh: black patches.
15. Baking world transforms and un-parenting an animated model.

## Review

1. Look at the grey mesh first, then the textured one. Views: front, left, right, back, three-quarter, top. Both sides; one side hides a patch.
2. Compare grey, lit and unlit (emission) renders from the same camera to tell geometry, lighting and base colour apart.
3. `glb_audit.py` all green, then the target site's checker.
4. Load it in Babylon once (this repo's viewer `#reviewGLB=` route, or the target site). Passing numbers do not mean it looks right.
5. Keep the source and every candidate; write each output to a new directory; the report file records hashes and parameters.

## Environment

- Blender 5.x in background mode: `blender -b --factory-startup --python-exit-code 1 --python glb-ready/scripts/<script>.py -- <args>`. On macOS the binary is `/Applications/Blender.app/Contents/MacOS/Blender`.
- Blender scripts use only Blender's bundled Python and numpy. No scipy, no Pillow.
- `glb_audit.py` and `validate_retarget.py` run on the system `python3` (3.9+, stdlib only).
- `export-glb` needs `cd viewer && npm install` (Node 18+).
- Blender MCP (ahujasid `mcp-for-blender`) exists but is not needed; see `lessons.md` section 1.
- Tests: `python3 -m unittest discover -s glb-ready/tests -t . -p 'test_*.py'` (Blender tests skip when Blender is absent).
