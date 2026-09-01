# 0001 前輪靜態轉向不可見
model: toy-racer        status: open
症狀: playground 靜止時拉轉向滑桿，前輪視覺上幾乎不轉（實測 0.06 rad，目標 0.4）。
     技術背景：Havok 靜摩擦是硬約束、馬達是軟彈簧，力開到 1e6 也推不動
     （grimoire/physics.md「靜止接觸是硬黏著」陷阱；行進中轉向正常）。
驗收: cd viewer && npx tsx scripts/actuation_test.ts toy-racer --spec models/toy-racer/spec.json
     其中 steer-static:knuckle-fl / knuckle-fr 兩項須 OK（靜止拉滿 1 秒實測角 ≥ 0.5×0.4 rad），
     且該命令整體 pass 與既有 gate 全綠：
     - python3 forge/validate_spec.py viewer/models/toy-racer/spec.json --strict
     - cd viewer && npx tsc --noEmit
     - npx tsx scripts/physics_test.ts toy-racer --spec models/toy-racer/spec.json --roll chassis
     - npx tsx scripts/runtime_export.ts toy-racer --spec models/toy-racer/spec.json --out ../.img2babylon/toy-racer/runtime.json && python3 ../forge/check_colliders.py ../.img2babylon/toy-racer/runtime.json
notes: （待派工）
