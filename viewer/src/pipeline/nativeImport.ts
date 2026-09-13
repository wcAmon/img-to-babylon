import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import { Attribute, MeshData } from './meshData';
export const LEGACY_BRIDGE = 'babylon-sculpt-v1';
const finiteArray = (a: unknown, count?: number): a is number[] => Array.isArray(a) && (count === undefined || a.length === count) && a.every(v => typeof v === 'number' && Number.isFinite(v));
/** Validate again at the runtime boundary; callers cannot bypass the contract with a handmade payload. */
export function validateNativeComponent(c: any): boolean {
    const d = c.geometryDescriptor?.nativeVertexData, recipe = c.geometryDescriptor?.extensions?.[LEGACY_BRIDGE];
    if (!d) {
        if (recipe?.requiresNativeVertexData || recipe?.allowPrimitiveFallback === false) throw Error(`${c.id}: recipe-only legacy import cannot render`);
        return false;
    }
    if (d.version !== 1 || d.coordinateSystem?.handedness !== 'right' || d.coordinateSystem?.up !== 'Y' || d.coordinateSystem?.units !== 'm' || d.space !== 'component-local' || d.dimensionsBaked !== true || d.transformBaked !== false || d.winding !== 'CCW-normal-consistent') throw Error(`${c.id}: unsupported nativeVertexData contract`);
    if (!finiteArray(d.positions) || !d.positions.length || d.positions.length % 3 || !finiteArray(d.normals, d.positions.length) || !finiteArray(d.uvs) || ![0, d.positions.length / 3 * 2].includes(d.uvs.length) || !Array.isArray(d.indices) || !d.indices.length || d.indices.length % 3 || d.indices.some((i: any) => !Number.isInteger(i) || i < 0 || i >= d.positions.length / 3)) throw Error(`${c.id}: invalid native vertex buffers`);
    const swaps = d.windingFlippedTriangles ?? [];
    if (!Array.isArray(swaps) || new Set(swaps).size !== swaps.length || swaps.some((i: any) => !Number.isInteger(i) || i < 0 || i >= d.indices.length / 3)) throw Error(`${c.id}: invalid winding record`);
    const t = c.extensions?.[LEGACY_BRIDGE]?.nativeTransform;
    if (!t || t.version !== 1 || t.space !== 'parent-local' || t.matrixLayout !== 'column-major' || t.eulerOrder !== 'XYZ' || !finiteArray(t.rotationQuaternion, 4) || !finiteArray(t.localMatrix, 16) || !finiteArray(t.effectiveScale, 3) || t.effectiveScale.some((v: number) => v !== 1) || !finiteArray(c.transform?.position, 3)) throw Error(`${c.id}: invalid nativeTransform`);
    const q = Quaternion.FromArray(t.rotationQuaternion);
    if (Math.abs(q.lengthSquared() - 1) > 1e-6) throw Error(`${c.id}: native quaternion must be unit length`);
    const expected = Matrix.Compose(Vector3.One(), q, Vector3.FromArray(c.transform.position));
    if (Array.from(expected.asArray()).some((v, i) => Math.abs(v - t.localMatrix[i]) > 2e-6)) throw Error(`${c.id}: native matrix and quaternion/position disagree`);
    return true;
}
export function nativeVertexGeometry(c: any): MeshData {
    if (!validateNativeComponent(c)) throw Error('nativeVertexData required');
    const d = c.geometryDescriptor.nativeVertexData;
    const g = new MeshData().setAttribute('position', new Attribute(d.positions, 3)).setAttribute('normal', new Attribute(d.normals, 3)).setIndex(d.indices);
    if (d.uvs.length) g.setAttribute('uv', new Attribute(d.uvs, 2));
    g.userData.nativeImport = { dimensionsBaked: true, transformBaked: false, provenance: d.provenance ?? {}, windingFlippedTriangles: d.windingFlippedTriangles ?? [] };
    return g;
}
