#!/usr/bin/env python3
"""產生 BabylonSculptSpec v1 模板。
用法: python3 forge/new_spec.py --name NAME --out viewer/models/NAME
"""
import argparse
import json
import os
import sys

TEMPLATE = {
    "targetName": "",
    "schemaVersion": "1",
    "sourceImages": [
        {"role": "hero", "path": "", "origin": "tomato", "tomatoJobId": "", "prompt": ""}
    ],
    "coordinateFrame": {"up": "y", "forward": "z", "units": "m"},
    "silhouette": {"outline": "", "complexity": "simple"},
    "componentTree": [
        {
            "id": "main",
            "name": "",
            "level": "macro",
            "primitive": "box",
            "dimensions": {"w": 0.1, "h": 0.1, "d": 0.1, "units": "m", "confidence": 0.5},
            "transform": {"position": [0, 0.05, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "parent": None,
            "attachment": {"type": "none"},
            "material": "",
            "collider": {"type": "box", "size": [0.1, 0.1, 0.1], "offset": [0, 0, 0],
                          "confidence": 0.5}
        }
    ],
    "materials": [
        {"id": "", "kind": "procedural", "baseColor": [0.5, 0.5, 0.5], "roughness": 0.5}
    ],
    "physics": {
        "bodies": [
            {"id": "main", "components": ["main"], "mass": 0.1, "friction": 0.5,
             "restitution": 0.3, "centerOfMass": [0, 0, 0]}
        ],
        "constraints": []
    },
    "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
    "reviewHistory": []
}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, "spec.json")
    if os.path.exists(path):
        print(f"{path} 已存在，不覆蓋", file=sys.stderr)
        return 2
    spec = dict(TEMPLATE)
    spec["targetName"] = args.name
    with open(path, "w") as f:
        json.dump(spec, f, indent=2, ensure_ascii=False)
    print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
