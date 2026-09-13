import copy
import json
import unittest
from pathlib import Path


class ReportTest(unittest.TestCase):
    def setUp(self):
        base=Path(__file__).resolve().parents[2] / 'viewer/models/female-tactical'
        self.spec=json.loads((base/'spec.json').read_text())
        self.manifest=json.loads((base/'iteration.json').read_text())

    def test_manifest_covers_every_component_once(self):
        from forge.model_report import validate
        self.assertEqual(validate(self.spec,self.manifest),[])
        altered=copy.deepcopy(self.manifest)
        altered['groups'][0]['componentIds'].append('not-a-part')
        self.assertTrue(validate(self.spec,altered))

    def test_missing_and_duplicate_parts_rejected(self):
        from forge.model_report import validate
        altered=copy.deepcopy(self.manifest)
        altered['groups'][0]['componentIds'].pop()
        self.assertTrue(validate(self.spec,altered))
        altered=copy.deepcopy(self.manifest)
        altered['groups'][1]['componentIds'].append(altered['groups'][0]['componentIds'][0])
        self.assertTrue(validate(self.spec,altered))

    def test_unknown_dependency_and_geometry_rejected(self):
        from forge.model_report import validate
        altered=copy.deepcopy(self.manifest)
        altered['optimizationPath'][0]['dependsOn'].append('missing-ticket')
        self.assertTrue(validate(self.spec,altered))
        bad=copy.deepcopy(self.spec)
        bad['componentTree'][0]['geometry']['rings'][1][0]=-1
        self.assertTrue(validate(bad,self.manifest))
