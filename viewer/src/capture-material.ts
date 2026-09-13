import { BaseTexture, PBRMaterial } from '@babylonjs/core';
/** Runtime-worker integration seam. Metadata values are live textures, never serialized pixels. */
export interface CaptureRoughnessBinding { texture:BaseTexture; channel:'r'|'g'|'b'|'a'; operation:'multiply-roughness'|'multiply-glossiness' }
export function resolveCaptureRoughness(material:PBRMaterial):CaptureRoughnessBinding[] {
  const explicit=material.metadata?.captureRoughness as CaptureRoughnessBinding|CaptureRoughnessBinding[]|undefined;
  if(explicit){const bindings=Array.isArray(explicit)?explicit:[explicit];for(const b of bindings)if(!(b.texture instanceof BaseTexture)||!['r','g','b','a'].includes(b.channel)||!['multiply-roughness','multiply-glossiness'].includes(b.operation))throw new Error('invalid captureRoughness binding');return bindings;}
  const result:CaptureRoughnessBinding[]=[];
  const plugin=material.pluginManager?.getPlugin('IndependentPbrMaps') as unknown as {rough?:BaseTexture}|null;
  if(plugin?.rough)result.push({texture:plugin.rough,channel:'g',operation:'multiply-roughness'});
  const metallic=material.isMetallicWorkflow();
  if(material.metallicTexture&&(material.useRoughnessFromMetallicTextureAlpha||material.useRoughnessFromMetallicTextureGreen))result.push({texture:material.metallicTexture,channel:material.useRoughnessFromMetallicTextureAlpha?'a':'g',operation:'multiply-roughness'});
  if(material.microSurfaceTexture)result.push({texture:material.microSurfaceTexture,channel:'r',operation:metallic?'multiply-roughness':'multiply-glossiness'});
  else if(!metallic&&material.reflectivityTexture&&material.useMicroSurfaceFromReflectivityMapAlpha)result.push({texture:material.reflectivityTexture,channel:'a',operation:'multiply-glossiness'});
  return result;
}
/** CPU channel evaluator for testing the exact scalar arithmetic emitted in diagnostic GLSL. */
export function evaluateCaptureRoughness(scalar:number,bindings:CaptureRoughnessBinding[],samples:Array<[number,number,number,number]>):number {
  if(samples.length!==bindings.length)throw new Error('roughness sample count mismatch');
  return bindings.reduce((rough,b,i)=>{const value=samples[i]['rgba'.indexOf(b.channel)];return b.operation==='multiply-roughness'?rough*value:1-(1-rough)*value;},scalar);
}
