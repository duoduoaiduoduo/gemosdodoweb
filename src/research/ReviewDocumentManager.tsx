import {useCallback, useEffect, useState} from 'react';
import AdvisorReviewPage from './AdvisorReviewPage';
import type {ReportPage} from './reviewDocument';
import './advisor-review.css';

type DocumentVersion={revision:string;label:string;createdAt:string;sections:ReportPage[];pages:ReportPage[];title?:string;outlineFormat?:'reference';downloads?:string[][];coverNote?:string};
type Bundle={document:DocumentVersion;latestRevision:string;versions:{revision:string;label:string;createdAt:string}[]};
type Draft={baseRevision:string;sections:ReportPage[];requestId:string};
const reviewModes={
  proposal:{apiBase:'/api/graduation-review',storagePrefix:'gemos-review',sharePath:'/graduation/review',documentName:'开题报告'},
  thesis:{apiBase:'/api/thesis-review',storagePrefix:'gemos-thesis-review',sharePath:'/graduation/thesis-review',documentName:'硕士专业学位论文'},
};
const getDraft=(draftKey:string):Draft|null=>{try{const d=JSON.parse(localStorage.getItem(draftKey)||'null');return d&&typeof d.baseRevision==='string'&&typeof d.requestId==='string'&&Array.isArray(d.sections)&&d.sections.length>0&&d.sections.length<=20&&d.sections.every((s:ReportPage)=>s&&typeof s.title==='string'&&Array.isArray(s.paragraphs)&&s.paragraphs.every(p=>typeof p==='string')&&typeof s.pending==='string')?d:null;}catch{return null;}};
function ownerKey(storagePrefix:string){const storageKey=`${storagePrefix}-owner`;let key=localStorage.getItem(storageKey);if(!key){key=crypto.randomUUID();localStorage.setItem(storageKey,key);}return key;}

export default function ReviewDocumentManager({documentKind='proposal'}:{documentKind?:keyof typeof reviewModes}){
  const mode=reviewModes[documentKind];
  const url=`${mode.apiBase}/document`;
  const draftKey=`${mode.storagePrefix}-document-draft`;
  const [bundle,setBundle]=useState<Bundle|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [editing,setEditing]=useState<Draft|null>(null);
  const [availableDraft,setAvailableDraft]=useState<Draft|null>(()=>getDraft(draftKey));
  const [saving,setSaving]=useState(false);
  const [annotationPending,setAnnotationPending]=useState(false);
  const [backup,setBackup]=useState('');
  const [compare,setCompare]=useState<DocumentVersion|null>(null);
  const [comparing,setComparing]=useState(false);
  const [message,setMessage]=useState('');
  const load=useCallback(async(revision?:string)=>{
    setLoading(true);setError('');setCompare(null);
    try{const response=await fetch(url+(revision?`?revision=${encodeURIComponent(revision)}`:''),{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'报告加载失败');setBundle(data);const address=new URL(location.href);if(revision)address.searchParams.set('version',revision);else address.searchParams.delete('version');history.replaceState(null,'',address);}
    catch(e){setError(e instanceof Error?e.message:'报告加载失败，请重试');}finally{setLoading(false);}
  },[url]);
  useEffect(()=>{void load(new URLSearchParams(location.search).get('version')||undefined);},[load]);
  useEffect(()=>{document.documentElement.classList.add('review-manager-mode');document.body.classList.add('review-manager-mode');return()=>{document.documentElement.classList.remove('review-manager-mode');document.body.classList.remove('review-manager-mode');};},[]);
  useEffect(()=>{if(!editing)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[editing]);
  const retain=(draft:Draft)=>{setEditing(draft);try{localStorage.setItem(draftKey,JSON.stringify(draft));setAvailableDraft(draft);setBackup('修改已暂存到当前浏览器；点“保存新版本”后才会同步。');}catch{setBackup('当前浏览器无法暂存，请及时保存或导出。');}};
  const change=(index:number,field:'title'|'paragraphs'|'pending',value:string)=>{if(!editing)return;const sections=editing.sections.map((s,i)=>i===index?{...s,[field]:field==='paragraphs'?value.split('\n\n'):value}:s);retain({...editing,sections,requestId:crypto.randomUUID()});};
  const start=()=>{if(!bundle)return;setError('');setCompare(null);retain({baseRevision:bundle.document.revision,sections:structuredClone(bundle.document.sections),requestId:crypto.randomUUID()});};
  const save=async()=>{
    if(!editing||saving)return;setSaving(true);setError('');
    try{let key:string;try{key=ownerKey(mode.storagePrefix);}catch{key=editing.requestId;}const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...editing,ownerKey:key})});const data=await response.json();if(!response.ok)throw Error(data.error||'保存失败，请重试');
      setBundle(data);setEditing(null);setAvailableDraft(null);try{localStorage.removeItem(draftKey);}catch{}setMessage('正文已保存为新版本。旧稿与旧批注已保留。');const address=new URL(location.href);address.searchParams.delete('version');history.replaceState(null,'',address);window.scrollTo(0,0);
    }catch(e){setError(e instanceof Error?e.message:'保存失败，请重试');}finally{setSaving(false);}
  };
  const exportDraft=()=>{if(!editing)return;const content=editing.sections.map(s=>`${s.title}\n\n${s.paragraphs.join('\n\n')}\n\n${s.pending}`).join('\n\n');const href=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=href;a.download=`${mode.documentName}修改稿.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);};
  const comparePrevious=async()=>{if(!bundle)return;if(compare){setCompare(null);return;}const index=bundle.versions.findIndex(v=>v.revision===bundle.document.revision);if(index<1)return;setComparing(true);setError('');try{const response=await fetch(`${url}?revision=${bundle.versions[index-1].revision}`);if(!response.ok)throw Error('旧版加载失败，请重试');const data=await response.json();setCompare(data.document);}catch(e){setError(e instanceof Error?e.message:'对照加载失败');}finally{setComparing(false);}};
  // The seven-section report adds a schedule before the old final references section.
  const previousSections=compare
    ? documentKind==='proposal'&&bundle?.document.sections.length===7&&compare.sections.length===6
      ? [...compare.sections.slice(0,5),undefined,compare.sections[5]]
      : compare.sections
    : [];
  return <div className="review-manager">
    <nav className="review-document-nav" aria-label="毕业研究文档">
      {[['/graduation','研究工作台'],['/graduation/review','开题报告'],['/graduation/thesis-review','硕士论文']].map(([href,label])=>editing||annotationPending?<span key={href} aria-disabled="true">{label}</span>:<a key={href} href={href} aria-current={href===mode.sharePath?'page':undefined}>{label}</a>)}
    </nav>
    <header className="review-version-bar">
      {editing?<><strong>编辑正文</strong><span>保存时自动分页，并保留旧版本。</span><button disabled={saving} onClick={()=>void save()}>{saving?'正在保存…':'保存新版本'}</button><button disabled={saving} onClick={()=>{setEditing(null);setError('');}}>退出编辑</button><button onClick={exportDraft}>导出修改稿</button></>:<><label>{documentKind==='thesis'?'论文版本':'报告版本'} <select aria-label={documentKind==='thesis'?'论文版本':'报告版本'} disabled={loading||annotationPending} value={bundle?.document.revision||''} onChange={e=>void load(e.target.value)}>{bundle?.versions.map(v=><option value={v.revision} key={v.revision}>{v.label} · {new Date(v.createdAt).toLocaleDateString('zh-CN')}</option>)}</select></label><button disabled={loading||annotationPending||!bundle||bundle.document.revision!==bundle.latestRevision} onClick={start}>编辑正文</button>{bundle&&bundle.document.revision!==bundle.latestRevision&&<button disabled={annotationPending} onClick={()=>void load()}>打开最新版</button>}<button disabled={loading||annotationPending||comparing||!bundle||bundle.versions[0].revision===bundle.document.revision} onClick={()=>void comparePrevious()}>{compare?'结束对照':'与上一版对照'}</button>{availableDraft&&<button disabled={annotationPending||loading} onClick={()=>{retain(availableDraft);setError('');}}>恢复未保存修改</button>}</>}
      {bundle?.document.downloads?.map(([label,href])=><a href={href} key={href} target="_blank" rel="noopener noreferrer">{label}</a>)}
    </header>
    {error&&<div className="review-message review-error" role="alert">{error}{!editing&&<button onClick={()=>void load()}>重新加载</button>}</div>}
    {message&&!editing&&<p className="review-message" role="status">{message}</p>}
    {documentKind==='thesis'&&bundle&&!editing&&!compare&&!loading&&<nav className="review-thesis-chapters" aria-label="论文章节导航">{bundle.document.sections.map((section,index)=>{const pageIndex=bundle.document.pages.findIndex(page=>page.title===section.title);return <button key={index} disabled={annotationPending} onClick={()=>document.getElementById(`review-page-${pageIndex+1}`)?.scrollIntoView({behavior:'smooth',block:'start'})}>{/^第.+章/.test(section.title)?section.title.split(' ')[0]:section.title}</button>;})}</nav>}
    {editing?<main className="review-editor"><p className="review-edit-status" role="status">{backup}</p>{editing.sections.map((s,i)=><section className="review-edit-section" key={i}><label>第 {i+1} 部分标题<input aria-label={`第${i+1}部分标题`} maxLength={80} value={s.title} disabled={saving} onChange={e=>change(i,'title',e.target.value)}/></label><label>正文<textarea aria-label={`第${i+1}部分正文`} value={s.paragraphs.join('\n\n')} disabled={saving} onChange={e=>change(i,'paragraphs',e.target.value)}/></label><label>待补充说明（可删除）<textarea className="review-pending-input" aria-label={`第${i+1}部分待补充说明`} maxLength={400} value={s.pending} disabled={saving} onChange={e=>change(i,'pending',e.target.value)}/></label></section>)}<button className="review-save-bottom" disabled={saving} onClick={()=>void save()}>保存新版本</button></main>
      :loading?<p className="review-message" role="status">正在加载报告…</p>
      :bundle&&compare?<main className="review-comparison"><p>左侧：{compare.label}　右侧：{bundle.document.label}。发生改动的章节以浅色背景标出。</p>{bundle.document.sections.map((s,i)=>{const old=previousSections[i];const changed=JSON.stringify(old)!==JSON.stringify(s);return <section key={i} className={changed?'changed':''}><h2>{s.title}{!old?' · 新增部分':changed?' · 有修改':' · 未修改'}</h2><div>{[old,s].map((part,j)=><article key={j}><h3>{j===0?compare.label:bundle.document.label}</h3>{part?<><strong>{part.title}</strong>{part.paragraphs.map((p,k)=><p key={k}>{p}</p>)}{Boolean(part.images?.length||part.tables?.length||part.links?.length)&&<p>附件：{part.images?.length||0} 张草图 · {part.tables?.length||0} 张表格 · {part.links?.length||0} 条来源链接</p>}<small>{part.pending}</small></>:<p>上一版没有此部分。</p>}</article>)}</div></section>;})}</main>
      :bundle?<div key={`${mode.apiBase}:${bundle.document.revision}`}><AdvisorReviewPage reportPages={bundle.document.pages} reportRevision={bundle.document.revision} documentTitle={bundle.document.title} outlineFormat={bundle.document.outlineFormat} coverNote={bundle.document.coverNote} apiBase={mode.apiBase} storagePrefix={mode.storagePrefix} sharePath={mode.sharePath} documentName={mode.documentName} versionLabel={`${bundle.document.label} · ${new Date(bundle.document.createdAt).toLocaleDateString('zh-CN')}`} onPendingChange={setAnnotationPending}/></div>:null}
  </div>;
}
