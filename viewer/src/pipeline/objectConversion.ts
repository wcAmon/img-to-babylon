/** Structural input contract accepts live Three objects or their equivalent numeric records.
 * No Three package is imported. Call updateMatrixWorld(true) on live input before converting.
 * This is an explicit asset adapter; the procedural generator never calls it. */
import { Scene, Mesh, TransformNode, Matrix, Vector3, Quaternion, Material, PBRMaterial, MultiMaterial, Bone, Skeleton, FreeCamera, Camera, Texture, RawTexture, MorphTarget, MorphTargetManager } from '@babylonjs/core';
import { MeshData, Attribute, applyMeshData, convertMatrix, convertQuaternion, convertVector } from './meshData';
import { HeightDisplacement } from './materials';
import { createNativeLight } from './scene';
const arr = (v: any, f: number[] = []) => v?.toArray ? v.toArray() : v?.asArray ? v.asArray() : v ?? f;
const matrix = (v: any) => Matrix.FromArray(v?.elements ?? arr(v, Matrix.Identity().asArray() as number[]));
export function convertProjectionMatrix(source: any, scene: Scene) { let p = matrix(source); if (!scene.useRightHandedSystem)
    p = Matrix.Scaling(1, 1, -1).multiply(p); if (scene.getEngine().isNDCHalfZRange) {
    const remap = Matrix.Identity();
    remap.setRowFromFloats(2, 0, 0, .5, 0);
    remap.setRowFromFloats(3, 0, 0, .5, 1);
    p = p.multiply(remap);
} return p; }
export function readGeometry(source: any): MeshData {
    const g = new MeshData();
    for (const [name, value] of Object.entries(source.attributes ?? {}) as [
        string,
        any
    ][]) {
        const values: number[] = [];
        const count = value.count ?? value.array.length / value.itemSize;
        for (let i = 0; i < count; i++)
            for (let j = 0; j < value.itemSize; j++) {
                const read = value[['getX', 'getY', 'getZ', 'getW'][j]];
                values.push(read ? read.call(value, i) : value.array[i * value.itemSize + j]);
            }
        const target = /^uv[1-5]$/.test(name) ? 'uv' + (Number(name.slice(2)) + 1) : name;
        g.setAttribute(target, new Attribute(values, value.itemSize));
    }
    if (source.index)
        g.setIndex(source.index.array ?? source.index);
    g.groups = (source.groups ?? []).map((x: any) => ({ ...x }));
    g.morphTargetsRelative = source.morphTargetsRelative ?? false;
    for (const [kind, targets] of Object.entries(source.morphAttributes ?? {}) as [
        string,
        any[]
    ][]) {
        if (!['position', 'normal'].includes(kind))
            throw Error(`Unsupported morph channel ${kind}`);
        g.morphAttributes[kind] = targets.map(a => new Attribute(a.array ?? a, a.itemSize ?? 3));
    }
    g.userData = structuredClone(source.userData ?? {});
    return g;
}
function inputColor(c: any, f: number[]) { return c?.r !== undefined ? new Color3(c.r, c.g, c.b) : Color3.FromArray(arr(c, f)); }
// Input Color objects already contain linear working-space RGB; do NOT gamma-decode twice.
import { Color3 } from '@babylonjs/core';
export function convertTexture(source: any, scene: Scene) {
    if (!source)
        return null;
    const image = source.image ?? source.source?.data;
    let t: Texture;
    if (image?.data) {
        if (image.data.length !== image.width * image.height * 4)
            throw Error('Raw texture conversion requires RGBA data');
        t = RawTexture.CreateRGBATexture(image.data, image.width, image.height, scene, source.generateMipmaps !== false, source.flipY ?? true);
    }
    else {
        const url = image?.currentSrc ?? image?.src ?? source.url;
        if (!url)
            throw Error('Texture has no readable image or URL');
        t = new Texture(url, scene, source.generateMipmaps === false, source.flipY ?? true);
    }
    t.gammaSpace = source.colorSpace === 'srgb';
    const wraps: Record<number, number> = { 1000: Texture.WRAP_ADDRESSMODE, 1001: Texture.CLAMP_ADDRESSMODE, 1002: Texture.MIRROR_ADDRESSMODE };
    t.wrapU = wraps[source.wrapS] ?? Texture.CLAMP_ADDRESSMODE;
    t.wrapV = wraps[source.wrapT] ?? Texture.CLAMP_ADDRESSMODE;
    t.uScale = source.repeat?.x ?? source.repeat?.[0] ?? 1;
    t.vScale = source.repeat?.y ?? source.repeat?.[1] ?? 1;
    t.uOffset = source.offset?.x ?? source.offset?.[0] ?? 0;
    t.vOffset = source.offset?.y ?? source.offset?.[1] ?? 0;
    t.wAng = -(source.rotation ?? 0);
    t.uRotationCenter = source.center?.x ?? 0;
    t.vRotationCenter = source.center?.y ?? 0;
    t.homogeneousRotationInUVTransform = true;
    t.coordinatesIndex = source.channel ?? 0;
    t.anisotropicFilteringLevel = source.anisotropy ?? 1;
    if (source.matrixAutoUpdate !== false)
        source.updateMatrix?.();
    const sx = t.uScale, sy = t.vScale, cx = t.uRotationCenter, cy = t.vRotationCenter, c = Math.cos(source.rotation ?? 0), s = Math.sin(source.rotation ?? 0), e = source.matrix?.elements ?? [sx * c, -sy * s, 0, sx * s, sy * c, 0, -sx * (c * cx + s * cy) + cx + t.uOffset, -sy * (-s * cx + c * cy) + cy + t.vOffset, 1];
    const uvMatrix = Matrix.FromValues(e[0], e[1], 0, 0, e[3], e[4], 0, 0, e[6], e[7], 1, 0, 0, 0, 0, 1);
    t.getTextureMatrix = () => uvMatrix;
    return t;
}
export function convertMaterial(s: any, scene: Scene) {
    if (s.isShaderMaterial || s.isRawShaderMaterial)
        throw Error('Arbitrary Three shader programs require an explicit Babylon shader port');
    const m = new PBRMaterial(s.name ?? 'converted PBR', scene, true);
    m.albedoColor = inputColor(s.color, [1, 1, 1]);
    m.roughness = s.roughness ?? 1;
    m.metallic = s.metalness ?? 0;
    m.alpha = s.opacity ?? 1;
    m.backFaceCulling = s.side !== 2;
    m.twoSidedLighting = s.side === 2;
    m.wireframe = s.wireframe ?? false;
    m.unlit = !!s.isMeshBasicMaterial;
    m.emissiveColor = inputColor(s.emissive, [0, 0, 0]).scale(s.emissiveIntensity ?? 1);
    m.metallicF0Factor = s.specularIntensity ?? 1;
    m.metallicReflectanceColor = inputColor(s.specularColor, [1, 1, 1]);
    m.indexOfRefraction = s.ior ?? 1.5;
    m.clearCoat.isEnabled = (s.clearcoat ?? 0) > 0;
    m.clearCoat.intensity = s.clearcoat ?? 0;
    m.clearCoat.roughness = s.clearcoatRoughness ?? 0;
    m.sheen.isEnabled = (s.sheen ?? 0) > 0;
    m.sheen.intensity = s.sheen ?? 0;
    m.sheen.color = inputColor(s.sheenColor, [0, 0, 0]);
    m.sheen.roughness = s.sheenRoughness ?? 1;
    m.iridescence.isEnabled = (s.iridescence ?? 0) > 0;
    m.iridescence.intensity = s.iridescence ?? 0;
    m.iridescence.indexOfRefraction = s.iridescenceIOR ?? 1.3;
    m.anisotropy.isEnabled = (s.anisotropy ?? 0) > 0;
    m.anisotropy.intensity = s.anisotropy ?? 0;
    m.anisotropy.angle = s.anisotropyRotation ?? 0;
    m.subSurface.isRefractionEnabled = (s.transmission ?? 0) > 0;
    m.subSurface.refractionIntensity = s.transmission ?? 0;
    m.subSurface.indexOfRefraction = s.ior ?? 1.5;
    m.subSurface.minimumThickness = m.subSurface.maximumThickness = s.thickness ?? 0;
    m.subSurface.tintColor = inputColor(s.attenuationColor, [1, 1, 1]);
    m.subSurface.tintColorAtDistance = Number.isFinite(s.attenuationDistance) ? s.attenuationDistance : 1e9;
    m.albedoTexture = convertTexture(s.map, scene);
    m.bumpTexture = convertTexture(s.normalMap, scene);
    if (m.bumpTexture) {
        if (s.normalScale && Math.abs(s.normalScale.x - s.normalScale.y) > 1e-8)
            throw Error('Unequal tangent normal scales need explicit shader adaptation');
        m.bumpTexture.level = s.normalScale?.x ?? 1;
    }
    m.ambientTexture = convertTexture(s.aoMap, scene);
    m.ambientTextureStrength = s.aoMapIntensity ?? 1;
    m.emissiveTexture = convertTexture(s.emissiveMap, scene);
    // Three's roughness is G, metallic is B. Independent maps cannot share a packed Babylon sampler.
    // Plugin reads each source channel independently, without rewriting evidence images.
    if (s.roughnessMap || s.metalnessMap)
        new IndependentPbrMaps(m, convertTexture(s.roughnessMap, scene), convertTexture(s.metalnessMap, scene));
    m.clearCoat.texture = convertTexture(s.clearcoatMap, scene);
    m.clearCoat.textureRoughness = convertTexture(s.clearcoatRoughnessMap, scene);
    m.clearCoat.useRoughnessFromMainTexture = false;
    m.clearCoat.bumpTexture = convertTexture(s.clearcoatNormalMap, scene);
    m.sheen.texture = convertTexture(s.sheenColorMap, scene);
    m.sheen.textureRoughness = convertTexture(s.sheenRoughnessMap, scene);
    m.sheen.useRoughnessFromMainTexture = false;
    m.iridescence.texture = convertTexture(s.iridescenceMap, scene);
    m.iridescence.thicknessTexture = convertTexture(s.iridescenceThicknessMap, scene);
    if (s.iridescenceThicknessRange) {
        m.iridescence.minimumThickness = s.iridescenceThicknessRange[0];
        m.iridescence.maximumThickness = s.iridescenceThicknessRange[1];
    }
    m.subSurface.useGltfStyleTextures = true;
    m.subSurface.thicknessTexture = convertTexture(s.thicknessMap, scene);
    m.subSurface.refractionIntensityTexture = convertTexture(s.transmissionMap, scene);
    m.anisotropy.texture = convertTexture(s.anisotropyMap, scene);
    m.reflectanceTexture = convertTexture(s.specularColorMap, scene);
    m.metallicReflectanceTexture = convertTexture(s.specularIntensityMap, scene);
    m.useOnlyMetallicFromMetallicReflectanceTexture = true;
    if (s.displacementMap) {
        if (s.displacementBias !== undefined && Math.abs(s.displacementBias + (s.displacementScale ?? 1) / 2) > 1e-9)
            throw Error('Arbitrary displacement bias requires explicit shader adaptation');
        new HeightDisplacement(m, convertTexture(s.displacementMap, scene)!, s.displacementScale ?? 1);
    }
    for (const field of ['bumpMap', 'lightMap', 'alphaMap', 'envMap'])
        if (s[field])
            throw Error(`Material ${field} requires explicit native adaptation`);
    m.alphaCutOff = s.alphaTest ?? 0;
    m.transparencyMode = s.transparent ? PBRMaterial.PBRMATERIAL_ALPHABLEND : m.alphaCutOff > 0 ? PBRMaterial.PBRMATERIAL_ALPHATEST : PBRMaterial.PBRMATERIAL_OPAQUE;
    m.metadata = { sourceMaterial: s.userData ?? {}, sourceType: s.type };
    return m;
}
import { MaterialPluginBase, UniformBuffer, ShaderLanguage } from '@babylonjs/core';
class IndependentPbrMaps extends MaterialPluginBase {
    constructor(m: PBRMaterial, public rough: Texture | null, public metal: Texture | null) { super(m, 'IndependentPbrMaps', 210, {}, true, true); if ([rough, metal].some(t => t && t.coordinatesIndex > 1))
        throw Error('Independent maps currently support UV channels 0 and 1'); }
    isCompatible(l: ShaderLanguage) { return l === ShaderLanguage.GLSL; }
    prepareDefines(d: any) { d.UV1 = true; if (this.rough?.coordinatesIndex === 1 || this.metal?.coordinatesIndex === 1)
        d.UV2 = true; }
    getSamplers(a: string[]) { if (this.rough)
        a.push('sourceRoughness'); if (this.metal)
        a.push('sourceMetallic'); }
    getAttributes(a: string[]) { if (!a.includes('uv'))
        a.push('uv'); if (this.rough?.coordinatesIndex === 1 || this.metal?.coordinatesIndex === 1)
        if (!a.includes('uv2'))
            a.push('uv2'); }
    getActiveTextures(a: Texture[]) { if (this.rough)
        a.push(this.rough); if (this.metal)
        a.push(this.metal); }
    hasTexture(t: Texture) { return t === this.rough || t === this.metal; }
    isReadyForSubMesh() { return (!this.rough || this.rough.isReadyOrNotBlocking()) && (!this.metal || this.metal.isReadyOrNotBlocking()); }
    getUniforms() { return { ubo: [{ name: 'sourceRoughMatrix', size: 16, type: 'mat4' }, { name: 'sourceMetalMatrix', size: 16, type: 'mat4' }], fragment: 'uniform mat4 sourceRoughMatrix;\nuniform mat4 sourceMetalMatrix;' }; }
    bindForSubMesh(u: UniformBuffer) { if (this.rough) {
        u.setTexture('sourceRoughness', this.rough);
        u.updateMatrix('sourceRoughMatrix', this.rough.getTextureMatrix());
    } if (this.metal) {
        u.setTexture('sourceMetallic', this.metal);
        u.updateMatrix('sourceMetalMatrix', this.metal.getTextureMatrix());
    } }
    getCustomCode(stage: string): Record<string, string> | null { const decl = 'varying vec2 sourceUV;\nvarying vec2 sourceUV2;', uv = (t: Texture) => t.coordinatesIndex === 1 ? 'sourceUV2' : 'sourceUV'; if (stage === 'vertex')
        return { CUSTOM_VERTEX_DEFINITIONS: decl, CUSTOM_VERTEX_MAIN_END: 'sourceUV = uv;\n#ifdef UV2\nsourceUV2 = uv2;\n#else\nsourceUV2 = uv;\n#endif' }; if (stage === 'fragment')
        return { CUSTOM_FRAGMENT_DEFINITIONS: `${decl}\n${this.rough ? 'uniform sampler2D sourceRoughness;' : ''}\n${this.metal ? 'uniform sampler2D sourceMetallic;' : ''}`, CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `${this.rough ? `metallicRoughness.g *= texture2D(sourceRoughness,(sourceRoughMatrix*vec4(${uv(this.rough)},1.,0.)).xy).g;` : ''}${this.metal ? `metallicRoughness.r *= texture2D(sourceMetallic,(sourceMetalMatrix*vec4(${uv(this.metal)},1.,0.)).xy).b;` : ''}` }; return null; }
}
export function convertThreeObject(source: any, scene: Scene) {
    source.updateMatrixWorld?.(true);
    const nodes = new Map<any, TransformNode>(), meshPairs: {
        source: any;
        mesh: Mesh;
    }[] = [];
    const visit = (s: any, parent: TransformNode | null): TransformNode => {
        let node: TransformNode;
        if (s.isBone || s.type === 'Bone') {
            node = new TransformNode(s.name ?? 'bone proxy', scene);
        }
        else if (s.isMesh || s.type === 'Mesh' || s.type === 'SkinnedMesh' || s.type === 'InstancedMesh') {
            const mesh = new Mesh(s.name ?? 'mesh', scene);
            const g = readGeometry(s.geometry);
            applyMeshData(g, mesh);
            if (Array.isArray(s.material)) {
                const mm = new MultiMaterial(mesh.name + ' materials', scene);
                mm.subMaterials = s.material.map((m: any) => convertMaterial(m, scene));
                mesh.material = mm;
            }
            else
                mesh.material = convertMaterial(s.material ?? {}, scene);
            mesh.isVisible = s.visible !== false;
            mesh.receiveShadows = s.receiveShadow ?? false;
            if (s.isInstancedMesh) {
                mesh.thinInstanceSetBuffer('matrix', new Float32Array(Array.from({ length: s.count }, (_, i) => convertMatrix(Matrix.FromArray(s.instanceMatrix.array, i * 16), scene).asArray()).flatMap(a => Array.from(a))), 16, true);
            }
            if (s.morphTargetInfluences && mesh.morphTargetManager)
                for (let i = 0; i < s.morphTargetInfluences.length; i++) {
                    const target = mesh.morphTargetManager.getTarget(i);
                    target.influence = s.morphTargetInfluences[i];
                    target.name = Object.keys(s.morphTargetDictionary ?? {}).find(k => s.morphTargetDictionary[k] === i) ?? target.name;
                }
            meshPairs.push({ source: s, mesh });
            node = mesh;
        }
        else if (s.isCamera || s.type?.endsWith('Camera')) {
            const camera = new FreeCamera(s.name ?? 'camera', Vector3.Zero(), scene);
            camera.fov = (s.fov ?? 50) * Math.PI / 180;
            camera.minZ = s.near ?? .1;
            camera.maxZ = s.far ?? 2000;
            camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
            if (s.isOrthographicCamera || s.type === 'OrthographicCamera') {
                camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
                camera.orthoLeft = s.left;
                camera.orthoRight = s.right;
                camera.orthoTop = s.top;
                camera.orthoBottom = s.bottom;
            }
            if (s.projectionMatrix)
                camera.freezeProjectionMatrix(convertProjectionMatrix(s.projectionMatrix, scene));
            node = camera as unknown as TransformNode;
        }
        else if (s.isLight) {
            node = createNativeLight(scene, { ...s, position: arr(s.position), target: arr(s.target?.position), color: s.color?.getHex?.() ?? s.color, groundColor: s.groundColor?.getHex?.() ?? s.groundColor }) as unknown as TransformNode;
        }
        else
            node = new TransformNode(s.name ?? 'group', scene);
        node.parent = parent;
        const local = s.matrix ? convertMatrix(matrix(s.matrix), scene) : Matrix.Compose(Vector3.FromArray(arr(s.scale, [1, 1, 1])), convertQuaternion(Quaternion.FromArray(arr(s.quaternion, [0, 0, 0, 1])), scene), convertVector(arr(s.position, [0, 0, 0]), scene));
        const scaling = new Vector3(), rotation = new Quaternion(), position = new Vector3();
        local.decompose(scaling, rotation, position);
        node.position = position;
        node.rotationQuaternion = rotation;
        node.scaling = scaling;
        const recomposed = Matrix.Compose(scaling, rotation, position), hasShear = Array.from(local.asArray()).some((v, i) => Math.abs(v - recomposed.asArray()[i]) > 1e-5);
        if (hasShear) {
            if (!(node instanceof TransformNode))
                throw Error('Camera/light shear needs a custom projection');
            node.position.setAll(0);
            node.rotationQuaternion = Quaternion.Identity();
            node.scaling.setAll(1);
            node.setPreTransformMatrix(local);
        }
        node.setEnabled(s.visible !== false);
        node.metadata = { ...node.metadata, sourceData: s.userData ?? {} };
        nodes.set(s, node);
        for (const child of s.children ?? [])
            visit(child, node);
        return node;
    };
    const root = visit(source, null);
    for (const { source: s, mesh } of meshPairs)
        if (s.skeleton) {
            const original = s.skeleton, sk = new Skeleton(mesh.name + ' skin', mesh.name + ' skin', scene), order: any[] = [], pending = new Set<any>(original.bones);
            while (pending.size) {
                const before = pending.size;
                for (const b of pending)
                    if (!pending.has(b.parent)) {
                        order.push(b);
                        pending.delete(b);
                    }
                if (before === pending.size)
                    throw Error('Bone cycle');
            }
            const invBind = convertMatrix(matrix(s.bindMatrixInverse ?? matrix(s.bindMatrix).invert().asArray()), scene), absolute = new Map<any, Matrix>(), bind = new Map<any, Matrix>(), native = new Map<any, Bone>();
            for (const b of order) {
                const index = original.bones.indexOf(b);
                absolute.set(b, convertMatrix(matrix(b.matrixWorld), scene).multiply(invBind));
                bind.set(b, convertMatrix(matrix(original.boneInverses[index]).invert(), scene).multiply(invBind));
                const parent = native.get(b.parent), current = absolute.get(b)!, rest = bind.get(b)!, local = parent ? current.multiply(absolute.get(b.parent)!.clone().invert()) : current, localBind = parent ? rest.multiply(bind.get(b.parent)!.clone().invert()) : rest;
                native.set(b, new Bone(b.name ?? `bone-${index}`, sk, parent, local, localBind, localBind, index));
            }
            mesh.skeleton = sk;
            mesh.alwaysSelectAsActiveMesh = true;
            sk.prepare(true);
            mesh.metadata.convertedBones = native;
        }
    return { root, nodes };
}
