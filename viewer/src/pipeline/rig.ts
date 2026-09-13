import { Bone, Skeleton, Matrix, Quaternion, Mesh, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import { resourceOwner } from './resources';
import { MeshData, Attribute, convertMatrix, convertQuaternion, quaternionXYZ, applyMeshData } from './meshData';
export function computeVertexWeights(p: Vector3, bones: any[]) { const scored = bones.map((b, i) => { const a = Vector3.FromArray(b.jointPos), ab = Vector3.FromArray(b.tipPos).subtract(a), len = ab.lengthSquared(), t = len > 1e-12 ? Math.max(0, Math.min(1, Vector3.Dot(p.subtract(a), ab) / len)) : 0, d = Vector3.Distance(p, a.add(ab.scale(t))), u = d / b.envelope, w = Math.max(0, 1 - u * u) ** 2; return { i, d, w }; }); scored.sort((a, b) => b.w - a.w); const kept = scored.slice(0, 4), total = kept.reduce((s, b) => s + b.w, 0), indices = [0, 0, 0, 0], weights = [0, 0, 0, 0]; if (total > 0)
    kept.forEach((b, i) => { indices[i] = b.i; weights[i] = b.w / total; });
else {
    scored.sort((a, b) => a.d - b.d);
    indices[0] = scored[0].i;
    weights[0] = 1;
} return { indices, weights, fallback: total === 0 }; }
export function bindRig(root: TransformNode, boneSpecs: any[], components: any[], nodes: Record<string, TransformNode>, meshes: Record<string, Mesh>, data: Record<string, MeshData>) {
    if (!boneSpecs.length)
        throw Error('Cannot bind an empty skeleton');
    const scene = root.getScene(), skeleton = new Skeleton(root.name + ' skeleton', root.name + ' skeleton', scene), bones: Record<string, Bone> = {}, byId = new Map(boneSpecs.map(b => [b.id, b]));
    resourceOwner(root)?.skeleton(skeleton);
    for (const [i, b] of boneSpecs.entries()) {
        const parent = b.parent ? bones[b.parent] : null;
        if (b.parent && !parent)
            throw Error(`Bone ${b.id} parent must precede child`);
        const parentPos = b.parent ? byId.get(b.parent).jointPos : [0, 0, 0], offset = b.jointPos.map((v: number, j: number) => v - parentPos[j]);
        const rest = convertMatrix(Matrix.Translation(...offset as [
            number,
            number,
            number
        ]), scene);
        bones[b.id] = new Bone(b.id, skeleton, parent, rest, rest, rest, i);
    }
    const componentMap = new Map(components.map(c => [c.id, c])), posed = boneSpecs.map(b => ({ bone: b, c: componentMap.get(b.component ?? b.id) })).filter(({ c }) => c?.transform?.rotation?.some((v: number) => Math.abs(v) > 1e-9));
    for (const { c } of posed)
        nodes[c.id].rotationQuaternion = Quaternion.Identity();
    const bound: string[] = [];
    let fallbackCount = 0;
    for (const b of boneSpecs) {
        const id = b.component ?? b.id, mesh = meshes[id], g = data[id];
        if (!mesh || !g)
            continue;
        mesh.computeWorldMatrix(true);
        g.applyMatrix4(convertMatrix(mesh.getWorldMatrix().multiply(root.computeWorldMatrix(true).clone().invert()), scene));
        mesh.parent = root;
        mesh.position.setAll(0);
        mesh.rotationQuaternion = Quaternion.Identity();
        mesh.scaling.setAll(1);
        mesh.computeWorldMatrix(true);
        const p = g.attributes.position, indices: number[] = [], weights: number[] = [];
        for (let i = 0; i < p.count; i++) {
            const w = computeVertexWeights(new Vector3(p.getX(i), p.getY(i), p.getZ(i)), boneSpecs);
            indices.push(...w.indices);
            weights.push(...w.weights);
            if (w.fallback)
                fallbackCount++;
        }
        g.setAttribute('skinIndex', new Attribute(indices, 4)).setAttribute('skinWeight', new Attribute(weights, 4));
        applyMeshData(g, mesh);
        mesh.skeleton = skeleton;
        mesh.numBoneInfluencers = 4;
        mesh.alwaysSelectAsActiveMesh = true;
        bound.push(id);
    }
    for (const { bone, c } of posed) {
        const q = convertQuaternion(quaternionXYZ(c.transform.rotation), scene);
        nodes[c.id].rotationQuaternion = q;
        bones[bone.id].setRotationQuaternion(q);
    }
    skeleton.prepare(true);
    const result = { bones, skeleton, boneOrder: boneSpecs.map(b => b.id), boneIndexOf: new Map(boneSpecs.map((b, i) => [b.id, i])), skinAttributes: bound, bound: bound.length > 0 && bound.length === boneSpecs.filter(b => meshes[b.component ?? b.id]).length, fallbackCount, frustumCulled: false };
    root.metadata.rig = result;
    return result;
}
/** Evaluate actual Babylon palette matrices for headless deformation evidence (does not mutate mesh). */
export function skinPosition(mesh: Mesh, index: number) { if (!mesh.skeleton)
    throw Error('Mesh has no skeleton'); mesh.skeleton.prepare(true); const p = mesh.getVerticesData(VertexBuffer.PositionKind)!, ii = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!, ww = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!, palette = mesh.skeleton.getTransformMatrices(mesh), result = Vector3.Zero(), v = Vector3.FromArray(p, index * 3); for (let slot = 0; slot < 4; slot++) {
    const w = ww[index * 4 + slot];
    if (w)
        result.addInPlace(Vector3.TransformCoordinates(v, Matrix.FromArray(palette, ii[index * 4 + slot] * 16)).scale(w));
} return result; }
