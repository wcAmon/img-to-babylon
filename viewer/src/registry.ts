import type { ModelFactory } from "./types";

export const registry: Record<string, () => Promise<{ default: ModelFactory }>> = {
  // Task 2 註冊
  "sample-crate": () => import("../models/sample-crate/createSampleCrateModel"),
  // Task 13 註冊
  "pill-bottle": () => import("../models/pill-bottle/createPillBottleModel"),
  // Task 14 註冊
  "codex-crate": () => import("../models/codex-crate/createCodexCrateModel"),
  // M1 玩具跑車（自由旋轉 hinge）
  "toy-racer": () => import("../models/toy-racer/createToyRacerModel"),
  // M2 玩具公仔 ragdoll（多軸限位 joint）
  "action-figure": () => import("../models/action-figure/createActionFigureModel"),
  // M3 鴨型長腿雙足機器人
  "duck-bot": () => import("../models/duck-bot/createDuckBotModel"),
  // M10 化療潑灑處理套件
  "chemo-spill-kit": () => import("../models/chemo-spill-kit/createChemoSpillKitModel"),
  "chemo-iv-bag": () => import("../models/chemo-iv-bag/createChemoIvBagModel"),
  "cytotoxic-waste-bin": () => import("../models/cytotoxic-waste-bin/createCytotoxicWasteBinModel"),
};
