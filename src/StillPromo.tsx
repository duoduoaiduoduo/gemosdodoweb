import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Pause, Play } from 'lucide-react';
import './still-promo.css';

const seenKey = 'gemos-still-intro-v1';
export default function StillPromo({ lang, direct }: { lang: 'zh' | 'en'; direct: boolean }) {
  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;
  const [open, setOpen] = useState(() => {
    try { return !direct && !sessionStorage.getItem(seenKey); } catch { return !direct; }
  });
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLAnchorElement>(null);
  const closing = useRef(false);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLButtonElement>('.still-intro-top button')?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!reduced()) void video.current?.play().catch(() => setPlaying(false));
    const pause = () => { if (document.hidden) video.current?.pause(); };
    document.addEventListener('visibilitychange', pause);
    return () => { document.body.style.overflow = old; document.removeEventListener('visibilitychange', pause); };
  }, [open]);
  const enter = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    try { sessionStorage.setItem(seenKey, '1'); } catch { /* Private browsing still works. */ }
    video.current?.pause();
    const from = surface.current?.getBoundingClientRect();
    const to = bar.current?.querySelector('img')?.getBoundingClientRect();
    if (from && to && !reduced()) {
      dialog.current?.classList.add('is-folding');
      const animation = surface.current?.animate([
        { transform: 'translate(0,0) scale(1)', borderRadius: '0px', opacity: 1 },
        { transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(${Math.min(to.width / from.width, to.height / from.height)})`, borderRadius: '24px', opacity: 0.1 },
      ], { duration: 850, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
      await animation?.finished.catch(() => {});
    }
    dialog.current?.close();
    setOpen(false);
    closing.current = false;
    bar.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    let accumulated = 0;
    let lastWheel = 0;
    let touch: { x: number; y: number } | null = null;
    const wheel = (event: WheelEvent) => {
      // Keep browser zoom and horizontal gestures intact.
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (event.cancelable) event.preventDefault();
      if (closing.current) return;
      const now = performance.now();
      if (now - lastWheel > 200 || event.deltaY <= 0) accumulated = 0;
      lastWheel = now;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      accumulated += Math.max(0, event.deltaY) * unit;
      if (accumulated >= 64) void enter();
    };
    const start = (event: TouchEvent) => {
      touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    };
    const move = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1) { touch = null; return; }
      const dy = touch.y - event.touches[0].clientY;
      const dx = touch.x - event.touches[0].clientX;
      if (dy > 10 && dy > Math.abs(dx) * 1.3) {
        if (event.cancelable) event.preventDefault();
        if (dy >= 56) { touch = null; void enter(); }
      }
    };
    const end = () => { touch = null; };
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', end);
    return () => {
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', end);
    };
  }, [open, enter]);
  return <>
    <aside className="still-promo-bar" aria-label={t('新作品', 'New release')}>
      <a ref={bar} href="/gemos-still/" className="still-promo-link">
        <img src="/gemos-still/assets/icon.png" alt="" width="32" height="32" />
        <span><strong>Gemos Still</strong><span className="still-promo-tagline">{t('把照片，收藏成空间。', 'A photo. A little world.')}</span></span>
        <span className="still-promo-cta">{t('探索 Mac 版', 'Discover for Mac')} <span aria-hidden="true">↗</span></span>
      </a>
      <button className="still-promo-replay" onClick={() => { setFailed(false); setOpen(true); }} aria-label={t('重看宣传片', 'Replay film')}>▷</button>
    </aside>
    {open && <dialog ref={dialog} className="still-intro" aria-labelledby="still-intro-title" onCancel={e => { e.preventDefault(); void enter(); }}>
      <div className="still-intro-surface" ref={surface}>
        <header className="still-intro-top">
          <div className="still-intro-brand"><img src="/avatar.png" alt="" width="28" height="28" /><span>Gemos<span className="still-brand-dot">.</span></span><small>{t('新作发布', 'NEW RELEASE')}</small></div>
          <button autoFocus onClick={() => void enter()}>{t('进入主页', 'Enter homepage')} <ArrowDown size={16} aria-hidden="true" /></button>
        </header>
        <div className="still-intro-copy"><p>GEMOS STILL <span aria-hidden="true">/</span> FOR MAC</p><h1 id="still-intro-title">{t('把照片，收藏成空间。', 'A moment. A little world.')}</h1><p className="still-intro-description">{t('一张照片，一台复古电脑。一个属于你的 3D 记忆盒。', 'Your photos, reimagined in a little 3D memory terminal.')}</p></div>
        <div className="still-intro-film">
          <video ref={video} src={failed ? undefined : '/gemos-still/assets/coast-introduction-v1.mp4'} poster="/gemos-still/assets/hero.jpg" muted={muted} playsInline preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setFailed(true)} aria-label={t('Gemos Still 产品展示影片', 'Gemos Still product film')} />
          {!failed && <div className="still-intro-controls"><button aria-label={t(playing ? '暂停影片' : '播放影片', playing ? 'Pause film' : 'Play film')} onClick={() => { if (playing) video.current?.pause(); else void video.current?.play().catch(() => setFailed(true)); }}>{playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}</button><button onClick={() => setMuted(!muted)} aria-pressed={!muted}>{t(muted ? '开启声音' : '静音', muted ? 'Sound on' : 'Mute')}</button></div>}
        </div>
        <footer className="still-intro-bottom">
          <span className="still-intro-note">{t('照片留在本机', 'Your photos stay yours')}</span>
          <div className="still-intro-scroll" aria-hidden="true"><ArrowDown size={16} /><span className="still-entry-desktop">{t('向下滚动，继续浏览', 'Scroll down to continue')}</span><span className="still-entry-touch">{t('向上滑动，继续浏览', 'Swipe up to continue')}</span></div>
          <a href="/gemos-still/">{t('探索 Gemos Still', 'Explore Gemos Still')} <ArrowUpRight size={14} aria-hidden="true" /></a>
        </footer>
      </div>
    </dialog>}
  </>;
}
