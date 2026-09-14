# yui 第 6 輪：generative-assist

設計：`docs/superpowers/specs/2026-09-14-yui-generative-assist-design.md`。
`c0/` 是準備期證據（切圖、延伸、漂移 gate、候選比較），不計修正次數。
`cN/`（N ≥ 1）是計次修正，每次含 author.py、rebuild.sh、changes.json、strict.json、visibility.json、physics.json 與固定視角 PNG。
生成 GLB 與貼圖原檔在 `.img2babylon/female-tactical/generative/`，只有 provenance 雜湊進版控。
