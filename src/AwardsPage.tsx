import React, { useEffect, useMemo, useState, useRef, useCallback, type CSSProperties } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';

type Award = {
  id: string;
  date: string;
  title: string;
  workTitle?: string;
  certificateNo?: string;
  projectName?: string;
  authorName?: string;
  instructorName?: string;
  organizationName?: string;
  awardLevel?: string;
  organizer?: string;
  workEntryIds: string[];
  image: string;
  thumbnailImage?: string;
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
};

type Entry = {
  id: string;
  title: string;
  titleEn?: string;
};

type DeckCardLayout = {
  width: number;
  height: number;
  left: number;
  top: number;
  rotation: number;
  zIndex: number;
};

const DESKTOP_BREAKPOINT = 1024;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getAwardRatio = (award: Award) => {
  const width = Number(award.imageNaturalWidth) || 0;
  const height = Number(award.imageNaturalHeight) || 0;
  if (width > 0 && height > 0) return width / height;
  return 1.42;
};

const buildDeckLayout = (awards: Award[]) => {
  const lanePattern = [0, 1, 2, 1, 0, 2];
  const rotationPattern = [-5.2, -2.8, 1.4, 3.1, -4.7, 5.2];
  const cards: DeckCardLayout[] = [];
  let cursor = 50;
  let maxRight = 0;
  let maxBottom = 0;

  awards.forEach((award, index) => {
    const ratio = clamp(getAwardRatio(award), 0.75, 2.3);
    let width = clamp(240 + (ratio - 1) * 160, 220, 440);
    let height = width / ratio;

    if (height > 350) {
      height = 350;
      width = height * ratio;
    }
    if (height < 220) {
      height = 220;
      width = height * ratio;
    }

    width = clamp(width, 220, 440);
    height = clamp(height, 220, 350);

    const lane = lanePattern[index % lanePattern.length];
    const wave = Math.sin(index * 0.85) * 14;
    const top = 40 + lane * 98 + (index % 3 === 0 ? 12 : 0) + wave;
    
    // Tighter pack, overlapping slightly
    const left = cursor + lane * 18 + (index % 5 === 0 ? 10 : 0);
    const rotation = rotationPattern[index % rotationPattern.length] + lane * 1.5 + wave * 0.2;

    cards.push({
      width,
      height,
      left,
      top,
      rotation,
      zIndex: 10 + index,
    });

    // Advance cursor tightly
    cursor += Math.max(70, width * 0.45);
    maxRight = Math.max(maxRight, left + width);
    maxBottom = Math.max(maxBottom, top + height);
  });

  return {
    cards,
    stageWidth: Math.max(1000, Math.round(maxRight + 120)),
    stageHeight: Math.max(500, Math.round(maxBottom + 120)),
  };
};

/* Image component — progressive rendering:
 * Image is shown IMMEDIATELY (opacity 1) but starts blurred+desaturated.
 * The browser naturally paints progressive JPEGs/WebPs line-by-line through the blur.
 * Skeleton shimmers behind. On full load, blur+skeleton fade away cleanly. */
const FadeImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    <>
      <div className={`card-image-skeleton ${loaded ? 'is-hidden' : ''}`} />
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`card-fade-image ${loaded ? 'is-loaded' : ''}`}
        onLoad={() => setLoaded(true)}
      />
    </>
  );
};

/* ── Hint Overlay ── shows controls guide, auto-dismisses */
const HintOverlay: React.FC<{ lang: 'zh' | 'en'; isDesktop: boolean }> = ({ lang, isDesktop }) => {
  const [show, setShow] = useState(false);
  const [gone, setGone] = useState(false);
  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;

  useEffect(() => {
    // Appear after cards have settled
    const onTimer = setTimeout(() => setShow(true), 2000);
    // Auto-dismiss after 9s of visibility
    const offTimer = setTimeout(() => setGone(true), 2000 + 9000);
    return () => { clearTimeout(onTimer); clearTimeout(offTimer); };
  }, []);

  if (gone || !isDesktop) return null;

  const hints = [
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="7" />
          <line x1="12" y1="6" x2="12" y2="10" />
        </svg>
      ),
      label: t('滚轮 / 上下滑动 → 横向浏览', 'Scroll → Browse horizontally'),
    },
    ...(isDesktop ? [{
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" />
          <polyline points="8 7 3 12 8 17" />
          <polyline points="16 7 21 12 16 17" />
        </svg>
      ),
      label: t('拖拽底部时间轴 → 按年跳转', 'Drag timeline → Jump by year'),
    }] : []),
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      ),
      label: t('点击卡片 → 查看完整详情', 'Click a card → View details'),
    },
  ];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="awards-hint-overlay"
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="awards-hint-title">{t('操作指引', 'How to explore')}</div>
          <ul className="awards-hint-list">
            {hints.map((h, i) => (
              <li key={i} className="awards-hint-item">
                <span className="awards-hint-icon">{h.icon}</span>
                <span className="awards-hint-label">{h.label}</span>
              </li>
            ))}
          </ul>
          <button
            className="awards-hint-dismiss"
            onClick={() => setGone(true)}
            aria-label={t('关闭', 'Close')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const AwardCard: React.FC<{ 
  award: Award; 
  layout: DeckCardLayout; 
  idx: number; 
  isDesktop: boolean; 
  hoveredIndex: number | null; 
  setHoveredIndex: (v: number | null) => void; 
  onClick: () => void; 
  isHighlight: boolean;
}> = ({ award, layout, idx, isDesktop, hoveredIndex, setHoveredIndex, onClick, isHighlight }) => {
  const cardRef = useRef<HTMLButtonElement>(null);
  const cardImageSrc = award.thumbnailImage || award.image;

  // 3D physics for Hover (Tilt)
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springConfig = { damping: 25, stiffness: 280, mass: 0.5 };
  
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [12, -12]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-18, 18]), springConfig);
  const glareX = useSpring(useTransform(x, [-0.5, 0.5], [100, 0]), springConfig);
  const glareY = useSpring(useTransform(y, [-0.5, 0.5], [100, 0]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!cardRef.current || !isDesktop) return;
    const rect = cardRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    x.set(mouseX / rect.width - 0.5);
    y.set(mouseY / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    setHoveredIndex(null);
  };

  // Neighborhood physical logic
  let dist = 0;
  const isHoveredLocal = hoveredIndex === idx;
  if (hoveredIndex !== null && isDesktop) {
    dist = idx - hoveredIndex;
  }
  
  // Calculate dynamic repulse offsets
  let repulseX = 0;
  let repulseY = 0;
  let repulseZ = 0;
  let dynamicRotate = layout?.rotation || 0;
  let shadowAlpha = 0.15;
  let zIndexVal = layout?.zIndex || 10;

  if (isHoveredLocal && isDesktop) {
    repulseZ = 120; // Pop up towards camera
    repulseY = -40; // Lift slightly
    dynamicRotate = 0; // Straighten out for reading
    shadowAlpha = 0.45;
    zIndexVal = 999;
  } else if (dist !== 0 && hoveredIndex !== null && isDesktop) {
     const force = Math.max(0, 1 - Math.abs(dist) * 0.18);
     // Push left/right strongly if nearby
     repulseX = (dist > 0 ? 1 : -1) * force * 130;
     // Push down/back to create space for the hovered card
     repulseY = force * 20; 
     repulseZ = force * -40;
     // Rotate away gracefully
     dynamicRotate = layout.rotation + (dist > 0 ? 1 : -1) * force * 15;
     shadowAlpha = 0.08;
  }

  // Combine transforms
  const coreDesktopStyle = isDesktop && layout ? {
    width: layout.width,
    height: layout.height,
    left: layout.left,
    top: layout.top,
    zIndex: zIndexVal,
  } : {};

  return (
    <motion.button
      ref={cardRef}
      type="button"
      className={`award-card-v2 ${isHighlight ? 'is-highlight' : ''}`}
      style={{
        ...coreDesktopStyle,
      } as CSSProperties}
      initial={isDesktop ? { opacity: 0, scale: 0.8, y: 50, rotateZ: layout?.rotation } : { opacity: 0, y: 30 }}
      animate={isDesktop ? {
        opacity: 1,
        scale: 1,
        x: repulseX,
        y: repulseY,
        z: repulseZ,
        rotateX: isHoveredLocal ? rotateX : 0,
        rotateY: isHoveredLocal ? rotateY : 0,
        rotateZ: dynamicRotate,
        boxShadow: `0 ${(isHoveredLocal ? 30 : 10)}px ${(isHoveredLocal ? 60 : 30)}px rgba(0,0,0,${shadowAlpha})`,
      } : { opacity: 1, y: 0 }}
      transition={{ 
        type: 'spring', 
        damping: 24, 
        stiffness: 180, 
        mass: 0.8,
        opacity: { duration: 0.4 },
        delay: (idx % 10) * 0.04
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHoveredIndex(idx)}
      onMouseLeave={handleMouseLeave}
      onFocus={() => setHoveredIndex(idx)}
      onBlur={handleMouseLeave}
      onClick={onClick}
      title={award.title}
      data-award-id={award.id}
    >
      <div className="card-minimal-panel">
        <div className="card-minimal-media" style={{ aspectRatio: award.imageNaturalWidth && award.imageNaturalHeight ? `${award.imageNaturalWidth}/${award.imageNaturalHeight}` : undefined }}>
          <FadeImage src={cardImageSrc} alt={award.title} />
        </div>
      </div>
      
      {/* Glare effect */}
      {isDesktop && (
        <motion.div 
          className="card-glare"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.7), transparent 60%)',
            opacity: isHoveredLocal ? 0.4 : 0,
            left: useTransform(glareX, (x) => `${x}%`),
            top: useTransform(glareY, (y) => `${y}%`),
            transform: 'translate(-50%, -50%)'
          }}
        />
      )}
    </motion.button>
  );
}


export default function AwardsPage({
  lang,
  focusAwardId,
  onBack,
  onOpenWork,
}: {
  lang: 'zh' | 'en';
  focusAwardId: string | null;
  onBack: () => void;
  onOpenWork: (entryId: string) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [awards, setAwards] = useState<Award[]>([]);
  const [entryMap, setEntryMap] = useState<Record<string, Entry>>({});
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeAwardId, setActiveAwardId] = useState<string | null>(null);
  const [highlightAwardId, setHighlightAwardId] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth > DESKTOP_BREAKPOINT);
  const [scrollProgress, setScrollProgress] = useState(0);
  // Start with 3 cards — avoids simultaneous spring-animation storm on first paint
  const [visibleCount, setVisibleCount] = useState(3);
  // Defer all card animations until after the first browser paint
  const [isMounted, setIsMounted] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

  const setAwardFocusInUrl = useCallback((awardId: string | null, replace = false) => {
    const params = new URLSearchParams(location.search || '');
    if (awardId) params.set('focus', awardId);
    else params.delete('focus');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: '/awards',
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace },
    );
  }, [location.search, navigate]);

  const openAward = useCallback((awardId: string) => {
    setActiveAwardId(awardId);
    setAwardFocusInUrl(awardId, !!focusAwardId);
  }, [focusAwardId, setAwardFocusInUrl]);

  const closeAward = useCallback(() => {
    setActiveAwardId(null);
    setAwardFocusInUrl(null, true);
  }, [setAwardFocusInUrl]);

  const copyShareLink = useCallback(async () => {
    if (!activeAwardId || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1600);
  }, [activeAwardId]);

  useEffect(() => {
    window.scrollTo({top: 0, behavior: 'auto'});
    // Allow one rAF for the page to paint before starting animations
    const raf = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (awards.length === 0 || visibleCount >= awards.length) return;
    // Drip cards in slowly: 4 at a time every 220ms — avoids layout thrashing
    const timer = setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + 4, awards.length));
    }, 220);
    return () => clearTimeout(timer);
  }, [awards.length, visibleCount]);

  useEffect(() => {
    const syncViewport = () => setIsDesktop(window.innerWidth > DESKTOP_BREAKPOINT);
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const isDraggingTimeline = useRef(false);
  const timelineTrackRef = useRef<HTMLDivElement>(null);

  // Wheel momentum refs
  const wheelVelocityRef = useRef(0);
  const wheelRafRef = useRef<number | null>(null);

  const handleViewportScroll = () => {
    if (isDraggingTimeline.current) return;
    if (!viewportRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = viewportRef.current;
    const max = scrollWidth - clientWidth;
    if (max > 0) {
      setScrollProgress((scrollLeft / max) * 100);
    }
  };

  // Direct scroll (no CSS smooth) for slider dragging
  const scrollViewportTo = useCallback((pct: number) => {
    if (!viewportRef.current) return;
    const max = viewportRef.current.scrollWidth - viewportRef.current.clientWidth;
    viewportRef.current.style.scrollBehavior = 'auto';
    viewportRef.current.scrollLeft = (pct / 100) * max;
    requestAnimationFrame(() => {
      if (viewportRef.current) viewportRef.current.style.scrollBehavior = '';
    });
  }, []);

  // Momentum-based wheel → horizontal scroll
  // RAF loop applies velocity with friction each frame for butter-smooth inertia.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !isDesktop) return;

    const onWheel = (e: WheelEvent) => {
      // Use combined delta: prefer Y, fall back to X (trackpad horizontal)
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      e.preventDefault();

      // Normalize across deltaMode (0=px, 1=line, 2=page)
      const multiplier = e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? el.clientWidth * 0.8 : 1;
      wheelVelocityRef.current += delta * multiplier * 0.6;

      if (wheelRafRef.current !== null) return; // already animating

      const step = () => {
        if (!viewportRef.current) { wheelRafRef.current = null; return; }
        const v = wheelVelocityRef.current;
        if (Math.abs(v) < 0.4) {
          wheelVelocityRef.current = 0;
          wheelRafRef.current = null;
          return;
        }
        viewportRef.current.style.scrollBehavior = 'auto';
        viewportRef.current.scrollLeft += v;
        wheelVelocityRef.current *= 0.88; // friction — higher = slides longer
        wheelRafRef.current = requestAnimationFrame(step);
      };
      wheelRafRef.current = requestAnimationFrame(step);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelRafRef.current !== null) {
        cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
      }
    };
  }, [isDesktop]);

  const calcPctFromPointer = useCallback((clientX: number): number => {
    if (!timelineTrackRef.current) return 0;
    const rect = timelineTrackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    return clamp((x / rect.width) * 100, 0, 100);
  }, []);

  const handleTimelinePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingTimeline.current = true;
    const pct = calcPctFromPointer(e.clientX);
    setScrollProgress(pct);
    scrollViewportTo(pct);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [calcPctFromPointer, scrollViewportTo]);

  const handleTimelinePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingTimeline.current) return;
    const pct = calcPctFromPointer(e.clientX);
    setScrollProgress(pct);
    scrollViewportTo(pct);
  }, [calcPctFromPointer, scrollViewportTo]);

  const handleTimelinePointerUp = useCallback(() => {
    isDraggingTimeline.current = false;
  }, []);

  useEffect(() => {
    const load = async () => {
      const [awardsRes, dataRes] = await Promise.all([
        fetch('/api/awards').then((r) => r.json()).catch(() => ({awards: []})),
        fetch('/api/data').then((r) => r.json()).catch(() => ({timeline: []})),
      ]);
      const nextAwards = Array.isArray(awardsRes.awards) ? awardsRes.awards : [];
      // Sort newest awards to the front (left)
      nextAwards.sort((a, b) => new Date(b.date || '1970').getTime() - new Date(a.date || '1970').getTime());
      
      const entries = Array.isArray(dataRes.timeline) ? dataRes.timeline : [];
      const map: Record<string, Entry> = {};
      for (const item of entries) {
        if (!item?.id) continue;
        map[item.id] = item;
      }
      setAwards(nextAwards);
      setEntryMap(map);
    };
    load();
  }, []);

  useEffect(() => {
    if (!focusAwardId) {
      setActiveAwardId(null);
      return;
    }
    if (awards.length === 0) return;
    const matchedAward = awards.find((item) => item.id === focusAwardId);
    if (!matchedAward) return;
    setActiveAwardId(matchedAward.id);
    setHighlightAwardId(focusAwardId);
    requestAnimationFrame(() => {
      const target = document.querySelector(`[data-award-id="${focusAwardId}"]`);
      if (target && 'scrollIntoView' in target) {
        (target as HTMLElement).scrollIntoView({behavior: 'smooth', inline: 'center', block: 'center'});
      }
    });
    const timer = window.setTimeout(() => setHighlightAwardId(null), 2600);
    return () => window.clearTimeout(timer);
  }, [focusAwardId, awards]);

  const deckLayout = useMemo(() => buildDeckLayout(awards), [awards]);

  const timelineMarkers = useMemo(() => {
    if (!awards || awards.length === 0) return [];
    const dates = awards.map(a => a.date || '').filter(Boolean);
    const years = dates.map(d => parseInt(d.substring(0, 4))).filter(y => !isNaN(y) && y > 1900);
    if (years.length === 0) return [];
    
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const range = maxYear - minYear;
    
    if (range === 0) return [{ year: minYear, pct: 50 }];

    const markers = [];
    // Newest year at left (pct = 0)
    for (let y = maxYear; y >= minYear; y--) {
      if (years.includes(y)) {
         markers.push({ year: y, pct: ((maxYear - y) / range) * 100 });
      }
    }
    return markers;
  }, [awards]);

  const activeAward = useMemo(
    () => awards.find((item) => item.id === activeAwardId) || null,
    [awards, activeAwardId],
  );

  const activeAwardFacts = useMemo(() => {
    if (!activeAward) return [];
    return [
      [t('证书编号', 'Certificate No'), activeAward.certificateNo],
      [t('项目名称', 'Project Name'), activeAward.projectName],
      [t('作者', 'Author Name'), activeAward.authorName],
      [t('指导老师', 'Instructor'), activeAward.instructorName],
      [t('所属单位', 'Organization'), activeAward.organizationName],
      [t('奖项级别', 'Award Level'), activeAward.awardLevel],
      [t('主办方', 'Organizer'), activeAward.organizer],
    ].filter((item): item is [string, string] => !!item[1]?.trim());
  }, [activeAward, lang]);

  const openWork = (entryId: string) => {
    onOpenWork(entryId);
  };

  // ── Mobile Masonry: Distribute awards into 3 columns by height ──
  const masonryColumns = useMemo(() => {
    if (isDesktop) return [[], [], []];
    const columns: Award[][][] = [[], [], []];
    const heights = [0, 0, 0];
    
    awards.forEach(a => {
      const ratio = getAwardRatio(a); // width/height
      const estimatedHeight = 1 / ratio + 0.2; // +0.2 for padding/title
      
      // Find shortest column
      let shortestIdx = 0;
      if (heights[1] < heights[shortestIdx]) shortestIdx = 1;
      if (heights[2] < heights[shortestIdx]) shortestIdx = 2;
      
      columns[shortestIdx].push(a);
      heights[shortestIdx] += estimatedHeight;
    });
    
    return columns;
  }, [awards, isDesktop]);

  return (
    <div className={`awards-page-v2 minimalist no-grass ${!isDesktop ? 'is-mobile' : ''}`}>
      <header className="awards-header-v2">
        <button
          type="button"
          className="awards-v2-back"
          onClick={onBack}
          title={t('返回首页', 'Back Home')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="awards-title-v2">
          <h1>{t('奖状展示', 'Awards Gallery')}</h1>
        </div>
      </header>

      <section className={`awards-dynamic-stage ${isDesktop ? 'is-desktop' : 'is-mobile'}`}>
        {awards.length === 0 ? <div className="awards-empty">{t('馆藏建设中...', 'Curating collection...')}</div> : null}
        
        <div 
          className="awards-deck-viewport" 
          ref={viewportRef}
          onScroll={handleViewportScroll}
        >
          {isDesktop ? (
            <div 
              className="awards-deck-canvas"
              style={{ 
                minHeight: `${deckLayout.stageHeight}px`, 
                width: `${deckLayout.stageWidth + 600}px` 
              }}
            >
              {awards.slice(0, visibleCount).map((award, idx) => {
                const layout = deckLayout.cards[idx];
                return (
                  <AwardCard 
                    key={award.id}
                    award={award}
                    layout={layout}
                    idx={idx}
                    isDesktop={isDesktop && isMounted}
                    hoveredIndex={hoveredIndex}
                    setHoveredIndex={setHoveredIndex}
                    onClick={() => openAward(award.id)}
                    isHighlight={highlightAwardId === award.id}
                  />
                );
              })}
            </div>
          ) : (
            <div className="awards-masonry-grid">
              {masonryColumns.map((column, colIdx) => (
                <div key={colIdx} className={`awards-masonry-column col-${colIdx}`}>
                  {column.map((award, idx) => (
                    <AwardCard 
                      key={award.id}
                      award={award}
                      layout={null as any} // Not used in mobile mode
                      idx={idx}
                      isDesktop={false}
                      hoveredIndex={null}
                      setHoveredIndex={() => {}}
                      onClick={() => openAward(award.id)}
                      isHighlight={highlightAwardId === award.id}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Minimal Timeline Scrubber — custom pointer-event driven for 60fps smoothness */}
        {isDesktop && awards.length > 3 && deckLayout.stageWidth > 1200 && (
          <div className="awards-timeline-wrapper">
            <div 
              className="awards-timeline-track"
              ref={timelineTrackRef}
              onPointerDown={handleTimelinePointerDown}
              onPointerMove={handleTimelinePointerMove}
              onPointerUp={handleTimelinePointerUp}
              onPointerCancel={handleTimelinePointerUp}
              role="slider"
              aria-label="Timeline"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(scrollProgress)}
              tabIndex={0}
            >
              {timelineMarkers.map(m => (
                <div key={m.year} className="awards-timeline-year-marker" style={{ left: `${m.pct}%` }}>
                  {m.year}
                </div>
              ))}
              <div 
                className="awards-timeline-progress" 
                style={{ width: `${scrollProgress}%` }} 
              />
              <div 
                className="awards-timeline-thumb" 
                style={{ left: `${scrollProgress}%` }} 
              />
            </div>
          </div>
        )}
      </section>

      {/* Controls hint overlay — bottom-left */}
      <HintOverlay lang={lang} isDesktop={isDesktop} />

      <AnimatePresence>
        {activeAward && (
          <motion.div 
            className="award-glass-lightbox"
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(16px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            onClick={closeAward}
          >
            <motion.div 
              className="award-glass-panel"
              initial={{ scale: 0.9, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: -20, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" className="award-glass-close" onClick={closeAward}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              
              <div className="award-glass-media">
                <img src={activeAward.image} alt={activeAward.title} loading="eager" decoding="async" />
              </div>
              
              <div className="award-glass-meta">
                <div className="award-glass-date">{activeAward.date || '--'}</div>
                <div className="award-glass-title">{activeAward.title}</div>
                {activeAward.workTitle && <div className="award-glass-work">{activeAward.workTitle}</div>}
                
                {activeAwardFacts.length > 0 && (
                  <div className="award-glass-facts">
                    {activeAwardFacts.map(([label, value]) => (
                      <div key={label} className="award-glass-fact">
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                )}

                <div className="award-glass-links">
                  <button type="button" className="share-link-btn" onClick={() => void copyShareLink()}>
                    {shareCopied ? t('已复制链接', 'Link Copied') : t('复制分享链接', 'Copy Share Link')}
                  </button>
                </div>
                
                <div className="award-glass-links">
                  {activeAward.workEntryIds.map((id) => (
                    <button type="button" key={id} onClick={() => openWork(id)}>
                      {t('鉴赏原本作品', 'Examine Original')} · {entryMap[id]?.titleEn || entryMap[id]?.title || id}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
