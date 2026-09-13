import { Vector3, Quaternion } from '@babylonjs/core';
import { MeshData, Attribute } from './meshData';
function data(p: number[], i: number[], uv: number[], n?: number[]) { const g = new MeshData().setAttribute('position', new Attribute(p, 3)).setAttribute('uv', new Attribute(uv, 2)).setIndex(i); return n ? g.setAttribute('normal', new Attribute(n, 3)) : g.computeVertexNormals(); }
export function planeGeometry(w = 1, h = 1, nx = 1, ny = 1) { const p: number[] = [], uv: number[] = [], ix: number[] = []; for (let y = 0; y <= ny; y++)
    for (let x = 0; x <= nx; x++) {
        p.push((x / nx - .5) * w, (.5 - y / ny) * h, 0);
        uv.push(x / nx, 1 - y / ny);
    } for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
        let a = y * (nx + 1) + x, b = a + nx + 1;
        ix.push(a, b, a + 1, b, b + 1, a + 1);
    } return data(p, ix, uv); }
export function boxGeometry(w = 1, h = 1, d = 1, nx = 1, ny = 1, nz = 1) {
    const p: number[] = [], uv: number[] = [], ix: number[] = [];
    const face = (u: number, v: number, z: number, us: number, vs: number, width: number, height: number, depth: number, gx: number, gy: number) => {
        const start = p.length / 3;
        for (let y = 0; y <= gy; y++)
            for (let x = 0; x <= gx; x++) {
                const a = [0, 0, 0];
                a[u] = (x / gx - .5) * width * us;
                a[v] = (y / gy - .5) * height * vs;
                a[z] = depth / 2;
                p.push(...a);
                uv.push(x / gx, 1 - y / gy);
            }
        for (let y = 0; y < gy; y++)
            for (let x = 0; x < gx; x++) {
                const a = start + y * (gx + 1) + x, b = a + gx + 1;
                ix.push(a, b, a + 1, b, b + 1, a + 1);
            }
    };
    face(2, 1, 0, -1, -1, d, h, w, nz, ny);
    face(2, 1, 0, 1, -1, d, h, -w, nz, ny);
    face(0, 2, 1, 1, 1, w, d, h, nx, nz);
    face(0, 2, 1, 1, -1, w, d, -h, nx, nz);
    face(0, 1, 2, 1, -1, w, h, d, nx, ny);
    face(0, 1, 2, -1, -1, w, h, -d, nx, ny);
    return data(p, ix, uv);
}
export function sphereGeometry(r = .5, ws = 32, hs = 16) {
    const p: number[] = [], uv: number[] = [], ix: number[] = [], n: number[] = [];
    for (let y = 0; y <= hs; y++)
        for (let x = 0; x <= ws; x++) {
            const u = x / ws, v = y / hs, phi = u * Math.PI * 2, theta = v * Math.PI;
            const a = [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
            p.push(...a.map(v => v * r));
            n.push(...a);
            uv.push(u + (y === 0 ? .5 / ws : y === hs ? -.5 / ws : 0), 1 - v);
        }
    for (let y = 0; y < hs; y++)
        for (let x = 0; x < ws; x++) {
            const b = y * (ws + 1) + x, a = b + 1, c = b + ws + 1, d = c + 1;
            if (y !== 0)
                ix.push(a, b, d);
            if (y !== hs - 1)
                ix.push(b, c, d);
        }
    return data(p, ix, uv, n);
}
export function cylinderGeometry(rt = .5, rb = .5, h = 1, rs = 24, hs = 1) {
    const p: number[] = [], uv: number[] = [], ix: number[] = [], n: number[] = [];
    const slope = (rb - rt) / h;
    for (let y = 0; y <= hs; y++)
        for (let x = 0; x <= rs; x++) {
            const v = y / hs, a = x / rs * Math.PI * 2, r = rt + (rb - rt) * v;
            p.push(r * Math.sin(a), h * (.5 - v), r * Math.cos(a));
            uv.push(x / rs, 1 - v);
            const normal = new Vector3(Math.sin(a), slope, Math.cos(a)).normalize();
            n.push(...normal.asArray());
        }
    for (let y = 0; y < hs; y++)
        for (let x = 0; x < rs; x++) {
            const a = y * (rs + 1) + x, b = a + rs + 1;
            if (rt > 0 || y !== 0)
                ix.push(a, b, a + 1);
            if (rb > 0 || y !== hs - 1)
                ix.push(b, b + 1, a + 1);
        }
    for (const top of [true, false]) {
        const radius = top ? rt : rb;
        if (radius === 0)
            continue;
        const start = p.length / 3, sign = top ? 1 : -1;
        for (let x = 0; x <= rs; x++) {
            const a = x / rs * Math.PI * 2;
            p.push(radius * Math.sin(a), sign * h / 2, radius * Math.cos(a));
            n.push(0, sign, 0);
            uv.push(Math.sin(a) * .5 + .5, Math.cos(a) * .5 * sign + .5);
        }
        const center = p.length / 3;
        p.push(0, sign * h / 2, 0);
        n.push(0, sign, 0);
        uv.push(.5, .5);
        for (let x = 0; x < rs; x++)
            if (top)
                ix.push(start + x, start + x + 1, center);
            else
                ix.push(start + x + 1, start + x, center);
    }
    return data(p, ix, uv, n);
}
export function coneGeometry(r = .5, h = 1, rs = 24, hs = 1) { return cylinderGeometry(0, r, h, rs, hs); }
export function torusGeometry(r = .45, t = .08, radial = 12, tubular = 48) { const p: number[] = [], uv: number[] = [], ix: number[] = [], n: number[] = []; for (let j = 0; j <= radial; j++)
    for (let i = 0; i <= tubular; i++) {
        const u = i / tubular * Math.PI * 2, v = j / radial * Math.PI * 2;
        p.push((r + t * Math.cos(v)) * Math.cos(u), (r + t * Math.cos(v)) * Math.sin(u), t * Math.sin(v));
        n.push(Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u), Math.sin(v));
        uv.push(i / tubular, j / radial);
    } for (let j = 1; j <= radial; j++)
    for (let i = 1; i <= tubular; i++) {
        const a = (tubular + 1) * j + i - 1, b = (tubular + 1) * (j - 1) + i - 1, c = b + 1, d = a + 1;
        ix.push(a, b, d, b, c, d);
    } return data(p, ix, uv, n); }
export function buildLatheGeometry(profile: {
    points: [
        number,
        number
    ][];
    segments?: number;
}) {
    const pts = profile.points.map(([r, y]) => [Math.max(.0001, r), y]), seg = profile.segments ?? 24, p: number[] = [], uv: number[] = [], ix: number[] = [], n: number[] = [], meridian: Vector3[] = [];
    let prev = Vector3.Zero();
    for (let j = 0; j < pts.length; j++) {
        if (j === pts.length - 1)
            meridian.push(prev.clone());
        else {
            const normal = new Vector3(pts[j + 1][1] - pts[j][1], -(pts[j + 1][0] - pts[j][0]), 0);
            meridian.push((j === 0 ? normal.clone() : normal.add(prev)).normalize());
            prev = normal;
        }
    }
    for (let i = 0; i <= seg; i++)
        for (let j = 0; j < pts.length; j++) {
            const a = i / seg * Math.PI * 2;
            p.push(pts[j][0] * Math.sin(a), pts[j][1], pts[j][0] * Math.cos(a));
            n.push(meridian[j].x * Math.sin(a), meridian[j].y, meridian[j].x * Math.cos(a));
            uv.push(i / seg, j / (pts.length - 1));
        }
    for (let i = 0; i < seg; i++)
        for (let j = 0; j < pts.length - 1; j++) {
            const a = i * pts.length + j, b = a + pts.length;
            ix.push(a, b, a + 1, b + 1, a + 1, b);
        }
    return data(p, ix, uv, n);
}
/** Centripetal Catmull-Rom with the same endpoint extrapolation and arc-length sampling as source. */
export function catmullPoint(points: Vector3[], t: number, closed = false) {
    const l = points.length;
    if (l < 2)
        throw Error('A curve requires two points');
    const f = (l - (closed ? 0 : 1)) * t;
    let i = Math.floor(f), w = f - i;
    if (!closed && i === l - 1) {
        i = l - 2;
        w = 1;
    }
    const at = (k: number) => closed ? points[(k % l + l) % l] : k < 0 ? points[0].scale(2).subtract(points[1]) : k >= l ? points[l - 1].scale(2).subtract(points[l - 2]) : points[k];
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    let dt0 = Math.pow(Vector3.DistanceSquared(p0, p1), .25), dt1 = Math.pow(Vector3.DistanceSquared(p1, p2), .25), dt2 = Math.pow(Vector3.DistanceSquared(p2, p3), .25);
    if (dt1 < 1e-4)
        dt1 = 1;
    if (dt0 < 1e-4)
        dt0 = dt1;
    if (dt2 < 1e-4)
        dt2 = dt1;
    const vals = ['x', 'y', 'z'].map(key => { const k = key as 'x' | 'y' | 'z', a = p0[k], b = p1[k], c = p2[k], d = p3[k]; const t1 = ((b - a) / dt0 - (c - a) / (dt0 + dt1) + (c - b) / dt1) * dt1, t2 = ((c - b) / dt1 - (d - b) / (dt1 + dt2) + (d - c) / dt2) * dt1; return b + t1 * w + (-3 * b + 3 * c - 2 * t1 - t2) * w * w + (2 * b - 2 * c + t1 + t2) * w * w * w; });
    return Vector3.FromArray(vals);
}
export function curveFrames(raw: readonly number[][], steps: number, closed = false) {
    const pts = raw.map(p => Vector3.FromArray(p)), lengths = [0];
    let last = catmullPoint(pts, 0, closed);
    for (let i = 1; i <= 200; i++) {
        const v = catmullPoint(pts, i / 200, closed);
        lengths.push(lengths[i - 1] + Vector3.Distance(v, last));
        last = v;
    }
    const parameter = (u: number) => { const target = u * lengths[200]; let j = 0; while (j < 199 && lengths[j + 1] < target)
        j++; return (j + (target - lengths[j]) / (lengths[j + 1] - lengths[j] || 1)) / 200; };
    const centers: Vector3[] = [], tangents: Vector3[] = [], normals: Vector3[] = [], binormals: Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = parameter(i / steps);
        centers.push(catmullPoint(pts, t, closed));
        tangents.push(catmullPoint(pts, Math.min(1, t + .0001), closed).subtract(catmullPoint(pts, Math.max(0, t - .0001), closed)).normalize());
    }
    const t = tangents[0], a = t.asArray().map(Math.abs);
    let axis = new Vector3(1, 0, 0), min = a[0];
    if (a[1] <= min) {
        axis.set(0, 1, 0);
        min = a[1];
    }
    if (a[2] <= min)
        axis.set(0, 0, 1);
    const v = Vector3.Cross(t, axis).normalize();
    normals.push(Vector3.Cross(t, v));
    binormals.push(Vector3.Cross(t, normals[0]));
    for (let i = 1; i <= steps; i++) {
        let n = normals[i - 1].clone();
        const axis = Vector3.Cross(tangents[i - 1], tangents[i]);
        if (axis.length() > Number.EPSILON) {
            axis.normalize();
            n = n.applyRotationQuaternion(Quaternion.RotationAxis(axis, Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(tangents[i - 1], tangents[i]))))));
        }
        normals.push(n);
        binormals.push(Vector3.Cross(tangents[i], n));
    }
    if (closed) {
        let theta = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(normals[0], normals[steps])))) / steps;
        if (Vector3.Dot(tangents[0], Vector3.Cross(normals[0], normals[steps])) > 0)
            theta = -theta;
        for (let i = 1; i <= steps; i++) {
            normals[i] = normals[i].applyRotationQuaternion(Quaternion.RotationAxis(tangents[i], theta * i));
            binormals[i] = Vector3.Cross(tangents[i], normals[i]);
        }
    }
    return { centers, normals, binormals };
}
export function buildTubeGeometry(path: {
    points: number[][];
    radius?: number;
    radialSegments?: number;
    closed?: boolean;
}) {
    const steps = Math.max(8, path.points.length * 6), radial = path.radialSegments ?? 8, r = path.radius ?? .05, { centers, normals, binormals } = curveFrames(path.points, steps, path.closed), p: number[] = [], n: number[] = [], uv: number[] = [], ix: number[] = [];
    for (let i = 0; i <= steps; i++)
        for (let j = 0; j <= radial; j++) {
            const a = j / radial * Math.PI * 2, norm = normals[i].scale(-Math.cos(a)).add(binormals[i].scale(Math.sin(a)));
            p.push(...centers[i].add(norm.scale(r)).asArray());
            n.push(...norm.asArray());
            uv.push(i / steps, j / radial);
        }
    for (let i = 1; i <= steps; i++)
        for (let j = 1; j <= radial; j++) {
            const a = (radial + 1) * (i - 1) + j - 1, b = (radial + 1) * i + j - 1, c = b + 1, d = a + 1;
            ix.push(a, b, d, b, c, d);
        }
    return data(p, ix, uv, n);
}
import earcut from './earcut.js';
type Point2 = [
    number,
    number
];
function profileLoops(points: Point2[], holes: Point2[][] = []) {
    const area = (p: Point2[]) => p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0);
    const clean = (p: Point2[]) => p.length > 1 && p[0][0] === p.at(-1)![0] && p[0][1] === p.at(-1)![1] ? p.slice(0, -1) : p.slice();
    return [points, ...holes].map((p, i) => { const a = clean(p); if (a.length < 3)
        throw Error('Extrusion loop needs three points'); if ((area(a) > 0) !== (i === 0))
        a.reverse(); return a; });
}
function extrudeLoops(loops: Point2[][], centers: Vector3[], normals: Vector3[], binormals: Vector3[], straight = false) {
    const flat = loops.flat(), holes: number[] = [];
    let offset = loops[0].length;
    for (let i = 1; i < loops.length; i++) {
        holes.push(offset);
        offset += loops[i].length;
    }
    const cap = earcut(flat.flat(), holes, 2), p: number[] = [], uv: number[] = [], ix: number[] = [], steps = centers.length - 1;
    const at = (i: number, k: number) => centers[i].add(normals[i].scale(flat[k][0])).add(binormals[i].scale(flat[k][1]));
    // Separate cap/side corners retain hard edges. UVs match source world XY caps and edge/depth walls.
    const tri = (a: Vector3, b: Vector3, c: Vector3, coords: number[]) => { const s = p.length / 3; p.push(...a.asArray(), ...b.asArray(), ...c.asArray()); uv.push(...coords); ix.push(s, s + 1, s + 2); };
    for (let k = 0; k < cap.length; k += 3) {
        const a = cap[k], b = cap[k + 1], c = cap[k + 2], bottom = [at(0, c), at(0, b), at(0, a)], top = [at(steps, a), at(steps, b), at(steps, c)];
        tri(bottom[0], bottom[1], bottom[2], bottom.flatMap(v => [v.x, v.y]));
        tri(top[0], top[1], top[2], top.flatMap(v => [v.x, v.y]));
    }
    offset = 0;
    for (const loop of loops) {
        for (let k = 0; k < loop.length; k++) {
            const a = offset + k, b = offset + (k + 1) % loop.length;
            for (let s = 0; s < steps; s++) {
                const A = at(s, a), B = at(s, b), C = at(s + 1, b), D = at(s + 1, a);
                const useX = Math.abs(A.y - B.y) < Math.abs(A.x - B.x), u = (v: Vector3) => useX ? v.x : v.y, v = (v: Vector3, t: number) => 1 - v.z;
                tri(A, B, D, [u(A), v(A, s), u(B), v(B, s), u(D), v(D, s + 1)]);
                tri(B, C, D, [u(B), v(B, s), u(C), v(C, s + 1), u(D), v(D, s + 1)]);
            }
        }
        offset += loop.length;
    }
    const g = data(p, ix, uv);
    g.groups = [{ start: 0, count: cap.length * 2, materialIndex: 0 }, { start: cap.length * 2, count: ix.length - cap.length * 2, materialIndex: 1 }];
    return g;
}
export function buildExtrudeGeometry(profile: {
    points: Point2[];
    depth: number;
    holes?: Point2[][];
    ovalHoles?: {
        cx: number;
        cy: number;
        rx: number;
        ry: number;
    }[];
}) {
    const holes = [...(profile.holes ?? []), ...(profile.ovalHoles ?? []).map(o => Array.from({ length: 24 }, (_, i) => [o.cx + Math.cos(i / 24 * Math.PI * 2) * o.rx, o.cy + Math.sin(i / 24 * Math.PI * 2) * o.ry] as Point2))];
    return extrudeLoops(profileLoops(profile.points, holes), [new Vector3(), new Vector3(0, 0, profile.depth)], [new Vector3(1, 0, 0), new Vector3(1, 0, 0)], [new Vector3(0, 1, 0), new Vector3(0, 1, 0)], true);
}
export function buildCurveSweepGeometry(sweep: {
    spine: number[][];
    crossSection: {
        points: Point2[];
    };
    closed?: boolean;
}) { const frames = curveFrames(sweep.spine, Math.max(24, sweep.spine.length * 8), sweep.closed); return extrudeLoops(profileLoops(sweep.crossSection.points), frames.centers, frames.normals, frames.binormals); }
