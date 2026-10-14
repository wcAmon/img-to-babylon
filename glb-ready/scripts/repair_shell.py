"""repair_shell.py — make a generated (Trellis/Tripo/Rodin/Hunyuan) mesh a single, outward-facing, closed shell.

blender -b --factory-startup --python-exit-code 1 --python glb-ready/scripts/repair_shell.py -- \
    in.glb out.glb (--orientation-only | --shell-repair) [--voxel-k 0.0025] [--shell-k 0.006] [--smooth 0.25x2] [--force]

Output is still high-poly: follow with reduce_mesh.py. Scale and placement are not changed.
--orientation-only still applies a light smooth (geometry changes slightly); the report says so.
Exit 0 ok, 2 usage/unsupported input.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_common as bc  # noqa: E402

bc.guard_background()
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils.kdtree import KDTree  # noqa: E402

SCRIPT = 'repair_shell'


def parse_smooth(text):
    try:
        factor, iterations = text.lower().split('x')
        return float(factor), int(iterations)
    except ValueError:
        bc.fail(2, '--smooth expects factor x iterations, e.g. 0.25x2')


def edge_stats(mesh):
    bm = bmesh.new(); bm.from_mesh(mesh)
    boundary = sum(1 for e in bm.edges if e.is_boundary)
    nonmanifold = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    return boundary, nonmanifold


def capture_colors(mesh):
    col = mesh.color_attributes.active_color or (mesh.color_attributes[0] if len(mesh.color_attributes) else None)
    if not col:
        return None, None
    tree = KDTree(len(mesh.vertices))
    for v in mesh.vertices:
        tree.insert(v.co, v.index)
    tree.balance()
    colors = [(0.5, 0.5, 0.5, 1.0)] * len(mesh.vertices)
    if col.domain == 'POINT':
        colors = [tuple(d.color) for d in col.data]
    else:
        for loop in mesh.loops:
            colors[loop.vertex_index] = tuple(col.data[loop.index].color)
    return tree, colors


def main():
    args = bc.parse_args()
    if len(args) < 2:
        bc.fail(2, 'usage: in.glb out.glb (--orientation-only | --shell-repair) [--voxel-k k] [--shell-k k] [--smooth fxn] [--force]')
    src, dst = Path(args[0]).resolve(), Path(args[1]).resolve()
    shell = '--shell-repair' in args; orient = '--orientation-only' in args
    if shell == orient:
        bc.fail(2, 'pass exactly one of --orientation-only or --shell-repair')
    voxel_k = bc.flag_value(args, '--voxel-k', 0.0025, float)
    shell_k = bc.flag_value(args, '--shell-k', 0.006, float)
    factor, iterations = parse_smooth(bc.flag_value(args, '--smooth', '0.25x2'))
    bc.require_new_output(dst, '--force' in args)
    audit = bc.audit_module()
    try:
        doc, _ = audit.read_glb(src)
    except (OSError, audit.GlbError) as exc:
        bc.fail(2, 'cannot read %s: %s' % (src, exc))
    if doc.get('skins') or doc.get('animations'):
        bc.fail(2, 'input is rigged or animated; repair_shell works on raw static meshes only')
    bc.reset_scene()
    objects = bc.import_glb(src)
    bc.select_only(objects)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object; mesh = obj.data
    height_in = bc.height_of([obj])
    tree, colors = capture_colors(mesh)
    for attr in list(mesh.attributes):
        if attr.name == 'custom_normal':
            mesh.attributes.remove(attr)
    # glTF stores split vertices wherever normals or UVs differ, so an imported mesh is often a
    # polygon soup (one component per face). Weld co-located vertices first; otherwise every edge is a
    # boundary and "largest component" keeps a single face.
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(mesh); bm.free(); mesh.update()
    boundary_in, nonmanifold_in = edge_stats(mesh)
    bm = bmesh.new(); bm.from_mesh(mesh)
    flipped = bm.calc_volume(signed=True) < 0  # measured on the input winding, before any repair
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    # keep the largest connected component
    remaining, groups = set(bm.verts), []
    while remaining:
        seed = remaining.pop(); group, stack = {seed}, [seed]
        while stack:
            v = stack.pop()
            for e in v.link_edges:
                n = e.other_vert(v)
                if n in remaining:
                    remaining.remove(n); group.add(n); stack.append(n)
        groups.append(group)
    keep = max(groups, key=len)
    bmesh.ops.delete(bm, geom=[v for g in groups if g is not keep for v in g], context='VERTS')
    bm.to_mesh(mesh); bm.free(); mesh.update()
    removed = len(groups) - 1
    shell_thickness = voxel_size = None
    if shell:
        shell_thickness = height_in * shell_k
        solid = obj.modifiers.new('glb_ready_shell', 'SOLIDIFY'); solid.thickness = shell_thickness; solid.offset = 0
        bpy.ops.object.modifier_apply(modifier=solid.name)
        voxel_size = height_in * voxel_k
        obj.data.remesh_voxel_size = voxel_size; obj.data.use_remesh_preserve_volume = True
        bpy.ops.object.voxel_remesh()
        bm = bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        if bm.calc_volume(signed=True) < 0:
            bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data); bm.free()
    smooth = obj.modifiers.new('glb_ready_smooth', 'SMOOTH'); smooth.factor = factor; smooth.iterations = iterations
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    mesh = obj.data
    for p in mesh.polygons:
        p.use_smooth = True
    resampled = False
    if tree is not None:
        for col in list(mesh.color_attributes):
            mesh.color_attributes.remove(col)
        color = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
        for v in mesh.vertices:
            _, i, _ = tree.find(v.co); color.data[v.index].color = colors[i]
        mesh.color_attributes.active_color = color
        mat = bpy.data.materials.new('glb_ready_vertex_color')
        node = mat.node_tree.nodes.new('ShaderNodeVertexColor'); node.layer_name = 'Col'
        mat.node_tree.links.new(node.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
        mesh.materials.clear(); mesh.materials.append(mat); resampled = True
    boundary_out, nonmanifold_out = edge_stats(mesh)
    bc.export_glb(dst, [obj], export_materials='EXPORT', export_vertex_color='MATERIAL' if resampled else 'NONE',
                  export_skins=False, export_morph=False, export_animations=False)
    warnings = []
    if orient:
        warnings.append('geometry changed slightly: --orientation-only still smooths %sx%d' % (factor, iterations))
    params = {'mode': 'shell-repair' if shell else 'orientation-only', 'heightIn': height_in, 'heightOut': bc.height_of([obj]),
              'shellThickness': shell_thickness, 'voxelSize': voxel_size, 'smooth': {'factor': factor, 'iterations': iterations},
              'boundaryEdgesIn': boundary_in, 'boundaryEdgesOut': boundary_out, 'nonManifoldEdgesIn': nonmanifold_in,
              'nonManifoldEdgesOut': nonmanifold_out, 'componentsRemoved': removed, 'signedVolumeFlipped': flipped,
              'vertexColorsResampled': resampled}
    bc.write_report(dst, SCRIPT, args, src, params, warnings)
    print('%s: %s, boundary edges %d -> %d, non-manifold %d -> %d, components removed %d' % (
        SCRIPT, params['mode'], boundary_in, boundary_out, nonmanifold_in, nonmanifold_out, removed))


main()
