/** Execute a newly generated native factory under NullEngine, in both handedness modes. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { NullEngine, Scene, Mesh, TransformNode, FreeCamera, Vector3 } from '@babylonjs/core';
const module = await import(pathToFileURL(resolve(process.argv[2])).href);
const entry = Object.entries(module).find(([k]) => /^create.+Model$/.test(k))?.[1] as Function;
assert(entry, 'generated factory export missing');
const engine = new NullEngine();
const runs = [];
for (const rh of [true, false]) {
    const scene = new Scene(engine);
    scene.useRightHandedSystem = rh;
    const root = entry(scene, { textureSize: 256 });
    assert(root instanceof TransformNode);
    const runtime = root.metadata.sculptRuntime;
    assert(Object.keys(runtime.meshes).length);
    for (const mesh of Object.values(runtime.meshes) as Mesh[]) {
        assert(mesh instanceof Mesh);
        assert(mesh.getTotalVertices() > 0);
        assert(mesh.getTotalIndices() > 0);
        assert(Array.from(mesh.getVerticesData('position')!).every(Number.isFinite));
        assert(mesh.material, 'material missing');
    }
    if (root.metadata.rig) {
        assert(root.metadata.rig.bound, 'rig must be bound');
        assert(root.metadata.rig.boneOrder.length > 0);
        for (const mesh of Object.values(runtime.meshes) as Mesh[])
            if (mesh.skeleton) {
                assert.equal(mesh.skeleton, root.metadata.rig.skeleton);
                const weights = mesh.getVerticesData('matricesWeights')!;
                for (let i = 0; i < weights.length; i += 4)
                    assert(Math.abs(weights[i] + weights[i + 1] + weights[i + 2] + weights[i + 3] - 1) < 1e-6);
            }
    }
    const camera = new FreeCamera('test camera', new Vector3(0, 1, rh ? 5 : -5), scene);
    camera.setTarget(Vector3.Zero());
    scene.activeCamera = camera;
    scene.render();
    runs.push({ rightHanded: rh, meshCount: Object.keys(runtime.meshes).length, vertices: Object.values(runtime.meshes).reduce((n: number, m: any) => n + m.getTotalVertices(), 0) });
    scene.dispose();
}
engine.dispose();
console.log(JSON.stringify({ status: 'PASS', runs }));
