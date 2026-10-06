import {createClueScene,createCollectiveScene} from './scene.js';
const $=id=>document.getElementById(id);
const STORY=[
 {kicker:'衣物 → 洗涤过程',title:'有些线索，从衣物开始。',text:'合成纤维衣物在洗涤时可能释放微塑料纤维。释放情况受织物和洗涤条件影响，先核对衣物标签。',source:'https://pubmed.ncbi.nlm.nih.gov/27686821/'},
 {kicker:'洗涤废水 → 水环境',title:'离开视线，过程仍可能继续。',text:'废水处理能减少微塑料，残余仍可能进入水环境。水生生物可能摄入这些纤维，具体影响取决于纤维特征和暴露条件。',source:'https://pubmed.ncbi.nlm.nih.gov/27191224/',extra:'https://marine-debris-site-s3fs.s3.us-west-1.amazonaws.com/s3fs-public/publications-files/2022%20NOAA%20Report%20IMDCC%20Microfiber%20Pollution_Final.pdf'},
 {kicker:'生活选择 → 减少释放',title:'从日常的一次选择开始。',text:'在满足清洁需要和衣物护理要求时，可尝试较低温、较短的程序；合理凑量洗涤，不超过机器额定容量。',source:'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0233332'}
];
let scene=null,collectiveScene=null,phase=0,photo='',hotspot={x:.32,y:.66,radius:.22},current=null,localRows=[],publicRows=[],collection='public',busy=false,photoEpoch=0;
const ownersKey='gemos-clue-box-owner-tokens-v1',sessionOwners={};
function readOwners(){try{return {...JSON.parse(localStorage.getItem(ownersKey)||'{}'),...sessionOwners};}catch{return {...sessionOwners};}}
function saveOwner(id,token){sessionOwners[id]=token;try{localStorage.setItem(ownersKey,JSON.stringify(readOwners()));return true;}catch{return false;}}
function removeOwner(id){delete sessionOwners[id];try{const owners=readOwners();delete owners[id];localStorage.setItem(ownersKey,JSON.stringify(owners));}catch{}}
let database;
async function db(){if(database)return database;return new Promise((resolve,reject)=>{const r=indexedDB.open('gemos-clue-box-prototype-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('boxes',{keyPath:'id'});r.onsuccess=()=>{database=r.result;resolve(database);};r.onerror=()=>reject(r.error);});}
async function saveLocal(record){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('boxes','readwrite');tx.objectStore('boxes').put(record);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('本机存储空间不足'));});}
async function listLocal(){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('boxes').objectStore('boxes').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));r.onerror=()=>reject(r.error);});}
async function api(path,options={}){const response=await fetch('/api/clue-boxes'+path,options);let body;try{body=await response.json();}catch{throw Error('共同收藏服务暂未连接，请先保存到本机。');}if(!response.ok)throw Error(body.error||body.message||'这次操作没有完成，请稍后重试。');return body;}
async function image(src){const im=new Image();im.src=src;await im.decode();return im;}
async function normalizePhoto(src){const im=await image(src);if(im.naturalWidth*im.naturalHeight>40000000)throw Error('请选择小于 4000 万像素的照片。');const scale=Math.min(1,960/Math.max(im.naturalWidth,im.naturalHeight));const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(im.naturalWidth*scale));cv.height=Math.max(1,Math.round(im.naturalHeight*scale));cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);return cv.toDataURL('image/jpeg',.78);}
function setBusy(value){busy=value;$('take-box').disabled=value||!scene||$('scene-kind').value!=='laundry';$('photo-input').disabled=value;$('scene-kind').disabled=value;$('publish-box').disabled=value||!current||!!current.publicId;$('hotspot-radius').disabled=value;}
function renderStory(){const ready=$('scene-kind').value==='laundry';const item=STORY[phase];$('story-kicker').textContent=ready?item.kicker:'等待适配的场景';$('story-title').textContent=ready?item.title:$('scene-kind').value==='portrait'?'这次，换一张有场景的照片。':'这个场景的科普内容，还需要设计。';$('story-text').textContent=ready?item.text:'先选择包含洗衣机、衣物或洗衣活动的照片，体验这份草图。其他场景的主题关联会逐步补充。';$('story-source').hidden=!ready;$('story-source').href=item.source;document.querySelector('.story-note').hidden=!ready;let extra=$('story-extra');if(!extra){extra=document.createElement('a');extra.id='story-extra';extra.textContent='环境影响依据 ↗';extra.target='_blank';extra.rel='noopener noreferrer';extra.style.marginLeft='12px';$('story-source').after(extra);}extra.hidden=!ready||!item.extra;if(item.extra)extra.href=item.extra;document.querySelectorAll('[data-step]').forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.step)===phase));b.disabled=!ready;});$('next-step').disabled=!ready;scene?.setPhase(phase);scene?.setEnabled(ready);setBusy(busy);}
function sceneChanged(){if($('scene-kind').value==='portrait')$('scene-status').textContent='纯人脸画面不进入本次场景科普流程。可以重新拍摄周围的生活环境。';else if($('scene-kind').value==='other')$('scene-status').textContent='已保留这张照片。这份原型暂未建立其他场景的科普内容，不自动套用洗衣主题。';else $('scene-status').textContent='你已选择洗衣场景。点击小图标记衣物或洗衣机；实际材质需由衣物标签等信息确认。';renderStory();}
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{phase=Number(b.dataset.step);renderStory();});
$('next-step').onclick=()=>{phase=(phase+1)%3;renderStory();};
$('pause-motion').onclick=()=>{const value=$('pause-motion').getAttribute('aria-pressed')!=='true';$('pause-motion').setAttribute('aria-pressed',String(value));$('pause-motion').textContent=value?'继续粒子':'暂停粒子';scene?.setPaused(value);};
$('view-reset').onclick=()=>scene?.reset();$('scene-kind').onchange=sceneChanged;
$('photo-pick').onclick=e=>{if(busy)return;if(e.target===$('photo-preview'))return;$('photo-input').click();};
$('photo-preview').onclick=e=>{e.stopPropagation();if(busy||$('scene-kind').value!=='laundry')return;const r=e.target.getBoundingClientRect();hotspot.x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));hotspot.y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));scene?.setHotspot(hotspot);$('scene-status').textContent='热点已更新。发光与演绎只发生在你标记的局部。';};
$('hotspot-radius').oninput=e=>{hotspot.radius=Number(e.target.value);$('radius-value').textContent=Math.round(hotspot.radius*100)+'%';scene?.setHotspot(hotspot);};
$('photo-input').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){$('scene-status').textContent='请选择 12 MB 以内的 JPG、PNG 或 WebP。';return;}const epoch=++photoEpoch,url=URL.createObjectURL(file);setBusy(true);try{const next=await normalizePhoto(url);if(epoch!==photoEpoch)return;await scene?.setPhoto(next);photo=next;$('photo-preview').src=next;current=null;$('card-section').hidden=true;$('public-consent').checked=false;$('box-name').value=file.name.replace(/\.[^.]+$/,'').slice(0,48)||'我的日常线索';$('scene-kind').value='other';$('scene-status').textContent='照片已读入本机。请手动确认场景类型；这份草图尚未运行 AI 自动识别。';renderStory();}catch(error){$('scene-status').textContent=error.message;}finally{URL.revokeObjectURL(url);setBusy(false);}};
function fitted(ctx,im,x,y,w,h){const scale=Math.max(w/im.naturalWidth,h/im.naturalHeight),sw=w/scale,sh=h/scale;ctx.drawImage(im,(im.naturalWidth-sw)/2,(im.naturalHeight-sh)/2,sw,sh,x,y,w,h);}
function textLines(ctx,text,x,y,maxWidth,lineHeight){let line='',row=0;for(const c of text){if(ctx.measureText(line+c).width>maxWidth&&line){ctx.fillText(line,x,y+row*lineHeight);line=c;row++;}else line+=c;}if(line)ctx.fillText(line,x,y+row*lineHeight);return (row+1)*lineHeight;}
function drawQR(ctx,url,x,y,size){if(typeof window.qrcode!=='function')throw Error('二维码组件暂未加载，请刷新后重试。');const qr=window.qrcode(0,'M');qr.addData(url);qr.make();const n=qr.getModuleCount(),step=size/(n+8);ctx.fillStyle='#fff';ctx.fillRect(x,y,size,size);ctx.fillStyle='#151318';for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))ctx.fillRect(x+(c+4)*step,y+(r+4)*step,step+.1,step+.1);}
async function makeCard(record){const canvas=$('art-card'),ctx=canvas.getContext('2d'),source=await image(record.photoDataUrl||record.photoUrl),snapshot=await image(record.snapshot||scene.captureBox());ctx.fillStyle='#eee8df';ctx.fillRect(0,0,1000,1400);ctx.fillStyle='#302339';ctx.fillRect(0,0,1000,160);ctx.fillStyle='#ddc9ec';ctx.font='19px sans-serif';ctx.fillText('EVERYDAY TRACES / A PERSONAL COLLECTION',62,62);ctx.fillStyle='#f7f0e9';ctx.font='36px sans-serif';ctx.fillText('日常里，藏着一条线索。',62,120);fitted(ctx,source,62,198,350,280);ctx.fillStyle='#6c635f';ctx.font='18px sans-serif';ctx.fillText('01 / 我的生活场景',62,512);ctx.fillStyle='#302339';ctx.font='30px sans-serif';textLines(ctx,record.name,460,245,470,46);ctx.fillStyle='#827278';ctx.font='19px sans-serif';ctx.fillText('洗衣场景 × 合成纤维条件示例',460,365);ctx.font='15px sans-serif';ctx.fillText(new Date(record.createdAt).toLocaleDateString('zh-CN')+' / '+record.id.slice(0,8),460,403);ctx.fillStyle='#080808';ctx.fillRect(62,550,876,555);fitted(ctx,snapshot,62,550,876,555);ctx.fillStyle='#675d5b';ctx.font='17px sans-serif';ctx.fillText('02 / 一个属于我的盒子',62,1143);ctx.fillStyle='#302339';ctx.font='24px sans-serif';textLines(ctx,'合成纤维衣物洗涤时，可能释放微塑料纤维。',62,1196,650,36);ctx.font='15px sans-serif';ctx.fillStyle='#807376';ctx.fillText('艺术演绎 · 场景关联 · 非照片检测结果',62,1285);const url=record.publicId?location.origin+location.pathname+'?box='+record.publicId:location.origin+location.pathname;drawQR(ctx,url,786,1169,152);ctx.font='13px sans-serif';ctx.fillText(record.publicId?'扫码回看我的盒子':'扫码开始自己的创作',777,1344);ctx.fillStyle='#cfc3bb';ctx.fillRect(62,1357,660,1);ctx.fillStyle='#807376';ctx.font='13px sans-serif';ctx.fillText('GEMOS STILL / 一人一个盒子，一起收藏日常。',62,1379);}
$('take-box').onclick=async()=>{if(busy||!scene||$('scene-kind').value!=='laundry')return;setBusy(true);$('action-status').textContent='盒子离开底座，正在成为一份收藏…';try{const record={id:crypto.randomUUID(),name:$('box-name').value.trim()||'我的日常线索',topic:'laundry',createdAt:new Date().toISOString(),photoDataUrl:photo,hotspot:{...hotspot},snapshot:scene.captureBox()};await scene.lift();await saveLocal(record);current=record;await makeCard(record);$('card-section').hidden=false;$('public-consent').checked=false;$('publish-status').textContent='已保存到当前浏览器。公开前，可以先保存自己的卡片。';$('remove-public').hidden=true;$('action-status').textContent='已收藏到本机。你的艺术卡片在下方。';localRows=await listLocal();renderCollection();$('card-section').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});}catch(error){$('action-status').textContent=error.message;}finally{setBusy(false);}};
$('download-card').onclick=()=>{if(!current)return;$('art-card').toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(current.name||'日常线索')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');};
$('publish-box').onclick=async()=>{
 if(busy||!current||current.publicId)return;
 if(!$('public-consent').checked){$('publish-status').textContent='勾选后再发布。没有勾选时，照片只留在本机。';return;}
 setBusy(true);
 try{
  const result=await api('/boxes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:current.name,topic:current.topic,photoDataUrl:current.photoDataUrl,hotspot:current.hotspot,publicConsent:true})});
  current.publicId=result.box.id;
  const saved=saveOwner(result.box.id,result.deleteToken);
  $('remove-public').hidden=false;
  let status='已加入共同收藏。卡片二维码现在可以跨设备回看你的盒子。';
  if(!saved)status+=' 当前浏览器无法保存凭证，关闭页面前可直接撤回；请保留这份撤回凭证：'+result.deleteToken;
  try{await saveLocal(current);}catch{status+=' 本机备份更新失败，公开作品已经保存。';}
  try{await makeCard(current);}catch{status+=' 卡片更新未完成，请重新打开这个公开盒子后再保存。';}
  $('publish-status').textContent=status;
  await loadPublic();
  try{localRows=await listLocal();}catch{}
 }catch(error){$('publish-status').textContent=error.message;}finally{setBusy(false);}
};
$('remove-public').onclick=async()=>{
 if(busy||!current?.publicId)return;
 const id=current.publicId,token=readOwners()[id];
 if(!token){$('publish-status').textContent='当前浏览器没有这份作品的撤回凭证。';return;}
 setBusy(true);
 try{
  await api('/boxes/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
  removeOwner(id);
  const linked=localRows.filter(row=>row.publicId===id).map(row=>{const updated={...row};delete updated.publicId;return updated;});
  delete current.publicId;
  $('remove-public').hidden=true;
  let storageOk=true;
  for(const row of [...linked,current]){try{await saveLocal(row);}catch{storageOk=false;}}
  localRows=localRows.map(row=>linked.find(update=>update.id===row.id)||row);
  let status='已撤回公开展示。本机照片仍然保留；已发出的旧二维码将显示作品不可用。';
  if(!storageOk)status+=' 本机记录更新失败，请保存卡片备份。';
  try{await makeCard(current);}catch{status+=' 卡片暂未更新，请重新打开本机收藏。';}
  $('publish-status').textContent=status;
  await loadPublic();
  renderCollection();
 }catch(error){$('publish-status').textContent=error.message;}finally{setBusy(false);}
};
async function openRecord(record,isPublic){if(busy)return;setBusy(true);try{photo=record.photoDataUrl||await normalizePhoto(record.photoUrl);await scene.setPhoto(photo);$('photo-preview').src=photo;$('box-name').value=record.name;hotspot={...record.hotspot};scene.setHotspot(hotspot);$('hotspot-radius').value=hotspot.radius;$('radius-value').textContent=Math.round(hotspot.radius*100)+'%';$('scene-kind').value='laundry';phase=0;renderStory();if(isPublic){const ownedLocal=localRows.find(row=>row.publicId===record.id);current=ownedLocal?{...ownedLocal,publicId:record.id}:{...record,id:crypto.randomUUID(),publicId:record.id,photoDataUrl:photo,snapshot:scene.captureBox()};}else current=record;await makeCard(current);$('card-section').hidden=false;$('publish-status').textContent=isPublic?'正在回看共同收藏里的这份作品。':'正在回看你的本机收藏。';$('remove-public').hidden=!current.publicId||!readOwners()[current.publicId];$('stage-hint').textContent='正在回看：'+record.name;document.querySelector('.experience').scrollIntoView({block:'start',behavior:'smooth'});}catch(error){$('collection-status').textContent='作品暂未打开：'+error.message;}finally{setBusy(false);}}
function renderCollection(){const rows=collection==='public'?publicRows:localRows,grid=$('box-grid');collectiveScene?.setRecords(rows);$('collective-stage').hidden=rows.length===0;$('collective-caption').hidden=rows.length===0;if(rows.length>48)$('collective-caption').textContent='三维展陈显示最近 48 个盒子；完整收藏可在下方逐个查看。拖动可以转动共同作品。';grid.replaceChildren();for(const record of rows){const button=document.createElement('button');button.className='collection-box';const im=document.createElement('img');im.src=record.photoDataUrl||record.thumbnailUrl||record.photoUrl;im.alt=record.name;im.loading='lazy';const detail=document.createElement('div'),name=document.createElement('strong'),date=document.createElement('small');name.textContent=record.name;date.textContent=new Date(record.createdAt).toLocaleDateString('zh-CN')+' / 洗衣场景线索';detail.append(name,date);button.append(im,detail);button.onclick=()=>void openRecord(record,collection==='public');grid.append(button);}$('collection-status').textContent=rows.length?'点击一个盒子，回看它的场景与三步演绎。':collection==='public'?'还没有公开盒子。你的参与可以成为共同收藏的第一条记录。':'还没有本机收藏。完成体验后，抓起一个盒子留下来。';$('show-public').setAttribute('aria-pressed',String(collection==='public'));$('show-local').setAttribute('aria-pressed',String(collection==='local'));}
async function loadPublic(){try{const body=await api('/boxes');publicRows=body.boxes;$('collection-count').textContent=body.total+' 个公开盒子';if(collection==='public')renderCollection();}catch(error){$('collection-count').textContent='共同收藏暂未连接';if(collection==='public'){$('box-grid').replaceChildren();$('collection-status').textContent=error.message;}}}
$('show-public').onclick=()=>{collection='public';void loadPublic();};$('show-local').onclick=()=>{collection='local';renderCollection();};
async function boot(){setBusy(true);try{scene=createClueScene($('stage'));try{collectiveScene=createCollectiveScene($('collective-stage'));}catch{$('collective-stage').hidden=true;$('collective-caption').hidden=true;}photo=await normalizePhoto('laundry.svg');await scene.setPhoto(photo);renderStory();}catch(error){$('render-error').hidden=false;$('render-error').textContent='当前浏览器没有完成三维绘制：'+error.message+'。可以先阅读作品方案，或换用支持 WebGL 的浏览器。';setBusy(false);}
setBusy(false);try{localRows=await listLocal();}catch{}await loadPublic();const id=new URLSearchParams(location.search).get('box');if(id){try{const result=await api('/boxes/'+encodeURIComponent(id));if(scene)await openRecord(result.box,true);}catch(error){$('collection-status').textContent='这个盒子已撤回或暂不可用。'+error.message;}}
}void boot();
