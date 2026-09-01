#!/usr/bin/env python3
"""Retarget GLB node rotations to Babylon action-figure servo timelines."""

import argparse
from dataclasses import dataclass
import json
import math
import struct
import sys


# Data-only source-name mapping.  Kimodo-specific corrections belong here, not
# in the projection engine.  component names refer to XZY Euler components.
JOINT_MAP = {
    "head": {"body": "head", "axis_map": {"x": ("x", 1), "y": ("y", 1), "z": ("z", 1)}},
    "Head": {"body": "head", "axis_map": {"x": ("x", 1), "y": ("y", 1), "z": ("z", 1)}},
    "neck": {"body": "head", "axis_map": {"x": ("x", 1), "y": ("y", 1), "z": ("z", 1)}},
    "Neck": {"body": "head", "axis_map": {"x": ("x", 1), "y": ("y", 1), "z": ("z", 1)}},
    "L_Shoulder": {"body": "upper-arm-l", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "left_shoulder": {"body": "upper-arm-l", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "LeftShoulder": {"body": "upper-arm-l", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "R_Shoulder": {"body": "upper-arm-r", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "right_shoulder": {"body": "upper-arm-r", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "RightShoulder": {"body": "upper-arm-r", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "L_Elbow": {"body": "forearm-l", "axis_map": {"x": ("x", 1)}},
    "left_elbow": {"body": "forearm-l", "axis_map": {"x": ("x", 1)}},
    "LeftElbow": {"body": "forearm-l", "axis_map": {"x": ("x", 1)}},
    "R_Elbow": {"body": "forearm-r", "axis_map": {"x": ("x", -1)}},
    "right_elbow": {"body": "forearm-r", "axis_map": {"x": ("x", -1)}},
    "RightElbow": {"body": "forearm-r", "axis_map": {"x": ("x", -1)}},
    "L_Hip": {"body": "thigh-l", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "left_hip": {"body": "thigh-l", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "LeftHip": {"body": "thigh-l", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "R_Hip": {"body": "thigh-r", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "right_hip": {"body": "thigh-r", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "RightHip": {"body": "thigh-r", "axis_map": {"x": ("x", -1), "y": ("y", 1), "z": ("z", 1)}},
    "L_Knee": {"body": "calf-l", "axis_map": {"x": ("x", -1)}},
    "left_knee": {"body": "calf-l", "axis_map": {"x": ("x", -1)}},
    "LeftKnee": {"body": "calf-l", "axis_map": {"x": ("x", -1)}},
    "R_Knee": {"body": "calf-r", "axis_map": {"x": ("x", -1)}},
    "right_knee": {"body": "calf-r", "axis_map": {"x": ("x", -1)}},
    "RightKnee": {"body": "calf-r", "axis_map": {"x": ("x", -1)}},
}


@dataclass
class RotationTimeline:
    times: list
    values: list


@dataclass
class ParsedGlb:
    document: dict
    nodes: list
    rotations: dict


_COMPONENT_FORMAT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
_TYPE_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def _read_accessor(document, binary, index):
    try:
        accessor = document["accessors"][index]
        view = document["bufferViews"][accessor["bufferView"]]
        component_format = _COMPONENT_FORMAT[accessor["componentType"]]
        components = _TYPE_COMPONENTS[accessor["type"]]
        count = accessor["count"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError("invalid accessor") from exc
    if view.get("buffer", 0) != 0 or accessor.get("sparse") is not None:
        raise ValueError("only non-sparse BIN buffer accessors are supported")
    component_size = struct.calcsize("<" + component_format)
    element_size = component_size * components
    stride = view.get("byteStride", element_size)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    values = []
    for item in range(count):
        offset = start + item * stride
        if offset + element_size > len(binary):
            raise ValueError("accessor exceeds BIN chunk")
        value = struct.unpack_from("<" + component_format * components, binary, offset)
        values.append(value[0] if components == 1 else tuple(value))
    return values


def parse_glb(data):
    if len(data) < 12 or data[:4] != b"glTF":
        raise ValueError("invalid GLB magic")
    magic, version, declared_length = struct.unpack_from("<4sII", data)
    if version != 2:
        raise ValueError("unsupported GLB version")
    if declared_length != len(data):
        raise ValueError("GLB length mismatch")
    chunks = {}
    offset = 12
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError("truncated GLB chunk header")
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        end = offset + chunk_length
        if end > len(data):
            raise ValueError("truncated GLB chunk")
        chunks[chunk_type] = data[offset:end]
        offset = end
    if b"JSON" not in chunks:
        raise ValueError("GLB has no JSON chunk")
    try:
        document = json.loads(chunks[b"JSON"].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("invalid GLB JSON chunk") from exc
    binary = chunks.get(b"BIN\0", b"")
    nodes = document.get("nodes", [])
    rotations = {}
    animations = document.get("animations", [])
    if animations:
        animation = animations[0]
        for channel in animation.get("channels", []):
            target = channel.get("target", {})
            if target.get("path") != "rotation":
                continue
            try:
                node = nodes[target["node"]]
                sampler = animation["samplers"][channel["sampler"]]
                name = node["name"]
            except (KeyError, IndexError, TypeError) as exc:
                raise ValueError("invalid animation channel") from exc
            if sampler.get("interpolation", "LINEAR") != "LINEAR":
                raise ValueError("only LINEAR animation interpolation is supported")
            times = _read_accessor(document, binary, sampler["input"])
            values = _read_accessor(document, binary, sampler["output"])
            if len(times) != len(values) or not times:
                raise ValueError("rotation timeline input/output length mismatch")
            rotations[name] = RotationTimeline(list(times), list(values))
    return ParsedGlb(document, nodes, rotations)


def _normalize(quat):
    length = math.sqrt(sum(value * value for value in quat))
    if length == 0:
        raise ValueError("zero quaternion")
    return tuple(value / length for value in quat)


def _multiply(left, right):
    lx, ly, lz, lw = left
    rx, ry, rz, rw = right
    return (lw * rx + lx * rw + ly * rz - lz * ry,
            lw * ry - lx * rz + ly * rw + lz * rx,
            lw * rz + lx * ry - ly * rx + lz * rw,
            lw * rw - lx * rx - ly * ry - lz * rz)


def quat_from_euler_xzy(x, y, z):
    """Quaternion whose matrix round-trips through the viewer's eulerXZY."""
    qx = (-math.sin(x / 2), 0.0, 0.0, math.cos(x / 2))
    qy = (0.0, -math.sin(y / 2), 0.0, math.cos(y / 2))
    qz = (0.0, 0.0, -math.sin(z / 2), math.cos(z / 2))
    return _normalize(_multiply(_multiply(qy, qz), qx))


def euler_xzy_from_quat(quat):
    x, y, z, w = _normalize(quat)
    matrix = (
        (1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)),
        (2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)),
        (2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)),
    )
    clamp = lambda value: max(-1.0, min(1.0, value))
    return (math.atan2(matrix[1][2], matrix[1][1]),
            math.atan2(matrix[2][0], matrix[0][0]),
            math.asin(clamp(-matrix[1][0])))


def relative_quat(rest, frame):
    rest = _normalize(rest)
    inverse = (-rest[0], -rest[1], -rest[2], rest[3])
    return _normalize(_multiply(inverse, _normalize(frame)))


def sample_quaternions(times, values, time):
    if time <= times[0]:
        return _normalize(values[0])
    if time >= times[-1]:
        return _normalize(values[-1])
    upper = 1
    while times[upper] < time:
        upper += 1
    lower = upper - 1
    amount = (time - times[lower]) / (times[upper] - times[lower])
    left = _normalize(values[lower])
    right = _normalize(values[upper])
    if sum(a * b for a, b in zip(left, right)) < 0:
        right = tuple(-value for value in right)
    return _normalize(tuple(a + (b - a) * amount for a, b in zip(left, right)))


def servo_tracks_from_spec(spec):
    tracks = []
    limits = {}
    for constraint in spec.get("physics", {}).get("constraints", []):
        if constraint.get("actuation", {}).get("type") != "servo":
            continue
        body = constraint.get("bodyB")
        if constraint.get("type") == "hinge":
            axes = {"x": constraint.get("limits")}
        elif constraint.get("type") == "joint":
            axes = constraint.get("angular", {})
        else:
            continue
        for axis in ("x", "y", "z"):
            axis_limit = axes.get(axis, "locked")
            if axis_limit == "locked":
                continue
            if not (isinstance(axis_limit, list) and len(axis_limit) == 2):
                raise ValueError(f"servo:{body}.{axis} requires numeric angular limits")
            track = f"servo:{body}.{axis}"
            tracks.append(track)
            limits[track] = tuple(axis_limit)
    return tracks, limits


def retarget_glb(glb, spec, fps):
    if not isinstance(fps, int) or fps <= 0:
        raise ValueError("fps must be a positive integer")
    track_names, limits = servo_tracks_from_spec(spec)
    duration = max((timeline.times[-1] for timeline in glb.rotations.values()), default=0.0)
    frames = int(math.floor(duration * fps + 1e-9)) + 1
    frame_times = [index / fps for index in range(frames)]
    tracks = {name: [0.0] * frames for name in track_names}
    for node_name, source in glb.rotations.items():
        mapping = JOINT_MAP.get(node_name)
        if mapping is None:
            continue
        node_index = next((index for index, node in enumerate(glb.nodes)
                           if node.get("name") == node_name), None)
        if node_index is None:
            continue
        rest = glb.nodes[node_index].get("rotation", [0.0, 0.0, 0.0, 1.0])
        for frame_index, time in enumerate(frame_times):
            relative = relative_quat(rest, sample_quaternions(source.times, source.values, time))
            components = dict(zip(("x", "y", "z"), euler_xzy_from_quat(relative)))
            for source_axis, (target_axis, sign) in mapping["axis_map"].items():
                track = f"servo:{mapping['body']}.{target_axis}"
                if track not in tracks:
                    continue
                low, high = limits[track]
                tracks[track][frame_index] = max(low, min(high, components[source_axis] * sign))
    return {"model": spec.get("targetName"), "fps": fps, "frames": frames, "tracks": tracks}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--spec", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--fps", type=int, default=20)
    args = parser.parse_args(argv)
    try:
        with open(args.input, "rb") as handle:
            glb = parse_glb(handle.read())
        with open(args.spec, encoding="utf-8") as handle:
            spec = json.load(handle)
        timeline = retarget_glb(glb, spec, args.fps)
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(timeline, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"retarget: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
