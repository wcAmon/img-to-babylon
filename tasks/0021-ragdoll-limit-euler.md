# 0021 ragdoll gate 限位分解順序：Havok 限位與馬達是兩種 Euler 語意，physics_test --ragdoll 用錯順序誤報
model: action-figure／duck-bot        status: done（2026-09-04：公式落地、duck-bot ragdoll 綠；action-figure 肩負載超限——使用者決定接受為已知限制，門檻不動）
脈絡: 0020 duck-bot 的 ragdoll gate 三輪紅：兩踝（x [−0.6,0.6]、y [−0.4,0.4]、z locked）癱倒後 XZY 讀 z −0.24／−0.17，
     超 RAGDOLL_ANGLE_EPS 0.15。監工重跑 **action-figure 在 HEAD 也紅**（boot-r z −0.156、boot-l 0.148 邊緣）——
     0019 之後沒人再跑 `--ragdoll`。姊妹 repo 探針 `scripts/joint_order_probe.ts`（無地面自由落體、六種 Tait-Bryan
     順序數值擬合，Babylon 列向量慣例「XYZ」＝RotX·RotY·RotZ）：
     - 踝 x 0.56／y 0.33 馬達、z 鎖死：gate 的 eulerXZY 讀 (0.538, 0.276, **−0.171**)；XYZ 讀 (0.562, 0.324, 0.000)。
       x 反號 → z 反號（+0.173）；y 反號亦反號。action-figure 靴 x 0.48／y 0.26 同樣 z −0.119。
     - 髖 x −0.6／y 0.3／z 馬達 0：gate 讀 (−0.598, 0.298, 0.009) 精確；XYZ 讀 z −0.164。→ **馬達語意＝eulerXZY**。
     - 純限位（馬達力歸零、踝三軸限位釘死 x 0.56／y 0.33／z 0.3）：XYZ 讀 (0.621, 0.339, **0.300**)；gate 讀 (0.582,
       0.446, **0.055**)。釘 (−0.4, 0.2, −0.3)：XYZ (−0.429, 0.190, −0.303)、gate (−0.430, 0.299, −0.198)。
       → **限位語意＝XYZ（RotX·RotY·RotZ 列向量合成，即內稟 Z→Y→X）**。
     grimoire 原本「XZY 最接近」是倒立擺單軸校準——單軸時所有順序重合，分不出限位與馬達的差別。
要做:
  1. `viewer/scripts/physics_test.ts`：新增 `eulerLimits(m)`——x＝swing-twist 扭轉角（四元數 2·atan2(qx, qw) wrap 到
     (−π, π]）、y = asin(−g02)、z = atan2(g01, g00)；`measureJoints`（ragdoll 限位檢查）改用它；eulerXZY 保留給馬達類
     gate（actuation_test／motion_test 不動）。**注意**：純 Euler 順序都不對——XYZ 合成的 y、z 對但 x 在 z 大角時差 0.46；
     最終 x 用扭轉角才七組全對。
  2. `grimoire/physics.md` 陷阱條改寫：限位用 eulerLimits、馬達用 eulerXZY，附探針證據一句。
  3. 驗收：action-figure `--ragdoll` 由紅（boot-r z −0.156）轉綠；duck-bot `--ragdoll` 由紅（foot z −0.24）轉綠；
     tsc、forge unittest、actuation_test（action-figure／duck-bot）、motion_test（action-figure walk）不變綠。
紅線: 不放寬 RAGDOLL_ANGLE_EPS；不改 spec／factory；只換限位檢查的分解順序。
notes:
  監工（2026-09-04）釘死驗證（duck-bot 髖／踝、action-figure 肩，factory 暫改限位 min=max、馬達力歸零、無地面自由落體
  600 步；探針 joint_order_probe `--nomotor`）：

  | 關節 | 釘 (x, y, z) | eulerLimits 讀值 | 誤差 | eulerXZY 讀值 |
  |---|---|---|---|---|
  | duck 踝 | (−0.4, 0.2, −0.3) | (−0.400, 0.190, −0.303) | ≤ 0.010 | (−0.430, 0.299, −0.198) |
  | duck 踝 | (0.56, 0.33, 0.3) | (0.569, 0.339, 0.300) | ≤ 0.009 | (0.582, 0.446, 0.055) |
  | duck 髖 | (−0.5, 0.9, −0.6) | (−0.571, 0.911, −0.597) | ≤ 0.071 | (−0.493, 1.033, 0.138) |
  | duck 髖 | (0.3, 1.2, 0.7) | (0.373, 1.216, 0.675) | ≤ 0.073 | (0.267, 1.293, −0.140) |
  | duck 髖 | (0.4, 0.3, 1.2) | (0.366, 0.308, 1.209) | ≤ 0.034 | (0.858, 1.060, 0.808) |
  | 人偶肩 | (0.3, 1.0, 0.8) | (0.370, 1.015, 0.800) | ≤ 0.070 | (0.401, 1.194, 0.045) |
  | 人偶肩 | (−0.4, 0.5, −0.7) | (−0.413, 0.507, −0.712) | ≤ 0.013 | (−0.554, 0.794, −0.335) |
  | 人偶肩 | (0.2, 0.3, 1.2) | (0.177, 0.301, 1.200) | ≤ 0.023 | (0.682, 0.913, 0.968) |

  馬達語意對照：duck 髖三馬達命令 (−0.6, 0.3, 0) → eulerXZY 讀 (−0.598, 0.298, 0.009) 精確；eulerLimits 讀 z −0.16。
  ragdoll gate 結果（修正後）：
  - duck-bot：**PASS**（踝 z −0.014／0.007，原 −0.24／−0.17 是幻影角）。
  - action-figure：踝 z 0.009／−0.012（原 0.148／−0.156 幻影角，消失）；手肘 wrap 修正後 −2.50／−2.46（限位 −2.44，
    eps 內）；**肩仍紅**：upper-arm-l (−0.35, 0.99, **1.25**)、upper-arm-r (0.79, −1.21, **−1.43**)，z 限位 ±0.8 被壓過
    0.45／0.63 rad。釘死驗證證明肩的語意讀得準（≤ 0.07），所以這是**負載下 Havok 軟限位真的被壓過**（40 kg·S³
    軀幹壓在手臂上），舊公式讀 0.89／0.44 是把它藏起來。門檻 RAGDOLL_ANGLE_EPS 0.15 不動，交使用者決定
    （選項：以負載 ragdoll 探針重新校準 eps；或接受人偶肩為已知限制）。
  其餘驗收：`npx tsc --noEmit` 無輸出 exit 0；forge unittest `Ran 99 tests`／`OK`；actuation_test action-figure／duck-bot
  皆 `pass: true`；physics_test（非 ragdoll）兩模型 `pass: true`；motion_test action-figure wave 23/23 `pass: true`
  （walk 用姊妹 repo kimodo clip 19/23，該 clip 後段振幅衰減是已知，非本卡範圍，motion_test 未改）。
  使用者決定（2026-09-04 18:26）：action-figure `--ragdoll` 肩負載超限**接受為已知限制**，RAGDOLL_ANGLE_EPS 0.15 不動、
  肩限位不動；人偶已非主線題材。duck-bot 全綠不受影響。
