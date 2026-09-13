# Native payload reuse

The emitter previously serialized native component buffers four times: the exported spec,
the payload's spec, prepared components, and builder closures. It now emits the authored
spec once, references it from the payload, and lets native builders use prepared component
references. Non-native component normalization is preserved. MeshData still copies positions,
normals and indices into per-build storage, so model disposal and edits do not alter the
canonical recipe buffers.

Measured against frozen female-tactical round 4 correction 4: 16,256,265 bytes before,
4,185,796 bytes after (74.25% reduction). This is generated TypeScript size, not a measured
network or GPU memory saving. Model geometry and face quality are unchanged by this edit.

Validation: a regression first observed four occurrences of the native numeric payload;
it now observes one. Five legacy generator tests pass, including actual 125-component
RH/LH native roundtrips with maximum world/local vertex error 3.715e-9 m and exact matrices.
Seven native Babylon generator/runtime tests also pass. Character visual acceptance is
independent of these numerical checks.
