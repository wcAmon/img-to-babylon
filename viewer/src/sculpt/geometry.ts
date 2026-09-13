import { Mesh, MeshBuilder, Scene, VertexData } from '@babylonjs/core';
import type { SculptComponent } from './types';

/** Ring lofts use metres baked into vertices. The same recipe can be refined locally without changing IDs. */
export function createGeometry(c: SculptComponent, scene: Scene, scale: number): Mesh {
  const { w, h, d } = c.dimensions;
  if (c.geometry.kind === 'box') return MeshBuilder.CreateBox(c.id, { width: w * scale, height: h * scale, depth: d * scale }, scene);
  if (c.geometry.kind === 'ellipsoid') return MeshBuilder.CreateSphere(c.id, {
    diameterX: w * scale, diameterY: h * scale, diameterZ: d * scale, segments: c.geometry.segments ?? 12,
  }, scene);
  const rings = c.geometry.rings ?? [[-.5, .5, .5], [.5, .5, .5]];
  const n = c.geometry.segments ?? 10;
  const positions: number[] = [], indices: number[] = [], normals: number[] = [];
  for (const [y, rx, rz, cx = 0, cz = 0] of rings) {
    for (let i = 0; i < n; i++) {
      const a = i * Math.PI * 2 / n;
      const curve = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), c.geometry.power ?? 1);
      positions.push((cx + curve(Math.sin(a)) * rx) * w * scale, y * h * scale, (cz + curve(Math.cos(a)) * rz) * d * scale);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < n; i++) {
    const a = r * n + i, b = r * n + (i + 1) % n, c = a + n, e = b + n;
    indices.push(a, b, c, b, e, c);
  }
  for (const [r, top] of [[0, false], [rings.length - 1, true]] as const) {
    const ring = rings[r];
    const center = positions.length / 3;
    positions.push((ring[3] ?? 0) * w * scale, ring[0] * h * scale, (ring[4] ?? 0) * d * scale);
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + (i + 1) % n;
      indices.push(center, top ? a : b, top ? b : a);
    }
  }
  // Babylon's default left-handed winding is clockwise from the outside.
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions; data.indices = indices; data.normals = normals;
  const mesh = new Mesh(c.id, scene);
  data.applyToMesh(mesh);
  if (!c.geometry.smooth) mesh.convertToFlatShadedMesh();
  return mesh;
}
