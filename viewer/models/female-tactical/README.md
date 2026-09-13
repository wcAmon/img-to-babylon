# Female tactical — 可持續迭代的女性角色

**目前為可持續迭代的原型，尚未通過整體外觀驗收。** 本次第 2 輪集中修正臉部：杏仁形眼面、薄眼皮、眉形、接合鼻樑及閉合唇形。身體、頭髮、裝備與物理定義保持原樣。此前 5.5/10 是第 1 輪整體評分，不代表本次臉部的新評分。

## 開啟

在本 repo 的 `viewer/` 執行 `npm run dev -- --host 127.0.0.1 --port 5182`，開啟：

- 造型：`http://127.0.0.1:5182/#model=female-tactical`
- 整體物理：`http://127.0.0.1:5182/#model=female-tactical&physics=1`
- 固定取景：加 `&view=front`、`&view=rear` 或 `&view=face`
- 證據截圖：加 `&shot=1` 隱藏介面；保持與參考圖相同畫幅。

介面提供旋轉／縮放、四個相機視角、群組／單一零件隔離、展開與精確還原。物理模式停用展開，避免視覺件脫離碰撞體。

## 單一模型的來源

| 檔案 | 用途 |
|---|---|
| `spec.json` | 唯一建模事實：穩定零件 ID、尺寸、父子關係、位置、環形截面配方、材質、碰撞與歷次審查 |
| `iteration.json` | 群組、編輯入口、優化依賴、各步驗收標準與已知限制 |
| `iteration-state.json` | 進度的受版本管理副本；本機 `.img2babylon` 不存在時仍可恢復 |
| `PARTS.md` | 可讀零件目錄與優化路徑，由工具產生 |
| `createFemaleTacticalModel.ts` | 薄 factory，讀 spec 呼叫共用程序化 builder |
| `reference/` | 原始核准概念與女性裁切，僅供比較，不作 runtime 貼圖 |
| `evidence/` | 真實 Babylon 截圖、並排圖與驗證結果 |

共用基礎設施在 `viewer/src/sculpt/`：幾何產生、組件組裝、複合物理、檢查狀態和操作介面各自分檔。所有尺寸烘進頂點，不靠 node scaling。左右手拇指朝內；無隨機程序噪聲，相同輸入會產生相同頂點。

## 續作步驟

1. `python3 forge/next_pass.py --model female-tactical status` 讀取目前進度。
2. 每輪最多 6 次修正，第 7 次停止；累計總次數不限。開始已授權的新輪時執行 `python3 forge/next_pass.py --model female-tactical iterate --reason "本輪目標"`，先快照後歸零本輪計數，保留所有歷史。不要在達上限時自動換輪規避它。
3. 獲得指示後以既有 component ID 修改 spec；按 `iteration.json` 的 P0/P1 清單一次處理一個目標，保留前後畫面與評分。
4. 一個 cycle 完整驗收通過後，才使用 `python3 forge/next_pass.py --model female-tactical revise --from-pass structure --reason '具體改動原因'`。工具先保存模型來源與共用 builder 快照、保留歷史，再更新版本／階段；不改模型 ID。
5. `python3 forge/model_report.py viewer/models/female-tactical --write` 重新檢查拆件覆蓋與優化引用，產生 PARTS.md。

`.img2babylon/female-tactical/revisions/rNNN/` 保存本地不可覆寫快照。完整 Git 版本同時保存型別、viewer 和工具；需要還原執行環境時使用對應 Git checkpoint。

## 驗證命令

從 repo root：

```sh
python3 forge/validate_spec.py viewer/models/female-tactical/spec.json --strict
python3 forge/model_report.py viewer/models/female-tactical --write
python3 -m unittest forge.tests.test_model_report forge.tests.test_model_iterations forge.tests.test_next_pass
```

從 `viewer/`：

```sh
npx tsc --noEmit
npx tsx scripts/female_tactical_test.ts
npx tsx scripts/runtime_export.ts female-tactical --spec models/female-tactical/spec.json --out ../.img2babylon/female-tactical/runtime.json
npx tsx scripts/physics_test.ts female-tactical --spec models/female-tactical/spec.json --out ../.img2babylon/female-tactical/physics-result.json
npm run build
```

再從 repo root：

```sh
python3 forge/check_colliders.py .img2babylon/female-tactical/runtime.json
```

圖片需要先落地到 `.img2babylon/shots/`，再做 `forge/compare.py`、`forge/divine_eye.py` 和目視審查。自動遮罩會把本參考圖部分深色衣物判作陰影，原始 reject 已完整保留；這項限制並不能代替目視相似度合格。

## 目前物理與效能範圍

122 個可追蹤視覺零件；目前以獨立 mesh 保留編輯能力，尚未合併 draw calls。三角面／頂點數可由檢查介面和 headless 測試讀取，尚無真實行動裝置效能量測。

1 個 55 kg 複合剛體，涵蓋主要肢段和背心輪廓；已驗證實際 Havok 子形狀數、質量、AABB、重疊比例、密度、質心、落下與靜止。手指、髮尖仍是視覺裝飾，不逐件碰撞。**尚未實作關節 ragdoll、動畫骨架或角色控制器。**
