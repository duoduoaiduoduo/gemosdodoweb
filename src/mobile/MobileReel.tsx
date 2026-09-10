import {useRef} from 'react';
import {animate, motion, useMotionValue, useReducedMotion} from 'motion/react';
import {ArrowUpRight, ChevronLeft, ChevronRight, Shuffle} from 'lucide-react';
import {MobileImage} from './MobileMedia';
import {categoryName, displayDate, localized, type Language, type Work} from './types';

export default function MobileReel({works, cursor, onSelect, onOpen, lang}: {
  works: Work[]; cursor: number; onSelect: (index: number) => void; onOpen: (id: string) => void; lang: Language;
}) {
  const reduced = useReducedMotion();
  const dragX = useMotionValue(0);
  const shelf = useRef<HTMLDivElement>(null);
  const lastDrag = useRef(0);
  const t = (zh: string, en: string) => localized(lang, zh, en);
  const index = Math.min(Math.max(cursor, 0), works.length - 1);
  const current = works[index];
  if (!current) return null;
  const select = (next: number) => onSelect(Math.min(works.length - 1, Math.max(0, next)));
  const shuffle = () => {
    if (works.length > 1) select((index + 1 + Math.floor(Math.random() * (works.length - 1))) % works.length);
    shelf.current?.scrollIntoView({block: 'center', behavior: reduced ? 'instant' : 'smooth'});
  };
  const visible = works.slice(Math.max(0, index - 2), index + 3);
  const transition = reduced ? {duration: 0} : {type: 'spring' as const, stiffness: 290, damping: 29};

  return <div ref={shelf} className="mi-reel" role="region" aria-label={t('拨动作品架', 'Work shelf')} aria-roledescription="carousel">
    <div className="mi-reel-stage">
      <motion.div className="mi-reel-track" style={{x: dragX}} drag={works.length > 1 ? 'x' : false} dragConstraints={{left: 0, right: 0}} dragElastic={.65}
        onDragStart={() => {lastDrag.current = Date.now();}}
        onDragEnd={(_, info) => {
          lastDrag.current = Date.now();
          if (Math.abs(info.offset.x) > 40 || Math.abs(info.velocity.x) > 450) select(index + (info.offset.x < 0 ? 1 : -1));
          animate(dragX, 0, reduced ? {duration: 0} : {type: 'spring', stiffness: 320, damping: 30});
        }}>
        {visible.map((work, offset) => {
          const position = Math.max(0, index - 2) + offset;
          const distance = position - index;
          return <motion.button key={work.id} className={`mi-reel-cover ${distance === 0 ? 'is-current' : ''}`} style={{zIndex: 5 - Math.abs(distance)}}
            initial={reduced ? false : {x: `${distance * 74}%`, scale: .65, rotateY: distance * -28, opacity: 0}} animate={{x: `${distance * 74}%`, scale: distance === 0 ? 1 : .78, rotateY: distance * -28, opacity: Math.abs(distance) > 1 ? 0 : distance === 0 ? 1 : .48}} transition={transition}
            tabIndex={distance === 0 ? 0 : -1} aria-hidden={Math.abs(distance) > 1} aria-label={distance === 0 ? t(`打开作品：${localized(lang, work.title, work.titleEn)}`, `Open work: ${localized(lang, work.title, work.titleEn)}`) : t('切换到相邻作品', 'Select adjacent work')}
            onClick={() => {if (Date.now() - lastDrag.current < 180) return; if (distance === 0) onOpen(work.id); else select(position);}}
            onKeyDown={(event) => {if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); select(index + (event.key === 'ArrowRight' ? 1 : -1));}}}>
            <MobileImage src={work.thumbnailImage || work.image} alt="" priority={distance === 0} />
            <span className="mi-reel-cover-number">{String(position + 1).padStart(2, '0')}</span>
          </motion.button>;
        })}
      </motion.div>
    </div>
    <div className="mi-reel-copy" aria-live="polite" aria-atomic="true">
      <p>{categoryName(current.category, lang)}{current.date ? ` · ${displayDate(current.date, lang)}` : ''}</p>
      <button onClick={() => onOpen(current.id)}><h3>{localized(lang, current.title, current.titleEn)}</h3><ArrowUpRight size={19} /></button>
    </div>
    <div className="mi-reel-navigation">
      <button className="mi-icon" disabled={index === 0} onClick={() => select(index - 1)} aria-label={t('上一件作品', 'Previous work')}><ChevronLeft size={19} /></button>
      <span>{String(index + 1).padStart(2, '0')}<small> / {works.length}</small></span>
      <button className="mi-icon" disabled={index === works.length - 1} onClick={() => select(index + 1)} aria-label={t('下一件作品', 'Next work')}><ChevronRight size={19} /></button>
    </div>
    {works.length > 1 && <>
      <div className="mi-reel-scrubber"><input type="range" min={0} max={works.length - 1} value={index} onChange={(event) => select(Number(event.target.value))} aria-label={t('快速穿梭作品', 'Scrub through work')} aria-valuetext={`${index + 1} / ${works.length}: ${localized(lang, current.title, current.titleEn)}`} /></div>
      <div className="mi-reel-bottom"><span>{t('左右拨动，拖动刻度穿梭', 'Swipe covers. Scrub to explore.')}</span><button onClick={shuffle}><Shuffle size={16} />{t('随便看看', 'Surprise me')}</button></div>
    </>}
  </div>;
}
