// Native numerical port of img2threejs (Apache-2.0). See runtime-port.md.
import { Vector2, Vector3 } from "@babylonjs/core";
import { Attribute, MeshData, quaternionXYZ } from "./meshData";
const subtractVectors = (a: Vector3, b: Vector3) => a.subtract(b);
type VisualHullVector = readonly [
    number,
    number,
    number
];
type VisualHullAxis = 'front' | 'side' | 'top';
type VisualHullView = {
    readonly axis: VisualHullAxis;
    readonly confidence: number;
    readonly mask: readonly string[];
};
type VisualHullDescriptor = {
    readonly projection: 'orthographic';
    readonly boundsSpace: 'component-local';
    readonly bounds: {
        readonly min: VisualHullVector;
        readonly max: VisualHullVector;
    };
    readonly resolution: number;
    readonly triangleBudget: number;
    readonly views: readonly VisualHullView[];
    readonly hiddenRegions?: readonly string[];
};
const MAX_VISUAL_HULL_TRIANGLES = 400000;
class VisualHullGeometryBudgetError extends Error {
    readonly triangleBudget: number;
    readonly emittedTriangles: number;
    constructor(triangleBudget: number, emittedTriangles: number) {
        super(`visual hull emitted ${emittedTriangles} triangles, exceeding budget ${triangleBudget}`);
        this.name = 'VisualHullGeometryBudgetError';
        this.triangleBudget = triangleBudget;
        this.emittedTriangles = emittedTriangles;
    }
}
class VisualHullOccupancyError extends Error {
    readonly occupiedVoxelCount: number;
    readonly emittedTriangles: number;
    constructor(occupiedVoxelCount: number, emittedTriangles: number) {
        super('visual hull silhouettes produced no bounded occupied surface');
        this.name = 'VisualHullOccupancyError';
        this.occupiedVoxelCount = occupiedVoxelCount;
        this.emittedTriangles = emittedTriangles;
    }
}
export function visualHullMaskContains(view: VisualHullView, horizontal: number, vertical: number): boolean {
    const height = view.mask.length;
    const width = view.mask[0].length;
    const column = Math.max(0, Math.min(width - 1, Math.floor(horizontal * width)));
    const row = Math.max(0, Math.min(height - 1, Math.floor((1 - vertical) * height)));
    return view.mask[row][column] === '1';
}
export function buildVisualHullGeometry(descriptor: VisualHullDescriptor): MeshData {
    const resolution = descriptor.resolution;
    const min = new Vector3(...descriptor.bounds.min);
    const max = new Vector3(...descriptor.bounds.max);
    const step = max.clone().subtractInPlace(min).scaleInPlace(1 / resolution);
    const indexAt = (x: number, y: number, z: number): number => (z * resolution + y) * resolution + x;
    const occupied = new Uint8Array(resolution * resolution * resolution);
    let occupiedVoxelCount = 0;
    const contains = (x: number, y: number, z: number): boolean => (x >= 0 && y >= 0 && z >= 0 && x < resolution && y < resolution && z < resolution && occupied[indexAt(x, y, z)] === 1);
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                const horizontalX = (x + 0.5) / resolution;
                const verticalY = (y + 0.5) / resolution;
                const horizontalZ = (z + 0.5) / resolution;
                let inside = true;
                for (const view of descriptor.views) {
                    switch (view.axis) {
                        case 'front':
                            inside = inside && visualHullMaskContains(view, horizontalX, verticalY);
                            break;
                        case 'side':
                            inside = inside && visualHullMaskContains(view, horizontalZ, verticalY);
                            break;
                        case 'top':
                            inside = inside && visualHullMaskContains(view, horizontalX, horizontalZ);
                            break;
                    }
                    if (!inside)
                        break;
                }
                if (inside) {
                    occupied[indexAt(x, y, z)] = 1;
                    occupiedVoxelCount += 1;
                }
            }
        }
    }
    if (occupiedVoxelCount === 0)
        throw new VisualHullOccupancyError(0, 0);
    const positions: number[] = [];
    const indices: number[] = [];
    const vertices = new Map<string, number>();
    const vertexAt = (x: number, y: number, z: number): number => {
        const key = `${x},${y},${z}`;
        const existing = vertices.get(key);
        if (existing !== undefined)
            return existing;
        const vertex = positions.length / 3;
        positions.push(min.x + x * step.x, min.y + y * step.y, min.z + z * step.z);
        vertices.set(key, vertex);
        return vertex;
    };
    const addFace = (a: number, b: number, c: number, d: number): void => {
        indices.push(a, b, c, a, c, d);
        const emittedTriangles = indices.length / 3;
        if (emittedTriangles > descriptor.triangleBudget || emittedTriangles > MAX_VISUAL_HULL_TRIANGLES) {
            throw new VisualHullGeometryBudgetError(descriptor.triangleBudget, emittedTriangles);
        }
    };
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                if (!contains(x, y, z))
                    continue;
                if (!contains(x - 1, y, z))
                    addFace(vertexAt(x, y, z), vertexAt(x, y, z + 1), vertexAt(x, y + 1, z + 1), vertexAt(x, y + 1, z));
                if (!contains(x + 1, y, z))
                    addFace(vertexAt(x + 1, y, z), vertexAt(x + 1, y + 1, z), vertexAt(x + 1, y + 1, z + 1), vertexAt(x + 1, y, z + 1));
                if (!contains(x, y - 1, z))
                    addFace(vertexAt(x, y, z), vertexAt(x + 1, y, z), vertexAt(x + 1, y, z + 1), vertexAt(x, y, z + 1));
                if (!contains(x, y + 1, z))
                    addFace(vertexAt(x, y + 1, z), vertexAt(x, y + 1, z + 1), vertexAt(x + 1, y + 1, z + 1), vertexAt(x + 1, y + 1, z));
                if (!contains(x, y, z - 1))
                    addFace(vertexAt(x, y, z), vertexAt(x, y + 1, z), vertexAt(x + 1, y + 1, z), vertexAt(x + 1, y, z));
                if (!contains(x, y, z + 1))
                    addFace(vertexAt(x, y, z + 1), vertexAt(x + 1, y, z + 1), vertexAt(x + 1, y + 1, z + 1), vertexAt(x, y + 1, z + 1));
            }
        }
    }
    if (indices.length === 0)
        throw new VisualHullOccupancyError(occupiedVoxelCount, 0);
    const geometry = new MeshData();
    geometry.setAttribute('position', new Attribute(positions, 3));
    geometry.setIndex(indices);
    const uv: number[] = [];
    for (let index = 0; index < positions.length; index += 3) {
        uv.push((positions[index] - min.x) / (max.x - min.x), (positions[index + 1] - min.y) / (max.y - min.y));
    }
    geometry.setAttribute('uv', new Attribute(uv, 2));
    geometry.computeVertexNormals();
    geometry.userData.visualHull = {
        method: 'orthographic-silhouette-intersection',
        observedAxes: descriptor.views.map((view) => view.axis),
        viewConfidence: descriptor.views.map((view) => ({ axis: view.axis, confidence: view.confidence })),
        hiddenRegions: descriptor.hiddenRegions ?? ['Unobserved depth detail remains underconstrained by silhouette intersection.'],
        lowConfidence: {
            hiddenRegions: true,
            reason: 'Silhouette intersection constrains the exterior envelope, not unseen surface detail.',
        },
    };
    return geometry;
}
export function decimateGeometry(source: MeshData, targetRatio: number): MeshData {
    const MIN_TRIANGLES = 4;
    const position = source.getAttribute('position');
    if (!position || !(targetRatio > 0) || targetRatio >= 1)
        return source;
    const vertices: number[][] = [];
    for (let i = 0; i < position.count; i++) {
        vertices.push([position.getX(i), position.getY(i), position.getZ(i)]);
    }
    const index = source.getIndex();
    const faces: number[][] = [];
    if (index) {
        for (let i = 0; i + 2 < index.count; i += 3) {
            faces.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)]);
        }
    }
    else {
        for (let i = 0; i + 2 < position.count; i += 3)
            faces.push([i, i + 1, i + 2]);
    }
    if (!faces.length)
        return source;
    const originalCount = faces.length;
    const targetCount = Math.max(MIN_TRIANGLES, Math.floor(originalCount * targetRatio));
    if (originalCount <= targetCount)
        return source;
    const planeOf = (a: number[], b: number[], c: number[]): number[] | null => {
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        ];
        const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
        if (len <= 1e-12)
            return null;
        const u = [n[0] / len, n[1] / len, n[2] / len];
        return [u[0], u[1], u[2], -(u[0] * a[0] + u[1] * a[1] + u[2] * a[2])];
    };
    const quadricOf = (p: number[]): number[] => {
        const [a, b, c, d] = p;
        return [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
    };
    const addQuadric = (q1: number[], q2: number[]): number[] => q1.map((x, i) => x + q2[i]);
    const quadricError = (q: number[], v: number[]): number => {
        const [x, y, z] = v;
        return (q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x +
            q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y +
            q[7] * z * z + 2 * q[8] * z + q[9]);
    };
    const alive = faces.map(() => true);
    const vertexFaces: Set<number>[] = vertices.map(() => new Set<number>());
    faces.forEach((face, i) => face.forEach((v) => vertexFaces[v].add(i)));
    const quadrics: number[][] = vertices.map(() => new Array(10).fill(0));
    faces.forEach((face, i) => {
        const p = planeOf(vertices[face[0]], vertices[face[1]], vertices[face[2]]);
        if (!p) {
            alive[i] = false;
            return;
        }
        const q = quadricOf(p);
        face.forEach((v) => { quadrics[v] = addQuadric(quadrics[v], q); });
    });
    const edgeFaces = new Map<string, number>();
    const edgeKey = (u: number, v: number) => (u < v ? u + ':' + v : v + ':' + u);
    faces.forEach((face) => {
        const [a, b, c] = face;
        for (const [u, v] of [[a, b], [b, c], [c, a]]) {
            const k = edgeKey(u, v);
            edgeFaces.set(k, (edgeFaces.get(k) ?? 0) + 1);
        }
    });
    const boundary = new Set<string>();
    edgeFaces.forEach((count, k) => { if (count === 1)
        boundary.add(k); });
    const midpointOf = (u: number, v: number): number[] => [0, 1, 2].map((i) => (vertices[u][i] + vertices[v][i]) / 2);
    const costOf = (u: number, v: number): number => quadricError(addQuadric(quadrics[u], quadrics[v]), midpointOf(u, v));
    const heap: {
        cost: number;
        u: number;
        v: number;
    }[] = [];
    const heapPush = (entry: {
        cost: number;
        u: number;
        v: number;
    }) => {
        heap.push(entry);
        let i = heap.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (heap[parent].cost <= heap[i].cost)
                break;
            [heap[parent], heap[i]] = [heap[i], heap[parent]];
            i = parent;
        }
    };
    const heapPop = () => {
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length) {
            heap[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = 2 * i + 2;
                let small = i;
                if (l < heap.length && heap[l].cost < heap[small].cost)
                    small = l;
                if (r < heap.length && heap[r].cost < heap[small].cost)
                    small = r;
                if (small === i)
                    break;
                [heap[small], heap[i]] = [heap[i], heap[small]];
                i = small;
            }
        }
        return top;
    };
    edgeFaces.forEach((_count, k) => {
        if (boundary.has(k))
            return;
        const [u, v] = k.split(':').map(Number);
        heapPush({ cost: costOf(u, v), u, v });
    });
    let liveFaces = alive.reduce((n, flag) => n + (flag ? 1 : 0), 0);
    while (heap.length && liveFaces > targetCount) {
        const { u, v } = heapPop();
        if (u === v || !vertexFaces[u].size || !vertexFaces[v].size)
            continue;
        const shared = new Set<number>();
        vertexFaces[u].forEach((i) => { if (vertexFaces[v].has(i))
            shared.add(i); });
        let anyAlive = false;
        shared.forEach((i) => { if (alive[i])
            anyAlive = true; });
        if (!anyAlive)
            continue;
        const merged = midpointOf(u, v);
        let flips = false;
        const affected = new Set<number>();
        vertexFaces[u].forEach((i) => { if (!shared.has(i))
            affected.add(i); });
        vertexFaces[v].forEach((i) => { if (!shared.has(i))
            affected.add(i); });
        for (const i of affected) {
            if (!alive[i] || flips)
                continue;
            const face = faces[i];
            const before = planeOf(vertices[face[0]], vertices[face[1]], vertices[face[2]]);
            const pts = face.map((w) => (w === u || w === v ? merged : vertices[w]));
            const after = planeOf(pts[0], pts[1], pts[2]);
            if (!before || !after) {
                flips = true;
                break;
            }
            if (before[0] * after[0] + before[1] * after[1] + before[2] * after[2] < 0) {
                flips = true;
                break;
            }
        }
        if (flips)
            continue;
        vertices[u] = merged;
        quadrics[u] = addQuadric(quadrics[u], quadrics[v]);
        shared.forEach((i) => { if (alive[i]) {
            alive[i] = false;
            liveFaces -= 1;
        } });
        Array.from(vertexFaces[v]).forEach((i) => {
            if (!alive[i])
                return;
            faces[i] = faces[i].map((w) => (w === v ? u : w));
            vertexFaces[u].add(i);
        });
        vertexFaces[v] = new Set<number>();
        Array.from(vertexFaces[u]).forEach((i) => {
            if (!alive[i])
                return;
            faces[i].forEach((w) => { if (w !== u)
                heapPush({ cost: costOf(u, w), u, v: w }); });
        });
    }
    const kept = faces.filter((_face, i) => alive[i]);
    const used = Array.from(new Set(kept.flat())).sort((a, b) => a - b);
    const remap = new Map<number, number>();
    used.forEach((old, next) => remap.set(old, next));
    const outPositions: number[] = [];
    used.forEach((old) => outPositions.push(vertices[old][0], vertices[old][1], vertices[old][2]));
    const outIndices: number[] = [];
    kept.forEach((face) => face.forEach((w) => outIndices.push(remap.get(w)!)));
    const geometry = new MeshData();
    geometry.setAttribute('position', new Attribute(outPositions, 3));
    geometry.setIndex(outIndices);
    geometry.computeVertexNormals();
    geometry.userData.decimation = {
        originalTriangleCount: originalCount,
        triangleCount: kept.length,
        targetTriangleCount: targetCount,
        reachedTarget: kept.length <= targetCount,
    };
    return geometry;
}
type SdfVector = readonly [
    number,
    number,
    number
];
type SdfTransform = {
    position?: SdfVector;
    translation?: SdfVector;
    rotation?: SdfVector;
    scale?: SdfVector;
};
type SdfPrimitive = {
    readonly id: string;
    readonly type: 'sphere' | 'capsule' | 'box' | 'cone' | 'ellipsoid';
    readonly center?: SdfVector;
    readonly radius?: number | SdfVector;
    readonly height?: number;
    readonly size?: SdfVector;
    readonly dimensions?: SdfVector;
    readonly radii?: SdfVector;
    readonly transform?: SdfTransform;
};
type SdfOperation = {
    readonly id?: string;
    readonly output?: string;
    readonly type: 'smooth-union' | 'subtract' | 'intersect';
    readonly left: string;
    readonly right: string;
    readonly radius?: number;
};
type SdfDescriptor = {
    readonly primitives: readonly SdfPrimitive[];
    readonly operations?: readonly SdfOperation[];
    readonly resolution: number;
    readonly bounds?: {
        readonly min: SdfVector;
        readonly max: SdfVector;
    };
};
type SdfFunction = (point: Vector3) => number;
export function sdfSphere(point: Vector3, radius: number): number {
    return point.length() - radius;
}
export function sdfCapsule(point: Vector3, radius: number, height: number): number {
    const halfHeight = height * 0.5;
    const y = Math.max(-halfHeight, Math.min(halfHeight, point.y));
    return Vector3.Distance(point, new Vector3(0, y, 0)) - radius;
}
export function sdfBox(point: Vector3, size: SdfVector): number {
    const q = new Vector3(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z))
        .subtractInPlace(new Vector3(size[0] * 0.5, size[1] * 0.5, size[2] * 0.5));
    return q.clone().maximizeInPlace(new Vector3()).length() + Math.min(Math.max(q.x, q.y, q.z), 0);
}
export function sdfCone(point: Vector3, radius: number, height: number): number {
    const halfHeight = height * 0.5;
    const taper = radius * (1 - (point.y + halfHeight) / height);
    return Math.max(Math.hypot(point.x, point.z) - Math.max(0, taper), Math.abs(point.y) - halfHeight);
}
export function sdfEllipsoid(point: Vector3, radii: SdfVector): number {
    const scaled = new Vector3(point.x / radii[0], point.y / radii[1], point.z / radii[2]);
    return (scaled.length() - 1) * Math.min(radii[0], radii[1], radii[2]);
}
export function sdfRadii(primitive: SdfPrimitive): SdfVector {
    const radius = primitive.radius;
    if (primitive.radii)
        return primitive.radii;
    if (typeof radius === 'number')
        return [radius, radius, radius];
    return radius ?? [0.5, 0.5, 0.5];
}
export function smin(left: number, right: number, radius: number): number {
    const blend = Math.max(radius - Math.abs(left - right), 0) / radius;
    return Math.min(left, right) - blend * blend * radius * 0.25;
}
export function sdfLocalPoint(point: Vector3, primitive: SdfPrimitive): {
    point: Vector3;
    scale: number;
} {
    const transform = primitive.transform;
    const translation = transform?.position ?? transform?.translation ?? primitive.center ?? [0, 0, 0];
    const rotation = transform?.rotation ?? [0, 0, 0];
    const scale = transform?.scale ?? [1, 1, 1];
    const local = point.clone().subtractInPlace(new Vector3(translation[0], translation[1], translation[2]));
    const inverseRotation = quaternionXYZ(rotation).conjugate();
    local.rotateByQuaternionToRef(inverseRotation, local);
    local.set(local.x / scale[0], local.y / scale[1], local.z / scale[2]);
    return { point: local, scale: Math.min(scale[0], scale[1], scale[2]) };
}
export function sdfPrimitive(point: Vector3, primitive: SdfPrimitive): number {
    const local = sdfLocalPoint(point, primitive);
    let distance: number;
    switch (primitive.type) {
        case 'sphere':
            distance = sdfSphere(local.point, typeof primitive.radius === 'number' ? primitive.radius : 0.5);
            break;
        case 'capsule':
            distance = sdfCapsule(local.point, typeof primitive.radius === 'number' ? primitive.radius : 0.25, primitive.height ?? 1);
            break;
        case 'box':
            distance = sdfBox(local.point, primitive.size ?? primitive.dimensions ?? [1, 1, 1]);
            break;
        case 'cone':
            distance = sdfCone(local.point, typeof primitive.radius === 'number' ? primitive.radius : 0.5, primitive.height ?? 1);
            break;
        case 'ellipsoid':
            distance = sdfEllipsoid(local.point, sdfRadii(primitive));
            break;
    }
    return distance * local.scale;
}
export function sdfSample(descriptor: SdfDescriptor): SdfFunction {
    const nodes = new Map<string, SdfFunction>();
    for (const primitive of descriptor.primitives)
        nodes.set(primitive.id, (point) => sdfPrimitive(point, primitive));
    let result = descriptor.primitives.length > 0 ? nodes.get(descriptor.primitives[0].id) : undefined;
    for (let index = 0; index < (descriptor.operations?.length ?? 0); index += 1) {
        const operation = descriptor.operations?.[index];
        if (!operation)
            continue;
        const left = nodes.get(operation.left);
        const right = nodes.get(operation.right);
        if (!left || !right)
            continue;
        let combined: SdfFunction;
        switch (operation.type) {
            case 'smooth-union':
                combined = (point) => smin(left(point), right(point), operation.radius ?? 0.1);
                break;
            case 'subtract':
                combined = (point) => Math.max(left(point), -right(point));
                break;
            case 'intersect':
                combined = (point) => Math.max(left(point), right(point));
                break;
        }
        nodes.set(operation.id ?? operation.output ?? `operation-${index}`, combined);
        result = combined;
    }
    return result ?? (() => Infinity);
}
export function polygonizeSdf(descriptor: SdfDescriptor): MeshData {
    const resolution = Math.max(4, Math.min(64, Math.floor(descriptor.resolution)));
    const defaultBounds: {
        readonly min: SdfVector;
        readonly max: SdfVector;
    } = { min: [-2, -2, -2], max: [2, 2, 2] };
    const bounds = descriptor.bounds ?? defaultBounds;
    const min = new Vector3(bounds.min[0], bounds.min[1], bounds.min[2]);
    const step = new Vector3((bounds.max[0] - bounds.min[0]) / resolution, (bounds.max[1] - bounds.min[1]) / resolution, (bounds.max[2] - bounds.min[2]) / resolution);
    const sample = sdfSample(descriptor);
    const scratch = new Vector3();
    const side = resolution + 1;
    const field = new Float32Array(side * side * side);
    const cornerAt = (x: number, y: number, z: number): number => (z * side + y) * side + x;
    for (let z = 0; z < side; z += 1) {
        for (let y = 0; y < side; y += 1) {
            for (let x = 0; x < side; x += 1) {
                scratch.set(min.x + x * step.x, min.y + y * step.y, min.z + z * step.z);
                field[cornerAt(x, y, z)] = sample(scratch);
            }
        }
    }
    const CUBE_EDGES: readonly (readonly [
        number,
        number,
        number,
        number,
        number,
        number
    ])[] = [
        [0, 0, 0, 1, 0, 0], [1, 0, 0, 1, 1, 0], [0, 1, 0, 1, 1, 0], [0, 0, 0, 0, 1, 0],
        [0, 0, 1, 1, 0, 1], [1, 0, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1], [0, 0, 1, 0, 1, 1],
        [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [1, 1, 0, 1, 1, 1], [0, 1, 0, 0, 1, 1],
    ];
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const cellVertex = new Int32Array(resolution * resolution * resolution).fill(-1);
    const cellAt = (x: number, y: number, z: number): number => (z * resolution + y) * resolution + x;
    const epsilon = Math.min(step.x, step.y, step.z) * 0.25;
    const gradient = (point: Vector3): Vector3 => {
        const gx = sample(scratch.set(point.x + epsilon, point.y, point.z))
            - sample(scratch.set(point.x - epsilon, point.y, point.z));
        const gy = sample(scratch.set(point.x, point.y + epsilon, point.z))
            - sample(scratch.set(point.x, point.y - epsilon, point.z));
        const gz = sample(scratch.set(point.x, point.y, point.z + epsilon))
            - sample(scratch.set(point.x, point.y, point.z - epsilon));
        const normal = new Vector3(gx, gy, gz);
        return normal.lengthSquared() < 1e-20 ? new Vector3(0, 1, 0) : normal.normalize();
    };
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                let crossings = 0;
                let sumX = 0;
                let sumY = 0;
                let sumZ = 0;
                for (const [ax, ay, az, bx, by, bz] of CUBE_EDGES) {
                    const a = field[cornerAt(x + ax, y + ay, z + az)];
                    const b = field[cornerAt(x + bx, y + by, z + bz)];
                    if ((a <= 0) === (b <= 0))
                        continue;
                    const t = a / (a - b);
                    sumX += (ax + (bx - ax) * t);
                    sumY += (ay + (by - ay) * t);
                    sumZ += (az + (bz - az) * t);
                    crossings += 1;
                }
                if (crossings === 0)
                    continue;
                const px = min.x + (x + sumX / crossings) * step.x;
                const py = min.y + (y + sumY / crossings) * step.y;
                const pz = min.z + (z + sumZ / crossings) * step.z;
                cellVertex[cellAt(x, y, z)] = positions.length / 3;
                positions.push(px, py, pz);
                const normal = gradient(new Vector3(px, py, pz));
                normals.push(normal.x, normal.y, normal.z);
            }
        }
    }
    const quad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
        if (a < 0 || b < 0 || c < 0 || d < 0)
            return;
        if (flip)
            indices.push(a, c, b, a, d, c);
        else
            indices.push(a, b, c, a, c, d);
    };
    for (let z = 0; z < side; z += 1) {
        for (let y = 0; y < side; y += 1) {
            for (let x = 0; x < side; x += 1) {
                const here = field[cornerAt(x, y, z)] <= 0;
                if (x + 1 < side && y > 0 && z > 0 && y < side - 1 && z < side - 1
                    && here !== (field[cornerAt(x + 1, y, z)] <= 0)) {
                    quad(cellVertex[cellAt(x, y - 1, z - 1)], cellVertex[cellAt(x, y, z - 1)], cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x, y - 1, z)], !here);
                }
                if (y + 1 < side && x > 0 && z > 0 && x < side - 1 && z < side - 1
                    && here !== (field[cornerAt(x, y + 1, z)] <= 0)) {
                    quad(cellVertex[cellAt(x - 1, y, z - 1)], cellVertex[cellAt(x - 1, y, z)], cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x, y, z - 1)], !here);
                }
                if (z + 1 < side && x > 0 && y > 0 && x < side - 1 && y < side - 1
                    && here !== (field[cornerAt(x, y, z + 1)] <= 0)) {
                    quad(cellVertex[cellAt(x - 1, y - 1, z)], cellVertex[cellAt(x, y - 1, z)], cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x - 1, y, z)], !here);
                }
            }
        }
    }
    const geometry = new MeshData();
    geometry.setAttribute('position', new Attribute(positions, 3));
    geometry.setAttribute('normal', new Attribute(normals, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
}
type SubdivisionFace = number[];
type SubdivisionEdge = {
    a: number;
    b: number;
    faces: number[];
};
type SubdivisionUvChannel = {
    name: string;
    faces: Vector2[][];
};
const MAX_SUBDIVISION_QUAD_FACES = 100000;
const MAX_SUBDIVISION_ITERATIONS = 4;
class SubdivisionInputError extends Error {
    readonly iterations: unknown;
    constructor(iterations: unknown) {
        super(`subdivision iterations must be an integer from 0 to ${MAX_SUBDIVISION_ITERATIONS}`);
        this.name = 'SubdivisionInputError';
        this.iterations = iterations;
    }
}
class SubdivisionGeometryBudgetError extends Error {
    readonly sourceFaceCount: number;
    readonly projectedQuadFaceCount: number;
    constructor(sourceFaceCount: number, projectedQuadFaceCount: number) {
        super(`subdivision would produce ${projectedQuadFaceCount} quad faces from ${sourceFaceCount} source faces`);
        this.name = 'SubdivisionGeometryBudgetError';
        this.sourceFaceCount = sourceFaceCount;
        this.projectedQuadFaceCount = projectedQuadFaceCount;
    }
}
class SubdivisionTopologyError extends Error {
    readonly reason: string;
    constructor(reason: string) {
        super(reason);
        this.name = 'SubdivisionTopologyError';
        this.reason = reason;
    }
}
export function subdivideCatmullClark(source: MeshData, iterations: number): MeshData {
    if (!Number.isInteger(iterations) || iterations < 0 || iterations > MAX_SUBDIVISION_ITERATIONS) {
        throw new SubdivisionInputError(iterations);
    }
    if (iterations === 0)
        return source;
    const position = source.getAttribute('position');
    if (!position) {
        source.computeVertexNormals();
        return source;
    }
    const sourcePositions: Vector3[] = [];
    const sourceVertexByKey = new Map<string, number>();
    const sourceUvChannels: SubdivisionUvChannel[] = [];
    for (const name of ['uv', 'uv2']) {
        const attribute = source.getAttribute(name);
        if (attribute && attribute.itemSize >= 2)
            sourceUvChannels.push({ name, faces: [] });
    }
    const vertexIndexAt = (attributeIndex: number): number => {
        const x = position.getX(attributeIndex);
        const y = position.getY(attributeIndex);
        const z = position.getZ(attributeIndex);
        const key = `${Math.round(x * 1000000)},${Math.round(y * 1000000)},${Math.round(z * 1000000)}`;
        const existing = sourceVertexByKey.get(key);
        if (existing !== undefined)
            return existing;
        const vertexIndex = sourcePositions.length;
        sourcePositions.push(new Vector3(x, y, z));
        sourceVertexByKey.set(key, vertexIndex);
        return vertexIndex;
    };
    const sourceIndex = source.getIndex();
    const sourceVertexCount = sourceIndex?.count ?? position.count;
    const sourceTriangles: SubdivisionFace[] = [];
    const sourceTriangleAttributeIndices: number[][] = [];
    for (let index = 0; index + 2 < sourceVertexCount; index += 3) {
        const attributeA = sourceIndex ? sourceIndex.getX(index) : index;
        const attributeB = sourceIndex ? sourceIndex.getX(index + 1) : index + 1;
        const attributeC = sourceIndex ? sourceIndex.getX(index + 2) : index + 2;
        const a = vertexIndexAt(attributeA);
        const b = vertexIndexAt(attributeB);
        const c = vertexIndexAt(attributeC);
        if (a !== b && b !== c && c !== a) {
            sourceTriangles.push([a, b, c]);
            sourceTriangleAttributeIndices.push([attributeA, attributeB, attributeC]);
        }
    }
    const triangleNormal = (face: SubdivisionFace): Vector3 => {
        const a = sourcePositions[face[0]];
        const b = sourcePositions[face[1]];
        const c = sourcePositions[face[2]];
        return subtractVectors(b, a).cross(subtractVectors(c, a)).normalize();
    };
    const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const triangleEdges = new Map<string, number[]>();
    for (let triangleIndex = 0; triangleIndex < sourceTriangles.length; triangleIndex += 1) {
        const triangle = sourceTriangles[triangleIndex];
        for (let vertexIndex = 0; vertexIndex < triangle.length; vertexIndex += 1) {
            const a = triangle[vertexIndex];
            const b = triangle[(vertexIndex + 1) % triangle.length];
            const key = edgeKey(a, b);
            const entries = triangleEdges.get(key) ?? [];
            entries.push(triangleIndex);
            triangleEdges.set(key, entries);
        }
    }
    const pairedTriangles = new Set<number>();
    let faces: SubdivisionFace[] = [];
    let faceAttributeIndices: number[][] = [];
    for (const triangleIndices of triangleEdges.values()) {
        if (triangleIndices.length !== 2)
            continue;
        const leftIndex = triangleIndices[0];
        const rightIndex = triangleIndices[1];
        if (pairedTriangles.has(leftIndex) || pairedTriangles.has(rightIndex))
            continue;
        const left = sourceTriangles[leftIndex];
        const right = sourceTriangles[rightIndex];
        if (triangleNormal(left).dot(triangleNormal(right)) < 0.999999)
            continue;
        const leftAttributes = sourceTriangleAttributeIndices[leftIndex];
        const rightAttributes = sourceTriangleAttributeIndices[rightIndex];
        const directedEdges: Array<{
            start: number;
            end: number;
            attributeIndex: number;
        }> = [
            { start: left[0], end: left[1], attributeIndex: leftAttributes[0] },
            { start: left[1], end: left[2], attributeIndex: leftAttributes[1] },
            { start: left[2], end: left[0], attributeIndex: leftAttributes[2] },
            { start: right[0], end: right[1], attributeIndex: rightAttributes[0] },
            { start: right[1], end: right[2], attributeIndex: rightAttributes[1] },
            { start: right[2], end: right[0], attributeIndex: rightAttributes[2] },
        ];
        const boundaryEdges = directedEdges.filter((edge, edgeIndex) => !directedEdges.some((candidate, candidateIndex) => (candidateIndex !== edgeIndex && candidate.start === edge.end && candidate.end === edge.start)));
        if (boundaryEdges.length !== 4)
            continue;
        const face: number[] = [];
        const attributeIndices: number[] = [];
        let edge = boundaryEdges[0];
        let closesFace = false;
        while (face.length < 4) {
            face.push(edge.start);
            attributeIndices.push(edge.attributeIndex);
            if (face.length === 4) {
                closesFace = edge.end === face[0];
                break;
            }
            const nextEdge = boundaryEdges.find((candidate) => candidate.start === edge.end);
            if (!nextEdge)
                break;
            edge = nextEdge;
        }
        if (face.length === 4 && closesFace) {
            faces.push(face);
            faceAttributeIndices.push(attributeIndices);
            pairedTriangles.add(leftIndex);
            pairedTriangles.add(rightIndex);
        }
    }
    for (let triangleIndex = 0; triangleIndex < sourceTriangles.length; triangleIndex += 1) {
        if (!pairedTriangles.has(triangleIndex)) {
            faces.push(sourceTriangles[triangleIndex]);
            faceAttributeIndices.push(sourceTriangleAttributeIndices[triangleIndex]);
        }
    }
    if (faces.length === 0) {
        source.computeVertexNormals();
        return source;
    }
    for (const channel of sourceUvChannels) {
        const attribute = source.getAttribute(channel.name);
        if (!attribute)
            continue;
        channel.faces = faceAttributeIndices.map((indices) => (indices.map((attributeIndex) => new Vector2(attribute.getX(attributeIndex), attribute.getY(attributeIndex)))));
    }
    const sourceFaceCount = faces.length;
    const projectedQuadFaceCount = sourceFaceCount * 4 ** iterations;
    if (projectedQuadFaceCount > MAX_SUBDIVISION_QUAD_FACES) {
        throw new SubdivisionGeometryBudgetError(sourceFaceCount, projectedQuadFaceCount);
    }
    let vertices = sourcePositions;
    let uvChannels = sourceUvChannels;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const facePoints = faces.map((face) => {
            const point = new Vector3();
            for (const vertexIndex of face)
                point.addInPlace(vertices[vertexIndex]);
            return point.scaleInPlace(1 / face.length);
        });
        const vertexFaces: number[][] = Array.from({ length: vertices.length }, () => []);
        const vertexEdges: number[][] = Array.from({ length: vertices.length }, () => []);
        const faceEdges: number[][] = faces.map(() => []);
        const edges: SubdivisionEdge[] = [];
        const edgeIndices = new Map<string, number>();
        for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
            const face = faces[faceIndex];
            for (const vertexIndex of face)
                vertexFaces[vertexIndex].push(faceIndex);
            for (let vertexIndex = 0; vertexIndex < face.length; vertexIndex += 1) {
                const a = face[vertexIndex];
                const b = face[(vertexIndex + 1) % face.length];
                const key = edgeKey(a, b);
                let edgeIndex = edgeIndices.get(key);
                if (edgeIndex === undefined) {
                    edgeIndex = edges.length;
                    edges.push({ a: Math.min(a, b), b: Math.max(a, b), faces: [] });
                    edgeIndices.set(key, edgeIndex);
                }
                edges[edgeIndex].faces.push(faceIndex);
                vertexEdges[a].push(edgeIndex);
                vertexEdges[b].push(edgeIndex);
                faceEdges[faceIndex].push(edgeIndex);
            }
        }
        for (const edge of edges) {
            if (edge.faces.length > 2) {
                throw new SubdivisionTopologyError(`non-manifold edge ${edge.a}:${edge.b} has ${edge.faces.length} incident faces`);
            }
            if (edge.faces.length === 1) {
                throw new SubdivisionTopologyError(`open boundary edge ${edge.a}:${edge.b} has 1 incident face`);
            }
        }
        for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex += 1) {
            const incidentFaces = vertexFaces[vertexIndex];
            if (incidentFaces.length < 2)
                continue;
            const connectedFaces = new Set<number>();
            const pendingFaces = [incidentFaces[0]];
            while (pendingFaces.length > 0) {
                const faceIndex = pendingFaces.pop();
                if (faceIndex === undefined || connectedFaces.has(faceIndex))
                    continue;
                connectedFaces.add(faceIndex);
                for (const edgeIndex of vertexEdges[vertexIndex]) {
                    const edge = edges[edgeIndex];
                    if (edge.faces.length !== 2 || !edge.faces.includes(faceIndex))
                        continue;
                    const adjacentFace = edge.faces[0] === faceIndex ? edge.faces[1] : edge.faces[0];
                    if (!connectedFaces.has(adjacentFace))
                        pendingFaces.push(adjacentFace);
                }
            }
            if (connectedFaces.size !== incidentFaces.length) {
                throw new SubdivisionTopologyError(`vertex ${vertexIndex} has a disconnected incident face fan`);
            }
        }
        const nextVertices: Vector3[] = [];
        for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex += 1) {
            const vertex = vertices[vertexIndex];
            const incidentFaces = vertexFaces[vertexIndex];
            const incidentEdges = vertexEdges[vertexIndex];
            if (incidentFaces.length === 0 || incidentEdges.length === 0) {
                nextVertices.push(vertex.clone());
                continue;
            }
            const faceAverage = new Vector3();
            for (const faceIndex of incidentFaces)
                faceAverage.addInPlace(facePoints[faceIndex]);
            faceAverage.scaleInPlace(1 / incidentFaces.length);
            const edgeAverage = new Vector3();
            for (const edgeIndex of incidentEdges) {
                const edge = edges[edgeIndex];
                edgeAverage.addInPlace(vertices[edge.a].clone().addInPlace(vertices[edge.b]).scaleInPlace(0.5));
            }
            edgeAverage.scaleInPlace(1 / incidentEdges.length);
            nextVertices.push(vertex.clone()
                .scaleInPlace(incidentFaces.length - 3)
                .addInPlace(faceAverage)
                .addInPlace(edgeAverage.scale(2))
                .scaleInPlace(1 / incidentFaces.length));
        }
        const nextUvChannels = uvChannels.map((channel) => {
            const nextFaces: Vector2[][] = [];
            for (const faceValues of channel.faces) {
                const faceValue = new Vector2();
                for (const value of faceValues)
                    faceValue.addInPlace(value);
                faceValue.scaleInPlace(1 / faceValues.length);
                for (let vertexIndex = 0; vertexIndex < faceValues.length; vertexIndex += 1) {
                    const value = faceValues[vertexIndex];
                    const nextValue = faceValues[(vertexIndex + 1) % faceValues.length];
                    const previousValue = faceValues[(vertexIndex + faceValues.length - 1) % faceValues.length];
                    nextFaces.push([
                        value.clone(),
                        value.clone().addInPlace(nextValue).scaleInPlace(0.5),
                        faceValue.clone(),
                        previousValue.clone().addInPlace(value).scaleInPlace(0.5),
                    ]);
                }
            }
            return { name: channel.name, faces: nextFaces };
        });
        const edgePointIndices: number[] = [];
        for (const edge of edges) {
            const point = vertices[edge.a].clone().addInPlace(vertices[edge.b]);
            if (edge.faces.length >= 2) {
                point.addInPlace(facePoints[edge.faces[0]]).addInPlace(facePoints[edge.faces[1]]).scaleInPlace(0.25);
            }
            else {
                point.scaleInPlace(0.5);
            }
            edgePointIndices.push(nextVertices.length);
            nextVertices.push(point);
        }
        const facePointIndices: number[] = [];
        for (const point of facePoints) {
            facePointIndices.push(nextVertices.length);
            nextVertices.push(point);
        }
        const nextFaces: number[][] = [];
        for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
            const face = faces[faceIndex];
            const faceEdgeIndices = faceEdges[faceIndex];
            for (let vertexIndex = 0; vertexIndex < face.length; vertexIndex += 1) {
                const previousEdgeIndex = (vertexIndex + faceEdgeIndices.length - 1) % faceEdgeIndices.length;
                nextFaces.push([
                    face[vertexIndex],
                    edgePointIndices[faceEdgeIndices[vertexIndex]],
                    facePointIndices[faceIndex],
                    edgePointIndices[faceEdgeIndices[previousEdgeIndex]],
                ]);
            }
        }
        vertices = nextVertices;
        uvChannels = nextUvChannels;
        faces = nextFaces;
    }
    const topologyPositions: number[] = [];
    for (const vertex of vertices)
        topologyPositions.push(vertex.x, vertex.y, vertex.z);
    const topologyIndices: number[] = [];
    for (const face of faces) {
        for (let vertexIndex = 1; vertexIndex + 1 < face.length; vertexIndex += 1) {
            topologyIndices.push(face[0], face[vertexIndex], face[vertexIndex + 1]);
        }
    }
    const topologyGeometry = new MeshData();
    topologyGeometry.setAttribute('position', new Attribute(topologyPositions, 3));
    topologyGeometry.setIndex(topologyIndices);
    topologyGeometry.computeVertexNormals();
    let geometry = topologyGeometry;
    if (uvChannels.length > 0) {
        const normals = topologyGeometry.getAttribute('normal');
        const positions: number[] = [];
        const normalValues: number[] = [];
        const indices: number[] = [];
        const seamUvValues: Array<{
            name: string;
            values: number[];
        }> = uvChannels.map((channel) => ({ name: channel.name, values: [] }));
        for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
            const face = faces[faceIndex];
            const cornerIndices: number[] = [];
            const faceStart = positions.length / 3;
            for (let vertexIndex = 0; vertexIndex < face.length; vertexIndex += 1) {
                const topologyIndex = face[vertexIndex];
                const vertex = vertices[topologyIndex];
                positions.push(vertex.x, vertex.y, vertex.z);
                normalValues.push(normals.getX(topologyIndex), normals.getY(topologyIndex), normals.getZ(topologyIndex));
                for (let channelIndex = 0; channelIndex < uvChannels.length; channelIndex += 1) {
                    const value = uvChannels[channelIndex].faces[faceIndex][vertexIndex];
                    seamUvValues[channelIndex].values.push(value.x, value.y);
                }
                cornerIndices.push(faceStart + vertexIndex);
            }
            for (let vertexIndex = 1; vertexIndex + 1 < cornerIndices.length; vertexIndex += 1) {
                indices.push(cornerIndices[0], cornerIndices[vertexIndex], cornerIndices[vertexIndex + 1]);
            }
        }
        geometry = new MeshData();
        geometry.setAttribute('position', new Attribute(positions, 3));
        geometry.setAttribute('normal', new Attribute(normalValues, 3));
        geometry.setIndex(indices);
        for (const channel of seamUvValues) {
            geometry.setAttribute(channel.name, new Attribute(channel.values, 2));
        }
    }
    geometry.userData.subdivision = {
        method: 'catmull-clark-style',
        sourceFaceCount,
        quadFaceCount: faces.length,
        iterations,
    };
    return geometry;
}
export function buildWatertightCapsule(radius: number, cylLength: number, capSegments: number, radialSegments: number, heightSegments: number): MeshData {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const halfCyl = cylLength / 2;
    const totalSpan = 2 * (Math.PI / 2 * radius) + Math.max(0, cylLength);
    const vOf = (fromBottom: number) => (totalSpan > 0 ? fromBottom / totalSpan : 0);
    const bottomPoleIndex = positions.length / 3;
    positions.push(0, -halfCyl - radius, 0);
    uvs.push(0.5, vOf(0));
    const ringStarts: number[] = [];
    const ringV: number[] = [];
    for (let ring = 1; ring <= capSegments; ring += 1) {
        const phi = (Math.PI / 2) * (ring / capSegments);
        const y = -halfCyl - radius * Math.cos(phi);
        const r = radius * Math.sin(phi);
        const start = positions.length / 3;
        ringStarts.push(start);
        ringV.push(vOf(radius * phi));
        for (let radial = 0; radial < radialSegments; radial += 1) {
            const theta = (radial / radialSegments) * Math.PI * 2;
            positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
            uvs.push(radial / radialSegments, vOf(radius * phi));
        }
    }
    const cylinderRingStarts: number[] = [];
    if (cylLength > 0) {
        for (let step = 1; step <= heightSegments; step += 1) {
            const y = -halfCyl + (cylLength * step) / heightSegments;
            const start = positions.length / 3;
            cylinderRingStarts.push(start);
            const v = vOf(radius * (Math.PI / 2) + halfCyl + y);
            for (let radial = 0; radial < radialSegments; radial += 1) {
                const theta = (radial / radialSegments) * Math.PI * 2;
                positions.push(radius * Math.cos(theta), y, radius * Math.sin(theta));
                uvs.push(radial / radialSegments, v);
            }
        }
    }
    const topRingStarts: number[] = [];
    for (let ring = capSegments - 1; ring >= 1; ring -= 1) {
        const phi = (Math.PI / 2) * (ring / capSegments);
        const y = halfCyl + radius * Math.cos(phi);
        const r = radius * Math.sin(phi);
        const start = positions.length / 3;
        topRingStarts.push(start);
        const v = vOf(radius * (Math.PI / 2) + Math.max(0, cylLength) + radius * (Math.PI / 2 - phi));
        for (let radial = 0; radial < radialSegments; radial += 1) {
            const theta = (radial / radialSegments) * Math.PI * 2;
            positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
            uvs.push(radial / radialSegments, v);
        }
    }
    const topPoleIndex = positions.length / 3;
    positions.push(0, halfCyl + radius, 0);
    uvs.push(0.5, vOf(totalSpan));
    const firstBottomRing = ringStarts[0];
    for (let radial = 0; radial < radialSegments; radial += 1) {
        const next = (radial + 1) % radialSegments;
        indices.push(bottomPoleIndex, firstBottomRing + radial, firstBottomRing + next);
    }
    const allRings = [...ringStarts, ...cylinderRingStarts, ...topRingStarts];
    for (let i = 0; i < allRings.length - 1; i += 1) {
        const a = allRings[i];
        const b = allRings[i + 1];
        for (let radial = 0; radial < radialSegments; radial += 1) {
            const next = (radial + 1) % radialSegments;
            indices.push(a + radial, a + next, b + next);
            indices.push(a + radial, b + next, b + radial);
        }
    }
    const lastRing = allRings[allRings.length - 1];
    for (let radial = 0; radial < radialSegments; radial += 1) {
        const next = (radial + 1) % radialSegments;
        indices.push(topPoleIndex, lastRing + next, lastRing + radial);
    }
    const geometry = new MeshData();
    geometry.setAttribute('position', new Attribute(positions, 3));
    geometry.setAttribute('uv', new Attribute(uvs, 2));
    // Upstream capsule indices were inward (negative signed volume); correct the native surface.
    for (let i = 0; i < indices.length; i += 3)
        [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
export function buildGroundBladeGeometry(spec: {
    stations: [
        number,
        number,
        number
    ][];
    thickness?: number;
    grindFrac?: number;
    swedgeFromTipFrac?: number;
}): MeshData {
    const st = spec.stations;
    const T = (spec.thickness ?? 0.05) / 2;
    const grindFrac = spec.grindFrac ?? 0.55;
    const swedgeFrac = spec.swedgeFromTipFrac ?? 0.34;
    const xG = st[0][0];
    const xT = st[st.length - 1][0];
    const len = (xT - xG) || 1;
    let yMin = Infinity, yMax = -Infinity;
    for (const s of st) {
        yMin = Math.min(yMin, s[2]);
        yMax = Math.max(yMax, s[1]);
    }
    const yH = (yMax - yMin) || 1;
    const ring = (s: [
        number,
        number,
        number
    ]): [
        number,
        number,
        number
    ][] => {
        const [x, topY, botY] = s;
        const h = Math.max(1e-4, topY - botY);
        const grindY = botY + grindFrac * h;
        const swedgeY = topY - 0.42 * h;
        const sz = ((xT - x) / len < swedgeFrac) ? 0 : T;
        return [
            [x, botY, 0], [x, grindY, T], [x, swedgeY, T], [x, topY, sz],
            [x, topY, -sz], [x, swedgeY, -T], [x, grindY, -T],
        ];
    };
    const pos: number[] = [];
    const tri = (a: number[], b: number[], c: number[]) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
    let A = ring(st[0]);
    for (let k = 1; k < 6; k++)
        tri(A[0], A[k], A[k + 1]);
    for (let i = 1; i < st.length; i++) {
        const B = ring(st[i]);
        for (let k = 0; k < 7; k++) {
            const k2 = (k + 1) % 7;
            tri(A[k], A[k2], B[k2]);
            tri(A[k], B[k2], B[k]);
        }
        A = B;
    }
    const g = new MeshData();
    g.setAttribute('position', new Attribute(pos, 3));
    g.computeVertexNormals();
    const uv: number[] = [];
    for (let t = 0; t < pos.length; t += 3)
        uv.push((pos[t] - xG) / len, (pos[t + 1] - yMin) / yH);
    g.setAttribute('uv', new Attribute(uv, 2));
    return g;
}
type TaperedStation = {
    position: [
        number,
        number,
        number
    ];
    rx: number;
    rz: number;
    twist?: number;
};
export function buildTaperedSweepGeometry(sweep: {
    stations: TaperedStation[];
    radialSegments?: number;
    capEnds?: boolean;
}): MeshData {
    const stations = sweep.stations;
    if (stations.length < 2)
        throw new Error('tapered-sweep needs at least two stations');
    const radial = Math.max(3, sweep.radialSegments ?? 10);
    const centres = stations.map((s) => new Vector3(...s.position));
    const tangents = centres.map((_, i) => {
        const prev = centres[Math.max(0, i - 1)];
        const next = centres[Math.min(centres.length - 1, i + 1)];
        const t = next.clone().subtractInPlace(prev);
        return t.lengthSquared() < 1e-12 ? new Vector3(0, 1, 0) : t.normalize();
    });
    let ref = new Vector3(0, 0, 1);
    if (Math.abs(tangents[0].dot(ref)) > 0.9)
        ref = new Vector3(1, 0, 0);
    const normals: Vector3[] = [];
    const binormals: Vector3[] = [];
    let carried = ref.clone().subtractInPlace(tangents[0].clone().scaleInPlace(ref.dot(tangents[0]))).normalize();
    for (let i = 0; i < tangents.length; i += 1) {
        const t = tangents[i];
        const n = carried.clone().subtractInPlace(t.clone().scaleInPlace(carried.dot(t)));
        if (n.lengthSquared() < 1e-12) {
            const fallback = Math.abs(t.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
            n.copyFrom(fallback.subtractInPlace(t.clone().scaleInPlace(fallback.dot(t))));
        }
        n.normalize();
        normals.push(n);
        binormals.push(Vector3.Cross(t, n).normalize());
        carried = n;
    }
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const ringStart: number[] = [];
    const isPoint: boolean[] = [];
    for (let i = 0; i < stations.length; i += 1) {
        const st = stations[i];
        const v = i / (stations.length - 1);
        ringStart.push(positions.length / 3);
        if (st.rx <= 1e-6 && st.rz <= 1e-6) {
            isPoint.push(true);
            positions.push(centres[i].x, centres[i].y, centres[i].z);
            uvs.push(0.5, v);
            continue;
        }
        isPoint.push(false);
        const twist = ((st.twist ?? 0) * Math.PI) / 180;
        for (let j = 0; j <= radial; j += 1) {
            const theta = (j / radial) * Math.PI * 2 + twist;
            const offset = normals[i].clone().scaleInPlace(Math.cos(theta) * st.rx)
                .addInPlace(binormals[i].clone().scaleInPlace(Math.sin(theta) * st.rz));
            const p = centres[i].clone().addInPlace(offset);
            positions.push(p.x, p.y, p.z);
            uvs.push(j / radial, v);
        }
    }
    for (let i = 0; i < stations.length - 1; i += 1) {
        const a0 = ringStart[i];
        const b0 = ringStart[i + 1];
        if (isPoint[i] && isPoint[i + 1])
            continue;
        for (let j = 0; j < radial; j += 1) {
            if (isPoint[i])
                indices.push(a0, b0 + j + 1, b0 + j);
            else if (isPoint[i + 1])
                indices.push(a0 + j, a0 + j + 1, b0);
            else
                indices.push(a0 + j, a0 + j + 1, b0 + j, a0 + j + 1, b0 + j + 1, b0 + j);
        }
    }
    if (sweep.capEnds ?? true) {
        for (const end of [0, stations.length - 1]) {
            if (isPoint[end])
                continue;
            const centreIndex = positions.length / 3;
            positions.push(centres[end].x, centres[end].y, centres[end].z);
            uvs.push(0.5, end === 0 ? 0 : 1);
            const base = ringStart[end];
            for (let j = 0; j < radial; j += 1) {
                if (end === 0)
                    indices.push(centreIndex, base + j + 1, base + j);
                else
                    indices.push(centreIndex, base + j, base + j + 1);
            }
        }
    }
    const geometry = new MeshData();
    geometry.setAttribute('position', new Attribute(positions, 3));
    geometry.setAttribute('uv', new Attribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
