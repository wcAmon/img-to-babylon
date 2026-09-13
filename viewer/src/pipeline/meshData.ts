import { resourceOwner } from './resources';
import { Matrix, Quaternion, Vector3, VertexData, VertexBuffer, Mesh, Scene, Material, MorphTarget, MorphTargetManager, SubMesh } from '@babylonjs/core';
/** CPU modelling buffer. Coordinates are metres, RH, Y up, CCW outward faces.
 * This is staging data, never a renderer object or a Three.js compatibility layer. */
export class Attribute {
    array: Float32Array;
    needsUpdate = false;
    constructor(values: ArrayLike<number>, public itemSize: number) { this.array = new Float32Array(values); }
    get count() { return this.array.length / this.itemSize; }
    getX(i: number) { return this.array[i * this.itemSize]; }
    getY(i: number) { return this.array[i * this.itemSize + 1]; }
    getZ(i: number) { return this.array[i * this.itemSize + 2]; }
    setXYZ(i: number, x: number, y: number, z: number) { this.array.set([x, y, z], i * this.itemSize); }
}
export function quaternionXYZ(v: readonly number[]): Quaternion {
    // Babylon RotationYawPitchRoll is YXZ; source Euler defaults to XYZ.
    const [x, y, z] = v.map(n => n / 2), c1 = Math.cos(x), c2 = Math.cos(y), c3 = Math.cos(z), s1 = Math.sin(x), s2 = Math.sin(y), s3 = Math.sin(z);
    return new Quaternion(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3);
}
export function convertVector(v: readonly number[], scene: Scene) { return new Vector3(v[0], v[1], v[2] * (scene.useRightHandedSystem ? 1 : -1)); }
export function convertQuaternion(q: Quaternion, scene: Scene) { return scene.useRightHandedSystem ? q.clone() : new Quaternion(-q.x, -q.y, q.z, q.w); }
export function convertMatrix(m: Matrix, scene: Scene) { const h = Matrix.Scaling(1, 1, -1); return scene.useRightHandedSystem ? m.clone() : h.multiply(m).multiply(h); }
export class MeshData {
    attributes: Record<string, Attribute> = {};
    indices: number[] | null = null;
    userData: Record<string, any> = {};
    groups: {
        start: number;
        count: number;
        materialIndex: number;
    }[] = [];
    morphAttributes: Record<string, Attribute[]> = {};
    morphTargetsRelative = false;
    setAttribute(name: string, a: Attribute) { this.attributes[name] = a; return this; }
    getAttribute(name: string): Attribute { return this.attributes[name]; }
    setIndex(a: ArrayLike<number>) { this.indices = Array.from(a); return this; }
    getIndex() { return this.indices ? { count: this.indices.length, getX: (i: number) => this.indices![i] } : null; }
    computeBoundingSphere() { }
    computeVertexNormals() {
        const p = this.getAttribute('position');
        if (!p)
            throw Error('Missing positions');
        const indices = this.indices ?? Array.from({ length: p.count }, (_, i) => i), normals: number[] = [];
        VertexData.ComputeNormals(p.array, indices, normals, { useRightHandedSystem: true });
        this.setAttribute('normal', new Attribute(normals, 3));
        return this;
    }
    applyMatrix4(m: Matrix) {
        const invTranspose = m.clone().invert().transpose();
        const transform = (a: Attribute, normal: boolean, delta = false) => {
            for (let i = 0; i < a.count; i++) {
                const p = new Vector3(a.getX(i), a.getY(i), a.getZ(i));
                const r = normal ? Vector3.TransformNormal(p, invTranspose).normalize() : delta ? Vector3.TransformNormal(p, m) : Vector3.TransformCoordinates(p, m);
                a.setXYZ(i, r.x, r.y, r.z);
            }
        };
        transform(this.getAttribute('position'), false);
        if (this.attributes.normal)
            transform(this.attributes.normal, true);
        for (const [kind, targets] of Object.entries(this.morphAttributes))
            for (const a of targets)
                transform(a, kind === 'normal', this.morphTargetsRelative);
        if (m.determinant() < 0) {
            this.indices ??= Array.from({ length: this.attributes.position.count }, (_, i) => i);
            for (let i = 0; i < this.indices.length; i += 3)
                [this.indices[i + 1], this.indices[i + 2]] = [this.indices[i + 2], this.indices[i + 1]];
        }
        return this;
    }
    scale(x: number, y: number, z: number) { return this.applyMatrix4(Matrix.Scaling(x, y, z)); }
    clone() { const d = new MeshData(); for (const [k, a] of Object.entries(this.attributes))
        d.setAttribute(k, new Attribute(a.array, a.itemSize)); d.indices = this.indices?.slice() ?? null; d.userData = structuredClone(this.userData); d.groups = structuredClone(this.groups); d.morphTargetsRelative = this.morphTargetsRelative; for (const [k, aa] of Object.entries(this.morphAttributes))
        d.morphAttributes[k] = aa.map(a => new Attribute(a.array, a.itemSize)); return d; }
}
export function applyMeshData(data: MeshData, mesh: Mesh) {
    const scene = mesh.getScene(), flip = !scene.useRightHandedSystem, p = data.attributes.position;
    if (!p || p.itemSize !== 3 || !p.count)
        throw Error('Empty geometry is not a supported fallback');
    const vectorArray = (a: Attribute) => { const out = Array.from(a.array); if (flip)
        for (let i = 2; i < out.length; i += a.itemSize)
            out[i] *= -1; return out; };
    const vd = new VertexData();
    vd.positions = vectorArray(p);
    vd.indices = data.indices?.slice() ?? Array.from({ length: p.count }, (_, i) => i);
    if (vd.indices.length % 3 || vd.indices.some(i => !Number.isInteger(i) || i < 0 || i >= p.count))
        throw Error('Invalid triangle indices');
    if (flip)
        for (let i = 0; i < vd.indices.length; i += 3)
            [vd.indices[i + 1], vd.indices[i + 2]] = [vd.indices[i + 2], vd.indices[i + 1]];
    const names: Record<string, string> = { position: 'positions', normal: 'normals', uv: 'uvs', uv2: 'uvs2', uv3: 'uvs3', uv4: 'uvs4', uv5: 'uvs5', uv6: 'uvs6', color: 'colors', skinIndex: 'matricesIndices', skinWeight: 'matricesWeights', skinIndexExtra: 'matricesIndicesExtra', skinWeightExtra: 'matricesWeightsExtra', tangent: 'tangents' };
    for (const [name, a] of Object.entries(data.attributes)) {
        if (!names[name])
            throw Error(`Unsupported vertex attribute ${name}`);
        if (a.count !== p.count || Array.from(a.array).some(n => !Number.isFinite(n)))
            throw Error(`Invalid ${name} vertex data`);
        let array = (name === 'normal' || name === 'tangent') ? vectorArray(a) : Array.from(a.array);
        if (name === 'tangent' && flip)
            for (let i = 3; i < array.length; i += 4)
                array[i] *= -1;
        if (name === 'color' && a.itemSize === 3)
            array = Array.from({ length: p.count }, (_, i) => [a.getX(i), a.getY(i), a.getZ(i), 1]).flat();
        if (name !== 'position')
            (vd as any)[names[name]] = array;
    }
    vd.applyToMesh(mesh, true);
    if (data.groups.length) {
        mesh.releaseSubMeshes();
        for (const group of data.groups) {
            if (group.start < 0 || group.count < 0 || group.start + group.count > vd.indices.length)
                throw Error('Invalid geometry group');
            new SubMesh(group.materialIndex, 0, p.count, group.start, group.count, mesh);
        }
    }
    mesh.sideOrientation = scene.useRightHandedSystem ? Material.CounterClockWiseSideOrientation : Material.ClockWiseSideOrientation;
    mesh.metadata = { ...mesh.metadata, geometry: data.userData };
    mesh.useVertexColors = !!data.attributes.color;
    if (data.morphAttributes.position?.length) {
        mesh.morphTargetManager?.dispose();
        const manager = new MorphTargetManager(scene);
        mesh.morphTargetManager = manager;
        resourceOwner(mesh)?.morph(manager);
        data.morphAttributes.position.forEach((a, i) => {
            const t = new MorphTarget(`morph-${i}`, 0, scene);
            const absolute = (kind: string, attr: Attribute) => { const v = vectorArray(attr); if (data.morphTargetsRelative) {
                const base = vectorArray(data.attributes[kind]);
                for (let j = 0; j < v.length; j++)
                    v[j] += base[j];
            } return v; };
            t.setPositions(absolute('position', a));
            const normal = data.morphAttributes.normal?.[i];
            if (normal)
                t.setNormals(absolute('normal', normal));
            manager.addTarget(t);
        });
    }
    return mesh;
}
