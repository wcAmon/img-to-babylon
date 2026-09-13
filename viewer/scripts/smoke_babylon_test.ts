/** Real strict-generated factory, native posed palette, morph and UV/PBR state; GPU shader review is separate. */
import assert from 'node:assert/strict';
import { NullEngine, Scene, PBRMaterial, Vector3, VertexBuffer, FreeCamera, Camera, Texture } from '@babylonjs/core';
import { createPipelineSmokeModel } from '../models/pipeline-smoke/createPipelineSmokeModel';
import { skinPosition } from '../src/pipeline/rig';
import { configureCamera } from '../src/pipeline/scene';
const engine = new NullEngine();
for (const rh of [true, false]) {
  const scene = new Scene(engine); scene.useRightHandedSystem = rh;
  // Babylon lazily caches the scene-owned environment BRDF; it must survive model disposal.
  new PBRMaterial('scene BRDF initialization', scene).dispose();
  const baseline = [scene.meshes.length, scene.materials.length, scene.textures.length, scene.skeletons.length, scene.morphTargetManagers.length];
  for (let cycle = 0; cycle < 3; cycle++) {
    const model = createPipelineSmokeModel(scene), rt = model.root.metadata.sculptRuntime;
    assert.deepEqual(Object.keys(rt.meshes), ['pedestal', 'beam', 'witness']);
    const beam = rt.meshes.beam, p = beam.getVerticesData(VertexBuffer.PositionKind)!;
    let maxDeformation = 0;
    for (let i = 0; i < p.length / 3; i++) {
      const v = skinPosition(beam, i); assert(Number.isFinite(v.length()));
      maxDeformation = Math.max(maxDeformation, Vector3.Distance(v, Vector3.FromArray(p, i * 3)));
    }
    assert(maxDeformation > .15 && maxDeformation < .4, `posed displacement ${maxDeformation}`);
    assert.equal(beam.skeleton.bones.length, 2);
    assert.equal(beam.morphTargetManager.numTargets, 1);
    assert.equal(beam.morphTargetManager.getTarget(0).influence, .65);
    assert(beam.morphTargetManager.getTarget(0).getPositions().some((v: number, i: number) => Math.abs(v-p[i]) > .01));
    const mat = beam.material as PBRMaterial;
    assert(mat instanceof PBRMaterial);
    assert.deepEqual(Object.keys(mat.metadata.maps), ['albedo', 'roughness', 'height', 'normal', 'ao']);
    assert.equal(new Set(Object.values(mat.metadata.maps)).size, 5);
    const plugin: any = mat.pluginManager!.getPlugin('PipelineHeightDisplacement');
    assert(plugin && plugin.amount === .006);
    assert(plugin.getCustomCode('vertex').CUSTOM_VERTEX_UPDATE_POSITION.includes('texture2D'));
    const uv = (rt.meshes.pedestal.material as PBRMaterial).albedoTexture! as Texture;
    assert.equal(uv.uScale, 4); assert.equal(uv.vScale, 2); assert.equal(uv.uOffset, .125);
    assert(uv.getTextureMatrix().asArray().every(Number.isFinite));
    const camera = configureCamera(new FreeCamera('test', Vector3.Zero(), scene), {fov: 40, near: .01, far: 10, position: [1,1,2], target: [0,.45,0]});
    assert.equal(camera.fovMode, Camera.FOVMODE_VERTICAL_FIXED); assert.equal(camera.fov, 40*Math.PI/180);
    assert(Math.abs(camera.getProjectionMatrix(true).m[5] - 1 / Math.tan(camera.fov/2)) < 1e-6);
    camera.dispose();
    // Runtime root is authoritative for resources; test independently of desktop adapter cleanup.
    model.root.dispose(); model.root.dispose();
    assert.deepEqual([scene.meshes.length, scene.materials.length, scene.textures.length, scene.skeletons.length, scene.morphTargetManagers.length], baseline);
    if (!cycle) console.log(JSON.stringify({rh, vertices: p.length/3, maxDeformation, morph: .65, maps: 5, displacement: plugin.amount}));
  }
  scene.dispose();
}
engine.dispose();
