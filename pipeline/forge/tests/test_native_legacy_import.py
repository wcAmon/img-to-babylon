"""Native procedural import regression; no browser, no external assets/deps."""
import copy
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'pipeline/forge/stage2_spec'))
from import_babylon_sculpt import import_spec,restore_legacy,validate_native,BRIDGE


def fixture():
    source={'schemaVersion':1,'targetName':'Keep_My-ID','id':'identity-Exact','seed':17,
        'coordinateFrame':{'up':'y','forward':'z','units':'m'},'buildStage':'polish',
        'sourceImages':[{'role':'hero','path':'source.png','provenance':{'owner':'user'}}],
        'silhouette':{'outline':'unassessed fixture'},'optimization':{'keep':'entrypoint'},
        'materials':[{'id':'exact','baseColor':[.123456,.654321,.3],'roughness':.37,'metallic':.24,
                      'alpha':.63,'customMaterialParam':{'retain':True}}],
        'physics':{'bodies':[{'id':'root','components':['root','loft'],'mass':4,'friction':.41,'restitution':.17,'centerOfMass':[.2,.3,.4]}],
                   'constraints':[{'id':'hinge','type':'hinge','bodyA':'root','bodyB':'loft','pivotA':[1,2,3],'pivotB':[.1,.2,.3],'axisA':[0,0,1],'axisB':[1,0,0]}]},
        'buildPasses':['blockout','polish'], 'reviewHistory':[{'pass':'polish','action':'request-input','eye':{'verdict':'reject'}}],
        'unknownFutureField':{'must':'survive'},'componentTree':[]}
    for i,(cid,kind) in enumerate([('root','box'),('loft','loft'),('patch','patch'),('round','ellipsoid')]):
        geometry={'kind':kind,'segments':12}
        if kind=='loft':geometry.update(rings=[[-.5,.2,.3,.05,-.1],[0,.6,.4,.1,.15],[.5,.3,.2,-.1,.05]],smooth=True,power=.8,
                                         relief=[{'center':[.1,.1],'radius':[.2,.3],'depth':.08}])
        if kind=='patch':geometry.update(outline=[[-.5,-.5],[.5,-.5],[.1,0],[.5,.5],[-.5,.5]],dome=0)
        source['componentTree'].append({'id':cid,'name':cid,'parent':None if i==0 else ['root','loft','patch'][i-1],
            'group':'kept-group','level':'macro','primitive':'legacy-label','material':'exact',
            'dimensions':{'w':.7,'h':.9,'d':.3,'units':'m','confidence':.7},
            'transform':{'position':[.2+i*.1,.3,-.4],'rotation':[.31,-.27,.42],'scale':[2,3,4]},
            'geometry':geometry,'pivot':{'position':[.11,.22,.33],'keep':'authored extra ignored in old builder'},
            'optimization':{'parameterPath':f'spec.json:componentTree[id={cid}]'},
            'attachment':{'type':'fixed','custom':[1,2,3]},'collider':{'type':'box','size':[.7,.9,.3],'offset':[.02,.03,.04]}})
    # Verify parent order is not silently used as the transform authority.
    source['componentTree'].reverse()
    return source


class NativeLegacyImport(unittest.TestCase):
    def run_node(self,*args):
        result=subprocess.run(['node','--import',str(ROOT/'viewer/node_modules/tsx/dist/loader.mjs'),
                               str(ROOT/'viewer/scripts/export_legacy_pipeline.ts'),*map(str,args)],
                               cwd=ROOT,capture_output=True,text=True,timeout=120)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        return result

    def exercise(self,source,label):
        scratch=ROOT/'.img2babylon/cli';scratch.mkdir(parents=True,exist_ok=True)
        src=scratch/f'legacy-{label}-source.json';exp=scratch/f'legacy-{label}-export.json'
        canonical=scratch/f'legacy-{label}-canonical.json';report=scratch/f'legacy-{label}-report.json'
        src.write_text(json.dumps(source))
        before=copy.deepcopy(source)
        self.run_node(src,exp)
        exported=json.loads(exp.read_text());result=import_spec(source,exported)
        self.assertEqual(source,before)
        self.assertEqual(restore_legacy(result),source)
        self.assertEqual(result['targetName'],source['targetName'])
        self.assertEqual(result['reviewHistory'],source['reviewHistory'])
        self.assertEqual(result['sourceImages'],source['sourceImages'])
        self.assertEqual(result['extensions'][BRIDGE]['physics']['recipe'],source['physics'])
        self.assertEqual(result['extensions'][BRIDGE]['buildStage'],source['buildStage'])
        self.assertEqual(result['extensions'][BRIDGE]['buildPasses'],source['buildPasses'])
        self.assertEqual([c['id'] for c in result['componentTree']],[c['id'] for c in source['componentTree']])
        for old,new in zip(source['componentTree'],result['componentTree']):
            for k in ('id','group','parent','optimization','material'):self.assertEqual(old[k],new[k])
            self.assertEqual(new['geometryDescriptor']['extensions'][BRIDGE]['recipe'],old['geometry'])
            self.assertEqual(new['extensions'][BRIDGE]['source'],old)
            self.assertEqual([new['dimensions'][k] for k in ('width','height','depth')],[old['dimensions'][k] for k in ('w','h','d')])
            self.assertEqual(new['transform']['position'],[old['transform']['position'][0],old['transform']['position'][1],-old['transform']['position'][2]])
            self.assertEqual(new['transform']['scale'],[1,1,1])
            self.assertEqual(new['extensions'][BRIDGE]['nativeTransform']['authoredScale'],old['transform']['scale'])
            # XYZ Euler reconstruction independently agrees with the conjugated YXZ quaternion.
            x,y,z=[a/2 for a in new['transform']['rotation']]
            sx,cx,sy,cy,sz,cz=math.sin(x),math.cos(x),math.sin(y),math.cos(y),math.sin(z),math.cos(z)
            q=[sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz]
            target=new['extensions'][BRIDGE]['nativeTransform']['rotationQuaternion']
            self.assertAlmostEqual(abs(sum(a*b for a,b in zip(q,target))),1,delta=1e-10)
            self.assertTrue(new['geometryDescriptor']['nativeVertexData']['positions'])
        for old,new in zip(source['materials'],result['materials']):
            self.assertEqual(new['extensions'][BRIDGE]['source'],old)
            self.assertEqual(new['extensions'][BRIDGE]['baseColorRGB'],old['baseColor'])
            self.assertEqual(new['roughness'],old['roughness'])
            for k,v in old.items():
                if k not in ('baseColor','metallic','kind'):self.assertEqual(new[k],v)
        canonical.write_text(json.dumps(result))
        print(self.run_node(src,report,'--verify',canonical).stdout.strip())
        evidence=json.loads(report.read_text());self.assertTrue(evidence['passed'])
        self.assertEqual(evidence['components'],len(source['componentTree']))
        self.assertGreater(evidence['totalVertices'],len(source['componentTree'])*8)
        # Unmodified canonical strict validator must not admit migration placeholders.
        proc=subprocess.run([sys.executable,str(ROOT/'pipeline/forge/stage2_spec/validate_sculpt_spec.py'),
                             str(canonical),'--strict-quality','--json'],capture_output=True,text=True,timeout=30)
        self.assertEqual(proc.returncode,1,proc.stderr)
        validation=json.loads(proc.stdout);self.assertFalse(validation['ok'])
        self.assertTrue(any('unassessed' in e or 'quality' in e for e in validation['errors']))
        self.assertEqual(result['qualityContract']['qualityBar'],'unassessed')
        self.assertEqual(result['preSpecAssessment']['anatomy'],{'status':'unassessed'})
        self.assertEqual(result['referenceCamera'],{'status':'unassessed','solved':False})
        self.assertFalse(result['extensions'][BRIDGE]['productionReady'])
        return result,exported

    def test_simple_nonzero_hierarchy_all_recipes(self):
        self.exercise(fixture(),'simple')

    def test_full_existing_female_fixture_read_only(self):
        path=ROOT/'viewer/models/female-tactical/spec.json'
        raw=path.read_bytes();source=json.loads(raw)
        result,_=self.exercise(source,'female')
        self.assertEqual(path.read_bytes(),raw,'actual female fixture must remain untouched')
        self.assertEqual(len(result['componentTree']),len(source['componentTree']))
        self.assertEqual(len(result['materials']),len(source['materials']))
        print('female source SHA256',hashlib.sha256(raw).hexdigest())

    def test_recipe_only_and_genuine_assessment_passthrough(self):
        source=fixture();result=import_spec(source)
        for c in result['componentTree']:
            self.assertNotIn('nativeVertexData',c['geometryDescriptor'])
            self.assertFalse(c['geometryDescriptor']['extensions'][BRIDGE]['allowPrimitiveFallback'])
        supplied={'referenceCamera':{'solved':True,'evidenceRef':'caller-owned-camera-evidence'}}
        result=import_spec(source,assessment=supplied)
        self.assertEqual(result['referenceCamera'],supplied['referenceCamera'])
        self.assertFalse(result['extensions'][BRIDGE]['productionReady'])
        self.assertEqual(result['extensions'][BRIDGE]['assessmentStatus'],'caller-supplied-not-validated')
        with self.assertRaises(ValueError):import_spec(source,assessment={'componentTree':[]})

    def test_native_contract_rejects_corrupt_or_wrong_space_buffers(self):
        valid={'version':1,'coordinateSystem':{'handedness':'right','up':'Y','units':'m'},
               'space':'component-local','dimensionsBaked':True,'transformBaked':False,
               'winding':'CCW-normal-consistent','positions':[0,0,0,1,0,0,0,1,0],
               'normals':[0,0,1]*3,'uvs':[],'indices':[0,1,2],'windingFlippedTriangles':[]}
        validate_native(valid)
        for field,value in [('positions',[0,0]),('normals',[0,0,1]),('indices',[0,1,3]),
                            ('uvs',[0]),('transformBaked',True),('space','world'),
                            ('windingFlippedTriangles',[1])]:
            bad=copy.deepcopy(valid);bad[field]=value
            with self.assertRaises(ValueError,msg=field):validate_native(bad)

    def test_fail_closed_inputs_and_stale_native_data(self):
        for mutation in ('cycle','parent','kind','units','nan'):
            s=fixture()
            if mutation=='cycle':s['componentTree'][-1]['parent']='round'
            if mutation=='parent':s['componentTree'][0]['parent']='absent'
            if mutation=='kind':s['componentTree'][0]['geometry']['kind']='unknown'
            if mutation=='units':s['coordinateFrame']['units']='cm'
            if mutation=='nan':s['componentTree'][0]['transform']['position'][0]=float('nan')
            with self.assertRaises(ValueError,msg=mutation):import_spec(s)
        with self.assertRaises(ValueError):import_spec(fixture(),{'format':'legacy-procedural-export','version':1,'source':{},'components':[]})


if __name__=='__main__':unittest.main()
