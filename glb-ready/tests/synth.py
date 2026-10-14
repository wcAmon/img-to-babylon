"""Build tiny GLBs in memory for tests. Not used by any shipped script."""
from __future__ import annotations
import json
import struct
from pathlib import Path

CUBE_POSITIONS = [
    (-0.5, 0.0, -0.5), (0.5, 0.0, -0.5), (0.5, 1.0, -0.5), (-0.5, 1.0, -0.5),
    (-0.5, 0.0, 0.5), (0.5, 0.0, 0.5), (0.5, 1.0, 0.5), (-0.5, 1.0, 0.5),
]
CUBE_INDICES = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
                1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]


def pack_f32(rows):
    return b''.join(struct.pack('<%df' % len(r), *r) for r in rows)


def pack_u16(values):
    return struct.pack('<%dH' % len(values), *values)


def build_glb(doc: dict, chunks: list) -> bytes:
    """chunks[i] becomes bufferViews[i] (buffer 0), 4-byte aligned, in order."""
    binary = bytearray()
    views = []
    for chunk in chunks:
        while len(binary) % 4:
            binary.append(0)
        views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(chunk)})
        binary.extend(chunk)
    while len(binary) % 4:
        binary.append(0)
    doc = dict(doc)
    existing = doc.get('bufferViews', [])
    for i, view in enumerate(views):
        if i < len(existing):
            merged = dict(existing[i]); merged.update(view); views[i] = merged
    doc['bufferViews'] = views
    doc['buffers'] = [{'byteLength': len(binary)}]
    doc.setdefault('asset', {'version': '2.0'})
    text = json.dumps(doc, separators=(',', ':')).encode()
    while len(text) % 4:
        text += b' '
    total = 12 + 8 + len(text) + 8 + len(binary)
    return (struct.pack('<4sII', b'glTF', 2, total)
            + struct.pack('<II', len(text), 0x4E4F534A) + text
            + struct.pack('<II', len(binary), 0x004E4942) + bytes(binary))


def cube_doc(y_offset=0.0, normals=True, texcoords=False, extra_nodes=None,
             indexed=True, material=None, extensions_required=None,
             extensions_used=None, images=None, textures=None, skins=None,
             animations=None, scale=1.0):
    """One unit cube (12 triangles), base at y=y_offset, centred in XZ."""
    pos = [(x * scale, y * scale + y_offset, z * scale) for x, y, z in CUBE_POSITIONS]
    chunks = [pack_f32(pos)]
    accessors = [{'bufferView': 0, 'componentType': 5126, 'count': 8, 'type': 'VEC3',
                  'min': [min(p[i] for p in pos) for i in range(3)],
                  'max': [max(p[i] for p in pos) for i in range(3)]}]
    attributes = {'POSITION': 0}
    if normals:
        chunks.append(pack_f32([(0.0, 1.0, 0.0)] * 8))
        accessors.append({'bufferView': len(chunks) - 1, 'componentType': 5126, 'count': 8, 'type': 'VEC3'})
        attributes['NORMAL'] = len(accessors) - 1
    if texcoords:
        chunks.append(pack_f32([(0.0, 0.0)] * 8))
        accessors.append({'bufferView': len(chunks) - 1, 'componentType': 5126, 'count': 8, 'type': 'VEC2'})
        attributes['TEXCOORD_0'] = len(accessors) - 1
    primitive = {'attributes': attributes, 'mode': 4}
    if indexed:
        chunks.append(pack_u16(CUBE_INDICES))
        accessors.append({'bufferView': len(chunks) - 1, 'componentType': 5123, 'count': 36, 'type': 'SCALAR'})
        primitive['indices'] = len(accessors) - 1
    else:
        unrolled = [pos[i] for i in CUBE_INDICES]
        chunks[0] = pack_f32(unrolled)
        accessors[0]['count'] = 36
    if material is not None:
        primitive['material'] = material
    nodes = [{'mesh': 0, 'name': 'cube'}] + list(extra_nodes or [])
    doc = {'asset': {'version': '2.0'}, 'scene': 0,
           'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes,
           'meshes': [{'primitives': [primitive]}], 'accessors': accessors}
    if extensions_required: doc['extensionsRequired'] = extensions_required
    if extensions_used: doc['extensionsUsed'] = extensions_used
    if images is not None: doc['images'] = images
    if textures is not None: doc['textures'] = textures
    if skins is not None: doc['skins'] = skins
    if animations is not None: doc['animations'] = animations
    return doc, chunks


def png_header(width, height):
    """Minimal PNG signature + IHDR chunk; enough for header parsing, not a valid image."""
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + struct.pack('>I', 13) + b'IHDR' + ihdr + b'\0\0\0\0'


def jpeg_header(width, height):
    sof0 = b'\xff\xc0' + struct.pack('>HBHHB', 17, 8, height, width, 3) + b'\x01\x22\x00\x02\x11\x01\x03\x11\x01'
    return b'\xff\xd8' + b'\xff\xe0' + struct.pack('>H', 16) + b'JFIF\0\x01\x01\0\0\x01\0\x01\0\0' + sof0 + b'\xff\xd9'


def write(path: Path, data: bytes) -> Path:
    path = Path(path); path.write_bytes(data); return path
