// Native glTF 2.0 skinning. The anatomical mesh, UV maps and bone weights are
// static GPU resources; only the small joint palette changes during skating.
import { getSkateboardMesh } from './skater.js?v=flower-ratio-v17';
import { createSkaterMotion } from './skater-motion.js?v=flower-ratio-v17';

export const RIDER_VERTEX_STRIDE = 80;
const IDENTITY = () => new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const mul4 = (a,b) => {
  const c=new Float32Array(16);
  for(let col=0;col<4;col++)for(let row=0;row<4;row++)
    c[col*4+row]=a[row]*b[col*4]+a[4+row]*b[col*4+1]+a[8+row]*b[col*4+2]+a[12+row]*b[col*4+3];
  return c;
};
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub = (a,b) => a.map((x,i)=>x-b[i]);
const unit = a => {const n=Math.hypot(...a)||1;return a.map(x=>x/n);};
function quaternionMatrix(q,translation=[0,0,0],scale=[1,1,1]) {
  const [x,y,z,w]=q, xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z;
  return new Float32Array([(1-2*(yy+zz))*scale[0],2*(xy+wz)*scale[0],2*(xz-wy)*scale[0],0,
    2*(xy-wz)*scale[1],(1-2*(xx+zz))*scale[1],2*(yz+wx)*scale[1],0,
    2*(xz+wy)*scale[2],2*(yz-wx)*scale[2],(1-2*(xx+yy))*scale[2],0,...translation,1]);
}
function multiplyQuaternion(a,b) {
  return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
}
function boneDeformation(rest,pose) {
  const from=unit(sub(rest.tail,rest.head)),to=unit(sub(pose.tail,pose.head));
  const cosine=Math.max(-1,Math.min(1,dot(from,to)));
  let q;
  if(cosine<-.99999){const a=unit(cross(from,Math.abs(from[0])<.8?[1,0,0]:[0,1,0]));q=[...a,0];}
  else {const a=cross(from,to),n=Math.hypot(...a,1+cosine)||1;q=[a[0]/n,a[1]/n,a[2]/n,(1+cosine)/n];}
  if(pose.twist){const h=pose.twist*.5,s=Math.sin(h);q=multiplyQuaternion([to[0]*s,to[1]*s,to[2]*s,Math.cos(h)],q);}
  const m=quaternionMatrix(q);
  for(let row=0;row<3;row++)m[12+row]=pose.head[row]-(m[row]*rest.head[0]+m[4+row]*rest.head[1]+m[8+row]*rest.head[2]);
  return m;
}

export function parseCharacterGLB(bytes) {
  const view=new DataView(bytes);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2)throw new Error('男孩模型不是 glTF 2.0');
  let offset=12,gltf,bin;
  while(offset<bytes.byteLength){const size=view.getUint32(offset,true),kind=view.getUint32(offset+4,true);offset+=8;
    if(kind===0x4e4f534a)gltf=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,offset,size)));
    if(kind===0x004e4942)bin=new Uint8Array(bytes,offset,size);offset+=size;}
  if(!gltf||!bin)throw new Error('男孩模型缺少内嵌网格数据');
  if(gltf.extensionsRequired?.some(x=>x==='KHR_draco_mesh_compression'||x==='EXT_meshopt_compression'))throw new Error('人物网格需要未提供的压缩解码器');
  const types={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
  const widths={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
  const methods={5120:'getInt8',5121:'getUint8',5122:'getInt16',5123:'getUint16',5125:'getUint32',5126:'getFloat32'};
  const decoded=new Map();
  function accessor(index){
    if(decoded.has(index))return decoded.get(index);
    const a=gltf.accessors[index],size=types[a.type],result=new Float32Array(a.count*size);
    if(a.bufferView!==undefined){const b=gltf.bufferViews[a.bufferView],width=widths[a.componentType],stride=b.byteStride||size*width;
      const source=new DataView(bin.buffer,bin.byteOffset+(b.byteOffset||0)+(a.byteOffset||0));
      for(let i=0;i<a.count;i++)for(let j=0;j<size;j++){
        let x=source[methods[a.componentType]](i*stride+j*width,true);
        if(a.normalized){if(a.componentType===5121)x/=255;if(a.componentType===5123)x/=65535;if(a.componentType===5120)x=Math.max(-1,x/127);if(a.componentType===5122)x=Math.max(-1,x/32767);}
        result[i*size+j]=x;
      }
    }
    if(a.sparse)throw new Error('人物稀疏属性尚未展开');
    decoded.set(index,result);return result;
  }
  const parents=new Map();gltf.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
  const worlds=new Map();
  function nodeWorld(index){
    if(worlds.has(index))return worlds.get(index);
    const n=gltf.nodes[index],local=n.matrix?new Float32Array(n.matrix):quaternionMatrix(n.rotation||[0,0,0,1],n.translation||[0,0,0],n.scale||[1,1,1]);
    const world=parents.has(index)?mul4(nodeWorld(parents.get(index)),local):local;worlds.set(index,world);return world;
  }
  return {gltf,bin,accessor,nodeWorld};
}

function classifyMaterial(material) {
  const name=(material.name||'').toLowerCase();
  if(/brow|lash|hair/.test(name))return 2;
  if(/skin|body|head|eye|teeth|tongue|low-poly/.test(name))return 1;
  if(/metal/.test(name))return 4;
  if(/shoe|canvas/.test(name))return 3;
  return 0;
}

async function textureArray(device,parsed) {
  const {gltf,bin}=parsed,images=gltf.images||[],side=1024,layers=Math.max(1,images.length),levels=11;
  const texture=device.createTexture({label:'Boy real skin and woven cloth UV maps',size:[side,side,layers],format:'rgba8unorm-srgb',mipLevelCount:levels,
    usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  const bitmaps=await Promise.all(images.map(async img=>{
    if(img.bufferView===undefined)throw new Error('人物贴图必须内嵌在 GLB 中');
    const b=gltf.bufferViews[img.bufferView];return createImageBitmap(new Blob([bin.subarray(b.byteOffset||0,(b.byteOffset||0)+b.byteLength)],{type:img.mimeType}),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  }));
  const canvas=new OffscreenCanvas(side,side),ctx=canvas.getContext('2d');
  if(!images.length){ctx.fillStyle='#fff';ctx.fillRect(0,0,side,side);device.queue.copyExternalImageToTexture({source:canvas},{texture},[side,side]);}
  for(let i=0;i<bitmaps.length;i++){ctx.clearRect(0,0,side,side);ctx.drawImage(bitmaps[i],0,0,side,side);device.queue.copyExternalImageToTexture({source:canvas},{texture,origin:[0,0,i]},[side,side]);bitmaps[i].close();}
  const sampler=device.createSampler({minFilter:'linear',magFilter:'linear',mipmapFilter:'linear',addressModeU:'repeat',addressModeV:'repeat',maxAnisotropy:4});
  const code=`@group(0) @binding(0) var source:texture_2d<f32>;
@group(0) @binding(1) var filtering:sampler;
struct Out{@builtin(position) p:vec4f,@location(0) uv:vec2f};
@vertex fn vertex(@builtin(vertex_index) i:u32)->Out{let p=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.))[i];var o:Out;o.p=vec4f(p,0.,1.);o.uv=vec2f(p.x*.5+.5,.5-p.y*.5);return o;}
@fragment fn fragment(i:Out)->@location(0) vec4f{return textureSampleLevel(source,filtering,i.uv,0.);}`;
  const module=device.createShaderModule({label:'Linear light character texture mipmaps',code});
  const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vertex'},fragment:{module,entryPoint:'fragment',targets:[{format:'rgba8unorm-srgb'}]}});
  const encoder=device.createCommandEncoder();
  for(let layer=0;layer<layers;layer++)for(let level=1;level<levels;level++){
    const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:texture.createView({dimension:'2d',baseArrayLayer:layer,arrayLayerCount:1,baseMipLevel:level-1,mipLevelCount:1})},{binding:1,resource:sampler}]});
    const pass=encoder.beginRenderPass({colorAttachments:[{view:texture.createView({dimension:'2d',baseArrayLayer:layer,arrayLayerCount:1,baseMipLevel:level,mipLevelCount:1}),loadOp:'clear',storeOp:'store'}]});
    pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();
  }
  device.queue.submit([encoder.finish()]);
  return {texture,sampler,layers};
}

export async function createSkaterModel(device) {
  const base=new URL('./assets/character/',import.meta.url);
  const responses=await Promise.all([fetch(new URL('reference-boy.glb?v=flower-ratio-v17',base)),fetch(new URL('reference-boy-rest.json?v=flower-ratio-v17',base))]);
  if(responses.some(r=>!r.ok))throw new Error('男孩网格或骨骼文件加载失败');
  const [bytes,rest]=await Promise.all([responses[0].arrayBuffer(),responses[1].json()]);
  const parsed=parseCharacterGLB(bytes),{gltf,accessor,nodeWorld}=parsed;
  const motion=createSkaterMotion(rest.joints),restByName=new Map(rest.joints.map(j=>[j.name,j]));
  const palette=[{fixed:IDENTITY()}],skinBases=new Map();
  for(let s=0;s<(gltf.skins||[]).length;s++){
    const skin=gltf.skins[s],bind=accessor(skin.inverseBindMatrices);skinBases.set(s,palette.length);
    skin.joints.forEach((node,i)=>palette.push({name:gltf.nodes[node].name,bindWorld:nodeWorld(node),inverseBind:bind.subarray(i*16,i*16+16)}));
  }
  const records=[];let vertexCount=0,indexCount=0;
  gltf.nodes.forEach((node,nodeIndex)=>{
    if(node.mesh===undefined)return;
    let skinBase=skinBases.get(node.skin);
    if(skinBase===undefined){skinBase=palette.length;palette.push({fixed:nodeWorld(nodeIndex)});}
    for(const primitive of gltf.meshes[node.mesh].primitives){
      if(primitive.mode!==undefined&&primitive.mode!==4)continue;
      const a=primitive.attributes,count=gltf.accessors[a.POSITION].count,material=gltf.materials?.[primitive.material]||{};
      const pbr=material.pbrMetallicRoughness||{},texture=pbr.baseColorTexture?.index;
      records.push({base:vertexCount,count,positions:accessor(a.POSITION),normals:accessor(a.NORMAL),uv:a.TEXCOORD_0!==undefined?accessor(a.TEXCOORD_0):null,
        joints:a.JOINTS_0!==undefined?accessor(a.JOINTS_0):null,weights:a.WEIGHTS_0!==undefined?accessor(a.WEIGHTS_0):null,
        colors:a.COLOR_0!==undefined?accessor(a.COLOR_0):null,colorSize:a.COLOR_0!==undefined?gltf.accessors[a.COLOR_0].type==='VEC4'?4:3:0,
        indices:primitive.indices!==undefined?accessor(primitive.indices):Float32Array.from({length:count},(_,i)=>i),skinBase,
        factor:pbr.baseColorFactor||[1,1,1,1],textureIndex:texture===undefined?-1:gltf.textures[texture].source,
        roughness:pbr.roughnessFactor??-1,material:classifyMaterial(material)});
      vertexCount+=count;indexCount+=records.at(-1).indices.length;
    }
  });
  const board=getSkateboardMesh(),boardCount=board.length/10,boardBase=vertexCount;
  vertexCount+=boardCount;indexCount+=boardCount;
  const vertexData=new ArrayBuffer(vertexCount*RIDER_VERTEX_STRIDE),data=new DataView(vertexData),indices=new Uint32Array(indexCount);
  let indexCursor=0;
  const put=(i,position,normal,color,material,uv,tex,rough,joints,weights)=>{
    const o=i*80;[...position,...normal,...color,material,...uv,tex,rough].forEach((v,k)=>data.setFloat32(o+k*4,v,true));
    for(let j=0;j<4;j++){data.setUint16(o+56+j*2,joints[j],true);data.setFloat32(o+64+j*4,weights[j],true);}
  };
  for(const r of records){
    for(let i=0;i<r.count;i++){
      const w=r.weights?Array.from(r.weights.subarray(i*4,i*4+4)):[1,0,0,0],sum=w.reduce((a,b)=>a+b,0)||1;
      const joints=r.joints?Array.from(r.joints.subarray(i*4,i*4+4),x=>r.skinBase+x):[r.skinBase,0,0,0];
      const rgb=r.factor.slice(0,3).map((x,k)=>x*(r.colors?r.colors[i*r.colorSize+k]:1));
      put(r.base+i,r.positions.subarray(i*3,i*3+3),r.normals.subarray(i*3,i*3+3),rgb,r.material,r.uv?r.uv.subarray(i*2,i*2+2):[0,0],r.textureIndex,r.roughness,joints,w.map(x=>x/sum));
    }
    for(const i of r.indices)indices[indexCursor++]=r.base+i;
  }
  for(let i=0;i<boardCount;i++){
    const s=i*10;put(boardBase+i,board.subarray(s,s+3),board.subarray(s+3,s+6),board.subarray(s+6,s+9),board[s+9]===3?4:3,[board[s]*3,board[s+2]*3],-1,board[s+9]===3?.30:.76,[0,0,0,0],[1,0,0,0]);
    indices[indexCursor++]=boardBase+i;
  }
  const vertices=device.createBuffer({label:'Indexed anatomical boy and maple skateboard',size:vertexData.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
  const indexBuffer=device.createBuffer({label:'Boy triangle topology',size:indices.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});
  const jointBuffer=device.createBuffer({label:'Skateboard articulated joint palette',size:palette.length*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(vertices,0,vertexData);device.queue.writeBuffer(indexBuffer,0,indices);
  const atlas=await textureArray(device,parsed),jointData=new Float32Array(palette.length*16);
  function update(state){
    const pose=motion.sample({time:state.elapsed||0,push:state.push||0,lean:state.lean||0,jump:state.jump||0,speed:state.speed||0,slope:state.bank||0,
      scale:state.scale||.30,distance:state.distance||0,pushTravel:state.pushTravel||0,acceleration:state.acceleration||0,contactLocal:state.contactLocal});
    const scale=state.scale||.30,right=state.right||[1,0,0],up=state.up||[0,1,0],forward=state.forward||[0,0,1],p=state.position||[0,0,0];
    const actor=new Float32Array([...right.map(x=>x*scale),0,...up.map(x=>x*scale),0,...forward.map(x=>x*scale),0,...p,1]);
    const deformations=new Map();
    const deformation=name=>{
      if(deformations.has(name))return deformations.get(name);
      const bind=restByName.get(name),target=pose.bones[name];
      const d=bind&&target?boneDeformation(bind,target):bind?.parentName?deformation(bind.parentName):IDENTITY();deformations.set(name,d);return d;
    };
    palette.forEach((joint,i)=>{
      const local=joint.fixed||mul4(mul4(deformation(joint.name),joint.bindWorld),joint.inverseBind);
      jointData.set(mul4(actor,local),i*16);
    });
    device.queue.writeBuffer(jointBuffer,0,jointData);return pose.metrics;
  }
  update({scale:.30});
  return {vertices,indexBuffer,jointBuffer,indexCount,vertexCount,boneCount:palette.length,texture:atlas.texture,sampler:atlas.sampler,update,samplePose:options=>motion.sample(options),
    destroy(){vertices.destroy();indexBuffer.destroy();jointBuffer.destroy();atlas.texture.destroy();}};
}
