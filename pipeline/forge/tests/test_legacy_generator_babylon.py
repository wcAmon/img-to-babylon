"""Real native emitter roundtrip; explicitly internal/unassessed numerical fixture."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'pipeline/forge/stage3_build'))
import generate_babylon_factory as generator
CANONICAL=ROOT/'.img2babylon/cli/legacy-female-canonical.json'

class LegacyGeneratorTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls): cls.spec=json.loads(CANONICAL.read_text())
 def test_production_remains_blocked(self):
  with tempfile.TemporaryDirectory(dir=ROOT/'viewer/src/pipeline',prefix='test-babylon-') as temp:
   output=Path(temp)/'factory.ts'
   p=subprocess.run([sys.executable,str(Path(generator.__file__)),str(CANONICAL),'--out',str(output)],capture_output=True,text=True)
   self.assertEqual(p.returncode,2,p.stderr);self.assertIn('BLOCKED',p.stderr);self.assertFalse(output.exists())
 def test_native_validation_fails_closed(self):
  c=copy.deepcopy(self.spec['componentTree'][0]);seg=generator.oracle.segments_for_spec(self.spec)
  for edit in [lambda c:c['geometryDescriptor'].pop('nativeVertexData'),lambda c:c['geometryDescriptor']['nativeVertexData'].update(dimensionsBaked=False),lambda c:c['geometryDescriptor']['nativeVertexData']['positions'].__setitem__(0,float('nan')),lambda c:c['extensions']['babylon-sculpt-v1']['nativeTransform']['rotationQuaternion'].__setitem__(0,2)]:
   broken=copy.deepcopy(c);edit(broken)
   with self.assertRaises(ValueError):generator.geometry_expression(broken,seg)
 def test_native_precedes_archival_recipe_and_source_order(self):
  spec=copy.deepcopy(self.spec);spec['componentTree'].reverse()
  for c in spec['componentTree']:
   c['primitive']='archived-non-executable-recipe';c['dimensions']={'width':'not executable'}
   c['transform']['scale']=['archived','metadata','only'];c['attachment']={'localStart':[99,99,99]}
  with patch.object(generator.oracle,'scale_triple',side_effect=AssertionError('native scale must not execute')):
   payload,expressions=generator.prepare_payload(spec,'form-refinement')
  self.assertEqual([c['id'] for c in payload['components']],[c['id'] for c in spec['componentTree']])
  self.assertTrue(all(c['_babylon']['scale']==[1,1,1] for c in payload['components']))
  self.assertTrue(all(e.startswith('nativeVertexGeometry(') for e in expressions.values()))
 def test_125_components_through_real_emitter(self):
  immutable=[CANONICAL,ROOT/'viewer/models/female-tactical/spec.json']
  hashes=[hashlib.sha256(p.read_bytes()).hexdigest() for p in immutable]
  with tempfile.TemporaryDirectory(dir=ROOT/'viewer/src/pipeline',prefix='test-babylon-') as temp:
   out=Path(temp)/'factory.ts'
   # Only canonical intake/schema admission is bypassed in this test. Native buffer,
   # transform validation, emitter and Babylon runtime are the real production code.
   with patch.object(generator.oracle,'validate_spec',return_value=([],[])):
    out.write_text('// INTERNAL NUMERICAL FIXTURE: UNASSESSED, NOT A PRODUCTION RELEASE\n'+generator.generate(self.spec,'form-refinement','..'))
   p=subprocess.run(['node','--import','tsx','scripts/legacy_roundtrip_babylon_test.ts',str(CANONICAL),str(out)],cwd=ROOT/'viewer',capture_output=True,text=True)
   self.assertEqual(p.returncode,0,p.stdout+p.stderr);print(p.stdout.strip())
  self.assertEqual(hashes,[hashlib.sha256(p.read_bytes()).hexdigest() for p in immutable])

if __name__=='__main__':unittest.main()
