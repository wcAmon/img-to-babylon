"""render_review.py — diagnostic orthographic renders of a GLB in rest pose. Not an acceptance test:
final review happens in the target engine (Babylon).

blender -b --factory-startup --python-exit-code 1 --python glb-ready/scripts/render_review.py -- \
    in.glb outdir [--views front,back,left,right,three-quarter,top] [--gray] [--unlit] [--size 1024]

outdir must not exist. Writes <view>.png, cameras.json, manifest.json. Exit 0 ok, 2 usage.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_common as bc  # noqa: E402

bc.guard_background()
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

SCRIPT = 'render_review'
# glTF front is +Z, which Blender imports as -Y: the front camera sits on -Y looking at +Y.
VIEWS = {'front': (0, -1, 0), 'back': (0, 1, 0), 'left': (-1, 0, 0), 'right': (1, 0, 0),
         'three-quarter': (0.7, -0.7, 0.35), 'top': (0, 0, 1)}


def reset_pose():
    armatures = 0
    for o in bpy.data.objects:
        o.animation_data_clear()
        if o.type == 'ARMATURE':
            armatures += 1
            for pb in o.pose.bones:
                pb.matrix_basis.identity()
        if o.type == 'MESH' and o.data.shape_keys:
            o.data.shape_keys.animation_data_clear()
            for key in o.data.shape_keys.key_blocks:
                key.value = 0.0
    bpy.context.view_layer.update()
    return armatures


def make_unlit(mat):
    tree = mat.node_tree; nodes = tree.nodes; links = tree.links
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    output = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None) or nodes.new('ShaderNodeOutputMaterial')
    emit = nodes.new('ShaderNodeEmission')
    if bsdf is not None and bsdf.inputs['Base Color'].is_linked:
        links.new(bsdf.inputs['Base Color'].links[0].from_socket, emit.inputs['Color'])
    elif bsdf is not None:
        emit.inputs['Color'].default_value = bsdf.inputs['Base Color'].default_value
    links.new(emit.outputs[0], output.inputs['Surface'])


def main():
    args = bc.parse_args()
    if len(args) < 2:
        bc.fail(2, 'usage: in.glb outdir [--views a,b,c] [--gray] [--unlit] [--size 1024]')
    src, outdir = Path(args[0]).resolve(), Path(args[1]).resolve()
    if outdir.exists():
        bc.fail(2, '%s exists; render into a new directory per candidate' % outdir)
    views = bc.flag_value(args, '--views', ','.join(VIEWS)).split(',')
    unknown = [v for v in views if v not in VIEWS]
    if unknown:
        bc.fail(2, 'unknown views %s; choose from %s' % (unknown, ', '.join(VIEWS)))
    size = bc.flag_value(args, '--size', 1024, int)
    gray, unlit = '--gray' in args, '--unlit' in args
    audit = bc.audit_module()
    try:
        audit.read_glb(src)
    except (OSError, audit.GlbError) as exc:
        bc.fail(2, 'cannot read %s: %s' % (src, exc))
    bc.reset_scene(); scene = bpy.context.scene
    bc.import_glb(src)
    armatures = reset_pose()
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.hide_render]
    if gray:
        clay = bpy.data.materials.new('glb_ready_clay')
        clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.48, 0.48, 0.48, 1)
        for o in meshes:
            o.data.materials.clear(); o.data.materials.append(clay)
    elif unlit:
        for mat in {m for o in meshes for m in o.data.materials if m is not None and m.node_tree is not None}:
            make_unlit(mat)
    lo, hi = bc.world_bounds(meshes); center = (lo + hi) / 2; extent = hi - lo
    ortho = max(extent.z, extent.x, extent.y) * 1.15 or 1.0
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 16; scene.cycles.seed = 0
    scene.render.resolution_x = scene.render.resolution_y = size; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('glb_ready_world')
    if scene.world.node_tree is None:
        scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.75, 0.75, 0.75, 1); bg.inputs[1].default_value = 0.7
    scene.view_settings.view_transform = 'Standard'
    cam_data = bpy.data.cameras.new('glb_ready_cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = ortho
    cam = bpy.data.objects.new('glb_ready_cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
    lamps = []
    for name, offset in (('key', Vector((-0.4, -0.2, 1.0))), ('fill', Vector((0.8, 0.3, 0.4)))):
        light = bpy.data.lights.new(name, 'AREA'); light.shape = 'DISK'; light.size = ortho * 3
        light.energy = (110 if name == 'key' else 40) * ortho * ortho
        lamp = bpy.data.objects.new(name, light); scene.collection.objects.link(lamp); lamps.append((lamp, offset))
    outdir.mkdir(parents=True)
    cameras, images = [], []
    for name in views:
        direction = Vector(VIEWS[name]).normalized()
        cam.location = center + direction * ortho * 3
        cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
        for lamp, offset in lamps:
            lamp.location = cam.location + offset * ortho
            lamp.rotation_euler = (center - lamp.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.view_layer.update()
        path = outdir / (name + '.png'); scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        cameras.append({'name': name, 'location': list(cam.location), 'rotationEuler': list(cam.rotation_euler),
                        'matrixWorld': [list(r) for r in cam.matrix_world]})
        images.append({'view': name, 'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    (outdir / 'cameras.json').write_text(json.dumps({'orthoScale': ortho, 'resolution': [size, size], 'views': cameras}, indent=2) + '\n')
    (outdir / 'manifest.json').write_text(json.dumps({'script': SCRIPT, 'version': bc.VERSION, 'input': {'path': str(src), 'sha256': bc.sha256(src)},
                                                       'images': images, 'pose': 'rest', 'armaturesReset': armatures, 'gray': gray, 'unlit': unlit,
                                                       'bounds': {'min': list(lo), 'max': list(hi)},
                                                       'note': 'diagnostic renders only; accept in the target engine'}, indent=2) + '\n')
    print('%s: %d views into %s (ortho %.3f m)' % (SCRIPT, len(views), outdir, ortho))


main()
