# img2babylon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 img2babylon——agent 看參考圖（tomato-image 生成為主）以程式碼產生 Babylon.js 程序化 3D 模型，附真實 Havok 物理碰撞（複合形狀、質量、hinge 約束），以揀蓋式藥罐為驗收案例，並可由 Claude Code 與 Codex CLI 兩種 host 駕駛。

**Architecture:** 方案 A——agent 依 SKILL.md 路由到 grimoire 契約親自寫 TypeScript factory；純 stdlib Python forge 工具做確定性 gate；in-repo Vite viewer + headless NullEngine 腳本做渲染與物理驗證。Spec 見 `docs/superpowers/specs/2026-08-31-img2babylon-design.md`。

**Tech Stack:** Vite 6 + TypeScript 5 (strict) + @babylonjs/core ^8 + @babylonjs/havok ^1 + tsx（Node 執行 TS 腳本）；Python 3.10+ 純 stdlib。

## Global Constraints

- forge/ 只允許 Python 3.10+ 標準函式庫，**零第三方依賴**。
- viewer/ TypeScript `strict: true`；`tsc --noEmit` 必須零錯誤。
- 模型只能用程式碼（primitives/CSG/DynamicTexture），禁止外部 mesh/貼圖資產。
- 尺寸烘進幾何建構參數，不用 `scaling` 承載尺寸。
- 所有程序化雜訊/隨機帶 seed（viewer 互動沙盒除外）。
- 單位一律公尺（m）。
- 物理權威：`physics.constraints`；`attachment` 僅視覺對位。
- 修正迴圈上限：每 pass 3 次、全程 6 次。
- 執行期狀態/截圖放 `.img2babylon/`（gitignored）。
- commit 訊息中文，結尾附 Co-Authored-By 與 Claude-Session 行（見本 repo 既有 commit）。

---

### Task 1: viewer 骨架（Vite + Babylon + Havok 可跑起來）

**Files:**
- Create: `viewer/package.json`
- Create: `viewer/tsconfig.json`
- Create: `viewer/vite.config.ts`
- Create: `viewer/index.html`
- Create: `viewer/src/types.ts`
- Create: `viewer/src/registry.ts`
- Create: `viewer/src/main.ts`

**Interfaces:**
- Produces: `BuiltModel` 介面與 `ModelFactory` 型別（後續所有任務依賴）；`registry`（name → dynamic import）；瀏覽器入口 `#model=<name>&physics=1`。

- [ ] **Step 1: 建立 package.json / tsconfig / vite config / index.html**

`viewer/package.json`:
```json
{
  "name": "img2babylon-viewer",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "physics-test": "tsx scripts/physics_test.ts",
    "runtime-export": "tsx scripts/runtime_export.ts"
  },
  "dependencies": {
    "@babylonjs/core": "^8.0.0",
    "@babylonjs/havok": "^1.3.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

`viewer/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"],
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src", "scripts", "models"]
}
```

`viewer/vite.config.ts`:
```ts
import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
});
```

`viewer/index.html`:
```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>img2babylon viewer</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #1c1e24; }
    #app { width: 100%; height: 100%; display: block; touch-action: none; }
    .harness-bar { position: fixed; top: 10px; left: 10px; display: flex; gap: 6px; z-index: 10; }
    .harness-bar button { padding: 6px 12px; border: 0; border-radius: 6px; background: #3b4252;
      color: #eceff4; font: 13px/1 system-ui; cursor: pointer; }
    .harness-bar button:hover { background: #4c566a; }
    .error-banner { position: fixed; top: 0; left: 0; right: 0; padding: 10px 16px; background: #bf3131;
      color: #fff; font: 14px/1.4 system-ui; z-index: 20; }
  </style>
</head>
<body>
  <canvas id="app"></canvas>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: 寫 types.ts / registry.ts / main.ts**

`viewer/src/types.ts`:
```ts
import type {
  Mesh,
  Physics6DoFConstraint,
  PhysicsBody,
  Scene,
  TransformNode,
} from "@babylonjs/core";

export interface BuiltModel {
  root: TransformNode;
  nodes: Record<string, TransformNode>;
  meshes: Record<string, Mesh>;
  bodies: Record<string, PhysicsBody>;
  constraints: Physics6DoFConstraint[];
  dispose(): void;
}

export interface ModelOptions {
  physics?: boolean;
}

export type ModelFactory = (scene: Scene, opts?: ModelOptions) => BuiltModel;
```

`viewer/src/registry.ts`:
```ts
import type { ModelFactory } from "./types";

export const registry: Record<string, () => Promise<{ default: ModelFactory }>> = {
  "sample-crate": () => import("../models/sample-crate/createSampleCrateModel"),
};
```

`viewer/src/main.ts`:
```ts
import {
  ArcRotateCamera,
  Engine,
  HavokPlugin,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { registry } from "./registry";

function banner(msg: string): void {
  const div = document.createElement("div");
  div.className = "error-banner";
  div.textContent = msg;
  document.body.appendChild(div);
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("app") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera(
    "cam", Math.PI / 3, Math.PI / 3, 1.0, new Vector3(0, 0.1, 0), scene,
  );
  camera.wheelDeltaPercentage = 0.01;
  camera.minZ = 0.01;
  camera.attachControl(canvas, true);
  new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);

  try {
    const havok = await HavokPhysics();
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
  } catch (err) {
    banner(`Havok 載入失敗：${String(err)}`);
    throw err;
  }

  const params = new URLSearchParams(location.hash.replace(/^#\/?/, ""));
  const name = params.get("model") ?? "sample-crate";
  const load = registry[name];
  if (!load) {
    banner(`未知模型：${name}（registry 無此項）`);
    return;
  }
  const factory = (await load()).default;
  const model = factory(scene, { physics: params.get("physics") !== "0" });

  const { installHarness } = await import("./harness");
  const { installCapture } = await import("./capture");
  installCapture(scene, camera, model);
  installHarness(scene, model);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

void boot();
```

（`./harness` 與 `./capture` 在 Task 2、Task 5 建立；本步驟結束時 typecheck 會因缺檔失敗，屬預期，Step 3 先建立空殼。）

- [ ] **Step 3: 建立 harness.ts / capture.ts 最小空殼（Task 2/5 再填實）**

`viewer/src/harness.ts`（暫時）:
```ts
import type { Scene } from "@babylonjs/core";
import type { BuiltModel } from "./types";

export function installHarness(_scene: Scene, _model: BuiltModel): void {
  // Task 5 填實：地面、沙盒按鈕
}
```

`viewer/src/capture.ts`（暫時）:
```ts
import type { ArcRotateCamera, Scene } from "@babylonjs/core";
import type { BuiltModel } from "./types";

export function installCapture(
  _scene: Scene, _camera: ArcRotateCamera, _model: BuiltModel,
): void {
  // Task 5 填實：window.__IMG2BABYLON_CAPTURE__
}
```

- [ ] **Step 4: 安裝依賴並驗證**

Run: `cd viewer && npm install`
Expected: 成功，無 peer dependency 錯誤。

Run: `cd viewer && npx tsc --noEmit`
Expected: 只剩 `../models/sample-crate/createSampleCrateModel` 找不到（Task 2 建立）；先在 registry 暫時清空該行再 typecheck 應為零錯誤，確認後把該行加回。

- [ ] **Step 5: Commit**

```bash
git add viewer/package.json viewer/tsconfig.json viewer/vite.config.ts viewer/index.html viewer/src/
git commit -m "feat(viewer): Vite + Babylon + Havok 骨架與 BuiltModel 合約"
```

---

### Task 2: 手寫範例模型 sample-crate（golden example）

**Files:**
- Create: `viewer/models/sample-crate/spec.json`
- Create: `viewer/models/sample-crate/createSampleCrateModel.ts`

**Interfaces:**
- Consumes: `BuiltModel`, `ModelFactory`（Task 1）。
- Produces: `createSampleCrateModel(scene, opts): BuiltModel`（default export）；`spec.json` 是 BabylonSculptSpec v1 的最小合法範例，Task 7 驗證器測試與 grimoire/spec.md 都引用它。

- [ ] **Step 1: 寫 spec.json**

`viewer/models/sample-crate/spec.json`:
```json
{
  "targetName": "sample-crate",
  "schemaVersion": "1",
  "sourceImages": [
    { "role": "hero", "path": "(hand-authored example, no image)", "origin": "user" }
  ],
  "coordinateFrame": { "up": "y", "forward": "z", "units": "m" },
  "silhouette": { "outline": "single cube", "complexity": "simple" },
  "componentTree": [
    {
      "id": "crate",
      "name": "wooden crate",
      "level": "macro",
      "primitive": "box",
      "dimensions": { "w": 0.3, "h": 0.3, "d": 0.3, "units": "m", "confidence": 1.0 },
      "transform": { "position": [0, 0.151, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "parent": null,
      "attachment": { "type": "none" },
      "material": "pine-wood",
      "collider": { "type": "box", "size": [0.3, 0.3, 0.3], "offset": [0, 0, 0], "confidence": 1.0 }
    }
  ],
  "materials": [
    { "id": "pine-wood", "kind": "procedural", "baseColor": [0.55, 0.36, 0.17], "roughness": 0.85 }
  ],
  "physics": {
    "bodies": [
      { "id": "crate", "components": ["crate"], "mass": 2.0, "friction": 0.6,
        "restitution": 0.2, "centerOfMass": [0, 0, 0] }
    ],
    "constraints": []
  },
  "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
  "reviewHistory": []
}
```

- [ ] **Step 2: 寫 factory**

`viewer/models/sample-crate/createSampleCrateModel.ts`:
```ts
import {
  Color3,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type { BuiltModel, ModelOptions } from "../../src/types";

const SIZE = 0.3;
const MASS = 2.0;

export default function createSampleCrateModel(
  scene: Scene, opts: ModelOptions = {},
): BuiltModel {
  const root = new TransformNode("sample-crate", scene);
  const pivot = new TransformNode("crate__pivot", scene);
  pivot.parent = root;
  pivot.position.y = SIZE / 2 + 0.001;

  const mesh = MeshBuilder.CreateBox("crate", { size: SIZE }, scene);
  mesh.parent = pivot;
  const mat = new StandardMaterial("pine-wood", scene);
  mat.diffuseColor = new Color3(0.55, 0.36, 0.17);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  mesh.material = mat;

  const bodies: Record<string, PhysicsBody> = {};
  if (opts.physics !== false && scene.getPhysicsEngine()) {
    const body = new PhysicsBody(pivot, PhysicsMotionType.DYNAMIC, false, scene);
    const container = new PhysicsShapeContainer(scene);
    const box = new PhysicsShapeBox(
      Vector3.Zero(), Quaternion.Identity(), new Vector3(SIZE, SIZE, SIZE), scene,
    );
    box.material = { friction: 0.6, restitution: 0.2 };
    container.addChild(box, Vector3.Zero(), Quaternion.Identity());
    body.shape = container;
    body.setMassProperties({ mass: MASS, centerOfMass: Vector3.Zero() });
    bodies.crate = body;
  }

  return {
    root,
    nodes: { crate: pivot },
    meshes: { crate: mesh },
    bodies,
    constraints: [],
    dispose(): void {
      Object.values(bodies).forEach((b) => b.dispose());
      root.dispose(false, true);
    },
  };
}
```

- [ ] **Step 3: 驗證 typecheck**

Run: `cd viewer && npx tsc --noEmit`
Expected: 零錯誤（registry 的 sample-crate 行已存在）。

- [ ] **Step 4: Commit**

```bash
git add viewer/models/sample-crate/
git commit -m "feat(viewer): sample-crate 手寫範例模型（golden example）"
```

---

### Task 3: headless 物理測試（NullEngine + Havok 落下靜止判定）

**Files:**
- Create: `viewer/src/headless.ts`
- Create: `viewer/scripts/physics_test.ts`

**Interfaces:**
- Consumes: `registry`, `BuiltModel`（Task 1/2）。
- Produces: `createHeadlessScene(): Promise<{ scene: Scene; step: (frames: number) => void; dispose(): void }>`；CLI `npx tsx scripts/physics_test.ts <model-name> [--nudge <bodyId>] [--out result.json]`，exit 0=通過 / 1=未通過，stdout 輸出判定 JSON。

- [ ] **Step 1: 寫 headless.ts**

`viewer/src/headless.ts`（僅供 Node 腳本使用，勿從 main.ts import）:
```ts
import { FreeCamera, HavokPlugin, NullEngine, Scene, Vector3 } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export interface HeadlessContext {
  scene: Scene;
  step: (frames: number) => void;
  dispose: () => void;
}

export async function createHeadlessScene(): Promise<HeadlessContext> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("cam", new Vector3(0, 1, -2), scene);

  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm");
  const havok = await HavokPhysics({ wasmBinary: readFileSync(wasmPath) });
  // useDeltaForWorldStep=false：固定 1/60 步長，決定性模擬
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(false, havok));

  return {
    scene,
    step: (frames: number): void => {
      for (let i = 0; i < frames; i++) scene.render();
    },
    dispose: (): void => {
      scene.dispose();
      engine.dispose();
    },
  };
}
```

- [ ] **Step 2: 寫 physics_test.ts**

`viewer/scripts/physics_test.ts`:
```ts
// 動態物理 gate：模型從 0.3m 落下，模擬 5 秒，必須靜止、不穿地、不爆炸。
// 用法: npx tsx scripts/physics_test.ts <model-name> [--nudge <bodyId>] [--out result.json]
import {
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  Vector3,
} from "@babylonjs/core";
import { writeFileSync } from "node:fs";
import { createHeadlessScene } from "../src/headless";
import { registry } from "../src/registry";

const SETTLE_SPEED = 0.01; // m/s
const FLOOR_EPS = -0.01;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const nudgeIdx = argv.indexOf("--nudge");
  const nudgeBody = nudgeIdx >= 0 ? argv[nudgeIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!name || !(name in registry)) {
    console.error(`用法: physics_test.ts <model-name>；已知: ${Object.keys(registry).join(", ")}`);
    return 2;
  }

  const ctx = await createHeadlessScene();
  const { scene, step } = ctx;

  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
  const gBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  const gShape = new PhysicsShapeBox(
    new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), scene,
  );
  gShape.material = { friction: 0.7, restitution: 0.2 };
  gBody.shape = gShape;

  const factory = (await registry[name]()).default;
  const model = factory(scene, { physics: true });

  // 抬高 0.3m 再讓物理接管
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = false; });
  model.root.position.y += 0.3;
  step(2);
  Object.values(model.bodies).forEach((b) => { b.disablePreStep = true; });

  step(60); // 1 秒：自由落體 + 落地
  if (nudgeBody && model.bodies[nudgeBody]) {
    const b = model.bodies[nudgeBody];
    const mass = b.getMassProperties().mass ?? 0.1;
    b.applyImpulse(new Vector3(0, mass * 1.0, 0), b.transformNode.absolutePosition);
  }
  step(240); // 再 4 秒

  const bodies = Object.entries(model.bodies).map(([id, b]) => {
    const v = b.getLinearVelocity();
    const p = b.transformNode.absolutePosition;
    return {
      id,
      speed: Number(v.length().toFixed(5)),
      y: Number(p.y.toFixed(5)),
      finite: [p.x, p.y, p.z].every(Number.isFinite),
    };
  });
  const pass = bodies.length > 0 && bodies.every(
    (r) => r.speed < SETTLE_SPEED && r.y > FLOOR_EPS && r.finite,
  );
  const result = { model: name, nudged: nudgeBody, pass, bodies };
  console.log(JSON.stringify(result, null, 2));
  if (outPath) writeFileSync(outPath, JSON.stringify(result, null, 2));
  ctx.dispose();
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code));
```

- [ ] **Step 3: 先驗證會失敗的情境**

暫時把 `SETTLE_SPEED` 改成 `-1`（不可能通過）跑一次，確認 exit code 為 1 與 `"pass": false` 輸出正常，再改回 `0.01`。

Run: `cd viewer && npx tsx scripts/physics_test.ts sample-crate`
Expected（改回後）: `"pass": true`、exit 0、crate 的 y ≈ 0.15。

若 Havok WASM 在 Node 載入失敗，檢查 `require.resolve` 路徑是否存在：`ls node_modules/@babylonjs/havok/lib/esm/*.wasm`。

- [ ] **Step 4: 驗證 typecheck**

Run: `cd viewer && npx tsc --noEmit`
Expected: 零錯誤。

- [ ] **Step 5: Commit**

```bash
git add viewer/src/headless.ts viewer/scripts/physics_test.ts
git commit -m "feat(viewer): headless NullEngine 物理落下測試（動態 gate）"
```

---

### Task 4: runtime_export（靜態 gate 的資料來源）

**Files:**
- Create: `viewer/scripts/runtime_export.ts`

**Interfaces:**
- Consumes: `createHeadlessScene`（Task 3）、`registry`、spec.json。
- Produces: CLI `npx tsx scripts/runtime_export.ts <model-name> --spec <spec.json> --out <runtime.json>`。輸出 JSON schema（Task 8 的 check_colliders.py 消費）：

```json
{
  "model": "sample-crate",
  "meshes": [{ "component": "crate", "aabb": { "min": [x,y,z], "max": [x,y,z] } }],
  "bodies": [{
    "id": "crate", "mass": 2.0, "centerOfMassWorld": [x,y,z],
    "colliders": [{ "component": "crate", "type": "box",
                    "aabb": { "min": [x,y,z], "max": [x,y,z] }, "volume": 0.027 }]
  }]
}
```

- [ ] **Step 1: 寫 runtime_export.ts**

```ts
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
    m.refreshBoundingInfo();
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
```

- [ ] **Step 2: 驗證輸出**

Run: `cd viewer && mkdir -p ../.img2babylon && npx tsx scripts/runtime_export.ts sample-crate --spec models/sample-crate/spec.json --out ../.img2babylon/sample-crate-runtime.json`
Expected: exit 0；檢視 `.img2babylon/sample-crate-runtime.json`——crate 的 mesh AABB 與 collider AABB 應幾乎重合（±0.001），volume ≈ 0.027，mass 2.0。

Run: `cd viewer && npx tsc --noEmit`
Expected: 零錯誤。

- [ ] **Step 3: Commit**

```bash
git add viewer/scripts/runtime_export.ts
git commit -m "feat(viewer): runtime_export 匯出 AABB/質量供靜態物理 gate"
```

---

### Task 5: 瀏覽器沙盒 harness 與 capture API

**Files:**
- Modify: `viewer/src/harness.ts`（覆蓋 Task 1 空殼）
- Modify: `viewer/src/capture.ts`（覆蓋 Task 1 空殼）

**Interfaces:**
- Consumes: `BuiltModel`。
- Produces: `window.__IMG2BABYLON_CAPTURE__ = { setCamera, screenshot, togglePhysicsViewer }`、`window.__IMG2BABYLON_READY__ = true`；畫面左上按鈕列（拋起／丟球／堆疊／碰撞線框）。

- [ ] **Step 1: 寫 capture.ts**

```ts
import {
  ArcRotateCamera,
  PhysicsViewer,
  Scene,
  Tools,
  Vector3,
} from "@babylonjs/core";
import type { BuiltModel } from "./types";

export interface CameraSpec {
  alpha: number;
  beta: number;
  radius: number;
  target?: [number, number, number];
}

export interface CaptureApi {
  setCamera(spec: CameraSpec): void;
  screenshot(): Promise<string>; // base64 data URL, 1280x720
  togglePhysicsViewer(on: boolean): void;
}

declare global {
  interface Window {
    __IMG2BABYLON_CAPTURE__?: CaptureApi;
    __IMG2BABYLON_READY__?: boolean;
  }
}

export function installCapture(
  scene: Scene, camera: ArcRotateCamera, model: BuiltModel,
): void {
  let viewer: PhysicsViewer | null = null;
  window.__IMG2BABYLON_CAPTURE__ = {
    setCamera(spec: CameraSpec): void {
      camera.alpha = spec.alpha;
      camera.beta = spec.beta;
      camera.radius = spec.radius;
      if (spec.target) camera.setTarget(Vector3.FromArray(spec.target));
    },
    async screenshot(): Promise<string> {
      return Tools.CreateScreenshotUsingRenderTargetAsync(
        scene.getEngine(), camera, { width: 1280, height: 720 },
      );
    },
    togglePhysicsViewer(on: boolean): void {
      if (on && !viewer) {
        viewer = new PhysicsViewer(scene);
        Object.values(model.bodies).forEach((b) => viewer?.showBody(b));
      } else if (!on && viewer) {
        viewer.dispose();
        viewer = null;
      }
    },
  };
  window.__IMG2BABYLON_READY__ = true;
}
```

- [ ] **Step 2: 寫 harness.ts**

```ts
import {
  ArcRotateCamera,
  Color3,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import type { BuiltModel } from "./types";

export function installHarness(scene: Scene, model: BuiltModel): void {
  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
  const gMat = new StandardMaterial("ground-mat", scene);
  gMat.diffuseColor = new Color3(0.82, 0.83, 0.86);
  gMat.specularColor = Color3.Black();
  ground.material = gMat;

  const physics = scene.getPhysicsEngine();
  if (physics) {
    const gBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
    const gShape = new PhysicsShapeBox(
      new Vector3(0, -0.05, 0), Quaternion.Identity(), new Vector3(10, 0.1, 10), scene,
    );
    gShape.material = { friction: 0.7, restitution: 0.2 };
    gBody.shape = gShape;
  }

  const bar = document.createElement("div");
  bar.className = "harness-bar";
  document.body.appendChild(bar);
  const btn = (label: string, fn: () => void): void => {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = fn;
    bar.appendChild(b);
  };

  btn("拋起", () => {
    Object.values(model.bodies).forEach((b) => {
      const mass = b.getMassProperties().mass ?? 1;
      b.applyImpulse(
        new Vector3((Math.random() - 0.5) * mass, mass * 3.2, (Math.random() - 0.5) * mass),
        b.transformNode.absolutePosition,
      );
    });
  });

  btn("丟球", () => {
    const cam = scene.activeCamera as ArcRotateCamera;
    const dir = cam.getTarget().subtract(cam.position).normalize();
    const ball = MeshBuilder.CreateSphere(`ball-${performance.now()}`, { diameter: 0.06 }, scene);
    ball.position = cam.position.add(dir.scale(0.2));
    const mat = new StandardMaterial("ball-mat", scene);
    mat.diffuseColor = new Color3(0.85, 0.3, 0.25);
    ball.material = mat;
    const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, scene);
    const shape = new PhysicsShapeSphere(Vector3.Zero(), 0.03, scene);
    shape.material = { friction: 0.4, restitution: 0.6 };
    body.shape = shape;
    body.setMassProperties({ mass: 0.2 });
    body.applyImpulse(dir.scale(1.2), ball.position);
  });

  btn("堆疊", () => {
    for (let i = 0; i < 3; i++) {
      const box = MeshBuilder.CreateBox(`stack-${performance.now()}-${i}`, { size: 0.1 }, scene);
      box.position = new Vector3(0.02 * i, 0.8 + 0.15 * i, 0.02 * i);
      const body = new PhysicsBody(box, PhysicsMotionType.DYNAMIC, false, scene);
      const shape = new PhysicsShapeBox(
        Vector3.Zero(), Quaternion.Identity(), new Vector3(0.1, 0.1, 0.1), scene,
      );
      shape.material = { friction: 0.6, restitution: 0.3 };
      body.shape = shape;
      body.setMassProperties({ mass: 0.5 });
    }
  });

  let wireOn = false;
  btn("碰撞線框", () => {
    wireOn = !wireOn;
    window.__IMG2BABYLON_CAPTURE__?.togglePhysicsViewer(wireOn);
  });
}
```

- [ ] **Step 3: 驗證**

Run: `cd viewer && npx tsc --noEmit && npx vite build`
Expected: 兩者皆零錯誤。

Run: `cd viewer && npx tsx scripts/physics_test.ts sample-crate`
Expected: 仍 `"pass": true`（harness 只在瀏覽器 DOM 環境生效，不影響 headless）。

- [ ] **Step 4: Commit**

```bash
git add viewer/src/harness.ts viewer/src/capture.ts
git commit -m "feat(viewer): 物理沙盒按鈕列與 __IMG2BABYLON_CAPTURE__ API"
```

---

### Task 6: forge/next_pass.py（pass 狀態機）

**Files:**
- Create: `forge/next_pass.py`
- Test: `forge/tests/test_next_pass.py`

**Interfaces:**
- Produces: CLI `python3 forge/next_pass.py {init --model NAME [--force] | status | done | correction}`，狀態存 `.img2babylon/state.json`。`status` 印 JSON `{"model","currentPass","index","correctionsThisPass","totalCorrections"}`；`correction` 超限 exit 3；`done` 走完全部 pass 印 `all-passes-complete`。程式面：`load_state(root)`, `save_state(root, state)`, `PASS_ORDER`。

- [ ] **Step 1: 寫失敗測試**

`forge/tests/test_next_pass.py`:
```python
import json, os, tempfile, unittest
from forge import next_pass


class NextPassTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_init_creates_state(self):
        next_pass.cmd_init(self.root, "pill-bottle", force=False)
        state = next_pass.load_state(self.root)
        self.assertEqual(state["model"], "pill-bottle")
        self.assertEqual(state["currentIndex"], 0)
        self.assertEqual(state["passOrder"], next_pass.PASS_ORDER)

    def test_init_refuses_overwrite(self):
        next_pass.cmd_init(self.root, "a", force=False)
        with self.assertRaises(SystemExit):
            next_pass.cmd_init(self.root, "b", force=False)

    def test_done_advances_and_completes(self):
        next_pass.cmd_init(self.root, "x", force=False)
        for _ in next_pass.PASS_ORDER:
            code = next_pass.cmd_done(self.root)
        self.assertEqual(code, 0)
        state = next_pass.load_state(self.root)
        self.assertEqual(state["currentIndex"], len(next_pass.PASS_ORDER))

    def test_correction_limits(self):
        next_pass.cmd_init(self.root, "x", force=False)
        for _ in range(3):
            self.assertEqual(next_pass.cmd_correction(self.root), 0)
        self.assertEqual(next_pass.cmd_correction(self.root), 3)  # 第 4 次超出每 pass 上限

    def test_total_correction_limit(self):
        next_pass.cmd_init(self.root, "x", force=False)
        for _ in range(3):
            next_pass.cmd_correction(self.root)
        next_pass.cmd_done(self.root)
        for _ in range(3):
            code = next_pass.cmd_correction(self.root)
        self.assertEqual(code, 3)  # 總數第 7 次前，總上限 6 已在第 6 次後觸發


if __name__ == "__main__":
    unittest.main()
```

同時建立空的 `forge/__init__.py` 與 `forge/tests/__init__.py`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `python3 -m unittest forge.tests.test_next_pass -v`
Expected: FAIL / ERROR（模組不存在）。

- [ ] **Step 3: 實作 next_pass.py**

```python
#!/usr/bin/env python3
"""pass 狀態機：blockout → structure → material → physics → polish。
用法: python3 forge/next_pass.py {init --model NAME [--force] | status | done | correction}
"""
import argparse
import json
import os
import sys

PASS_ORDER = ["blockout", "structure", "material", "physics", "polish"]
PER_PASS_LIMIT = 3
TOTAL_LIMIT = 6
STATE_REL = os.path.join(".img2babylon", "state.json")


def state_path(root):
    return os.path.join(root, STATE_REL)


def load_state(root):
    with open(state_path(root)) as f:
        return json.load(f)


def save_state(root, state):
    os.makedirs(os.path.dirname(state_path(root)), exist_ok=True)
    with open(state_path(root), "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def current_pass(state):
    i = state["currentIndex"]
    return state["passOrder"][i] if i < len(state["passOrder"]) else None


def cmd_init(root, model, force):
    if os.path.exists(state_path(root)) and not force:
        print("state.json 已存在；用 --force 覆蓋", file=sys.stderr)
        raise SystemExit(2)
    save_state(root, {
        "model": model,
        "passOrder": PASS_ORDER,
        "currentIndex": 0,
        "corrections": {"perPass": {}, "total": 0},
    })
    print(json.dumps({"model": model, "currentPass": PASS_ORDER[0]}))
    return 0


def cmd_status(root):
    state = load_state(root)
    cur = current_pass(state)
    print(json.dumps({
        "model": state["model"],
        "currentPass": cur,
        "index": state["currentIndex"],
        "correctionsThisPass": state["corrections"]["perPass"].get(cur or "", 0),
        "totalCorrections": state["corrections"]["total"],
    }, ensure_ascii=False))
    return 0


def cmd_done(root):
    state = load_state(root)
    if current_pass(state) is None:
        print("all-passes-complete")
        return 0
    state["currentIndex"] += 1
    save_state(root, state)
    nxt = current_pass(state)
    print(nxt if nxt else "all-passes-complete")
    return 0


def cmd_correction(root):
    state = load_state(root)
    cur = current_pass(state)
    if cur is None:
        print("已無進行中的 pass", file=sys.stderr)
        return 2
    per = state["corrections"]["perPass"].get(cur, 0) + 1
    total = state["corrections"]["total"] + 1
    if per > PER_PASS_LIMIT or total > TOTAL_LIMIT:
        print(f"修正上限已到（pass {cur}: {per}/{PER_PASS_LIMIT}, 總計: {total}/{TOTAL_LIMIT}）"
              "——停止並 request-input", file=sys.stderr)
        return 3
    state["corrections"]["perPass"][cur] = per
    state["corrections"]["total"] = total
    save_state(root, state)
    print(json.dumps({"pass": cur, "corrections": per, "total": total}))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=".")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_init = sub.add_parser("init")
    p_init.add_argument("--model", required=True)
    p_init.add_argument("--force", action="store_true")
    sub.add_parser("status")
    sub.add_parser("done")
    sub.add_parser("correction")
    args = ap.parse_args(argv)
    if args.cmd == "init":
        return cmd_init(args.root, args.model, args.force)
    return {"status": cmd_status, "done": cmd_done, "correction": cmd_correction}[args.cmd](args.root)


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 跑測試確認通過**

Run: `python3 -m unittest forge.tests.test_next_pass -v`
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add forge/__init__.py forge/tests/__init__.py forge/next_pass.py forge/tests/test_next_pass.py
git commit -m "feat(forge): next_pass 狀態機（pass 順序與修正上限）"
```

---

### Task 7: forge/new_spec.py 與 forge/validate_spec.py

**Files:**
- Create: `forge/new_spec.py`
- Create: `forge/validate_spec.py`
- Test: `forge/tests/test_validate_spec.py`

**Interfaces:**
- Consumes: `viewer/models/sample-crate/spec.json`（Task 2，整合測試 fixture）。
- Produces: `validate(spec: dict, strict: bool) -> (errors: list[str], warnings: list[str])`；CLI `python3 forge/validate_spec.py <spec.json> [--strict]`，exit 0 通過 / 2 未通過；`python3 forge/new_spec.py --name NAME --out <dir>` 產生模板 spec.json。

- [ ] **Step 1: 寫失敗測試**

`forge/tests/test_validate_spec.py`:
```python
import copy, json, os, unittest
from forge import validate_spec

HERE = os.path.dirname(__file__)
SAMPLE = os.path.join(HERE, "..", "..", "viewer", "models", "sample-crate", "spec.json")


def minimal_spec():
    with open(SAMPLE) as f:
        return json.load(f)


class ValidateSpecTest(unittest.TestCase):
    def test_sample_crate_passes(self):
        errors, _ = validate_spec.validate(minimal_spec(), strict=True)
        self.assertEqual(errors, [])

    def test_missing_top_level_key(self):
        spec = minimal_spec()
        del spec["physics"]
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("physics" in e for e in errors))

    def test_macro_without_collider_fails(self):
        spec = minimal_spec()
        del spec["componentTree"][0]["collider"]
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("collider" in e for e in errors))

    def test_component_not_assigned_to_body(self):
        spec = minimal_spec()
        spec["physics"]["bodies"][0]["components"] = []
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("未指派" in e for e in errors))

    def test_component_in_two_bodies(self):
        spec = minimal_spec()
        spec["physics"]["bodies"].append(
            {"id": "dup", "components": ["crate"], "mass": 1.0})
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("同時屬於" in e for e in errors))

    def test_hinge_constraint_requires_axis_limits(self):
        spec = minimal_spec()
        spec["physics"]["bodies"].append({"id": "cap", "components": [], "mass": 0.01})
        spec["physics"]["constraints"] = [
            {"type": "hinge", "bodyA": "crate", "bodyB": "cap"}]
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("axis" in e for e in errors))

    def test_hinge_attachment_pivot_mismatch(self):
        spec = minimal_spec()
        cap = copy.deepcopy(spec["componentTree"][0])
        cap.update({"id": "cap", "parent": "crate",
                    "attachment": {"type": "hinge",
                                   "hinge": {"pivot": [0, 0, 0], "axis": [1, 0, 0],
                                             "limits": [0, 1.9]}}})
        spec["componentTree"].append(cap)
        spec["physics"]["bodies"].append(
            {"id": "cap", "components": ["cap"], "mass": 0.01})
        spec["physics"]["constraints"] = [
            {"type": "hinge", "bodyA": "crate", "bodyB": "cap",
             "pivotA": [0, 0, 0], "pivotB": [0, 0, 0.02],  # 20mm 偏差 > 5mm 容差
             "axis": [1, 0, 0], "limits": [0, 1.9]}]
        errors, _ = validate_spec.validate(spec, strict=False)
        self.assertTrue(any("pivot" in e for e in errors))

    def test_strict_complex_needs_three_components(self):
        spec = minimal_spec()
        spec["silhouette"]["complexity"] = "complex"
        errors, _ = validate_spec.validate(spec, strict=True)
        self.assertTrue(any("complex" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `python3 -m unittest forge.tests.test_validate_spec -v`
Expected: ERROR（validate_spec 不存在）。

- [ ] **Step 3: 實作 validate_spec.py**

```python
#!/usr/bin/env python3
"""BabylonSculptSpec v1 驗證器。
用法: python3 forge/validate_spec.py <spec.json> [--strict]
exit 0=通過, 2=未通過。--strict 加開品質 gate（產碼前必須通過）。
"""
import argparse
import json
import math
import sys

REQUIRED_TOP = ["targetName", "sourceImages", "coordinateFrame", "silhouette",
                "componentTree", "materials", "physics", "buildPasses", "reviewHistory"]
PRIMITIVES = {"box", "sphere", "cylinder", "capsule", "torus", "tube",
              "extrude", "lathe", "csg"}
COLLIDER_TYPES = {"box", "sphere", "capsule", "cylinder", "convex"}
HINGE_PIVOT_TOL = 0.005  # 5mm：attachment.hinge.pivot 與 constraint.pivotB 容差


def validate(spec, strict=False):
    errors, warnings = [], []
    for key in REQUIRED_TOP:
        if key not in spec:
            errors.append(f"缺少頂層欄位: {key}")
    if errors:
        return errors, warnings

    comps = {}
    for c in spec["componentTree"]:
        cid = c.get("id")
        if not cid:
            errors.append("componentTree 有元件缺 id")
            continue
        if cid in comps:
            errors.append(f"componentTree id 重複: {cid}")
        comps[cid] = c
        for field in ("name", "level", "primitive", "dimensions", "transform"):
            if field not in c:
                errors.append(f"元件 {cid} 缺少 {field}")
        if c.get("primitive") not in PRIMITIVES:
            errors.append(f"元件 {cid} primitive 不合法: {c.get('primitive')}")
        if c.get("parent") and c["parent"] not in {x.get("id") for x in spec["componentTree"]}:
            errors.append(f"元件 {cid} parent 不存在: {c['parent']}")
        col = c.get("collider")
        if col and col.get("type") not in COLLIDER_TYPES:
            errors.append(f"元件 {cid} collider type 不合法: {col.get('type')}")

    bodies = spec["physics"].get("bodies", [])
    if not bodies:
        errors.append("physics.bodies 不可為空")
    assigned = {}
    for b in bodies:
        bid = b.get("id", "?")
        for cid in b.get("components", []):
            if cid not in comps:
                errors.append(f"body {bid} 引用不存在元件: {cid}")
            elif cid in assigned:
                errors.append(f"元件 {cid} 同時屬於 body {assigned[cid]} 與 {bid}")
            else:
                assigned[cid] = bid
        if not isinstance(b.get("mass"), (int, float)) or b["mass"] <= 0:
            errors.append(f"body {bid} mass 必須為正數")
    for cid in comps:
        if cid not in assigned:
            errors.append(f"元件 {cid} 未指派給任何 body")
    for cid, c in comps.items():
        if c.get("level") == "macro" and not c.get("collider"):
            errors.append(f"macro 元件 {cid} 缺少 collider")

    body_ids = {b.get("id") for b in bodies}
    constraints = spec["physics"].get("constraints", [])
    for con in constraints:
        for side in ("bodyA", "bodyB"):
            if con.get(side) not in body_ids:
                errors.append(f"constraint 引用不存在 body: {con.get(side)}")
        if con.get("type") == "hinge" and ("axis" not in con or "limits" not in con):
            errors.append("hinge constraint 必須有 axis 與 limits")

    for cid, c in comps.items():
        att = c.get("attachment") or {}
        if att.get("type") != "hinge":
            continue
        h = att.get("hinge") or {}
        my_body = assigned.get(cid)
        match = next((con for con in constraints
                      if con.get("type") == "hinge"
                      and my_body in (con.get("bodyA"), con.get("bodyB"))), None)
        if not match:
            errors.append(f"元件 {cid} attachment 為 hinge 但 physics.constraints 無對應")
            continue
        if h.get("axis") != match.get("axis"):
            errors.append(f"元件 {cid} hinge axis 與 constraint 不一致")
        pa, pb = h.get("pivot"), match.get("pivotB")
        if pa and pb and math.dist(pa, pb) > HINGE_PIVOT_TOL:
            errors.append(f"元件 {cid} hinge pivot 與 constraint pivotB 差距 > 5mm")

    if strict:
        if spec["silhouette"].get("complexity") == "complex" and len(comps) < 3:
            errors.append("strict: silhouette 為 complex 但 componentTree 少於 3 個元件")
        mat_ids = {m.get("id") for m in spec.get("materials", [])}
        for cid, c in comps.items():
            d = c.get("dimensions", {})
            for k in ("w", "h", "d"):
                if not isinstance(d.get(k), (int, float)) or d[k] <= 0:
                    errors.append(f"strict: 元件 {cid} dimensions.{k} 必須為正數")
            if c.get("level") == "macro":
                if not c.get("material"):
                    errors.append(f"strict: macro 元件 {cid} 缺少 material")
                elif c["material"] not in mat_ids:
                    errors.append(f"strict: 元件 {cid} material 未定義: {c['material']}")
    return errors, warnings


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("spec")
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args(argv)
    with open(args.spec) as f:
        spec = json.load(f)
    errors, warnings = validate(spec, args.strict)
    for w in warnings:
        print(f"WARN: {w}")
    for e in errors:
        print(f"FAIL: {e}")
    print("OK" if not errors else f"{len(errors)} 項未通過")
    return 0 if not errors else 2


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 實作 new_spec.py**

```python
#!/usr/bin/env python3
"""產生 BabylonSculptSpec v1 模板。
用法: python3 forge/new_spec.py --name NAME --out viewer/models/NAME
"""
import argparse
import json
import os
import sys

TEMPLATE = {
    "targetName": "",
    "schemaVersion": "1",
    "sourceImages": [
        {"role": "hero", "path": "", "origin": "tomato", "tomatoJobId": "", "prompt": ""}
    ],
    "coordinateFrame": {"up": "y", "forward": "z", "units": "m"},
    "silhouette": {"outline": "", "complexity": "simple"},
    "componentTree": [
        {
            "id": "main",
            "name": "",
            "level": "macro",
            "primitive": "box",
            "dimensions": {"w": 0.1, "h": 0.1, "d": 0.1, "units": "m", "confidence": 0.5},
            "transform": {"position": [0, 0.05, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "parent": None,
            "attachment": {"type": "none"},
            "material": "",
            "collider": {"type": "box", "size": [0.1, 0.1, 0.1], "offset": [0, 0, 0],
                          "confidence": 0.5}
        }
    ],
    "materials": [
        {"id": "", "kind": "procedural", "baseColor": [0.5, 0.5, 0.5], "roughness": 0.5}
    ],
    "physics": {
        "bodies": [
            {"id": "main", "components": ["main"], "mass": 0.1, "friction": 0.5,
             "restitution": 0.3, "centerOfMass": [0, 0, 0]}
        ],
        "constraints": []
    },
    "buildPasses": ["blockout", "structure", "material", "physics", "polish"],
    "reviewHistory": []
}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, "spec.json")
    if os.path.exists(path):
        print(f"{path} 已存在，不覆蓋", file=sys.stderr)
        return 2
    spec = dict(TEMPLATE)
    spec["targetName"] = args.name
    with open(path, "w") as f:
        json.dump(spec, f, indent=2, ensure_ascii=False)
    print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: 跑測試確認通過**

Run: `python3 -m unittest forge.tests.test_validate_spec -v`
Expected: 全 PASS。

Run: `python3 forge/validate_spec.py viewer/models/sample-crate/spec.json --strict`
Expected: `OK`、exit 0。

- [ ] **Step 6: Commit**

```bash
git add forge/new_spec.py forge/validate_spec.py forge/tests/test_validate_spec.py
git commit -m "feat(forge): spec 模板產生器與驗證器（含 strict 品質 gate）"
```

---

### Task 8: forge/check_colliders.py（靜態物理 gate）

**Files:**
- Create: `forge/check_colliders.py`
- Test: `forge/tests/test_check_colliders.py`

**Interfaces:**
- Consumes: Task 4 的 runtime.json schema。
- Produces: `check(runtime: dict) -> list[str]`；CLI `python3 forge/check_colliders.py <runtime.json>`，exit 0 通過 / 2 未通過。

- [ ] **Step 1: 寫失敗測試**

`forge/tests/test_check_colliders.py`:
```python
import copy, unittest
from forge import check_colliders


def rt(**over):
    base = {
        "model": "t",
        "meshes": [{"component": "a",
                    "aabb": {"min": [0, 0, 0], "max": [0.1, 0.1, 0.1]}}],
        "bodies": [{
            "id": "a", "mass": 0.5, "centerOfMassWorld": [0.05, 0.05, 0.05],
            "colliders": [{"component": "a", "type": "box",
                           "aabb": {"min": [0, 0, 0], "max": [0.1, 0.1, 0.1]},
                           "volume": 0.001}],
        }],
    }
    base.update(over)
    return base


class CheckCollidersTest(unittest.TestCase):
    def test_good_runtime_passes(self):
        self.assertEqual(check_colliders.check(rt()), [])

    def test_collider_too_small_fails(self):
        bad = rt()
        bad["bodies"][0]["colliders"][0]["aabb"] = {
            "min": [0.03, 0.03, 0.03], "max": [0.07, 0.07, 0.07]}
        errors = check_colliders.check(bad)
        self.assertTrue(any("未包住" in e for e in errors))

    def test_density_out_of_band(self):
        bad = rt()
        bad["bodies"][0]["mass"] = 100.0  # 100/0.001 = 100000 kg/m³
        errors = check_colliders.check(bad)
        self.assertTrue(any("密度" in e for e in errors))

    def test_sibling_overlap(self):
        bad = rt()
        bad["bodies"][0]["colliders"].append(
            {"component": "b", "type": "box",
             "aabb": {"min": [0, 0, 0], "max": [0.09, 0.09, 0.09]},
             "volume": 0.0007})
        errors = check_colliders.check(bad)
        self.assertTrue(any("重疊" in e for e in errors))

    def test_com_outside_union(self):
        bad = rt()
        bad["bodies"][0]["centerOfMassWorld"] = [0.5, 0.5, 0.5]
        errors = check_colliders.check(bad)
        self.assertTrue(any("質心" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `python3 -m unittest forge.tests.test_check_colliders -v`
Expected: ERROR。

- [ ] **Step 3: 實作**

```python
#!/usr/bin/env python3
"""靜態物理 gate：驗證 runtime_export 輸出。
用法: python3 forge/check_colliders.py <runtime.json>
規則: collider AABB ⊇ mesh AABB（±10% 容差）；同 body 相鄰 collider 重疊 ≤25%；
密度 50–3000 kg/m³；質心在 collider 聯集 AABB 內。exit 0/2。
"""
import argparse
import json
import sys

CONTAIN_TOL = 0.10
OVERLAP_MAX = 0.25
DENSITY_MIN, DENSITY_MAX = 50.0, 3000.0


def aabb_contains(col, mesh, tol=CONTAIN_TOL):
    for i in range(3):
        size = mesh["max"][i] - mesh["min"][i]
        slack = tol * size
        if col["min"][i] > mesh["min"][i] + slack:
            return False
        if col["max"][i] < mesh["max"][i] - slack:
            return False
    return True


def overlap_volume(a, b):
    v = 1.0
    for i in range(3):
        lo = max(a["min"][i], b["min"][i])
        hi = min(a["max"][i], b["max"][i])
        if hi <= lo:
            return 0.0
        v *= hi - lo
    return v


def aabb_volume(a):
    v = 1.0
    for i in range(3):
        v *= max(a["max"][i] - a["min"][i], 0.0)
    return v


def check(runtime):
    errors = []
    mesh_by_comp = {m["component"]: m["aabb"] for m in runtime["meshes"]}
    for body in runtime["bodies"]:
        bid = body["id"]
        cols = body["colliders"]
        if not cols:
            errors.append(f"body {bid}: 沒有任何 collider")
            continue
        for col in cols:
            mesh = mesh_by_comp.get(col["component"])
            if mesh and not aabb_contains(col["aabb"], mesh):
                errors.append(f"{col['component']}: collider AABB 未包住 mesh AABB（±10%）")
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                ov = overlap_volume(cols[i]["aabb"], cols[j]["aabb"])
                small = min(aabb_volume(cols[i]["aabb"]), aabb_volume(cols[j]["aabb"]))
                if small > 0 and ov / small > OVERLAP_MAX:
                    errors.append(
                        f"body {bid}: {cols[i]['component']}×{cols[j]['component']} "
                        f"collider 重疊 {ov / small:.0%} > 25%")
        vol = sum(c.get("volume", 0.0) for c in cols)
        if vol > 0:
            density = body["mass"] / vol
            if not DENSITY_MIN <= density <= DENSITY_MAX:
                errors.append(f"body {bid}: 密度 {density:.0f} kg/m³ 超出 [50, 3000]")
        union_min = [min(c["aabb"]["min"][i] for c in cols) for i in range(3)]
        union_max = [max(c["aabb"]["max"][i] for c in cols) for i in range(3)]
        com = body["centerOfMassWorld"]
        if not all(union_min[i] <= com[i] <= union_max[i] for i in range(3)):
            errors.append(f"body {bid}: 質心不在 collider 聯集 AABB 內")
    return errors


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("runtime")
    args = ap.parse_args(argv)
    with open(args.runtime) as f:
        runtime = json.load(f)
    errors = check(runtime)
    for e in errors:
        print(f"FAIL: {e}")
    print("OK" if not errors else f"{len(errors)} 項未通過")
    return 0 if not errors else 2


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 跑測試 + 整合驗證**

Run: `python3 -m unittest forge.tests.test_check_colliders -v`
Expected: 全 PASS。

Run: `python3 forge/check_colliders.py .img2babylon/sample-crate-runtime.json`
（若檔案不存在，先重跑 Task 4 Step 2 的 runtime-export 命令。）
Expected: `OK`（sample-crate 密度 2.0/0.027 ≈ 74 kg/m³，落在合理帶）。

- [ ] **Step 5: Commit**

```bash
git add forge/check_colliders.py forge/tests/test_check_colliders.py
git commit -m "feat(forge): check_colliders 靜態物理 gate"
```

---

### Task 9: forge/compare.py（並排對照表，stdlib PNG）

**Files:**
- Create: `forge/compare.py`
- Test: `forge/tests/test_compare.py`

**Interfaces:**
- Produces: `read_png(path) -> (w, h, rgb_bytes)`、`write_png(path, w, h, rgb_bytes)`、`side_by_side(a, b, gap=8) -> (w, h, rgb_bytes)`；CLI `python3 forge/compare.py <reference.png> <render.png> --out <sheet.png>`。僅支援 8-bit RGB/RGBA、無 interlace。

- [ ] **Step 1: 寫失敗測試**

`forge/tests/test_compare.py`:
```python
import os, tempfile, unittest
from forge import compare


def solid(w, h, rgb):
    return bytes(rgb) * (w * h)


class CompareTest(unittest.TestCase):
    def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.png")
            compare.write_png(p, 4, 3, solid(4, 3, (255, 0, 0)))
            w, h, px = compare.read_png(p)
            self.assertEqual((w, h), (4, 3))
            self.assertEqual(px[:3], b"\xff\x00\x00")
            self.assertEqual(len(px), 4 * 3 * 3)

    def test_side_by_side_dimensions(self):
        a = (4, 3, solid(4, 3, (255, 0, 0)))
        b = (2, 5, solid(2, 5, (0, 255, 0)))
        w, h, px = compare.side_by_side(a, b, gap=8)
        self.assertEqual((w, h), (4 + 8 + 2, 5))
        self.assertEqual(len(px), w * h * 3)
        # 左圖第一列第一像素為紅，右圖區第一列第一像素為綠
        self.assertEqual(px[:3], b"\xff\x00\x00")
        right_off = (0 * w + 4 + 8) * 3
        self.assertEqual(px[right_off:right_off + 3], b"\x00\xff\x00")

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            pa, pb, po = (os.path.join(d, n) for n in ("a.png", "b.png", "o.png"))
            compare.write_png(pa, 4, 4, solid(4, 4, (10, 20, 30)))
            compare.write_png(pb, 4, 4, solid(4, 4, (40, 50, 60)))
            self.assertEqual(compare.main([pa, pb, "--out", po]), 0)
            w, h, _ = compare.read_png(po)
            self.assertEqual((w, h), (16, 4))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `python3 -m unittest forge.tests.test_compare -v`
Expected: ERROR。

- [ ] **Step 3: 實作 compare.py**

```python
#!/usr/bin/env python3
"""並排對照表：reference × render → sheet.png（純 stdlib PNG 編解碼）。
用法: python3 forge/compare.py <reference.png> <render.png> --out <sheet.png>
僅支援 8-bit RGB(color type 2)/RGBA(6)、無 interlace。
"""
import argparse
import json
import struct
import sys
import zlib

SIG = b"\x89PNG\r\n\x1a\n"


def read_png(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != SIG:
        raise ValueError(f"{path} 不是 PNG")
    pos, w, h, ct, idat = 8, 0, 0, 0, b""
    while pos < len(data):
        ln, typ = struct.unpack(">I4s", data[pos:pos + 8])
        pos += 8
        chunk = data[pos:pos + ln]
        pos += ln + 4  # 跳過 CRC
        if typ == b"IHDR":
            w, h, bitd, ct = struct.unpack(">IIBB", chunk[:10])
            interlace = chunk[12]
            if bitd != 8 or ct not in (2, 6) or interlace != 0:
                raise ValueError("僅支援 8-bit RGB/RGBA、無 interlace")
        elif typ == b"IDAT":
            idat += chunk
        elif typ == b"IEND":
            break
    raw = zlib.decompress(idat)
    ch = 3 if ct == 2 else 4
    stride = w * ch
    out = bytearray(h * w * 3)
    prev = bytearray(stride)
    pos = 0
    for y in range(h):
        flt = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if flt == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i - ch]) & 255
        elif flt == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif flt == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif flt == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        prev = line
        row = y * w * 3
        for x in range(w):
            out[row + x * 3: row + x * 3 + 3] = line[x * ch: x * ch + 3]
    return w, h, bytes(out)


def write_png(path, w, h, rgb):
    def chunk(typ, payload):
        c = struct.pack(">I", len(payload)) + typ + payload
        return c + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + rgb[y * w * 3:(y + 1) * w * 3] for y in range(h))
    with open(path, "wb") as f:
        f.write(SIG
                + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 6))
                + chunk(b"IEND", b""))


def side_by_side(a, b, gap=8):
    wa, ha, pa = a
    wb, hb, pb = b
    height = max(ha, hb)
    width = wa + gap + wb
    out = bytearray(b"\xff" * (width * height * 3))

    def blit(px, pw, ph, ox):
        for y in range(ph):
            off = (y * width + ox) * 3
            out[off:off + pw * 3] = px[y * pw * 3:(y + 1) * pw * 3]

    blit(pa, wa, ha, 0)
    blit(pb, wb, hb, wa + gap)
    return width, height, bytes(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("reference")
    ap.add_argument("render")
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    w, h, px = side_by_side(read_png(args.reference), read_png(args.render))
    write_png(args.out, w, h, px)
    print(json.dumps({"out": args.out, "width": w, "height": h}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 跑測試確認通過**

Run: `python3 -m unittest forge.tests.test_compare -v`
Expected: 全 PASS。

- [ ] **Step 5: 用真實 tomato PNG 冒煙**

Run: `python3 forge/compare.py <任一 tomato 產出的 png> <同一張> --out .img2babylon/smoke-sheet.png`（可用 scratchpad 裡先前測試的 apple_gen.png，或跳過此步留待驗收一）
Expected: 輸出 JSON 與檔案存在。

- [ ] **Step 6: Commit**

```bash
git add forge/compare.py forge/tests/test_compare.py
git commit -m "feat(forge): compare 並排對照表（stdlib PNG 編解碼）"
```

---

### Task 10: forge/tomato.py（參考圖客戶端）

**Files:**
- Create: `forge/tomato.py`
- Test: `forge/tests/test_tomato.py`

**Interfaces:**
- Produces: CLI 三個子命令：
  - `python3 forge/tomato.py gen --prompt "..." [--aspect 16:9|9:16] [--seed N] --out hero.png`
  - `python3 forge/tomato.py edit --image src.png --prompt "..." [--seed N] --out out.png`
  - `python3 forge/tomato.py views --image hero.png --out-dir dir`（產 side.png、rear.png）
- 端點：`$IMG2BABYLON_TOMATO_BASE`（預設 `https://<internal-host>`）的 `POST /image` 與 `GET /assets/{job_id}`；503 依 Retry-After 退避 ≤3 次。
- 程式面：`_post_json(url, payload, opener, retries)`（測試注入 fake opener）。

- [ ] **Step 1: 寫失敗測試**

`forge/tests/test_tomato.py`:
```python
import io, json, unittest
from unittest import mock
from forge import tomato


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeOpener:
    """依序回放 responses；記錄每次請求。"""

    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def open(self, req, timeout=None):
        self.requests.append(req)
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return FakeResponse(r)


def http503(retry_after="1"):
    import urllib.error
    return urllib.error.HTTPError(
        "u", 503, "busy", {"Retry-After": retry_after}, io.BytesIO(b""))


class TomatoTest(unittest.TestCase):
    def test_post_json_success(self):
        opener = FakeOpener([json.dumps({"job_id": "j1", "status": "done"}).encode()])
        job = tomato._post_json("http://x/image", {"prompt": "p"}, opener)
        self.assertEqual(job["job_id"], "j1")
        body = json.loads(opener.requests[0].data.decode())
        self.assertEqual(body["prompt"], "p")

    @mock.patch("forge.tomato.time.sleep")
    def test_post_json_retries_on_503(self, sleep):
        opener = FakeOpener([http503("2"), json.dumps({"job_id": "j2"}).encode()])
        job = tomato._post_json("http://x/image", {"prompt": "p"}, opener)
        self.assertEqual(job["job_id"], "j2")
        sleep.assert_called_once_with(2)

    @mock.patch("forge.tomato.time.sleep")
    def test_post_json_gives_up_after_retries(self, _):
        opener = FakeOpener([http503(), http503(), http503(), http503()])
        with self.assertRaises(Exception):
            tomato._post_json("http://x/image", {"prompt": "p"}, opener, retries=3)

    def test_view_prompts_cover_side_and_rear(self):
        self.assertIn("side", tomato.VIEW_PROMPTS)
        self.assertIn("rear", tomato.VIEW_PROMPTS)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `python3 -m unittest forge.tests.test_tomato -v`
Expected: ERROR。

- [ ] **Step 3: 實作 tomato.py**

```python
#!/usr/bin/env python3
"""tomato-image 客戶端：生成/編輯/多視角參考圖。純 stdlib。
用法:
  python3 forge/tomato.py gen  --prompt "..." [--aspect 16:9] [--seed N] --out hero.png
  python3 forge/tomato.py edit --image src.png --prompt "..." [--seed N] --out out.png
  python3 forge/tomato.py views --image hero.png --out-dir dir   # side.png + rear.png
tomato 不可達時：明確報錯，流程降級為使用者提供圖片（見 grimoire/intake.md）。
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("IMG2BABYLON_TOMATO_BASE", "https://<internal-host>")
MAX_RETRIES = 3

VIEW_PROMPTS = {
    "side": "rotate the view to show the same object directly from the side, "
            "keep the same style, lighting and background",
    "rear": "rotate the view to show the same object from behind, "
            "keep the same style, lighting and background",
}


def _post_json(url, payload, opener=None, retries=MAX_RETRIES):
    opener = opener or urllib.request.build_opener()
    body = json.dumps(payload).encode()
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json"})
        try:
            with opener.open(req, timeout=300) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 503 and attempt < retries:
                wait = int(e.headers.get("Retry-After") or 5)
                print(f"tomato 忙碌，{wait}s 後重試（{attempt + 1}/{retries}）",
                      file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("unreachable")


def _fetch_asset(job_id, out_path, opener=None):
    opener = opener or urllib.request.build_opener()
    with opener.open(f"{BASE}/assets/{job_id}", timeout=120) as resp:
        data = resp.read()
    with open(out_path, "wb") as f:
        f.write(data)
    return len(data)


def cmd_gen(args, opener=None):
    payload = {"prompt": args.prompt, "aspect": args.aspect}
    if args.seed is not None:
        payload["seed"] = args.seed
    job = _post_json(f"{BASE}/image", payload, opener)
    n = _fetch_asset(job["job_id"], args.out, opener)
    print(json.dumps({"out": args.out, "bytes": n, "job_id": job["job_id"],
                      "mode": job.get("mode")}, ensure_ascii=False))
    return 0


def cmd_edit(args, opener=None):
    with open(args.image, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    payload = {"prompt": args.prompt, "image": b64}
    if args.seed is not None:
        payload["seed"] = args.seed
    job = _post_json(f"{BASE}/image", payload, opener)
    n = _fetch_asset(job["job_id"], args.out, opener)
    print(json.dumps({"out": args.out, "bytes": n, "job_id": job["job_id"],
                      "mode": job.get("mode")}, ensure_ascii=False))
    return 0


def cmd_views(args, opener=None):
    os.makedirs(args.out_dir, exist_ok=True)
    for role, prompt in VIEW_PROMPTS.items():
        sub = argparse.Namespace(
            image=args.image, prompt=prompt, seed=args.seed,
            out=os.path.join(args.out_dir, f"{role}.png"))
        cmd_edit(sub, opener)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("gen")
    p.add_argument("--prompt", required=True)
    p.add_argument("--aspect", default="16:9", choices=["16:9", "9:16"])
    p.add_argument("--seed", type=int)
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_gen)
    p = sub.add_parser("edit")
    p.add_argument("--image", required=True)
    p.add_argument("--prompt", required=True)
    p.add_argument("--seed", type=int)
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_edit)
    p = sub.add_parser("views")
    p.add_argument("--image", required=True)
    p.add_argument("--seed", type=int)
    p.add_argument("--out-dir", required=True)
    p.set_defaults(func=cmd_views)
    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 跑測試 + 全套 forge 測試**

Run: `python3 -m unittest forge.tests.test_tomato -v`
Expected: 全 PASS。

Run: `python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'`
Expected: 全 PASS。

- [ ] **Step 5: 線上冒煙（一次即可）**

Run: `python3 forge/tomato.py gen --prompt "a small wooden crate on a plain background" --seed 1 --out .img2babylon/smoke-crate.png && file .img2babylon/smoke-crate.png`
Expected: PNG image data, 1280 x 720。

- [ ] **Step 6: Commit**

```bash
git add forge/tomato.py forge/tests/test_tomato.py
git commit -m "feat(forge): tomato-image 客戶端（gen/edit/views、503 退避）"
```

---

### Task 11: grimoire 契約與 SKILL.md 路由器

**Files:**
- Create: `SKILL.md`
- Create: `CLAUDE.md`
- Create: `AGENTS.md`
- Create: `grimoire/intake.md`
- Create: `grimoire/spec.md`
- Create: `grimoire/build.md`
- Create: `grimoire/physics.md`
- Create: `grimoire/review.md`
- Create: `grimoire/scripts.md`

**Interfaces:**
- Consumes: 全部先前任務的 CLI 與合約。
- Produces: agent 執行 pipeline 時的完整指引文件集。

- [ ] **Step 1: 寫 SKILL.md**

```markdown
---
name: img2babylon
description: 從一張參考圖（或文字描述經 tomato-image 生圖）以程式碼重建 Babylon.js 程序化 3D 模型，附真實 Havok 物理碰撞（複合形狀、質量、hinge 約束），可丟擲、堆疊、翻倒。
version: 0.1.0
---

# img2babylon

Agent-agnostic：可在 Claude Code 或 Codex 下執行。文中「agent vision」指 host 的圖片
閱讀能力；「agent browser tool」指 host 的瀏覽器工具（或使用者提供的截圖）。

工作目錄：本 repo 根目錄。viewer 的 npm 命令在 `viewer/` 下執行。

## 鐵律

1. 只能用程式碼建模（primitives / CSG / DynamicTexture），禁止外部 mesh 或貼圖資產。
2. 證據落地：每張截圖先存檔到 `.img2babylon/shots/`，再用 agent vision 讀回；
   行內預覽不是證據。
3. 一次只看一張並排對照表（`forge/compare.py` 產生）。
4. 物理是一等公民：spec 的 `physics` 區塊不可省略；三層物理 gate 全綠才算完成。
5. 修正上限：每 pass 3 次、全程 6 次（`forge/next_pass.py correction` 會擋，exit 3 = 停）。
6. 尺寸烘進幾何建構參數，不用 `scaling` 承載尺寸。
7. 決定性：所有程序化雜訊帶 seed；單位一律公尺。
8. 物理權威是 `physics.constraints`；`attachment` 只描述視覺對位。

## 順序（Order of Operations）

0. 初始化：`python3 forge/next_pass.py init --model <name>`
1. 取得參考圖（讀 `grimoire/intake.md`）：
   文字描述 → `python3 forge/tomato.py gen --prompt "..." --seed N --out .img2babylon/<name>/hero.png`；
   需要側/背視角 → `forge/tomato.py views`。tomato 不可達 → 降級為使用者提供圖片。
2. agent vision 分析參考圖，依 `grimoire/spec.md` 撰寫 `viewer/models/<name>/spec.json`
   （模板：`python3 forge/new_spec.py --name <name> --out viewer/models/<name>`）。
3. Gate：`python3 forge/validate_spec.py viewer/models/<name>/spec.json --strict`
   全綠才可產碼；未過 → 修 spec，不准先寫程式。
4. 依 `grimoire/build.md` 與 `grimoire/physics.md` 撰寫
   `viewer/models/<name>/create<Name>Model.ts` 並在 `viewer/src/registry.ts` 註冊。
   一次只完成 `next_pass.py status` 顯示的當前 pass；每 pass 結束跑第 5 步後
   `python3 forge/next_pass.py done`。
5. 每 pass 的驗證（讀 `grimoire/review.md`）：
   a. `cd viewer && npx tsc --noEmit`
   b. `npx tsx scripts/runtime_export.ts <name> --spec models/<name>/spec.json --out ../.img2babylon/<name>/runtime.json`
      → `python3 forge/check_colliders.py .img2babylon/<name>/runtime.json`
   c. `npx tsx scripts/physics_test.ts <name>`（有 hinge 時加 `--nudge <bodyId>`）
   d. agent browser tool 開 `http://localhost:5173/#model=<name>` 截圖（hero、
      碰撞線框各一）→ `forge/compare.py` 產對照表 → agent vision 目視評分。
   e. 未過 → `python3 forge/next_pass.py correction`（exit 3 = 停下來問使用者），
      依 review.md 選動作：continue | refine-spec | refine-code | request-input | stop。
6. polish pass 完成且三層物理 gate 全綠 → 收尾（commit、告知使用者）。

## 檔案地圖

| 路徑 | 用途 |
|---|---|
| `grimoire/intake.md` | 參考圖取得與分析契約 |
| `grimoire/spec.md` | BabylonSculptSpec v1 撰寫指南（含完整藥罐範例） |
| `grimoire/build.md` | Babylon 幾何模式與 pass 契約 |
| `grimoire/physics.md` | Havok collider / 質量 / hinge 契約 |
| `grimoire/review.md` | review gate、評分、修正動作 |
| `grimoire/scripts.md` | 全部工具命令速查 |
| `forge/*.py` | 確定性工具（tomato / new_spec / validate_spec / next_pass / check_colliders / compare） |
| `viewer/` | Vite + Babylon + Havok viewer 與 headless 腳本 |
```

- [ ] **Step 2: 寫 CLAUDE.md 與 AGENTS.md（極薄）**

`CLAUDE.md`:
```markdown
# img2babylon

本 repo 是 `img2babylon` skill 的正典來源。入口與全部規則在 `SKILL.md`——先讀它。

Host 入口 symlink（單一 checkout，嚴禁複製兩份導致漂移）：

```text
~/.claude/skills/img2babylon -> 本 checkout
~/.codex/skills/img2babylon  -> 本 checkout
```

- forge/ 只准 Python 3.10+ stdlib，零第三方依賴。
- viewer/ TypeScript strict；驗證命令見 SKILL.md 第 5 步。
- `reference/` 是外部參考 checkout（img2threejs），唯讀、不納版控。
```

`AGENTS.md`:
```markdown
# img2babylon — Codex 入口

先讀 `SKILL.md`：它是本 skill 的路由器與全部鐵律。文件中「agent vision」＝你的
圖片閱讀能力；「agent browser tool」＝你的瀏覽器工具，沒有就請使用者提供截圖。

驗證命令速查在 `grimoire/scripts.md`。forge/ 只准 Python stdlib；viewer/ 需
`npm install` 過一次。
```

- [ ] **Step 3: 寫 grimoire/intake.md**

```markdown
# Intake：取得並分析參考圖

## tomato-image 生圖（主要路徑）

- 生成：`python3 forge/tomato.py gen --prompt "<英文 prompt>" --seed <N> --out .img2babylon/<name>/hero.png`
- Prompt 準則：英文；單一物件置中；中性素背景；柔和均勻光；避免強透視。
  例：`"a plastic pill bottle with a flip-top cap, slightly open, centered,
  plain light gray background, soft studio lighting"`。
- 補視角（幾何不確定時才用）：`python3 forge/tomato.py views --image hero.png --out-dir .img2babylon/<name>/`
  產生 side.png / rear.png。edit 模式輸出跟隨來源尺寸。
- 記下輸出 JSON 的 `job_id` 與 prompt，填入 spec 的 `sourceImages`。
- 降級：連線失敗或 503 重試耗盡 → 明確告知使用者，改請使用者提供圖片
  （`sourceImages[].origin` 填 `user`）。

## 圖片分析（agent vision，寫 spec 前必做）

逐項回答並反映到 spec：
1. 這是什麼物件？拆成哪些元件（componentTree 草稿）？
2. 真實世界尺寸估計（公尺；藥罐直徑約 0.05、高約 0.1）。
3. 每個元件的 primitive 對應（瓶身=cylinder 或 lathe、蓋=cylinder、標籤=DynamicTexture）。
4. 哪些部分會相對運動？→ 拆成不同 physics body；接合處是哪種 attachment？
5. 材質：底色、粗糙度、透明度（藥罐常見半透明琥珀塑膠）。
6. 對每項估計標 confidence（0–1），低於 0.5 的考慮補視角。
```

- [ ] **Step 4: 寫 grimoire/spec.md**

內容 = schema 逐欄位說明（照設計文件 §4）＋一份**完整揀蓋藥罐範例 spec**（body、cap
兩個 macro 元件與 label meso 元件；bodies 兩條 mass 0.04 / 0.008；hinge constraint
axis [1,0,0]、limits [0, 1.92]；attachment 與 constraint 的 pivot 一致）。範例必須能
通過 `validate_spec.py --strict`（撰寫時實際跑過再放入文件）。文件同時載明：
- 權威規則：物理行為以 `physics.constraints` 為準，`attachment` 僅視覺對位，兩者
  axis 必須相同、pivot 差 ≤ 5mm。
- macro 元件必有 collider 與 material；每元件恰屬一個 body。
- `silhouette.complexity`: simple（≤2 元件可過）/ moderate / complex（strict 要求 ≥3 元件）。

- [ ] **Step 5: 寫 grimoire/build.md**

```markdown
# Build：Babylon 幾何模式與 pass 契約

## Factory 骨架（照抄 viewer/models/sample-crate/createSampleCrateModel.ts 的形狀）

- default export：`(scene, opts) => BuiltModel`（型別在 `viewer/src/types.ts`）。
- 每個 macro/meso 元件一個 pivot `TransformNode`（命名 `<id>__pivot`），visual mesh
  是它的子節點；mesh 永遠是葉節點。
- 在 `viewer/src/registry.ts` 註冊：`"<name>": () => import("../models/<name>/create<Name>Model")`。
- 完成後設 `root.metadata = { sculptRuntime: { nodes, meshes, bodies, constraints } }`。

## Pass 契約（一次只做當前 pass）

| pass | 允許動的東西 | 完成標準 |
|---|---|---|
| blockout | 各元件的 primitive、尺寸、位置（灰模） | 輪廓與參考圖大致吻合 |
| structure | 元件細分、倒角、開口、接合對位 | 元件邊界正確、無穿插 |
| material | StandardMaterial/PBRMaterial、DynamicTexture 標籤、透明度 | 色彩材質貼近參考圖 |
| physics | PhysicsBody、ShapeContainer、constraint（讀 physics.md） | 三層物理 gate 全綠 |
| polish | 細節微調、seed 固定、metadata、dispose 完整 | 對照表評分達標 |

## 常用幾何配方

- 圓瓶身：`MeshBuilder.CreateCylinder(name, { height, diameter, tessellation: 48 })`；
  帶肩線用 `CreateLathe`（profile 點列 Vector3[]）。
- 揀蓋：主體 cylinder + 蓋頂小 box 舌片；鉸鏈側加一小段 box 對位鉸鏈位置。
- 標籤：`new DynamicTexture(name, { width: 512, height: 256 }, scene)` 取 2D context
  畫底色/線條/文字，貼在瓶身中段的 cylinder 面（`diffuseTexture`）。
- 半透明塑膠：`material.alpha = 0.85`（StandardMaterial）；顏色琥珀 `(0.8, 0.52, 0.2)`。
- 禁止：載入 .glb/.png 外部資產、`scaling` 承載尺寸、無 seed 的 random。
```

- [ ] **Step 6: 寫 grimoire/physics.md**

````markdown
# Physics：Havok 契約（一等公民）

## Body：每個 spec `physics.bodies[]` 一個 PhysicsBody

```ts
const body = new PhysicsBody(bodyRootPivot, PhysicsMotionType.DYNAMIC, false, scene);
const container = new PhysicsShapeContainer(scene);
for (每個帶 collider 的元件) {
  const shape = makeShape(collider, scene);       // 見下表
  shape.material = { friction, restitution };      // 取自 spec body
  // 子形狀位置 = 元件 pivot 相對 body root pivot 的位移 + collider.offset
  container.addChild(shape, relativePosition, relativeRotationQuaternion);
}
body.shape = container;
body.setMassProperties({ mass, centerOfMass: Vector3.FromArray(spec.centerOfMass) });
```

| collider.type | Babylon 類別 | 參數對應（size = [sx, sy, sz]） |
|---|---|---|
| box | `PhysicsShapeBox(center, rotation, extents, scene)` | extents = size |
| sphere | `PhysicsShapeSphere(center, radius, scene)` | radius = sx / 2 |
| cylinder | `PhysicsShapeCylinder(pointA, pointB, radius, scene)` | A/B = ±sy/2 沿 Y，radius = sx/2 |
| capsule | `PhysicsShapeCapsule(pointA, pointB, radius, scene)` | 同上，radius = sx/2 |
| convex | `PhysicsShapeConvexHull(mesh, scene)` | 直接包 visual mesh |

## Hinge（揀蓋）：6DoF 鎖五軸 + 單角軸 limit

```ts
import { Physics6DoFConstraint, PhysicsConstraintAxis } from "@babylonjs/core";
const hinge = new Physics6DoFConstraint(
  {
    pivotA: Vector3.FromArray(con.pivotA),   // body 局部
    pivotB: Vector3.FromArray(con.pivotB),   // cap 局部
    axisA: Vector3.FromArray(con.axis),
    axisB: Vector3.FromArray(con.axis),
    perpAxisA: 任一與 axis 垂直的單位向量,
    perpAxisB: 同 perpAxisA,
  },
  [
    { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
    { axis: PhysicsConstraintAxis.ANGULAR_X,
      minLimit: con.limits[0], maxLimit: con.limits[1] },
  ],
  scene,
);
bodies[con.bodyA].addConstraint(bodies[con.bodyB], hinge);
constraints.push(hinge);
```

## 質量與密度速查（gate 檢查 50–3000 kg/m³）

| 材質 | 密度 kg/m³ | 例 |
|---|---|---|
| 發泡/空心塑膠件 | 100–400 | 藥罐瓶身（大半是空氣）→ 用有效密度 |
| 實心塑膠 | 900–1200 | 蓋子 |
| 木 | 400–800 | 木箱 |
| 玻璃/陶瓷 | 2200–2700 | 玻璃罐 |

藥罐參考值：瓶身 0.04 kg、蓋 0.008 kg。

## 陷阱

- 建 body 後再搬 transform：先 `body.disablePreStep = false` → 下一幀後設回 true。
- `PhysicsShapeContainer` 的子形狀位置是相對 body 的 transform node，不是世界座標。
- constraint 加在兩個 body 之間（`bodyA.addConstraint(bodyB, c)`），不是 mesh。
- 蓋子質量遠小於瓶身時，把 hinge 兩端 pivot 算準（差 1cm 就會震盪）。
````

- [ ] **Step 7: 寫 grimoire/review.md**

```markdown
# Review：gate、截圖、評分、修正

## 每 pass 驗證順序（快到慢，前面失敗就不必跑後面）

1. `cd viewer && npx tsc --noEmit`
2. `python3 forge/validate_spec.py viewer/models/<name>/spec.json --strict`（spec 改過才需要）
3. `npx tsx scripts/runtime_export.ts <name> --spec models/<name>/spec.json --out ../.img2babylon/<name>/runtime.json`
   → `python3 forge/check_colliders.py .img2babylon/<name>/runtime.json`
4. `npx tsx scripts/physics_test.ts <name>`；有 hinge 時再跑一次加 `--nudge <capBodyId>`
5. 視覺截圖（agent browser tool；先 `cd viewer && npm run dev`）：
   - hero：`http://localhost:5173/#model=<name>`，存 `.img2babylon/shots/<name>-hero.png`
   - 碰撞線框：按「碰撞線框」鈕後再截，存 `<name>-collider.png`
   - 每張都要存檔後用 agent vision 讀回。
6. `python3 forge/compare.py .img2babylon/<name>/hero.png .img2babylon/shots/<name>-hero.png --out .img2babylon/<name>/sheet.png`
   → agent vision 只看這張表評分。

## 評分（記入 spec 的 reviewHistory）

`{"pass": "<pass>", "likeness": 0-10, "colliderFit": 0-10, "action": "<動作>", "notes": "..."}`
- likeness ≥ 7 且 colliderFit ≥ 8 → 該 pass 通過（`next_pass.py done`）。
- colliderFit 看碰撞線框截圖：線框是否貼合視覺外形、有無明顯突出/縮水。

## 動作（唯一合法集合）

| 動作 | 時機 |
|---|---|
| continue | 通過，進下一 pass |
| refine-code | 幾何/材質/物理程式碼問題 |
| refine-spec | 尺寸、拆件、collider 定義本身錯 → 改 spec 後重跑 validate |
| request-input | 修正上限到（correction exit 3）或需要使用者決策 |
| stop | 使用者叫停或已完成 |

每次 refine-* 前先 `python3 forge/next_pass.py correction`；exit 3 → 一律 request-input。
```

- [ ] **Step 8: 寫 grimoire/scripts.md**

```markdown
# Scripts 速查

（工作目錄：repo 根；viewer 命令需先 cd viewer）

| 命令 | 用途 |
|---|---|
| `python3 forge/next_pass.py init --model <name>` | 初始化狀態機 |
| `python3 forge/next_pass.py status` | 當前 pass 與修正次數 |
| `python3 forge/next_pass.py done` | 完成當前 pass |
| `python3 forge/next_pass.py correction` | 登記一次修正（exit 3 = 上限） |
| `python3 forge/tomato.py gen --prompt "..." --seed N --out p.png` | 生參考圖 |
| `python3 forge/tomato.py edit --image a.png --prompt "..." --out b.png` | 指令式修圖 |
| `python3 forge/tomato.py views --image hero.png --out-dir d/` | 補側/背視角 |
| `python3 forge/new_spec.py --name <name> --out viewer/models/<name>` | spec 模板 |
| `python3 forge/validate_spec.py <spec> --strict` | spec gate（exit 2 = 未過） |
| `python3 forge/check_colliders.py <runtime.json>` | 靜態物理 gate |
| `python3 forge/compare.py ref.png render.png --out sheet.png` | 並排對照表 |
| `npx tsc --noEmit` | typecheck |
| `npx tsx scripts/runtime_export.ts <name> --spec models/<name>/spec.json --out out.json` | 匯出 AABB |
| `npx tsx scripts/physics_test.ts <name> [--nudge <bodyId>]` | 動態物理 gate |
| `npm run dev` | 開 viewer（http://localhost:5173/#model=<name>&physics=1） |
| `python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'` | forge 全測試 |
```

- [ ] **Step 9: 驗證 spec.md 範例**

把 grimoire/spec.md 裡的藥罐範例 JSON 抽出存成暫存檔跑
`python3 forge/validate_spec.py /tmp/pill-example.json --strict`，必須 `OK` 才放進文件。

- [ ] **Step 10: Commit**

```bash
git add SKILL.md CLAUDE.md AGENTS.md grimoire/
git commit -m "docs: SKILL.md 路由器與 grimoire 契約六件套"
```

---

### Task 12: 雙 host symlink 與 README

**Files:**
- Create: `README.md`
- Create（repo 外）: `~/.claude/skills/img2babylon`、`~/.codex/skills/img2babylon` symlinks

- [ ] **Step 1: 建 symlink**

```bash
mkdir -p ~/.claude/skills ~/.codex/skills
ln -sfn /home/wake/projects/img2three ~/.claude/skills/img2babylon
ln -sfn /home/wake/projects/img2three ~/.codex/skills/img2babylon
ls -la ~/.claude/skills/img2babylon ~/.codex/skills/img2babylon
```

Expected: 兩個 symlink 都指向 `/home/wake/projects/img2three`，且
`~/.claude/skills/img2babylon/SKILL.md` 可讀。

- [ ] **Step 2: 寫 README.md**

```markdown
# img2babylon

從一張參考圖（或文字描述經內網 tomato-image 生圖）出發，由 agent（Claude Code /
Codex CLI）以程式碼產生 Babylon.js 程序化 3D 模型——附真實 Havok 物理：複合碰撞
形狀、質量、hinge 約束，可丟擲、堆疊、翻倒。

架構參考 [img2threejs](https://github.com/hoainho/img2threejs)（見 `reference/`），
關鍵差異：collider 從 metadata 升級為一等公民，並新增三層物理驗證
（靜態 AABB gate / headless Havok 模擬 / PhysicsViewer 目視）。

- 入口與規則：`SKILL.md`
- 設計文件：`docs/superpowers/specs/2026-08-31-img2babylon-design.md`
- 快速開始：`cd viewer && npm install && npm run dev` →
  `http://localhost:5173/#model=sample-crate`
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README 與雙 host symlink 完成"
```

---

### Task 13: 驗收一——揀蓋式藥罐（Claude Code 駕駛完整 pipeline）

**Files:**
- Create: `viewer/models/pill-bottle/spec.json`（由 pipeline 產生）
- Create: `viewer/models/pill-bottle/createPillBottleModel.ts`（由 pipeline 產生）
- Modify: `viewer/src/registry.ts`（註冊 pill-bottle）

此任務**就是照 SKILL.md 跑一遍 pipeline**——它同時驗收工具鏈與文件是否真的可駕駛。執行者：依 SKILL.md 順序 0→6 執行，不要繞過任何 gate。要點：

- [ ] **Step 1: 生參考圖**

```bash
python3 forge/next_pass.py init --model pill-bottle
mkdir -p .img2babylon/pill-bottle
python3 forge/tomato.py gen --seed 7 --out .img2babylon/pill-bottle/hero.png \
  --prompt "a translucent amber plastic pill bottle with a white flip-top cap, cap slightly open showing the hinge, centered, plain light gray background, soft studio lighting"
```

用 agent vision 讀回 hero.png 確認：揀蓋結構清晰可見；否則換 seed 重生（最多 3 次）。

- [ ] **Step 2: 寫 spec 並過 gate**

依 grimoire/intake.md 分析 → 依 grimoire/spec.md 寫 `viewer/models/pill-bottle/spec.json`
（body + cap 兩個 body、hinge constraint）→ `python3 forge/validate_spec.py ... --strict` 綠。

- [ ] **Step 3: 逐 pass 產碼與驗證**

依 grimoire/build.md 逐 pass 寫 `createPillBottleModel.ts`、registry 註冊；每 pass 跑
grimoire/review.md 的驗證順序。physics pass 必須：
`check_colliders` OK、`physics_test.ts pill-bottle` pass、
`physics_test.ts pill-bottle --nudge cap` pass。

- [ ] **Step 4: 瀏覽器驗收**

`npm run dev` → agent browser tool 開 `#model=pill-bottle`：
hero 截圖、碰撞線框截圖、「拋起」後模型落地靜止、蓋子受衝擊會開合且停在 limit 內。
對照表評分 likeness ≥ 7、colliderFit ≥ 8。

- [ ] **Step 5: Commit**

```bash
git add viewer/models/pill-bottle/ viewer/src/registry.ts
git commit -m "feat(models): pill-bottle 揀蓋藥罐（驗收一通過）"
```

---

### Task 14: 驗收二——Codex CLI 駕駛冒煙（木箱）

**Files:** 無新檔（Codex 產出 `viewer/models/codex-crate/`）。

- [ ] **Step 1: 跑 codex exec**

```bash
cd /home/wake/projects/img2three
codex exec "你是 img2babylon skill 的執行者。先完整閱讀 SKILL.md，然後照它的順序建立一個名為 codex-crate 的簡單木箱模型（wooden crate）：用 forge/tomato.py 生參考圖、寫 spec、過 validate gate、寫 factory、跑 runtime_export + check_colliders + physics_test 三個 gate。你沒有瀏覽器工具，跳過 SKILL.md 第 5d 步的截圖，其餘 gate 一律不可跳過。全部 gate 綠後停止並總結。"
```

- [ ] **Step 2: 驗證 Codex 產出**

```bash
python3 forge/validate_spec.py viewer/models/codex-crate/spec.json --strict
cd viewer && npx tsc --noEmit && npx tsx scripts/physics_test.ts codex-crate
```

Expected: 全綠。若 Codex 中途卡住，記錄卡點（哪份文件不夠清楚）→ 修 grimoire/SKILL.md
措辭 → 重跑一次。這一步的產出是「文件對非 Claude agent 也可駕駛」的證據。

- [ ] **Step 3: Commit（含 Codex 產出與任何文件修正）**

```bash
git add viewer/models/codex-crate/ viewer/src/registry.ts SKILL.md grimoire/ 2>/dev/null
git commit -m "test: Codex CLI 端到端冒煙（codex-crate）通過，驗證 agent-agnostic"
```

---

## Self-Review 紀錄

- Spec 覆蓋：設計文件 §2 流程（Task 11 SKILL.md）、§3 目錄（Task 1–12）、§4 spec schema（Task 7）、§5 factory 合約（Task 1/2）、§6 三層 gate（Task 3/4/8 + review.md）、§7 Codex（Task 12/14）、§8 錯誤處理（tomato 退避 Task 10、Havok banner Task 1、修正上限 Task 6）、§9 驗收（Task 13/14）。§11 roadmap 明確不在本次範圍。
- 型別一致：`BuiltModel.bodies: Record<string, PhysicsBody>` 貫穿 Task 1/2/3/4/5 與 grimoire；runtime.json schema 在 Task 4 定義、Task 8 消費，欄位名一致（meshes/bodies/colliders/aabb/volume/centerOfMassWorld）。
- 無佔位符：所有程式碼區塊為完整實作；grimoire 內容為實文（spec.md 的藥罐範例要求先跑過 validator 才入文，Task 11 Step 9）。
