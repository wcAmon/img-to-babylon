# 0011 站立恢復：從癱姿站起（gate 鏡射 playground 真實路徑）
model: action-figure        status: dispatched
症狀: 0010 站穩了 gate，但監工 playground 目視（吊空→站立→放下）人偶仍躺平。
     根因（headless 已證）：StandController.enable() 只把 servo 鎖到出廠角 0，
     不重置身體位置/朝向——playground 重載後人偶早已癱在地上，enable 只是
     鎖住癱姿（對癱姿鎖 400 步 head y 恆 0.015）。gate 原本測「出廠姿勢瞬間
     enable」這條使用者按不到的路徑，故綠得虛。
     修法：StandController.enable() 要能「從癱姿恢復站立」——建構時快照各 body
     初始 local transform（位置+旋轉四元數），enable 時：
     1. 重置全 body 到出廠姿勢（沿用 MotionSuspension 同款：disablePreStep=false
        開 2-step 同步窗，copyFrom 初始 transform、setLinear/AngularVelocity 歸零、
        再 disablePreStep=true）；
     2. root 位置設到「腳底貼地」（出廠 root y=0 即腳底≈地面，用出廠原位即可）；
     3. 鎖 servo set(0)。
     disable 照舊放馬達。參考 viewer/src/motionSuspension.ts 的 2-step 窗機制
     （已驗證能讓 Havok 吃到 transform 重置）。
驗收: 1. cd viewer && npx tsc --noEmit
     2. node --import tsx scripts/stand_test.ts 全綠（監工已改為鏡射路徑並確認紅：
        生成→step 200 癱→enable 從癱姿站起 600 步頭高 ≥ 80%/up>0.9/disable 再癱/
        對照照舊癱。斷言與門檻勿改）
     3. physics/actuation/motion(walk timeline)/suspension/face 全 gate 照舊綠
     4. check_colliders OK（動 collider 才需重出 runtime）
notes:
