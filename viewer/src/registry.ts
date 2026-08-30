import type { ModelFactory } from "./types";

export const registry: Record<string, () => Promise<{ default: ModelFactory }>> = {
  // Task 2 註冊
  "sample-crate": () => import("../models/sample-crate/createSampleCrateModel"),
  // Task 13 註冊
  "pill-bottle": () => import("../models/pill-bottle/createPillBottleModel"),
  // Task 14 註冊
  "codex-crate": () => import("../models/codex-crate/createCodexCrateModel"),
};
