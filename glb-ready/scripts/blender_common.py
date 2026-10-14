"""Shared helpers for the glb-ready Blender scripts. Import only inside Blender."""
from __future__ import annotations
import hashlib
import json
import os
import sys
from pathlib import Path

VERSION = '1.0.0'
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
import glb_audit  # noqa: E402

try:
    import bpy  # noqa: F401
    from mathutils import Vector
except ImportError:  # imported outside Blender (tests import glb_audit only)
    bpy = None


def script_name():
    return Path(sys.argv[sys.argv.index('--python') + 1]).name if '--python' in sys.argv else 'blender_common'


def fail(code, message):
    sys.stderr.write('%s: %s\n' % (script_name(), message)); sys.stderr.flush(); sys.stdout.flush()
    os._exit(code)


def guard_background():
    if bpy is None or not bpy.app.background:
        fail(2, 'run with: blender -b --factory-startup --python-exit-code 1 --python <script> -- <args>')


def parse_args(argv=None):
    argv = sys.argv if argv is None else argv
    return argv[argv.index('--') + 1:] if '--' in argv else []


def flag_value(args, name, default=None, cast=str):
    if name in args:
        i = args.index(name)
        if i + 1 >= len(args):
            fail(2, '%s needs a value' % name)
        try:
            return cast(args[i + 1])
        except ValueError:
            fail(2, '%s: cannot parse %r' % (name, args[i + 1]))
    return default


def require_new_output(out, force):
    out = Path(out)
    report = Path(str(out) + '.report.json')
    if (out.exists() or report.exists()) and not force:
        fail(2, '%s exists; pass --force to overwrite' % out)
    if force:
        for p in (out, report):
            if p.exists():
                p.unlink()
    out.parent.mkdir(parents=True, exist_ok=True)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def bone_shape_objects():
    """Objects the glTF importer creates as pose-bone display shapes (collection glTF_not_exported); never geometry."""
    shapes = set()
    for o in bpy.data.objects:
        if o.type == 'ARMATURE':
            shapes.update(pb.custom_shape for pb in o.pose.bones if pb.custom_shape)
    return shapes


def import_glb(path):
    before = set(bpy.data.objects)
    suffix = Path(path).suffix.lower()
    if suffix == '.glb' or suffix == '.gltf':
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == '.fbx':
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif suffix == '.obj':
        bpy.ops.wm.obj_import(filepath=str(path))
    else:
        fail(2, 'unsupported input %s (glb, gltf, fbx, obj)' % path)
    shapes = bone_shape_objects()
    new = [o for o in bpy.data.objects if o not in before and o not in shapes]
    meshes = [o for o in new if o.type == 'MESH']
    if not meshes:
        raise ValueError('no mesh objects in %s' % path)
    bpy.context.view_layer.update()
    return meshes


def select_only(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def export_glb(path, objects, **overrides):
    select_only(objects)
    opts = dict(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True,
                export_normals=True, export_apply=True, export_extras=False, export_cameras=False, export_lights=False)
    opts.update(overrides)
    bpy.ops.export_scene.gltf(**opts)


def triangles_of(path):
    return glb_audit.scene_triangles(glb_audit.read_glb(path)[0])


def world_bounds(objects):
    lo = Vector((float('inf'),) * 3); hi = Vector((float('-inf'),) * 3)
    for o in objects:
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], p[i]); hi[i] = max(hi[i], p[i])
    return lo, hi


def height_of(objects):
    lo, hi = world_bounds(objects)
    return hi.z - lo.z


def write_report(out, script, args, in_path, params, warnings, extra=None):
    out = Path(out)
    report = {'script': script, 'version': VERSION, 'blender': bpy.app.version_string, 'args': list(args),
              'input': {'path': str(in_path), 'sha256': sha256(in_path), 'triangles': _safe_tris(in_path)},
              'output': {'path': str(out), 'sha256': sha256(out), 'triangles': _safe_tris(out)},
              'params': params, 'warnings': list(warnings)}
    if extra:
        report.update(extra)
    Path(str(out) + '.report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def _safe_tris(path):
    try:
        return triangles_of(path)
    except Exception:
        return None


def audit_module():
    return glb_audit
