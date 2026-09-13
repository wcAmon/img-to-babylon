"""Native capture contracts, using stdlib-generated PNGs; never browser pixels."""
import importlib.util
import json
import copy
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PIPELINE / "forge/stage4_review"))
import babylon_render_bridge as native
import render_bridge as oracle
spec = importlib.util.spec_from_file_location('native_adapter', PIPELINE / 'scripts/capture_babylon_playwright.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


def png(path, rgb=(255, 0, 0)):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\x00' + bytes(rgb) * 2) * 2)) + chunk(b'IEND', b''))


class NativeCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.reference = self.root / 'ref.png'
        self.shot = self.root / 'shot.png'
        self.path = self.root / 'manifest.json'
        png(self.reference)
        png(self.shot, (0, 255, 0))
        self.args = (self.reference, 'http://localhost:5173/#model=test', self.path, (2, 2), 1, 'captures')
        self.manifest = native.init_manifest(*self.args)

    def save(self):
        native.write_manifest(self.path, self.manifest)

    def record_all(self):
        for item in self.manifest['captures']:
            native.record_capture(self.path, self.manifest, item['id'], self.shot, True)
            native.record_capture_pass(self.path, self.manifest, item['id'], 'beauty', self.shot, ready_signal=True)
        self.save()

    def test_oracle_plan_and_hash_parity(self):
        source = oracle.init_manifest(*self.args)
        self.assertEqual(self.manifest['captures'], source['captures'])
        self.assertEqual(self.manifest['reference'], source['reference'])
        self.assertEqual(self.manifest['runtime']['readySignal'], 'window.__IMG2BABYLON_READY__')
        self.assertNotIn('threeVersion', self.manifest['runtime'])

    def test_complete_and_tamper(self):
        self.record_all()
        self.assertTrue(native.validate_manifest(self.path, True)['passed'])
        png(self.shot, (0, 0, 255))
        result = native.validate_manifest(self.path, True)
        self.assertFalse(result['passed'])
        self.assertTrue(any('hash changed' in e for e in result['errors']))

    def test_false_and_string_readiness_rejected(self):
        for value in (False, 'true', 'false', 1, None):
            with self.assertRaises(ValueError):
                native.record_capture(self.path, self.manifest, 'hero', self.shot, value)
        with self.assertRaises(ValueError):
            native.record_capture_pass(self.path, self.manifest, 'hero', 'depth', self.shot)

    def test_missing_hash_ready_and_console_evidence(self):
        self.record_all()
        hero = self.manifest['captures'][0]
        del hero['screenshotSha256']
        hero['readySignal'] = 'false'
        hero['passes']['beauty']['consoleErrors'] = ['shader failed']
        self.save()
        result = native.validate_manifest(self.path, True)
        self.assertFalse(result['passed'])
        self.assertTrue(any('screenshotSha256' in e for e in result['errors']))
        self.assertTrue(any('readySignal' in e for e in result['errors']))
        self.assertTrue(any('ready/error' in e for e in result['errors']))

    def test_explicit_camera_required_before_browser(self):
        self.save()
        with self.assertRaisesRegex(ValueError, 'explicit'):
            adapter.preflight(self.path, ['hero'], 'procedural')
        self.manifest['captures'][0].update(distance=3, fovDegrees=40)
        self.save()
        adapter.preflight(self.path, ['hero'], 'procedural')
        with self.assertRaisesRegex(ValueError, 'reference mode requires'):
            adapter.preflight(self.path, ['hero'], 'reference')

    def test_native_profile_constraints_and_hash(self):
        from validate_babylon_render_profile import validate_profile
        profile = json.loads((PIPELINE / 'docs/specs/render-profile.v2.example.json').read_text())
        self.assertTrue(validate_profile(profile)['passed'])
        for mutation in ('nan', 'palette', 'passes', 'groups', 'ortho'):
            value = copy.deepcopy(profile)
            if mutation == 'nan': value['renderer']['toneMappingExposure'] = float('nan')
            if mutation == 'palette': value['regions'][0]['idColor'] = [256, 0, 0]
            if mutation == 'passes': value['passes'].pop()
            if mutation == 'groups': value['feedbackGroups'].reverse()
            if mutation == 'ortho': value['camera']['projection'] = 'orthographic'
            self.assertFalse(validate_profile(value)['passed'], mutation)
        profile_path = self.root / 'profile.json'
        profile_path.write_text(json.dumps(profile))
        self.manifest = native.init_manifest(*self.args, render_profile=profile_path)
        self.save()
        self.assertTrue(native.validate_manifest(self.path)['passed'])
        self.assertAlmostEqual(self.manifest['captures'][0]['distance'], (4**2+.05**2)**.5)
        self.assertEqual(self.manifest['captures'][0]['target'], [0,.8,0])
        profile['renderer']['toneMappingExposure'] = 2
        profile_path.write_text(json.dumps(profile))
        self.assertTrue(any('profile hash changed' in e for e in native.validate_manifest(self.path)['errors']))

    def test_all_six_passes_required_for_v2(self):
        profile = json.loads((PIPELINE / 'docs/specs/render-profile.v2.example.json').read_text())
        path = self.root / 'profile.json'; path.write_text(json.dumps(profile))
        self.manifest = native.init_manifest(*self.args, render_profile=path)
        self.record_all()
        self.assertFalse(native.validate_manifest(self.path, True)['passed'])
        for capture in self.manifest['captures']:
            for pass_id in native.PASS_IDS:
                native.record_capture_pass(self.path,self.manifest,capture['id'],pass_id,self.shot,ready_signal=True)
        self.save()
        self.assertTrue(native.validate_manifest(self.path, True)['passed'])

    def test_glb_reference_six_pass_evidence(self):
        vertices = struct.pack('<9f',0,0,0,1,0,0,0,1,0)
        document = {'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],
                    'nodes':[{'mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}],
                    'buffers':[{'byteLength':len(vertices)}],
                    'bufferViews':[{'buffer':0,'byteLength':len(vertices)}],
                    'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3','min':[0,0,0],'max':[1,1,0]}]}
        payload = json.dumps(document).encode(); payload += b' ' * (-len(payload)%4)
        glb = self.root/'reference.glb'
        glb.write_bytes(struct.pack('<III',0x46546c67,2,28+len(payload)+len(vertices))+struct.pack('<II',len(payload),0x4e4f534a)+payload+struct.pack('<II',len(vertices),0x004e4942)+vertices)
        profile = json.loads((PIPELINE/'docs/specs/render-profile.v2.example.json').read_text())
        profile_path=self.root/'profile.json';profile_path.write_text(json.dumps(profile))
        self.manifest=native.init_manifest(None,*self.args[1:],reference_glb=glb,reference_browser_url='/reference.glb',render_profile=profile_path)
        self.save();adapter.preflight(self.path,[], 'reference')
        for c in self.manifest['captures']:
            native.record_capture(self.path,self.manifest,c['id'],self.shot,True)
            native.record_reference_capture(self.path,self.manifest,c['id'],self.shot,True)
            for pass_id in native.PASS_IDS:
                for reference in (False,True):
                    native.record_capture_pass(self.path,self.manifest,c['id'],pass_id,self.shot,reference=reference,ready_signal=True)
        self.save();self.assertTrue(native.validate_manifest(self.path,True)['passed'])
        self.manifest['captures'][0]['reference']['readySignal']=False
        self.save();self.assertFalse(native.validate_manifest(self.path,True)['passed'])

    def test_agx_and_solver_camera_contract(self):
        from validate_babylon_render_profile import validate_profile
        profile=json.loads((PIPELINE/'docs/specs/render-profile.v2.example.json').read_text())
        profile['renderer']['toneMapping']='AgXToneMapping'
        self.assertTrue(validate_profile(profile)['passed'])
        camera={'referenceCamera':{'imageWidth':640,'imageHeight':480,'fit':{'cameraParameters':{'position':[.2,.4,4],'yawDegrees':17,'pitchDegrees':-11,'rollDegrees':23,'fovDegrees':47}}}}
        self.save();result=adapter.preflight(self.path,['hero'],'procedural',camera)
        self.assertEqual(result['runtime']['viewport'],[640,480])
        source=self.root/'camera.json';source.write_text(json.dumps(camera))
        self.manifest['solverCamera']={'path':'camera.json','sha256':native.sha256(source),'coordinateFrame':'source-rh'}
        self.save();self.assertTrue(native.validate_manifest(self.path)['passed'])
        source.write_text('{}')
        self.assertTrue(any('solver camera file/hash mismatch' in e for e in native.validate_manifest(self.path)['errors']))

    def test_incomplete_and_runtime_identity(self):
        self.manifest['runtime']['readySignal'] = 'window.__IMG2THREEJS_READY__'
        self.save()
        result = native.validate_manifest(self.path, True)
        self.assertFalse(result['passed'])
        self.assertTrue(any('not recorded' in e for e in result['errors']))
        self.assertTrue(any('runtime.readySignal' in e for e in result['errors']))

if __name__ == '__main__':
    unittest.main()
