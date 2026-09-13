#!/usr/bin/env python3
"""pass 狀態機：blockout → structure → material → physics → polish。
用法: python3 forge/next_pass.py {init --model NAME [--force] | status | done | correction}
"""
import argparse
import json
import os
import sys
import re
import shutil
from pathlib import Path
from datetime import datetime, timezone

PASS_ORDER = ["blockout", "structure", "material", "physics", "polish"]
PER_PASS_LIMIT = 3
TOTAL_LIMIT = 6
STATE_REL = os.path.join(".img2babylon", "state.json")


def state_path(root):
    if isinstance(root, tuple):
        base, model = root
        return os.path.join(base, '.img2babylon', model, 'state.json')
    return os.path.join(root, STATE_REL)


def load_state(root):
    source=Path(state_path(root))
    if isinstance(root,tuple) and not source.exists():
        source=Path(root[0], 'viewer/models', root[1], 'iteration-state.json')
    with open(source) as f:
        return json.load(f)


def save_state(root, state):
    os.makedirs(os.path.dirname(state_path(root)), exist_ok=True)
    with open(state_path(root), "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    if isinstance(root,tuple):
        model_dir=Path(root[0], 'viewer/models', root[1])
        if model_dir.is_dir():
            (model_dir/'iteration-state.json').write_text(json.dumps(state,indent=2,ensure_ascii=False)+'\n')


def current_pass(state):
    i = state["currentIndex"]
    return state["passOrder"][i] if i < len(state["passOrder"]) else None


def cmd_init(root, model, force):
    exists = os.path.exists(state_path(root)) or (isinstance(root, tuple) and Path(root[0], 'viewer/models', root[1], 'iteration-state.json').exists())
    if exists and not force:
        print("state.json 已存在；用 --force 覆蓋", file=sys.stderr)
        raise SystemExit(2)
    save_state(root, {
        "model": model,
        "revision": 1,
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
        "revision": state.get('revision', 1),
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
    # 刻意不對稱：per-pass 用 >（3 次以內都放行，第 4 次擋）；
    # total 用 >=（累計到 5 次都放行，第 6 次擋）。兩式皆已由 gate 測試鎖定，勿「修齊」成同一種比較。
    if per > PER_PASS_LIMIT or total >= TOTAL_LIMIT:
        print(f"修正上限已到（pass {cur}: {per}/{PER_PASS_LIMIT}, 總計: {total}/{TOTAL_LIMIT}）"
              "——停止並 request-input", file=sys.stderr)
        return 3
    state["corrections"]["perPass"][cur] = per
    state["corrections"]["total"] = total
    save_state(root, state)
    print(json.dumps({"pass": cur, "corrections": per, "total": total}))
    return 0


def cmd_revise(root, from_pass, reason):
    if not isinstance(root, tuple):
        print('revise 需要全域 --model，保留舊版全域狀態', file=sys.stderr)
        return 2
    state = load_state(root)
    if current_pass(state) is not None:
        print('目前 cycle 尚未完成；不能藉 revise 繞過修正上限', file=sys.stderr)
        return 2
    base, model = root
    revision = state.get('revision', 1)
    dest = Path(base, '.img2babylon', model, 'revisions', f'r{revision:03d}')
    if dest.exists():
        print('快照已存在，不覆寫', file=sys.stderr)
        return 2
    source = Path(base, 'viewer/models', model)
    if not source.is_dir():
        print('模型來源目錄不存在，不能保存快照', file=sys.stderr)
        return 2
    shutil.copytree(source, dest / 'model')
    runtime=Path(base,'viewer/src/sculpt')
    if runtime.is_dir(): shutil.copytree(runtime,dest/'runtime')
    (dest / 'state.json').write_text(json.dumps(state,indent=2,ensure_ascii=False)+'\n')
    state.update(revision=revision + 1, currentIndex=PASS_ORDER.index(from_pass),
                 corrections={'perPass': {}, 'total': 0})
    state.setdefault('history', []).append({
        'revision': revision, 'reason': reason, 'snapshot': str(dest),
        'completedAt': datetime.now(timezone.utc).isoformat(),
    })
    manifest_path=source/'iteration.json'
    if manifest_path.exists():
        manifest=json.loads(manifest_path.read_text())
        manifest.update(revision=revision+1,status=f'{from_pass}-in-progress')
        manifest_path.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    spec_path=source/'spec.json'
    spec=json.loads(spec_path.read_text())
    spec['buildStage']=from_pass
    spec_path.write_text(json.dumps(spec,indent=2,ensure_ascii=False)+'\n')
    save_state(root, state)
    return cmd_status(root)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=".")
    ap.add_argument('--model', dest='scope_model', help='獨立模型狀態；省略沿用舊版全域狀態')
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_init = sub.add_parser("init")
    p_init.add_argument("--model", required=True)
    p_init.add_argument("--force", action="store_true")
    sub.add_parser("status")
    sub.add_parser("done")
    sub.add_parser("correction")
    p_rev = sub.add_parser('revise')
    p_rev.add_argument('--from-pass', choices=PASS_ORDER, required=True)
    p_rev.add_argument('--reason', required=True)
    args = ap.parse_args(argv)
    for name in [args.scope_model, getattr(args, 'model', None)]:
        if name is not None and not re.fullmatch(r'[a-z0-9][a-z0-9-]*', name):
            ap.error('model 必須是小寫英數與連字號')
    root = (args.root, args.scope_model) if args.scope_model else args.root
    if args.cmd == "init":
        if args.scope_model and args.scope_model != args.model:
            ap.error('init model 與 scope model 不一致')
        return cmd_init(root, args.model, args.force)
    if args.cmd == 'revise':
        return cmd_revise(root, args.from_pass, args.reason)
    return {"status": cmd_status, "done": cmd_done, "correction": cmd_correction}[args.cmd](root)


if __name__ == "__main__":
    sys.exit(main())
