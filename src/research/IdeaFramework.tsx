import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowRight, Download, ExternalLink, FileUp } from 'lucide-react';
import { ideaFields, ideaSources, ideaStages, ideaUpdatedOn } from './ideaFrameworkData';
import './idea-framework.css';

type IdeaDraft = {version:1;fields:Record<string,string>;notes:Record<string,string>;freeNotes:string};
const storageKey='gemos-graduation-photo-machine-idea-v1';
const starterFields=Object.fromEntries(ideaFields.flatMap(group=>group.items.map(item=>[item.key,item.value])));
const starter:IdeaDraft={version:1,fields:starterFields,notes:{},freeNotes:''};
const fieldKeys=Object.keys(starterFields);
const stageIds=ideaStages.map(stage=>stage.id);
function sanitizeDraft(input:unknown):IdeaDraft|null {
  if(!input||typeof input!=='object'||(input as {version?:unknown}).version!==1)return null;
  const value=input as Partial<IdeaDraft>;
  const clean=(source:unknown,key:string,fallback:string)=>source&&typeof source==='object'&&typeof (source as Record<string,unknown>)[key]==='string'?(source as Record<string,string>)[key].slice(0,12000):fallback;
  return {version:1,fields:Object.fromEntries(fieldKeys.map(key=>[key,clean(value.fields,key,starterFields[key])])),notes:Object.fromEntries(stageIds.map(key=>[key,clean(value.notes,key,'')])),freeNotes:typeof value.freeNotes==='string'?value.freeNotes.slice(0,30000):''};
}
function initialDraft():IdeaDraft {try{return sanitizeDraft(JSON.parse(localStorage.getItem(storageKey)||'null'))||starter;}catch{return starter;}}
function saveFile(filename:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function asMarkdown(draft:IdeaDraft){return `# ${draft.fields.title||'新污染物照片记忆机'}\n\n构想框架 · ${ideaUpdatedOn} 起草；这是待研究的作品设想，不是完成的科学结论或技术实现。\n\n${ideaFields.map(group=>`## ${group.section}\n\n${group.items.map(item=>`### ${item.label}\n\n${draft.fields[item.key]||'待填写'}`).join('\n\n')}`).join('\n\n')}\n\n## 用户体验流程\n\n${ideaStages.map((stage,index)=>`### ${index+1}. ${stage.name}｜${stage.verb}\n\n体验：${stage.experience}\n\n这一环的产出：${stage.output}\n\n待验证：${stage.question}\n\n我的补充：${draft.notes[stage.id]||'待填写'}`).join('\n\n')}\n\n## 其他想法与待讨论问题\n\n${draft.freeNotes||'待填写'}\n\n## 资料入口\n\n${ideaSources.map(source=>`- ${source.label}：${source.url}\n  ${source.use}`).join('\n')}\n`}
const readiness=[
  ['已有基础','Gemos Still 的照片入仓、单照片空间重建和可转动的记忆盒体验。', 'https://gemosdodo.art/gemos-still/'],
  ['待做科学内容','确定首个科普议题、问题与路径，核验每一个可视化、反馈和卡片文案。', ''],
  ['待做新交互','场景线索确认、证据匹配、分层可视化、理解任务及错误纠正。', ''],
  ['待做实体与线上','打印、二维码、在线保存与撤回、主题分类、公开权限和维护。', ''],
];
export default function IdeaFramework(){
  const [draft,setDraft]=useState<IdeaDraft>(initialDraft);
  const [active,setActive]=useState(0);
  const [status,setStatus]=useState('');
  const uploadRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(draft));setStatus('已自动保存到当前浏览器');}catch{setStatus('当前浏览器无法保存，请导出备份');}},[draft]);
  const editField=(key:string,value:string)=>setDraft(prev=>({...prev,fields:{...prev.fields,[key]:value}}));
  const editNote=(key:string,value:string)=>setDraft(prev=>({...prev,notes:{...prev.notes,[key]:value}}));
  const importDraft=async(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(file.size>300000){setStatus('文件过大，请选择此前导出的构想备份');return;}
    try{const parsed=sanitizeDraft(JSON.parse(await file.text()));if(!parsed){setStatus('无法识别此备份文件；请导入本页导出的 JSON');return;}setDraft(parsed);setStatus('已导入备份，并保存到当前浏览器');}
    catch{setStatus('备份读取失败，请检查文件格式');}
  };
  const stage=ideaStages[active];
  return <div className="rl-content ri-content" lang="zh-CN">
    <section className="ri-intro"><span className="ri-kicker">作品构想 / 可持续填写的草稿</span><h2>让一张生活照片，<br/>成为一次看见“隐形线索”的探索。</h2><p>这页把你的想法整理成可以继续修改的框架。内容由你补充，科学依据与用户需求也要随着研究逐步填实。</p><div className="ri-intro-meta"><span>初版整理于 {ideaUpdatedOn}</span><span>暂定构想 · 还没有用户调研或效果结论</span></div></section>
    <div className="ri-tools"><div><strong>你的构想工作台</strong><span role="status">{status}</span></div><div className="ri-actions"><button onClick={()=>saveFile('照片里的隐形线索-构想框架.md',asMarkdown(draft),'text/markdown;charset=utf-8')}><Download size={15}/>导出阅读稿</button><button onClick={()=>saveFile('照片里的隐形线索-可编辑备份.json',JSON.stringify(draft,null,2),'application/json;charset=utf-8')}><Download size={15}/>备份编辑内容</button><button onClick={()=>uploadRef.current?.click()}><FileUp size={15}/>导入备份</button><input ref={uploadRef} type="file" accept=".json,application/json" onChange={e=>void importDraft(e)} aria-label="导入构想备份" hidden/></div></div>
    <p className="ri-storage-note">填写内容保存在当前浏览器，不会自动同步到另一台设备。换设备前请下载 JSON 备份，再在新设备导入；阅读稿适合发给导师讨论。</p>
    <nav className="ri-jumps" aria-label="构想框架目录"><a href="#ri-core">01 核心想法</a><a href="#ri-flow">02 完整体验</a><a href="#ri-boundary">03 AI与科学边界</a><a href="#ri-objects">04 机器、卡片和网站</a><a href="#ri-research">05 研究与可行性</a></nav>
    <section id="ri-core" className="ri-section"><div className="ri-section-head"><span>01 / 核心构想</span><h2>先讲清楚这件作品是什么。</h2><p>下面这些话是讨论稿。你可以直接改写，保留自己的语言。</p></div><div className="ri-form-grid">{ideaFields[0].items.map(item=><label className="ri-field" key={item.key}><span>{item.label}</span><textarea value={draft.fields[item.key]} placeholder={item.placeholder} onChange={e=>editField(item.key,e.target.value)} rows={item.key==='title'?2:4} maxLength={12000}/></label>)}</div>
      <div className="ri-logic"><article><small>因为什么</small><p>议题有科普价值，生活情境可能帮助理解难以直接观察的来源与路径；目标受众的实际困难仍待发现。</p></article><ArrowRight size={18}/><article><small>所以想做什么</small><p>让用户在自己的照片里探索有依据的可能关联，并把来源、条件和不确定性一起带走。</p></article><ArrowRight size={18}/><article><small>怎样判断有用</small><p>观察用户能否解释关系、指出照片不能证明的事，并在另一张照片中提出需要核查的信息。</p></article></div>
      <p className="ri-caption">国家政策提出开展新污染物治理科普宣传；它能支持议题价值，具体作品形式的必要性仍要由用户研究与测试论证。<a href={ideaSources[0].url} target="_blank" rel="noopener noreferrer">政策原文<ExternalLink size={12}/></a></p>
    </section>
    <section id="ri-flow" className="ri-section"><div className="ri-section-head"><span>02 / 体验流程</span><h2>从照片进入，到把卡片带走。</h2><p>点击一步，查看这一环的作用和问题；下面的空白处可以随时补充你的想法。</p></div>
      <div className="ri-flow-grid" role="group" aria-label="选择用户体验步骤">{ideaStages.map((item,i)=><button key={item.id} aria-pressed={active===i} onClick={()=>setActive(i)}><small>{String(i+1).padStart(2,'0')}</small><strong>{item.name}</strong><span>{item.verb}</span></button>)}</div>
      <article className="ri-stage-detail"><div className="ri-stage-index">{String(active+1).padStart(2,'0')} / 09</div><div><span className="ri-kicker">{stage.name}</span><h3>{stage.verb}</h3><p>{stage.experience}</p><div className="ri-stage-facts"><p><b>这一环要留下什么</b>{stage.output}</p><p><b>还要回答的问题</b>{stage.question}</p></div><label className="ri-field"><span>我的补充 / 改法 / 草图说明</span><textarea value={draft.notes[stage.id]||''} placeholder="在这里记录你对这一步的设想、画面或导师意见……" onChange={e=>editNote(stage.id,e.target.value)} rows={4} maxLength={12000}/></label><div className="ri-stage-controls"><button disabled={active===0} onClick={()=>setActive(active-1)}>上一步</button><button disabled={active===ideaStages.length-1} onClick={()=>setActive(active+1)}>下一步 <ArrowRight size={14}/></button></div></div></article>
    </section>
    <section id="ri-boundary" className="ri-section"><div className="ri-section-head"><span>03 / 让 AI 说清楚依据</span><h2>照片提供线索，科普内容要能追溯。</h2><p>这一步是整套体验最容易被误读的地方。屏幕上的“污染物效果”需要明确标为教学可视化。</p></div><div className="ri-evidence-layers"><article><span>照片中看见</span><h3>物品与场景</h3><p>例如衣物、洗衣机、水槽。AI可以提出线索，用户可以改正。</p></article><article><span>用户补充</span><h3>材质与使用方式</h3><p>照片通常不能证明衣物是不是合成纤维；标签、用途等信息需确认。</p></article><article><span>资料支持</span><h3>可能的关系</h3><p>只推荐有可靠来源、条件明确的科普议题；没有依据时允许不推荐。</p></article><article><span>教学可视化</span><h3>空间中的推演</h3><p>粒子与路径表现一种有条件的过程，不是该照片的检测结果或风险数值。</p></article></div><div className="ri-boundary-note"><b>界面上的关键表达</b><p>“这张照片里看到了什么”→“你确认了什么”→“资料说明什么情况可能发生”→“还有哪些事情现在不能判断”。</p><p>如果作品呈现某类物质，应同时说明推荐原因、适用条件、来源和更新时间。不能用图像模型输出的置信度代替科学证据。</p></div>
      <div className="ri-form-grid">{ideaFields[2].items.map(item=><label className="ri-field" key={item.key}><span>{item.label}</span><textarea value={draft.fields[item.key]} placeholder={item.placeholder} onChange={e=>editField(item.key,e.target.value)} rows={4} maxLength={12000}/></label>)}</div>
    </section>
    <section id="ri-objects" className="ri-section"><div className="ri-section-head"><span>04 / 三个互相连接的载体</span><h2>体验发生在机器里，也留在卡片和网站上。</h2></div><div className="ri-object-grid"><article><span>① MACHINE</span><h3>现场的记忆机器</h3><p>拍照入仓、空间重建、线索确认和3D探索。</p></article><article><span>② TAKEAWAY</span><h3>可以带走的卡片</h3><p>趣味化照片、简短知识、条件说明与二维码。</p></article><article><span>③ ARCHIVE</span><h3>可以回看的网页</h3><p>按科普议题收藏场景、继续阅读和选择是否公开。</p></article></div><div className="ri-form-grid">{ideaFields[3].items.map(item=><label className="ri-field" key={item.key}><span>{item.label}</span><textarea value={draft.fields[item.key]} placeholder={item.placeholder} onChange={e=>editField(item.key,e.target.value)} rows={4} maxLength={12000}/></label>)}</div>
      <div className="ri-card-preview"><div className="ri-card-illustration"><span>YOUR EVERYDAY SCENE</span><div className="ri-card-window"><span>照片 / 空间画面</span></div></div><div className="ri-card-back"><span>记忆卡 · 草图</span><h3>{draft.fields.title||'工作名称待填写'}</h3><p>一条经核验的知识</p><small>适用条件与来源，待定稿</small><div className="ri-qr-placeholder">二维码<br/>位置</div></div><p>卡片结构示意：此处没有生成真实照片、二维码或检测结果。</p></div>
    </section>
    <section id="ri-research" className="ri-section"><div className="ri-section-head"><span>05 / 为开题与制作继续补证据</span><h2>哪些已经有基础，哪些还需要验证？</h2></div><div className="ri-readiness">{readiness.map(([label,body,url])=><article key={label}><strong>{label}</strong><p>{body}</p>{url&&<a href={url} target="_blank" rel="noopener noreferrer">查看作品起点 <ExternalLink size={12}/></a>}</article>)}</div><div className="ri-form-grid">{ideaFields[1].items.map(item=><label className="ri-field" key={item.key}><span>{item.label}</span><textarea value={draft.fields[item.key]} placeholder={item.placeholder} onChange={e=>editField(item.key,e.target.value)} rows={4} maxLength={12000}/></label>)}{ideaFields[4].items.map(item=><label className="ri-field" key={item.key}><span>{item.label}</span><textarea value={draft.fields[item.key]} placeholder={item.placeholder} onChange={e=>editField(item.key,e.target.value)} rows={4} maxLength={12000}/></label>)}</div>
      <div className="ri-open-notes"><label className="ri-field"><span>其他想法、疑问、导师反馈</span><textarea value={draft.freeNotes} placeholder="暂时不知道放在哪一栏的想法，先记在这里……" onChange={e=>setDraft(prev=>({...prev,freeNotes:e.target.value}))} rows={6} maxLength={30000}/></label></div><div className="ri-next"><h3>下一版先填实三件事</h3><ol><li>选定一个值得展示的生活情境，并说明照片能够提供什么线索、还要用户补充什么。</li><li>围绕一个科普主题整理内容原文，请专业人士核验路径和卡片文案。</li><li>用真实用户任务判断：空间探索是否帮助解释关系，卡片和扫码是否有后续使用价值。</li></ol></div>
    </section>
    <section className="ri-sources"><h2>目前用于搭框架的资料</h2>{ideaSources.map(source=><article key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} <ExternalLink size={12}/></a><p>{source.use}</p></article>)}<p>这个页面是你的可编辑工作稿；此前的<a href="/graduation/research?view=plan">微塑料路径方案</a>与<a href="/graduation/review">导师版报告</a>仍是独立的讨论稿。确定方向后再统一题名、内容与研究安排。</p></section>
  </div>;
}
