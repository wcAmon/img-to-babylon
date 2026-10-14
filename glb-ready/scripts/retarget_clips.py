"""retarget_clips.py — move Mixamo-named clips from a source FBX/GLB onto a Mixamo-named base GLB, skin untouched.

blender -b --factory-startup --python-exit-code 1 --python glb-ready/scripts/retarget_clips.py -- \
    base.glb source.fbx|source.glb outdir [--in-place] [--ground-clearance 0.002] [--fps 30]

Supported skeletons: Mixamo naming on both sides (mixamorig*:Hips ...). Anything else exits 2.
Method per bone: desired world rotation = source pose delta x rest-segment alignment x base bind; the pose quaternion is
solved relative to the base's local bind (never multiply the source onto an A-pose basis twice); quaternion signs stay
continuous; root translation scales by leg length; --in-place keeps the root horizontally fixed; --ground-clearance lifts
only the root so the mesh never dips under z=0 (not IK). Outputs bind.glb, clips.glb, source.glb, report.json.
Exit 0 ok, 1 FK error > 0.1 deg or skin changed, 2 usage/unsupported.
"""
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_common as bc  # noqa: E402

bc.guard_background()
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Quaternion, Vector  # noqa: E402

SCRIPT = 'retarget_clips'
MAX_FK_DEG = 0.1
SEGMENTS = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head',
            'LeftShoulder': 'LeftArm', 'LeftArm': 'LeftForeArm', 'LeftForeArm': 'LeftHand',
            'RightShoulder': 'RightArm', 'RightArm': 'RightForeArm', 'RightForeArm': 'RightHand',
            'LeftUpLeg': 'LeftLeg', 'LeftLeg': 'LeftFoot', 'LeftFoot': 'LeftToeBase',
            'RightUpLeg': 'RightLeg', 'RightLeg': 'RightFoot', 'RightFoot': 'RightToeBase'}
LEG = [('LeftUpLeg', 'LeftLeg'), ('LeftLeg', 'LeftFoot')]


def suffix(name):
    return name.split(':')[-1]


def skin_signature(meshes):
    h = hashlib.sha256()
    for o in meshes:
        h.update(o.name.encode())
        h.update(np.array([list(v.co) for v in o.data.vertices], dtype='<f4').tobytes())
        h.update(str([(g.name, g.index) for g in o.vertex_groups]).encode())
        h.update(str([[(g.group, round(g.weight, 6)) for g in v.groups] for v in o.data.vertices]).encode())
        h.update(str([tuple(p.vertices) for p in o.data.polygons]).encode())
        for uv in o.data.uv_layers:
            h.update(np.array([list(x.uv) for x in uv.data], dtype='<f4').tobytes())
    return h.hexdigest()


def import_rig(path, label):
    before = set(bpy.data.objects)
    ext = Path(path).suffix.lower()
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True)
    elif ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        bc.fail(2, '%s must be .fbx, .glb or .gltf' % label)
    shapes = bc.bone_shape_objects()
    new = [o for o in bpy.data.objects if o not in before and o not in shapes]
    arms = [o for o in new if o.type == 'ARMATURE']
    if len(arms) != 1:
        bc.fail(2, '%s must contain exactly one armature (found %d)' % (label, len(arms)))
    arm = arms[0]
    bones = {suffix(b.name): b for b in arm.data.bones}
    if len(bones) != len(arm.data.bones):
        bc.fail(2, '%s has ambiguous bone names after the prefix' % label)
    if 'Hips' not in bones or not any(b.name.startswith('mixamorig') for b in arm.data.bones):
        bc.fail(2, '%s is not a Mixamo-named skeleton (needs mixamorig*:Hips); other rigs are out of scope, see SKILL.md' % label)
    meshes = [o for o in new if o.type == 'MESH']
    bpy.context.view_layer.update()
    return arm, bones, meshes


def world_rot(arm, bone_name, posed):
    """World rotation of a bone: posed (pose.bones[].matrix) or rest (data.bones[].matrix_local)."""
    m = arm.pose.bones[bone_name].matrix if posed else arm.data.bones[bone_name].matrix_local
    return (arm.matrix_world @ m).to_quaternion().normalized()


def world_head(arm, bone_name, posed):
    b = arm.pose.bones[bone_name] if posed else arm.data.bones[bone_name]
    return arm.matrix_world @ (b.head if posed else b.head_local)


def main():
    args = bc.parse_args()
    if len(args) < 3:
        bc.fail(2, 'usage: base.glb source.fbx|glb outdir [--in-place] [--ground-clearance 0.002] [--fps 30]')
    base_path, source_path, outdir = Path(args[0]).resolve(), Path(args[1]).resolve(), Path(args[2]).resolve()
    in_place = '--in-place' in args
    clearance = bc.flag_value(args, '--ground-clearance', 0.002, float)
    fps = bc.flag_value(args, '--fps', 30, int)
    if outdir.exists():
        bc.fail(2, '%s exists; use a new output directory per run' % outdir)
    for p in (base_path, source_path):
        if not p.is_file():
            bc.fail(2, 'missing input %s' % p)
    bc.reset_scene(); scene = bpy.context.scene; scene.render.fps = fps
    arm, bones, meshes = import_rig(base_path, 'base')
    if not meshes or any(not any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers) for o in meshes):
        bc.fail(2, 'base must have skinned meshes bound to its armature')
    sig_before = skin_signature(meshes)
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.matrix_basis.identity(); pb.rotation_mode = 'QUATERNION'
    scene.frame_set(0); bpy.context.view_layer.update()
    outdir.mkdir(parents=True)
    bc.export_glb(outdir / 'bind.glb', [arm] + meshes, export_animations=False, export_skins=True, export_all_influences=True, export_apply=False)
    src_arm, src_bones, src_meshes = import_rig(source_path, 'source')
    for o in src_meshes:
        o.hide_render = True
    actions = []
    if src_arm.animation_data:
        if src_arm.animation_data.action:
            actions.append(src_arm.animation_data.action)
        for track in src_arm.animation_data.nla_tracks:
            for strip in track.strips:
                if strip.action and strip.action not in actions:
                    actions.append(strip.action)
    if not actions:
        bc.fail(2, 'source has no animation on its armature')
    # Export the source now, while its actions are the only ones in the file: the glTF exporter's ACTIONS mode
    # exports every compatible action in bpy.data onto an armature, so retargeted actions must not exist yet.
    src_arm.animation_data.action = actions[0]
    bc.export_glb(outdir / 'source.glb', [src_arm] + src_meshes, export_animations=True, export_skins=True, export_animation_mode='ACTIONS',
                  export_force_sampling=True, export_apply=False, export_materials='NONE')
    # Rest alignment per mapped bone: rotate the base rest segment onto the source rest segment (world frame).
    mapped = [n for n in bones if n in src_bones]
    correction = {}
    for name in mapped:
        child = SEGMENTS.get(name)
        if child and child in bones and child in src_bones:
            tgt = world_head(arm, bones[child].name, False) - world_head(arm, bones[name].name, False)
            src = world_head(src_arm, src_bones[child].name, False) - world_head(src_arm, src_bones[name].name, False)
            correction[name] = tgt.normalized().rotation_difference(src.normalized()) if min(tgt.length, src.length) > 1e-8 else Quaternion()
        else:
            correction[name] = Quaternion()
    bind = {b.name: world_rot(arm, b.name, False) for b in arm.data.bones}
    src_bind = {b.name: world_rot(src_arm, b.name, False) for b in src_arm.data.bones}
    def leg_len(a, bn):
        return sum((world_head(a, bn[y].name, False) - world_head(a, bn[x].name, False)).length for x, y in LEG if x in bn and y in bn)
    leg_scale = leg_len(arm, bones) / leg_len(src_arm, src_bones) if leg_len(src_arm, src_bones) > 1e-8 else 1.0
    hips = bones['Hips'].name; src_hips = src_bones['Hips'].name
    root_rest = world_head(arm, hips, False); src_root_rest = world_head(src_arm, src_hips, False)
    arm_inv = arm.matrix_world.inverted()
    order = []
    def walk(b):
        order.append(b); [walk(c) for c in b.children]
    for b in arm.data.bones:
        if b.parent is None:
            walk(b)
    report_clips, new_actions = [], []
    for action in actions:
        src_arm.animation_data.action = action
        f0, f1 = int(round(action.frame_range[0])), int(round(action.frame_range[1]))
        arm.animation_data_clear()
        for pb in arm.pose.bones:
            pb.matrix_basis.identity()
        new_action = bpy.data.actions.new('glb_ready__' + action.name); new_action.use_fake_user = True
        new_actions.append((new_action, action.name))
        arm.animation_data_create(); arm.animation_data.action = new_action
        previous, worst, lifts = {}, 0.0, []
        src_root0 = None
        for frame in range(f0, f1 + 1):
            scene.frame_set(frame); bpy.context.view_layer.update()
            desired = {}
            for b in order:
                name = suffix(b.name); parent = b.parent
                parent_bind = bind[parent.name] if parent else Quaternion()
                parent_pose = desired[parent.name] if parent else Quaternion()
                if name in correction:
                    delta = world_rot(src_arm, src_bones[name].name, True) @ src_bind[src_bones[name].name].inverted()
                    desired[b.name] = (delta @ correction[name] @ bind[b.name]).normalized()
                else:
                    desired[b.name] = (parent_pose @ parent_bind.inverted() @ bind[b.name]).normalized()
                local_bind = parent_bind.inverted() @ bind[b.name]
                rotation = (local_bind.inverted() @ parent_pose.inverted() @ desired[b.name]).normalized()
                if b.name in previous and rotation.dot(previous[b.name]) < 0:
                    rotation.negate()
                previous[b.name] = rotation.copy()
                pb = arm.pose.bones[b.name]; pb.rotation_quaternion = rotation
                if name == 'Hips':
                    src_pos = world_head(src_arm, src_hips, True)
                    if src_root0 is None:
                        src_root0 = src_pos.copy()
                    offset = (src_pos - src_root_rest) * leg_scale
                    if in_place:
                        offset.x = 0.0; offset.y = 0.0
                    else:
                        offset.x -= (src_root0.x - src_root_rest.x) * leg_scale; offset.y -= (src_root0.y - src_root_rest.y) * leg_scale
                    target_world = root_rest + offset
                    local = arm_inv @ target_world - arm_inv @ root_rest
                    pb.location = bind[b.name].inverted() @ (arm.matrix_world.to_quaternion() @ local)
                    pb.keyframe_insert('location', frame=frame)
                pb.keyframe_insert('rotation_quaternion', frame=frame)
            bpy.context.view_layer.update()
            for name, child in SEGMENTS.items():
                if name in correction and child in bones and child in src_bones:
                    actual = world_head(arm, bones[child].name, True) - world_head(arm, bones[name].name, True)
                    expected = world_head(src_arm, src_bones[child].name, True) - world_head(src_arm, src_bones[name].name, True)
                    if actual.length > 1e-8 and expected.length > 1e-8:
                        worst = max(worst, np.degrees(actual.angle(expected)))
            if clearance is not None and clearance >= 0:
                deps = bpy.context.evaluated_depsgraph_get(); lowest = float('inf')
                for o in meshes:
                    ev = o.evaluated_get(deps); geo = ev.to_mesh()
                    lowest = min(lowest, min((ev.matrix_world @ v.co).z for v in geo.vertices)); ev.to_mesh_clear()
                lift = max(0.0, clearance - lowest); lifts.append(lift)
                if lift:
                    pb = arm.pose.bones[hips]
                    pb.location += bind[hips].inverted() @ (arm.matrix_world.to_quaternion() @ (arm_inv.to_3x3() @ Vector((0, 0, lift))))
                    pb.keyframe_insert('location', frame=frame)
        report_clips.append({'name': action.name, 'frames': f1 - f0 + 1, 'fps': fps, 'maxFkDegrees': float(worst), 'rootLiftMax': max(lifts, default=0.0)})
        scene.frame_start, scene.frame_end = f0, f1
    scene.frame_set(f0)
    # Remove the source rig and its actions so clips.glb carries exactly the retargeted actions under the source clip names.
    for o in src_meshes + [src_arm]:
        bpy.data.objects.remove(o, do_unlink=True)
    for action in actions:
        bpy.data.actions.remove(action)
    for new_action, name in new_actions:
        new_action.name = name
    arm.animation_data.action = new_actions[0][0]
    bc.export_glb(outdir / 'clips.glb', [arm] + meshes, export_animations=True, export_skins=True, export_animation_mode='ACTIONS',
                  export_force_sampling=True, export_all_influences=True, export_apply=False)
    sig_after = skin_signature(meshes)
    report = {'script': SCRIPT, 'version': bc.VERSION, 'blender': bpy.app.version_string, 'args': args,
              'base': {'path': str(base_path), 'sha256': bc.sha256(base_path)}, 'source': {'path': str(source_path), 'sha256': bc.sha256(source_path)},
              'clips': report_clips, 'skinSignatureBefore': sig_before, 'skinSignatureAfter': sig_after, 'legScale': leg_scale,
              'inPlace': in_place, 'groundClearance': clearance, 'outputs': ['bind.glb', 'clips.glb', 'source.glb']}
    (outdir / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    if sig_before != sig_after:
        bc.fail(1, 'skin signature changed during retarget; output is not trustworthy')
    bad = [c for c in report_clips if c['maxFkDegrees'] > MAX_FK_DEG]
    if bad:
        bc.fail(1, 'FK error above %.2f deg in %s; check bone naming and that both rigs are T-pose or A-pose consistently' % (MAX_FK_DEG, ', '.join('%s (%.3f)' % (c['name'], c['maxFkDegrees']) for c in bad)))
    print('%s: %d clips onto %s, worst FK %.4f deg, leg scale %.3f' % (SCRIPT, len(report_clips), base_path.name, max(c['maxFkDegrees'] for c in report_clips), leg_scale))


main()
