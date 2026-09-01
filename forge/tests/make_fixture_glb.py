#!/usr/bin/env python3
"""Write a deterministic animated GLB fixture for retarget tests."""

import json
import math
import os
import struct
import sys


def _quat_x(angle):
    return [math.sin(angle / 2.0), 0.0, 0.0, math.cos(angle / 2.0)]


def _align(data, byte=0):
    return data + bytes([byte]) * ((-len(data)) % 4)


def build_fixture_glb():
    times = [0.0, 0.5, 1.0]
    shoulder = [_quat_x(a) for a in (0.0, 0.8, 2.2)]  # final key exceeds spec limit
    elbow = [_quat_x(a) for a in (0.0, 1.0, 2.0)]
    head = [_quat_x(a) for a in (0.0, 0.25, 0.5)]

    blobs = []
    views = []
    accessors = []

    def add(values, components, accessor_type):
        flat = [item for value in values
                for item in (value if isinstance(value, list) else [value])]
        raw = struct.pack("<" + "f" * len(flat), *flat)
        offset = sum(len(blob) for blob in blobs)
        blobs.append(_align(raw))
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(raw)})
        accessor = {"bufferView": len(views) - 1, "componentType": 5126,
                    "count": len(values), "type": accessor_type}
        if accessor_type == "SCALAR":
            accessor.update({"min": [min(values)], "max": [max(values)]})
        accessors.append(accessor)
        return len(accessors) - 1

    time_accessor = add(times, 1, "SCALAR")
    outputs = [add(values, 4, "VEC4") for values in (shoulder, elbow, head)]
    binary = b"".join(blobs)
    document = {
        "asset": {"version": "2.0", "generator": "img2babylon fixture"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [
            {"name": "root", "children": [1, 2, 3]},
            {"name": "L_Shoulder", "rotation": [0, 0, 0, 1]},
            {"name": "L_Elbow", "rotation": [0, 0, 0, 1]},
            {"name": "head", "rotation": [0, 0, 0, 1]},
        ],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": views,
        "accessors": accessors,
        "animations": [{
            "name": "mini_move",
            "samplers": [
                {"input": time_accessor, "output": output, "interpolation": "LINEAR"}
                for output in outputs
            ],
            "channels": [
                {"sampler": i, "target": {"node": i + 1, "path": "rotation"}}
                for i in range(3)
            ],
        }],
    }
    json_chunk = _align(json.dumps(document, separators=(",", ":")).encode(), 0x20)
    binary = _align(binary)
    length = 12 + 8 + len(json_chunk) + 8 + len(binary)
    return (struct.pack("<4sII", b"glTF", 2, length)
            + struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk
            + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def write_fixture(path):
    with open(path, "wb") as handle:
        handle.write(build_fixture_glb())


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"usage: {os.path.basename(sys.argv[0])} OUT.glb", file=sys.stderr)
        raise SystemExit(1)
    write_fixture(sys.argv[1])
