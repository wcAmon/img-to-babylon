# 0007 Divine Eye 顯微鏡：--region 區域裁切審查
model: action-figure        status: open
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
