# 0007 Divine Eye 顯微鏡：--region 區域裁切審查
model: action-figure        status: done
症狀: forge/divine_eye.py 只能全身審查；M6 人臉優化需要對「臉區」單獨跑
     確定性訊號。加 `--region x,y,w,h`（四個 0..1 分數，逗號分隔）：
     相對「各自前景 bbox」的分數矩形（x,y 為 bbox 內左上偏移、w,h 為佔
     bbox 比例），reference 與 render 各自裁出該矩形的像素區域後，對裁切
     結果跑與現行完全相同的 evaluate 訊號組。JSON 輸出加 "region" 欄位
     （回報收到的四個分數）。無 --region 時行為與現狀 bit-for-bit 相同。
     實作約束：Python 3.10+ stdlib only；TDD（紅燈先亮）；合成 PNG fixtures
     （參考 forge/tests/ 既有作法），不依賴真 hero.png；region 越界（x+w>1
     等）要 argparse error 明確報錯；裁切在前景 bbox 定位之後、訊號計算之前。
驗收: 1. python3 -m unittest discover -s forge/tests -t . -p 'test_*.py' 全綠
        （含新增 region 測試：同圖同 region 高分、region 欄位存在、
        越界報錯、無 --region 輸出與現狀相同）
     2. python3 forge/divine_eye.py --reference .img2babylon/action-figure/hero.png
        --render .img2babylon/action-figure/hero.png --region 0.2,0.0,0.6,0.4 --json
        退出碼 0 且 JSON 含 "region"（現況：unrecognized arguments，紅）
     3. grimoire/review.md 加一小節「顯微鏡（區域審查）」記用法與臉區慣例
        （臉區 ≈ bbox 上段，實際分數由 0008 監工驗收時校準）
notes:
- 已實作 `--region x,y,w,h` 的 argparse 解析與邊界驗證；region 相對 reference / render
  各自前景 bbox，於 bbox 定位後、原有 silhouette / aspect / symmetry / pHash / SSIM /
  edge / tonal 訊號計算前套用。JSON 僅在有傳參時加入 `region`，未傳時維持原輸出。
- 新增 stdlib 合成 PNG 測試：同圖同 region 高分且回報欄位、`x + w > 1` argparse
  error、無 region 結果不變；未修改既有門檻常數或既有測試。
- 文件已在 `grimoire/review.md` 增加「顯微鏡（區域審查）」與 bbox 上段臉區慣例。
- 驗收（2026-09-02）：forge unittest 共 98 tests，`OK`、exit 0；指定 action-figure
  hero 同圖 region 命令 verdict=`pass`、fidelity=1.0、JSON `region=[0.2,0.0,0.6,0.4]`、exit 0。
  - 監工驗收（2026-09-02 08:46）：forge 98 tests OK；同圖 region 命令 verdict=pass、
    region 欄位正確；越界 x+w>1 argparse 明確報錯；舊版（git show HEAD）vs 新版
    無 --region 輸出位元級相同（diff 空）。卡標 done。
