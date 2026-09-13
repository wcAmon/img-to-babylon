"""Strict production generation and owned-resource smoke integration. No gate mocks."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'pipeline/forge/stage3_build'))
import generate_babylon_factory as generator

class SmokeBabylonTests(unittest.TestCase):
 def test_strict_spec_and_production_cli(self):
  folder=ROOT/'viewer/models/pipeline-smoke';spec=json.loads((folder/'spec.json').read_text())
  self.assertEqual(generator.oracle.strict_quality_failures(spec)[2],[])
  self.assertEqual(spec['reviewHistory'],[])
  self.assertEqual(spec['sculptPipeline']['completedPasses'],[])
  self.assertEqual((folder/'generatedFactory.ts').read_text(),generator.generate(spec,'blockout'))
  with tempfile.TemporaryDirectory(prefix='test-babylon-',dir=ROOT/'viewer/src/pipeline') as temp:
   out=Path(temp)/'factory.ts'
   result=subprocess.run([sys.executable,str(Path(generator.__file__)),str(folder/'spec.json'),'--out',str(out),'--pass-id','blockout'],capture_output=True,text=True)
   self.assertEqual(result.returncode,0,result.stdout+result.stderr)
   self.assertIn('createPipelineModel(scene',out.read_text())
 def test_smoke_runtime(self): self.run_script('smoke_babylon_test.ts')
 def test_resources_runtime(self): self.run_script('resources_babylon_test.ts')
 def run_script(self,name):
  p=subprocess.run(['node','--import','tsx','scripts/'+name],cwd=ROOT/'viewer',capture_output=True,text=True)
  self.assertEqual(p.returncode,0,p.stdout+p.stderr);print(p.stdout.strip())

if __name__=='__main__':unittest.main()
