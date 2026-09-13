import { Scene } from '@babylonjs/core';
import type { ModelOptions } from '../../src/types';
import { buildSculpt } from '../../src/sculpt/buildSculpt';
import type { SculptSpec } from '../../src/sculpt/types';
import spec from './spec.json';
import iteration from './iteration.json';

export default function createFemaleTacticalModel(scene: Scene, opts: ModelOptions = {}) {
  const model=buildSculpt(scene, spec as unknown as SculptSpec, opts);
  model.root.metadata.iteration=iteration;
  return model;
}
