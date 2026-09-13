# Full Babylon pipeline port and character refinement

> Execution: Codex desktop owns integration and evidence; Codex CLI owns the native generator/runtime conversion, then a separately dispatched character refinement job. No additional approval is needed for this user-authorized work.

Goal: Preserve the complete locally available img2threejs workflow in this repository, replace its engine boundary with tested Babylon objects, then use that workflow through Codex CLI to refine female-tactical.

Architecture: `pipeline/` is a complete licensed fork of source tooling/contracts and domain corpus, isolated from the existing `forge/` compatibility tools. `docs/migration/upstream-inventory.json` pins source hashes. Native generation emits Babylon TypeScript, never a Three runtime. Current model IDs and history survive; Havok remains the actual physics authority.

Constraints: Python stdlib only; source reference checkout read-only; no credentials in logs/reports; optional asset/vision adapters preserve their opt-in boundaries; six corrections per round rather than a lifetime cap; no automatic pass or likeness acceptance. Local reference capabilities define parity, not invented upstream claims.

- [x] Import complete workflow, contracts, corpus and source tests with license/provenance.
- [x] Inventory all executable routes and distinguish engine-neutral, engine-specific, optional dependencies and unsupported evidence.
- [x] Native generator/runtime: convert every supported primitive and applicable mesh attributes, hierarchy, materials, cameras, lights, skeleton/skin/morph data. Verify handedness/winding/units and meaningful numerical parity. Never silently substitute a box or discard data.
- [x] Adapt state/gates/render bridge so Babylon is the rendering authority and evidence is required for progress. Keep upstream fixtures as provenance; add Babylon tests.
- [x] Run complete fork tests, native generator smoke/geometry tests, existing viewer/physics regressions. Record skips/failures without relabeling them as passes.
- [x] Replace root routing documentation with the full workflow and an explicit compatibility/transition map.
- [x] Dispatch Codex CLI character refinement only after migration gates are satisfied. Feed approved image, same model identity, anatomy/landmark evidence, hair contracts and local state gate; require full head/body updates and genuine screenshots.
- [x] Desktop review: matched reference camera, face/hair/body detail evidence and Havok checks; preserve failed reviews, archive source before refinement rounds, and deliver verified output with limitations.
