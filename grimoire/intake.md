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
