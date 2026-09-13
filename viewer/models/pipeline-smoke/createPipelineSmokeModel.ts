/** Reference-free native engineering specimen. No character intake or review bypass. */
import { PBRMaterial, Quaternion, RawTexture, Texture, Vector3, VertexBuffer } from '@babylonjs/core';
import type { ModelFactory } from '../../src/types';
import { adaptPipelineModel } from '../../src/pipelineAdapter';
import { bindRig } from '../../src/pipeline/rig';
import { applyMorphSet } from '../../src/pipeline/morphs';
import { convertQuaternion } from '../../src/pipeline/meshData';
import { createPipelineSmokeModel as createGenerated, sculptSpec } from './generatedFactory';

export const createPipelineSmokeModel: ModelFactory = (scene, options = {}) => {
  const root = createGenerated(scene, { ...options, textureSize: 256, qualityPriority: 'balanced' });
  try {
    const rt = root.metadata.sculptRuntime;
    // An explicitly authored two-bone mechanism on generated object geometry, not a claimed character rig.
    const rig = bindRig(root, [
      { id: 'base', parent: null, component: 'beam', jointPos: [0,.12,0], tipPos: [0,.52,0], envelope: .3 },
      { id: 'bend', parent: 'base', component: '__no_mesh', jointPos: [0,.52,0], tipPos: [0,.92,0], envelope: .3 },
    ], sculptSpec.componentTree, rt.nodes, rt.meshes, rt.geometry);
    rig.bones.bend.setRotationQuaternion(convertQuaternion(Quaternion.RotationAxis(Vector3.Forward(), 35 * Math.PI / 180), scene));
    rig.skeleton.prepare(true);
    const beam = rt.meshes.beam, positions = beam.getVerticesData(VertexBuffer.PositionKind)!;
    const deltas = Array.from({ length: positions.length / 3 }, (_, i) => {
      const t = Math.max(0, Math.min(1, (positions[3*i+1] - .12) / .8));
      return [.025 * t * t, 0, 0];
    });
    applyMorphSet(beam, { vertexCount: deltas.length, morphTargetsRelative: true, targets: [{ name: 'tip-offset', influence: .65, deltas }] });
    // Project a checker through the box's authored UVs; this tests the texture matrix, not photo projection.
    const checker = rt.ownedResources.texture(RawTexture.CreateRGBATexture(new Uint8Array([
      240,240,240,255, 25,50,80,255, 25,50,80,255, 240,240,240,255,
    ]), 2, 2, scene, false, true, Texture.NEAREST_SAMPLINGMODE));
    checker.name = 'smoke:uv-projection-checker'; checker.gammaSpace = true;
    checker.uScale = 4; checker.vScale = 2; checker.uOffset = .125; checker.wAng = Math.PI / 8;
    (rt.meshes.pedestal.material as PBRMaterial).albedoTexture = checker;
    root.metadata.smoke = { source: 'authored engineering design', boneBendDegrees: 35, morphInfluence: .65, projection: 'UV checker with scale, offset and rotation', visualReview: 'pending' };
    return adaptPipelineModel(scene, root, { physics: false });
  } catch (error) { root.dispose(); throw error; }
};
export default createPipelineSmokeModel;
