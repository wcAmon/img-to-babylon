import { Mesh, MeshBuilder, Scene, VertexData } from '@babylonjs/core';
import type { SculptComponent } from './types';

/** Ear clipping preserves concave eyebrow/eyelid outlines without filling their notches. */
export function triangulateOutline(points: number[][]): number[] {
  const cross=(a:number[],b:number[],c:number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const area=points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0);
  const sign=Math.sign(area);
  if(!sign) throw new Error('Degenerate patch outline');
  const remaining=points.map((_,i)=>i), result:number[]=[];
  while(remaining.length>3) {
    let found=false;
    for(let i=0;i<remaining.length;i++) {
      const a=remaining[(i+remaining.length-1)%remaining.length], b=remaining[i], c=remaining[(i+1)%remaining.length];
      if(cross(points[a],points[b],points[c])*sign<=1e-12) continue;
      if(remaining.some(j=>j!==a&&j!==b&&j!==c&&
        cross(points[a],points[b],points[j])*sign>=-1e-12&&
        cross(points[b],points[c],points[j])*sign>=-1e-12&&
        cross(points[c],points[a],points[j])*sign>=-1e-12)) continue;
      result.push(...(sign<0?[a,b,c]:[a,c,b])); remaining.splice(i,1);found=true;break;
    }
    if(!found) throw new Error('Patch outline must be a simple polygon');
  }
  result.push(...(sign<0?remaining:[remaining[0],remaining[2],remaining[1]]));
  return result;
}

/** Ring lofts use metres baked into vertices. The same recipe can be refined locally without changing IDs. */
export function createGeometry(c: SculptComponent, scene: Scene, scale: number): Mesh {
  const { w, h, d } = c.dimensions;
  if(c.geometry.kind === 'patch') {
    const outline=c.geometry.outline!;
    const positions=[0,0,(c.geometry.dome ?? .5)*d*scale], indices:number[]=[], normals:number[]=[];
    if(c.geometry.dome===0) {
      positions.length=0;
      for(const [x,y,z=0] of outline) positions.push(x*w*scale,y*h*scale,z*d*scale);
      indices.push(...triangulateOutline(outline));
    } else {
    // Clockwise authored outline; intermediate ring keeps facial patches smoothly convex.
    const factors=[.2,.4,.6,.8,1];
    for(const factor of factors) for(const [x,y,z=0] of outline) {
      positions.push(x*w*scale*factor,y*h*scale*factor,(z*factor+Math.pow(1-factor*factor,2)*(c.geometry.dome ?? .5))*d*scale);
    }
    const n=outline.length;
    for(let i=0;i<n;i++) {
      const a=i+1,b=(i+1)%n+1;
      indices.push(0,a,b);
      for(let ring=0;ring<factors.length-1;ring++) {
        const u=a+ring*n,v=b+ring*n;
        indices.push(u,u+n,v,v,u+n,v+n);
      }
    }
    }
    VertexData.ComputeNormals(positions,indices,normals);
    const mesh=new Mesh(c.id,scene), data=new VertexData();
    data.positions=positions;data.indices=indices;data.normals=normals;data.applyToMesh(mesh);
    return mesh;
  }
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
