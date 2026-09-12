import * as ort from './ort/ort.webgpu.min.mjs';
import {prepare,half} from './prepare.js';
ort.env.wasm.numThreads=1;
ort.env.wasm.wasmPaths={mjs:new URL('./ort/ort-wasm-simd-threaded.asyncify.mjs',import.meta.url).href,wasm:new URL('./ort/ort-wasm-simd-threaded.asyncify.wasm',import.meta.url).href};
let session=null,busy=false;
const status=(text,phase='loading')=>postMessage({type:'status',text,phase});
async function modelFile(config,name,size){
 let dir,handle;
 try{dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('still-sharp-'+config.revision,{create:true});handle=await dir.getFileHandle(name,{create:true});const f=await handle.getFile();if(size&&f.size===size){status('正在读取已缓存模型');return new Uint8Array(await f.arrayBuffer());}}catch{}
 const response=await fetch(config.base+name);if(!response.ok)throw Error('模型下载失败，请检查网络后重试');
 const expected=size||Number(response.headers.get('content-length')),reader=response.body.getReader();let loaded=0,last=0,writer;
 if(handle)try{writer=await handle.createWritable();}catch{}
 let data=writer?null:new Uint8Array(expected);
 try{while(true){const {value,done}=await reader.read();if(done)break;if(writer)await writer.write(value);else data.set(value,loaded);loaded+=value.length;if(performance.now()-last>250){status(`下载模型 ${Math.round(loaded/1048576)} / ${Math.round(expected/1048576)} MB`);last=performance.now();}}
 if(loaded!==expected)throw Error('模型下载不完整，请重试');if(writer){await writer.close();return new Uint8Array(await (await handle.getFile()).arrayBuffer());}return data;
 }catch(e){await writer?.abort().catch(()=>{});throw e;}
}
async function load(){
 if(session)return session;
 const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
 if(!adapter?.features.has('shader-f16'))throw Error('这台设备不支持所需的 WebGPU 半精度计算，请使用支持的桌面 Chrome 或 Edge');
 const config=await (await fetch(new URL('./model.json',import.meta.url))).json();
 const graph=await modelFile(config,config.graph,config.graphBytes),weights=await modelFile(config,config.weights,config.weightsBytes);
 status('正在初始化本机 GPU，首次可能需要几分钟');
 session=await ort.InferenceSession.create(graph,{executionProviders:[{name:'webgpu',preferredLayout:'NHWC'}],externalData:[{path:config.weights,data:weights}],graphOptimizationLevel:'all',enableMemPattern:false,enableCpuMemArena:false,executionMode:'sequential',extra:{session:{disable_prepacking:'1',use_device_allocator_for_initializers:'0',use_ort_model_bytes_directly:'1',use_ort_model_bytes_for_initializers:'1'}}});
 return session;
}
self.onmessage=async({data})=>{
 if(busy)return;busy=true;
 try{
 const s=await load();
 status('正在用你的 GPU 重建照片空间','inference');
 const bitmap=await createImageBitmap(data.photo),width=bitmap.width,height=bitmap.height;
 if(width*height>40000000){bitmap.close();throw Error('请选择小于 4000 万像素的照片');}
 const canvas=new OffscreenCanvas(1536,1536),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,1536,1536);ctx.drawImage(bitmap,0,0,1536,1536);bitmap.close();
 const pixels=ctx.getImageData(0,0,1536,1536).data,N=1536*1536,a=new Float32Array(N*3);for(let i=0;i<N;i++)for(let c=0;c<3;c++)a[c*N+i]=pixels[i*4+c]/255;
 const focal=30*Math.hypot(width,height)/Math.hypot(36,24),feeds={};
 for(const [idx,values,dims]of [[0,a,[1,3,1536,1536]],[1,new Float32Array([focal/width]),[1]]]){const type=s.inputMetadata[idx].type;feeds[s.inputNames[idx]]=new ort.Tensor(type,type==='float16'?half(values):values,dims);}
 let outputs;try{outputs=await s.run(feeds);}finally{Object.values(feeds).forEach(t=>t.dispose());}
 status('正在整理粒子、构图和空间层次','packing');
 let buffer;try{buffer=prepare(outputs,width,height,focal);}finally{Object.values(outputs).forEach(t=>t.dispose());}
 postMessage({type:'complete',buffer},[buffer]);
 }catch(e){postMessage({type:'error',text:String(e.message||e)});}finally{busy=false;}
};
