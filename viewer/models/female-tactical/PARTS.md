# female-tactical — 零件與優化路徑

版本：1 · 狀態：visual-review-required · 122 個零件

尺寸、位置和幾何配方以 `spec.json` 為準；用穩定 id 尋找元件。此表由 `forge/model_report.py` 產生。

## 分拆零件

### 頭部與五官

| ID | 零件 | 配方 | 尺寸（mm） | 接合父節點 |
|---|---|---|---|---|
| `neck` | 頸部 | ellipsoid | 90.0 × 105.0 × 85.0 | root |
| `head` | 頭部與下顎 | loft | 172.0 × 235.0 × 174.0 | root |
| `ear-l` | 耳朵 l | ellipsoid | 23.0 × 43.0 × 25.0 | head |
| `eye-white-l` | 眼白 l | ellipsoid | 39.0 × 17.0 × 8.0 | head |
| `iris-l` | 虹膜 l | ellipsoid | 12.0 × 12.0 × 4.0 | head |
| `pupil-l` | 瞳孔 l | ellipsoid | 5.5 × 9.0 × 3.0 | head |
| `eye-glint-l` | 眼睛反光 l | ellipsoid | 3.5 × 4.0 × 3.0 | head |
| `eyelid-l` | 上眼線 l | loft | 36.0 × 3.5 × 7.0 | head |
| `brow-l` | 眉毛 l | loft | 44.0 × 5.0 × 10.0 | head |
| `ear-r` | 耳朵 r | ellipsoid | 23.0 × 43.0 × 25.0 | head |
| `eye-white-r` | 眼白 r | ellipsoid | 39.0 × 17.0 × 8.0 | head |
| `iris-r` | 虹膜 r | ellipsoid | 12.0 × 12.0 × 4.0 | head |
| `pupil-r` | 瞳孔 r | ellipsoid | 5.5 × 9.0 × 3.0 | head |
| `eye-glint-r` | 眼睛反光 r | ellipsoid | 3.5 × 4.0 × 3.0 | head |
| `eyelid-r` | 上眼線 r | loft | 36.0 × 3.5 × 7.0 | head |
| `brow-r` | 眉毛 r | loft | 44.0 × 5.0 × 10.0 | head |
| `nose` | 鼻樑與鼻尖 | loft | 23.0 × 48.0 × 35.0 | head |
| `upper-lip` | 上唇 | ellipsoid | 35.0 × 9.0 × 12.0 | head |
| `lower-lip` | 下唇 | ellipsoid | 29.0 × 9.0 × 12.0 | head |

### 髮型與馬尾

| ID | 零件 | 配方 | 尺寸（mm） | 接合父節點 |
|---|---|---|---|---|
| `hair-cap` | 後腦髮塊 | loft | 184.0 × 140.0 × 174.0 | head |
| `ponytail` | 高馬尾 | loft | 120.0 × 270.0 × 130.0 | head |
| `hair-side-l` | 鬢角 l | loft | 36.0 × 145.0 × 59.0 | head |
| `hair-side-r` | 鬢角 r | loft | 36.0 × 145.0 × 59.0 | head |
| `fringe-sweep` | 側分斜瀏海 | loft | 86.0 × 139.0 × 43.0 | head |
| `fringe-side` | 額側髮束 | loft | 49.0 × 143.0 × 43.0 | head |
| `hair-tie` | 馬尾青綠髮束 | ellipsoid | 53.0 × 31.0 × 56.0 | head |
| `tail-lock-0` | 馬尾分束 0 | loft | 54.0 × 226.0 × 54.0 | head |
| `tail-lock-1` | 馬尾分束 1 | loft | 54.0 × 226.0 × 54.0 | head |
| `tail-lock-2` | 馬尾分束 2 | loft | 54.0 × 226.0 × 54.0 | head |

### 上衣與立領

| ID | 零件 | 配方 | 尺寸（mm） | 接合父節點 |
|---|---|---|---|---|
| `torso` | 橘色上衣／軀幹 | loft | 360.0 × 350.0 × 200.0 | root |
| `collar-l` | 立領 l | loft | 65.0 × 86.0 × 76.0 | torso |
| `collar-r` | 立領 r | loft | 65.0 × 86.0 × 76.0 | torso |

### 戰術背心與裝備

| ID | 零件 | 配方 | 尺寸（mm） | 接合父節點 |
|---|---|---|---|---|
| `vest-front` | 防彈背心前片 | loft | 257.6 × 285.0 × 55.0 | torso |
| `vest-back` | 防彈背心背片 | loft | 248.4 × 275.0 × 48.0 | torso |
| `molle-front-0` | 背心織帶 0 | box | 225.4 × 18.0 × 9.0 | torso |
| `molle-back-0` | 背面織帶 0 | box | 216.2 × 16.0 × 9.0 | torso |
| `molle-front-1` | 背心織帶 1 | box | 225.4 × 18.0 × 9.0 | torso |
| `molle-back-1` | 背面織帶 1 | box | 216.2 × 16.0 × 9.0 | torso |
| `molle-front-2` | 背心織帶 2 | box | 225.4 × 18.0 × 9.0 | torso |
| `molle-back-2` | 背面織帶 2 | box | 216.2 × 16.0 × 9.0 | torso |
| `molle-front-3` | 背心織帶 3 | box | 225.4 × 18.0 × 9.0 | torso |
| `molle-back-3` | 背面織帶 3 | box | 216.2 × 16.0 × 9.0 | torso |
| `mag-pouch-0` | 胸前裝備袋 0 | loft | 67.2 × 115.0 × 66.0 | torso |
| `pouch-flap-0` | 袋蓋 0 | loft | 60.7 × 47.0 × 12.0 | torso |
| `pouch-tab-0` | 袋扣 0 | box | 17.5 × 46.0 × 13.0 | torso |
| `mag-pouch-1` | 胸前裝備袋 1 | loft | 67.2 × 115.0 × 66.0 | torso |
| `pouch-flap-1` | 袋蓋 1 | loft | 60.7 × 47.0 × 12.0 | torso |
| `pouch-tab-1` | 袋扣 1 | box | 17.5 × 46.0 × 13.0 | torso |
| `mag-pouch-2` | 胸前裝備袋 2 | loft | 67.2 × 115.0 × 66.0 | torso |
| `pouch-flap-2` | 袋蓋 2 | loft | 60.7 × 47.0 × 12.0 | torso |
| `pouch-tab-2` | 袋扣 2 | box | 17.5 × 46.0 × 13.0 | torso |
| `belt` | 腰帶 | loft | 274.0 × 45.0 × 222.0 | pelvis |
| `belt-buckle` | 腰帶扣 | loft | 52.0 × 46.0 × 17.0 | pelvis |
| `strap-l` | 背心肩帶 l | loft | 39.6 × 76.0 × 220.0 | torso |
| `strap-accent-l` | 肩帶青綠片 l | box | 40.5 × 46.0 × 14.0 | torso |
| `strap-buckle-l` | 肩帶扣 l | box | 42.3 × 30.0 × 17.0 | torso |
| `side-strap-l` | 腰側背心束帶 l | loft | 24.8 × 70.0 × 205.0 | torso |
| `belt-accent-l` | 腰帶青綠扣 l | box | 28.0 × 48.0 × 17.0 | pelvis |
| `hip-pouch-l` | 腰側小袋 l | loft | 62.0 × 72.0 × 69.0 | pelvis |
| `shoulder-patch-l` | 肩章 l | loft | 75.0 × 77.0 × 14.0 | upper-arm-l |
| `knee-pad-l` | 膝部護甲 l | loft | 115.0 × 138.0 × 39.0 | calf-l |
| `knee-shell-l` | 護膝面板 l | loft | 83.0 × 93.0 × 17.0 | calf-l |
| `knee-strap-l` | 護膝束帶 l | loft | 128.0 × 25.0 × 151.0 | calf-l |
| `cargo-pocket-l` | 大腿側袋 l | loft | 50.0 × 134.0 × 126.0 | thigh-l |
| `thigh-band-l` | 大腿束帶 l | loft | 154.0 × 29.0 × 185.0 | thigh-l |
| `thigh-buckle-l` | 腿帶青綠扣 l | box | 30.0 × 31.0 × 13.0 | thigh-l |
| `strap-r` | 背心肩帶 r | loft | 39.6 × 76.0 × 220.0 | torso |
| `strap-accent-r` | 肩帶青綠片 r | box | 40.5 × 46.0 × 14.0 | torso |
| `strap-buckle-r` | 肩帶扣 r | box | 42.3 × 30.0 × 17.0 | torso |
| `side-strap-r` | 腰側背心束帶 r | loft | 24.8 × 70.0 × 205.0 | torso |
| `belt-accent-r` | 腰帶青綠扣 r | box | 28.0 × 48.0 × 17.0 | pelvis |
| `hip-pouch-r` | 腰側小袋 r | loft | 62.0 × 72.0 × 69.0 | pelvis |
| `shoulder-patch-r` | 肩章 r | loft | 75.0 × 77.0 × 14.0 | upper-arm-r |
| `knee-pad-r` | 膝部護甲 r | loft | 115.0 × 138.0 × 39.0 | calf-r |
| `knee-shell-r` | 護膝面板 r | loft | 83.0 × 93.0 × 17.0 | calf-r |
| `knee-strap-r` | 護膝束帶 r | loft | 128.0 × 25.0 × 151.0 | calf-r |
| `cargo-pocket-r` | 大腿側袋 r | loft | 50.0 × 134.0 × 126.0 | thigh-r |
| `thigh-band-r` | 大腿束帶 r | loft | 154.0 × 29.0 × 185.0 | thigh-r |
| `thigh-buckle-r` | 腿帶青綠扣 r | box | 30.0 × 31.0 × 13.0 | thigh-r |

### 左右手臂

| ID | 零件 | 配方 | 尺寸（mm） | 接合父節點 |
|---|---|---|---|---|
| `upper-arm-l` | 上臂／袖 l | loft | 130.0 × 270.0 × 133.0 | root |
| `forearm-l` | 前臂 l | loft | 85.0 × 225.0 × 90.0 | root |
| `upper-arm-r` | 上臂／袖 r | loft | 130.0 × 270.0 × 133.0 | root |
| `forearm-r` | 前臂 r | loft | 85.0 × 225.0 × 90.0 | root |
| `sleeve-cuff-l` | 反摺袖口 l | loft | 127.0 × 47.0 × 132.0 | upper-arm-l |
| `sleeve-cuff-r` | 反摺袖口 r | loft | 127.0 × 47.0 × 132.0 | upper-arm-r |

### 手套與手指

| ID | 零件 | 配方 | 尺寸（mm） | 接合父節點 |
|---|---|---|---|---|
| `hand-l` | 手掌／手套 l | loft | 80.0 × 130.0 × 50.0 | root |
| `hand-r` | 手掌／手套 r | loft | 80.0 × 130.0 × 50.0 | root |
| `wrist-cuff-l` | 手套腕帶 l | loft | 82.0 × 39.0 × 72.0 | hand-l |
| `glove-plate-l` | 手背護片 l | loft | 61.0 × 59.0 × 12.0 | hand-l |
| `finger-l-0` | 手指 l 0 | loft | 14.0 × 42.0 × 24.0 | hand-l |
| `finger-l-1` | 手指 l 1 | loft | 14.0 × 45.0 × 24.0 | hand-l |
| `finger-l-2` | 手指 l 2 | loft | 14.0 × 42.0 × 24.0 | hand-l |
| `finger-l-3` | 手指 l 3 | loft | 14.0 × 39.0 × 24.0 | hand-l |
| `thumb-l` | 拇指（朝內） l | loft | 24.0 × 53.0 × 27.0 | hand-l |
| `wrist-cuff-r` | 手套腕帶 r | loft | 82.0 × 39.0 × 72.0 | hand-r |
| `glove-plate-r` | 手背護片 r | loft | 61.0 × 59.0 × 12.0 | hand-r |
| `finger-r-0` | 手指 r 0 | loft | 14.0 × 42.0 × 24.0 | hand-r |
| `finger-r-1` | 手指 r 1 | loft | 14.0 × 45.0 × 24.0 | hand-r |
| `finger-r-2` | 手指 r 2 | loft | 14.0 × 42.0 × 24.0 | hand-r |
| `finger-r-3` | 手指 r 3 | loft | 14.0 × 39.0 × 24.0 | hand-r |
| `thumb-r` | 拇指（朝內） r | loft | 24.0 × 53.0 × 27.0 | hand-r |

### 褲子與腿部

| ID | 零件 | 配方 | 尺寸（mm） | 接合父節點 |
|---|---|---|---|---|
| `pelvis` | 褲腰與骨盆 | loft | 300.0 × 180.0 × 215.0 | root |
| `thigh-l` | 大腿褲管 l | loft | 183.0 × 355.0 × 178.0 | root |
| `calf-l` | 小腿褲管 l | loft | 161.0 × 305.0 × 145.0 | root |
| `thigh-r` | 大腿褲管 r | loft | 183.0 × 355.0 × 178.0 | root |
| `calf-r` | 小腿褲管 r | loft | 161.0 × 305.0 × 145.0 | root |

### 靴子與鞋帶

| ID | 零件 | 配方 | 尺寸（mm） | 接合父節點 |
|---|---|---|---|---|
| `boot-l` | 戰術靴 l | loft | 140.0 × 255.0 × 260.0 | root |
| `boot-r` | 戰術靴 r | loft | 140.0 × 255.0 × 260.0 | root |
| `boot-sole-l` | 靴底 l | loft | 146.0 × 33.0 × 273.0 | boot-l |
| `boot-upper-l` | 鞋舌 l | loft | 74.0 × 153.0 × 26.0 | boot-l |
| `lace-l-0` | 鞋帶 l 0 | box | 65.0 × 8.0 × 13.0 | boot-l |
| `lace-l-1` | 鞋帶 l 1 | box | 65.0 × 8.0 × 13.0 | boot-l |
| `lace-l-2` | 鞋帶 l 2 | box | 65.0 × 8.0 × 13.0 | boot-l |
| `lace-l-3` | 鞋帶 l 3 | box | 65.0 × 8.0 × 13.0 | boot-l |
| `boot-accent-l` | 靴側青綠片 l | box | 11.0 × 56.0 × 65.0 | boot-l |
| `boot-sole-r` | 靴底 r | loft | 146.0 × 33.0 × 273.0 | boot-r |
| `boot-upper-r` | 鞋舌 r | loft | 74.0 × 153.0 × 26.0 | boot-r |
| `lace-r-0` | 鞋帶 r 0 | box | 65.0 × 8.0 × 13.0 | boot-r |
| `lace-r-1` | 鞋帶 r 1 | box | 65.0 × 8.0 × 13.0 | boot-r |
| `lace-r-2` | 鞋帶 r 2 | box | 65.0 × 8.0 × 13.0 | boot-r |
| `lace-r-3` | 鞋帶 r 3 | box | 65.0 × 8.0 × 13.0 | boot-r |
| `boot-accent-r` | 靴側青綠片 r | box | 11.0 × 56.0 × 65.0 | boot-r |

## 優化順序

### P0 · 改善臉部神韻：眼眶、顴骨、下顎與嘴角

狀態：open。影響：face。

修改入口：head.geometry.rings; eye-white-l/r dimensions/transform; brow-l/r transform; nose.geometry.rings; upper-lip/lower-lip dimensions

驗收：同一鏡位臉部近照對照；眼白不浮凸，側面鼻唇可讀；保留原始相似度分數。

### P1 · 改善側分瀏海與馬尾弧線

狀態：open。影響：hair。

修改入口：fringe-sweep.geometry.rings; ponytail.geometry.rings; tail-lock-*.transform

驗收：正面、側面、背面無頭皮穿插；髮束方向符合已核准概念。背面細節目前屬推測。

### P1 · 修順肩頸、袖口與褲襠接合

狀態：open。影響：torso, arms, legs。

修改入口：torso.geometry.rings; upper-arm-*.geometry.rings; pelvis.geometry.rings; thigh-*.transform

驗收：四視角不見空縫；保留腰身、腿部量感與低多邊形切面。改碰撞外形後重跑物理。

### P2 · 在保留零件 ID 的前提下降低 draw calls

狀態：open。影響：face, hair, torso, equipment, arms, hands, legs, boots。

修改入口：src/sculpt/buildSculpt.ts optional render batching; component visibility map

驗收：相同相機與裝置比較前後 draw calls/影格耗時；零件隔離與銷毀測試仍通過。不得用隱藏零件偽裝效能提升。

### P2 · 以保留的肢段拆分加入關節和動作綁定

狀態：not-started。影響：arms, hands, legs, boots, face。

修改入口：physics.bodies; physics.constraints; attachment sockets

驗收：需新增真正多剛體 joint/hinge builder，通過 ragdoll/限位/動作測試後才宣稱可動。

## 物理範圍

single compound rigid body

尚未實作：articulated ragdoll, animation skeleton, individually colliding fingers and hair tips

## 續作

```sh
python3 forge/next_pass.py --model female-tactical status
python3 forge/next_pass.py --model female-tactical revise --from-pass structure --reason "Describe the approved change"
```

Per-pass fourth correction and cycle sixth correction are blocked; revise requires completed cycle.
