import {memoryBox} from './main.js?v=idle-20260913-4';
const ease=t=>t*t*(3-2*t);
export function filmView(t){
 const keys=[[0,.56,.28,.92,0,29],[2.4,.56,.28,.92,0,29],[5.95,.28,.19,1.12,-.18,34],[8,.05,.14,1.25,-.2,38],[10,.02,.12,1.48,-.08,42],[13.2,.18,.16,1.42,.5,42],[18,.85,.24,1.05,.08,32],[22,.56,.28,.94,0,29],[26,.56,.28,.94,0,29]];
 const i=Math.min(keys.length-2,Math.max(0,keys.findIndex((k,n)=>n<keys.length-1&&t<=keys[n+1][0]))),a=keys[i],b=keys[i+1],u=ease(Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0]))));
 return Object.fromEntries(['azimuth','elevation','zoom','lift','fov'].map((n,j)=>[n,a[j+1]+(b[j+1]-a[j+1])*u]));
}
const button=document.createElement('button');button.textContent='制作展示影片 ↗';button.id='make-film';document.getElementById('memory-actions').append(button);
const dialog=document.createElement('dialog');dialog.className='local-generation';dialog.innerHTML=`<button id="film-close" class="dialog-close" aria-label="关闭影片制作">×</button><p class="eyebrow">GEMOS STILL / MOTION</p><h2>让记忆，成为影片。</h2><p>26 秒故事运镜 · 风景卡入仓、粒子漩涡、记忆由下而上显现、环绕收尾。完整显现后，片名与品牌才缓缓出现。</p><label>画幅 <select id="film-format"><option value="wide">横屏 16:9</option><option value="portrait">竖屏 9:16</option></select></label><p id="film-status" role="status">在本机渲染，无需上传。录制期间请保持页面在前台。</p><canvas id="film-canvas" hidden style="width:100%;max-height:45vh;object-fit:contain"></canvas><video id="film-video" controls playsinline hidden style="width:100%;max-height:45vh"></video><button id="film-start" class="primary">生成展示影片</button><a id="film-save" hidden class="primary">保存视频 ↓</a><button id="film-cancel" hidden>取消渲染</button>`;document.body.append(dialog);
const $=id=>document.getElementById(id);let running=false,cancel=null,videoURL=null;
button.onclick=()=>dialog.showModal();
function close(){if(running){cancel?.();return;}dialog.close();$('film-video').pause();}
$('film-close').onclick=close;dialog.addEventListener('cancel',e=>{if(running){e.preventDefault();cancel?.();}});$('film-cancel').onclick=()=>cancel?.();
$('film-start').onclick=async()=>{
 let recorder,stream,raf,timer,rejectRun,aborted=false;
 const hidden=()=>{if(document.hidden)cancel?.();};
 try{
 if(!globalThis.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)throw Error('这个浏览器不支持视频导出，请换用支持录制的浏览器。');
 const mime=['video/mp4;codecs=avc1.42001E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('浏览器没有可用的视频编码器');
 const small=matchMedia('(pointer:coarse)').matches,portrait=$('film-format').value==='portrait',w=portrait?720:small?1280:1920,h=portrait?1280:small?720:1080;
 const canvas=$('film-canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false});
 await memoryBox.beginFilm(w,h);running=true;$('film-start').disabled=true;$('film-format').disabled=true;$('film-cancel').hidden=false;$('film-save').hidden=true;$('film-video').hidden=true;canvas.hidden=false;
 if(videoURL){URL.revokeObjectURL(videoURL);videoURL=null;}
 const title=($('memory-name').textContent||'一刻记忆').slice(0,45),chunks=[];
 function draw(t){ctx.drawImage(memoryBox.filmFrame(filmView(t),t),0,0,w,h);const pad=w*.055;ctx.save();ctx.globalAlpha=ease(Math.max(0,Math.min(1,(t-22)/2)));const gradient=ctx.createLinearGradient(0,h*.72,0,h);gradient.addColorStop(0,'#0000');gradient.addColorStop(1,'#000b');ctx.fillStyle=gradient;ctx.fillRect(0,h*.72,w,h*.28);ctx.fillStyle='#f5f3e7';ctx.font=`500 ${w*.028}px sans-serif`;let label=title;while(ctx.measureText(label).width>w*.78)label=label.slice(0,-2)+'…';ctx.fillText(label,pad,h-pad-w*.032);ctx.font=`${w*.014}px sans-serif`;ctx.fillStyle='#c9cbbd';ctx.fillText('GEMOS STILL  /  A MOMENT, KEPT.',pad,h-pad);ctx.restore();}
 draw(0);stream=canvas.captureStream(30);recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:small?6000000:12000000});
 await new Promise((resolve,reject)=>{rejectRun=reject;cancel=()=>{aborted=true;reject(Error('渲染已取消，记忆保持不变。'));};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=()=>reject(Error('视频编码失败，请降低设备负担后重试'));recorder.onstop=resolve;recorder.start(1000);const start=performance.now();let last=-100;function tick(now){try{const t=Math.min(26,(now-start)/1000);if(now-last>=32){draw(t);last=now;$('film-status').textContent=`正在渲染 ${Math.round(t/26*100)}% · 请保持页面打开`;}if(t>=26){recorder.stop();return;}raf=requestAnimationFrame(tick);}catch(e){reject(e);}}raf=requestAnimationFrame(tick);timer=setTimeout(()=>reject(Error('录制超时，请保持页面在前台后重试')),45000);document.addEventListener('visibilitychange',hidden);});
 if(aborted)throw Error('渲染已取消');const blob=new Blob(chunks,{type:recorder.mimeType||mime});if(blob.size<1000)throw Error('视频没有录制成功，请重试');videoURL=URL.createObjectURL(blob);$('film-video').src=videoURL;$('film-video').hidden=false;canvas.hidden=true;$('film-save').href=videoURL;$('film-save').download=`Gemos Still-${title.replace(/[\\/:*?"<>|]/g,'_')}.${mime.includes('mp4')?'mp4':'webm'}`;$('film-save').hidden=false;$('film-status').textContent=`影片已完成 · ${mime.includes('mp4')?'MP4':'WebM'} · ${(blob.size/1048576).toFixed(1)} MB`;
 }catch(e){$('film-status').textContent=e.message;$('film-canvas').hidden=true;}
 finally{clearTimeout(timer);cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',hidden);if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(t=>t.stop());memoryBox.endFilm();running=false;cancel=null;$('film-start').disabled=false;$('film-format').disabled=false;$('film-cancel').hidden=true;}
};
