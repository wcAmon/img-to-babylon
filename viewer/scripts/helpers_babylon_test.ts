/** Run the intact upstream emitter as the numerical oracle for all custom algorithm routes. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';
import { NullEngine, Scene } from '@babylonjs/core';
const oraclePath = process.env.THREE_PARITY_MODULE ?? fileURLToPath(new URL('../../.img2babylon/cli/three-oracle/node_modules/three/build/three.module.js', import.meta.url));
const THREE = await import(pathToFileURL(oraclePath).href);
const python = process.env.BABYLON_PYTHON ?? '/opt/homebrew/bin/python3.11';
const root = resolve('..'), fixtureRoot = resolve(root, 'pipeline/forge/tests/fixtures');
const specs = ['subdivision_cage.json', 'visual_hull_two_views.json', 'implicit_character_torso_limb.json', 'stand_proud_hair_on_head.json'].map(n => JSON.parse(readFileSync(resolve(fixtureRoot, n), 'utf8')));
const base = specs[0];
specs.push({ ...base, targetName: 'PrimitiveParity', componentTree: ['box', 'sphere', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'torus', 'plane-card', 'extrude', 'ground-blade', 'lathe', 'tube', 'curve-sweep', 'tapered-sweep', 'instanced-cluster'].map((primitive, i) => ({ ...base.componentTree[0], id: `shape-${i}`, name: `shape-${i}`, primitive, geometryDescriptor: {}, transform: { position: [i * 2, 0, 0], rotation: [.1, .2, .3], scale: [.8, 1.2, .9] } })) });
const results: any[] = [];
for (const spec of specs) {
    const code = execFileSync(python, ['-c', "import sys,json;sys.path.insert(0,'../pipeline/forge/stage3_build');import generate_threejs_factory as t;import generate_babylon_factory as b;s=json.load(sys.stdin);print(json.dumps({'oracle':t.generate(s,'form-refinement'),'native':b.generate(s,'form-refinement','..')}))"], { input: JSON.stringify(spec), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    const generated = JSON.parse(code), fn = generated.oracle.match(/export function (create\w+Model)\(/)[1];
    const pure = generated.oracle.replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
    const js = ts.transpile(pure, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
    const factory = new Function('THREE', js + `;return ${fn};`)(THREE), source = factory(), temp = mkdtempSync(resolve('src/pipeline/test-babylon-'));
    try {
        const file = resolve(temp, 'factory.ts');
        writeFileSync(file, generated.native);
        const native = await import(pathToFileURL(file).href), engine = new NullEngine(), scene = new Scene(engine);
        scene.useRightHandedSystem = true;
        const root = native[fn](scene, { textureSize: 256 });
        const sourceMeshes = source.userData.sculptRuntime.meshes, nativeData = root.metadata.sculptRuntime.geometry;
        let maxError = 0;
        for (const [id, mesh] of Object.entries(sourceMeshes) as [
            string,
            any
        ][]) {
            const g = nativeData[id], s = mesh.geometry;
            assert(g, `missing ${id}`);
            const np = g.attributes.position.array, sp = s.attributes.position.array;
            // Cylinder caps intentionally share coincident centre vertices; compare surface point multisets through unique coordinates.
            const points = (a: ArrayLike<number>) => Array.from({ length: a.length / 3 }, (_, i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]].map(v => Math.round(v * 1e5) / 1e5).join(',')).sort();
            if (np.length === sp.length && !['extrude', 'curve-sweep'].includes(mesh.userData.sculptComponent.primitive)) {
                for (let i = 0; i < np.length; i++)
                    maxError = Math.max(maxError, Math.abs(np[i] - sp[i]));
            }
            else if (['cylinder', 'cone', 'extrude', 'curve-sweep'].includes(mesh.userData.sculptComponent.primitive)) {
                assert.deepEqual([...new Set(points(np))], [...new Set(points(sp))], `${id} unique surface vertices`);
            }
            else
                assert.equal(np.length, sp.length, `${id} vertex count`);
            if (['extrude', 'curve-sweep'].includes(mesh.userData.sculptComponent.primitive)) {
                const uvSet = (p: ArrayLike<number>, uv: ArrayLike<number>) => [...new Set(Array.from({ length: p.length / 3 }, (_, i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2], uv[i * 2], uv[i * 2 + 1]].map(v => Math.round(v * 1e5) / 1e5).join(',')))].sort();
                assert.deepEqual(uvSet(np, g.attributes.uv.array), uvSet(sp, s.attributes.uv.array), `${id} projection UV correspondence`);
            }
            assert.equal(g.indices?.length ?? np.length / 3, s.index?.count ?? sp.length / 3, `${id} index count`);
        }
        assert(maxError < 1e-5, `${spec.targetName}: max position error ${maxError}`);
        results.push({ target: spec.targetName, meshes: Object.keys(sourceMeshes).length, maxPositionError: maxError });
        scene.dispose();
        engine.dispose();
    }
    finally {
        rmSync(temp, { recursive: true, force: true });
    }
}
console.log(JSON.stringify({ status: 'PASS', customRouteParity: results }));
