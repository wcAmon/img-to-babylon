/**
 * face gate（M6 task 0006）：五官必須是真 3D 幾何，不是畫在薄盒上的貼圖。
 * 斷言（監工定，勿改）：
 *   1. meshes 註冊表有 eye-l/eye-r/brow-l/brow-r/nose/mouth 六件五官。
 *   2. 舊平面貼圖臉盒 "face" 必須移除。
 *   3. 每件五官至少一個 bbox 世界頂點凸出頭球表面 ≥ 0.0005（立體浮雕）。
 *   4. 五官都在前半球（bbox 中心世界 z > 頭心 z）且貼近頭（中心距頭心 < 1.6R）。
 *   5. 左右對稱件（眼、眉）x 鏡射、y/z 一致（容差 1.5mm）。
 *   6. 五官掛在 head 節點樹下（跟著頭轉）。
 */
import assert from "node:assert/strict";
import type { Mesh, TransformNode } from "@babylonjs/core";
import { createHeadlessScene } from "../src/headless";
import createActionFigureModel from "../models/action-figure/createActionFigureModel";

const HEAD_RADIUS = 0.015; // HEAD_DIA 0.03 / 2（鏡射 factory 常數）
const RELIEF_MIN = 0.0005;
const PAIR_TOL = 0.0015;

const FEATURES = ["eye-l", "eye-r", "brow-l", "brow-r", "nose", "mouth"] as const;
const PAIRS: [string, string][] = [["eye-l", "eye-r"], ["brow-l", "brow-r"]];

const ctx = await createHeadlessScene();
try {
  const model = createActionFigureModel(ctx.scene, { physics: false });
  const headNode = model.nodes.head;
  assert.ok(headNode, "必須有 head 節點");
  headNode.computeWorldMatrix(true);
  const headCenter = headNode.getAbsolutePosition().clone();

  assert.ok(!("face" in model.meshes), "平面貼圖臉盒 face 必須移除（改為 3D 五官）");

  const centers = new Map<string, { x: number; y: number; z: number }>();
  for (const id of FEATURES) {
    const mesh = model.meshes[id] as Mesh | undefined;
    assert.ok(mesh, `五官 mesh ${id} 必須存在於 meshes 註冊表`);
    mesh.computeWorldMatrix(true);
    const bbox = mesh.getBoundingInfo().boundingBox;
    const worldVerts = bbox.vectorsWorld;
    const reach = Math.max(
      ...worldVerts.map((v) => v.subtract(headCenter).length()),
    );
    assert.ok(
      reach >= HEAD_RADIUS + RELIEF_MIN,
      `${id} 必須凸出頭球表面（reach ${reach.toFixed(5)} < ${(HEAD_RADIUS + RELIEF_MIN).toFixed(5)}）`,
    );
    const c = bbox.centerWorld;
    assert.ok(c.z > headCenter.z, `${id} 必須在前半球（center z ${c.z.toFixed(5)} <= 頭心 z ${headCenter.z.toFixed(5)}）`);
    const dist = c.subtract(headCenter).length();
    assert.ok(dist < HEAD_RADIUS * 1.6, `${id} 必須貼近頭（中心距 ${dist.toFixed(5)} >= ${(HEAD_RADIUS * 1.6).toFixed(5)}）`);
    centers.set(id, { x: c.x - headCenter.x, y: c.y - headCenter.y, z: c.z - headCenter.z });

    let node: TransformNode | null = mesh;
    let underHead = false;
    while (node) {
      if (node === headNode) { underHead = true; break; }
      node = node.parent as TransformNode | null;
    }
    assert.ok(underHead, `${id} 必須掛在 head 節點樹下`);
  }

  for (const [left, right] of PAIRS) {
    const l = centers.get(left)!;
    const r = centers.get(right)!;
    assert.ok(Math.abs(l.x + r.x) < PAIR_TOL, `${left}/${right} x 必須鏡射（${l.x.toFixed(5)} vs ${r.x.toFixed(5)}）`);
    assert.ok(Math.abs(l.y - r.y) < PAIR_TOL, `${left}/${right} y 必須一致`);
    assert.ok(Math.abs(l.z - r.z) < PAIR_TOL, `${left}/${right} z 必須一致`);
    assert.ok(Math.abs(l.x) > 0.002, `${left} 必須偏離中線（|x| ${Math.abs(l.x).toFixed(5)}）`);
  }

  console.log("face_test: PASS（六件五官立體、對稱、掛頭下）");
} finally {
  ctx.dispose();
}
