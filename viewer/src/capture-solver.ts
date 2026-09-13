import type { CameraSpec } from './capture-camera';
/** Source pitch→yaw→roll world-to-camera convention, not Euler orbit angles. */
export function convertSolverCamera(input: unknown): CameraSpec {
  const root=input as any, d=root?.referenceCamera??root;
  const p=d?.fit?.cameraParameters??d?.cameraParameters??d;
  const scalar=(v:any)=>typeof v==='object'&&v!==null?v.value:v;
  const orientation=p.orientation??p;
  const yaw=scalar(orientation.yawDegrees),pitch=scalar(orientation.pitchDegrees),roll=scalar(orientation.rollDegrees);
  const position=Array.isArray(p.position)?p.position:p.position?.hint;
  const fov=scalar(p.fovDegrees);
  if(![yaw,pitch,roll,fov,...(position??[])].every(Number.isFinite)||position?.length!==3)throw new Error('solver camera requires finite fitted yaw/pitch/roll, position and FOV');
  const y=yaw*Math.PI/180,t=pitch*Math.PI/180,r=roll*Math.PI/180;
  const cy=Math.cos(y),sy=Math.sin(y),cp=Math.cos(t),sp=Math.sin(t),cr=Math.cos(r),sr=Math.sin(r);
  const forward=[-sy,cy*sp,-cy*cp];
  const up:[number,number,number]=[sr*cy,sr*sy*sp+cr*cp,-sr*sy*cp+cr*sp];
  return {aspectRatio:scalar(d.aspect)??(d.imageWidth&&d.imageHeight?d.imageWidth/d.imageHeight:undefined),coordinateFrame:'source-rh',position:[...position] as [number,number,number],target:position.map((n:number,i:number)=>n+forward[i]) as [number,number,number],up,rollDegrees:roll,projection:'perspective',fovDegrees:fov,near:p.near??.01,far:p.far??100};
}
export function isSolverCamera(value:unknown):boolean {
  const v=value as any;return !!(v?.referenceCamera||v?.fit?.cameraParameters||v?.cameraParameters||v?.orientation||v?.yawDegrees!==undefined);
}
