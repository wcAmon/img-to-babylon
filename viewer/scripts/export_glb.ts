// Export a registered procedural model as a GLB in metres, grounded and XZ-centred.
// Physics bodies, actuators and motionTimeline are not exported; the output is a static pose.
// Usage: npx tsx scripts/export_glb.ts <model-id> <out.glb> [--pose factory|settled] [--settle-frames 120] [--name <scene-name>] [--force]
// Exit 0 ok, 1 reload comparison failed, 2 usage. Full audit: python3 glb-ready/scripts/glb_audit.py <out.glb>
import { AbstractMesh, FreeCamera, LoadAssetContainerAsync, Mesh, NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { GLTF2Export } from "@babylonjs/serializers/glTF";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHeadlessScene } from "../src/headless";
import { registry } from "../src/registry";

export interface ExportSummary { triangles: number; size: [number, number, number]; bytes: number; minY: number; nodes: number }
export interface ExportOptions { pose: "factory" | "settled"; settleFrames: number; name?: string }

function meshTriangles(meshes: AbstractMesh[]): number {
  let total = 0;
  for (const m of meshes) {
    if (!(m instanceof Mesh) || m.getTotalVertices() === 0) continue;
    const indices = m.getTotalIndices();
    const count = indices > 0 ? indices / 3 : m.getTotalVertices() / 3;
    total += Math.floor(count) * (1 + m.instances.length);
  }
  return total;
}

function worldBounds(meshes: AbstractMesh[]): { min: Vector3; max: Vector3 } {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of meshes) {
    if (m.getTotalVertices() === 0) continue;
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo({});
    const bb = m.getBoundingInfo().boundingBox;
    min.minimizeInPlace(bb.minimumWorld);
    max.maximizeInPlace(bb.maximumWorld);
  }
  return { min, max };
}

function isDebugNode(n: TransformNode): boolean {
  const name = n.name.toLowerCase();
  return name.startsWith("__debug") || name.includes("physicsviewer") || name.includes("utilitylayer");
}

export async function exportModelToGlb(id: string, out: string, opts: ExportOptions): Promise<ExportSummary> {
  if (!(id in registry)) throw new Error(`unknown model id ${id}; known: ${Object.keys(registry).join(", ")}`);
  const ctx = await createHeadlessScene();
  try {
    const factory = (await registry[id]()).default;
    const model = factory(ctx.scene, { physics: true });
    if (opts.pose === "settled" && opts.settleFrames > 0) ctx.step(opts.settleFrames);
    // Static export: drop the bodies first so Havok stops writing transforms, then scale back to spec metres.
    for (const body of Object.values(model.bodies)) body.dispose();
    for (const c of model.constraints) c.dispose();
    const root = model.root;
    const inv = 1 / model.physicsScale;
    root.scaling.scaleInPlace(inv);
    root.position.scaleInPlace(inv);
    ctx.scene.render();
    const meshes = root.getChildMeshes(false);
    const { min, max } = worldBounds(meshes);
    // Ground and centre by moving the root's direct children, not the root: the glTF serializer drops any node
    // translation within Babylon's Epsilon (0.001), which is exactly the 1 mm clearance some models use.
    const offset = new Vector3((min.x + max.x) / 2, min.y, (min.z + max.z) / 2);
    const rootRotated = root.rotationQuaternion ? !root.rotationQuaternion.equalsWithEpsilon(root.rotationQuaternion.clone().set(0, 0, 0, 1)) : root.rotation.lengthSquared() > 0;
    if (rootRotated) {
      root.position.subtractInPlace(offset);
    } else {
      const childOffset = new Vector3(offset.x / root.scaling.x, offset.y / root.scaling.y, offset.z / root.scaling.z);
      for (const child of root.getChildTransformNodes(true)) child.position.subtractInPlace(childOffset); // meshes are TransformNodes too
    }
    ctx.scene.render();
    const after = worldBounds(meshes);
    const data = await GLTF2Export.GLBAsync(ctx.scene, opts.name ?? id, {
      shouldExportNode: (n) => (n === root || n.isDescendantOf(root)) && !isDebugNode(n as TransformNode),
      exportWithoutWaitingForScene: true,
      removeNoopRootNodes: true,
    });
    const files = (data as unknown as { files?: Record<string, Blob | string>; glTFFiles?: Record<string, Blob | string> });
    const table = files.files ?? files.glTFFiles ?? {};
    const name = Object.keys(table).find((k) => k.endsWith(".glb"));
    if (!name) throw new Error("serializer produced no .glb");
    const blob = table[name];
    const bytes = typeof blob === "string" ? Buffer.from(blob) : Buffer.from(await blob.arrayBuffer());
    writeFileSync(out, bytes);
    return {
      triangles: meshTriangles(meshes),
      size: [after.max.x - after.min.x, after.max.y - after.min.y, after.max.z - after.min.z],
      bytes: bytes.length,
      minY: after.min.y,
      nodes: root.getDescendants(false).length + 1,
    };
  } finally {
    ctx.dispose();
  }
}

export async function loadGlbSummary(bytes: Uint8Array): Promise<{ triangles: number; size: [number, number, number]; minY: number }> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("cam", new Vector3(0, 1, -2), scene); // Scene.render needs a camera even headless
  try {
    const container = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: ".glb" });
    container.addAllToScene();
    scene.render();
    const meshes = container.meshes.filter((m) => m.getTotalVertices() > 0);
    const { min, max } = worldBounds(meshes);
    return { triangles: meshTriangles(meshes), size: [max.x - min.x, max.y - min.y, max.z - min.z], minY: min.y };
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const id = argv[0]; const out = argv[1];
  const flag = (k: string): string | undefined => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  const pose = (flag("--pose") ?? "factory") as "factory" | "settled";
  if (!id || !out || !out.endsWith(".glb") || !["factory", "settled"].includes(pose)) {
    console.error("usage: export_glb.ts <model-id> <out.glb> [--pose factory|settled] [--settle-frames 120] [--name <scene-name>] [--force]");
    return 2;
  }
  if (!(id in registry)) { console.error(`unknown model id ${id}`); return 2; }
  if (existsSync(out) && !argv.includes("--force")) { console.error(`${out} exists; pass --force to overwrite`); return 2; }
  const summary = await exportModelToGlb(id, out, { pose, settleFrames: Number(flag("--settle-frames") ?? 120), name: flag("--name") });
  const reloaded = await loadGlbSummary(new Uint8Array(readFileSync(out)));
  const sizeOk = summary.size.every((v, i) => Math.abs(v - reloaded.size[i]) < 1e-4);
  console.log(`${id} -> ${out}: ${summary.triangles} triangles, ${summary.size.map((v) => v.toFixed(3)).join(" x ")} m, ${summary.bytes} bytes, min y ${summary.minY.toFixed(4)}; reload ${reloaded.triangles} triangles ${sizeOk ? "size matches" : "SIZE MISMATCH"}`);
  if (reloaded.triangles !== summary.triangles || !sizeOk) {
    console.error(`reload comparison failed: ${JSON.stringify({ summary, reloaded })}`);
    return 1;
  }
  console.log(`next: python3 glb-ready/scripts/glb_audit.py ${out}`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("export_glb.ts")) {
  main().then((code) => process.exit(code), (err) => { console.error(err); process.exit(1); });
}
