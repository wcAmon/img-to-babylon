import { Matrix, TransformNode, Vector3, Color3, Mesh } from '@babylonjs/core';
import { Attribute, MeshData, convertMatrix } from './meshData';
import { linearColor } from './materials';
export function paintGeometry(g: MeshData, c: any) {
    const p = g.getAttribute('position'), values: number[] = [];
    if (c.rootTipGradient) {
        const spec = c.rootTipGradient, axis = spec.axis === 'x' ? 0 : spec.axis === 'z' ? 2 : 1, root = linearColor(spec.rootColor), tip = linearColor(spec.tipColor);
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < p.count; i++) {
            lo = Math.min(lo, p.array[i * 3 + axis]);
            hi = Math.max(hi, p.array[i * 3 + axis]);
        }
        for (let i = 0; i < p.count; i++) {
            const v = Color3.Lerp(root, tip, hi - lo > 1e-9 ? (p.array[i * 3 + axis] - lo) / (hi - lo) : 1);
            values.push(v.r, v.g, v.b);
        }
        g.setAttribute('color', new Attribute(values, 3));
    }
    if (c.vertexPaint) {
        values.length = 0;
        const paint = c.vertexPaint;
        for (let i = 0; i < p.count; i++) {
            let col = linearColor(paint.baseColor);
            const pt = new Vector3(p.getX(i), p.getY(i), p.getZ(i));
            for (const r of paint.regions) {
                let d = 0;
                if (r.kind === 'axis-band') {
                    const v = r.axis === 'x' ? pt.x : r.axis === 'z' ? pt.z : pt.y;
                    d = v < r.min ? r.min - v : v > r.max ? v - r.max : -Math.min(v - r.min, r.max - v);
                }
                else if (r.kind === 'ellipsoid') {
                    const q = pt.subtract(Vector3.FromArray(r.center)).divide(Vector3.FromArray(r.radii));
                    d = (q.length() - 1) * Math.min(...r.radii);
                }
                else {
                    const a = Vector3.FromArray(r.start), ab = Vector3.FromArray(r.end).subtract(a), den = ab.lengthSquared(), t = den > 0 ? Math.max(0, Math.min(1, Vector3.Dot(pt.subtract(a), ab) / den)) : 0;
                    d = Vector3.Distance(pt, a.add(ab.scale(t))) - (r.startRadius + (r.endRadius - r.startRadius) * t);
                }
                let w = d <= 0 ? 1 : 0;
                if (r.softness > 0) {
                    const t = Math.max(0, Math.min(1, (d + r.softness * .5) / r.softness));
                    w = 1 - t * t * (3 - 2 * t);
                }
                col = Color3.Lerp(col, linearColor(r.color), w);
            }
            values.push(col.r, col.g, col.b);
        }
        g.setAttribute('color', new Attribute(values, 3));
    }
}
export function ringStackDistance(rings: number[][], x: number, y: number, z: number) { const lo = rings[0], hi = rings.at(-1)!; let [_, rx, rz, zc] = y >= hi[0] ? hi : lo; for (let i = 0; i < rings.length - 1; i++)
    if (y > rings[i][0] && y < rings[i + 1][0]) {
        const a = rings[i], b = rings[i + 1], t = (y - a[0]) / (b[0] - a[0]);
        rx = a[1] + (b[1] - a[1]) * t;
        rz = a[2] + (b[2] - a[2]) * t;
        zc = a[3] + (b[3] - a[3]) * t;
        break;
    } const f = (x / rx) ** 2 + ((z - zc) / rz) ** 2 - 1, grad = Math.hypot(2 * x / (rx * rx), 2 * (z - zc) / (rz * rz)), radial = grad < 1e-12 ? -Math.min(rx, rz) : f / grad, axial = Math.max(lo[0] - y, y - hi[0]); return Math.hypot(Math.max(radial, 0), Math.max(axial, 0)) + Math.min(Math.max(radial, axial), 0); }
export function standProud(g: MeshData, mesh: Mesh, target: TransformNode, rings: number[][], clearance: number, maxPush: number) { mesh.computeWorldMatrix(true); target.computeWorldMatrix(true); const to = convertMatrix(mesh.getWorldMatrix().multiply(target.getWorldMatrix().clone().invert()), mesh.getScene()), from = to.clone().invert(), p = g.getAttribute('position'); let unresolved = 0; for (let i = 0; i < p.count; i++) {
    let v = Vector3.TransformCoordinates(new Vector3(p.getX(i), p.getY(i), p.getZ(i)), to);
    const len = Math.hypot(v.x, v.z), onAxis = len < 1e-9, mid = (rings[0][0] + rings.at(-1)![0]) / 2, spoke = onAxis ? new Vector3(0, v.y >= mid ? 1 : -1, 0) : new Vector3(v.x / len, 0, v.z / len);
    let distance = 0;
    for (let k = 0; k < 24; k++) {
        const gap = ringStackDistance(rings, v.x, v.y, v.z);
        if (gap >= clearance)
            break;
        const move = Math.min(Math.max(.002, clearance - gap), maxPush - distance);
        if (move <= 0)
            break;
        v.addInPlace(spoke.scale(move));
        distance += move;
    }
    if (ringStackDistance(rings, v.x, v.y, v.z) < clearance)
        unresolved++;
    v = Vector3.TransformCoordinates(v, from);
    p.setXYZ(i, v.x, v.y, v.z);
} g.computeVertexNormals(); g.userData.standProud = { clearance, maxPush, unresolved, total: p.count }; return g.userData.standProud; }
export function flatGeometry(g: MeshData) { const indices = g.indices ?? Array.from({ length: g.attributes.position.count }, (_, i) => i), out = new MeshData(); for (const [k, a] of Object.entries(g.attributes)) {
    const v: number[] = [];
    for (const i of indices)
        for (let j = 0; j < a.itemSize; j++)
            v.push(a.array[i * a.itemSize + j]);
    out.setAttribute(k, new Attribute(v, a.itemSize));
} out.userData = g.userData; out.groups = g.groups; return out.computeVertexNormals(); }
