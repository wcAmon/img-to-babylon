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
