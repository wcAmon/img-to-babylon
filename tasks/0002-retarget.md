# 0002 forge/retarget.py — 動作時間線 retarget 引擎
model: action-figure        status: done
症狀: M5 需要把外部骨骼動畫（kimodo.cpp 輸出 GLB）轉成公仔可播的關節角時間線；
     目前 forge/ 沒有任何 GLB 解析與 retarget 能力。
驗收: 1. python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'
        全綠，含新 forge/tests/test_retarget.py（TDD，≥12 測試）
     2. python3 forge/tests/make_fixture_glb.py /tmp/mini_walk.glb &&
        python3 forge/retarget.py /tmp/mini_walk.glb --spec viewer/models/action-figure/spec.json --out /tmp/timeline.json
        exit 0，且 timeline.json 滿足契約（見下）
     3. python3 forge/validate_spec.py viewer/models/action-figure/spec.json --strict 照舊 OK
       （0002 不准動 viewer/ 與任何既有 gate）
timeline JSON 契約（0003 motion gate 將依此建）:
     {"model": "action-figure", "fps": 20, "frames": N,
      "tracks": {"servo:<bodyB>.<axis>": [rad × N, ...], ...}}
     - tracks 鍵只能是 spec 宣告的 19 個伺服軸（9 關節非 locked 軸）
     - 每軌長度 == frames；每值已夾進該軸 spec angular 限位
notes:
  - TDD：先新增並確認 `forge.tests.test_retarget` 因 `forge.retarget` 不存在而紅燈；實作後
    `python3 -m unittest discover -s forge/tests -t . -p 'test_*.py'` 共 90 測試全綠
    （既有 76＋新增 14）。
  - fixture：`forge/tests/make_fixture_glb.py` 產生決定性 GLB v2，包含 root、
    L_Shoulder、L_Elbow、head 四節點與 0/0.5/1.0 秒三幀 LINEAR rotation；肩部末幀
    2.2 rad，刻意超過 action-figure 的 1.6 rad 限位以驗證夾限。
  - XZY：Python 使用與 `viewer/scripts/physics_test.ts:eulerXZY` 相同的矩陣取值公式
    `atan2(m12,m11) / atan2(m20,m00) / asin(-m10)`；測試以
    `(x=0.35, y=-0.42, z=0.27)` 的獨立已知角做 quaternion 往返，逐分量誤差小於
    1e-6，另驗證 `rest^-1 * frame` 會移除 0.4 rad rest pose 得到 0.3 rad。
  - CLI 驗收：預設 20 fps 的 fixture 輸出 model=action-figure、frames=21、19 軌且
    全部長度 21；`servo:upper-arm-l.x` 最大值為 1.6（已夾限），未映射軸為全零；
    非法 GLB 回傳 exit 1 且不產生輸出。`validate_spec.py --strict` 維持 OK。
- 監工獨立驗收（2026-09-01 23:07）：unittest 90/90 綠、CLI 對 fixture 輸出
  21 幀 19 軌契約全合（夾限驗證 upper-arm-l.x max=1.6）、import 純 stdlib、
  viewer/ 零改動。卡標 done。
