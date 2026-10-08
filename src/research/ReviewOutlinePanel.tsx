import {useEffect, useRef, useState} from 'react';

type OutlineEntry={id:string;title:string;level:number;pageIndex:number;paragraphIndex?:number};

export default function ReviewOutline({entries,toolbarHeight,open,disabled,onClose}:{entries:OutlineEntry[];toolbarHeight:number;open:boolean;disabled:boolean;onClose:()=>void}){
  const [active,setActive]=useState(entries[0]?.id||'');
  const listRef=useRef<HTMLElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const panelRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    const targets=entries.map(entry=>({entry,element:document.getElementById(entry.id)})).filter(target=>target.element);
    let frame=0;
    const update=()=>{
      frame=0;
      let current=targets[0]?.entry.id||'';
      for(const {entry,element} of targets){if(element!.getBoundingClientRect().top<=toolbarHeight+28)current=entry.id;else break;}
      if(window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-2)current=targets.at(-1)?.entry.id||current;
      setActive(current);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
    const observer=new ResizeObserver(schedule);
    const documentElement=targets[0]?.element?.closest('.advisor-document');
    if(documentElement)observer.observe(documentElement);
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule);
    schedule();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);};
  },[entries,toolbarHeight]);
  useEffect(()=>{
    const list=listRef.current;
    const item=list?.querySelector<HTMLElement>('[aria-current="location"]');
    if(!list||!item)return;
    const bounds=list.getBoundingClientRect(),position=item.getBoundingClientRect();
    if(position.top<bounds.top)list.scrollTop-=bounds.top-position.top+12;
    else if(position.bottom>bounds.bottom)list.scrollTop+=position.bottom-bounds.bottom+12;
  },[active,open]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    closeRef.current?.focus();
    const close=(event:KeyboardEvent)=>{
      if(event.key==='Escape')onClose();
      if(event.key!=='Tab'||!window.matchMedia('(max-width: 959px)').matches)return;
      const controls=Array.from<HTMLButtonElement>(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);
      const first=controls[0],last=controls.at(-1);
      if(first&&last&&event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(first&&last&&!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',close);
    return()=>{window.removeEventListener('keydown',close);previous?.focus({preventScroll:true});};
  },[open,onClose]);
  const jump=(entry:OutlineEntry)=>{
    if(disabled)return;
    const target=document.getElementById(entry.id);
    if(!target)return;
    const content=target.closest('.advisor-document');
    if(content)content.scrollLeft=0;
    const top=Math.max(0,window.scrollY+target.getBoundingClientRect().top-toolbarHeight-20);
    setActive(entry.id);
    onClose();
    window.scrollTo({top,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  };
  return <>
    {open&&<button className="review-outline-backdrop" aria-label="关闭论文大纲" onClick={onClose}/>}
    <aside ref={panelRef} className={`review-outline${open?' is-open':''}`} id="thesis-outline" aria-label="完整论文大纲">
      <header className="review-outline-header"><strong>论文大纲</strong><button ref={closeRef} className="review-outline-close" onClick={onClose} aria-label="关闭论文大纲">关闭</button></header>
      <nav className="review-outline-list" ref={listRef} aria-label="论文大纲导航">
        <ol>{entries.map(entry=><li className={`review-outline-level-${entry.level}`} key={entry.id}><button aria-current={active===entry.id?'location':undefined} disabled={disabled} onClick={()=>jump(entry)}><span>{entry.title}</span></button></li>)}</ol>
      </nav>
    </aside>
  </>;
}
