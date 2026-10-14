"""shrink_textures.py — downscale and embed textures without touching geometry, UVs, skins or clips.

blender -b --factory-startup --python-exit-code 1 --python glb-ready/scripts/shrink_textures.py -- \
    in.glb out.glb [--max 2048] [--jpeg-quality 82] [--max-textures 8] [--force]

The only texture tool allowed on rigged or morphed models. Exit 0 ok, 1 still too many textures, 2 usage.
export_image_format='AUTO' keeps each image's container (PNG stays PNG, JPEG stays JPEG).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_common as bc  # noqa: E402

bc.guard_background()
import bpy  # noqa: E402

SCRIPT = 'shrink_textures'


def images_in_use():
    """image -> sorted material names that reference it through an Image Texture node."""
    users = {}
    for mat in bpy.data.materials:
        if mat.node_tree is None:
            continue
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image is not None:
                users.setdefault(node.image, set()).add(mat.name)
    return {img: sorted(names) for img, names in users.items()}


def main():
    args = bc.parse_args()
    if len(args) < 2:
        bc.fail(2, 'usage: in.glb out.glb [--max 2048] [--jpeg-quality 82] [--max-textures 8] [--force]')
    src, dst = Path(args[0]).resolve(), Path(args[1]).resolve()
    maximum = bc.flag_value(args, '--max', 2048, int)
    quality = bc.flag_value(args, '--jpeg-quality', 82, int)
    max_textures = bc.flag_value(args, '--max-textures', 8, int)
    if maximum < 1 or not (1 <= quality <= 100) or max_textures < 0:
        bc.fail(2, '--max >= 1, --jpeg-quality 1..100, --max-textures >= 0')
    bc.require_new_output(dst, '--force' in args)
    audit = bc.audit_module()
    try:
        audit.read_glb(src)
    except (OSError, audit.GlbError) as exc:
        bc.fail(2, 'cannot read %s: %s' % (src, exc))
    bc.reset_scene()
    before = set(bpy.data.objects)
    bc.import_glb(src)
    shapes = bc.bone_shape_objects()
    imported = [o for o in bpy.data.objects if o not in before and o not in shapes]
    report_images = []
    for image, materials in images_in_use().items():
        w, h = image.size[0], image.size[1]
        if w == 0 or h == 0:
            continue
        if image.packed_file is None and image.filepath:
            image.pack()
        tw, th = w, h
        if max(w, h) > maximum:
            scale = maximum / max(w, h)
            tw, th = max(1, round(w * scale)), max(1, round(h * scale))
            image.scale(tw, th)
        report_images.append({'name': image.name, 'from': [w, h], 'to': [tw, th], 'materials': materials})
    bc.export_glb(dst, imported, export_materials='EXPORT', export_image_format='AUTO', export_jpeg_quality=quality,
                  export_animations=True, export_skins=True, export_morph=True, export_animation_mode='ACTIONS',
                  export_force_sampling=True, export_all_influences=True, export_apply=False)
    params = {'max': maximum, 'jpegQuality': quality, 'maxTextures': max_textures, 'images': report_images}
    bc.write_report(dst, SCRIPT, args, src, params, [])
    if len(report_images) > max_textures:
        listing = '; '.join('%s %dx%d used by %s' % (i['name'], i['to'][0], i['to'][1], ','.join(i['materials'])) for i in report_images)
        bc.fail(1, '%d textures remain, limit %d: %s. Merge materials or bake an atlas (static meshes only).' % (len(report_images), max_textures, listing))
    print('%s: %d images, max side now <= %d' % (SCRIPT, len(report_images), maximum))


main()
