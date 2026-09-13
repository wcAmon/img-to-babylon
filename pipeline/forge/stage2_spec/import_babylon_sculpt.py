#!/usr/bin/env python3
"""Lossless BabylonSculptSpec v1 import bridge, not intake or visual acceptance.

Authored source remains in extensions. Native data is optional, never a recipe
replacement. See docs/migration/legacy-import.md for the consumer contract.
"""
from __future__ import annotations
import argparse
import copy
import json
import math
from pathlib import Path
import sys

KINDS = {'box': 'box', 'ellipsoid': 'ellipsoid', 'loft': 'extrude', 'patch': 'extrude'}
BRIDGE = 'babylon-sculpt-v1'


def vector(v):
    if not isinstance(v, list) or len(v) != 3 or any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in v):
        raise ValueError('expected finite vector3')
    return v


def reflect(v):
    x,y,z = vector(v)
    return [x,y,-z]


def quaternion(rotation):
    """Babylon RotationYawPitchRoll(y,x,z), conjugated by H=diag(1,1,-1)."""
    x,y,z = [v/2 for v in vector(rotation)]
    sx,cx,sy,cy,sz,cz = math.sin(x),math.cos(x),math.sin(y),math.cos(y),math.sin(z),math.cos(z)
    return [-(cy*sx*cz+sy*cx*sz), -(sy*cx*cz-cy*sx*sz), cy*cx*sz-sy*sx*cz, cy*cx*cz+sy*sx*sz]


def matrix(q, position):
    """Column-major local rigid transform. Legacy buildSculpt ignores scale/pivot fields."""
    x,y,z,w=q
    return [1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0,
            2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0,
            2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0,*position,1]


def canonical_transform(t):
    p=reflect(t['position']); q=quaternion(t['rotation']); m=matrix(q,p)
    # Canonical Three Euler XYZ, not Babylon's YXZ Euler tuple.
    y=math.asin(max(-1,min(1,m[8])))
    if abs(m[8]) < .9999999:
        x,z=math.atan2(-m[9],m[10]),math.atan2(-m[4],m[0])
    else:
        x,z=math.atan2(m[6],m[5]),0
    return {'position':p,'rotation':[x,y,z],'scale':[1,1,1]}, {
        'version':1,'space':'parent-local','matrixLayout':'column-major',
        'localMatrix':m,'rotationQuaternion':q,'eulerOrder':'XYZ',
        'effectiveScale':[1,1,1], 'authoredScale':copy.deepcopy(vector(t['scale'])),
        'pivotSemantics':'TransformNode origin; authored extra pivot metadata was not applied by buildSculpt',
    }


def validate_source(source):
    if source.get('schemaVersion') not in (1, '1') or not isinstance(source.get('targetName'),str):
        raise ValueError('expected BabylonSculptSpec v1 with targetName')
    cf=source.get('coordinateFrame',{})
    if cf.get('units') != 'm' or cf.get('up','y').lower() != 'y' or cf.get('handedness','left') not in ('left','LH'):
        raise ValueError('bridge supports legacy LH Y-up metres only')
    components=source.get('componentTree'); materials=source.get('materials')
    if not isinstance(components,list) or not components or not isinstance(materials,list):
        raise ValueError('componentTree and materials are required arrays')
    ids=[c['id'] for c in components]; mids=[m['id'] for m in materials]
    if len(ids)!=len(set(ids)) or len(mids)!=len(set(mids)):
        raise ValueError('duplicate component/material ID')
    by_id={c['id']:c for c in components}
    for c in components:
        if c['geometry']['kind'] not in KINDS: raise ValueError('unsupported legacy geometry kind')
        if c['material'] not in mids: raise ValueError('unknown material')
        for key in ('w','h','d'):
            v=c['dimensions'][key]
            if not isinstance(v,(int,float)) or not math.isfinite(v) or v<=0: raise ValueError('dimensions must be positive finite metres')
        for k in ('position','rotation','scale'): vector(c['transform'][k])
        seen={c['id']}; parent=c.get('parent')
        while parent is not None:
            if parent not in by_id: raise ValueError('unresolved component parent')
            if parent in seen: raise ValueError('component hierarchy cycle')
            seen.add(parent); parent=by_id[parent].get('parent')
    # Reject NaN/Infinity anywhere, including recipe and material parameters.
    json.dumps(source,allow_nan=False)


def validate_native(data):
    if data.get('version')!=1 or data.get('coordinateSystem')!={'handedness':'right','up':'Y','units':'m'} or data.get('space')!='component-local' or data.get('dimensionsBaked') is not True or data.get('transformBaked') is not False or data.get('winding')!='CCW-normal-consistent':
        raise ValueError('unsupported nativeVertexData contract')
    p,n,u,idx=(data.get(k) for k in ('positions','normals','uvs','indices'))
    if not isinstance(p,list) or not p or len(p)%3 or not isinstance(n,list) or len(n)!=len(p): raise ValueError('invalid native positions/normals')
    if not isinstance(u,list) or len(u) not in (0,len(p)//3*2): raise ValueError('invalid native uvs')
    if not isinstance(idx,list) or not idx or len(idx)%3 or any(type(i)!=int or i<0 or i>=len(p)//3 for i in idx): raise ValueError('invalid native indices')
    if any(type(v) not in (float,int) or not math.isfinite(v) for v in p+n+u): raise ValueError('nonfinite native data')
    swaps=data.get('windingFlippedTriangles',[])
    if not isinstance(swaps,list) or len(swaps)!=len(set(swaps)) or any(type(i)!=int or not 0<=i<len(idx)//3 for i in swaps): raise ValueError('invalid winding conversion record')


def import_spec(source:dict, native_export:dict|None=None, assessment:dict|None=None)->dict:
    """Explicit canonical mapping; strict canonical gates intentionally remain incomplete."""
    validate_source(source)
    legacy=copy.deepcopy(source)
    native={}
    if native_export is not None:
        if native_export.get('format')!='legacy-procedural-export' or native_export.get('version')!=1 or native_export.get('source')!=source:
            raise ValueError('native export does not match this exact authored source')
        entries=native_export.get('components',[])
        native={c['id']:c['nativeVertexData'] for c in entries}
        if len(native)!=len(entries) or set(native)!={c['id'] for c in source['componentTree']}: raise ValueError('native component IDs do not match')
        for data in native.values(): validate_native(data)
    result={
        'schemaVersion':'2.1','targetName':source['targetName'],
        'targetId':source.get('targetId',source.get('id',source['targetName'])),
        'suitability':'conditional',
        'coordinateFrame':{'handedness':'right','up':'Y','front':'+Z' if source.get('coordinateFrame',{}).get('forward') in ('-z','-Z') else '-Z','units':'m','scaleReference':'authored metres'},
        'sourceImages':copy.deepcopy(source.get('sourceImages',[])),
        'sourceImage':next((i.get('path','') for i in source.get('sourceImages',[]) if i.get('role')=='hero'),''),
        'silhouette':copy.deepcopy(source.get('silhouette',{})),
        'componentTree':[], 'materials':[],
        'preSpecAssessment':{'objectClass':{'primaryType':'unassessed','primaryDomain':'unassessed'},
                             'complexity':{'tier':'unassessed'},'anatomy':{'status':'unassessed'}},
        'qualityContract':{'qualityBar':'unassessed'},
        'referenceCamera':{'status':'unassessed','solved':False},
        'proceduralStrategy':['Import bridge only: complete canonical intake and strict gates before production generation.'],
        'reviewHistory':copy.deepcopy(source.get('reviewHistory',[])),
        'buildPasses':[],
        'extensions':{BRIDGE:{'version':1,'source':legacy,'editAuthority':'source',
            'productionReady':False,'requiredGates':['canonical-intake','canonical-strict-quality','native-bridge-integration'],
            'assessmentStatus':'unassessed','geometryStatus':'baked-bridge' if native_export else 'recipe-only',
            'physics':{'coordinateSystem':'legacy-LH','recipe':copy.deepcopy(source.get('physics',{})),
                       'status':'preserved-not-simulated'},
            'exportProvenance':copy.deepcopy(native_export.get('provenance',{})) if native_export else None,
            'buildStage':source.get('buildStage'),'buildPasses':copy.deepcopy(source.get('buildPasses',[]))}},
    }
    for key in ('id','seed','optimization','proportions'):
        if key in source: result[key]=copy.deepcopy(source[key])
    # Physics is an explicitly tagged LH recipe, not falsely labelled RH runtime data.
    # A future Havok adapter must convert its point/axial-vector fields by their semantics.
    for c in source['componentTree']:
        transform, runtime=canonical_transform(c['transform'])
        dimensions={k:copy.deepcopy(v) for k,v in c['dimensions'].items() if k not in ('w','h','d')}
        dimensions.update(width=c['dimensions']['w'],height=c['dimensions']['h'],depth=c['dimensions']['d'],units='m')
        node={k:copy.deepcopy(c[k]) for k in ('id','name','level','group','parent','material','optimization') if k in c}
        node.update(primitive=KINDS[c['geometry']['kind']],dimensions=dimensions,transform=transform,
                    geometryDescriptor={'topologyIntent':'legacy procedural recipe; canonical topology assessment pending',
                                        'extensions':{BRIDGE:{'recipe':copy.deepcopy(c['geometry']),
                                            'requiresNativeVertexData':True,'allowPrimitiveFallback':False}}},
                    extensions={BRIDGE:{'source':copy.deepcopy(c),'nativeTransform':runtime}})
        if c['id'] in native: node['geometryDescriptor']['nativeVertexData']=copy.deepcopy(native[c['id']])
        # No fabricated attachment/pivot admission: retain authored extras under source.
        node['actionProfile']={'pivot':{'mode':'origin','localPosition':[0,0,0]}}
        if 'collider' in c:
            collider=copy.deepcopy(c['collider'])
            if 'offset' in collider: collider['offset']=reflect(collider['offset'])
            node['actionProfile']['collider']=collider
        result['componentTree'].append(node)
    for m in source['materials']:
        rgb=vector(m['baseColor'])
        if any(x<0 or x>1 for x in rgb): raise ValueError('baseColor must be RGB in [0,1]')
        mapped={k:copy.deepcopy(v) for k,v in m.items() if k not in ('baseColor','kind','metallic')}
        mapped['baseColor']='#'+''.join(f'{int(x*255+0.5):02x}' for x in rgb)
        if 'metallic' in m: mapped['metalness']=copy.deepcopy(m['metallic'])
        mapped['extensions']={BRIDGE:{'source':copy.deepcopy(m),'baseColorRGB':copy.deepcopy(rgb),
            'colorSpace':'legacy-Color3-numeric','useExactRGB':True,
            'status':'authored-parameters-preserved; legacy StandardMaterial did not consume PBR roughness'}}
        result['materials'].append(mapped)
    if assessment is not None:
        allowed={'preSpecAssessment','qualityContract','referenceCamera','localSpecSearch','viewEvidence','scores','suitability','pipelineRouting'}
        if not isinstance(assessment,dict) or set(assessment)-allowed: raise ValueError('assessment contains unsupported fields')
        result.update(copy.deepcopy(assessment))
        result['extensions'][BRIDGE]['assessmentStatus']='caller-supplied-not-validated'
    return result


def restore_legacy(spec:dict)->dict:
    """Recover the exact authored JSON object, including all unknown extension fields."""
    return copy.deepcopy(spec['extensions'][BRIDGE]['source'])


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source',type=Path);p.add_argument('--native-export',type=Path)
    p.add_argument('--assessment',type=Path);p.add_argument('--out',type=Path,required=True)
    args=p.parse_args(argv)
    try:
        read=lambda path:json.loads(path.read_text()) if path else None
        result=import_spec(read(args.source),read(args.native_export),read(args.assessment))
        if args.out.resolve()==args.source.resolve(): raise ValueError('source overwrite prohibited')
        args.out.parent.mkdir(parents=True,exist_ok=True)
        args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
        print('Imported bridge; production remains blocked pending canonical intake and strict gates.')
        return 0
    except (ValueError,KeyError,TypeError) as exc:
        print(f'error: {exc}',file=sys.stderr);return 2


if __name__=='__main__': raise SystemExit(main())
