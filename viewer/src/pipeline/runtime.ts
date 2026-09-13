import { Scene, TransformNode, Mesh, Matrix, Quaternion, Vector3, PBRMaterial, StandardMaterial, SubMesh, MultiMaterial } from '@babylonjs/core';
import { MeshData, convertVector, convertQuaternion, quaternionXYZ, applyMeshData } from './meshData';
import { cylinderGeometry } from './primitives';
import { subdivideCatmullClark, decimateGeometry } from './geometryAlgorithms';
import { ModelOptions, createSculptMaterial, createLegacyMaterial } from './materials';
import { paintGeometry, standProud, flatGeometry } from './surface';
import { OwnedResources } from './resources';
import { validateNativeComponent, nativeVertexGeometry, LEGACY_BRIDGE } from './nativeImport';
import { bindRig } from './rig';
export * from './scene';
export type { ModelOptions } from './materials';
export type GeometryBuilders = Record<string, () => MeshData>;
export type PipelineRuntime = {
    nodes: Record<string, TransformNode>;
    meshes: Record<string, Mesh>;
    sockets: Record<string, TransformNode>;
    colliders: Record<string, unknown>;
    destructionGroups: Record<string, TransformNode[]>;
    geometry: Record<string, MeshData>;
    ownedResources: OwnedResources;
};
const vector = (a: number[] | undefined, f: number[]) => a ?? f;
function endpoint(c: any) { if (!['cylinder', 'cone', 'capsule', 'tube', 'curve-sweep'].includes(c.primitive) || c.topologyClass === 'implicit' || c.geometryDescriptor?.visualHull || !c.attachment)
    return null; const a = c.attachment, start = Vector3.FromArray(a.localStart ?? [0, 0, 0]), end = Vector3.FromArray(a.localEnd ?? [0, 1, 0]), delta = end.subtract(start), length = delta.length(); if (length <= .0001)
    return null; const base = Math.max(.005, a.baseRadius ?? .06), tip = Math.max(.003, a.endRadius ?? base * .55); return { start, midpoint: delta.scale(.5), length, base, tip, q: Quaternion.FromUnitVectorsToRef(Vector3.Up(), delta.normalizeToNew(), new Quaternion()) }; }
export function createPipelineModel(scene: Scene, payload: any, builders: GeometryBuilders, options: ModelOptions = {}): TransformNode {
    // Preflight imported buffers and transforms before any scene allocations.
    for (const c of payload.components) validateNativeComponent(c);
    const spec = payload.spec, root = new TransformNode(spec.targetName ?? 'Procedural Object', scene);
    root.metadata = { engine: 'babylon', sourceCoordinateFrame: { handedness: 'right', up: 'y', units: 'metres' }, buildPass: payload.passId, reconstructionEvidence: Object.fromEntries(['itemFamily', 'subtype', 'componentAdapter', 'route', 'exactnessTier', 'referenceCamera', 'approximationNotes'].map(k => [k, spec[k] ?? null])), materialPipeline: spec.materialPipeline ?? {}, materialReferenceRegistry: spec.materialReference ?? spec.materialPipeline?.registry ?? null, lookDevTargets: spec.lookDevTargets ?? {} };
    const owner = new OwnedResources(root);
    root.metadata.ownedResources = owner;
    try {
    const nodes: Record<string, TransformNode> = { root }, meshes: Record<string, Mesh> = {}, sockets: Record<string, TransformNode> = {}, colliders: Record<string, unknown> = {}, destructionGroups: Record<string, TransformNode[]> = {}, geometry: Record<string, MeshData> = {}, materials: Record<string, PBRMaterial | StandardMaterial> = {};
    for (const [i, m] of (spec.materials ?? []).entries())
        materials[m.id ?? `material${i}`] = m.extensions?.[LEGACY_BRIDGE] ? createLegacyMaterial(m.id ?? `material${i}`, m, scene, options, owner) : createSculptMaterial(m.id ?? `material${i}`, m, scene, options, false, owner);
    const components = payload.components;
    for (const c of components) {
        if (c.id !== 'root' && nodes[c.id])
            throw Error(`Duplicate node ${c.id}`);
        nodes[c.id] = new TransformNode((c.name ?? c.id) + '__pivot', scene);
        nodes[c.id].parent = root; // Own even not-yet-linked pivots if later construction throws.
    }
    for (const c of components) {
        const node = nodes[c.id], parent = c.id === 'root' || (c.geometryDescriptor?.nativeVertexData && c.parent == null) ? root : nodes[c.parent ?? 'root'];
        if (!parent)
            throw Error(`Missing parent ${c.parent} for ${c.id}`);
        node.parent = parent;
        const t = c.transform ?? {}, native = validateNativeComponent(c), end = native ? null : endpoint(c);
        node.position = convertVector(end ? end.start.asArray() : vector(t.position, [0, 0, 0]), scene);
        node.rotationQuaternion = convertQuaternion(native ? Quaternion.FromArray(c.extensions[LEGACY_BRIDGE].nativeTransform.rotationQuaternion) : quaternionXYZ(vector(t.rotation, [0, 0, 0])), scene);
        node.metadata = { sculptComponent: c, actionProfile: c.actionProfile ?? {} };
        let g = native ? nativeVertexGeometry(c) : end ? cylinderGeometry(end.tip, end.base, end.length, payload.segments.ATTACHMENT_CYLINDER_RADIAL_SEGMENTS, payload.segments.ATTACHMENT_CYLINDER_HEIGHT_SEGMENTS) : builders[c.id]();
        if (!native && c._babylon.subdivision)
            g = subdivideCatmullClark(g, c._babylon.subdivision);
        if (!native && c._babylon.decimate)
            g = decimateGeometry(g, c._babylon.decimate);
        if (!native && !end)
            g.scale(...c._babylon.scale as [
                number,
                number,
                number
            ]);
        if (!native) paintGeometry(g, c);
        const matId = c.material ?? Object.keys(materials)[0];
        let mat = materials[matId];
        if (!mat)
            throw Error(`Missing material ${matId} on ${c.id}`);
        if (!native && c._babylon.dense)
            mat = createSculptMaterial(matId, mat.metadata.sculptMaterial, scene, options, true, owner);
        if (!native && c.vertexPaint) {
            mat = createSculptMaterial(`${matId}:${c.id}`, mat.metadata.sculptMaterial, scene, options, c._babylon.dense, owner);
            (mat as PBRMaterial).albedoColor.set(1, 1, 1);
        }
        if (!native && mat.metadata?.sculptMaterial?.flatShading)
            g = flatGeometry(g);
        const mesh = new Mesh(c.name ?? c.id, scene);
        mesh.parent = node;
        mesh.material = mat;
        if (end) {
            mesh.position = convertVector(end.midpoint.asArray(), scene);
            mesh.rotationQuaternion = convertQuaternion(end.q, scene);
        }
        mesh.receiveShadows = options.receiveShadow ?? true;
        mesh.isPickable = true;
        mesh.metadata = { sculptComponent: c, castShadow: options.castShadow ?? true };
        applyMeshData(g, mesh);
        meshes[c.id] = mesh;
        geometry[c.id] = g;
        colliders[c.id] = c.actionProfile?.collider ?? {};
        const group = c.actionProfile?.destruction?.fractureGroup;
        if (group)
            (destructionGroups[group] ??= []).push(node);
        for (const [i, s] of (c.actionProfile?.sockets ?? []).entries()) {
            const id = s.id ?? `socket-${i}`, socket = new TransformNode(id, scene);
            socket.parent = node;
            socket.position = convertVector(s.localPosition ?? s.position ?? [0, 0, 0], scene);
            socket.rotationQuaternion = convertQuaternion(quaternionXYZ(s.localRotation ?? s.rotation ?? [0, 0, 0]), scene);
            socket.metadata = { socket: s };
            sockets[`${c.id}:${id}`] = socket;
        }
    }
    for (const job of payload.standProud) {
        const g = geometry[job.componentId];
        standProud(g, meshes[job.componentId], nodes[job.targetId], job.rings, job.clearance, job.maxPush);
        applyMeshData(g, meshes[job.componentId]);
    }
    if (payload.bones.length)
        bindRig(root, payload.bones, components, nodes, meshes, geometry);
    for (const rep of payload.repetitions) {
        const parent = nodes[rep.parent ?? 'root'], material = materials[rep.material ?? Object.keys(materials)[0]];
        if (!parent) throw Error(`Missing repetition parent ${rep.parent}`);
        if (!material) throw Error(`Missing repetition material ${rep.material}`);
        const g = builders[`repetition:${rep.id}`](), mesh = new Mesh(rep.id, scene);
        mesh.parent = parent;
        mesh.material = material;
        applyMeshData(g, mesh);
        const placement = rep.placement ?? {}, axis = Vector3.FromArray(placement.axis ?? [0, 0, 1]).normalize(), seed = Math.abs(axis.z) < .9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0), perp = Vector3.Cross(axis, seed).normalize(), scaling = Vector3.FromArray(rep.instanceScale ?? [.1, .1, .1]);
        if (axis.lengthSquared() < .5)
            throw Error('Repetition axis cannot be zero');
        const matrices: number[] = [];
        for (let i = 0; i < rep.count; i++) {
            const angle = ((placement.startAngleDeg ?? 0) + i * 360 / rep.count) * Math.PI / 180, dir = perp.applyRotationQuaternion(Quaternion.RotationAxis(axis, angle)), pos = dir.scale(Math.max(0, placement.radius ?? 0) * .5), q = Quaternion.FromUnitVectorsToRef(new Vector3(1, 0, 0), dir, new Quaternion());
            const m = Matrix.Compose(scaling, convertQuaternion(q, scene), convertVector(pos.asArray(), scene));
            matrices.push(...m.asArray());
        }
        mesh.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16, true);
        mesh.thinInstanceRefreshBoundingInfo(true);
        mesh.thinInstanceEnablePicking = true;
        mesh.metadata = { repetition: rep, castShadow: options.castShadow ?? true };
        mesh.receiveShadows = options.receiveShadow ?? true;
        meshes[`repetition:${rep.id}`] = mesh;
        geometry[`repetition:${rep.id}`] = g;
    }
    const runtime: PipelineRuntime = { nodes, meshes, sockets, colliders, destructionGroups, geometry, ownedResources: owner };
    root.metadata.sculptRuntime = runtime;
    root.metadata.actionReadiness = { note: 'Transform native nodes; use sockets for attachments, colliders as declared proxies, destructionGroups for breakable sets. Havok integration is owned by the host.' };
    return root;
    } catch (error) { root.dispose(false, false); throw error; }
}
