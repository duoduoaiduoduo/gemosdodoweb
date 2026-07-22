import {useEffect, useMemo, useState, type CSSProperties} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';

type PdfPortfolio = {
  id: string;
  title: string;
  date?: string;
  description?: string;
  fileUrl: string;
  relativePath: string;
  size: number;
  pageCount?: number;
  coverImage?: string;
  coverImageNaturalWidth?: number;
  coverImageNaturalHeight?: number;
  workEntryIds: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
};

type Entry = {
  id: string;
  title: string;
  titleEn?: string;
};

const toSizeText = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return '--';
  const mb = size / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = size / 1024;
  return `${Math.max(1, Math.round(kb))} KB`;
};

const getCoverRatio = (pdf: PdfPortfolio) => {
  const w = Number(pdf.coverImageNaturalWidth);
  const h = Number(pdf.coverImageNaturalHeight);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return '';
  const ratio = w / h;
  // Keep cards readable even when metadata has extreme ratios.
  const clamped = Math.min(1.6, Math.max(0.62, ratio));
  return clamped.toFixed(4);
};

const palettePresets = [
  {accent: '#d66853', soft: '#f3ddd4', ink: '#4d1f17'},
  {accent: '#2e6f74', soft: '#dceced', ink: '#113437'},
  {accent: '#4971b8', soft: '#dce5f5', ink: '#192e57'},
  {accent: '#937249', soft: '#eee3d4', ink: '#4b3418'},
  {accent: '#6a5a96', soft: '#e5def3', ink: '#31264d'},
];

export default function PdfsPage({
  lang,
  focusPdfId,
  onBack,
  onOpenWork,
}: {
  lang: 'zh' | 'en';
  focusPdfId: string | null;
  onBack: () => void;
  onOpenWork: (entryId: string) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [pdfs, setPdfs] = useState<PdfPortfolio[]>([]);
  const [entryMap, setEntryMap] = useState<Record<string, Entry>>({});
  const [coverRatios, setCoverRatios] = useState<Record<string, string>>({});
  const [activePdfId, setActivePdfId] = useState<string | null>(null);
  const [highlightPdfId, setHighlightPdfId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

  const setPdfFocusInUrl = (pdfId: string | null, replace = false) => {
    const params = new URLSearchParams(location.search || '');
    if (pdfId) params.set('focus', pdfId);
    else params.delete('focus');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: '/pdfs',
        search: nextSearch ? `?${nextSearch}` : '',
      },
      {replace},
    );
  };

  const openPdf = (pdfId: string) => {
    setActivePdfId(pdfId);
    setPdfFocusInUrl(pdfId, !!focusPdfId);
  };

  const closePdf = () => {
    setActivePdfId(null);
    setPdfFocusInUrl(null, true);
  };

  const copyShareLink = async () => {
    if (!activePdfId || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1600);
  };

  useEffect(() => {
    window.scrollTo({top: 0, behavior: 'auto'});
    const page = document.querySelector('.pdf-page') as HTMLElement | null;
    if (page) page.scrollTop = 0;
  }, []);

  useEffect(() => {
    const load = async () => {
      const [pdfRes, dataRes] = await Promise.all([
        fetch('/api/pdfs').then((r) => r.json()).catch(() => ({pdfs: []})),
        fetch('/api/data').then((r) => r.json()).catch(() => ({timeline: []})),
      ]);
      const nextPdfs = Array.isArray(pdfRes.pdfs) ? pdfRes.pdfs : [];
      const entries = Array.isArray(dataRes.timeline) ? dataRes.timeline : [];
      const map: Record<string, Entry> = {};
      for (const item of entries) {
        if (!item?.id) continue;
        map[item.id] = item;
      }
      setPdfs(nextPdfs);
      setEntryMap(map);
    };
    load();
  }, []);

  useEffect(() => {
    if (!focusPdfId) {
      setActivePdfId(null);
      return;
    }
    const exists = pdfs.some((item) => item.id === focusPdfId);
    if (!exists) return;
    setActivePdfId(focusPdfId);
    setHighlightPdfId(focusPdfId);
    requestAnimationFrame(() => {
      const target = document.querySelector(`[data-pdf-id="${focusPdfId}"]`);
      if (target && 'scrollIntoView' in target) {
        (target as HTMLElement).scrollIntoView({behavior: 'smooth', block: 'nearest'});
      }
    });
    const timer = window.setTimeout(() => setHighlightPdfId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [focusPdfId, pdfs]);

  const activePdf = useMemo(
    () => pdfs.find((item) => item.id === activePdfId) || null,
    [pdfs, activePdfId],
  );

  const openWork = (entryId: string) => {
    onOpenWork(entryId);
  };

  return (
    <div className="pdf-page no-grass">
      <header className="pdf-header">
        <button
          type="button"
          className="ghost awards-back-btn icon-only"
          onClick={onBack}
          aria-label={t('返回首页', 'Back Home')}
          title={t('返回首页', 'Back Home')}
        >
          <span className="awards-back-icon" aria-hidden="true">
            ↩
          </span>
        </button>
        <div className="pdf-title-wrap">
          <h1>{t('作品集档案', 'Portfolio Archive')}</h1>
          <p>{t('用封面把作品先吸引住，再进入完整 PDF 阅读。', 'Lead with cover art, then open the full PDF inline.')}</p>
        </div>
      </header>

      <section className="pdf-grid">
        {pdfs.length === 0 ? <div className="pdf-empty">{t('暂无 PDF 作品集', 'No PDF portfolio yet')}</div> : null}
        {pdfs.map((pdf, idx) => {
          const palette = palettePresets[idx % palettePresets.length];
          return (
            <button
              key={pdf.id}
              type="button"
              className={`pdf-card ${highlightPdfId === pdf.id ? 'is-highlight' : ''}`}
              data-pdf-id={pdf.id}
              style={
                {
                  ['--card-index' as string]: String(idx),
                  ['--pdf-accent' as string]: palette.accent,
                  ['--pdf-accent-soft' as string]: palette.soft,
                  ['--pdf-ink' as string]: palette.ink,
                  ['--pdf-cover-ratio' as string]: coverRatios[pdf.id] || getCoverRatio(pdf) || '4 / 5',
                } as CSSProperties
              }
              onClick={() => openPdf(pdf.id)}
              title={pdf.title}
            >
              <div className="pdf-card-cover">
                {pdf.coverImage ? (
                  <img
                    src={pdf.coverImage}
                    alt={pdf.title || 'PDF cover'}
                    loading="lazy"
                    onLoad={(e) => {
                      const w = e.currentTarget.naturalWidth;
                      const h = e.currentTarget.naturalHeight;
                      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
                      const ratio = Math.min(1.6, Math.max(0.62, w / h)).toFixed(4);
                      setCoverRatios((prev) => (prev[pdf.id] === ratio ? prev : {...prev, [pdf.id]: ratio}));
                    }}
                  />
                ) : (
                  <div className="pdf-card-fallback">
                    <span className="pdf-card-fallback-tag">PDF</span>
                    <div className="pdf-card-shape pdf-card-shape-a" aria-hidden="true" />
                    <div className="pdf-card-shape pdf-card-shape-b" aria-hidden="true" />
                    <div className="pdf-card-shape pdf-card-shape-c" aria-hidden="true" />
                    <div className="pdf-card-fallback-meta">
                      <strong>{pdf.title || 'Untitled PDF'}</strong>
                      <span>{pdf.date || t('等待封面上传', 'Awaiting cover image')}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="pdf-card-body">
                <div className="pdf-card-topline">
                  <span className="pdf-card-date">{pdf.date || '--'}</span>
                  <span className="pdf-card-badge">{Array.isArray(pdf.workEntryIds) ? pdf.workEntryIds.length : 0}</span>
                </div>
                <div className="pdf-card-title">{pdf.title || 'Untitled PDF'}</div>
                {pdf.description ? <div className="pdf-card-desc">{pdf.description}</div> : null}
                <div className="pdf-card-meta">
                  <span>{toSizeText(pdf.size)}</span>
                  <span>
                    {t('关联作品', 'Linked Works')}: {Array.isArray(pdf.workEntryIds) ? pdf.workEntryIds.length : 0}
                  </span>
                  {pdf.pageCount ? <span>{pdf.pageCount}p</span> : null}
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {activePdf ? (
        <div className="pdf-lightbox" onClick={closePdf}>
          <div className="pdf-lightbox-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="award-lightbox-close" onClick={closePdf}>
              ×
            </button>
            <div className="pdf-lightbox-main">
              <iframe className="pdf-viewer-frame" src={activePdf.fileUrl} title={activePdf.title} />
            </div>
            <div className="pdf-lightbox-side">
              {activePdf.coverImage ? (
                <div className="pdf-lightbox-cover">
                  <img src={activePdf.coverImage} alt={activePdf.title || 'PDF cover'} />
                </div>
              ) : null}
              <div className="award-lightbox-date">{activePdf.date || '--'}</div>
              <div className="award-lightbox-title">{activePdf.title || 'Untitled PDF'}</div>
              {activePdf.description ? (
                <div className="award-lightbox-work">{activePdf.description}</div>
              ) : null}
              <div className="pdf-side-actions">
                <button type="button" className="share-link-btn" onClick={() => void copyShareLink()}>
                  {shareCopied ? t('已复制链接', 'Link Copied') : t('复制分享链接', 'Copy Share Link')}
                </button>
                <a href={activePdf.fileUrl} download target="_blank" rel="noreferrer">
                  {t('下载 PDF', 'Download PDF')}
                </a>
                <a href={activePdf.fileUrl} target="_blank" rel="noreferrer">
                  {t('新标签打开', 'Open in new tab')}
                </a>
              </div>
              <div className="award-lightbox-links">
                {activePdf.workEntryIds.map((id) => (
                  <button type="button" key={id} onClick={() => openWork(id)}>
                    {t('查看作品', 'View Work')} · {(entryMap[id]?.titleEn || entryMap[id]?.title || id).slice(0, 24)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
