# 0027 playground 互動續（M15）
model: （無新模型；../playground src/interactions.ts、src/grab.ts、src/ui.ts、scripts/scene_test.ts）    status: done（2026-09-06）
脈絡: 使用者 2026-09-05 深夜選 docs/next-steps.md 第 2 項「互動續」；核准四項（吸附墊擦拭、消毒不淡出、封袋計數、噴瓶自動下壓）。
     設計文件 docs/superpowers/specs/2026-09-06-playground-interactions-2-design.md；計畫 docs/superpowers/plans/2026-09-06-playground-interactions-2.md。
分工: Claude 全做。
驗收: playground `npm run typecheck` 綠；`npm run scene-test` 34/34（既有 31＋grab:aim-nozzle／interact:seal-count／interact:wipe）；
     tailnet https://monkeyday.tail8e3f79.ts.net/ 200、bundle 含新提示；playwright 以合成 pointer 事件走真實輸入層：抓噴瓶噴口 −0.344、滾輪抬高、拖曳、噴灑 60/60、消毒 100%；
     吸附墊攤開拖到水漬上→「水漬已擦拭」、puddle disabled；10 顆凝固顆粒封袋→「已封入凝固顆粒 10」、質量 0.20→0.23。證據 .img2babylon/shots/playground5-{wipe,sealed}.png。
notes:
  - 擦拭判定＝半片平放＋水漬中心在半片局部 AABB 內；alpha 遞減蓋過消毒內插；wiped 後足跡半徑 0（不再吸附／消毒）。
  - sealClumps 以「collect 呼叫前後比對」計數，不監聯 dispose（沒有事件，且粉罐歸位也 dispose）。
  - aimNozzle 讀 bodies.bottle 方向、tilt 作用於被抓 body（扳機亦可，hinge 相連）；θ = pitch − (−0.35)，繞 Cross(Up, 噴口水平向) 為下壓。
  - 合成 pointer 事件：pointermove 必帶 button −1，否則 Babylon 交替合成 up／down；抓低處噴瓶要先滾輪抬高再拖，否則瓶底拖地俯角回 0。
  - 只 commit 上列四檔（index.html 未動）；README 加一句留在工作區未提交；`npm run serve` 連同 parkour 場景上線。
