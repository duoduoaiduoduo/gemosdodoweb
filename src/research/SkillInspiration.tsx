import {useMemo, useState} from 'react';
import {ArrowDown, ArrowUpRight, Bookmark, Check, ChevronDown, Download, Image as ImageIcon, Search} from 'lucide-react';
import {personalInspirationNotes, skillInspirationImportInfo, skillInspirationItems} from './skillInspirationData';
import type {SkillInspirationItem} from './skillInspirationData';
import './skill-inspiration.css';

const categories = ['全部', 'Skill与提示词', '照片风格与排版', '互动工具', '传播与二创', '其他待整理'];
const pageSize = 24;
const dateLabel = (value:string) => value.replaceAll('-', '.');

function InspirationCard({item, expanded, onToggle}:{item:SkillInspirationItem;expanded:boolean;onToggle:()=>void}) {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const images = item.images.filter(src=>!failedImages.includes(src));
  const dates = [...item.recordedDates].sort();
  return <article className={`si-card${expanded?' is-expanded':''}`}>
    {images.length>0&&<div className="si-card-images">{images.map((src,index)=><a href={src} key={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={`${item.title} · 收藏图 ${index+1}`} loading="lazy" onError={()=>setFailedImages(previous=>[...previous,src])}/></a>)}</div>}
    <div className="si-card-main">
      <div className="si-card-top"><span className="si-platform">{item.platform}</span><span>{item.category}</span></div>
      <h3><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a></h3>
      <div className="si-card-meta"><span>收藏 {dateLabel(dates.at(-1)||'')}</span><span><ImageIcon size={13} aria-hidden="true"/>{images.length?`${images.length} 张图`:'待补图'}</span></div>
      <div className="si-card-actions"><a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`打开原帖：${item.title}`}>打开原帖<ArrowUpRight size={14} aria-hidden="true"/></a><button type="button" aria-expanded={expanded} aria-controls={`si-detail-${item.id}`} onClick={onToggle}>{expanded?'收起':'收藏详情'}<ChevronDown size={14} aria-hidden="true"/></button></div>
    </div>
    {expanded&&<div className="si-card-detail" id={`si-detail-${item.id}`}>
      <dl><dt>核读状态</dt><dd>待核读 · 目前保留你发来的标题与原帖入口。</dd><dt>收藏记录日期</dt><dd>{dates.map(dateLabel).join('、')}<small>来自粘贴记录，未作为作品发布时间。</small></dd>{Boolean(item.titleVariants?.length)&&<><dt>同一链接的其他标题</dt><dd>{item.titleVariants!.join('；')}</dd></>}<dt>图片与模板</dt><dd>{images.length?'已收到的图片保存在上方。':'本批附件为文字链接，尚未收到这条的图片、提示词正文或 Skill 文件。'}</dd></dl>
      <a className="si-source-url" href={item.url} target="_blank" rel="noopener noreferrer">{new URL(item.url).origin+new URL(item.url).pathname}<ArrowUpRight size={12} aria-hidden="true"/></a>
    </div>}
  </article>;
}

export default function SkillInspiration() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [platform, setPlatform] = useState('全部平台');
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [exported, setExported] = useState(false);
  const platforms = useMemo(()=>['全部平台', ...new Set(skillInspirationItems.map(item=>item.platform))],[]);
  const counts = useMemo(()=>Object.fromEntries(categories.map(name=>[name,skillInspirationItems.filter(item=>name==='全部'||item.category===name).length])),[]);
  const filtered = useMemo(()=>skillInspirationItems.filter(item=>(category==='全部'||item.category===category)&&(platform==='全部平台'||item.platform===platform)&&`${item.title} ${item.titleVariants?.join(' ')||''} ${item.tags.join(' ')} ${item.platform}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),[query,category,platform]);
  const resetResults = () => {setVisibleCount(pageSize);setExpanded(null);};
  const resetFilters = () => {setQuery('');setCategory('全部');setPlatform('全部平台');resetResults();};
  const exportCollection = () => {
    const content={collection:'Skill模板与灵感案例',status:'独立收藏，未纳入论文',personalNotes:personalInspirationNotes,importInfo:skillInspirationImportInfo,items:skillInspirationItems};
    const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json;charset=utf-8'}));
    const exportDate=[skillInspirationImportInfo.importedAt,...personalInspirationNotes.map(note=>note.recordedAt)].sort().at(-1);
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`Skill模板与灵感案例-${exportDate}.json`;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);setExported(true);
  };
  return <div className="rl-content si-content">
    <section className="si-intro" aria-labelledby="si-intro-title"><div className="si-intro-symbol"><Bookmark size={24} strokeWidth={1.5} aria-hidden="true"/></div><div><span className="rl-label">独立案例收藏 · 尚未写入论文</span><h2 id="si-intro-title">先收藏，再慢慢拆解。</h2><p>把你发来的 Skill、提示词、照片玩法和传播案例放在这里。分类先依据收藏标题，具体内容、作者和使用方法留待核读；后续收到图片与模板，会继续补在对应条目中。</p></div></section>
    <section className="si-personal-notes" aria-labelledby="si-personal-title">
      <h2 id="si-personal-title">个人灵感记录</h2>
      {personalInspirationNotes.map(note=><article key={note.id} id={note.id}>
        <div className="si-personal-meta"><span>构思记录</span><time dateTime={note.recordedAt}>{dateLabel(note.recordedAt)}</time></div>
        <h3>{note.title}</h3>
        <blockquote>{note.originalIdea}</blockquote>
        <dl>{note.points.map(point=><div key={point.title}><dt>{point.title}</dt><dd>{point.text}</dd></div>)}</dl>
        <p className="si-personal-status">{note.status}</p>
      </article>)}
    </section>
    <div className="si-summary" aria-label="本次整理情况"><p><strong>{skillInspirationItems.length}</strong><span>条去重收藏</span></p><p><strong>{skillInspirationImportInfo.sourceFiles}</strong><span>份文字合集</span></p><p><strong>{skillInspirationImportInfo.duplicates}</strong><span>条重复已合并</span></p><p><strong>{skillInspirationImportInfo.missingLinks}</strong><span>条空链接待补</span></p></div>
    <section className="si-browser" aria-label="浏览灵感收藏">
      <div className="si-toolbar"><label className="si-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="搜索灵感收藏" placeholder="找一个玩法：拼贴、旅行、Skill、排版…" value={query} onChange={event=>{setQuery(event.target.value);resetResults();}}/></label><label className="si-platform-filter"><span className="si-sr-only">筛选平台</span><select aria-label="筛选平台" value={platform} onChange={event=>{setPlatform(event.target.value);resetResults();}}>{platforms.map(name=><option key={name}>{name}</option>)}</select></label><button type="button" className="si-export" onClick={exportCollection}>{exported?<Check size={16} aria-hidden="true"/>:<Download size={16} aria-hidden="true"/>}{exported?'已导出全部':'导出全部收藏'}</button></div>
      <div className="si-categories" role="group" aria-label="按灵感类别筛选">{categories.map(name=><button key={name} type="button" aria-pressed={category===name} onClick={()=>{setCategory(name);resetResults();}}>{name}<span>{counts[name]}</span></button>)}</div>
      <div className="si-results"><p role="status" aria-live="polite">找到 {filtered.length} 条{filtered.length>visibleCount?` · 先显示 ${visibleCount} 条`:''}</p>{(query||category!=='全部'||platform!=='全部平台')&&<button type="button" onClick={resetFilters}>清除筛选</button>}<span>最近收藏在前 · 原帖标题未核读</span></div>
      {filtered.length?<div className="si-grid">{filtered.slice(0,visibleCount).map(item=><div key={item.id}><InspirationCard item={item} expanded={expanded===item.id} onToggle={()=>setExpanded(previous=>previous===item.id?null:item.id)}/></div>)}</div>:<div className="si-empty"><Search size={26} strokeWidth={1.5} aria-hidden="true"/><h3>还没找到这条收藏</h3><p>试试“照片”“拼贴”或“Skill”，也可以清除筛选查看全部。</p><button type="button" onClick={resetFilters}>查看全部收藏</button></div>}
      {filtered.length>visibleCount&&<div className="si-more"><button type="button" onClick={()=>setVisibleCount(previous=>previous+pageSize)}>再看 {Math.min(pageSize,filtered.length-visibleCount)} 条<ArrowDown size={15} aria-hidden="true"/></button><span>还有 {filtered.length-visibleCount} 条收藏</span></div>}
    </section>
    <details className="si-import-note"><summary>这批收藏怎么整理的？</summary><p>2026.10.15 从你发来的两份文字合集导入，共 {skillInspirationImportInfo.rawEntries} 条记录。相同作品按原帖标识去重；有链接的条目全部保留，标题不明确或暂时无关的放进“其他待整理”。{skillInspirationImportInfo.missingLinks} 条记录没有可用网址，未生成空白卡片。</p><p>本次附件没有独立图片，也尚未取得模板文件。页面中的标题保留原有表述，热度数字和标题中的事件均未作事实核验；此处只作灵感索引。链接去除了分享者和传播追踪参数，保留打开原帖所需的信息。</p><p>这里的案例暂不进入开题报告、硕士论文或参考文献。后续讨论时，可以再从中挑选、补图并记录具体启发。</p></details>
  </div>;
}
