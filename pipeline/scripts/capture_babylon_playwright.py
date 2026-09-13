#!/usr/bin/env python3
"""Optional desktop-owned Babylon capture adapter. Does not install dependencies.

Importing or --help never launches a browser. Native core remains Python stdlib.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "forge/stage4_review"))
from babylon_render_bridge import (  # noqa: E402
    PASS_IDS, find_capture, manifest_path, read_manifest, write_manifest,
    record_capture, record_reference_capture, record_capture_pass, validate_manifest, sha256, portable_path,
)


def preflight(path: Path, capture_ids: list[str], mode: str, solver_camera: dict | None = None) -> dict:
    result = validate_manifest(path)
    if not result['passed']:
        raise ValueError('native capture preflight failed: ' + '; '.join(result['errors']))
    manifest = read_manifest(path)
    if mode == 'reference' and (manifest['reference'].get('kind') != 'glb' or not manifest['reference'].get('browserUrl')):
        raise ValueError('reference mode requires GLB reference.browserUrl')
    if solver_camera:
        descriptor = solver_camera.get('referenceCamera', solver_camera)
        width, height = descriptor.get('imageWidth'), descriptor.get('imageHeight')
        if width is not None or height is not None:
            if type(width) is not int or type(height) is not int or min(width,height) <= 0:
                raise ValueError('solver image dimensions must be positive integers')
            if manifest.get('renderProfile') and manifest['runtime']['viewport'] != [width,height]:
                raise ValueError('solver image dimensions must match the shared render-profile viewport')
            manifest['runtime']['viewport'] = [width,height]
    for capture_id in capture_ids or [c['id'] for c in manifest['captures']]:
        spec = find_capture(manifest, capture_id)
        if solver_camera or any(k in spec for k in ('referenceCamera','cameraParameters','orientation')):
            continue
        if not any(k in spec for k in ('distance', 'radius', 'position')) or ('fovDegrees' not in spec and spec.get('projection') != 'orthographic'):
            raise ValueError(f'{capture_id}: explicit distance/radius/position and fovDegrees required; no implicit viewer framing')
    return manifest


def capture(manifest_path_value: Path, capture_ids: list[str], headed: bool, timeout_ms: int, mode: str, requested_passes: list[str] | None = None, solver_camera_path: Path | None = None) -> dict:
    solver_camera = json.loads(solver_camera_path.read_text()) if solver_camera_path else None
    if solver_camera is not None and not isinstance(solver_camera, dict):
        raise ValueError('solver camera must be a JSON object')
    manifest = preflight(manifest_path_value, capture_ids, mode, solver_camera)
    if solver_camera_path:
        manifest['solverCamera'] = {'path':portable_path(manifest_path_value,solver_camera_path),'sha256':sha256(solver_camera_path),'coordinateFrame':'source-rh','convention':'stage1-pitch-yaw-roll'}
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError('Playwright unavailable; no installation attempted. Desktop owner must provide saved browser evidence.') from exc
    requested_passes = list(dict.fromkeys(['beauty'] + (requested_passes or [])))
    if any(p not in PASS_IDS for p in requested_passes):
        raise ValueError('unsupported native pass requested')
    runtime = manifest['runtime']
    selected = capture_ids or [c['id'] for c in manifest['captures']]
    errors: list[str] = []
    browser_info = {'adapter': 'playwright', 'browser': 'chromium', 'headless': not headed, 'engine': 'Babylon.Engine'}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not headed)
        try:
            width, height = runtime['viewport']
            context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=runtime['devicePixelRatio'])
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
            page.goto(runtime['url'], wait_until='domcontentloaded', timeout=timeout_ms)
            page.wait_for_function('() => window.__IMG2BABYLON_READY__ === true', timeout=timeout_ms)
            async_pass = '''async ({passId, mode}) => {
                const api = window.__IMG2BABYLON_CAPTURE__;
                if (typeof api?.capturePass !== 'function') throw new Error('native capturePass missing');
                const result = await api.capturePass({passId, mode});
                if (result?.ok !== true || result.passId !== passId) throw new Error(result?.reason || 'pass acknowledgement invalid');
                for(let i=0;i<2;i++) await new Promise(requestAnimationFrame);
                return result;
            }'''
            page.evaluate("() => window.__IMG2BABYLON_CAPTURE__.beginCapture()")
            try:
                if manifest.get('renderProfile'):
                    profile = json.loads(manifest_path(manifest_path_value, manifest['renderProfile']['path']).read_text())
                    page.evaluate("async p => await window.__IMG2BABYLON_CAPTURE__.setRenderProfile(p)", profile)
                if mode == 'reference':
                    ref=manifest['reference']
                    page.evaluate("async r => await window.__IMG2BABYLON_CAPTURE__.setReferenceMode(r)", {'kind':'glb','url':ref['browserUrl'],'sha256':ref['sha256']})
                for capture_id in selected:
                    spec = find_capture(manifest, capture_id)
                    camera_snapshot = page.evaluate('''async spec => {
                        const api = window.__IMG2BABYLON_CAPTURE__;
                        if (typeof api?.setCamera !== 'function') throw new Error('native setCamera missing');
                        await api.setCamera(spec);
                        return {requested: spec};
                    }''', solver_camera or spec)
                    pass_ids = PASS_IDS if manifest.get('fidelityTrack') == 'glb-mediated-v2' else requested_passes
                    for pass_id in pass_ids:
                        result = page.evaluate(async_pass, {'passId':pass_id,'mode':mode})
                        selector = result.get('selector', 'canvas')
                        canvas = page.locator(selector)
                        if canvas.count() != 1:
                            raise RuntimeError('capture selector must identify exactly one canvas')
                        dimensions = canvas.evaluate('(c) => c.tagName === "CANVAS" ? {width: c.width, height: c.height} : null')
                        if not dimensions or min(dimensions.values()) <= 0:
                            raise RuntimeError('Babylon canvas is absent or empty')
                        target = spec['reference'] if mode == 'reference' else spec
                        output = manifest_path(manifest_path_value, target['path'] if pass_id == 'beauty' else target['passes'][pass_id]['path'])
                        output.parent.mkdir(parents=True, exist_ok=True)
                        canvas.screenshot(path=str(output))
                        ready = page.evaluate('() => window.__IMG2BABYLON_READY__')
                        if pass_id == 'beauty':
                            if mode == 'reference':
                                record_reference_capture(manifest_path_value,manifest,capture_id,output,ready,errors)
                            else:
                                record_capture(manifest_path_value, manifest, capture_id, output, ready, errors,
                                               {'canvas': dimensions, 'camera': camera_snapshot})
                        record_capture_pass(manifest_path_value, manifest, capture_id, pass_id, output,
                                            ready_signal=ready, console_errors=errors, reference=mode=='reference')
                        manifest.setdefault('evidence', {})['browser'] = browser_info
                        manifest['evidence']['consoleErrors'] = list(errors)
                        write_manifest(manifest_path_value, manifest)
                        if errors:
                            raise RuntimeError('browser errors recorded; evidence is not valid')
            finally:
                # Restoration is an operation on the scene, not merely a pass label.
                try:
                    page.evaluate(async_pass, {'passId':'beauty','mode':mode})
                finally:
                    page.evaluate("async () => { const a=window.__IMG2BABYLON_CAPTURE__; try { await a.setReferenceMode({kind:'procedural'}); a.restoreRenderProfile(); } finally { a.endCapture(); } }")
        finally:
            browser.close()
    validation = validate_manifest(manifest_path_value)
    if not validation['passed']:
        raise RuntimeError('saved evidence validation failed: ' + '; '.join(validation['errors']))
    return {'captured': selected, 'mode': mode, 'browser': browser_info, 'consoleErrors': errors}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--capture-id', action='append', default=[])
    parser.add_argument('--pass-id', choices=PASS_IDS, action='append', default=[])
    parser.add_argument('--solver-camera', type=Path, help='stage1 solver referenceCamera descriptor JSON, shared by selected captures')
    parser.add_argument('--headed', action='store_true')
    parser.add_argument('--timeout-ms', type=int, default=30000)
    parser.add_argument('--mode', choices=('procedural', 'reference'), default='procedural')
    args = parser.parse_args(argv)
    try:
        print(json.dumps(capture(args.manifest.resolve(), args.capture_id, args.headed, args.timeout_ms, args.mode, args.pass_id, args.solver_camera), indent=2))
        return 0
    except Exception as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 2

if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
