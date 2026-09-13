import { ArcRotateCamera, Camera, Matrix, Vector3 } from '@babylonjs/core';

/** Distances/targets are model metres; native alpha/beta remain radians. */
export interface CameraSpec {
  coordinateFrame?: 'native'|'source-rh';
  aspectRatio?: number;
  up?: [number,number,number]; rollDegrees?: number;
  alpha?: number; beta?: number; radius?: number;
  azimuthDegrees?: number; elevationDegrees?: number; distance?: number;
  left?: number; right?: number; top?: number; bottom?: number;
  target?: [number, number, number]; position?: [number, number, number];
  fovDegrees?: number; near?: number; far?: number; projection?: string;
}
const finite = (n: number, name: string) => {
  if (!Number.isFinite(n)) throw new Error(`${name} must be finite`);
  return n;
};
export function applyCaptureCamera(camera: ArcRotateCamera, spec: CameraSpec, scale = 1): void {
  if(spec.coordinateFrame!==undefined&&!['native','source-rh'].includes(spec.coordinateFrame))throw new Error('unknown camera coordinateFrame');
  if(spec.coordinateFrame==='source-rh'){
    if(spec.alpha!==undefined||spec.beta!==undefined)throw new Error('source-rh requires source position or degree orbit');
    const reflect=!camera.getScene().useRightHandedSystem;
    const convert=(v:[number,number,number]):[number,number,number]=>[v[0],v[1],reflect?-v[2]:v[2]];
    const target=spec.target??[0,0,0];
    let position=spec.position;
    if(!position){
      const a=(spec.azimuthDegrees??0)*Math.PI/180,e=(spec.elevationDegrees??0)*Math.PI/180,d=spec.distance??spec.radius;
      if(d===undefined)throw new Error('source camera requires explicit distance');
      position=[target[0]+d*Math.cos(e)*Math.sin(a),target[1]+d*Math.sin(e),target[2]+d*Math.cos(e)*Math.cos(a)];
    }
    const {azimuthDegrees,elevationDegrees,distance,radius,...rest}=spec;
    return applyCaptureCamera(camera,{...rest,coordinateFrame:'native',position:convert(position),target:convert(target),up:spec.up?convert(spec.up):undefined,rollDegrees:spec.rollDegrees},scale);
  }
  if (!(finite(scale, 'physicsScale') > 0)) throw new Error('physicsScale must be positive');
  if (spec.projection && !['perspective','orthographic'].includes(spec.projection)) throw new Error('invalid projection');
  if (spec.projection === 'orthographic' && (![spec.left,spec.right,spec.top,spec.bottom].every(n=>typeof n==='number'&&Number.isFinite(n)) || spec.left!>=spec.right! || spec.bottom!>=spec.top!)) throw new Error('orthographic bounds required');
  const degrees = spec.azimuthDegrees !== undefined || spec.elevationDegrees !== undefined;
  if (degrees && (spec.alpha !== undefined || spec.beta !== undefined)) throw new Error('mixed degree/radian camera contract');
  if (spec.position && (degrees || spec.alpha !== undefined || spec.beta !== undefined || spec.radius !== undefined || spec.distance !== undefined)) throw new Error('position and orbit are mutually exclusive');
  const target = spec.target ? Vector3.FromArray(spec.target).scale(scale) : camera.target.clone();
  if (spec.target?.length !== undefined && spec.target.length !== 3) throw new Error('target must be vec3');
  target.asArray().forEach(n => finite(n, 'target'));
  let alpha = finite(degrees ? Math.PI / 2 - (spec.azimuthDegrees ?? 0) * Math.PI / 180 : spec.alpha ?? camera.alpha, 'alpha');
  let beta = finite(degrees ? Math.PI / 2 - (spec.elevationDegrees ?? 0) * Math.PI / 180 : spec.beta ?? camera.beta, 'beta');
  let radius = finite((spec.distance ?? spec.radius ?? camera.radius / scale) * scale, 'radius');
  if (spec.position) {
    if (spec.position.length !== 3) throw new Error('position must be vec3');
    spec.position.forEach(n => finite(n, 'position'));
    const delta = Vector3.FromArray(spec.position).scale(scale).subtract(target);
    radius = delta.length(); alpha = Math.atan2(delta.z, delta.x); beta = Math.acos(delta.y / radius);
  }
  if (!(radius > 0) || !(beta > 0 && beta < Math.PI)) throw new Error('radius must be positive; camera cannot be at an orbit pole');
  const near = finite(spec.near === undefined ? camera.minZ : spec.near * scale, 'near');
  const far = finite(spec.far === undefined ? camera.maxZ : spec.far * scale, 'far');
  const fov = finite(spec.fovDegrees === undefined ? camera.fov : spec.fovDegrees * Math.PI / 180, 'fov');
  if (!(near > 0 && far > near && fov > 0 && fov < Math.PI)) throw new Error('invalid clipping planes or FOV');
  // setTarget rebuilds orbit from the old position. It MUST precede the orbit assignments.
  camera.upVector=Vector3.Up();
  camera.setTarget(target);
  camera.lowerAlphaLimit = camera.upperAlphaLimit = null;
  camera.lowerBetaLimit = 0; camera.upperBetaLimit = Math.PI;
  camera.lowerRadiusLimit = camera.upperRadiusLimit = null;
  camera.alpha = alpha; camera.beta = beta; camera.radius = radius;
  camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
  camera.inertialPanningX = camera.inertialPanningY = 0;
  camera.minZ = near; camera.maxZ = far; camera.fov = fov;
  camera.mode = spec.projection==='orthographic'?Camera.ORTHOGRAPHIC_CAMERA:Camera.PERSPECTIVE_CAMERA;
  if(spec.projection==='orthographic'){camera.orthoLeft=spec.left!*scale;camera.orthoRight=spec.right!*scale;camera.orthoTop=spec.top!*scale;camera.orthoBottom=spec.bottom!*scale;} camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
  camera.getViewMatrix(true);
  const placed=camera.position.clone();
  if(spec.up||spec.rollDegrees!==undefined){
    const forward=target.subtract(placed).normalize();
    let up=spec.up?Vector3.FromArray(spec.up):Vector3.Up();
    if(!spec.up){
      const right=camera.getScene().useRightHandedSystem?Vector3.Cross(forward,up).normalize():Vector3.Cross(up,forward).normalize();
      up=camera.getScene().useRightHandedSystem?Vector3.Cross(right,forward).normalize():Vector3.Cross(forward,right).normalize();
      const r=finite(spec.rollDegrees??0,'rollDegrees')*Math.PI/180;up=up.scale(Math.cos(r)).add(right.scale(Math.sin(r)));
    }
    if(up.asArray().some(n=>!Number.isFinite(n))||up.length()<1e-8||Math.abs(Vector3.Dot(up.normalize(),forward))>.999999)throw new Error('invalid camera up vector');
    camera.upVector=up;camera.position.copyFrom(placed);camera.rebuildAnglesAndRadius();
  }
  camera.unfreezeProjectionMatrix();
  if(spec.aspectRatio!==undefined){
    if(!(finite(spec.aspectRatio,'aspectRatio')>0))throw new Error('positive aspectRatio required');
    if(camera.mode===Camera.PERSPECTIVE_CAMERA){const engine=camera.getEngine();const project=camera.getScene().useRightHandedSystem?Matrix.PerspectiveFovRH:Matrix.PerspectiveFovLH;camera.freezeProjectionMatrix(project(fov,spec.aspectRatio,near,far,engine.isNDCHalfZRange,0,engine.useReverseDepthBuffer));}
  }
  camera.getViewMatrix(true); camera.getProjectionMatrix(true);
}
