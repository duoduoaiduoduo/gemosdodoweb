import {useCallback, useEffect, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import type {ReportPage} from './reviewDocument';
import './advisor-review.css';

type Point = {x:number;y:number};
type Note = {id:string;page:number;type:'pen'|'text';points?:Point[];x?:number;y?:number;text?:string;createdAt?:string};
type Operation = {method:'POST'|'DELETE';note:Note};
type Tool = 'read'|'pen'|'text';
const ownerStorage = 'gemos-review-owner';
function readOwn(ownStorage:string): string[] {try {const v=JSON.parse(localStorage.getItem(ownStorage)||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[];}catch{return [];}}
function getOwner() {try {const previous=localStorage.getItem(ownerStorage);if(previous)return previous;const key=crypto.randomUUID();localStorage.setItem(ownerStorage,key);return key;}catch{return crypto.randomUUID();}}

export default function AdvisorReviewPage({reportPages,reportRevision,versionLabel,onPendingChange}:{reportPages:ReportPage[];reportRevision:string;versionLabel:string;onPendingChange:(pending:boolean)=>void}) {
  const endpoint = `/api/graduation-review/${reportRevision}`;
  const ownStorage = `gemos-review-own-${reportRevision}`;
  const [tool,setTool]=useState<Tool>('read');
  const [notes,setNotes]=useState<Note[]>([]);
  const [draft,setDraft]=useState<Note|null>(null);
  const draftRef=useRef<Note|null>(null);
  const [textDraft,setTextDraft]=useState<{page:number;x:number;y:number;text:string}|null>(null);
  const [visible,setVisible]=useState(true);
  const [status,setStatus]=useState('正在加载批注…');
  const [ready,setReady]=useState(false);
  const [failed,setFailed]=useState(false);
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const pendingRef=useRef<Operation|null>(null);
  const owner=useRef(getOwner());
  const [own,setOwn]=useState<string[]>(()=>readOwn(ownStorage));
  const [zoom,setZoom]=useState('fit');
  const [scale,setScale]=useState(1);
  const viewportRef=useRef<HTMLDivElement>(null);
  const [shareStatus,setShareStatus]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const interactionRef=useRef(false);
  const blocked = busy || failed || !ready;
  useEffect(()=>{onPendingChange(!!(pendingRef.current||draft||textDraft||busy));},[busy,failed,draft,textDraft,onPendingChange]);
  useEffect(()=>()=>onPendingChange(false),[onPendingChange]);

  const rememberOwn = (ids:string[]) => {setOwn(ids);try{localStorage.setItem(ownStorage,JSON.stringify(ids));}catch{/* Session undo remains available. */}};
  const load=useCallback(async()=>{
    if(busyRef.current || pendingRef.current || interactionRef.current)return;
    try{const response=await fetch(endpoint,{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();
      if(busyRef.current || pendingRef.current || interactionRef.current)return;
      if(!Array.isArray(data.annotations))throw Error();setNotes(data.annotations);setReady(true);setFailed(false);setStatus('批注已同步');
    }catch{if(!busyRef.current&&!pendingRef.current){setFailed(true);setStatus('批注加载失败，请重试');}}
  },[endpoint]);
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),10000);return()=>clearInterval(timer);},[load]);
  useEffect(()=>{
    const title=document.title;document.title='开题报告 · 导师阅览';
    document.documentElement.classList.add('advisor-mode');document.body.classList.add('advisor-mode');window.scrollTo(0,0);
    const warn=(e:BeforeUnloadEvent)=>{if(pendingRef.current||draftRef.current||interactionRef.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);
    return()=>{document.title=title;document.documentElement.classList.remove('advisor-mode');document.body.classList.remove('advisor-mode');window.removeEventListener('beforeunload',warn);};
  },[]);
  useEffect(()=>{
    const host=viewportRef.current;if(!host)return;
    const update=()=>setScale(zoom==='fit'?Math.min(1,(host.clientWidth-24)/760):Number(zoom));
    update();const observer=new ResizeObserver(update);observer.observe(host);return()=>observer.disconnect();
  },[zoom]);
  const save = async (operation:Operation) => {
    if(busyRef.current)return;
    pendingRef.current=operation;busyRef.current=true;setBusy(true);setFailed(false);setStatus('正在保存批注…');
    try{
      const response=await fetch(operation.method==='POST'?endpoint:`${endpoint}/${operation.note.id}`,{method:operation.method,headers:{'Content-Type':'application/json'},body:JSON.stringify({ownerKey:owner.current,...(operation.method==='POST'?{annotation:operation.note}:{})})});
      const data=await response.json();if(!response.ok)throw Error(data.error||'保存失败');
      if(operation.method==='POST') {setNotes(prev=>[...prev.filter(n=>n.id!==operation.note.id),data.annotation]);rememberOwn([...own.filter(id=>id!==operation.note.id),operation.note.id]);}
      else {setNotes(prev=>prev.filter(n=>n.id!==operation.note.id));rememberOwn(own.filter(id=>id!==operation.note.id));setSelected(null);}
      pendingRef.current=null;setFailed(false);setStatus('批注已保存');
    }catch(error){setFailed(true);setStatus(`${error instanceof Error?error.message:'保存失败'}，请重试`);}
    finally{busyRef.current=false;setBusy(false);}
  };
  const add=(note:Note)=>{setNotes(prev=>[...prev,note]);void save({method:'POST',note});};
  const point=(event:ReactPointerEvent<SVGSVGElement>)=>{const r=event.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(760,(event.clientX-r.left)/r.width*760)),y:Math.max(0,Math.min(980,(event.clientY-r.top)/r.height*980))};};
  const start=(event:ReactPointerEvent<SVGSVGElement>,page:number)=>{
    if(blocked||tool==='read'||!visible||!event.isPrimary||event.button!==0)return;
    const p=point(event);event.preventDefault();
    if(tool==='text'){interactionRef.current=true;setTextDraft({page,x:Math.min(540,p.x),y:Math.min(800,p.y),text:''});return;}
    event.currentTarget.setPointerCapture(event.pointerId);interactionRef.current=true;
    const note:Note={id:crypto.randomUUID(),page,type:'pen',points:[p]};draftRef.current=note;setDraft(note);
  };
  const move=(event:ReactPointerEvent<SVGSVGElement>)=>{
    const note=draftRef.current;if(!note||!event.isPrimary)return;
    if((note.points?.length||0)>=3000)return;
    const p=point(event), last=note.points![note.points!.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)<1)return;
    const next={...note,points:[...note.points!,p]};draftRef.current=next;setDraft(next);
  };
  const end=(event:ReactPointerEvent<SVGSVGElement>,cancel=false)=>{
    const note=draftRef.current;if(!note)return;
    draftRef.current=null;setDraft(null);interactionRef.current=false;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(!cancel&&note.points!.length>1)add(note);
  };
  const undo=()=>{const note=[...own].reverse().map(id=>notes.find(n=>n.id===id)).find(Boolean);if(note)void save({method:'DELETE',note});};
  const copyLink=async()=>{try{await navigator.clipboard.writeText(`${location.origin}/graduation/review?version=${encodeURIComponent(reportRevision)}`);setShareStatus('链接已复制');}catch{setShareStatus('请复制浏览器地址分享');}};
  const selectTool=(next:Tool)=>{setTool(next);setVisible(true);setSelected(null);};
  return <main className="advisor-reader">
    <header className="advisor-toolbar" aria-label="报告阅读与批注工具">
      <span className="advisor-toolbar-title">开题报告</span>
      <div className="advisor-tools">{([['read','阅读'],['pen','画笔'],['text','文字批注']] as [Tool,string][]).map(([id,label])=><button key={id} aria-pressed={tool===id} disabled={id!=='read'&&blocked} onClick={()=>selectTool(id)}>{label}</button>)}<button onClick={undo} disabled={blocked||!own.some(id=>notes.some(n=>n.id===id))}>撤销我的批注</button></div>
      <div className="advisor-tools"><label className="advisor-check"><input type="checkbox" checked={visible} onChange={e=>{setVisible(e.target.checked);setTool('read');}}/>显示批注</label><label><span className="advisor-sr">页面缩放</span><select aria-label="页面缩放" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">适合屏幕</option><option value="1">100%</option><option value="1.25">125%</option></select></label><button onClick={()=>window.print()}>打印</button><button onClick={()=>void copyLink()}>分享链接</button></div>
      <span className={`advisor-save ${failed?'is-error':''}`} role="status">{status}{shareStatus ? ` · ${shareStatus}` : ''}</span>{failed&&<button disabled={busy} onClick={()=>pendingRef.current?void save(pendingRef.current):void load()}>重试</button>}
    </header>
    <div className="advisor-instructions">{tool==='read'?'可直接阅读正文。需要圈画时选择“画笔”，文字意见可点“文字批注”后落在页面上。':tool==='pen'?'在纸面上拖动画线或圈画；触屏上下翻页请先切回“阅读”。':'点击纸面上的位置，填写文字意见。'}<span>批注保存在服务器 · 持链接可阅读、批注和修改正文</span></div>
    <div className="advisor-document" ref={viewportRef}>
      {reportPages.map((page,index)=><section className="advisor-sheet-wrap" key={index} style={{width:760*scale,height:980*scale}} aria-label={`第 ${index+1} 页：${page.title}`}>
        <article className="advisor-sheet" style={{transform:`scale(${scale})`}}>
          <div className="advisor-running">信息与交互设计 · 硕士<span>{versionLabel}</span></div>
          {index===0&&<><h1>新污染物科普方向<br/>开题报告</h1><p className="advisor-draft-label">研究讨论稿，非正式定稿 · 开题日期：2026年11月13日</p></>}
          <h2>{page.title}</h2>
          {page.paragraphs.map((p,i)=><p className="advisor-paragraph" key={i}>{p}</p>)}
          {'links' in page && page.links?.map(([label,url])=><a className="advisor-source" href={url} key={url} target="_blank" rel="noopener noreferrer">{label}</a>)}
          <p className="advisor-pending">{page.pending}</p>
          <footer className="advisor-page-number">{index+1} / {reportPages.length}</footer>
          <svg className={`advisor-ink tool-${tool}`} viewBox="0 0 760 980" aria-label={`第 ${index+1} 页批注画布`} style={{pointerEvents:tool==='read'?'none':'auto',touchAction:tool==='read'?'auto':'none'}} onPointerDown={e=>start(e,index)} onPointerMove={move} onPointerUp={end} onPointerCancel={e=>end(e,true)}>
            {visible&&[...notes,...(draft?[draft]:[])].filter(n=>n.page===index&&n.type==='pen').map(n=><polyline key={n.id} points={n.points?.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#b42318" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"/>)}
          </svg>
          {visible&&notes.filter(n=>n.page===index&&n.type==='text').map(n=><div key={n.id} className="advisor-text-note" style={{left:n.x,top:n.y,pointerEvents:tool==='read'?'auto':'none'}}><button className="advisor-note-content" onClick={()=>setSelected(selected===n.id?null:n.id)} aria-expanded={selected===n.id}>{n.text}</button>{selected===n.id&&own.includes(n.id)&&<button className="advisor-delete-note" disabled={blocked} onClick={()=>void save({method:'DELETE',note:n})}>删除我的这条批注</button>}</div>)}
        </article>
      </section>)}
    </div>
    {textDraft&&<div className="advisor-modal-backdrop"><section className="advisor-note-dialog" role="dialog" aria-modal="true" aria-labelledby="advisor-note-title" onKeyDown={e=>{if(e.key==='Escape'){setTextDraft(null);interactionRef.current=false;}if(e.key==='Tab'){const nodes=Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('textarea,button:not(:disabled)'));const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}><h2 id="advisor-note-title">文字批注 · 第 {textDraft.page+1} 页</h2><textarea autoFocus aria-label="批注内容" maxLength={500} value={textDraft.text} onChange={e=>setTextDraft({...textDraft,text:e.target.value})}/><p>{textDraft.text.length} / 500</p><div><button onClick={()=>{setTextDraft(null);interactionRef.current=false;}}>取消</button><button disabled={!textDraft.text.trim()} onClick={()=>{add({id:crypto.randomUUID(),type:'text',...textDraft});setTextDraft(null);interactionRef.current=false;setTool('read');}}>保存批注</button></div></section></div>}
  </main>;
}
