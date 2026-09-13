import { Color3, StandardMaterial, PBRMaterial, Scene, Texture, RawTexture, MaterialPluginBase, UniformBuffer, Material, AbstractEngine, SubMesh, ShaderLanguage } from '@babylonjs/core';
import { OwnedResources } from './resources';
import { LEGACY_BRIDGE } from './nativeImport';
import { makeTexturePixels, readLayerNumber as number, clamp01, clampPbrIor, clampPbrMetalness, clampPbrF0 } from './materialMath';
export type ModelOptions = {
    wireframe?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
    textureSize?: number;
    textureAnisotropy?: number;
    qualityPriority?: 'reference-fidelity' | 'balanced';
};
export function linearColor(s: string | number = '#8A7A5F') { if (typeof s === 'number')
    s = '#' + s.toString(16).padStart(6, '0'); if (/^#[0-9a-f]{3}$/i.test(s))
    s = '#' + s.slice(1).split('').map(c => c + c).join(''); return Color3.FromHexString(s).toLinearSpace(true); }
function referenceUrl(spec: any, channel: string) { const r = spec.referencePbr; if (!r || r.usable === false || (r.confidence ?? r.estimatedFidelity ?? 0) < (r.targetThreshold ?? .7))
    return null; const m = r.maps?.[channel]; return m?.url || m?.path || null; }
export class HeightDisplacement extends MaterialPluginBase {
    constructor(material: PBRMaterial, public texture: Texture, public amount: number) { super(material, 'PipelineHeightDisplacement', 200, {}, true, true); }
    isCompatible(language: ShaderLanguage) { return language === ShaderLanguage.GLSL; }
    getSamplers(s: string[]) { s.push('pipelineHeight'); }
    getActiveTextures(t: Texture[]) { t.push(this.texture); }
    hasTexture(t: Texture) { return t === this.texture; }
    getUniforms() { return { ubo: [{ name: 'pipelineDisplacement', size: 1, type: 'float' }, { name: 'pipelineHeightMatrix', size: 16, type: 'mat4' }], vertex: 'uniform float pipelineDisplacement;\nuniform mat4 pipelineHeightMatrix;' }; }
    bindForSubMesh(u: UniformBuffer, _s: Scene, _e: AbstractEngine, _m: SubMesh) { u.updateFloat('pipelineDisplacement', this.amount); u.updateMatrix('pipelineHeightMatrix', this.texture.getTextureMatrix()); u.setTexture('pipelineHeight', this.texture); }
    getCustomCode(stage: string) { return stage === 'vertex' ? { CUSTOM_VERTEX_DEFINITIONS: 'uniform sampler2D pipelineHeight;', CUSTOM_VERTEX_UPDATE_POSITION: '#if defined(NORMAL) && defined(UV1)\npositionUpdated += normalize(normalUpdated) * (texture2D(pipelineHeight, (pipelineHeightMatrix * vec4(uvUpdated, 1.0, 0.0)).xy).r - 0.5) * pipelineDisplacement;\n#endif' } : null; }
}
export function createSculptMaterial(id: string, spec: any, scene: Scene, options: ModelOptions = {}, dense = false, owner?: OwnedResources): PBRMaterial {
    const m = new PBRMaterial(id, scene, true), maps: Record<string, Texture> = {};
    owner?.material(m);
    let source = 'flat-fallback';
    if (spec.textureless?.declared !== true) {
        const channels = ['albedo', 'roughness', 'height', 'normal', 'ao'], urls = channels.map(c => referenceUrl(spec, c));
        if (urls.every(Boolean)) {
            source = 'reference-pixel-extraction';
            channels.forEach((c, i) => { maps[c] = new Texture(urls[i], scene, false, true); owner?.texture(maps[c]); });
        }
        else {
            source = 'procedural';
            const requested = options.textureSize ?? spec.textureResolution ?? ((options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity' ? 1024 : 512), size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requested))));
            const pixels = makeTexturePixels(id, spec, size);
            channels.forEach(c => { maps[c] = RawTexture.CreateRGBATexture(new Uint8Array(pixels.images[c].data), size, size, scene, true, true); owner?.texture(maps[c]); });
        }
        for (const [channel, t] of Object.entries(maps)) {
            const repeat = spec.textureProjection?.repeat ?? (source === 'procedural' ? [2, 2] : [1, 1]);
            t.name = `${id}:${channel}`;
            t.gammaSpace = channel === 'albedo';
            t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
            t.uScale = repeat[0];
            t.vScale = repeat[1];
            t.anisotropicFilteringLevel = Math.max(1, Math.round(options.textureAnisotropy ?? spec.textureProjection?.anisotropy ?? 8));
        }
    }
    m.albedoColor = maps.albedo ? Color3.White() : linearColor(spec.baseColor ?? '#8A7A5F');
    m.roughness = maps.roughness ? 1 : clamp01(number(spec.roughness, ['base'], .76));
    m.metallic = clampPbrMetalness(number(spec.metalness, ['base'], 0));
    m.clearCoat.intensity = clamp01(number(spec.clearcoat, ['base', 'amount'], 0));
    m.clearCoat.isEnabled = m.clearCoat.intensity > 0;
    m.clearCoat.roughness = clamp01(number(spec.clearcoatRoughness, ['base'], .25));
    const transmission = clamp01(number(spec.transmission, ['base', 'amount'], 0));
    m.subSurface.isRefractionEnabled = transmission > 0;
    m.subSurface.refractionIntensity = transmission;
    m.subSurface.indexOfRefraction = clampPbrIor(number(spec.ior, ['base', 'value'], 1.5));
    m.indexOfRefraction = m.subSurface.indexOfRefraction;
    m.subSurface.minimumThickness = m.subSurface.maximumThickness = Math.max(0, number(spec.thickness, ['base', 'amount'], 0));
    m.subSurface.tintColor = linearColor(spec.attenuationColor ?? '#ffffff');
    m.subSurface.tintColorAtDistance = Math.max(.001, number(spec.attenuationDistance, ['base', 'value'], 1e9));
    m.sheen.intensity = clamp01(number(spec.sheen, ['base', 'amount'], 0));
    m.sheen.isEnabled = m.sheen.intensity > 0;
    m.sheen.color = linearColor(spec.sheenColor ?? '#ffffff');
    m.sheen.roughness = clamp01(number(spec.sheenRoughness, ['base'], 1));
    m.iridescence.intensity = clamp01(number(spec.iridescence, ['base', 'amount'], 0));
    m.iridescence.isEnabled = m.iridescence.intensity > 0;
    m.iridescence.indexOfRefraction = clampPbrIor(number(spec.iridescenceIOR, ['base', 'value'], 1.3));
    m.anisotropy.intensity = clamp01(number(spec.anisotropy, ['base', 'amount'], 0));
    m.anisotropy.isEnabled = m.anisotropy.intensity > 0;
    m.anisotropy.angle = number(spec.anisotropy, ['rotation'], 0);
    m.metallicF0Factor = clampPbrF0(number(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1));
    m.metallicReflectanceColor = linearColor(spec.specularColor ?? '#ffffff');
    m.emissiveColor = linearColor(spec.emissive ?? '#000000').scale(Math.max(0, number(spec.emissiveIntensity, ['base'], 1)));
    m.alpha = clamp01(number(spec.opacity, ['base'], 1));
    m.alphaCutOff = Math.max(0, number(spec.alpha, ['cutoff', 'alphaTest'], 0));
    m.transparencyMode = m.alpha < 1 ? PBRMaterial.PBRMATERIAL_ALPHABLEND : m.alphaCutOff > 0 ? PBRMaterial.PBRMATERIAL_ALPHATEST : PBRMaterial.PBRMATERIAL_OPAQUE;
    m.backFaceCulling = spec.doubleSided !== true;
    m.twoSidedLighting = spec.doubleSided === true;
    m.wireframe = options.wireframe ?? false;
    if (maps.albedo) {
        m.albedoTexture = maps.albedo;
        // Separate microSurfaceTexture multiplies metallic-workflow roughness by RED; source grayscale maps have equal RGB. No accidental metallic modulation.
        m.microSurfaceTexture = maps.roughness;
        m.bumpTexture = maps.normal;
        m.bumpTexture.level = Math.max(.05, number(spec.normal, ['strength', 'amplitude'], .35));
        m.invertNormalMapX = false;
        m.invertNormalMapY = false;
        m.ambientTexture = maps.ao;
        m.ambientTextureStrength = number(spec.ambientOcclusion, ['cavityStrength', 'strength'], .35);
        m.ambientTexture.coordinatesIndex = 0;
        const denseMesh = dense || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense', amplitude = Math.max(0, number(spec.displacement, ['amplitude', 'strength'], 0)), effective = denseMesh ? Math.max(.005, amplitude) : amplitude;
        if (effective > 0)
            new HeightDisplacement(m, maps.height, effective);
    }
    m.environmentIntensity = number(spec, ['envMapIntensity'], .8);
    m.metadata = { sculptMaterial: spec, pbrTextureSource: source, proceduralMapsIndependent: true, pbrConstraints: { albedoRange: [30, 240], binaryMetalness: true, f0Range: [.02, 1], iorRange: [1, 2.5] }, referencePbr: spec.referencePbr ?? null, referenceMaterialId: spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null, materialEvidence: spec.materialEvidence ?? null, validationViews: spec.materialReference?.validationViews ?? [], maps };
    return m;
}

/** Explicit legacy material semantics, not an inferred sRGB/PBR reinterpretation. */
export function createLegacyMaterial(id: string, spec: any, scene: Scene, options: ModelOptions = {}, owner?: OwnedResources): StandardMaterial {
    const ext = spec.extensions?.[LEGACY_BRIDGE], rgb = ext?.baseColorRGB;
    if (ext?.useExactRGB !== true || ext.colorSpace !== 'legacy-Color3-numeric' || !Array.isArray(rgb) || rgb.length !== 3 || rgb.some((v: any) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)) throw Error(`${id}: invalid exact legacy RGB contract`);
    const m = new StandardMaterial(id, scene); owner?.material(m);
    m.diffuseColor = Color3.FromArray(rgb); m.specularColor = new Color3(.05,.05,.05); m.specularPower = 24; m.wireframe = options.wireframe ?? false;
    m.metadata = { sculptMaterial: spec, legacyMaterial: ext.source, exactRGB: rgb.slice(), materialSemantics: 'legacy StandardMaterial numeric RGB; PBR parameters preserved without reinterpretation' };
    return m;
}
