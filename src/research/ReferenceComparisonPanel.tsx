import {Fragment, useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {ReportPage} from './reviewDocument';
import {findParagraphIndex, findReadingPageIndex, getReferenceSectionId, normalizeSectionTitle} from './referenceComparison.js';
import './reference-comparison.css';

type ReferenceSection = ReportPage & {id:string;sourcePages?:number[];scheduleRows?:string[][]};
type Reference = {id:string;author:string;title:string;sections:ReferenceSection[]};
type ReadingLocation = {sectionIndex:number;pageIndex:number;fragment:string};
type ScrollPositions = Map<string,number>;
const referenceUrl='/graduation/references/proposals/2026-10-18/references.json';
const isHeading=(text:string)=>text.trim().length<=80&&!/[。！？；\n]/.test(text)&&/^(?:\d+(?:\.\d+){0,2}[\s、.]?|[（(]\d+[）)])/u.test(text.trim());

function ComparisonColumn({id,name,title,section,source,active,open,positions,fragment}:{id:string;name:string;title:string;section?:ReferenceSection;source?:string;active:boolean;open:boolean;positions:ScrollPositions;fragment?:string}) {
  const scrollRef=useRef<HTMLDivElement>(null);
  const positionKey=`${id}:${section?.id||'missing'}`;
  useLayoutEffect(()=>{
    if(!open)return;
    const frame=requestAnimationFrame(()=>{
      const host=scrollRef.current;if(!host||!host.clientHeight)return;
      const saved=positions.get(positionKey);
      if(saved!==undefined){host.scrollTop=saved;return;}
      const paragraph=fragment&&section?findParagraphIndex(section.paragraphs,fragment):-1;
      const target=paragraph>=0?host.querySelector<HTMLElement>(`[data-comparison-paragraph="${paragraph}"]`):null;
      host.scrollTop=target?Math.max(0,target.offsetTop-14):0;
    });
    return()=>cancelAnimationFrame(frame);
  },[positionKey,positions,fragment,section,active,open]);
  return <article className={`reference-comparison-column${active?' is-mobile-active':''}`} aria-label={`${name}的对应内容`}>
    <header><h3>{name}</h3><p>{title}</p>{source&&<small>{source}</small>}</header>
    <div className="reference-comparison-scroll" ref={scrollRef} tabIndex={0} aria-label={`滚动阅读${name}`} onScroll={event=>{if(open)positions.set(positionKey,event.currentTarget.scrollTop);}}>
      {section?<>
        <h4>{section.title}</h4>
        {section.scheduleRows?.length?<table><thead><tr><th>起止时间</th><th>阶段工作内容及预计完成的指标</th></tr></thead><tbody>{section.scheduleRows.map((row,index)=><tr key={index}>{row.map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}</tbody></table>:section.paragraphs.map((paragraph,index)=><p className={isHeading(paragraph)?'reference-paragraph-heading':undefined} data-comparison-paragraph={index} key={index}>{paragraph}</p>)}
        {section.images?.map(image=><figure key={image.src}><a href={image.src} target="_blank" rel="noopener noreferrer" aria-label={`放大查看：${image.alt}`}><img src={image.src} alt={image.alt}/></a><figcaption>{image.caption} · 点击可放大</figcaption></figure>)}
        {section.tables?.map((table,index)=><figure key={index}>{table.caption&&<figcaption>{table.caption}</figcaption>}<table><thead><tr>{table.rows[0]?.map((cell,i)=><th key={i}>{cell}</th>)}</tr></thead><tbody>{table.rows.slice(1).map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></figure>)}
        {section.pending&&<p className="reference-comparison-pending">{section.pending}</p>}
      </>:<p className="reference-comparison-empty">这份参考稿没有与当前部分对应的内容。</p>}
    </div>
  </article>;
}

export default function ReferenceComparison({pages,sections,title,disabled}:{pages:ReportPage[];sections:ReportPage[];title:string;disabled:boolean}) {
  const [open,setOpen]=useState(false);
  const [references,setReferences]=useState<Reference[]|null>(null);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const [location,setLocation]=useState<ReadingLocation>({sectionIndex:0,pageIndex:0,fragment:''});
  const [sectionIndex,setSectionIndex]=useState(0);
  const [mobileDocument,setMobileDocument]=useState('li-hao');
  const buttonRef=useRef<HTMLButtonElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLDialogElement>(null);
  const positions=useRef<ScrollPositions>(new Map());
  const returnPosition=useRef({x:0,y:0,pageIndex:-1,pageTop:0,pageHeight:0});
  const ownSection=sections[sectionIndex];
  const sectionId=getReferenceSectionId(ownSection?.title||'');
  const currentSection=ownSection?{...ownSection,id:sectionId||`section-${sectionIndex}`}:undefined;

  const openComparison=()=>{
    if(disabled)return;
    const toolbar=buttonRef.current?.closest('.advisor-toolbar');
    const visibleTop=(toolbar?.getBoundingClientRect().bottom||0)+12;
    const elements=pages.map((_,index)=>document.getElementById(`review-page-${index+1}`));
    const bounds=elements.map(element=>element?.getBoundingClientRect()||{top:Infinity,bottom:Infinity});
    // At a chapter boundary, a small tail of the previous sheet may still be
    // visible. Match the sheet occupying most of the reading area instead.
    const dominant=bounds.map((bound,index)=>({index,height:Math.max(0,Math.min(window.innerHeight,bound.bottom)-Math.max(visibleTop,bound.top))})).reduce((best,item)=>item.height>best.height?item:best,{index:-1,height:0});
    const readingTop=dominant.index>=0?Math.max(visibleTop,bounds[dominant.index].top)+Math.min(28,dominant.height/2):visibleTop;
    const pageIndex=findReadingPageIndex(bounds,readingTop);
    const page=pages[pageIndex];
    let index=sections.findIndex(section=>normalizeSectionTitle(section.title)===normalizeSectionTitle(page?.title||''));
    if(index<0){const key=getReferenceSectionId(page?.title||'');index=key?sections.findIndex(section=>getReferenceSectionId(section.title)===key):-1;}
    const paragraphs=Array.from(elements[pageIndex]?.querySelectorAll<HTMLElement>('.advisor-paragraph')||[]);
    let paragraph=paragraphs[0];
    for(const item of paragraphs){if(item.getBoundingClientRect().top<=readingTop)paragraph=item;else break;}
    setLocation({sectionIndex:index,pageIndex,fragment:paragraph?.textContent||''});
    setSectionIndex(index);
    // The current draft follows the reader on each opening; references retain
    // their independent positions for each part.
    if(index>=0)positions.current.delete(`own:${getReferenceSectionId(sections[index].title)||`section-${index}`}`);
    returnPosition.current={x:window.scrollX,y:window.scrollY,pageIndex,pageTop:bounds[pageIndex]?.top||0,pageHeight:bounds[pageIndex]?bounds[pageIndex].bottom-bounds[pageIndex].top:0};
    setOpen(true);
  };

  useEffect(()=>{
    if(!open||references)return;
    const controller=new AbortController();setError('');
    void fetch(referenceUrl,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error();
      const data=await response.json();
      if(!Array.isArray(data.references)||!['li-hao','ma-huiyang'].every(id=>data.references.some((reference:Reference)=>reference.id===id&&Array.isArray(reference.sections))))throw Error();
      setReferences(data.references);
    }).catch(()=>{if(!controller.signal.aborted)setError('参考稿暂时没有加载成功，请重试。');});
    return()=>controller.abort();
  },[open,references,retry]);

  useEffect(()=>{
    if(!open)return;
    const dialog=dialogRef.current;if(!dialog)return;
    const root=document.documentElement;
    const previous={overflow:root.style.overflow,gutter:root.style.scrollbarGutter};
    root.style.scrollbarGutter='stable';root.style.overflow='hidden';
    dialog.showModal();closeRef.current?.focus({preventScroll:true});
    return()=>{
      if(dialog.open)dialog.close();
      root.style.overflow=previous.overflow;root.style.scrollbarGutter=previous.gutter;
      buttonRef.current?.focus({preventScroll:true});
      const saved=returnPosition.current;
      const current=document.getElementById(`review-page-${saved.pageIndex+1}`)?.getBoundingClientRect();
      const top=current&&saved.pageHeight&&Math.abs(current.height-saved.pageHeight)>1
        ?window.scrollY+current.top-saved.pageTop/saved.pageHeight*current.height:saved.y;
      window.scrollTo(saved.x,top);
    };
  },[open]);

  return <>
    <button ref={buttonRef} type="button" aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={openComparison}>参考对比</button>
    <dialog ref={dialogRef} className="reference-comparison-dialog" aria-labelledby="reference-comparison-title" onCancel={event=>{event.preventDefault();setOpen(false);}} onClose={()=>setOpen(false)}>
      <header className="reference-comparison-header"><div><h2 id="reference-comparison-title">参考对比</h2><p>按当前阅读部分匹配 · 三份内容可分别滚动</p></div><button ref={closeRef} type="button" onClick={()=>setOpen(false)} aria-label="关闭参考对比，返回原阅读位置">关闭对比</button></header>
      <div className="reference-comparison-controls"><label>对比部分 <select aria-label="选择对比部分" value={sectionIndex} onChange={event=>setSectionIndex(Number(event.target.value))}>{sectionIndex<0&&<option value={-1}>当前部分未匹配</option>}{sections.map((section,index)=><option key={index} value={index}>{section.title}</option>)}</select></label><span>打开于第 {location.pageIndex+1} 页</span>{sectionIndex!==location.sectionIndex&&<button type="button" onClick={()=>setSectionIndex(location.sectionIndex)}>回到正在阅读的部分</button>}</div>
      <nav className="reference-comparison-mobile-tabs" aria-label="选择对比稿件">{[['own','我的稿件'],['li-hao','李浩'],['ma-huiyang','马慧洋']].map(([id,label])=><button type="button" key={id} aria-pressed={mobileDocument===id} onClick={()=>setMobileDocument(id)}>{label}</button>)}</nav>
      <div className="reference-comparison-columns">
        <ComparisonColumn id="own" name="我的稿件" title={title} section={currentSection} active={mobileDocument==='own'} open={open} positions={positions.current} fragment={sectionIndex===location.sectionIndex?location.fragment:undefined}/>
        {references?references.map(reference=>{
          const section=reference.sections.find(item=>item.id===sectionId);
          const range=section?.sourcePages;
          return <Fragment key={reference.id}><ComparisonColumn id={reference.id} name={reference.author} title={reference.title} section={section} source={range?.length?`参考稿原文 · 第 ${range[0]}${range[1]!==range[0]?`—${range[1]}`:''} 页`:'参考稿原文'} active={mobileDocument===reference.id} open={open} positions={positions.current}/></Fragment>;
        }):<div className="reference-comparison-loading" role={error?'alert':'status'}><p>{error||'正在加载李浩和马慧洋的对应部分…'}</p>{error&&<button type="button" onClick={()=>setRetry(value=>value+1)}>重新加载参考稿</button>}</div>}
      </div>
      <footer className="reference-comparison-footer">参考内容保留原稿表述，供比较结构与写法；关闭后返回原阅读位置。</footer>
    </dialog>
  </>;
}
