import {useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {ExternalLink, Image as ImageIcon, Maximize2, Minus, Plus, X} from 'lucide-react';
import type {CanvasLayout, Language, Work} from './types';
import {localized} from './types';

/** Native modal supplies focus containment, Escape dismissal and background inertness. */
export function MobileDialog({children, label, onClose, className = ''}: {
  children: ReactNode; label: string; onClose: () => void; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    const previous = document.body.style.overflow;
    node?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      node?.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return <dialog ref={ref} className={`mi-dialog ${className}`} aria-label={label} onCancel={(event) => {event.preventDefault(); onClose();}}>
    {children}
  </dialog>;
}

export function MobileImage({src, alt, className = '', priority = false}: {src?: string; alt: string; className?: string; priority?: boolean}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setFailed(false);
    // Cached images can finish before the effect runs, including after history navigation.
    setLoaded(!!imageRef.current?.complete && imageRef.current.naturalWidth > 0);
  }, [src]);
  return <div className={`mi-image ${className} ${loaded ? 'is-loaded' : ''} ${!src || failed ? 'is-empty' : ''}`}>
    {src && !failed ? <img ref={imageRef} key={src} src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      : <ImageIcon size={32} strokeWidth={1.2} aria-label={alt} />}
  </div>;
}

export function ImageViewer({src, title, lang, onClose}: {src: string; title: string; lang: Language; onClose: () => void}) {
  const [zoomed, setZoomed] = useState(false);
  return <MobileDialog label={title} onClose={onClose} className="mi-viewer">
    <div className="mi-viewer-bar">
      <button className="mi-icon" onClick={() => setZoomed(!zoomed)} aria-label={zoomed ? localized(lang, '缩小', 'Zoom out') : localized(lang, '放大', 'Zoom in')}>{zoomed ? <Minus /> : <Plus />}</button>
      <button className="mi-icon" onClick={onClose} aria-label={localized(lang, '关闭图片', 'Close image')}><X /></button>
    </div>
    <div className={`mi-viewer-scroll ${zoomed ? 'is-zoomed' : ''}`}><img src={src} alt={title} /></div>
    <p className="mi-viewer-caption">{title}</p>
  </MobileDialog>;
}

/** Preserve the author's composition; provide an explicit full-size view for small text. */
export function MobileCanvas({layout, lang, onImage}: {layout: CanvasLayout; lang: Language; onImage: (src: string) => void}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [expanded, setExpanded] = useState(false);
  const canvasWidth = Math.max(1, Number(layout.canvas?.width) || 1920);
  const canvasHeight = Math.max(1, Number(layout.canvas?.height) || 1080);
  const scale = expanded ? Math.min(1, Math.max(width / canvasWidth, 0.65)) : Math.min(1, width / canvasWidth);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <section className="mi-composition">
    <div ref={ref} className="mi-canvas-window" tabIndex={expanded ? 0 : undefined} aria-label={localized(lang, '作品排版', 'Composition')}>
      <div style={{width: canvasWidth * scale, height: canvasHeight * scale, position: 'relative'}}>
        <div className="mi-canvas" style={{width: canvasWidth, height: canvasHeight, transform: `scale(${scale})`, background: layout.canvas?.bgColor || '#fff'}}>
          {[...layout.elements].sort((a, b) => a.z - b.z).map((element) => {
            const style: CSSProperties = {position: 'absolute', left: element.x, top: element.y, width: element.w, height: element.h, transform: `rotate(${element.rotation || 0}deg)`, zIndex: element.z};
            return element.type === 'text'
              ? <div key={element.id} style={{...style, color: element.style?.color || '#1d1d1f', fontSize: element.style?.fontSize || 16, fontWeight: element.style?.fontWeight || 400, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.35}}>{element.content}</div>
              : <button key={element.id} style={style} className="mi-canvas-image" onClick={() => onImage(element.url)} aria-label={localized(lang, '查看图片', 'View image')}><img src={element.url} alt="" loading="lazy" style={{objectFit: element.style?.fit || 'cover', borderRadius: element.style?.radius || 0}} /></button>;
          })}
        </div>
      </div>
    </div>
    <button className="mi-text-action" onClick={() => setExpanded(!expanded)}><Maximize2 size={15} />{expanded ? localized(lang, '适合屏幕', 'Fit to screen') : localized(lang, '放大查看', 'Take a closer look')}</button>
  </section>;
}

function videoTarget(raw: string) {
  if (!raw.trim()) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (/\.(mp4|webm|ogg)(?:$|\?)/i.test(url.href)) return {kind: 'video', src: url.href};
    const host = url.hostname;
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1];
      if (id) return {kind: 'embed', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`};
    }
    if (host === 'bilibili.com' || host.endsWith('.bilibili.com')) {
      const bvid = url.pathname.match(/(BV[a-zA-Z0-9]+)/)?.[1] || url.searchParams.get('bvid');
      if (bvid) return {kind: 'embed', src: `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&autoplay=0`};
    }
    return {kind: 'link', src: url.href};
  } catch {return null;}
}

export function MobileWorkContent({work, lang, onImage}: {work: Work; lang: Language; onImage: (src: string) => void}) {
  const [source, setSource] = useState(work.videoUrl || work.videoSources?.[0]?.url || '');
  const video = videoTarget(source);
  const hasCanvas = work.contentMode !== 'flow' && !!work.layout?.elements?.length;
  return <div className="mi-work-content">
    {work.projectUrl?.startsWith('/') && !work.projectUrl.startsWith('//') && <a className="mi-primary" href={work.projectUrl}>{localized(lang, '了解并下载 Mac 版', 'Explore and download for Mac')}<ExternalLink size={17}/></a>}
    {video?.kind === 'video' && <div className="mi-video">
      <video src={video.src} controls playsInline preload="metadata" poster={work.image} />
      {!!work.videoSources?.length && <label>{localized(lang, '画质', 'Quality')}<select value={source} onChange={(e) => setSource(e.target.value)}>{work.videoSources.map((item) => <option key={item.url} value={item.url}>{item.label || `${item.height || ''}p`}</option>)}</select></label>}
    </div>}
    {video?.kind === 'embed' && <iframe className="mi-video-embed" src={video.src} title={work.title} allowFullScreen allow="fullscreen; picture-in-picture" />}
    {video?.kind === 'link' && <a className="mi-primary" href={video.src} target="_blank" rel="noopener noreferrer">{localized(lang, '观看视频', 'Watch film')}<ExternalLink size={17} /></a>}
    {hasCanvas ? <MobileCanvas layout={work.layout!} lang={lang} onImage={onImage} /> : work.blocks?.map((block, i) => {
      if (block.type === 'text') return <p key={i} className="mi-prose">{localized(lang, block.content, block.contentEn)}</p>;
      if (block.type === 'image' && block.url) return <figure key={i}><button className="mi-inline-image" onClick={() => onImage(block.url!)} aria-label={localized(lang, '放大图片', 'Enlarge image')}><MobileImage src={block.url} alt={localized(lang, block.caption, block.captionEn)} /></button>{block.caption && <figcaption>{localized(lang, block.caption, block.captionEn)}</figcaption>}</figure>;
      if (block.type === 'gallery') return <div key={i} className="mi-gallery">{block.urls?.map((url, j) => <button key={`${url}-${j}`} onClick={() => onImage(url)} aria-label={localized(lang, `查看图片 ${j + 1}`, `View image ${j + 1}`)}><MobileImage src={url} alt="" /></button>)}</div>;
      return null;
    })}
  </div>;
}
