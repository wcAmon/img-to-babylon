"""reduce_mesh.py — collapse a static mesh to a triangle target, measured on the serialized GLB.

blender -b --factory-startup --python-exit-code 1 --python glb-ready/scripts/reduce_mesh.py -- \
    in.glb out.glb --target 20000 [--keep-uv | --rebuild-surface] \
    [--protect x0,y0,z0,x1,y1,z1 --max-protected-error 0.001] [--min-part-faces 12] [--force]

--keep-uv (default): decimate in place, keep materials, UVs and textures. For props that keep >= 30%.
--rebuild-surface: join, weld, drop custom normals and islands, output a grey mesh with no UV; follow with bake_atlas.py.
Rigged, morphed or animated inputs are refused: reduce the unrigged mesh instead (SKILL.md, Which path).
Exit 0 ok, 1 target or protected error not met, 2 usage/unsupported input.
"""
import math
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_common as bc  # noqa: E402

bc.guard_background()
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

SCRIPT = 'reduce_mesh'
PROTECT_GROUP = 'glb_ready_protected'


def parse():
    args = bc.parse_args()
    if len(args) < 2:
        bc.fail(2, 'usage: in.glb out.glb --target N [--keep-uv|--rebuild-surface] [--protect x0,y0,z0,x1,y1,z1] [--max-protected-error m] [--min-part-faces n] [--force]')
    src, dst = Path(args[0]).resolve(), Path(args[1]).resolve()
    target = bc.flag_value(args, '--target', None, int)
    if target is None or target < 4:
        bc.fail(2, '--target must be an integer >= 4')
    if '--keep-uv' in args and '--rebuild-surface' in args:
        bc.fail(2, 'choose one of --keep-uv and --rebuild-surface')
    mode = 'rebuild-surface' if '--rebuild-surface' in args else 'keep-uv'
    protect = bc.flag_value(args, '--protect', None)
    box = None
    if protect:
        try:
            vals = [float(v) for v in protect.split(',')]
        except ValueError:
            vals = []
        if len(vals) != 6 or any(not math.isfinite(v) for v in vals) or any(vals[i] > vals[i + 3] for i in range(3)):
            bc.fail(2, '--protect needs x0,y0,z0,x1,y1,z1 in glTF metres with min <= max')
        box = (vals[:3], vals[3:])
    return dict(src=src, dst=dst, target=target, mode=mode, box=box,
                max_error=bc.flag_value(args, '--max-protected-error', 0.001, float),
                min_part_faces=bc.flag_value(args, '--min-part-faces', 12, int),
                force='--force' in args, args=args)


def refuse_rigged(doc):
    reasons = []
    if doc.get('skins'): reasons.append('skins')
    if doc.get('animations'): reasons.append('animations')
    for mesh in doc.get('meshes', []):
        for prim in mesh.get('primitives', []):
            if prim.get('targets'): reasons.append('morph targets')
            if any(k.startswith(('JOINTS_', 'WEIGHTS_')) for k in prim.get('attributes', {})): reasons.append('skin weights')
    if reasons:
        bc.fail(2, 'input is rigged (%s); never decimate rigged or morphed assets, go back to the unrigged mesh (SKILL.md: Which path)' % ', '.join(sorted(set(reasons))))


def gltf_point(p):
    """Blender world (x, y, z) -> glTF (x, z, -y)."""
    return Vector((p.x, p.z, -p.y))


def world_surface(objects):
    verts, tris = [], []
    for o in objects:
        mesh = o.data; mesh.calc_loop_triangles(); start = len(verts)
        verts.extend(gltf_point(o.matrix_world @ v.co) for v in mesh.vertices)
        tris.extend(tuple(start + i for i in t.vertices) for t in mesh.loop_triangles)
    return verts, tris


def clipped_polygon(points, low, high):
    for axis in range(3):
        for threshold, sign in ((low[axis], 1), (high[axis], -1)):
            if not points:
                return []
            result, previous = [], points[-1]
            pd = sign * (previous[axis] - threshold)
            for current in points:
                cd = sign * (current[axis] - threshold)
                if (pd >= 0) != (cd >= 0):
                    result.append(previous.lerp(current, pd / (pd - cd)))
                if cd >= 0:
                    result.append(current)
                previous, pd = current, cd
            points = result
    return points


def protected_error(before, after, low, high):
    def direction(source, destination):
        bvh = BVHTree.FromPolygons(*destination, all_triangles=True)
        maximum, count, area_sum = 0.0, 0, 0.0
        for tri in source[1]:
            points = clipped_polygon([source[0][i] for i in tri], low, high)
            if len(points) < 3:
                continue
            for i in range(1, len(points) - 1):
                a, b, c = points[0], points[i], points[i + 1]
                area = (b - a).cross(c - a).length * 0.5
                if area <= 0:
                    continue
                area_sum += area
                samples = [a * (1 - u / 4 - v / 4) + b * (u / 4) + c * (v / 4) for u in range(5) for v in range(5 - u)]
                for p in samples:
                    hit = bvh.find_nearest(p)
                    if hit is None or hit[3] is None:
                        raise ValueError('could not measure protected surface')
                    maximum = max(maximum, hit[3]); count += 1
        return maximum, count, area_sum
    fwd = direction(before, after)
    if fwd[1] == 0 or fwd[2] <= 0:
        bc.fail(2, 'protect box touches no triangle area (only edges or nothing); enlarge the box')
    rev = direction(after, before)
    return {'maxDistance': max(fwd[0], rev[0]), 'samples': fwd[1] + rev[1], 'protectedArea': fwd[2], 'method': 'sampled bidirectional BVH nearest'}


def drop_custom_normals(mesh):
    for attr in list(mesh.attributes):
        if attr.name == 'custom_normal':
            mesh.attributes.remove(attr)


def remove_small_islands(obj, min_faces):
    bm = bmesh.new(); bm.from_mesh(obj.data); seen, discard = set(), []
    for vert in bm.verts:
        if vert in seen:
            continue
        stack, part = [vert], []; seen.add(vert)
        while stack:
            v = stack.pop(); part.append(v)
            for e in v.link_edges:
                other = e.other_vert(v)
                if other not in seen:
                    seen.add(other); stack.append(other)
        if len({f for v in part for f in v.link_faces}) < min_faces:
            discard.extend(part)
    bmesh.ops.delete(bm, geom=discard, context='VERTS'); bm.to_mesh(obj.data); bm.free(); obj.data.update()
    return len(discard)


def main():
    opts = parse()
    audit = bc.audit_module()
    try:
        doc, _ = audit.read_glb(opts['src'])
    except (OSError, audit.GlbError) as exc:
        bc.fail(2, 'cannot read %s: %s' % (opts['src'], exc))
    refuse_rigged(doc)
    bc.require_new_output(opts['dst'], opts['force'])
    before_tris = audit.scene_triangles(doc)
    warnings = []
    bc.reset_scene()
    objects = bc.import_glb(opts['src'])
    before_surface = world_surface(objects)
    if opts['mode'] == 'rebuild-surface':
        bc.select_only(objects)
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if len(objects) > 1:
            bpy.ops.object.join()
        obj = bpy.context.object; objects = [obj]
        obj.data = obj.data.copy()
        drop_custom_normals(obj.data)
        for layer in list(obj.data.uv_layers): obj.data.uv_layers.remove(layer)
        for col in list(obj.data.color_attributes): obj.data.color_attributes.remove(col)
        obj.data.materials.clear()
        grey = bpy.data.materials.new('glb_ready_grey'); grey.diffuse_color = (0.55, 0.55, 0.55, 1); obj.data.materials.append(grey)
        bm = bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6); bm.to_mesh(obj.data); bm.free()
        removed = remove_small_islands(obj, opts['min_part_faces'])
        if removed:
            warnings.append('removed %d vertices in islands smaller than %d faces' % (removed, opts['min_part_faces']))
    else:
        with_custom = [o.name for o in objects if any(a.name == 'custom_normal' for a in o.data.attributes)]
        if with_custom:
            shown = ', '.join(with_custom[:5]) + (' and %d more' % (len(with_custom) - 5) if len(with_custom) > 5 else '')
            warnings.append('%d of %d objects have custom normals (%s); if shading shows dark patches rerun with --rebuild-surface' % (len(with_custom), len(objects), shown))
    # Protect weights live in the mesh datablock (dvert layer), so assign them BEFORE the originals are
    # copied: every per-round restore then carries the weights; the group name stays on the object.
    if opts['box']:
        low, high = opts['box']; protected = 0
        for o in objects:
            if PROTECT_GROUP in o.vertex_groups:
                continue
            group = o.vertex_groups.new(name=PROTECT_GROUP)
            inside = set()
            for v in o.data.vertices:
                g = gltf_point(o.matrix_world @ v.co)
                if all(low[i] <= g[i] <= high[i] for i in range(3)):
                    inside.add(v.index)
            protected += len(inside)
            # One-ring dilation: the triangles that straddle the box boundary then have every vertex
            # fixed, so the chords created by collapsing the outside land outside the measured box.
            ring = set()
            for e in o.data.edges:
                a, b = e.vertices
                if (a in inside) != (b in inside):
                    ring.add(b if a in inside else a)
            group.add(sorted(inside | ring), 1.0, 'REPLACE')
        if protected == 0:
            bc.fail(2, 'protect box contains no vertices (touches nothing or only edges); enlarge the box')
    # Unique mesh datablocks: instances share one decimation.
    unique = {}
    for o in objects:
        unique.setdefault(o.data.name, o.data)
    originals = {name: mesh.copy() for name, mesh in unique.items()}
    for name, mesh in unique.items():
        mesh['glb_ready_origin'] = name  # custom props survive .copy(), so every round finds its original
    if before_tris <= opts['target']:
        warnings.append('input already within target (%d <= %d); geometry unchanged' % (before_tris, opts['target']))
        ratio, rounds, measured = 1.0, 0, before_tris
    else:
        ratio = min(1.0, opts['target'] / before_tris); rounds = 0; measured = before_tris
        with tempfile.TemporaryDirectory() as tmp:
            for attempt in range(8):
                rounds = attempt + 1
                restored = {}
                for o in objects:
                    key = o.data.get('glb_ready_origin') or o.data.name
                    if key not in restored:
                        restored[key] = originals[key].copy(); restored[key]['glb_ready_origin'] = key
                    o.data = restored[key]
                done = set()
                for o in objects:
                    if o.data.name in done:
                        continue
                    done.add(o.data.name)
                    bc.select_only([o])
                    tri = o.modifiers.new('glb_ready_triangulate', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier=tri.name)
                    dec = o.modifiers.new('glb_ready_decimate', 'DECIMATE')
                    dec.decimate_type = 'COLLAPSE'; dec.ratio = ratio; dec.use_collapse_triangulate = True
                    if opts['box']:
                        dec.vertex_group = PROTECT_GROUP; dec.invert_vertex_group = True; dec.vertex_group_factor = 1000
                    bpy.ops.object.modifier_apply(modifier=dec.name)
                probe = Path(tmp) / ('probe%d.glb' % attempt)
                bc.export_glb(probe, objects, export_materials='EXPORT' if opts['mode'] == 'keep-uv' else 'NONE',
                              export_texcoords=opts['mode'] == 'keep-uv', export_skins=False, export_morph=False, export_animations=False)
                measured = bc.triangles_of(probe)
                if measured <= opts['target']:
                    break
                ratio *= (opts['target'] / measured) * (0.999 if attempt == 0 else 1.0)
    keep_ratio = measured / before_tris if before_tris else 1.0
    if opts['mode'] == 'keep-uv' and keep_ratio < 0.30 and before_tris > opts['target']:
        warnings.append('keep-uv kept only %.0f%% of the triangles (below 30%%); consider --rebuild-surface and a new bake' % (keep_ratio * 100))
    bc.export_glb(opts['dst'], objects, export_materials='EXPORT' if opts['mode'] == 'keep-uv' else 'NONE',
                  export_texcoords=opts['mode'] == 'keep-uv', export_skins=False, export_morph=False, export_animations=False)
    final = bc.triangles_of(opts['dst'])
    error = None
    if opts['box']:
        bc.reset_scene()
        after_objects = bc.import_glb(opts['dst'])
        error = protected_error(before_surface, world_surface(after_objects), *opts['box'])
    params = {'target': opts['target'], 'mode': opts['mode'], 'ratioFinal': ratio, 'rounds': rounds, 'keepRatio': keep_ratio,
              'protect': {'min': opts['box'][0], 'max': opts['box'][1], 'maxError': opts['max_error']} if opts['box'] else None,
              'protectedError': error, 'requiresNewUV': opts['mode'] == 'rebuild-surface', 'requiresNewTexture': opts['mode'] == 'rebuild-surface'}
    bc.write_report(opts['dst'], SCRIPT, opts['args'], opts['src'], params, warnings)
    if final > opts['target']:
        bc.fail(1, 'serialized result has %d triangles, target %d, after %d rounds; lower the target expectations or use --rebuild-surface' % (final, opts['target'], rounds))
    if error and error['maxDistance'] > opts['max_error']:
        bc.fail(1, 'protected surface error %.4f m exceeds %.4f m; raise --target or shrink the box' % (error['maxDistance'], opts['max_error']))
    print('%s: %d -> %d triangles (%s, %d rounds)%s' % (SCRIPT, before_tris, final, opts['mode'], rounds, '' if not error else ', protected error %.4f m' % error['maxDistance']))


main()
