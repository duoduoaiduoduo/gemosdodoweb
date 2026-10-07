import {createClueScene,createCollectiveScene} from './scene.js?v=splat-objects-20261007';
import {probeReconstruction,reconstructPhoto,validateGaussianBuffer,unpackStill,packStill} from './reconstruction.js?v=splat-objects-20261007';
const $=id=>document.getElementById(id);
const STORY=[
 {kicker:'衣物 → 洗涤过程',title:'有些线索，从衣物开始。',text:'合成纤维衣物在洗涤时可能释放微塑料纤维。释放情况受织物和洗涤条件影响，先核对衣物标签。',source:'https://pubmed.ncbi.nlm.nih.gov/27686821/'},
 {kicker:'洗涤废水 → 水环境',title:'离开视线，过程仍可能继续。',text:'废水处理能减少微塑料，残余仍可能进入水环境。水生生物可能摄入这些纤维，具体影响取决于纤维特征和暴露条件。',source:'https://pubmed.ncbi.nlm.nih.gov/27191224/',extra:'https://marine-debris-site-s3fs.s3.us-west-1.amazonaws.com/s3fs-public/publications-files/2022%20NOAA%20Report%20IMDCC%20Microfiber%20Pollution_Final.pdf'},
 {kicker:'生活选择 → 减少释放',title:'从日常的一次选择开始。',text:'在满足清洁需要和衣物护理要求时，可尝试较低温、较短的程序；合理凑量洗涤，不超过机器额定容量。',source:'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0233332'}
];
let scene=null,collectiveScene=null,phase=0,photo='',hotspot={x:.66,y:.63,radius:.18},current=null,localRows=[],publicRows=[],collection='public',busy=false,photoEpoch=0;
let space='workshop',modelBuffer=null,modelMethod='',hasPhotoUV=false,probe=null,probeEpoch=0,buildController=null;
document.body.dataset.controlsOpen='false';
function announce(text){$('hud-hint').textContent=text;}
function showDialog(id){const dialog=$(id);dialog.hidden=false;if(!dialog.open)dialog.showModal();}
function closeDialog(id){const dialog=$(id);if(dialog.open)dialog.close();}
function setView(value){
 space=value;
 $('workshop-view').hidden=value!=='workshop';
 $('collection').hidden=value!=='collection';
 document.body.dataset.space=value;
 $('enter-collection').setAttribute('aria-pressed',String(value==='collection'));
 $('leave-collection').setAttribute('aria-pressed',String(value==='workshop'));
 scene?.setActive(value==='workshop');
 collectiveScene?.setActive(value==='collection');
 if(value==='collection')renderCollection();
}
function showStory(value=true){document.body.dataset.storyOpen=String(value);$('story-panel').hidden=!value;$('toggle-story').setAttribute('aria-expanded',String(value));}
function updateHotspotMarker(){const marker=$('hotspot-marker');if(marker){marker.style.left=hotspot.x*100+'%';marker.style.top=hotspot.y*100+'%';}}
$('open-photo-tools').onclick=()=>{if(busy)return;setView('workshop');showDialog('photo-dialog');if(!modelBuffer)void inspectModel();};
$('open-about').onclick=()=>showDialog('about-dialog');
$('open-current-card').onclick=()=>{if(current&&!busy)showDialog('card-section');};
$('enter-collection').onclick=()=>{if(busy)return;setView('collection');if(collection==='public')void loadPublic();};
$('leave-collection').onclick=()=>{if(!busy)setView('workshop');};
$('toggle-story').onclick=()=>showStory($('story-panel').hidden);
for(const button of document.querySelectorAll('[data-close-dialog]'))button.onclick=()=>closeDialog(button.dataset.closeDialog);
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();});
$('photo-dialog').addEventListener('close',()=>{buildController?.abort();if(modelBuffer){showStory(false);announce('点发光的位置看线索；拖盒子到收藏托盘收藏。');}else announce('点左边的照片，确认场景后制作你的三维盒子。');});
$('close-story').onclick=()=>showStory(false);
$('open-controls').onclick=()=>{document.body.dataset.controlsOpen=String(document.body.dataset.controlsOpen!=='true');closeDialog('about-dialog');};
const ownersKey='gemos-clue-box-owner-tokens-v1',sessionOwners={};
function readOwners(){try{return {...JSON.parse(localStorage.getItem(ownersKey)||'{}'),...sessionOwners};}catch{return {...sessionOwners};}}
function saveOwner(id,token){sessionOwners[id]=token;try{localStorage.setItem(ownersKey,JSON.stringify(readOwners()));return true;}catch{return false;}}
function removeOwner(id){delete sessionOwners[id];try{const owners=readOwners();delete owners[id];localStorage.setItem(ownersKey,JSON.stringify(owners));}catch{}}
let database;
async function db(){if(database)return database;return new Promise((resolve,reject)=>{const r=indexedDB.open('gemos-clue-box-prototype-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('boxes',{keyPath:'id'});r.onsuccess=()=>{database=r.result;resolve(database);};r.onerror=()=>reject(r.error);});}
async function saveLocal(record){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('boxes','readwrite');tx.objectStore('boxes').put(record);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('本机存储空间不足'));});}
async function listLocal(){
 const d=await db();return new Promise((resolve,reject)=>{
  const rows=[],request=d.transaction('boxes').objectStore('boxes').openCursor();
  request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));return;}
   const {modelBuffer,snapshot,...summary}=cursor.value;summary.hasModel=!!modelBuffer;rows.push(summary);cursor.continue();};
  request.onerror=()=>reject(request.error);
 });
}
async function localRecord(id){const d=await db();return new Promise((resolve,reject)=>{const request=d.transaction('boxes').objectStore('boxes').get(id);request.onsuccess=()=>request.result?resolve(request.result):reject(Error('本机盒子暂未找到。'));request.onerror=()=>reject(request.error);});}
async function api(path,options={}){const response=await fetch('/api/clue-boxes'+path,options);let body;try{body=await response.json();}catch{throw Error('共同收藏服务暂未连接，请先保存到本机。');}if(!response.ok)throw Error(body.error||body.message||'这次操作没有完成，请稍后重试。');return body;}
async function image(src){const im=new Image();im.src=src;await im.decode();return im;}
async function normalizePhoto(src){const im=await image(src);if(im.naturalWidth*im.naturalHeight>40000000)throw Error('请选择小于 4000 万像素的照片。');const scale=Math.min(1,960/Math.max(im.naturalWidth,im.naturalHeight));const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(im.naturalWidth*scale));cv.height=Math.max(1,Math.round(im.naturalHeight*scale));cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);return cv.toDataURL('image/jpeg',.78);}
function setBusy(value){
 busy=value;const collectable=!!scene&&!!modelBuffer&&$('scene-kind').value==='laundry';
 $('take-box').disabled=value||!collectable;
 for(const id of ['photo-input','still-input','scene-kind','hotspot-radius','open-photo-tools','enter-collection','leave-collection','reconstruction-mode','import-still'])$(id).disabled=value;
 $('publish-box').disabled=value||!current||!!current.publicModelReady;
 $('open-current-card').disabled=value||!current;
 $('download-still').disabled=value||!current?.modelBuffer;
 $('build-scene').hidden=!!modelBuffer;
 $('build-scene').disabled=value||!photo||$('scene-kind').value!=='laundry'||!probe?.supported;
 scene?.setInteractionEnabled(!value);scene?.setCollectable(collectable);
}
function labelRender(){
 $('render-kind').textContent=modelBuffer?'高斯空间':'照片已读入 · 等待重建';
}
function renderStory(){const ready=$('scene-kind').value==='laundry'&&!!modelBuffer;const item=STORY[phase];$('story-kicker').textContent=ready?item.kicker:'等待适配的场景';$('story-title').textContent=ready?item.title:$('scene-kind').value==='portrait'?'这次，换一张有场景的照片。':'这个场景的科普内容，还需要设计。';$('story-text').textContent=ready?item.text:'先选择洗衣场景并完成三维制作。其他场景的主题关联还在设计中。';$('story-source').hidden=!ready;$('story-source').href=item.source;document.querySelector('.story-note').hidden=!ready;let extra=$('story-extra');if(!extra){extra=document.createElement('a');extra.id='story-extra';extra.textContent='环境影响依据 ↗';extra.target='_blank';extra.rel='noopener noreferrer';extra.style.marginLeft='12px';$('story-source').after(extra);}extra.hidden=!ready||!item.extra;if(item.extra)extra.href=item.extra;document.querySelectorAll('[data-step]').forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.step)===phase));b.disabled=!ready;});$('next-step').disabled=!ready;$('next-step').textContent=phase===2?'再看一次 ↺':'下一步 →';scene?.setPhase(phase);scene?.setEnabled(ready);setBusy(busy);labelRender();}
function sceneChanged(){if($('scene-kind').value==='portrait')$('scene-status').textContent='纯人脸画面不进入本次场景科普流程。可以重新拍摄周围的生活环境。';else if($('scene-kind').value==='other')$('scene-status').textContent='已保留这张照片。这份原型暂未建立其他场景的科普内容，不自动套用洗衣主题。';else $('scene-status').textContent='你已选择洗衣场景。点击小图标记衣物或洗衣机；实际材质需由衣物标签等信息确认。';renderStory();}
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{phase=Number(b.dataset.step);renderStory();showStory();});
$('next-step').onclick=()=>{phase=(phase+1)%3;renderStory();showStory();};
$('pause-motion').onclick=()=>{const value=$('pause-motion').getAttribute('aria-pressed')!=='true';$('pause-motion').setAttribute('aria-pressed',String(value));$('pause-motion').textContent=value?'继续粒子':'暂停粒子';scene?.setPaused(value);};
$('view-reset').onclick=()=>scene?.reset();$('scene-kind').onchange=sceneChanged;
$('photo-pick').onclick=e=>{if(busy)return;if(e.target===$('photo-preview'))return;$('photo-input').click();};
$('photo-preview').onclick=e=>{e.stopPropagation();if(busy||$('scene-kind').value!=='laundry')return;if(modelBuffer&&!hasPhotoUV){$('scene-status').textContent='这个旧盒子没有照片坐标，请回到三维场景，点选一个局部来标记。';return;}const r=e.target.getBoundingClientRect();hotspot.x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));hotspot.y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));scene?.setHotspot(hotspot);updateHotspotMarker();$('scene-status').textContent='热点已更新。发光与演绎只发生在你标记的局部。';};
$('hotspot-radius').oninput=e=>{hotspot.radius=Number(e.target.value);$('radius-value').textContent=Math.round(hotspot.radius*100)+'%';scene?.setHotspot(hotspot);};
$('photo-input').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){announce('请选择 12 MB 以内的 JPG、PNG 或 WebP。');return;}
 const epoch=++photoEpoch,url=URL.createObjectURL(file);setBusy(true);
 try{
  const next=await normalizePhoto(url);if(epoch!==photoEpoch)return;
  await scene?.setPhoto(next);photo=next;modelBuffer=null;modelMethod='';hasPhotoUV=false;current=null;phase=0;
  $('photo-preview').src=next;closeDialog('card-section');showStory(false);$('public-consent').checked=false;
  $('box-name').value=file.name.replace(/\.[^.]+$/,'').slice(0,48)||'我的日常线索';$('scene-kind').value='other';
  $('scene-status').textContent='照片已留在本机。先确认场景；这里暂由你确认，尚未自动识别。';
  renderStory();showDialog('photo-dialog');void inspectModel();
 }catch(error){announce(error.message);$('scene-status').textContent=error.message;}
 finally{URL.revokeObjectURL(url);setBusy(false);}
};
function fitted(ctx,im,x,y,w,h){const scale=Math.max(w/im.naturalWidth,h/im.naturalHeight),sw=w/scale,sh=h/scale;ctx.drawImage(im,(im.naturalWidth-sw)/2,(im.naturalHeight-sh)/2,sw,sh,x,y,w,h);}
function textLines(ctx,text,x,y,maxWidth,lineHeight){let line='',row=0;for(const c of text){if(ctx.measureText(line+c).width>maxWidth&&line){ctx.fillText(line,x,y+row*lineHeight);line=c;row++;}else line+=c;}if(line)ctx.fillText(line,x,y+row*lineHeight);return (row+1)*lineHeight;}
function drawQR(ctx,url,x,y,size){if(typeof window.qrcode!=='function')throw Error('二维码组件暂未加载，请刷新后重试。');const qr=window.qrcode(0,'M');qr.addData(url);qr.make();const n=qr.getModuleCount(),step=size/(n+8);ctx.fillStyle='#fff';ctx.fillRect(x,y,size,size);ctx.fillStyle='#151318';for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))ctx.fillRect(x+(c+4)*step,y+(r+4)*step,step+.1,step+.1);}
async function makeCard(record){const canvas=$('art-card'),ctx=canvas.getContext('2d'),source=await image(record.photoDataUrl||record.photoUrl),snapshot=await image(record.snapshot||scene.captureBox());ctx.fillStyle='#eee8df';ctx.fillRect(0,0,1000,1400);ctx.fillStyle='#302339';ctx.fillRect(0,0,1000,160);ctx.fillStyle='#ddc9ec';ctx.font='19px sans-serif';ctx.fillText('EVERYDAY TRACES / A PERSONAL COLLECTION',62,62);ctx.fillStyle='#f7f0e9';ctx.font='36px sans-serif';ctx.fillText('日常里，藏着一条线索。',62,120);fitted(ctx,source,62,198,350,280);ctx.fillStyle='#6c635f';ctx.font='18px sans-serif';ctx.fillText('01 / 我的生活场景',62,512);ctx.fillStyle='#302339';ctx.font='30px sans-serif';textLines(ctx,record.name,460,245,470,46);ctx.fillStyle='#827278';ctx.font='19px sans-serif';ctx.fillText('洗衣场景 × 合成纤维条件示例',460,365);ctx.font='15px sans-serif';ctx.fillText(new Date(record.createdAt).toLocaleDateString('zh-CN')+' / '+record.id.slice(0,8),460,403);ctx.fillStyle='#080808';ctx.fillRect(62,550,876,555);fitted(ctx,snapshot,62,550,876,555);ctx.fillStyle='#675d5b';ctx.font='17px sans-serif';ctx.fillText('02 / 一个属于我的盒子',62,1143);ctx.fillStyle='#302339';ctx.font='24px sans-serif';textLines(ctx,'合成纤维衣物洗涤时，可能释放微塑料纤维。',62,1196,650,36);ctx.font='15px sans-serif';ctx.fillStyle='#807376';ctx.fillText('艺术演绎 · 场景关联 · 非照片检测结果',62,1285);const url=record.publicId?location.origin+location.pathname+'?box='+record.publicId:location.origin+location.pathname;drawQR(ctx,url,786,1169,152);ctx.font='13px sans-serif';ctx.fillText(record.publicId?'扫码回看我的盒子':'扫码开始自己的创作',777,1344);ctx.fillStyle='#cfc3bb';ctx.fillRect(62,1357,660,1);ctx.fillStyle='#807376';ctx.font='13px sans-serif';ctx.fillText('DAILY TRACES / 一人一个盒子，一起收藏日常。',62,1379);}
async function collectBox(){if(busy||!scene||!modelBuffer||$('scene-kind').value!=='laundry'){scene?.returnBox();return;}setBusy(true);$('action-status').textContent='盒子离开底座，正在成为一份收藏…';announce('正在抓起你的盒子…');showStory(false);try{const record={id:crypto.randomUUID(),name:$('box-name').value.trim()||'我的日常线索',topic:'laundry',createdAt:new Date().toISOString(),photoDataUrl:photo,hotspot:{...hotspot},snapshot:scene.captureBox(),modelBuffer,modelMethod,hasPhotoUV};await scene.lift();await saveLocal(record);current=record;await makeCard(record);showDialog('card-section');$('public-consent').checked=false;$('publish-status').textContent='已保存到当前浏览器。公开前，可以先保存自己的卡片。';$('remove-public').hidden=true;$('action-status').textContent='已收藏到本机。';announce('盒子已收藏，你可以保存卡片或加入共同收藏。');localRows=await listLocal();renderCollection();}catch(error){$('action-status').textContent=error.message;announce(error.message);}finally{scene?.returnBox();setBusy(false);}}
$('take-box').onclick=()=>void collectBox();
$('download-card').onclick=()=>{if(!current)return;$('art-card').toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(current.name||'日常线索')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');};
$('publish-box').onclick=async()=>{
 if(busy||!current||current.publicModelReady)return;
 if(!$('public-consent').checked){$('publish-status').textContent='勾选后再发布。照片和三维只在本机保留。';return;}
 if(!current.modelBuffer){$('publish-status').textContent='这个旧盒子只有照片。先重新制作三维，再加入共同收藏。';return;}
 if(current.modelBuffer.byteLength>32*1024*1024){$('publish-status').textContent='这个旧盒子的三维超过公开容量。可以保存 .still，或用浏览器重新制作较轻的版本。';return;}
 setBusy(true);
 try{
  let storageOk=true;
  if(!current.publicId){
   const result=await api('/boxes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:current.name,topic:current.topic,photoDataUrl:current.photoDataUrl,hotspot:current.hotspot,publicConsent:true})});
   current.publicId=result.box.id;current.publicModelReady=false;
   storageOk=saveOwner(result.box.id,result.deleteToken);$('remove-public').hidden=false;
   if(!storageOk)$('publish-status').textContent='当前浏览器无法保存撤回凭证，请保留：'+result.deleteToken;
   try{await saveLocal(current);}catch{}
  }
  const token=readOwners()[current.publicId];if(!token)throw Error('当前浏览器没有这份作品的发布凭证，无法保存三维。');
  $('publish-status').textContent='照片已保存，正在存入同一盒子的高斯模型…';
  const result=await api('/boxes/'+current.publicId+'/model',{method:'POST',headers:{'Content-Type':'application/octet-stream',Authorization:'Bearer '+token,'X-Reconstruction-Method':current.modelMethod||'imported-still','X-Model-Photo-UV':current.hasPhotoUV?'1':'0'},body:current.modelBuffer});
  current.publicModelReady=true;
  let status='照片与真实高斯场景已加入共同收藏。卡片二维码可以跨设备回看同一个三维盒子。';
  if(!storageOk)status+=' 关闭页面前请保留撤回凭证：'+token;
  try{await saveLocal(current);}catch{status+=' 本机备份更新失败，公开作品已保存。';}
  try{await makeCard(current);}catch{status+=' 卡片暂未更新，请重新打开公开盒子后保存。';}
  $('publish-status').textContent=status;
  await loadPublic();try{localRows=await listLocal();}catch{}
 }catch(error){$('publish-status').textContent=(current.publicId?'照片记录已公开，三维保存尚未完成；可重试或撤回。':'')+error.message;if(current.publicId)$('remove-public').hidden=false;await loadPublic();}
 finally{setBusy(false);}
};
$('remove-public').onclick=async()=>{
 if(busy||!current?.publicId)return;
 const id=current.publicId,token=readOwners()[id];
 if(!token){$('publish-status').textContent='当前浏览器没有这份作品的撤回凭证。';return;}
 setBusy(true);
 try{
  await api('/boxes/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
  removeOwner(id);
  const linked=localRows.filter(row=>row.publicId===id).map(row=>{const updated={...row};delete updated.publicId;delete updated.publicModelReady;return updated;});
  delete current.publicId;delete current.publicModelReady;
  $('remove-public').hidden=true;
  let storageOk=true;
  for(const row of [...linked,current]){try{const full=row.id===current.id?current:await localRecord(row.id);delete full.publicId;delete full.publicModelReady;await saveLocal(full);}catch{storageOk=false;}}
  localRows=localRows.map(row=>linked.find(update=>update.id===row.id)||row);
  let status='已撤回公开展示。本机照片仍然保留；已发出的旧二维码将显示作品不可用。';
  if(!storageOk)status+=' 本机记录更新失败，请保存卡片备份。';
  try{await makeCard(current);}catch{status+=' 卡片暂未更新，请重新打开本机收藏。';}
  $('publish-status').textContent=status;
  await loadPublic();
  renderCollection();
 }catch(error){$('publish-status').textContent=error.message;}finally{setBusy(false);}
};
async function openRecord(record,isPublic){
 if(busy||!scene)return;setView('workshop');setBusy(true);announce('正在打开这个盒子…');
 try{
  if(!isPublic)record=await localRecord(record.id);
  const nextPhoto=record.photoDataUrl||await normalizePhoto(record.photoUrl);
  let nextModel=record.modelBuffer||null,nextUV=!!record.hasPhotoUV,nextMethod=record.modelMethod||'imported-still';
  if(isPublic){nextModel=null;nextUV=!!record.modelHasPhotoUV;if(record.modelUrl){const response=await fetch(record.modelUrl);if(!response.ok)throw Error('高斯模型暂未读入，请稍后重试。');if(Number(response.headers.get('Content-Length'))>32*1024*1024)throw Error('这个公开模型超过容量。');nextModel=await response.arrayBuffer();if(nextModel.byteLength>32*1024*1024)throw Error('这个公开模型超过容量。');nextMethod=record.modelMethod;}}
  if(nextModel)validateGaussianBuffer(nextModel);
  await scene.setPhoto(nextPhoto);photo=nextPhoto;modelBuffer=null;modelMethod='';hasPhotoUV=false;current=null;$('photo-preview').src=photo;showStory(false);renderStory();
  if(nextModel)scene.setModel(nextModel,{hasPhotoUV:nextUV});
  modelBuffer=nextModel;modelMethod=nextMethod;hasPhotoUV=nextUV;
  $('photo-preview').src=photo;$('box-name').value=record.name;hotspot={...record.hotspot};scene.setHotspot(hotspot);updateHotspotMarker();$('hotspot-radius').value=hotspot.radius;$('radius-value').textContent=Math.round(hotspot.radius*100)+'%';$('scene-kind').value=record.topic||'laundry';phase=0;renderStory();
  const owned=isPublic?localRows.find(row=>row.publicId===record.id):record;
  current={...record,...owned,id:owned?.id||crypto.randomUUID(),photoDataUrl:photo,modelBuffer,modelMethod,hasPhotoUV,snapshot:scene.captureBox(),...(isPublic?{publicId:record.id,publicModelReady:!!nextModel}:{})};
  await makeCard(current);$('publish-status').textContent=nextModel?'正在回看保存的真实高斯场景。':'这是一份旧版照片收藏，尚未保存三维。点照片设置，可以重新制作。';
  $('remove-public').hidden=!current.publicId||!readOwners()[current.publicId];showStory(false);
  $('stage-hint').textContent='正在回看：'+record.name;announce(nextModel?'点发光的位置看线索；拖空白处转动盒子。':'这个旧盒子只有照片，点照片设置重新制作三维。');
 }catch(error){$('collection-status').textContent='作品暂未打开：'+error.message;announce('作品暂未打开：'+error.message);}
 finally{setBusy(false);}
}
function renderCollection(){const rows=collection==='public'?publicRows:localRows,grid=$('box-grid');$('collection-count').textContent=rows.length+(collection==='public'?' 个公开盒子':' 个本机盒子');collectiveScene?.setRecords(rows);$('collective-stage').hidden=false;$('collective-caption').hidden=rows.length===0;if(rows.length>48)$('collective-caption').textContent='三维展陈显示最近 48 个盒子；完整收藏可在下方逐个查看。拖动可以转动共同作品。';grid.replaceChildren();for(const record of rows){const button=document.createElement('button');button.className='collection-box';const im=document.createElement('img');im.src=record.photoDataUrl||record.thumbnailUrl||record.photoUrl;im.alt=record.name;im.loading='lazy';const detail=document.createElement('div'),name=document.createElement('strong'),date=document.createElement('small');name.textContent=record.name;date.textContent=new Date(record.createdAt).toLocaleDateString('zh-CN')+(record.hasModel||record.modelBuffer||record.modelUrl?' / 3D 盒子':' / 旧版照片');detail.append(name,date);button.append(im,detail);button.onclick=()=>void openRecord(record,collection==='public');grid.append(button);}$('collection-status').textContent=rows.length?'点击一个盒子，回看它的场景与三步演绎。':collection==='public'?'还没有公开盒子。你的参与可以成为共同收藏的第一条记录。':'还没有本机收藏。完成体验后，抓起一个盒子留下来。';$('show-public').setAttribute('aria-pressed',String(collection==='public'));$('show-local').setAttribute('aria-pressed',String(collection==='local'));}
async function loadPublic(){try{const body=await api('/boxes');publicRows=body.boxes;if(collection==='public')renderCollection();}catch(error){$('collection-count').textContent='共同收藏暂未连接';if(collection==='public'){publicRows=[];renderCollection();$('collection-count').textContent='共同收藏暂未连接';$('collection-status').textContent=error.message;}}}
$('show-public').onclick=()=>{collection='public';void loadPublic();};$('show-local').onclick=()=>{collection='local';renderCollection();};
async function inspectModel(){
 const epoch=++probeEpoch;probe=null;$('model-notice').textContent='正在检查当前设备的制作方式…';setBusy(busy);
 try{
  const result=await probeReconstruction({mode:$('reconstruction-mode').value});if(epoch!==probeEpoch)return;probe=result;
  const mb=Math.round(result.downloadBytes/1000000),kind=result.mode==='desktop'?'电脑 GPU 高细节':'CPU 轻量细节';
  $('model-notice').textContent=result.supported?(result.cached?kind+'模型已缓存；照片在当前设备处理。':kind+'首次需要下载约 '+mb+' MB 模型。点下面的制作按钮才开始下载，照片在当前设备处理。'):result.reason;
  $('build-scene').textContent=result.cached?'把照片放进盒子':'下载模型并制作 · '+mb+' MB';
 }catch(error){if(epoch!==probeEpoch)return;$('model-notice').textContent=error.message;}
 finally{if(epoch===probeEpoch)setBusy(busy);}
}
$('reconstruction-mode').onchange=()=>void inspectModel();
$('cancel-build').onclick=()=>buildController?.abort();
$('build-scene').onclick=async()=>{
 if(busy||!photo||!probe?.supported||$('scene-kind').value!=='laundry')return;
 const controller=new AbortController();buildController=controller;setBusy(true);scene?.setActive(false);
 $('cancel-build').hidden=false;$('build-progress').hidden=false;$('build-progress').removeAttribute('value');
 try{
  const blob=await (await fetch(photo)).blob();
  const result=await reconstructPhoto(blob,{mode:probe.mode,confirmDownload:probe.requiresDownloadConfirmation,signal:controller.signal,
   onStatus(text,event){$('scene-status').textContent=text;announce(text);if(event.phase!=='download')$('build-progress').removeAttribute('value');},
   onProgress(event){$('build-progress').value=event.ratio;}
  });
  scene.setModel(result.buffer,{hasPhotoUV:result.hasPhotoUV});modelBuffer=result.buffer;modelMethod=result.method;hasPhotoUV=result.hasPhotoUV;current=null;phase=0;
  scene.setHotspot(hotspot);renderStory();buildController=null;closeDialog('photo-dialog');showStory(false);announce('空间做好了。点发光的位置，发现第一条线索。');
 }catch(error){$('scene-status').textContent=error.name==='AbortError'?'制作已取消，照片仍然保留，可以重试。':error.message;announce($('scene-status').textContent);if(error.code==='MODEL_DOWNLOAD_CONFIRMATION_REQUIRED')await inspectModel();}
 finally{if(buildController===controller)buildController=null;$('cancel-build').hidden=true;$('build-progress').hidden=true;scene?.setActive(space==='workshop');setBusy(false);}
};
$('import-still').onclick=()=>{if(!busy)$('still-input').click();};
$('still-input').onchange=async event=>{
 const file=event.target.files[0];event.target.value='';if(!file||busy)return;
 setBusy(true);let url;
 try{
  const record=await unpackStill(file);url=URL.createObjectURL(record.photo);const next=await normalizePhoto(url);
  await scene.setPhoto(next);photo=next;modelBuffer=null;modelMethod='';hasPhotoUV=false;current=null;$('photo-preview').src=photo;showStory(false);renderStory();
  scene.setModel(record.buffer,{hasPhotoUV:record.hasPhotoUV});
  modelBuffer=record.buffer;modelMethod='imported-still';hasPhotoUV=record.hasPhotoUV;current=null;phase=0;
  $('photo-preview').src=photo;$('box-name').value=record.name.slice(0,48);$('scene-kind').value=record.metadata.topic==='laundry'?'laundry':'other';
  hotspot=record.metadata.hotspot&&[record.metadata.hotspot.x,record.metadata.hotspot.y,record.metadata.hotspot.radius].every(v=>Number.isFinite(v)&&v>=0&&v<=1)?{...record.metadata.hotspot}:{x:.5,y:.5,radius:.18};
  scene.setHotspot(hotspot);updateHotspotMarker();$('hotspot-radius').value=hotspot.radius;$('radius-value').textContent=Math.round(hotspot.radius*100)+'%';
  renderStory();showDialog('photo-dialog');$('scene-status').textContent='已导入真实三维。先确认场景；没有照片坐标的旧文件，可回到三维中点选局部标记。';
 }catch(error){$('scene-status').textContent=error.message;announce(error.message);}
 finally{if(url)URL.revokeObjectURL(url);setBusy(false);}
};
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('download-still').onclick=async()=>{
 if(busy||!current?.modelBuffer)return;
 try{const blob=await (await fetch(current.photoDataUrl)).blob();downloadBlob(packStill({photo:blob,buffer:current.modelBuffer,name:current.name,method:current.modelMethod,hasPhotoUV:current.hasPhotoUV,metadata:{topic:current.topic,hotspot:current.hotspot,createdAt:current.createdAt,hasPhotoUV:current.hasPhotoUV}}),current.name+'.still');}
 catch(error){$('publish-status').textContent=error.message;}
};
async function boot(){
 setBusy(true);
 try{
  scene=createClueScene($('stage'),{
   onPhoto(){if(!busy)$('photo-input').click();},
   onStep(value){if(busy||!modelBuffer)return;phase=value;renderStory();showStory();announce(phase===2?'拖住盒子，放到收藏托盘。':'再点发光的位置，继续看下一条线索。');},
   onHotspot(value){if(busy)return;hotspot={...value};updateHotspotMarker();$('hotspot-radius').value=hotspot.radius;$('radius-value').textContent=Math.round(hotspot.radius*100)+'%';},
   onCollect(){void collectBox();},onArchive(){if(busy)return;setView('collection');if(collection==='public')void loadPublic();},onHint:announce
  });
  try{collectiveScene=createCollectiveScene($('collective-stage'),record=>void openRecord(record,collection==='public'));}catch{$('collective-stage').hidden=true;$('collective-caption').hidden=true;}
  photo=await normalizePhoto('sample/photo.jpg');await scene.setPhoto(photo);
  const response=await fetch('sample/model.memorygs');if(!response.ok)throw Error('示例高斯模型暂未加载，请刷新重试。');
  const buffer=await response.arrayBuffer();validateGaussianBuffer(buffer);scene.setModel(buffer,{hasPhotoUV:true});modelBuffer=buffer;modelMethod='sharp-native';hasPhotoUV=true;
  scene.setHotspot(hotspot);renderStory();
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){$('pause-motion').setAttribute('aria-pressed','true');$('pause-motion').textContent='继续粒子';}
  setView('workshop');showStory(false);announce('点一下盒子里发光的位置。');
 }catch(error){$('render-error').hidden=false;$('render-error').textContent='三维暂未完成：'+error.message;announce('可以点照片重试，或从说明查看操作。');}
 setBusy(false);
 try{localRows=await listLocal();}catch{}
 await loadPublic();const id=new URLSearchParams(location.search).get('box');
 if(id){try{const result=await api('/boxes/'+encodeURIComponent(id));if(scene)await openRecord(result.box,true);}catch(error){announce('这个盒子已撤回或暂不可用。'+error.message);}}
}void boot();
