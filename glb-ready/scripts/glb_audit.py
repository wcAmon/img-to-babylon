#!/usr/bin/env python3
"""glb_audit.py — audit a GLB against a budget profile. Python 3.9+ stdlib only.

Usage: python3 glb-ready/scripts/glb_audit.py <file.glb> [--profile nomen-land|path.json] [--json]
Exit: 0 ok, 1 problems found (verdict fix or reduce), 2 unreadable input or bad usage.

Everything that reads a GLB in glb-ready goes through this module, so the Blender
scripts and the audit can never disagree about a triangle count.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

VERSION = '1.0.0'
PROFILES_DIR = Path(__file__).resolve().parent.parent / 'profiles'
COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}
CTYPES = {5120: ('b', 1, 127.0), 5121: ('B', 1, 255.0), 5122: ('h', 2, 32767.0),
          5123: ('H', 2, 65535.0), 5125: ('I', 4, 4294967295.0), 5126: ('f', 4, 1.0)}


class GlbError(ValueError):
    pass


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_glb(path):
    data = Path(path).read_bytes()
    if len(data) < 20 or data[:4] != b'glTF':
        raise GlbError('not a GLB container (missing glTF magic)')
    version, total = struct.unpack_from('<II', data, 4)
    if version != 2 or total > len(data):
        raise GlbError('unsupported GLB version or truncated file')
    offset, doc, binary = 12, None, b''
    while offset + 8 <= total:
        length, kind = struct.unpack_from('<II', data, offset)
        chunk = data[offset + 8: offset + 8 + length]
        if kind == 0x4E4F534A:
            try:
                doc = json.loads(chunk.decode('utf-8'))
            except ValueError as exc:
                raise GlbError('JSON chunk is not valid: %s' % exc)
        elif kind == 0x004E4942:
            binary = bytes(chunk)
        offset += 8 + length
    if doc is None:
        raise GlbError('GLB has no JSON chunk')
    return doc, binary


def _view_bytes(doc, binary, view_index):
    view = doc['bufferViews'][view_index]
    if doc['buffers'][view.get('buffer', 0)].get('uri'):
        raise GlbError('external buffer uri is not supported; use a self-contained GLB')
    start = view.get('byteOffset', 0)
    return binary[start:start + view['byteLength']], view.get('byteStride')


def accessor_values(doc, binary, index):
    acc = doc['accessors'][index]
    fmt, size, norm_div = CTYPES[acc['componentType']]
    n = COMPONENTS[acc['type']]
    count = acc['count']
    rows = []
    if 'bufferView' in acc:
        raw, stride = _view_bytes(doc, binary, acc['bufferView'])
        base = acc.get('byteOffset', 0)
        stride = stride or n * size
        pattern = '<%d%s' % (n, fmt)
        for i in range(count):
            rows.append(struct.unpack_from(pattern, raw, base + i * stride))
    else:
        rows = [tuple([0] * n) for _ in range(count)]
    sparse = acc.get('sparse')
    if sparse:
        idx_raw, _ = _view_bytes(doc, binary, sparse['indices']['bufferView'])
        ifmt = CTYPES[sparse['indices']['componentType']][0]
        ids = struct.unpack_from('<%d%s' % (sparse['count'], ifmt), idx_raw, sparse['indices'].get('byteOffset', 0))
        val_raw, _ = _view_bytes(doc, binary, sparse['values']['bufferView'])
        vals = struct.unpack_from('<%d%s' % (sparse['count'] * n, fmt), val_raw, sparse['values'].get('byteOffset', 0))
        for k, target in enumerate(ids):
            rows[target] = tuple(vals[k * n:(k + 1) * n])
    if acc.get('normalized') and norm_div != 1.0:
        rows = [tuple(max(v / norm_div, -1.0) for v in r) for r in rows]
    return rows


def _mat_mul(a, b):
    out = [0.0] * 16
    for col in range(4):
        for row in range(4):
            out[col * 4 + row] = sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
    return out


def _node_local(node):
    if 'matrix' in node:
        return [float(v) for v in node['matrix']]
    t = node.get('translation', [0, 0, 0]); q = node.get('rotation', [0, 0, 0, 1]); s = node.get('scale', [1, 1, 1])
    x, y, z, w = q
    r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
         2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
         2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]
    return [r[0] * s[0], r[1] * s[0], r[2] * s[0], 0.0,
            r[3] * s[1], r[4] * s[1], r[5] * s[1], 0.0,
            r[6] * s[2], r[7] * s[2], r[8] * s[2], 0.0,
            float(t[0]), float(t[1]), float(t[2]), 1.0]


def node_world_matrices(doc):
    nodes = doc.get('nodes', [])
    scenes = doc.get('scenes', [])
    if not scenes:
        return {}
    roots = scenes[doc.get('scene', 0)].get('nodes', [])
    world = {}
    identity = [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]

    def visit(index, parent, depth):
        if depth > 1000 or index in world:
            raise GlbError('cyclic or repeated node %d in scene graph' % index)
        world[index] = _mat_mul(parent, _node_local(nodes[index]))
        for child in nodes[index].get('children', []):
            visit(child, world[index], depth + 1)
    for root in roots:
        visit(root, identity, 0)
    return world


def primitive_triangles(doc, prim):
    mode = prim.get('mode', 4)
    count = doc['accessors'][prim['indices']]['count'] if 'indices' in prim else doc['accessors'][prim['attributes']['POSITION']]['count']
    if mode == 4:
        return count // 3
    if mode in (5, 6):
        return max(count - 2, 0)
    return 0


def scene_triangles(doc):
    total = 0
    for index in node_world_matrices(doc):
        node = doc['nodes'][index]
        if 'mesh' in node:
            total += sum(primitive_triangles(doc, p) for p in doc['meshes'][node['mesh']]['primitives'])
    return total


def image_dimensions(data):
    """(mime, width, height) from PNG/JPEG/WebP headers without decoding pixels."""
    if data[:8] == b'\x89PNG\r\n\x1a\n' and len(data) >= 24:
        w, h = struct.unpack_from('>II', data, 16)
        return 'image/png', w, h
    if data[:2] == b'\xff\xd8':
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1; continue
            marker = data[i + 1]
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                i += 2; continue
            length = struct.unpack_from('>H', data, i + 2)[0]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack_from('>HH', data, i + 5)
                return 'image/jpeg', w, h
            i += 2 + length
        return None
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP' and len(data) >= 30:
        tag = data[12:16]
        if tag == b'VP8 ':
            w, h = struct.unpack_from('<HH', data, 26)
            return 'image/webp', w & 0x3FFF, h & 0x3FFF
        if tag == b'VP8L':
            b = data[21:25]
            w = 1 + (((b[1] & 0x3F) << 8) | b[0]); h = 1 + (((b[3] & 0xF) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6))
            return 'image/webp', w, h
        if tag == b'VP8X':
            w = 1 + int.from_bytes(data[24:27], 'little'); h = 1 + int.from_bytes(data[27:30], 'little')
            return 'image/webp', w, h
    return None


def _texture_indices(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key.endswith('Texture') and isinstance(child, dict) and 'index' in child:
                yield child['index']
            else:
                for v in _texture_indices(child):
                    yield v
    elif isinstance(value, list):
        for child in value:
            for v in _texture_indices(child):
                yield v


def inspect(doc, binary, path):
    path = Path(path)
    world = node_world_matrices(doc)
    info = {'file': str(path), 'bytes': path.stat().st_size, 'sha256': sha256(path),
            'triangles': 0, 'vertices': 0, 'meshes': 0, 'primitives': 0, 'nodes': len(world),
            'materials': 0, 'textures': [], 'imagesEmbedded': True,
            'extensionsUsed': list(doc.get('extensionsUsed', [])),
            'extensionsRequired': list(doc.get('extensionsRequired', [])),
            'skins': [], 'animations': [], 'morphTargets': 0,
            'hasNormals': True, 'hasTexcoord0': True, 'warnings': []}
    meshes_seen, materials, texture_ids, prims = set(), set(), set(), []
    for index in world:
        node = doc['nodes'][index]
        if 'mesh' not in node:
            continue
        mesh = doc['meshes'][node['mesh']]
        meshes_seen.add(node['mesh'])
        for prim in mesh['primitives']:
            prims.append(prim)
            info['triangles'] += primitive_triangles(doc, prim)
            info['vertices'] += doc['accessors'][prim['attributes']['POSITION']]['count']
            info['primitives'] += 1
            info['morphTargets'] += len(prim.get('targets', []))
            if 'material' in prim:
                materials.add(prim['material'])
    info['meshes'] = len(meshes_seen)
    info['materials'] = len(materials)
    info['hasNormals'] = all('NORMAL' in p['attributes'] for p in prims)
    for m in materials:
        texture_ids.update(_texture_indices(doc['materials'][m]))
    info['hasTexcoord0'] = (not texture_ids) or all('TEXCOORD_0' in p['attributes'] for p in prims if 'material' in p and p['material'] in materials)
    for t in sorted(texture_ids):
        tex = doc.get('textures', [])[t]
        if 'source' not in tex:
            info['textures'].append({'image': None, 'mime': None, 'width': 0, 'height': 0, 'embedded': False,
                                     'note': 'texture %d has no core image source (extension-only texture)' % t})
            info['imagesEmbedded'] = False
            continue
        image = doc['images'][tex['source']]
        entry = {'image': tex['source'], 'mime': image.get('mimeType'), 'width': 0, 'height': 0, 'embedded': 'bufferView' in image}
        if entry['embedded']:
            raw, _ = _view_bytes(doc, binary, image['bufferView'])
            dims = image_dimensions(raw)
            if dims:
                entry['mime'], entry['width'], entry['height'] = dims
            else:
                entry['note'] = 'unknown image header'
        else:
            info['imagesEmbedded'] = False
        if entry not in info['textures']:
            info['textures'].append(entry)
    for skin in doc.get('skins', []):
        info['skins'].append({'joints': len(skin.get('joints', [])), 'hasInverseBindMatrices': 'inverseBindMatrices' in skin})
    for i, anim in enumerate(doc.get('animations', [])):
        duration = 0.0
        for sampler in anim.get('samplers', []):
            acc = doc['accessors'][sampler['input']]
            if 'max' in acc and acc['max']:
                duration = max(duration, float(acc['max'][0]))
            else:
                times = accessor_values(doc, binary, sampler['input'])
                if times:
                    duration = max(duration, max(t[0] for t in times))
        info['animations'].append({'name': anim.get('name', 'animation-%d' % i), 'channels': len(anim.get('channels', [])), 'duration': round(duration, 6)})
    return info


def load_profile(name_or_path):
    candidate = Path(name_or_path)
    if not candidate.suffix:
        candidate = PROFILES_DIR / (name_or_path + '.json')
    if not candidate.is_file():
        raise GlbError('profile not found: %s (built-ins: %s)' % (name_or_path, ', '.join(sorted(p.stem for p in PROFILES_DIR.glob('*.json')))))
    profile = json.loads(candidate.read_text())
    for key in ('maxTriangles', 'maxBytes', 'maxTextures', 'maxTextureSize', 'maxNodes', 'maxJoints', 'requireGrounded', 'forbidExtensions'):
        if key not in profile:
            raise GlbError('profile %s lacks %s' % (candidate.name, key))
    profile.setdefault('name', candidate.stem)
    return profile


def _transform(m, p):
    x, y, z = p
    return (m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14])


def geometry_checks(doc, binary, world, sample_limit=50000):
    lo = [math.inf] * 3; hi = [-math.inf] * 3
    nan_count, zero_area, sampled, normal_err = 0, 0, 0, 0.0
    for index, matrix in world.items():
        node = doc['nodes'][index]
        if 'mesh' not in node:
            continue
        for prim in doc['meshes'][node['mesh']]['primitives']:
            acc = doc['accessors'][prim['attributes']['POSITION']]
            positions = accessor_values(doc, binary, prim['attributes']['POSITION'])
            corners = [(a, b, c) for a in (acc.get('min', [0, 0, 0])[0], acc.get('max', [0, 0, 0])[0])
                       for b in (acc.get('min', [0, 0, 0])[1], acc.get('max', [0, 0, 0])[1])
                       for c in (acc.get('min', [0, 0, 0])[2], acc.get('max', [0, 0, 0])[2])] if 'min' in acc and 'max' in acc else positions
            for p in corners:
                w = _transform(matrix, p)
                for i in range(3):
                    lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
            for p in positions:
                if any(math.isnan(v) or math.isinf(v) for v in p):
                    nan_count += 1
            if 'NORMAL' in prim['attributes']:
                for n in accessor_values(doc, binary, prim['attributes']['NORMAL'])[:10000]:
                    if any(math.isnan(v) or math.isinf(v) for v in n):
                        nan_count += 1; continue
                    normal_err = max(normal_err, abs(math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) - 1.0))
            if prim.get('mode', 4) == 4 and sampled < sample_limit:
                indices = [i[0] for i in accessor_values(doc, binary, prim['indices'])] if 'indices' in prim else list(range(len(positions)))
                for t in range(0, min(len(indices) - 2, (sample_limit - sampled) * 3), 3):
                    a, b, c = positions[int(indices[t])], positions[int(indices[t + 1])], positions[int(indices[t + 2])]
                    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
                    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
                    cx, cy, cz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
                    if cx * cx + cy * cy + cz * cz < 1e-24:
                        zero_area += 1
                    sampled += 1
    if lo[0] == math.inf:
        lo = hi = [0.0, 0.0, 0.0]
    size = [hi[i] - lo[i] for i in range(3)]
    return {'bounds': {'min': lo, 'max': hi, 'size': size}, 'minY': lo[1],
            'centerXZ': [(lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2],
            'normalMaxLengthError': normal_err, 'nanCount': nan_count,
            'zeroAreaTriangles': zero_area, 'sampledTriangles': sampled}


def audit(path, profile):
    doc, binary = read_glb(path)
    info = inspect(doc, binary, path)
    world = node_world_matrices(doc)
    geo = geometry_checks(doc, binary, world)
    info['geometry'] = geo
    info['bounds'] = geo['bounds']
    info['profile'] = profile
    problems, warnings = [], list(info['warnings'])
    if info['triangles'] > profile['maxTriangles']:
        problems.append('triangles %d exceed %d' % (info['triangles'], profile['maxTriangles']))
    if info['bytes'] > profile['maxBytes']:
        problems.append('file is %d bytes, limit %d' % (info['bytes'], profile['maxBytes']))
    if info['nodes'] > profile['maxNodes']:
        problems.append('%d nodes exceed %d' % (info['nodes'], profile['maxNodes']))
    if len(info['textures']) > profile['maxTextures']:
        problems.append('%d textures exceed %d' % (len(info['textures']), profile['maxTextures']))
    for tex in info['textures']:
        if not tex['embedded']:
            problems.append('texture image %s is not embedded (%s)' % (tex['image'], tex.get('note', 'external uri')))
        elif max(tex['width'], tex['height']) > profile['maxTextureSize']:
            problems.append('texture image %d is %dx%d, limit %d' % (tex['image'], tex['width'], tex['height'], profile['maxTextureSize']))
        elif tex['width'] == 0:
            warnings.append('texture image %s has an unreadable header' % tex['image'])
    for ext in set(info['extensionsUsed']) | set(info['extensionsRequired']):
        if ext in profile['forbidExtensions']:
            problems.append('extension %s is forbidden (no Draco, Meshopt or KTX2)' % ext)
        elif ext in info['extensionsRequired'] and not ext.startswith('KHR_materials_'):
            problems.append('extensionsRequired contains %s; the target engine may not support it' % ext)
    if not info['hasNormals']:
        problems.append('a primitive has no NORMAL attribute')
    if not info['hasTexcoord0']:
        problems.append('a textured primitive has no TEXCOORD_0')
    if geo['nanCount']:
        problems.append('%d NaN/Inf values in positions or normals' % geo['nanCount'])
    if geo['normalMaxLengthError'] > 1e-5:
        problems.append('normals are not unit length (max error %.2e)' % geo['normalMaxLengthError'])
    if geo['zeroAreaTriangles']:
        warnings.append('%d zero-area triangles in a sample of %d' % (geo['zeroAreaTriangles'], geo['sampledTriangles']))
    for skin in info['skins']:
        if skin['joints'] > profile['maxJoints']:
            problems.append('skin has %d joints, limit %d' % (skin['joints'], profile['maxJoints']))
        if not skin['hasInverseBindMatrices']:
            warnings.append('skin has no inverseBindMatrices (identity assumed)')
    if profile.get('requireGrounded'):
        w, d = geo['bounds']['size'][0], geo['bounds']['size'][2]
        tol = max(0.02, 0.05 * max(w, d))
        if abs(geo['minY']) > 0.01:
            problems.append('not grounded: min y is %.4f m, expected 0' % geo['minY'])
        if abs(geo['centerXZ'][0]) > tol or abs(geo['centerXZ'][1]) > tol:
            problems.append('not centred: XZ centre is (%.3f, %.3f), tolerance %.3f m' % (geo['centerXZ'][0], geo['centerXZ'][1], tol))
    height = geo['bounds']['size'][1]
    if height > 50 or (0 < height < 0.05):
        warnings.append('suspicious scale: height %.3f m (units should be metres)' % height)
    if info['triangles'] > profile['maxTriangles']:
        verdict = 'reduce'
    elif problems:
        verdict = 'fix'
    else:
        verdict = 'ok'
    info['problems'], info['warnings'], info['verdict'] = problems, warnings, verdict
    return info


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('glb')
    parser.add_argument('--profile', default='nomen-land', help='built-in name or path to a profile JSON')
    parser.add_argument('--json', action='store_true', help='print the full report as JSON')
    args = parser.parse_args(argv)
    try:
        profile = load_profile(args.profile)
        if not Path(args.glb).is_file():
            raise GlbError('cannot read %s' % args.glb)
        result = audit(args.glb, profile)
    except (GlbError, KeyError, IndexError, struct.error, OSError) as exc:
        print('glb_audit: %s: %s' % (args.glb, exc), file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        g = result['geometry']['bounds']['size']
        print('%s: %s  triangles %d  textures %d  nodes %d  %.2f x %.2f x %.2f m  %d bytes  profile %s' % (
            Path(args.glb).name, result['verdict'].upper(), result['triangles'], len(result['textures']), result['nodes'],
            g[0], g[1], g[2], result['bytes'], profile['name']))
        for a in result['animations']:
            print('  clip %r  %d channels  %.2fs' % (a['name'], a['channels'], a['duration']))
        for s in result['skins']:
            print('  skin  %d joints' % s['joints'])
        for p in result['problems']:
            print('  PROBLEM  ' + p)
        for w in result['warnings']:
            print('  warning  ' + w)
        if result['verdict'] == 'reduce':
            print('  next: glb-ready/scripts/reduce_mesh.py (static) or go back to the unrigged mesh (rigged)')
        elif result['verdict'] == 'fix':
            print('  next: see glb-ready/SKILL.md "Which path"')
    return 0 if result['verdict'] == 'ok' else 1


if __name__ == '__main__':
    sys.exit(main())
