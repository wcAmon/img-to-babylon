import { Scene, TransformNode, Vector3, Camera, TargetCamera, ArcRotateCamera, HemisphericLight, DirectionalLight, PointLight, SpotLight, ShadowGenerator, DefaultRenderingPipeline, ImageProcessingConfiguration, ReflectionProbe, MeshBuilder, StandardMaterial, Color3, HDRFiltering, RenderTargetTexture } from '@babylonjs/core';
import { convertVector } from './meshData';
import { linearColor } from './materials';
/** Explicit degree/radian boundary. Source PerspectiveCamera FOV is vertical degrees. */
export function configureCamera(camera: TargetCamera, source: {
    fov?: number;
    near?: number;
    far?: number;
    position?: number[];
    target?: number[];
    up?: number[];
}) { camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED; camera.fov = (source.fov ?? 50) * Math.PI / 180; camera.minZ = source.near ?? .1; camera.maxZ = source.far ?? 2000; if (source.position)
    camera.position = convertVector(source.position, camera.getScene()); if (source.up)
    camera.upVector = convertVector(source.up, camera.getScene()); if (source.target)
    camera.setTarget(convertVector(source.target, camera.getScene())); return camera; }
export function frameCamera(camera: TargetCamera, object: TransformNode, options: {
    margin?: number;
    azimuthDeg?: number;
    elevationDeg?: number;
} = {}) { const bounds = object.getHierarchyBoundingVectors(true), size = bounds.max.subtract(bounds.min); if (!Number.isFinite(size.length()) || size.length() === 0)
    return; const center = bounds.max.add(bounds.min).scale(.5), max = Math.max(size.x, size.y, size.z) * (options.margin ?? 1.15), distance = max * .5 / Math.tan(camera.fov / 2), az = (options.azimuthDeg ?? 0) * Math.PI / 180, el = (options.elevationDeg ?? 0) * Math.PI / 180, dir = convertVector([Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)], camera.getScene()); camera.position = center.add(dir.scale(distance)); camera.minZ = Math.max(.01, distance - max); camera.maxZ = distance + max * 2; camera.setTarget(center); }
export function createLookDevLights(scene: Scene, mode: 'neutral' | 'grazing' | 'reference' = 'neutral', spec: any = {}) {
    const root = new TransformNode('Pipeline look-dev lights', scene), hemi = new HemisphericLight('hemisphere', Vector3.Up(), scene);
    hemi.diffuse = linearColor(mode === 'reference' ? 0xfff0d6 : 0xf2f4ff);
    hemi.groundColor = linearColor(0x363b42);
    hemi.intensity = mode === 'grazing' ? .28 : mode === 'reference' ? .72 : .85;
    hemi.parent = root;
    const add = (name: string, pos: number[], color: number, intensity: number) => { const position = convertVector(pos, scene), light = new DirectionalLight(name, position.negate().normalize(), scene); light.position = position; light.diffuse = linearColor(color); light.intensity = intensity; light.parent = root; return light; };
    const key = add('key', mode === 'grazing' ? [7.5, 1.1, 4] : mode === 'reference' ? [-4.5, 7.5, 5] : [-4, 6, 5.5], mode === 'reference' ? 0xffcf8a : 0xfff4e8, mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15);
    key.shadowMinZ = .5;
    key.shadowMaxZ = 30;
    key.orthoLeft = -2.6;
    key.orthoRight = 2.6;
    key.orthoTop = 2.6;
    key.orthoBottom = -2.6;
    key.autoUpdateExtends = false;
    const shadow = new ShadowGenerator(4096, key);
    shadow.bias = -.00025;
    shadow.normalBias = .018;
    shadow.useBlurExponentialShadowMap = true;
    shadow.blurKernel = 7;
    shadow.getShadowMap()!.renderList = scene.meshes.filter(m => m.metadata?.castShadow);
    add('fill', [4, 3, 3.5], 0xa8c4ff, mode === 'grazing' ? .12 : .42);
    add('rim', [.5, 4.5, -6], 0xfff1c4, mode === 'grazing' ? .28 : .85);
    root.metadata = { reviewMode: mode, lightingFromPhoto: spec.lightingFromPhoto ?? [], lookDevTargets: spec.lookDevTargets ?? {}, shadowGenerator: shadow };
    return root;
}
export function createNativeLight(scene: Scene, spec: any) { const position = convertVector(spec.position ?? [0, 0, 0], scene), target = convertVector(spec.target ?? [0, 0, 0], scene), direction = target.subtract(position).normalize(); let light: DirectionalLight | PointLight | SpotLight | HemisphericLight; switch (spec.type) {
    case 'DirectionalLight':
        light = new DirectionalLight(spec.name ?? 'directional', direction, scene);
        light.position = position;
        break;
    case 'PointLight':
        light = new PointLight(spec.name ?? 'point', position, scene);
        light.range = spec.distance > 0 ? spec.distance : Number.MAX_VALUE;
        break;
    case 'SpotLight':
        light = new SpotLight(spec.name ?? 'spot', position, direction, (spec.angle ?? Math.PI / 3) * 2, 0, scene);
        light.innerAngle = light.angle * (1 - (spec.penumbra ?? 0));
        light.range = spec.distance > 0 ? spec.distance : Number.MAX_VALUE;
        break;
    case 'HemisphereLight':
        light = new HemisphericLight(spec.name ?? 'hemisphere', position.length() > 0 ? position.normalize() : Vector3.Up(), scene);
        light.groundColor = linearColor(spec.groundColor ?? '#000000');
        break;
    default: throw Error(`Unsupported light ${spec.type}`);
} light.diffuse = linearColor(spec.color ?? '#ffffff'); light.intensity = spec.intensity ?? 1; light.metadata = { sourceLight: spec }; return light; }
// Three ACESFilmicToneMapping applies exposure/0.6 before the shared ACES fit.
export function configureRenderer(scene: Scene) { scene.imageProcessingConfiguration.toneMappingEnabled = true; scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES; scene.imageProcessingConfiguration.exposure = 1/0.6; scene.imageProcessingConfiguration.contrast = 1; }
export function createPresentationPipeline(scene: Scene, camera: Camera, options: {
    dof?: boolean;
    bloom?: boolean;
    bloomStrength?: number;
    dofFocus?: number;
    dofAperture?: number;
} = {}) { const p = new DefaultRenderingPipeline('presentation only', true, scene, [camera]); p.bloomEnabled = options.bloom ?? false; p.bloomWeight = options.bloomStrength ?? .4; p.bloomThreshold = .85; p.depthOfFieldEnabled = options.dof ?? false; p.depthOfField.focusDistance = (options.dofFocus ?? 10) * 1000; p.depthOfField.fStop = 1 / Math.max(.001, (options.dofAperture ?? .0002) * 10000); return p; }
export function createInspectControls(camera: ArcRotateCamera, element: HTMLElement) { camera.attachControl(element, true); camera.inertia = .9; camera.lowerRadiusLimit = 1; camera.upperRadiusLimit = 8; camera.useAutoRotationBehavior = false; return camera; }
/** Procedural room captured by native ReflectionProbe and GGX-prefiltered by HDRFiltering.
 * Requires a real rendering engine; await before recording material evidence. */
export async function createRoomEnvironment(scene: Scene) {
    const roomScene = new Scene(scene.getEngine());
    roomScene.useRightHandedSystem = scene.useRightHandedSystem;
    const room = MeshBuilder.CreateBox('environment room', { size: 10, sideOrientation: 2 }, roomScene), mat = new StandardMaterial('room grey', roomScene);
    mat.diffuseColor = new Color3(.3, .3, .3);
    mat.emissiveColor = new Color3(.02, .02, .02);
    room.material = mat;
    const light = new PointLight('room light', new Vector3(0, 3, 0), roomScene);
    light.intensity = 8;
    for (const [i, pos] of [[-4, 1, 0], [4, 2, -1], [0, 4, 0], [0, 1, -4]].entries()) {
        const panel = MeshBuilder.CreateBox(`light panel ${i}`, { width: i === 2 ? 3 : .15, height: i === 2 ? .15 : 3, depth: 2 }, roomScene);
        panel.position = Vector3.FromArray(pos);
        const material = new StandardMaterial(`emitter ${i}`, roomScene);
        material.disableLighting = true;
        material.emissiveColor = new Color3(4, 4, 4);
        panel.material = material;
    }
    const camera = new ArcRotateCamera('probe camera', 0, Math.PI / 2, 1, Vector3.Zero(), roomScene);
    roomScene.activeCamera = camera;
    const probe = new ReflectionProbe('procedural room', 256, roomScene, true, true);
    probe.renderList = roomScene.meshes;
    probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    await roomScene.whenReadyAsync();
    probe.cubeTexture.render();
    await new HDRFiltering(scene.getEngine()).prefilter(probe.cubeTexture);
    scene.environmentTexture = probe.cubeTexture;
    scene.onDisposeObservable.addOnce(() => roomScene.dispose());
    return probe.cubeTexture;
}
