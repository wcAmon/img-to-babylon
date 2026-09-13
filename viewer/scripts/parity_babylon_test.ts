/** Numerical comparison against an installed Three parity oracle. No browser, no Three in production.
 * THREE_PARITY_MODULE=/path/to/three/build/three.module.js node --import tsx scripts/parity_babylon_test.ts */
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as P from '../src/pipeline/primitives';
import { MeshData } from '../src/pipeline/meshData';
const modulePath = process.env.THREE_PARITY_MODULE ?? fileURLToPath(new URL('../../.img2babylon/cli/three-oracle/node_modules/three/build/three.module.js', import.meta.url));
const T = await import(pathToFileURL(modulePath).href);
const arrayClose = (a: ArrayLike<number>, b: ArrayLike<number>, label: string, eps = 1e-5) => { assert.equal(a.length, b.length, label + ' length'); let max = 0; for (let i = 0; i < a.length; i++)
    max = Math.max(max, Math.abs(a[i] - b[i])); assert(max < eps, `${label} max error ${max}`); return max; };
const fixtures: any[] = [['box', P.boxGeometry(1, 2, 3, 2, 2, 2), new T.BoxGeometry(1, 2, 3, 2, 2, 2)], ['sphere', P.sphereGeometry(.5, 24, 16), new T.SphereGeometry(.5, 24, 16)], ['plane', P.planeGeometry(1, 2, 3, 4), new T.PlaneGeometry(1, 2, 3, 4)], ['torus', P.torusGeometry(.45, .08, 12, 32), new T.TorusGeometry(.45, .08, 12, 32)], ['lathe', P.buildLatheGeometry({ points: [[.1, -.5], [.3, 0], [.2, .5]], segments: 24 }), new T.LatheGeometry([new T.Vector2(.1, -.5), new T.Vector2(.3, 0), new T.Vector2(.2, .5)], 24)]];
const points = [[0, -.5, 0], [.2, 0, .15], [-.1, .4, .2], [.3, .7, 0]];
fixtures.push(['tube', P.buildTubeGeometry({ points }), new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v => new T.Vector3(...v))), 24, .05, 8, false)]);
const result: any = {};
for (const [name, native, source] of fixtures) {
    result[name] = {};
    for (const key of ['position', 'uv'])
        result[name][key] = arrayClose(native.attributes[key].array, source.attributes[key].array, `${name} ${key}`);
    result[name].normal = arrayClose(native.attributes.normal.array, source.attributes.normal.array, `${name} normal`, 1e-4);
    assert.equal(native.indices.length, source.index.count, `${name} triangle count`);
}
// Real object conversion parity, including a non-identity bind matrix and mesh hierarchy.
import { NullEngine, Scene, Vector3, Matrix, VertexBuffer } from '@babylonjs/core';
import { convertThreeObject, convertTexture } from '../src/pipeline/objectConversion';
import { skinPosition } from '../src/pipeline/rig';
const engine = new NullEngine();
for (const rh of [true, false]) {
    const scene = new Scene(engine);
    scene.useRightHandedSystem = rh;
    const group = new T.Group();
    group.position.set(.2, .3, -.4);
    group.rotation.set(.3, .6, -.2);
    const mesh = new T.Mesh(new T.BoxGeometry(.2, .3, .4), new T.MeshPhysicalMaterial({ color: '#234567', roughness: .33, metalness: .37, clearcoat: .4 }));
    mesh.position.set(.1, .7, .2);
    mesh.rotation.set(.2, -.1, .5);
    group.add(mesh);
    group.updateMatrixWorld(true);
    const { nodes } = convertThreeObject(group, scene);
    const native = nodes.get(mesh)!;
    native.computeWorldMatrix(true);
    const threePoint = new T.Vector3(.1, .2, .3).applyMatrix4(mesh.matrixWorld), nativePoint = Vector3.TransformCoordinates(new Vector3(.1, .2, rh ? .3 : -.3), native.getWorldMatrix());
    arrayClose(nativePoint.asArray(), [threePoint.x, threePoint.y, threePoint.z * (rh ? 1 : -1)], 'hierarchy');
    const mat = (native as any).material;
    arrayClose(mat.albedoColor.asArray(), mesh.material.color.toArray(), 'linear color');
    assert.equal(mat.metallic, .37);
    const tex = new T.DataTexture(new Uint8Array([128, 64, 32, 255]), 1, 1);
    tex.repeat.set(2, 3);
    tex.offset.set(.2, -.1);
    tex.center.set(.4, .3);
    tex.rotation = .6;
    tex.updateMatrix();
    const nt = convertTexture(tex, scene)!;
    const uv3 = new T.Vector2(.13, .71).applyMatrix3(tex.matrix), uvb = Vector3.TransformCoordinates(new Vector3(.13, .71, 1), nt.getTextureMatrix());
    arrayClose([uvb.x, uvb.y], [uv3.x, uv3.y], 'texture matrix');
    const parent = new T.Group(), bone = new T.Bone();
    bone.position.set(0, 1, 0);
    parent.add(bone);
    const geom = new T.BufferGeometry();
    geom.setAttribute('position', new T.Float32BufferAttribute([0, 1, 0, .1, 1, 0, 0, .9, .1], 3));
    geom.setIndex([0, 1, 2]);
    geom.computeVertexNormals();
    geom.setAttribute('skinIndex', new T.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geom.setAttribute('skinWeight', new T.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const skin = new T.SkinnedMesh(geom, new T.MeshStandardMaterial());
    skin.position.set(.25, 0, .1);
    parent.add(skin);
    parent.updateMatrixWorld(true);
    const sk = new T.Skeleton([bone]);
    skin.bind(sk, skin.matrixWorld);
    bone.rotation.x = Math.PI / 3;
    parent.updateMatrixWorld(true);
    sk.update();
    const expected = skin.getVertexPosition(0, new T.Vector3());
    const converted = convertThreeObject(parent, scene).nodes.get(skin) as any;
    const actual = skinPosition(converted, 0);
    arrayClose(actual.asArray(), [expected.x, expected.y, expected.z * (rh ? 1 : -1)], 'converted bind palette');
    scene.dispose();
}
engine.dispose();
console.log(JSON.stringify({ status: 'PASS', numericalMaxErrors: result, objectConversion: ['noncommuting hierarchy', 'linear PBR color and fractional metalness', 'nonidentity bind matrix', 'posed skinning', 'RH and LH'] }));
