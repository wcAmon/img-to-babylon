# 0006 五官立體化：平面貼圖臉換成 3D 幾何
model: action-figure        status: done
症狀: hero.png 參考圖的臉（粗黑眉、亮黑圓眼＋白眼神光、微笑）目前實作是
     createActionFigureModel.ts 裡 paintFace() 畫在 0.002 薄盒 "face" 上的
     DynamicTexture——側面看完全是平的，且 headless 無 canvas 時整張臉消失。
     要換成掛在 head 節點下的真 3D 視覺子件：
     - eye-l / eye-r：亮黑半球或小球（高 specular）＋白色眼神光小球（可併入同 mesh）
     - brow-l / brow-r：深棕扁盒，微傾角
     - mouth：細 torus 弧段（微笑，暖紅棕色）
     - nose：小膚色凸起（參考圖鼻子很含蓄，做小凸球即可）
     位置比例參考 paintFace() 現有 2D 佈局（眉上、眼中、嘴下），貼著頭球前表面。
     舊 "face" 薄盒與 paintFace() 移除（膚色由 head 材質承擔）。
     純視覺零物理變動：不加 PhysicsBody、不動 spec.json、不動 constraints。
驗收: 1. cd viewer && npx tsc --noEmit
     2. node --import tsx scripts/face_test.ts 全綠（監工已寫紅；斷言與門檻勿改：
        六件五官存在、face 薄盒移除、凸出頭球 ≥0.0005、前半球、貼近頭 <1.6R、
        左右鏡射 1.5mm、掛 head 節點樹下）
     3. node --import tsx scripts/physics_test.ts action-figure --spec models/action-figure/spec.json 照舊綠
     4. node --import tsx scripts/motion_test.ts action-figure --spec models/action-figure/spec.json --timeline ../.img2babylon/motion/walk-timeline.json 照舊綠
     5. node --import tsx scripts/motion_suspension_test.ts 照舊綠
notes:
  - 實作摘要：移除 `paintFace()`、DynamicTexture 與舊 `face` 薄盒；在 `head`
    節點下新增真實幾何 `eye-l/eye-r`（高鏡面亮黑球＋白色眼神光小球）、
    `brow-l/brow-r`（微傾深棕扁盒）、`nose`（小膚色凸球）、`mouth`（暖紅棕實體半圓管微笑）。
    未新增 PhysicsBody，未修改 spec.json、constraints 或質量。
  - Gate 輸出要點（2026-09-02）：`npx tsc --noEmit` exit 0；`face_test.ts`
    `PASS（六件五官立體、對稱、掛頭下）`；`physics_test.ts` `pass: true`，10 bodies
    皆 finite、9 constraints 皆 ok；`motion_test.ts` `finite: true`、constraints 9→9 stable、
    全 tracks `pass: true`、總 `pass: true`；`motion_suspension_test.ts` `motion suspension tests: pass`。
  - 監工驗收（2026-09-02 08:46）：tsc、face_test（六件五官立體/對稱/掛頭下）、
    physics_test、motion_test（walk timeline）、motion_suspension_test、
    actuation_test 全綠；toy-racer physics/actuation 迴歸綠。diff 目檢：真幾何
    （眼球+眼神光球、眉盒微傾、鼻凸球、微笑 tube 弧），無貼圖作弊。卡標 done。
    視覺近拍驗收歸 0008。
