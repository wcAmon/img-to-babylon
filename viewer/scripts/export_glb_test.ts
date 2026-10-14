// export-glb gate: sample-crate round-trips with the same triangle count, spec size and grounded base;
// action-figure (physicsScale 10) exports at spec height, not 10x; settled pose stays grounded.
// Run: npx tsx scripts/export_glb_test.ts
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportModelToGlb, loadGlbSummary } from "./export_glb";
import crateSpec from "../models/sample-crate/spec.json";
import figureSpec from "../models/action-figure/spec.json";

function specHeight(spec: { componentTree: Array<{ dimensions: { h: number }; transform: { position: number[] } }> }): number {
  let top = -Infinity;
  let bottom = Infinity;
  for (const c of spec.componentTree) {
    top = Math.max(top, c.transform.position[1] + c.dimensions.h / 2);
    bottom = Math.min(bottom, c.transform.position[1] - c.dimensions.h / 2);
  }
  return top - bottom;
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "export-glb-"));
  try {
    const crate = join(dir, "crate.glb");
    const summary = await exportModelToGlb("sample-crate", crate, { pose: "factory", settleFrames: 0 });
    assert.equal(summary.triangles, 12, "a box is 12 triangles");
    const reloaded = await loadGlbSummary(new Uint8Array(readFileSync(crate)));
    assert.equal(reloaded.triangles, summary.triangles);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(reloaded.size[i] - 0.3) < 1e-4, `crate size ${reloaded.size}`);
    assert.ok(Math.abs(reloaded.minY) < 1e-4, `crate min y ${reloaded.minY}`);
    assert.ok(summary.bytes > 500 && summary.bytes < 50_000, `crate bytes ${summary.bytes}`);

    const figure = join(dir, "figure.glb");
    const fig = await exportModelToGlb("action-figure", figure, { pose: "factory", settleFrames: 0 });
    const expected = specHeight(figureSpec as never);
    assert.ok(Math.abs(fig.size[1] - expected) < expected * 0.15, `figure height ${fig.size[1]} vs spec ${expected} (physicsScale must be divided out)`);
    assert.ok(Math.abs(fig.minY) < 1e-4, `figure min y ${fig.minY}`);

    const settled = join(dir, "crate-settled.glb");
    const s = await exportModelToGlb("sample-crate", settled, { pose: "settled", settleFrames: 120 });
    assert.ok(Math.abs(s.minY) < 1e-4, `settled min y ${s.minY}`);
    assert.equal(s.triangles, 12);
    console.log("export_glb_test: ok", { crate: summary, figure: fig, settled: s, specHeight: expected, crateSpecName: (crateSpec as { targetName: string }).targetName });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
