import json,tempfile,unittest
from pathlib import Path
from forge._shared.workflow_state import new_state,sync_from_spec,save_state,load_state,status_payload
from forge.babylon import main,start_round

class NativeWorkflowTest(unittest.TestCase):
 def test_legacy_total_survives_import_and_new_round(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp); model=root/'model';model.mkdir();ref=root/'ref.png';ref.write_bytes(b'ref')
   spec=model/'canonical.json';spec.write_text(json.dumps({'targetName':'female-tactical','reviewHistory':[]}))
   legacy=root/'legacy.json';legacy.write_text(json.dumps({'model':'female-tactical','corrections':{'total':15},'iterationRound':{'index':3,'corrections':5,'limit':6}}))
   state_path=root/'workflow.json'
   self.assertEqual(main(['init','--state',str(state_path),'--reference',str(ref),'--spec',str(spec),'--legacy-state',str(legacy)]),0)
   state=load_state(state_path);sync_from_spec(state,{'reviewHistory':[]},'blockout')
   self.assertEqual(state['loops']['total'],15);self.assertEqual(state['iterationRound']['corrections'],5)
   state=start_round(state_path,model,'User-authorized complete pipeline refinement')
   self.assertEqual(state['iterationRound']['startTotal'],15);self.assertEqual(state['iterationRound']['index'],4)
   sync_from_spec(state,{'reviewHistory':[{'passId':'blockout','action':'refine-spec'}]},'blockout')
   self.assertEqual(state['loops']['total'],16);self.assertEqual(state['iterationRound']['corrections'],1)
 def test_six_per_round_not_lifetime(self):
  state=new_state('reference.png',max_per_pass=6,max_total=6)
  state.update(engine='babylon',iterationRound={'index':2,'startTotal':12,'corrections':0,'limit':6})
  history=[{'passId':'form-refinement','action':'refine-spec'} for _ in range(17)]
  sync_from_spec(state,{'reviewHistory':history},'form-refinement')
  self.assertEqual(state['status'],'active');self.assertEqual(state['iterationRound']['corrections'],5)
  history.append({'passId':'form-refinement','action':'refine-code'})
  sync_from_spec(state,{'reviewHistory':history},'form-refinement')
  self.assertEqual(state['status'],'stopped');self.assertEqual(state['iterationRound']['corrections'],6)
 def test_native_command_route_and_real_evidence(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);ref=root/'ref.png';ref.write_bytes(b'reference');state=root/'state.json';spec=root/'spec.json'
   self.assertEqual(main(['init','--state',str(state),'--reference',str(ref),'--spec',str(spec)]),0)
   self.assertEqual(main(['mark','image-analysis','--state',str(state),'--evidence',str(root/'absent.md')]),2)
   evidence=root/'analysis.md';evidence.write_text('Measured image analysis')
   self.assertEqual(main(['mark','image-analysis','--state',str(state),'--evidence',str(evidence)]),0)
   loaded=load_state(state)
   for item in loaded['checklist']:
    if item['scope']=='setup':item['status']='done'
   loaded['currentPass']='blockout'
   self.assertIn('pipeline/forge/stage3_build/generate_babylon_factory.py',status_payload(loaded)['nextCommand'])
 def test_new_round_snapshots_model_without_erasing_rejections(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);model=root/'model';model.mkdir();(model/'spec.json').write_text('{"modelId":"same"}')
   spec=root/'canonical.json';spec.write_text(json.dumps({'reviewHistory':[{'action':'refine-code'}]*20}))
   state=new_state('ref.png',spec=str(spec));state.update(engine='babylon',iterationRound={'index':3,'startTotal':14,'corrections':6,'limit':6},status='stopped',stopReason='max-round-correction-loops-reached:3:6/6')
   state_path=root/'workflow.json';save_state(state_path,state)
   result=start_round(state_path,model,'Authorized face/body refinement')
   self.assertEqual(result['iterationRound']['startTotal'],20)
   self.assertEqual(result['iterationRound']['index'],4)
   self.assertTrue((root/'rounds/round-003/model/spec.json').is_file())
   self.assertEqual(len(json.loads(spec.read_text())['reviewHistory']),20)
   self.assertEqual(result['roundHistory'][0]['corrections'],6)
