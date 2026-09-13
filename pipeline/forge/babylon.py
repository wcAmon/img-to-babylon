#!/usr/bin/env python3
"""Babylon entry point for the complete upstream workflow. Run from repository root."""
from __future__ import annotations
import argparse, hashlib, json, shutil, sys
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'_shared'))
from workflow_state import new_state, save_state, load_state, mark_steps, status_payload, WorkflowStateError, recompute

def start_round(state_path:Path,model_dir:Path,reason:str):
    if not reason.strip(): raise WorkflowStateError('A round needs an explicit scope/reason')
    state=load_state(state_path)
    if state.get('engine')!='babylon': raise WorkflowStateError('Use a Babylon workflow state')
    model_dir=model_dir.resolve()
    if not model_dir.is_dir(): raise WorkflowStateError('Model source directory is required')
    current=state['iterationRound'];archive=state_path.resolve().parent/'rounds'/f"round-{current['index']:03d}"
    if archive.exists(): raise WorkflowStateError('Refusing to overwrite a previous round')
    if archive.is_relative_to(model_dir): raise WorkflowStateError('Snapshot destination cannot be inside model source')
    shutil.copytree(model_dir,archive/'model')
    shutil.copy2(state_path,archive/'workflow.json')
    runtime=ROOT.parent.parent/'viewer/src'
    if runtime.is_dir():shutil.copytree(runtime,archive/'runtime')
    spec_path=Path(state['artifacts']['spec'])
    if spec_path.is_file():
        shutil.copy2(spec_path,archive/'sculpt-spec.json')
        spec=json.loads(spec_path.read_text());history=spec.get('reviewHistory',[])
        total=state.get('historicalCorrectionOffset',0)+sum(isinstance(r,dict) and r.get('action') in ('refine-code','refine-spec') for r in history)
    else: total=state['loops']['total']
    state.setdefault('roundHistory',[]).append(dict(current,snapshot=str(archive),endedAt=datetime.now(timezone.utc).isoformat()))
    state['iterationRound']={'index':current['index']+1,'startTotal':total,'corrections':0,'limit':6,'reason':reason}
    if str(state.get('stopReason','')).startswith('max-round-correction'):
        state['status']='active';state['stopReason']=''
    recompute(state);save_state(state_path,state)
    return state

def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__);sub=ap.add_subparsers(dest='cmd',required=True)
    p=sub.add_parser('init');p.add_argument('--state',type=Path,required=True);p.add_argument('--reference',type=Path,required=True);p.add_argument('--spec',type=Path,required=True);p.add_argument('--profile',choices=['generic','character','cs2'],default='character')
    p.add_argument('--legacy-state',type=Path,help='Preserve an existing Babylon v1 round and cumulative count')
    p=sub.add_parser('next');p.add_argument('--state',type=Path,required=True)
    p=sub.add_parser('mark');p.add_argument('step');p.add_argument('--state',type=Path,required=True);p.add_argument('--status',choices=['done','skipped','pending'],default='done');p.add_argument('--evidence',type=Path,action='append',default=[]);p.add_argument('--reason',default='')
    p=sub.add_parser('round');p.add_argument('--state',type=Path,required=True);p.add_argument('--model-dir',type=Path,required=True);p.add_argument('--reason',required=True)
    args=ap.parse_args(argv)
    try:
        if args.cmd=='init':
            if args.state.exists():raise WorkflowStateError('Existing workflow cannot be overwritten')
            if not args.reference.is_file():raise WorkflowStateError('Reference image does not exist')
            state=new_state(str(args.reference.resolve()),profile=args.profile,spec=str(args.spec.resolve()),max_per_pass=6,max_total=6)
            state.update(engine='babylon',iterationRound={'index':1,'startTotal':0,'corrections':0,'limit':6})
            if args.legacy_state:
                legacy=json.loads(args.legacy_state.read_text())
                total=legacy['corrections']['total']; old=legacy['iterationRound']; count=old['corrections']; index=old['index']
                if any(type(v) is not int for v in [total,count,index]) or not 0<=count<=6 or total<count or index<1:
                    raise WorkflowStateError('Invalid legacy correction history')
                if not args.spec.is_file():raise WorkflowStateError('Canonical spec is required for legacy state import')
                canonical=json.loads(args.spec.read_text())
                if legacy.get('model')!=canonical.get('targetName'):raise WorkflowStateError('Legacy state model does not match canonical targetName')
                recorded=sum(isinstance(r,dict) and r.get('action') in ('refine-code','refine-spec') for r in canonical.get('reviewHistory',[]))
                if recorded>total:raise WorkflowStateError('Canonical history exceeds legacy count; cannot infer migration offset')
                state['historicalCorrectionOffset']=total-recorded
                state['legacyWorkflow']={'source':str(args.legacy_state.resolve()),'sha256':hashlib.sha256(args.legacy_state.read_bytes()).hexdigest(),'state':legacy}
                state['iterationRound']={'index':index,'startTotal':total-count,'corrections':count,'limit':6,'reason':old.get('reason','Imported legacy round')}
                state['loops']['total']=total
            state['artifacts']['referenceSha256']=hashlib.sha256(args.reference.read_bytes()).hexdigest()
            save_state(args.state,state)
        elif args.cmd=='next':
            import importlib.util
            module_spec=importlib.util.spec_from_file_location('native_next',ROOT/'next.py');module=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(module)
            return module.main(['--state',str(args.state)])
        elif args.cmd=='round':state=start_round(args.state,args.model_dir,args.reason)
        else:
            state=load_state(args.state)
            for evidence in args.evidence:
                if not evidence.is_file() or evidence.stat().st_size==0:raise WorkflowStateError(f'Evidence must be an existing nonempty file: {evidence}')
            mark_steps(state,[args.step],status=args.status,evidence=[str(p.resolve()) for p in args.evidence],reason=args.reason)
            save_state(args.state,state)
        print(json.dumps(status_payload(state),ensure_ascii=False));return 3 if state['status']=='stopped' else 0
    except (OSError,ValueError) as e:print(str(e),file=sys.stderr);return 2
if __name__=='__main__':raise SystemExit(main())
