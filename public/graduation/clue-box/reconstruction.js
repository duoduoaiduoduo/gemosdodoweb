// Independent browser-local SHARP adapter. A photo is never sent to an inference API.
import {preparePhoto} from './gemos-still-base/browser-inference/photo.js';
import {cached as cachedLite, FILES as LITE_FILES} from './gemos-still-base/browser-inference/mobile-model.js';

const INFERENCE = new URL('./gemos-still-base/browser-inference/', import.meta.url);
const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024;
const MAX_METADATA_BYTES = 100000;
const abortError = () => new DOMException('重建已取消。', 'AbortError');
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };
function abortable(promise, signal) {
  checkAbort(signal);
  if (!signal) return promise;
  return new Promise((resolve,reject) => {
    const cancel=()=>{signal.removeEventListener('abort',cancel);reject(abortError());};
    signal.addEventListener('abort',cancel,{once:true});
    Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',cancel);resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(error);});
    if (signal.aborted) cancel();
  });
}
const deadline = async (promise, milliseconds, message) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
};

async function config(signal) {
  checkAbort(signal);
  const response = await fetch(new URL('model.json', INFERENCE), {signal, cache:'no-cache'});
  if (!response.ok) throw Error('无法读取固定版本的重建模型配置。');
  return response.json();
}

async function cachedDesktop(spec) {
  try {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('still-sharp-' + spec.revision);
    for (const [name, bytes] of [[spec.graph, spec.graphBytes], [spec.weights, spec.weightsBytes]]) {
      if ((await (await directory.getFileHandle(name)).getFile()).size !== bytes) return false;
    }
    return true;
  } catch { return false; }
}

function workerTask(mode, payload, {signal, onStatus, onProgress, timeout=0}={}) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    let worker, timer, finished=false;
    const finish = (error, value) => {
      if (finished) return;
      finished=true; clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      worker?.terminate();
      error ? reject(error) : resolve(value);
    };
    const cancel = () => finish(abortError());
    try {
      worker = new Worker(new URL(mode==='desktop' ? 'worker.js' : 'mobile-worker.js', INFERENCE), {type:'module', name:'clue-box-sharp-' + mode});
      signal?.addEventListener('abort', cancel, {once:true});
      if (signal?.aborted) { cancel(); return; }
      worker.onerror = event => finish(Error(event.message || '浏览器重建任务无法启动。请保持页面前台并重试。'));
      worker.onmessageerror = () => finish(Error('浏览器无法读取重建结果。'));
      worker.onmessage = ({data}) => {
        if (data.type==='error') {
          const error=Error(data.text || '重建失败。');
          if (String(data.text).includes('MODEL_DOWNLOAD_CONFIRMATION_REQUIRED')) error.code='MODEL_DOWNLOAD_CONFIRMATION_REQUIRED';
          finish(error); return;
        }
        if (data.type==='complete' || data.type==='probe-ready') { finish(null, data); return; }
        if (data.type==='status') {
          try { onStatus?.(data.text, data); } catch { /* Consumer UI errors must not leak a worker. */ }
          if (Number.isFinite(data.loaded) && Number.isFinite(data.total) && data.total>0) {
            try { onProgress?.({loaded:data.loaded, total:data.total, ratio:Math.max(0, Math.min(1, data.loaded/data.total)), phase:data.phase}); } catch {}
          }
        }
      };
      if (timeout) timer=setTimeout(() => finish(Error('浏览器重建能力检测超时。')), timeout);
      const transfer=payload.prepared?.pixels ? [payload.prepared.pixels.buffer] : [];
      worker.postMessage(payload, transfer);
    } catch (error) { finish(error); }
  });
}

/** Metadata-only inspection: does not fetch ONNX weights or initialize a session. */
export async function probeReconstruction({mode='auto', signal}={}) {
  checkAbort(signal);
  if (!['auto','desktop','lite'].includes(mode)) throw Error('未知的重建模式。');
  let gpu=false, gpuReason='当前浏览器没有可用的 WebGPU 半精度计算。';
  if (mode!=='lite' && globalThis.isSecureContext && globalThis.navigator?.gpu && typeof Worker==='function') {
    try {
      await workerTask('desktop', {type:'probe'}, {signal, timeout:15000}); gpu=true;
    } catch (error) { if (error.name==='AbortError') throw error; gpuReason=error.message; }
  }
  checkAbort(signal);
  const selected=mode==='auto' ? (gpu ? 'desktop' : 'lite') : mode;
  const spec=selected==='desktop' ? await config(signal) : null;
  const modelFiles=selected==='desktop'
    ? [{name:spec.graph,size:spec.graphBytes}, {name:spec.weights,size:spec.weightsBytes}]
    : LITE_FILES.map(({name,size})=>({name,size}));
  const firstDownloadBytes=modelFiles.reduce((sum,file)=>sum+file.size,0);
  let cached=false;
  try { cached=await abortable(deadline(selected==='desktop' ? cachedDesktop(spec) : cachedLite().then(Boolean), 8000, '模型缓存检查超时。'),signal); }
  catch (error) { if (error.name==='AbortError') throw error; /* Lack of a ready cache requires consent to download. */ }
  checkAbort(signal);
  const supported=typeof Worker==='function' && typeof WebAssembly==='object' &&
    (selected==='desktop' ? gpu : !!globalThis.navigator?.storage?.getDirectory);
  return {
    mode:selected, supported, cached, firstDownloadBytes, downloadBytes:cached ? 0 : firstDownloadBytes,
    requiresDownloadConfirmation:!cached, modelFiles,
    ...(!supported ? {reason:selected==='desktop' ? gpuReason : '当前浏览器无法使用本机 CPU 模型缓存。请使用支持 OPFS 的新版浏览器，或导入 Mac / Android 生成的 .still。'} : {}),
    modelRevision:selected==='desktop' ? spec.revision : 'gemos-still-lite256-v1',
  };
}

/** Reject malformed Gaussian output instead of substituting a rendered example. */
export function validateGaussianBuffer(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength<6400 || buffer.byteLength%64 || buffer.byteLength>MAX_ARCHIVE_BYTES) {
    throw Error('空间数据格式不完整：每个高斯粒子必须为 64 字节。');
  }
  const values=new Float32Array(buffer);
  for (let offset=0; offset<values.length; offset+=16) {
    for (let component=0; component<16; component++) if (!Number.isFinite(values[offset+component])) throw Error('空间数据包含无效数值。');
    if (values[offset+3]<0 || values[offset+3]>1 || values[offset+4]<0 || values[offset+7]<0 || values[offset+9]<0) throw Error('高斯粒子的不透明度或协方差无效。');
  }
  return buffer.byteLength/64;
}

/** Requires a separate user consent action before the first large model download. */
export async function reconstructPhoto(photoBlob, {onStatus, onProgress, signal, mode='auto', confirmDownload=false}={}) {
  if (!(photoBlob instanceof Blob) || !photoBlob.size || photoBlob.size>MAX_ARCHIVE_BYTES) throw Error('请选择有效的照片文件。');
  const probe=await probeReconstruction({mode, signal});
  if (!probe.supported) throw Error(probe.reason);
  if (probe.requiresDownloadConfirmation && confirmDownload!==true) {
    const error=Error(`首次需要下载约 ${Math.round(probe.firstDownloadBytes/1000000)} MB 模型，请先确认。照片将在本机处理。`);
    error.code='MODEL_DOWNLOAD_CONFIRMATION_REQUIRED'; error.probe=probe; throw error;
  }
  checkAbort(signal);
  onStatus?.('正在本机读取照片；重建期间请保持页面前台。', {type:'status', phase:'preparing'});
  const prepared=await abortable(preparePhoto(photoBlob, probe.mode==='desktop' ? 1536 : 256),signal);
  checkAbort(signal);
  const result=await workerTask(probe.mode, {type:'reconstruct', prepared, allowDownload:confirmDownload===true}, {signal, onStatus, onProgress});
  checkAbort(signal);
  const gaussianCount=validateGaussianBuffer(result.buffer);
  onStatus?.('已从这张照片生成真实的高斯空间。', {type:'status', phase:'complete'});
  return {buffer:result.buffer, method:probe.mode==='desktop' ? 'sharp-webgpu' : 'sharp-lite-wasm', gaussianCount, hasPhotoUV:true};
}

/** Web, Mac and Android use the same little-endian STLL v1 archive. No IndexedDB writes. */
export async function unpackStill(file) {
  if (!(file instanceof Blob) || file.size<12 || file.size>MAX_ARCHIVE_BYTES) throw Error('记忆文件大小不正确。');
  const data=await file.arrayBuffer(), header=new DataView(data);
  if (header.getUint32(0,true)!==0x4c4c5453 || header.getUint32(4,true)!==1) throw Error('不是有效的 Still v1 记忆文件。');
  const length=header.getUint32(8,true);
  if (!length || length>=MAX_METADATA_BYTES || length+12>=data.byteLength) throw Error('记忆文件元数据损坏。');
  let metadata;
  try { metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data.slice(12,12+length))); }
  catch { throw Error('记忆文件元数据无法读取。'); }
  if (!metadata || typeof metadata!=='object' || Array.isArray(metadata) || !Number.isSafeInteger(metadata.photoBytes) || metadata.photoBytes<1 || !Number.isSafeInteger(metadata.modelBytes) || metadata.modelBytes<6400 || metadata.modelBytes%64 || 12+length+metadata.photoBytes+metadata.modelBytes!==data.byteLength) throw Error('记忆文件内容不完整。');
  const modelStart=12+length+metadata.photoBytes, buffer=data.slice(modelStart);
  const gaussianCount=validateGaussianBuffer(buffer);
  const photoType=['image/jpeg','image/png','image/webp','image/avif'].includes(metadata.photoType) ? metadata.photoType : 'image/jpeg';
  return {photo:new Blob([data.slice(12+length,modelStart)],{type:photoType}), buffer, model:buffer, gaussianCount, hasPhotoUV:metadata.hasPhotoUV===true, method:'still-import', metadata, name:String(metadata.name || '一段记忆').slice(0,60), settings:metadata.settings || {}};
}

export function packStill({photo, buffer, model, metadata={}, name='照片里的隐形线索', settings, method, hasPhotoUV}) {
  buffer=buffer || model;
  validateGaussianBuffer(buffer);
  if (!(photo instanceof Blob) || !photo.size) throw Error('记忆文件需要原始照片。');
  const json=new TextEncoder().encode(JSON.stringify({...metadata, name, ...(settings!==undefined ? {settings} : {}), ...(method ? {method} : {}), hasPhotoUV:hasPhotoUV===undefined ? metadata.hasPhotoUV===true : hasPhotoUV===true, photoType:photo.type || 'image/jpeg', photoBytes:photo.size, modelBytes:buffer.byteLength}));
  if (!json.length || json.length>=MAX_METADATA_BYTES || 12+json.length+photo.size+buffer.byteLength>MAX_ARCHIVE_BYTES) throw Error('记忆文件超出格式容量。');
  const header=new ArrayBuffer(12), view=new DataView(header);
  view.setUint32(0,0x4c4c5453,true); view.setUint32(4,1,true); view.setUint32(8,json.length,true);
  return new Blob([header,json,photo,buffer],{type:'application/octet-stream'});
}
