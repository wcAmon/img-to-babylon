/** Generated GLB triangle with skin and morph. No network or external assets. */
export function tinyCaptureGLB(): Uint8Array {
  const chunks:Uint8Array[]=[],views:object[]=[],accessors:object[]=[];let size=0;
  function add(data:Float32Array|Uint16Array,type:string,count:number,min?:number[],max?:number[]){
    while(size%4){chunks.push(new Uint8Array(1));size++;}
    const bytes=new Uint8Array(data.buffer);views.push({buffer:0,byteOffset:size,byteLength:bytes.length});chunks.push(bytes);size+=bytes.length;
    accessors.push({bufferView:views.length-1,componentType:data instanceof Float32Array?5126:5123,type,count,...(min?{min,max}:{})});return accessors.length-1;
  }
  const POSITION=add(new Float32Array([0,0,0,1,0,0,0,1,0]),'VEC3',3,[0,0,0],[1,1,0]);
  const NORMAL=add(new Float32Array([0,0,1,0,0,1,0,0,1]),'VEC3',3),JOINTS_0=add(new Uint16Array(12),'VEC4',3),WEIGHTS_0=add(new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0]),'VEC4',3);
  const indices=add(new Uint16Array([0,1,2]),'SCALAR',3),morph=add(new Float32Array([0,.2,0,0,.2,0,0,.2,0]),'VEC3',3),inverseBindMatrices=add(new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),'MAT4',1);
  while(size%4){chunks.push(new Uint8Array(1));size++;}
  const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],nodes:[{name:'Triangle',mesh:0,skin:0,extras:{capture:{regionId:'body',idColor:[255,0,0],materialId:1}}},{name:'Joint',translation:[.3,0,0]}],skins:[{joints:[1],inverseBindMatrices}],meshes:[{weights:[.5],primitives:[{attributes:{POSITION,NORMAL,JOINTS_0,WEIGHTS_0},indices,material:0,targets:[{POSITION:morph}]}]}],materials:[{name:'fixture-material',pbrMetallicRoughness:{baseColorFactor:[.4,.2,.1,1],roughnessFactor:.35,metallicFactor:0}}],buffers:[{byteLength:size}],bufferViews:views,accessors};
  const text=new TextEncoder().encode(JSON.stringify(doc)),json=new Uint8Array(Math.ceil(text.length/4)*4).fill(32);json.set(text);
  const result=new Uint8Array(28+json.length+size),v=new DataView(result.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,result.length,true);v.setUint32(12,json.length,true);v.setUint32(16,0x4e4f534a,true);result.set(json,20);
  let offset=20+json.length;v.setUint32(offset,size,true);v.setUint32(offset+4,0x004e4942,true);offset+=8;for(const c of chunks){result.set(c,offset);offset+=c.length;}return result;
}
