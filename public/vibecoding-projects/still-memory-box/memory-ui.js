import { memoryBox } from './main.js';
const $=id=>document.getElementById(id);
let current=null,offline=false,selection=0,pollTimer=null,busy=false,ceremonyId=null;
const labels={queued:0,loading:1,inference:1,assembling:2,packing:2,complete:3};
function notice(message=''){ $('notice').textContent=message;$('notice').hidden=!message; }
async function api(url,options={}){
  const r=await fetch(url,options);
  if(!r.ok){let error;try{error=await r.json();}catch{error={};}throw new Error(typeof error.detail==='string'?error.detail:`操作未完成（${r.status}），请重试。`);}
  return r.json();
}
function remember(id){try{localStorage.setItem('prismatic-current',id);}catch{}}
function render(meta){
  current=meta;$('current-memory').hidden=false;
  $('memory-panel').classList.toggle('has-memory',meta.status==='complete');
  $('photo-preview').src=meta.photo_url;
  $('memory-name').textContent=meta.name;
  $('memory-date').textContent=new Date(meta.created_at).toLocaleDateString('zh-CN');
  $('job-message').textContent=meta.message??'这段记忆，已经收藏。';
  $('steps').hidden=['complete','failed'].includes(meta.status);
  [...$('steps').children].forEach((li,i)=>{li.className=i<labels[meta.stage]?'done':i===labels[meta.stage]?'active':'';});
  $('retry').hidden=meta.status!=='failed'||offline;
  $('memory-actions').hidden=meta.status!=='complete';
  $('download-memory').hidden=offline;
  $('save-settings').textContent=offline?'保存设置到本机':'保存设置';
  if(!offline){$('library').value=meta.id;remember(meta.id);history.replaceState(null,'',`?memory=${meta.id}`);}
}
async function refreshLibrary(){
  if(offline)return [];
  const items=await api('/api/memories');
  $('library').replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='选择一份记忆…';$('library').append(placeholder);
  for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=`${item.name}${item.status==='complete'?'':item.status==='failed'?' · 可重试':' · 制作中'}`;$('library').append(option);}
  $('library-section').hidden=!items.length;$('memory-count').textContent=items.length;
  if(current)$('library').value=current.id;
  return items;
}
async function openMemory(meta){
  const reveal=ceremonyId===meta.id;
  if(!reveal){memoryBox.cancelCreation();ceremonyId=null;}
  const token=++selection;clearTimeout(pollTimer);notice();render(meta);
  if(meta.status==='complete'){
    $('job-message').textContent='正在打开这段记忆…';
    try{
      await memoryBox.load(meta.model_url,meta.settings,reveal);
      if(token!==selection)return;
      if(reveal)ceremonyId=null;
      $('job-message').textContent='已收藏 · 可随时重返';
    }catch(e){if(token!==selection)return;memoryBox.cancelCreation();ceremonyId=null;notice(e.message);$('job-message').textContent='记忆已保存，暂时未能显示。';}
  }else if(meta.status!=='failed'&&!offline){
    ceremonyId=meta.id;memoryBox.waiting(meta.message||'正在重建这一刻');
    pollTimer=setTimeout(()=>poll(meta.id,token),1500);
  }else if(meta.status==='failed'){memoryBox.cancelCreation();ceremonyId=null;notice(meta.message||'制作未完成，请重试。');toggleSidebar(true);}
}
async function poll(id,token){
  if(token!==selection)return;
  try{
    const meta=await api(`/api/memories/${id}`);
    if(token!==selection)return;
    if(meta.status==='complete'||meta.status==='failed'){await refreshLibrary();if(token!==selection)return;await openMemory(meta);}
    else{render(meta);memoryBox.waiting(meta.message);pollTimer=setTimeout(()=>poll(id,token),1500);}
  }catch(e){if(token!==selection)return;notice('连接暂时中断。制作仍在本机继续，将自动重连。');pollTimer=setTimeout(()=>poll(id,token),3500);}
}
async function create(file){
  if(!file||busy||offline)return;
  notice();
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){notice('请选择 JPG、PNG 或 WebP 照片。');return;}
  if(file.size>25*1024*1024){notice('照片不能超过 25 MB。');return;}
  busy=true;selection++;clearTimeout(pollTimer);toggleSidebar(false);$('library').disabled=true;$('choose-photo').disabled=true;$('choose-photo').textContent='正在存入记忆…';
  try{
    const name=file.name.replace(/\.[^.]+$/,'').slice(0,60)||'一段记忆';
    const results=await Promise.allSettled([
      api(`/api/memories?name=${encodeURIComponent(name)}`,{method:'POST',headers:{'Content-Type':file.type},body:file}),
      memoryBox.beginCreation(file,name)
    ]);
    if(results[0].status==='rejected')throw results[0].reason;
    const meta=results[0].value;
    if(results[1].status==='rejected')notice('风景卡暂未显示，照片制作仍在继续。');
    ceremonyId=meta.id;await refreshLibrary();await openMemory(meta);
  }catch(e){memoryBox.cancelCreation();ceremonyId=null;notice(e.message);toggleSidebar(true);}
  finally{busy=false;$('library').disabled=false;$('choose-photo').disabled=false;$('choose-photo').textContent='＋ 新建记忆';$('photo-input').value='';}
}
$('choose-photo').onclick=()=>$('photo-input').click();
$('photo-input').onchange=e=>create(e.target.files[0]);
$('library').onchange=async e=>{if(!e.target.value)return;try{await openMemory(await api(`/api/memories/${e.target.value}`));}catch(e){notice(e.message);}};
$('retry').onclick=async()=>{if(!current)return;try{await openMemory(await api(`/api/memories/${current.id}/retry`,{method:'POST'}));await refreshLibrary();}catch(e){notice(e.message);}};
async function saveSettings(){
  if(!current||current.status!=='complete')return;
  const selected=current;
  const settings=memoryBox.getSettings();
  if(offline){localStorage.setItem(`memory-settings-${current.id}`,JSON.stringify(settings));current.settings=settings;}
  else {const saved=await api(`/api/memories/${selected.id}/settings`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});if(current?.id===selected.id)current=saved;}
  return {...selected,settings};
}
$('save-settings').onclick=async()=>{try{await saveSettings();notice('材质和当前视角已保存。');}catch(e){notice(e.message);}};
$('download-memory').onclick=async()=>{
  if(!current||current.status!=='complete')return;
  const button=$('download-memory');button.disabled=true;button.textContent='正在打包记忆…';
  try{
    const saved=await saveSettings();
    const response=await fetch(saved.download_url);
    if(!response.ok)throw new Error('记忆包下载失败，请重试。');
    const blob=await response.blob(),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`${saved.name.replace(/[\\/:*?"<>|]/g,'_')}-记忆盒子.zip`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    notice('完整记忆包已下载。解压后按「阅读我」打开，无需 SHARP 或联网。');
  }catch(e){notice(e.message);}finally{button.disabled=false;button.textContent='收藏到本机 ↓';}
};
$('replay-creation').onclick=async()=>{
  if(busy||!current||current.status!=='complete')return;
  const meta=current,token=++selection;clearTimeout(pollTimer);busy=true;
  $('choose-photo').disabled=true;$('library').disabled=true;toggleSidebar(false);
  try{
    const response=await fetch(meta.photo_url);if(!response.ok)throw new Error('无法读取原照片。');
    await memoryBox.beginCreation(await response.blob(),meta.name);
    await new Promise(resolve=>setTimeout(resolve,1500));
    if(token===selection)await memoryBox.load(meta.model_url,meta.settings,true);
  }catch(e){memoryBox.cancelCreation();notice(e.message);toggleSidebar(true);}
  finally{busy=false;$('choose-photo').disabled=false;$('library').disabled=false;}
};
$('snapshot').onclick=()=>{const a=document.createElement('a');a.download='memory-box.png';a.href=memoryBox.capture();a.click();};
for(const event of ['dragenter','dragover'])document.addEventListener(event,e=>{e.preventDefault();if(!offline)document.body.classList.add('dragging');});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('dragging');});
document.addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('dragging');create(e.dataTransfer.files[0]);});
function toggleSidebar(force){const open=force??!document.body.classList.contains('sidebar-open');document.body.classList.toggle('sidebar-open',open);$('toggle-sidebar').setAttribute('aria-expanded',String(open));$('toggle-sidebar').textContent=open?'关闭':'调整';$('close-sidebar').hidden=!open;}
$('toggle-sidebar').onclick=()=>toggleSidebar();$('close-sidebar').onclick=()=>toggleSidebar(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleSidebar(false);});
async function boot(){
 offline=true;
 $('library-section').hidden=true;$('creation').hidden=false;
 $('choose-photo').textContent='体验收藏过程';$('choose-photo').onclick=()=>$('replay-creation').click();
 $('connection').textContent='在线展示版 · 调整仅保存在当前浏览器';
 document.querySelector('.format-note').textContent='照片生成暂未开放';
 try{
  const meta=await api('./memory.json');
  try{const saved=localStorage.getItem(`memory-settings-${meta.id}`);if(saved)meta.settings=JSON.parse(saved);}catch{}
  await openMemory(meta);
 }catch(e){notice('记忆暂未加载，请刷新重试。');}
}
boot();
