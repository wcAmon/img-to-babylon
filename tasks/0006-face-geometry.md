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
  - 0008 視覺驗收發現（2026-09-02 08:52）：正面近拍 .img2babylon/shots/face-front.png
    眉毛被髮瀏海（hair-fringe）完全遮蔽；參考圖眉毛在髮際線下清楚可見。
    臉對臉 Divine Eye：fidelity 0.3663（門檻 0.36 壓線過），edgeOverlap 0.237 偏低
    ——主因即眉毛缺席。開第二輪：調眉毛位置（下移/前凸）與/或縮瀏海，
    使正面兩眉完整可見；face_test 斷言不變仍須全綠。
  - 第二輪修正（2026-09-02）：只調整 `hair-fringe` 視覺幾何，diameterY 由 0.008
    收至 0.0054，hair pivot 下的 y 由 -0.003 上移至 -0.0005；瀏海下緣離開眉毛主體，
    保留原眉眼距與臉部比例。未修改眉毛幾何、spec.json、PhysicsBody、constraints 或質量。
  - 第二輪 gate（2026-09-02）：`npx tsc --noEmit` exit 0；`face_test.ts`
    `PASS（六件五官立體、對稱、掛頭下）`；`physics_test.ts` `pass: true`，10 bodies
    皆 finite、9 constraints 皆 ok；`motion_suspension_test.ts` `motion suspension tests: pass`。
  - 第二輪監工驗收（2026-09-02 08:56）：tsc/face_test/physics_test/suspension 綠；
    playwright 正面複驗兩眉完整可見（.img2babylon/shots/face-front.png）；
    臉對臉 Divine Eye fidelity 0.366→0.386、phash 0.688→0.75、edgeOverlap
    0.237→0.288，pass 有餘裕。0008 證據：face-front/face-side/
    action-figure-hero-m6.png。頭身比與參考圖不同（3D 頭佔 27% vs 參考 45%），
    故顯微鏡 --region 同分數矩形不可直接跨圖用，臉區驗收改各自像素裁切後全圖比。
