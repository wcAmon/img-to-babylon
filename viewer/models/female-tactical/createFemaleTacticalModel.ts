import { Scene } from '@babylonjs/core';
import type { ModelOptions } from '../../src/types';
import type { SculptSpec } from '../../src/sculpt/types';
import { adaptPipelineModel } from '../../src/pipelineAdapter';
import { createFemaleTacticalModel as createNative } from './createNativeFemaleTactical';
import spec from './spec.json';
import iteration from './iteration.json';

/** Same registered identity. Canonical native factory owns all rendered geometry. */
export default function createFemaleTacticalModel(scene: Scene, opts: ModelOptions = {}) {
  const root = createNative(scene);
  return adaptPipelineModel(scene, root, {
    physics: opts.physics,
    physicsSpec: spec as unknown as SculptSpec,
    inspectorSpec: spec as unknown as SculptSpec,
    iteration: { ...iteration, nativeRound: 4, nativePass: 'blockout', visualStatus: 'awaiting-desktop-capture' },
  });
}
