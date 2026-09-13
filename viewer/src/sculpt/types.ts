export type Vec3 = [number, number, number];
export interface SculptComponent {
  id: string;
  name: string;
  level: string;
  group: string;
  parent: string | null;
  dimensions: { w: number; h: number; d: number };
  transform: { position: Vec3; rotation: Vec3; scale: Vec3 };
  material: string;
  geometry: { kind: 'loft' | 'box' | 'ellipsoid' | 'patch'; segments?: number; rings?: number[][]; smooth?: boolean; power?: number; outline?: number[][]; dome?: number };
  collider?: { type: string; size: Vec3; offset: Vec3 };
}
export interface SculptSpec {
  targetName: string;
  buildStage: string;
  componentTree: SculptComponent[];
  materials: { id: string; baseColor: Vec3; roughness: number }[];
  physics: { bodies: { id: string; components: string[]; mass: number; friction: number; restitution: number; centerOfMass?: Vec3 }[]; constraints: unknown[] };
}
