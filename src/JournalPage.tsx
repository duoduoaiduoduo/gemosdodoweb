import {useEffect, useMemo, useRef, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';

type JournalLayoutElement = {
  id: string;
  type: 'text' | 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotation: number;
  content?: string;
  url?: string;
  style?: {
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    fit?: 'cover' | 'contain';
    radius?: number;
  };
};

type JournalRecord = {
  id: string;
  title: string;
  date?: string;
  note?: string;
  coverImage?: string;
  layout?: {
    version: 1;
    canvas?: {
      width?: number;
      height?: number;
      bgColor?: string;
    };
    elements?: JournalLayoutElement[];
  };
  createdAt?: string;
  updatedAt?: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const extractCoverFromLayout = (layout?: JournalRecord['layout']) => {
  if (!Array.isArray(layout?.elements)) return '';
  const imageEl = layout.elements.find((el) => el?.type === 'image' && String(el.url || '').trim());
  return imageEl?.url || '';
};

const normalizeDateSortValue = (value?: string) => {
  if (!value) return 0;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;
  const digits = value.match(/\d+/g);
  if (!digits || digits.length === 0) return 0;
  const y = Number(digits[0] || 0);
  const m = Number(digits[1] || 1);
  const d = Number(digits[2] || 1);
  return new Date(y, Math.max(0, m - 1), Math.max(1, d)).getTime();
};

function JournalLayoutReadonly({layout}: {layout?: JournalRecord['layout']}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasWidth = Math.max(320, Number(layout?.canvas?.width) || 1920);
  const canvasHeight = Math.max(240, Number(layout?.canvas?.height) || 1080);
  const bgColor = layout?.canvas?.bgColor || '#ffffff';
  const elements = Array.isArray(layout?.elements) ? [...layout.elements] : [];
  const sortedElements = useMemo(() => elements.sort((a, b) => Number(a?.z || 0) - Number(b?.z || 0)), [layout]);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const host = viewportRef.current;
    if (!host) return;
    const update = () => {
      const next = clamp((host.clientWidth || canvasWidth) / canvasWidth, 0.12, 1);
      setScale(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, [canvasWidth]);

  if (sortedElements.length === 0) {
    return <div className="journal-layout-empty">No layout content</div>;
  }

  return (
    <div className="journal-layout-viewport" ref={viewportRef} style={{height: canvasHeight * scale}}>
      <div
        className="journal-layout-canvas"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          background: bgColor,
        }}
      >
        {sortedElements.map((el) => {
          const baseStyle = {
            left: Number(el?.x || 0),
            top: Number(el?.y || 0),
            width: Math.max(1, Number(el?.w || 1)),
            height: Math.max(1, Number(el?.h || 1)),
            zIndex: Number(el?.z || 0),
            transform: `rotate(${Number(el?.rotation || 0)}deg)`,
          };
          if (el?.type === 'image') {
            return (
              <div key={el.id} className="journal-layout-el" style={baseStyle}>
                <img
                  src={String(el.url || '')}
                  alt=""
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: el.style?.fit === 'contain' ? 'contain' : 'cover',
                    borderRadius: `${Math.max(0, Number(el.style?.radius) || 0)}px`,
                  }}
                />
              </div>
            );
          }
          return (
            <div key={el.id} className="journal-layout-el journal-layout-text" style={baseStyle}>
              <div
                style={{
                  color: el.style?.color || '#111111',
                  fontSize: `${Math.max(12, Number(el.style?.fontSize) || 28)}px`,
                  fontWeight: Math.max(100, Number(el.style?.fontWeight) || 500),
                  lineHeight: 1.35,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {String(el.content || '')}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function JournalPage({
  lang,
  focusJournalId,
  onBack,
}: {
  lang: 'zh' | 'en';
  focusJournalId: string | null;
  onBack: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [journals, setJournals] = useState<JournalRecord[]>([]);
  const [activeJournal, setActiveJournal] = useState<JournalRecord | null>(null);
  const [highlightJournalId, setHighlightJournalId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

  const setJournalFocusInUrl = (journalId: string | null, replace = false) => {
    const params = new URLSearchParams(location.search || '');
    if (journalId) params.set('focus', journalId);
    else params.delete('focus');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: '/journal',
        search: nextSearch ? `?${nextSearch}` : '',
      },
      {replace},
    );
  };

  useEffect(() => {
    window.scrollTo({top: 0, behavior: 'auto'});
  }, []);

  useEffect(() => {
    const load = async () => {
      const data = await fetch('/api/journals').then((r) => r.json()).catch(() => ({journals: []}));
      const list = Array.isArray(data.journals) ? data.journals : [];
      list.sort((a: JournalRecord, b: JournalRecord) => {
        const byDate = normalizeDateSortValue(b?.date) - normalizeDateSortValue(a?.date);
        if (byDate !== 0) return byDate;
        return normalizeDateSortValue(b?.updatedAt) - normalizeDateSortValue(a?.updatedAt);
      });
      setJournals(list);
    };
    load();
  }, []);

  useEffect(() => {
    if (!focusJournalId) {
      setActiveJournal(null);
      return;
    }
    const exists = journals.some((item) => item.id === focusJournalId);
    if (!exists) return;
    const matchedJournal = journals.find((item) => item.id === focusJournalId);
    if (matchedJournal) {
      void openJournalDetail(matchedJournal, false);
    }
    setHighlightJournalId(focusJournalId);
    requestAnimationFrame(() => {
      const target = document.querySelector(`[data-journal-id="${focusJournalId}"]`);
      if (target && 'scrollIntoView' in target) {
        (target as HTMLElement).scrollIntoView({behavior: 'smooth', block: 'nearest'});
      }
    });
    const timer = window.setTimeout(() => setHighlightJournalId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [focusJournalId, journals]);

  const openJournalDetail = async (journal: JournalRecord, syncUrl = true) => {
    setActiveJournal(journal);
    if (syncUrl) {
      setJournalFocusInUrl(journal.id, !!focusJournalId);
    }
    try {
      const data = await fetch(`/api/journals/${encodeURIComponent(journal.id)}`)
        .then((r) => r.json())
        .catch(() => null);
      if (data?.success && data?.journal?.id === journal.id) {
        setActiveJournal(data.journal);
      }
    } catch {
      // keep optimistic data
    }
  };

  const closeJournal = () => {
    setActiveJournal(null);
    setJournalFocusInUrl(null, true);
  };

  const copyShareLink = async () => {
    if (!activeJournal?.id || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1600);
  };

  return (
    <div className="journal-page no-grass">
      <header className="journal-header">
        <button
          type="button"
          className="ghost awards-back-btn icon-only"
          onClick={onBack}
          aria-label={t('返回首页', 'Back Home')}
          title={t('返回首页', 'Back Home')}
        >
          <span className="awards-back-icon" aria-hidden="true">
            ←
          </span>
        </button>
        <div className="journal-title-wrap">
          <h1>{t('手账本档案', 'Scrapbook Archive')}</h1>
          <p>{t('记录电影票、照片和当时想说的话，按时间倒序整理。', 'Memories, tickets and notes sorted in reverse chronological order.')}</p>
        </div>
      </header>

      <section className="journal-grid">
        {journals.length === 0 ? <div className="journal-empty">{t('还没有手账记录', 'No journal records yet')}</div> : null}
        {journals.map((journal, idx) => {
          const cover = journal.coverImage || extractCoverFromLayout(journal.layout);
          const snippet = String(journal.note || '').trim();
          return (
            <button
              key={journal.id}
              type="button"
              className={`journal-card ${highlightJournalId === journal.id ? 'is-highlight' : ''}`}
              data-journal-id={journal.id}
              style={{['--card-index' as string]: String(idx)}}
              onClick={() => openJournalDetail(journal)}
            >
              <div className="journal-card-cover">
                {cover ? (
                  <img src={cover} alt={journal.title || 'journal cover'} loading="lazy" />
                ) : (
                  <div className="journal-card-fallback">
                    <strong>{journal.title || 'Untitled Journal'}</strong>
                    <span>{journal.date || t('未设置日期', 'No date')}</span>
                  </div>
                )}
              </div>
              <div className="journal-card-body">
                <div className="journal-card-date">{journal.date || '--'}</div>
                <div className="journal-card-title">{journal.title || 'Untitled Journal'}</div>
                {snippet ? <div className="journal-card-note">{snippet.slice(0, 92)}</div> : null}
              </div>
            </button>
          );
        })}
      </section>

      {activeJournal ? (
        <div className="journal-lightbox" onClick={closeJournal}>
          <div className="journal-lightbox-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="award-lightbox-close" onClick={closeJournal}>
              ×
            </button>
            <div className="journal-lightbox-main">
              <JournalLayoutReadonly layout={activeJournal.layout} />
            </div>
            <div className="journal-lightbox-side">
              <div className="journal-lightbox-date">{activeJournal.date || '--'}</div>
              <div className="journal-lightbox-title">{activeJournal.title || 'Untitled Journal'}</div>
              <div className="journal-lightbox-note">{activeJournal.note || t('暂无文字记录', 'No note content')}</div>
              <div className="award-lightbox-links">
                <button type="button" className="share-link-btn" onClick={() => void copyShareLink()}>
                  {shareCopied ? t('已复制链接', 'Link Copied') : t('复制分享链接', 'Copy Share Link')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
