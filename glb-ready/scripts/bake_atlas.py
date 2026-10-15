"""bake_atlas.py — new smart-UV atlas and a single baked baseColor texture for a static mesh.

blender -b --factory-startup --python-exit-code 1 --python glb-ready/scripts/bake_atlas.py -- \
    in.glb out.glb [--size 2048] [--source vertex-color|material|high=<other.glb>] [--margin 16, 4 for high=] \
    [--angle 66] [--island-margin 0.015] [--height <m>] [--ground] [--force]

Output: one mesh, one UV layer, one Principled material, one embedded PNG. Run after reduce_mesh.py.
--height scales uniformly to that height in metres; --ground centres XZ and puts the base on y=0.
Exit 0 ok, 2 usage/unsupported input.
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_common as bc  # noqa: E402

bc.guard_background()
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

SCRIPT = 'bake_atlas'
MAX_SIZE = 2048


def join_imported(path):
    objects = bc.import_glb(path)
    bc.select_only(objects)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.data = obj.data.copy()
    for attr in list(obj.data.attributes):
        if attr.name == 'custom_normal':
            obj.data.attributes.remove(attr)
    return obj


def smart_uv(obj, angle_deg, island_margin):
    for layer in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(layer)
    obj.data.uv_layers.new(name='UVMap')
    bc.select_only([obj])
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=angle_deg * 3.14159265 / 180.0, island_margin=island_margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def new_target_material(obj, image):
    mat = bpy.data.materials.new('glb_ready_baked')
    nodes = mat.node_tree.nodes; links = mat.node_tree.links
    bsdf = nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.85
    tex = nodes.new('ShaderNodeTexImage'); tex.image = image; nodes.active = tex
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def bake_setup(scene, samples, margin):
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = samples
    scene.render.bake.margin = margin; scene.render.bake.use_clear = True
    scene.render.bake.use_pass_direct = False; scene.render.bake.use_pass_indirect = False; scene.render.bake.use_pass_color = True


def main():
    args = bc.parse_args()
    if len(args) < 2:
        bc.fail(2, 'usage: in.glb out.glb [--size 2048] [--source vertex-color|material|high=<glb>] [--margin 16, 4 for high=] [--angle 66] [--island-margin 0.015] [--height m] [--ground] [--force]')
    src, dst = Path(args[0]).resolve(), Path(args[1]).resolve()
    size = bc.flag_value(args, '--size', 2048, int)
    if size < 16 or size > MAX_SIZE:
        bc.fail(2, '--size must be between 16 and %d (the nomen-land profile caps textures at 2048)' % MAX_SIZE)
    source = bc.flag_value(args, '--source', 'material')
    margin = bc.flag_value(args, '--margin', None, int)
    angle = bc.flag_value(args, '--angle', 66.0, float)
    island = bc.flag_value(args, '--island-margin', 0.015, float)
    height = bc.flag_value(args, '--height', None, float)
    ground = '--ground' in args
    high_path = None
    if source.startswith('high='):
        high_path = Path(source[5:]).resolve(); source = 'high'
        if not high_path.is_file():
            bc.fail(2, 'high-poly source not found: %s' % high_path)
    if source not in ('vertex-color', 'material', 'high'):
        bc.fail(2, '--source must be vertex-color, material or high=<glb>')
    if margin is None:  # Settled numbers: 16 px for a colour bake, 4 for a high-to-low bake
        margin = 4 if source == 'high' else 16
    bc.require_new_output(dst, '--force' in args)
    audit = bc.audit_module()
    try:
        doc, _ = audit.read_glb(src)
    except (OSError, audit.GlbError) as exc:
        bc.fail(2, 'cannot read %s: %s' % (src, exc))
    if doc.get('skins') or doc.get('animations'):
        bc.fail(2, 'input is rigged or animated; bake before rigging (SKILL.md: Order of operations)')
    bc.reset_scene(); scene = bpy.context.scene
    target = join_imported(src)
    color_attr = target.data.color_attributes.active_color or (target.data.color_attributes[0] if len(target.data.color_attributes) else None)
    if source == 'vertex-color' and color_attr is None:
        bc.fail(2, 'input has no COLOR_0 vertex colours; use --source material or high=')
    color_name = None
    if source == 'vertex-color':
        # Cycles 5.1 crashes (SIGSEGV in svm_node_vertex_color) when baking a BYTE_COLOR corner
        # attribute, which is what the glTF importer creates for COLOR_0. Float colours bake cleanly.
        bc.select_only([target])
        target.data.color_attributes.active_color = color_attr
        bpy.ops.geometry.color_attribute_convert(domain='CORNER', data_type='FLOAT_COLOR')
        color_name = target.data.color_attributes.active_color.name
    # Source copy for selected-to-active bakes keeps the original UVs and materials.
    source_obj = None
    if source == 'material':
        source_obj = target.copy(); source_obj.data = target.data.copy(); scene.collection.objects.link(source_obj); source_obj.name = 'glb_ready_source'
    elif source == 'high':
        bpy.ops.object.select_all(action='DESELECT')
        high_objs = bc.import_glb(high_path)
        bc.select_only(high_objs)
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if len(high_objs) > 1:
            bpy.ops.object.join()
        source_obj = bpy.context.object; source_obj.name = 'glb_ready_source'
    smart_uv(target, angle, island)
    image = bpy.data.images.new('glb_ready_basecolor', size, size, alpha=False)
    image.colorspace_settings.name = 'sRGB'
    if source == 'vertex-color':
        mat = bpy.data.materials.new('glb_ready_emit')
        nodes = mat.node_tree.nodes; links = mat.node_tree.links; nodes.clear()
        out_node = nodes.new('ShaderNodeOutputMaterial'); emit = nodes.new('ShaderNodeEmission')
        vc = nodes.new('ShaderNodeVertexColor'); vc.layer_name = color_name
        links.new(vc.outputs['Color'], emit.inputs['Color']); links.new(emit.outputs[0], out_node.inputs['Surface'])
        tex = nodes.new('ShaderNodeTexImage'); tex.image = image; nodes.active = tex
        target.data.materials.clear(); target.data.materials.append(mat)
        bake_setup(scene, 1, margin); scene.render.bake.use_selected_to_active = False
        bc.select_only([target]); bpy.ops.object.bake(type='EMIT')
        samples = 1
    else:
        target.data.materials.clear(); target.data.materials.append(new_target_material(target, image))
        for p in target.data.polygons:
            p.material_index = 0
        bake_setup(scene, 8, margin)
        scene.render.bake.use_selected_to_active = True
        scene.render.bake.cage_extrusion = 0.002 if source == 'material' else 0.03
        scene.render.bake.max_ray_distance = 0.01 if source == 'material' else 0.08
        bpy.ops.object.select_all(action='DESELECT'); source_obj.select_set(True); target.select_set(True)
        bpy.context.view_layer.objects.active = target
        bpy.ops.object.bake(type='DIFFUSE')
        samples = 8
    with tempfile.TemporaryDirectory() as tmp:
        image.filepath_raw = str(Path(tmp) / 'basecolor.png'); image.file_format = 'PNG'; image.save(); image.pack()
    if source == 'vertex-color':
        target.data.materials.clear(); target.data.materials.append(new_target_material(target, image))
    for col in list(target.data.color_attributes):
        target.data.color_attributes.remove(col)
    if source_obj is not None:
        bpy.data.objects.remove(source_obj, do_unlink=True)
    for p in target.data.polygons:
        p.use_smooth = True
    bc.select_only([target])
    if height is not None or ground:
        lo, hi = bc.world_bounds([target]); extent = hi - lo
        factor = (height / extent.z) if (height is not None and extent.z > 0) else 1.0
        target.scale = target.scale * factor
        bpy.context.view_layer.update(); lo, hi = bc.world_bounds([target])
        if ground:
            target.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bc.export_glb(dst, [target], export_materials='EXPORT', export_image_format='AUTO', export_skins=False, export_morph=False, export_animations=False)
    params = {'source': source, 'high': str(high_path) if high_path else None, 'size': size, 'margin': margin, 'angle': angle,
              'islandMargin': island, 'height': height, 'ground': ground, 'heightOut': bc.height_of([target]), 'bakeSamples': samples}
    bc.write_report(dst, SCRIPT, args, src, params, [])
    print('%s: %s -> one %dx%d PNG, height %.3f m' % (SCRIPT, source, size, size, params['heightOut']))


main()
