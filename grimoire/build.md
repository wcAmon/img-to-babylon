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
