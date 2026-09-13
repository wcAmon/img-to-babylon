/*
Ported verbatim GLSL from Three.js 0.183.2 ShaderChunk tonemapping_pars_fragment
and colorspace_pars_fragment. Runtime has no Three.js dependency.
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
import { ArcRotateCamera, Constants, PostProcess, ShaderStore, Texture } from '@babylonjs/core';
export const SOURCE_TONE_GLSL = `
#ifndef saturate
// <common> may have defined saturate() already
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif

uniform float toneMappingExposure;

// exposure only
vec3 LinearToneMapping( vec3 color ) {

	return saturate( toneMappingExposure * color );

}

// source: https://www.cs.utah.edu/docs/techreports/2002/pdf/UUCS-02-001.pdf
vec3 ReinhardToneMapping( vec3 color ) {

	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );

}

// source: http://filmicworlds.com/blog/filmic-tonemapping-operators/
vec3 CineonToneMapping( vec3 color ) {

	// filmic operator by Jim Hejl and Richard Burgess-Dawson
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );

}

// source: https://github.com/selfshadow/ltc_code/blob/master/webgl/shaders/ltc/ltc_blit.fs
vec3 RRTAndODTFit( vec3 v ) {

	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;

}

// this implementation of ACES is modified to accommodate a brighter viewing environment.
// the scale factor of 1/0.6 is subjective. see discussion in #19621.

vec3 ACESFilmicToneMapping( vec3 color ) {

	// sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ), // transposed from source
		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);

	// ODT_SAT => XYZ => D60_2_D65 => sRGB
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ), // transposed from source
		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);

	color *= toneMappingExposure / 0.6;

	color = ACESInputMat * color;

	// Apply RRT and ODT
	color = RRTAndODTFit( color );

	color = ACESOutputMat * color;

	// Clamp to [0, 1]
	return saturate( color );

}

// Matrices for rec 2020 <> rec 709 color space conversion
// matrix provided in row-major order so it has been transposed
// https://www.itu.int/pub/R-REP-BT.2407-2017
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);

const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);

// https://iolite-engine.com/blog_posts/minimal_agx_implementation
// Mean error^2: 3.6705141e-06
vec3 agxDefaultContrastApprox( vec3 x ) {

	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;

	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;

}

// AgX Tone Mapping implementation based on Filament, which in turn is based
// on Blender's implementation using rec 2020 primaries
// https://github.com/google/filament/pull/7236
// Inputs and outputs are encoded as Linear-sRGB.

vec3 AgXToneMapping( vec3 color ) {

	// AgX constants
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);

	// explicit AgXOutsetMatrix generated from Filaments AgXOutsetMatrixInv
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);

	// LOG2_MIN      = -10.0
	// LOG2_MAX      =  +6.5
	// MIDDLE_GRAY   =  0.18
	const float AgxMinEv = - 12.47393;  // log2( pow( 2, LOG2_MIN ) * MIDDLE_GRAY )
	const float AgxMaxEv = 4.026069;    // log2( pow( 2, LOG2_MAX ) * MIDDLE_GRAY )

	color *= toneMappingExposure;

	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;

	color = AgXInsetMatrix * color;

	// Log2 encoding
	color = max( color, 1e-10 ); // avoid 0 or negative numbers for log2
	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );

	color = clamp( color, 0.0, 1.0 );

	// Apply sigmoid
	color = agxDefaultContrastApprox( color );

	// Apply AgX look
	// v = agxLook(v, look);

	color = AgXOutsetMatrix * color;

	// Linearize
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );

	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;

	// Gamut mapping. Simple clamp for now.
	color = clamp( color, 0.0, 1.0 );

	return color;

}

// https://modelviewer.dev/examples/tone-mapping

vec3 NeutralToneMapping( vec3 color ) {

	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;

	color *= toneMappingExposure;

	float x = min( color.r, min( color.g, color.b ) );

	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;

	color -= offset;

	float peak = max( color.r, max( color.g, color.b ) );

	if ( peak < StartCompression ) return color;

	float d = 1. - StartCompression;

	float newPeak = 1. - d * d / ( peak + d - StartCompression );

	color *= newPeak / peak;

	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );

	return mix( color, vec3( newPeak ), g );

}

vec3 CustomToneMapping( vec3 color ) { return color; }
`;
export const SOURCE_COLOR_GLSL = `

vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}

vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}

vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}

`;
export function createSourceToneProcess(camera:ArcRotateCamera, mode:string, exposure:number, background:RGBA=[0,0,0,0]):PostProcess {
  const functionName:Record<string,string>={AgXToneMapping:'AgXToneMapping',ACESFilmicToneMapping:'ACESFilmicToneMapping',NeutralToneMapping:'NeutralToneMapping',NoToneMapping:'CustomToneMapping'};
  if(!functionName[mode])throw new Error('unsupported source tone mapping');
  const key='img2babylonSourceTone183'+mode;
  ShaderStore.ShadersStore[key+'PixelShader']=SOURCE_TONE_GLSL+SOURCE_COLOR_GLSL+`
    varying vec2 vUV; uniform sampler2D textureSampler; uniform vec4 sourceBackground;
    void main(){
      vec4 pixel=texture2D(textureSampler,vUV);
      float coverage=clamp(pixel.a,0.,1.);
      if(coverage<=0.){gl_FragColor=sourceBackground;return;}
      vec3 straightLinear=pixel.rgb/coverage;
      vec3 mapped=sRGBTransferOETF(vec4(${functionName[mode]}(straightLinear),1.)).rgb;
      float backgroundWeight=sourceBackground.a*(1.-coverage);
      float outAlpha=coverage+backgroundWeight;
      gl_FragColor=vec4((mapped*coverage+sourceBackground.rgb*backgroundWeight)/max(outAlpha,1.e-10),outAlpha);
    }`;
  // Floating-point intermediate retains HDR radiance; byte targets would clip before AgX.
  const pp=new PostProcess(key,key,['toneMappingExposure','sourceBackground'],null,1,camera,Texture.BILINEAR_SAMPLINGMODE,camera.getEngine(),false,null,Constants.TEXTURETYPE_HALF_FLOAT);
  pp.onApply=effect=>{effect.setFloat('toneMappingExposure',exposure);effect.setFloat4('sourceBackground',...background);};
  return pp;
}
type RGB=[number,number,number];
const mul=(m:number[],v:RGB):RGB=>[0,1,2].map(r=>m[r]*v[0]+m[3+r]*v[1]+m[6+r]*v[2]) as RGB;
const clamp=(x:number)=>Math.min(1,Math.max(0,x));
/** CPU companion for numerical oracle tests; returns Linear-sRGB, before output transfer. */
export function agxLinear(rgb:RGB,exposure=1):RGB {
  let c=mul([.6274,.0691,.0164,.3293,.9195,.0880,.0433,.0113,.8956],rgb.map(x=>x*exposure) as RGB);
  c=mul([.856627153315983,.137318972929847,.11189821299995,.0951212405381588,.761241990602591,.0767994186031903,.0482516061458583,.101439036467562,.811302368396859],c);
  c=c.map(v=>{const x=clamp((Math.log2(Math.max(v,1e-10))+12.47393)/(4.026069+12.47393));const x2=x*x,x4=x2*x2;return 15.5*x4*x2-40.14*x4*x+31.96*x4-6.868*x2*x+.4298*x2+.1191*x-.00232;}) as RGB;
  c=mul([1.1271005818144368,-.1413297634984383,-.14132976349843826,-.11060664309660323,1.157823702216272,-.11060664309660294,-.016493938717834573,-.016493938717834257,1.2519364065950405],c).map(x=>Math.max(0,x)**2.2) as RGB;
  return mul([1.6605,-.1246,-.0182,-.5876,1.1329,-.1006,-.0728,-.0083,1.1187],c).map(clamp) as RGB;
}
/** CPU companion for the pinned source ACES/Neutral operators, in Linear-sRGB. */
export function sourceToneLinear(mode:string,rgb:RGB,exposure=1):RGB {
  if(mode==='AgXToneMapping')return agxLinear(rgb,exposure);
  if(mode==='NoToneMapping')return [...rgb];
  if(mode==='ACESFilmicToneMapping'){
    let c=mul([.59719,.076,.0284,.35458,.90834,.13383,.04823,.01566,.83777],rgb.map(x=>x*exposure/.6) as RGB);
    c=c.map(x=>(x*(x+.0245786)-.000090537)/(x*(.983729*x+.432951)+.238081)) as RGB;
    return mul([1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602],c).map(clamp) as RGB;
  }
  if(mode==='NeutralToneMapping'){
    let c=rgb.map(x=>x*exposure) as RGB;
    const x=Math.min(...c),offset=x<.08?x-6.25*x*x:.04;c=c.map(x=>x-offset) as RGB;
    const peak=Math.max(...c),start=.8-.04;if(peak<start)return c;
    const d=1-start,newPeak=1-d*d/(peak+d-start);c=c.map(x=>x*newPeak/peak) as RGB;
    const g=1-1/(.15*(peak-newPeak)+1);return c.map(x=>x*(1-g)+newPeak*g) as RGB;
  }
  throw new Error('unknown source tone operator');
}

export type RGBA=[number,number,number,number];
/** Same source output transfer and straight-alpha compositor used by the postprocess. */
export function composeSourceTonePixel(pixel:RGBA,background:RGBA,mode:string,exposure:number):RGBA {
  const a=clamp(pixel[3]);if(a===0)return [...background];
  const mapped=sourceToneLinear(mode,pixel.slice(0,3).map(x=>x/a) as RGB,exposure).map(x=>x<=.0031308?x*12.92:Math.pow(x,.41666)*1.055-.055);
  const weight=background[3]*(1-a),outA=a+weight;
  return [...mapped.map((x,i)=>(x*a+background[i]*weight)/outA),outA] as RGBA;
}
