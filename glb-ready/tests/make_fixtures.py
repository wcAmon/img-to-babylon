"""Generate test GLBs inside Blender. Usage (from tests): blender -b --factory-startup --python make_fixtures.py -- <outdir> <name>...
Fixtures are regenerated per test run; nothing binary is committed."""
import sys
from pathlib import Path
import bpy
import bmesh

OUT = Path(sys.argv[sys.argv.index('--') + 1])
NAMES = sys.argv[sys.argv.index('--') + 2:]
OUT.mkdir(parents=True, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def uv_sphere(segments, rings, name='sphere'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=0.5, location=(0, 0, 0.5))
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.015)
    bpy.ops.object.mode_set(mode='OBJECT')
    mat = bpy.data.materials.new('sphere-mat')
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.6, 0.3, 0.2, 1)
    obj.data.materials.append(mat)
    return obj


def export(obj_list, name, **kw):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obj_list:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obj_list[0]
    opts = dict(filepath=str(OUT / (name + '.glb')), export_format='GLB', use_selection=True, export_yup=True, export_normals=True)
    opts.update(kw)
    bpy.ops.export_scene.gltf(**opts)


def fixture_sphere_lo():
    reset(); export([uv_sphere(40, 20)], 'sphere_lo')


def fixture_sphere_hi():
    reset(); export([uv_sphere(120, 60)], 'sphere_hi')


def fixture_sphere_flipped():
    reset(); obj = uv_sphere(120, 60)
    bm = bmesh.new(); bm.from_mesh(obj.data); bmesh.ops.reverse_faces(bm, faces=list(bm.faces)); bm.to_mesh(obj.data); bm.free()
    export([obj], 'sphere_flipped')


def fixture_sphere_vcolor():
    reset(); obj = uv_sphere(40, 20)
    obj.data.materials.clear()
    for layer in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(layer)
    color = obj.data.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    for v in obj.data.vertices:
        color.data[v.index].color = (max(v.co.z, 0.0) * 2, 0.2, 1.0 - max(v.co.z, 0.0) * 2, 1.0)
    mat = bpy.data.materials.new('vc')
    attr = mat.node_tree.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
    mat.node_tree.links.new(attr.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    obj.data.materials.append(mat)
    export([obj], 'sphere_vcolor', export_vertex_color='MATERIAL')


def fixture_cube_tex1024():
    reset()
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.5)); obj = bpy.context.object; obj.name = 'cube'
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(); bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('checker', 1024, 1024); img.generated_type = 'COLOR_GRID'
    img.filepath_raw = str(OUT / 'checker.png'); img.file_format = 'PNG'; img.save(); img.pack()
    mat = bpy.data.materials.new('tex')
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
    mat.node_tree.links.new(tex.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    obj.data.materials.append(mat)
    export([obj], 'cube_tex1024')


def fixture_cube_two_materials():
    reset()
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.5)); obj = bpy.context.object; obj.name = 'cube2'
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project()
    bpy.ops.mesh.subdivide(number_cuts=20); bpy.ops.object.mode_set(mode='OBJECT')
    for i, colour in enumerate([(1, 0, 0, 1), (0, 0, 1, 1)]):
        m = bpy.data.materials.new('m%d' % i)
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = colour; obj.data.materials.append(m)
    for p in obj.data.polygons:
        p.material_index = 0 if p.center.z < 0.5 else 1
    export([obj], 'cube_two_materials')


def build_rig(prefix='mixamorig:', scale=1.0, texture=True):
    arm_data = bpy.data.armatures.new('Armature'); arm = bpy.data.objects.new('Armature', arm_data)
    bpy.context.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, head, tail, parent=None):
        b = arm_data.edit_bones.new(prefix + name); b.head = head; b.tail = tail
        if parent:
            b.parent = arm_data.edit_bones[prefix + parent]
    bone('Hips', (0, 0, 0.95), (0, 0, 1.1)); bone('Spine', (0, 0, 1.1), (0, 0, 1.3), 'Hips'); bone('Spine1', (0, 0, 1.3), (0, 0, 1.45), 'Spine')
    bone('Spine2', (0, 0, 1.45), (0, 0, 1.5), 'Spine1'); bone('Neck', (0, 0, 1.5), (0, 0, 1.58), 'Spine2'); bone('Head', (0, 0, 1.58), (0, 0, 1.75), 'Neck')
    for side, s in (('Left', 1), ('Right', -1)):
        bone(side + 'UpLeg', (0.1 * s, 0, 0.95), (0.1 * s, 0, 0.5), 'Hips'); bone(side + 'Leg', (0.1 * s, 0, 0.5), (0.1 * s, 0, 0.08), side + 'UpLeg')
        bone(side + 'Foot', (0.1 * s, 0, 0.08), (0.1 * s, -0.15, 0.02), side + 'Leg'); bone(side + 'ToeBase', (0.1 * s, -0.15, 0.02), (0.1 * s, -0.22, 0.0), side + 'Foot')
        bone(side + 'Shoulder', (0.05 * s, 0, 1.45), (0.15 * s, 0, 1.45), 'Spine2'); bone(side + 'Arm', (0.15 * s, 0, 1.45), (0.45 * s, 0, 1.45), side + 'Shoulder')
        bone(side + 'ForeArm', (0.45 * s, 0, 1.45), (0.72 * s, 0, 1.45), side + 'Arm'); bone(side + 'Hand', (0.72 * s, 0, 1.45), (0.82 * s, 0, 1.45), side + 'ForeArm')
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.14, depth=1.7, location=(0, 0, 0.85)); body = bpy.context.object; body.name = 'body'
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.subdivide(number_cuts=8)
    bpy.ops.uv.smart_project(); bpy.ops.object.mode_set(mode='OBJECT')
    if texture:
        img = bpy.data.images.new('skin', 128, 128); img.generated_type = 'COLOR_GRID'
        img.filepath_raw = str(OUT / 'skin.png'); img.file_format = 'PNG'; img.save(); img.pack()
        mat = bpy.data.materials.new('skin')
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
        mat.node_tree.links.new(tex.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color']); body.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    try:
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except RuntimeError:
        bpy.ops.object.parent_set(type='ARMATURE_ENVELOPE')
    # One vertex with five influences: the serialized skin then needs JOINTS_1/WEIGHTS_1, which only
    # export_all_influences=True keeps. Every glb-ready export of a rig must agree on this.
    five = list(body.vertex_groups)[:5]
    for g in five:
        g.add([0], 0.2, 'REPLACE')
    for g in list(body.vertex_groups)[5:]:
        g.remove([0])
    if scale != 1.0:
        for o in (arm, body):
            o.scale = (scale, scale, scale)
        bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); body.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return arm, body


def fixture_rig_base():
    reset(); arm, body = build_rig()
    export([arm, body], 'rig_base', export_animations=False, export_skins=True, export_all_influences=True)


def fixture_rig_source():
    reset(); arm, body = build_rig(scale=1.1)
    scene = bpy.context.scene; scene.render.fps = 30; scene.frame_start = 0; scene.frame_end = 30
    action = bpy.data.actions.new('wave-and-step'); arm.animation_data_create(); arm.animation_data.action = action
    import math
    from mathutils import Quaternion, Vector
    hips, spine, arm_l = arm.pose.bones['mixamorig:Hips'], arm.pose.bones['mixamorig:Spine'], arm.pose.bones['mixamorig:LeftArm']
    for pb in (hips, spine, arm_l):
        pb.rotation_mode = 'QUATERNION'
    for frame in range(0, 31):
        t = frame / 30.0
        spine.rotation_quaternion = Quaternion((1, 0, 0), math.radians(20 * t))
        arm_l.rotation_quaternion = Quaternion((0, 0, 1), math.radians(40 * t))
        hips.location = Vector((0, -0.3 * t, -0.05 * math.sin(math.pi * t)))  # forward (Blender -Y) and a dip
        for pb in (spine, arm_l):
            pb.keyframe_insert('rotation_quaternion', frame=frame)
        hips.keyframe_insert('location', frame=frame)
    export([arm, body], 'rig_source', export_animations=True, export_skins=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_all_influences=True)


FIXTURES = {k[len('fixture_'):]: v for k, v in dict(globals()).items() if k.startswith('fixture_')}
for name in NAMES:
    FIXTURES[name]()
    print('FIXTURE', name, OUT / (name + '.glb'), flush=True)
