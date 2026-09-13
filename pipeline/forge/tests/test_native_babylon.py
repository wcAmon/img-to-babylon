"""Native-generator gates; stdlib only. Run with Python 3.11 from repo root."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'pipeline/forge/stage3_build'))
import generate_babylon_factory as babylon

class BabylonGeneratorTests(unittest.TestCase):
 def fixture(self,name='subdivision_cage.json'):
  return json.loads((Path(__file__).parent/'fixtures'/name).read_text())
 def test_all_fixture_factories_native(self):
  for name in ['subdivision_cage.json','visual_hull_two_views.json','implicit_character_torso_limb.json','stand_proud_hair_on_head.json']:
   spec=self.fixture(name);source=babylon.generate(spec,'form-refinement')
   self.assertIn('createPipelineModel(scene',source);self.assertNotIn('THREE.',source);self.assertNotIn("from 'three",source)
 def test_no_unknown_fallback(self):
  with self.assertRaises(ValueError):babylon.geometry_expression({'id':'no','primitive':'banana'},babylon.oracle.segments_for_spec({}))
 def test_all_valid_primitives_have_native_expression(self):
  for primitive in babylon.oracle.VALID_PRIMITIVES:
   expression=babylon.geometry_expression({'primitive':primitive},babylon.oracle.segments_for_spec({}))
   self.assertNotIn('THREE',expression)
 def test_production_gate_preserves_existing_file(self):
  spec=self.fixture();folder=ROOT/'viewer/src/pipeline'
  with tempfile.TemporaryDirectory(prefix='test-babylon-',dir=folder) as tmp:
   inp=Path(tmp)/'spec.json';out=Path(tmp)/'factory.ts';inp.write_text(json.dumps(spec));out.write_text('KEEP')
   result=subprocess.run([sys.executable,str(Path(babylon.__file__)),str(inp),'--out',str(out),'--force'],capture_output=True,text=True)
   self.assertNotEqual(result.returncode,0);self.assertEqual(out.read_text(),'KEEP');self.assertIn('BLOCKED',result.stderr)
 def test_generated_factories_execute(self):
  for name in ['subdivision_cage.json','visual_hull_two_views.json','implicit_character_torso_limb.json','stand_proud_hair_on_head.json']:
   with tempfile.TemporaryDirectory(prefix='test-babylon-',dir=ROOT/'viewer/src/pipeline') as tmp:
    out=Path(tmp)/'factory.ts';out.write_text(babylon.generate(self.fixture(name),'form-refinement','..'))
    result=subprocess.run(['node','--import','tsx','scripts/generated_babylon_test.ts',str(out)],cwd=ROOT/'viewer',capture_output=True,text=True)
    self.assertEqual(result.returncode,0,name+'\n'+result.stdout+result.stderr)
 def test_native_49_bone_character_fixture(self):
  from new_sculpt_spec import make_character_component_tree, derive_character_rig
  spec=self.fixture();spec['targetName']='RigParity';spec['componentTree']=make_character_component_tree();spec['rig']=derive_character_rig(spec['componentTree'])
  spec['performanceBudget']={'targetTriangles':6000}
  spec['preSpecAssessment']={'objectClass':{'primaryDomain':'character'},'complexity':{'tier':'simple','scores':{},'estimatedCounts':{}},'specDepthDecision':{'requiredDepth':'simple'}}
  spec['materials']=[{'id':mid,'textureless':{'declared':True,'evidence':['Synthetic fixture: flat colors isolate skinning.']}} for mid in sorted({c['material'] for c in spec['componentTree']})]
  with tempfile.TemporaryDirectory(prefix='test-babylon-',dir=ROOT/'viewer/src/pipeline') as tmp:
   out=Path(tmp)/'factory.ts';out.write_text(babylon.generate(spec,'form-refinement','..'))
   result=subprocess.run(['node','--import','tsx','scripts/generated_babylon_test.ts',str(out)],cwd=ROOT/'viewer',capture_output=True,text=True)
   self.assertEqual(result.returncode,0,result.stdout+result.stderr)
 def test_headless_runtime(self):
  result=subprocess.run(['node','--import','tsx','scripts/native_babylon_test.ts'],cwd=ROOT/'viewer',capture_output=True,text=True)
  self.assertEqual(result.returncode,0,result.stdout+result.stderr)

if __name__=='__main__':unittest.main()
