// 匯出 mesh 世界 AABB 與（由 spec 推導的）collider 世界 AABB，供 forge/check_colliders.py。
// 用法: npx tsx scripts/runtime_export.ts <model-name> --spec <spec.json> --out <runtime.json>
import { Matrix, Vector3 } from "@babylonjs/core";
import { readFileSync, writeFileSync } from "node:fs";
import { createHeadlessScene } from "../src/headless";
import { registry } from "../src/registry";

interface SpecCollider { type: string; size: number[]; offset: number[] }
interface SpecComponent { id: string; collider?: SpecCollider }
interface SpecBody { id: string; components: string[]; mass: number; centerOfMass?: number[] }
interface Spec { componentTree: SpecComponent[]; physics: { bodies: SpecBody[] } }

function colliderVolume(c: SpecCollider): number {
  const [sx, sy, sz] = c.size;
  switch (c.type) {
    case "box": return sx * sy * sz;
    case "sphere": { const r = sx / 2; return (4 / 3) * Math.PI * r ** 3; }
    case "cylinder": return Math.PI * (sx / 2) * (sz / 2) * sy;
    case "capsule": {
      const r = sx / 2; const h = Math.max(sy - 2 * r, 0);
      return Math.PI * r * r * h + (4 / 3) * Math.PI * r ** 3;
    }
    default: return sx * sy * sz * 0.7; // convex：AABB 體積保守估計
  }
}

function worldAabbOfLocalBox(
  size: number[], offset: number[], world: Matrix,
): { min: number[]; max: number[] } {
  const [sx, sy, sz] = size;
  const [ox, oy, oz] = offset;
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const dx of [-0.5, 0.5]) for (const dy of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) {
    const p = Vector3.TransformCoordinates(
      new Vector3(ox + dx * sx, oy + dy * sy, oz + dz * sz), world,
    );
    min.minimizeInPlace(p);
    max.maximizeInPlace(p);
  }
  return { min: min.asArray(), max: max.asArray() };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const specPath = argv[argv.indexOf("--spec") + 1];
  const outPath = argv[argv.indexOf("--out") + 1];
  if (!name || !(name in registry) || !specPath || !outPath) {
    console.error("用法: runtime_export.ts <model-name> --spec <spec.json> --out <runtime.json>");
    return 2;
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  const comps = new Map(spec.componentTree.map((c) => [c.id, c]));

  const ctx = await createHeadlessScene();
  const factory = (await registry[name]()).default;
  const model = factory(ctx.scene, { physics: true });
  ctx.scene.render(); // 讓世界矩陣就緒

  const meshes = Object.entries(model.meshes).map(([component, m]) => {
    m.computeWorldMatrix(true);
    // 此 Babylon 版本的 refreshBoundingInfo 無零參數多載，需傳入 IMeshDataOptions（可為空物件）。
    m.refreshBoundingInfo({});
    const bb = m.getBoundingInfo().boundingBox;
    return {
      component,
      aabb: { min: bb.minimumWorld.asArray(), max: bb.maximumWorld.asArray() },
    };
  });

  const bodies = spec.physics.bodies.map((b) => {
    const colliders = b.components.flatMap((cid) => {
      const c = comps.get(cid);
      const node = model.nodes[cid];
      if (!c?.collider || !node) return [];
      node.computeWorldMatrix(true);
      return [{
        component: cid,
        type: c.collider.type,
        aabb: worldAabbOfLocalBox(c.collider.size, c.collider.offset, node.getWorldMatrix()),
        volume: Number(colliderVolume(c.collider).toFixed(8)),
      }];
    });
    const first = model.nodes[b.components[0]];
    first.computeWorldMatrix(true);
    const com = Vector3.TransformCoordinates(
      Vector3.FromArray(b.centerOfMass ?? [0, 0, 0]), first.getWorldMatrix(),
    );
    return { id: b.id, mass: b.mass, centerOfMassWorld: com.asArray(), colliders };
  });

  const out = { model: name, meshes, bodies };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ out: outPath, meshes: meshes.length, bodies: bodies.length }));
  ctx.dispose();
  return 0;
}

main().then((code) => process.exit(code));
