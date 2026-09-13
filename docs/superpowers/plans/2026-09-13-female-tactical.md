# Female tactical character and persistent iteration

**Goal:** Build the approved orange-shirt female character as procedural Babylon geometry, retaining a stable model identity and a reproducible per-part improvement path.

**Architecture:** `female-tactical/spec.json` owns dimensions, transforms, materials, construction recipes and physical definitions. A reusable procedural builder consumes this data; the factory remains small. `iteration.json` maps stable component IDs to groups, priorities, acceptance criteria and evidence. Model-scoped pass state preserves other projects and snapshots completed revisions before a new cycle.

**Constraints:** Python stdlib only in forge. No external meshes or runtime image textures. Reference images are evidence only. Dimensions in metres, unit node scaling, deterministic geometry. Existing models and default legacy pass commands remain compatible. Follow five passes and existing correction limits. Scope is a poseable-in-source character sculpture with a compound rigid body; articulated ragdoll and animation are separate future enhancements, explicitly recorded as pending.

## Deliverables and checks

- [x] Add failing isolation, snapshot and interrupted-cycle tests; extend `forge/next_pass.py` with global `--model` and `revise --from-pass --reason`. Run old and new state tests.
- [x] Preserve approved concept and a female-only analytical crop. Write component spec and optimisation manifest; run strict spec validation before model code.
- [x] Blockout: reusable loft and component assembly; grey macro silhouette in registered factory. Typecheck and saved browser reference comparison.
- [x] Structure: head/face/hair, garment profiles, gloves, armour/pouches/boots. Add inspector isolation and exploded view backed by stable IDs. Test deterministic construction, independent instances, restoration and disposal.
- [x] Material: orange/navy/teal/skin palette from reference; verify saved reference comparison.
- [x] Physics: spec-driven compound collider construction; verify actual body mass and child shapes, static collider gate and drop/settle gate; capture wireframe.
- [ ] Polish: inspect front/rear/face, preserve honest comparison scores and performance metrics, document next priorities and repeatable commands; build and run relevant regression checks.

## Persistent edit workflow

Use `python3 forge/next_pass.py --model female-tactical status` to resume. Finish the current pass only after its evidence exists. After a completed cycle, use `revise --from-pass structure --reason '...'` to snapshot model sources and start the next revision under the SAME model ID. Change a component's `geometry`, `dimensions` or `transform` in spec, keeping its ID. Record the affected optimisation ticket, evidence and review in the model files. No counter resets during an unfinished cycle.

## Final checkpoint

Infrastructure and working initial model are implemented. Typecheck, construction/inspection/disposal checks, actual Havok body/shape checks, static collider and drop gates pass. Visual polish remains NOT accepted: likeness 5.5/10, automatic reject preserved, correction attempt 6 blocked. Keep polish active and request user direction; do not mark cycle complete. See model README and iteration.json for next work.
