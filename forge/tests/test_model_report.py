import copy
import unittest


def make_spec():
    return {
        'targetName': 'synthetic-loft',
        'componentTree': [
            {
                'id': 'body', 'name': 'body', 'parent': None, 'group': 'core',
                'transform': {'scale': [1, 1, 1]},
                'dimensions': {'w': 0.2, 'h': 0.5, 'd': 0.2},
                'geometry': {'kind': 'loft', 'segments': 8,
                             'rings': [[0.0, 0.1, 0.1], [0.5, 0.08, 0.08]]},
                'optimization': {'parameterPath': 'components.body'},
            },
            {
                'id': 'hat', 'name': 'hat', 'parent': 'body', 'group': 'top',
                'transform': {'scale': [1, 1, 1]},
                'dimensions': {'w': 0.1, 'h': 0.05, 'd': 0.1},
                'geometry': {'kind': 'box'},
                'optimization': {'parameterPath': 'components.hat'},
            },
        ],
    }


def make_manifest():
    return {
        'modelId': 'synthetic-loft',
        'groups': [
            {'id': 'core', 'name': 'Core', 'componentIds': ['body'], 'anchors': []},
            {'id': 'top', 'name': 'Top', 'componentIds': ['hat'], 'anchors': ['body']},
        ],
        'optimizationPath': [
            {'id': 't1', 'groups': ['core'], 'dependsOn': [],
             'acceptance': 'body silhouette matches', 'edit': ['components.body.rings']},
            {'id': 't2', 'groups': ['top'], 'dependsOn': ['t1'],
             'acceptance': 'hat sits on body', 'edit': ['components.hat.transform']},
        ],
    }


class ReportTest(unittest.TestCase):
    def setUp(self):
        self.spec = make_spec()
        self.manifest = make_manifest()

    def test_manifest_covers_every_component_once(self):
        from forge.model_report import validate
        self.assertEqual(validate(self.spec, self.manifest), [])
        altered = copy.deepcopy(self.manifest)
        altered['groups'][0]['componentIds'].append('not-a-part')
        self.assertTrue(validate(self.spec, altered))

    def test_missing_and_duplicate_parts_rejected(self):
        from forge.model_report import validate
        altered = copy.deepcopy(self.manifest)
        altered['groups'][0]['componentIds'].pop()
        self.assertTrue(validate(self.spec, altered))
        altered = copy.deepcopy(self.manifest)
        altered['groups'][1]['componentIds'].append('body')
        self.assertTrue(validate(self.spec, altered))

    def test_unknown_dependency_and_geometry_rejected(self):
        from forge.model_report import validate
        altered = copy.deepcopy(self.manifest)
        altered['optimizationPath'][0]['dependsOn'].append('missing-ticket')
        self.assertTrue(validate(self.spec, altered))
        bad = copy.deepcopy(self.spec)
        bad['componentTree'][0]['geometry']['rings'][1][0] = -1  # heights must increase
        self.assertTrue(validate(bad, self.manifest))
