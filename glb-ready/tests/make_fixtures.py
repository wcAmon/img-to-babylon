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
    mat = bpy.data.materials.new('sphere-mat'); mat.use_nodes = True
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
    mat = bpy.data.materials.new('vc'); mat.use_nodes = True
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
    mat = bpy.data.materials.new('tex'); mat.use_nodes = True
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
        m = bpy.data.materials.new('m%d' % i); m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = colour; obj.data.materials.append(m)
    for p in obj.data.polygons:
        p.material_index = 0 if p.center.z < 0.5 else 1
    export([obj], 'cube_two_materials')


FIXTURES = {k[len('fixture_'):]: v for k, v in dict(globals()).items() if k.startswith('fixture_')}
for name in NAMES:
    FIXTURES[name]()
    print('FIXTURE', name, OUT / (name + '.glb'), flush=True)
