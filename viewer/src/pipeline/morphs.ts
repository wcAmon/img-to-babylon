import { resourceOwner } from './resources';
import { Mesh, MorphTarget, MorphTargetManager, VertexBuffer } from '@babylonjs/core';
/** Consume forge/stage3_build/morph_targets.py output. Deltas must correspond to the
 * final mesh vertex order, after subdivision/decimation/binding. No truncation. */
export function applyMorphSet(mesh: Mesh, set: {
    vertexCount: number;
    morphTargetsRelative: boolean;
    targets: {
        name: string;
        deltas: number[][];
        influence?: number;
    }[];
}) {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!positions || positions.length / 3 !== set.vertexCount)
        throw Error('Morph set vertex count does not match final geometry');
    if (!set.morphTargetsRelative)
        throw Error('Expected relative morph deltas from the forge');
    const names = new Set<string>();
    for (const target of set.targets) {
        if (names.has(target.name))
            throw Error('Duplicate morph target name');
        names.add(target.name);
        if (target.deltas.length !== set.vertexCount || target.deltas.some(d => d.length !== 3 || d.some(v => !Number.isFinite(v))))
            throw Error('Invalid morph deltas');
    }
    const scene = mesh.getScene(), manager = new MorphTargetManager(scene);
    resourceOwner(mesh)?.morph(manager);
    for (const target of set.targets) {
        const absolute = Array.from(positions);
        target.deltas.forEach((d, i) => { absolute[i * 3] += d[0]; absolute[i * 3 + 1] += d[1]; absolute[i * 3 + 2] += d[2] * (scene.useRightHandedSystem ? 1 : -1); });
        const morph = new MorphTarget(target.name, target.influence ?? 0, scene);
        morph.setPositions(absolute);
        manager.addTarget(morph);
    }
    mesh.morphTargetManager?.dispose();
    mesh.morphTargetManager = manager;
    resourceOwner(mesh)?.morph(manager);
    return manager;
}
