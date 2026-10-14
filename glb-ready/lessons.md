# Lessons behind glb-ready

Each entry says where it happened, what was tried, what failed, what worked, and the number that stuck. Sources are
project names and file names (character-studio = CS, vr_robot = VR, this repo = I2B). Chinese quotes are the original
record. The "do not repeat" list in `SKILL.md` is section 8 here, with provenance.

## 1. Environment and how scripts run

- Production always ran Blender as `blender -b --factory-startup --python-exit-code 1 --python script.py -- args`: factory settings so no user add-on or startup file leaks in, background so the user's open scene is never touched, exit code so a Python exception fails the caller. Blender swallows `sys.exit` codes without that flag; the glb-ready scripts use `os._exit` for deterministic codes (CS `reduce_web_mesh.py`).
- Only Blender's bundled Python and numpy are assumed. No `.venv`, no scipy, no Pillow: the stdlib auditor reads PNG/JPEG/WebP headers itself.
- Blender MCP (ahujasid `mcp-for-blender`, PyPI 2.0.0, addon v1.7 protocol 7, 31 tools) was installed and smoke-tested on 2026-09-18 (CS `docs/tooling/blender-mcp.md`). It needs the Blender GUI open: 「Blender 必須保持開啟…背景批次 bpy 腳本仍可繼續使用，不必改走 MCP」. Every production run used isolated background processes with factory-empty scenes instead (VR `environment-production.md`: "Blender MCP read-only connection check reported no connected addon. Optimization runs in isolated Blender background processes").
- Blender 5.1 facts met while building glb-ready (I2B `glb-ready/tests`): new materials already carry a Principled node tree and `Material.use_nodes` is deprecated; `Action.fcurves` is gone (layered actions: `action.layers[0].strips[0].channelbags`), but `keyframe_insert` still records and creates the slot; the glTF importer adds a pose-bone display shape object (an `Icosphere` in collection `glTF_not_exported`) that must not be treated as geometry; the glTF exporter's `export_image_format` enum is AUTO/JPEG/WEBP/NONE (no PNG; AUTO keeps a PNG image as PNG).

## 2. Mesh cleanup and reduction

- Trellis raw output for the yui character (CS `docs/yui-trellis2-round7.md`): 604,226 triangles, 284,821 vertices, vertex colours only, no NORMAL. Topology: 「9,041 boundary edges，13,117 三面共享邊、11,272 四面共享邊；139,875 條二面共享邊方向不一致」. Source height about 1.005 units, not metres.
- Round 7 tried six repairs. C1 direct voxel remesh: rejected, 「原有方向/碎面問題形成更多表面瑕疵」. C2 orientation fix plus light smoothing: fewer stripes, eyes and mouth still wrong. C3 voxel on C2: 「沒有解決薄殼破碎」. C4 shell repair on C2 (symmetric thin shell, rebuild, keep the largest connected surface): became the baseline, 306,524 triangles, every one of 459,786 edges shared by exactly two faces. C5 local head smoothing with inward normal offset: scalp spikes, softened features. C6 colour projection onto C4: failed appearance review. The numbers that stuck: 「薄殼厚度 .006、voxel .0025、保留最大連通塊，再輕度平滑」, all in source scale (CS `docs/image-trellis2-refinement-workflow.md` §3).
- Thin sheets vanish under global solidify or voxel. Marry (TRELLIS.2, 4,513,804 raw triangles) lost neck and body surfaces to direct voxel, exhausted memory with dense solidify + voxel, grew spikes with even-offset solidify, kept scars and pinholes after thickening (CS `characters/marry/history/README.md`, `geometry-progress.json`): 「原始薄片不適合直接 voxel」. The jeep in VR lost its body panels to voxel 0.009 until a `SOLIDIFY` of 0.018 (source units) ran first and islands under 12 faces were removed: 3,056,948 raw faces to 2,790 triangles, 0 non-manifold edges (VR `optimize-environment.py`, `abandoned-jeep-audit.json`).
- Pixal3D props (barrier, crate, patients) passed with voxel 0.008 to 0.01 then decimate; the guava-bot Pixal3D output (733,076 triangles, 24.5 MB) was kept only as a comparison (CS `characters/guava-bot/history/20261004-modular-probe.md`).
- Reduce before UV, bake and rig; `reduce_web_mesh.py` deliberately strips UVs, colours and materials and reports `requiresNewUV/Texture/Rig: true`. Generic decimation 「只能產生靜態低模，無法建立正確臉部 edge loops」 (CS `docs/web-game-asset-workflow.md`): eyelid and mouth loops need retopology, not a ratio.
- Protected regions: a vertex group with `vertex_group_factor` 1000 (inverted) keeps the face dense; the result is measured on the re-imported GLB with a sampled bidirectional BVH distance, allowance 0.001 m; a box that only touches an edge has no area and is a usage error (CS `reduce_web_mesh.py`). Two details learnt in I2B: vertex-group *weights* live in the mesh datablock, so assign the group before copying the mesh you restore between rounds, or every retry silently loses the protection; and dilate the protected set by one edge ring, otherwise the chords between kept and collapsed vertices straddle the box boundary and alone exceed 0.002 m on a unit sphere.
- A glTF import is usually a polygon soup: the format splits vertices wherever normals or UVs differ, so a closed sphere arrives with every edge a boundary and one component per face. Weld (`remove_doubles` 1e-6) before counting boundary edges or keeping the "largest component", or you keep one face (I2B `repair_shell.py`).

## 3. Normals and orientation

- A stale `CORNER custom_normal` attribute survives remeshing and shows as black patches: 「R7 重建後保留了過時的 CORNER custom_normal 資料，造成許多黑斑」. Fix: remove `mesh.attributes['custom_normal']` before anything else (CS `docs/yui-blender-round8.md`). Checking "has NORMAL" or "manifold" is not enough.
- `--orientation-only` in the Trellis refine script still smoothed 0.25 x 2; the geometry is not identical to the input, so the report must say so (I2B round-7 refine script reports; glb-ready `repair_shell.py` warns).
- Axes: 「Blender local (x,y,z)=(glTF x,-glTF z,glTF y)。正面朝 Blender -Y」 (CS workflow §4). The Guava decoder already converts TRELLIS Z-up to glTF `(x, z, -y)`; 「勿重複套用舊 Blender 軸向補償」 (CS `docs/trellis2-input-contract.md`).
- fal-family outputs are centred, not grounded; Tripo's front is rotated 90 degrees and Rodin's 180 degrees (CS `docs/character-round6.md`: 「Tripo 90°、Rodin 180°」; heights 1.75 m and 1.90 m).
- Mixamo FBX is centimetres (object scale 0.01), armature-local Y-up, T-pose bind; A-pose or other units were rejected by the profile (CS `docs/kimodo-mixamo-retarget.md`, `retarget_mixamo.py`).

## 4. UV and textures

- Vertex colours are not shipped: every round removed them after baking (「移除所有舊 COLOR_0，避免二次染色」, R8; 「所有暫存頂點色在烘焙後移除」, R10). Before writing vertex colours by hand, convert sRGB PNG values to linear (CS R7: 「PNG sRGB 已與 stdlib decoder 比對，再顯式轉 linear vertex colors」). Baking through nodes needs no manual conversion.
- Cycles 5.1.2 crashes (SIGSEGV in `svm_node_vertex_color`, about half the runs, single-threaded too) when baking from the BYTE_COLOR corner attribute the glTF importer creates for COLOR_0. Convert the attribute to FLOAT_COLOR first (`geometry.color_attribute_convert`); the bake is then stable and the colours correct (I2B `bake_atlas.py`, 0 crashes in 8 runs after the change).
- Bake margin: R9 C1 set it from 16 to 0 to chase brown patches and got 「色塊仍在且增加 UV 接縫，拒絕」; the patches came from a background mask `min(rgb)<.92` eating highlights. Margin stays 16 (CS `docs/yui-blender-round9.md`).
- Projection failures: (a) projecting on the metre-scaled output instead of the original-scale `.blend` (「不能用已縮放的 C6 當輸入，投影座標以原始尺寸校準」, R8); (b) treating a turnaround collage as three calibrated cameras (「不要把三視圖拼版當成三個校準相機…側面手臂垂下而正背面 A-pose，直接投影必然錯位」, workflow §1); (c) front/back projection below the chin dragging grey background in (R9 C4). R10 fixed the remaining seams with surface-adjacency inpainting (1,000 neighbour iterations) and a neck mask limited to z = 0.374 (CS `docs/yui-skin-round10.md`).
- Guava/Pixal channel layout: ORM packed as R = occlusion (default 1, not a baked AO), G = roughness, B = metallic; `doubleSided` defaults true and costs real render time; alphaMode unset means opaque (CS `docs/trellis2-input-contract.md`).
- After reduction the old UV and textures are void; `--keep-uv` is only for props that keep a gentle ratio.
- Read the whole image when sniffing a JPEG's size: the SOF marker sits after the JFIF/EXIF/ICC segments, so a 64-byte header slice reports 0x0 (I2B `glb_audit.py`, found on a real 512x512 skin).

## 5. Skeletons, animation, retargeting

- Double A-pose: 「先前把source rotation又乘target A-pose basis導致肩膀轉兩次，上臂塌縮和尖刺」. Replace the bind local quaternion; never multiply onto the rest twice (CS `kimodo.md`, `mixamo_retarget_math.pose_basis`).
- Naming trap: 「Mixamo mixamorig:LeftShoulder 是鎖骨，mixamorig:LeftArm 是肩關節／上臂起點…SOMA 的無前綴 LeftShoulder 是肩關節、LeftCollar 是鎖骨」 (CS `docs/character-studio/rig-placement.md`).
- Influences: 「最多8個影響，以JOINTS_0/1、WEIGHTS_0/1歸一保存。過去直接截成top4造成不連續，不能只看sum=1就通過」.
- `inverseBindMatrices` are the inverse of the global bind matrices, serialized column-major; adjacent-frame quaternions with negative dot are negated (`retarget_mixamo.py` line 153); yui skipped the jaw and eye joint channels so body clips never drive the face.
- SOMA has two neck links, Mixamo one: merge them per frame, not only at bind (v2 had a 1.737 degree neck error, v3 fixed it; final errors 0.0019, 0.00016, 0.0014 degrees). The gate is `< 0.1` degrees on the serialized GLB (CS `validate_mixamo_retarget.py`). glb-ready's `retarget_clips.py` supports Mixamo-named sources only; SOMA buffers stay in character-studio.
- Root floor correction only lifts the root: 「逐幀 root floor correction 只向上調整整體 root…它不是 foot lock、IK 或碰撞控制器」 (CS `guava-bot/README.md`).
- Reset before rendering: 「渲染器先清 animation 並將 armature pose matrix_basis 回到 identity，避免匯入後停在跳躍姿勢而誤判髮型錯位」 (CS `yui-hair-blender-r2.md`).
- Blender's glTF exporter in `export_animation_mode='ACTIONS'` exports every action in the file that fits an armature, not only the assigned one: with a source rig still loaded, the target's `clips.glb` received the source's raw action and the retargeted one came out as a two-key stub. Export the source first, delete the source rig and its actions, then export the target (I2B `retarget_clips.py`).
- Blender hair GLBs weigh 410k to 674k triangles (R2 C5: 450,716 triangles, 12.2 MB, 19 meshes) and have no LOD or strand physics; they are review assets, not game assets.

## 6. Export and round trips

- Babylon's exporter expands sparse morph targets: a full export reached 154.68 MiB against a 64 MiB upload cap (CS `accessory-motion-pages.md`); a tsubasa ARKit set went from about 12.97 MiB dense to 5.20 MiB; a yui expression set from 66 MiB dense to 52,714,280 bytes with lossless sparse encoding. A small sparse GLB does not guarantee small runtime arrays.
- Babylon's glTF serializer (8.56) omits any node translation whose magnitude is within `Epsilon` (0.001): a root moved by exactly the 1 mm clearance a model used came back ungrounded. Bake grounding offsets into child nodes whose positions are not near zero, and verify by reloading (I2B `viewer/scripts/export_glb.ts`).
- Reload ghosts: reusing a runtime left the previous neutral model in the scene, so a correct 17-target GLB showed double lips and patches; disposing the runtime and loading into a fresh scene fixed it (CS `face.md`).
- Expression blend rules are not in the GLB: 「GLB只攜帶原target，其他引擎需實作等效混合規則」.
- Compare decoded arrays, not accessor indices: 「accessor 編號可能因壓縮重排，應比解碼資料」 (CS `marry-production.md`). `validate_retarget.py` does exactly that.
- No Draco, Meshopt or KTX2: the target engines here load core glTF only, and the stdlib auditor cannot see inside compressed data.
- Publish under a new file name to defeat caches: 「發布資產改用 skin-r10-c4.glb 避免舊模型快取」.
- GLB has no physics, actuators or motion timelines; `export-glb` writes a static pose and says so.

## 7. Review habits

- Grey first, then textured; six views; both sides. Compare grey, lit and unlit from the same camera.
- Numbers first (`glb_audit.py`, then the site's checker), then eyes.
- 「Blender 渲染可用來診斷，但不代替 Babylon 材質與操作驗證」 (CS workflow §6). Final acceptance is in the target engine.
- Keep every candidate with its hash and parameters; never overwrite a trial.

## 8. Do not repeat (with provenance)

1. Direct or repeated voxel remesh on raw Trellis: R7 C1/C3.
2. Normal-direction scaling or over-smoothing of a face: R7 C5.
3. Global solidify/voxel on thin sheets: Marry gray-v2..v5, VR jeep.
4. Decimating rigged or morphed assets: web-game-asset-workflow, kimodo.
5. Old UV/textures after reduction: reduce_web_mesh report flags.
6. Bake margin 0: R9 C1.
7. Turnaround collage as cameras: workflow §1.
8. Projecting on scaled output: R8.
9. Double axis compensation: trellis2-input-contract.
10. Source rotation onto A-pose basis: kimodo.
11. Top-4 weights: kimodo.
12. Blender polygons reported as triangles: web-game-asset-workflow.
13. Blender render as acceptance: workflow §6, R10.
14. Stale custom_normal: R8.
15. Baking world transforms and un-parenting animated models: VR triage animated assets kept their hierarchy; flattening breaks skins and clips.
