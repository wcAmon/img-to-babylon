import type { ModelFactory } from "./types";

export const registry: Record<string, () => Promise<{ default: ModelFactory }>> = {
  // Task 2 註冊
  "sample-crate": () => import("../models/sample-crate/createSampleCrateModel"),
};
