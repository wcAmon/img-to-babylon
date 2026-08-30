#!/usr/bin/env python3
"""pass 狀態機：blockout → structure → material → physics → polish。
用法: python3 forge/next_pass.py {init --model NAME [--force] | status | done | correction}
"""
import argparse
import json
import os
import sys

PASS_ORDER = ["blockout", "structure", "material", "physics", "polish"]
PER_PASS_LIMIT = 3
TOTAL_LIMIT = 6
STATE_REL = os.path.join(".img2babylon", "state.json")


def state_path(root):
    return os.path.join(root, STATE_REL)


def load_state(root):
    with open(state_path(root)) as f:
        return json.load(f)


def save_state(root, state):
    os.makedirs(os.path.dirname(state_path(root)), exist_ok=True)
    with open(state_path(root), "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def current_pass(state):
    i = state["currentIndex"]
    return state["passOrder"][i] if i < len(state["passOrder"]) else None


def cmd_init(root, model, force):
    if os.path.exists(state_path(root)) and not force:
        print("state.json 已存在；用 --force 覆蓋", file=sys.stderr)
        raise SystemExit(2)
    save_state(root, {
        "model": model,
        "passOrder": PASS_ORDER,
        "currentIndex": 0,
        "corrections": {"perPass": {}, "total": 0},
    })
    print(json.dumps({"model": model, "currentPass": PASS_ORDER[0]}))
    return 0


def cmd_status(root):
    state = load_state(root)
    cur = current_pass(state)
    print(json.dumps({
        "model": state["model"],
        "currentPass": cur,
        "index": state["currentIndex"],
        "correctionsThisPass": state["corrections"]["perPass"].get(cur or "", 0),
        "totalCorrections": state["corrections"]["total"],
    }, ensure_ascii=False))
    return 0


def cmd_done(root):
    state = load_state(root)
    if current_pass(state) is None:
        print("all-passes-complete")
        return 0
    state["currentIndex"] += 1
    save_state(root, state)
    nxt = current_pass(state)
    print(nxt if nxt else "all-passes-complete")
    return 0


def cmd_correction(root):
    state = load_state(root)
    cur = current_pass(state)
    if cur is None:
        print("已無進行中的 pass", file=sys.stderr)
        return 2
    per = state["corrections"]["perPass"].get(cur, 0) + 1
    total = state["corrections"]["total"] + 1
    if per > PER_PASS_LIMIT or total >= TOTAL_LIMIT:
        print(f"修正上限已到（pass {cur}: {per}/{PER_PASS_LIMIT}, 總計: {total}/{TOTAL_LIMIT}）"
              "——停止並 request-input", file=sys.stderr)
        return 3
    state["corrections"]["perPass"][cur] = per
    state["corrections"]["total"] = total
    save_state(root, state)
    print(json.dumps({"pass": cur, "corrections": per, "total": total}))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=".")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_init = sub.add_parser("init")
    p_init.add_argument("--model", required=True)
    p_init.add_argument("--force", action="store_true")
    sub.add_parser("status")
    sub.add_parser("done")
    sub.add_parser("correction")
    args = ap.parse_args(argv)
    if args.cmd == "init":
        return cmd_init(args.root, args.model, args.force)
    return {"status": cmd_status, "done": cmd_done, "correction": cmd_correction}[args.cmd](args.root)


if __name__ == "__main__":
    sys.exit(main())
