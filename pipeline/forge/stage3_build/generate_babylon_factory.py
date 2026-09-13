#!/usr/bin/env python3
"""Generate native Babylon factories from ObjectSculptSpec; upstream stays the parity oracle."""
from __future__ import annotations
import argparse
import copy
import json
import os
import math
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_threejs_factory as oracle
from stage5_rig.rig_spec import derive_envelope_radius
from import_babylon_sculpt import validate_native, matrix as native_matrix

RUNTIME = Path(__file__).resolve().parents[3] / 'viewer/src/pipeline'
# The boundary reuses engine-neutral validation, pass/tier resolution and descriptor defaults.
# It never invokes oracle.generate(), imports Three in emitted code, or mutates the oracle.
_PRIMITIVES = {'BoxGeometry':'boxGeometry','SphereGeometry':'sphereGeometry','CylinderGeometry':'cylinderGeometry','ConeGeometry':'coneGeometry','TorusGeometry':'torusGeometry','PlaneGeometry':'planeGeometry'}

def validate_native_component(c:dict[str,Any])->bool:
    d=c.get('geometryDescriptor') or {}
    native=d.get('nativeVertexData')
    bridge=(d.get('extensions') or {}).get('babylon-sculpt-v1') or {}
    if native is None:
        if bridge.get('requiresNativeVertexData') or bridge.get('allowPrimitiveFallback') is False:
            raise ValueError(f"{c.get('id')}: recipe-only legacy import cannot render")
        return False
    validate_native(native)
    t=(c.get('extensions') or {}).get('babylon-sculpt-v1',{}).get('nativeTransform') or {}
    def packed(v,n):
        return isinstance(v,list) and len(v)==n and all(type(x) in (int,float) and math.isfinite(x) for x in v)
    q=t.get('rotationQuaternion');pos=c.get('transform',{}).get('position');m=t.get('localMatrix')
    if t.get('version')!=1 or t.get('space')!='parent-local' or t.get('matrixLayout')!='column-major' or t.get('eulerOrder')!='XYZ' or t.get('effectiveScale')!=[1,1,1] or not packed(q,4) or not packed(pos,3) or not packed(m,16):
        raise ValueError('invalid nativeTransform contract')
    if abs(sum(v*v for v in q)-1)>1e-6 or any(abs(a-b)>2e-6 for a,b in zip(m,native_matrix(q,pos))):
        raise ValueError('native matrix and quaternion/position disagree')
    return True

def geometry_expression(c:dict[str,Any], seg:dict[str,int])->str:
    d=c.get('geometryDescriptor') or {}
    if validate_native_component(c):
        return 'nativeVertexGeometry('+json.dumps(c,ensure_ascii=False)+')'
    if isinstance(d.get('visualHull'),dict):
        return 'buildVisualHullGeometry('+json.dumps(d['visualHull'])+')'
    if c.get('topologyClass')=='implicit' and isinstance(d.get('sdf'),dict):
        return 'polygonizeSdf('+json.dumps(oracle.capped_sdf(d['sdf'],seg))+')'
    primitive=c.get('primitive')
    if primitive not in oracle.VALID_PRIMITIVES:
        raise ValueError(f'unsupported Babylon primitive {primitive!r}; no fallback')
    iterations=oracle.subdivision_iterations(c)
    effective=oracle.resolve_instanced_cluster_base(primitive,d,oracle.VALID_PRIMITIVES)
    expression='new THREE.BoxGeometry(1, 1, 1)' if iterations and effective=='box' else oracle.geometry_for(primitive,c,iterations>0,seg)
    for src,dst in _PRIMITIVES.items():expression=expression.replace('new THREE.'+src,dst)
    if 'THREE.' in expression:raise ValueError(f'Unconverted geometry expression: {expression}')
    return expression

def prepare_payload(spec:dict[str,Any],pass_id:str)->tuple[dict[str,Any],dict[str,str]]:
    seg=oracle.segments_for_spec(spec)
    components=copy.deepcopy(oracle.filter_components_for_pass(spec,spec.get('componentTree',[]),pass_id))
    selected={c['id'] for c in components}
    components=[copy.deepcopy(c) for c in spec.get('componentTree',[]) if c['id'] in selected]
    by_id={c['id']:c for c in components}
    if len(by_id)!=len(components):raise ValueError('duplicate component ids')
    # Detect hierarchy cycles before any scene mutation or recursive upstream filtering.
    for c in components:
        seen={c['id']};parent=c.get('parent')
        while parent and parent!='root':
            if parent in seen:raise ValueError('component hierarchy cycle')
            if parent not in by_id:raise ValueError(f'missing parent {parent}')
            seen.add(parent);parent=by_id[parent].get('parent')
    expressions={c['id']:geometry_expression(c,seg) for c in components}
    proud=[]
    for c in components:
        native=validate_native_component(c)
        if native:
            # The adapter's archival primitive/dimensions/scale are not executable geometry.
            c['_babylon']={'native':True,'scale':[1,1,1],'subdivision':0,'decimate':None,'dense':False}
            continue
        c['_babylon']={'native':False,'scale':oracle.scale_triple(c,c.get('transform') or {}),'subdivision':oracle.subdivision_iterations(c),'decimate':oracle.decimate_ratio(c),'dense':oracle.component_uses_dense_height_maps(c)}
        if c.get('vertexPaint') is not None:c['vertexPaint']=oracle.vertex_paint(c)
        if c.get('rootTipGradient'):c['rootTipGradient']=oracle.root_tip_gradient(c)
        if c.get('standProud'):
            job=c['standProud'];target=by_id.get(job.get('againstComponentId'));rings=oracle.stand_proud_ring_stack(target) if target else None
            if not rings:raise ValueError(f"{c['id']}: standProud target has no supported analytic ring surface")
            if target['primitive']=='lathe' and any(abs(r[1]-r[2])>1e-9 for r in rings):raise ValueError('lathe standProud ring radii disagree with actual revolve')
            sx,sy,sz=oracle.scale_triple(target,target.get('transform') or {})
            if min(sx,sy,sz)<=0:raise ValueError('standProud analytic target requires positive dimensions')
            proud.append({'componentId':c['id'],'targetId':target['id'],'rings':[[r[0]*sy,r[1]*sx,r[2]*sz,r[3]*sz] for r in rings],'clearance':job['clearance'],'maxPush':job['maxPush']})
    bones=[]
    if oracle.rig_is_bone_track(spec):
        bone_map={b['id']:b for b in spec['rig']['bones']};visiting=set();done=set()
        def visit(b):
            if b['id'] in visiting:raise ValueError('bone hierarchy cycle')
            if b['id'] in done:return
            visiting.add(b['id'])
            if b.get('parent'):
                if b['parent'] not in bone_map:raise ValueError('missing bone parent')
                visit(bone_map[b['parent']])
            visiting.remove(b['id']);done.add(b['id'])
            comp=next((c for c in spec['componentTree'] if c['id']==b.get('component',b['id'])),{})
            scale=(comp.get('transform') or {}).get('scale') or [0,0,0];width,depth=float(scale[0]),float(scale[2])
            if width<=0 or depth<=0:width=depth=.05
            bones.append({**b,'envelope':round(derive_envelope_radius(width,depth),6)})
        for b in bone_map.values():visit(b)
    realised={c['id'] for c in spec.get('componentTree',[])}
    for c in spec.get('componentTree',[]):realised.update(p['id'] for p in (c.get('geometryDescriptor',{}).get('sdf',{}).get('primitives',[])))
    reps=[]
    for i,rep in enumerate(spec.get('repetitionSystems',[])):
        ids=rep.get('elementComponentIds') or []
        if ids and all(e in realised for e in ids):continue
        if rep.get('level','meso') not in oracle.PASS_LEVELS.get(pass_id,{'macro'}) or rep.get('count',0)<=0:continue
        if not isinstance(rep.get('placement',{}),dict):raise ValueError('executable repetition needs numeric placement')
        rep={**rep,'id':rep.get('id',f'rep_{i}'),'primitive':rep.get('primitive','box')}
        expressions['repetition:'+rep['id']]=geometry_expression(rep,seg);reps.append(rep)
    return {'spec':spec,'passId':pass_id,'components':components,'segments':seg,'standProud':proud,'bones':bones,'repetitions':reps},expressions

def generate(spec:dict[str,Any],pass_id:str,runtime_import:str='../../src/pipeline')->str:
    errors,_=oracle.validate_spec(spec)
    if errors:raise ValueError('spec validation failed: '+'; '.join(errors))
    payload,expressions=prepare_payload(spec,pass_id)
    name=oracle.pascal_case(str(spec.get('targetName') or 'Procedural Object'))
    geometry_names=sorted({v.split('(',1)[0] for v in expressions.values()})
    primitive_names=set(_PRIMITIVES.values())|{'buildExtrudeGeometry','buildLatheGeometry','buildTubeGeometry','buildCurveSweepGeometry'}
    lines=['// Generated native Babylon factory. Dimensions are baked; pass/review gates remain mandatory.',"import { Scene, TransformNode, Camera, ArcRotateCamera } from '@babylonjs/core';",f"import {{createPipelineModel, createLookDevLights, createRoomEnvironment, frameCamera, createPresentationPipeline, configureRenderer, createInspectControls, type ModelOptions}} from {json.dumps(runtime_import+'/runtime')};"]
    for file,selected in [('nativeImport',[x for x in geometry_names if x=='nativeVertexGeometry']),('primitives',[x for x in geometry_names if x in primitive_names]),('geometryAlgorithms',[x for x in geometry_names if x not in primitive_names and x!='nativeVertexGeometry'])]:
        if selected:lines.append(f"import {{{', '.join(selected)}}} from {json.dumps(runtime_import+'/'+file)};")
    lines += [f'export const sculptSpec: any = {json.dumps(spec,ensure_ascii=False)};',f'const payload: any = {json.dumps(payload,ensure_ascii=False)};', 'const builders = {']
    lines.extend(f'  {json.dumps(k)}: () => {v},' for k,v in expressions.items());lines.append('};')
    lines += [f'export function create{name}Model(scene: Scene, options: ModelOptions = {{}}): TransformNode {{ return createPipelineModel(scene,payload,builders,options); }}',f'export function create{name}LookDevLights(scene:Scene,mode:"neutral"|"grazing"|"reference"="neutral"){{return createLookDevLights(scene,mode,sculptSpec);}}',f'export const create{name}Environment = createRoomEnvironment;',f'export const frame{name}Camera = frameCamera;',f'export const create{name}PresentationComposer = createPresentationPipeline;',f'export const configure{name}Renderer = configureRenderer;',f'export const create{name}InspectControls = createInspectControls;', '']
    return '\n'.join(lines)

def main(argv:list[str])->int:
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('spec',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--pass-id');p.add_argument('--force',action='store_true');p.add_argument('--allow-nonstrict',action='store_true');p.add_argument('--blocked-report',type=Path);a=p.parse_args(argv)
    spec=oracle.load_spec(a.spec);errors,warnings,failures=oracle.strict_quality_failures(spec)
    if failures and not a.allow_nonstrict:oracle.emit_blocked(oracle.blocked_report(a.spec,failures,warnings,a.pass_id),a.blocked_report);return 2
    if a.allow_nonstrict and a.pass_id:p.error('--allow-nonstrict is test-only and cannot be combined with --pass-id')
    if errors:p.error('; '.join(errors))
    if a.allow_nonstrict:print('WARNING: non-production fixture factory (--allow-nonstrict)',file=sys.stderr)
    try:
        pass_id=a.pass_id or oracle.unlocked_pass(spec);oracle.assert_pass_unlocked(spec,pass_id)
        gaps=oracle.pass_specific_gaps(spec,pass_id)
        if gaps:raise ValueError('; '.join(gaps))
        if a.out.exists() and not a.force:raise ValueError('output exists; use --force')
        rel=os.path.relpath(RUNTIME,a.out.resolve().parent).replace(os.sep,'/')
        if not rel.startswith('.'):rel='./'+rel
        result=generate(spec,pass_id,rel)
    except (ValueError,oracle.GeometryNotImplementedError) as exc:p.error(str(exc))
    a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(result,encoding='utf-8');print(a.out);return 0

if __name__=='__main__':raise SystemExit(main(sys.argv[1:]))
