# yui

2026-09-14，使用者將本專案目前的女性戰術人偶正式命名為 **yui**，名稱使用小寫。後續對話、設計與優化文件均以 yui 稱呼這個角色。

## 模型對應

- 角色名稱：`yui`
- 穩定模型 ID：`female-tactical`
- 模型目錄：[`viewer/models/female-tactical/`](../viewer/models/female-tactical/)
- 顯示名稱與迭代資料：[`iteration.json`](../viewer/models/female-tactical/iteration.json)
- 建模配方：[`spec.json`](../viewer/models/female-tactical/spec.json)
- 原始參考圖：[`reference/female.png`](../viewer/models/female-tactical/reference/female.png)

這是現有人偶的命名，沿用既有模型 ID、零件 ID、路徑、參考圖與歷史版本。預覽頁標題從迭代資料的 `displayName` 讀取 yui，避免重新建模時遺失名稱。

## 設計與持續迭代

yui 是偏 Fortnite 風格、融合 COD 戰術服裝元素的女性低多邊形角色；目標是保留風格化比例並逐步增加接近仿真的頭臉與全身細節。

命名時的檢查版本為第 5 輪第 4 次修正，125 個零件、29,644 個三角形。頭臉神韻與服裝造型仍待改善，尚未完成動畫骨架綁定。命名不計入造型修正次數；每輪最多 6 次修正的規則維持不變。

- [第 5 輪優化紀錄](character-round5.md)
- [第 6 輪優化紀錄](character-round6.md)
- [前後對照圖](../viewer/models/female-tactical/evidence/round5-final/before-after-face.png)
- [實際渲染與驗證紀錄](../viewer/models/female-tactical/evidence/round5-final/review.json)

後續精修 yui 時，應延續同一份配方、零件拆分、優化路徑與失敗紀錄。
