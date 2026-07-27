import {useEffect, useRef, useState, type CSSProperties} from 'react';
import {ArrowUpRight, Copy} from 'lucide-react';
import {adminApi, type VibecodingProject} from './adminApi';
import {resolveRuntimeContentUrl} from './runtimeUrls';

const openSlugInNewTab = (slug: string) => {
  window.open(`/vibecoding/${encodeURIComponent(slug)}`, '_blank', 'noopener,noreferrer');
};

const formatDateLabel = (value: string, lang: 'zh' | 'en') => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return lang === 'zh' ? '未知时间' : 'Unknown date';
  return lang === 'zh'
    ? `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
    : date.toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'});
};

const getProjectFolder = (project: VibecodingProject) =>
  project.projectRootRelativePath.split('/').filter(Boolean).pop() || project.slug;

const getLocalizedProjectTitle = (project: VibecodingProject, lang: 'zh' | 'en') =>
  (lang === 'zh' ? project.titleZh : project.titleEn) || project.title || 'Untitled Project';

const getLocalizedProjectDescription = (project: VibecodingProject, lang: 'zh' | 'en') =>
  (lang === 'zh' ? project.descriptionZh : project.descriptionEn) || project.description || '';

export default function VibecodingPage({
  lang,
  onBack,
  onToggleLang,
}: {
  lang: 'zh' | 'en';
  onBack: () => void;
  onToggleLang: () => void;
}) {
  const [projects, setProjects] = useState<VibecodingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyingSlug, setCopyingSlug] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<VibecodingProject | null>(null);
  const [detailClosing, setDetailClosing] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

  useEffect(() => {
    window.scrollTo({top: 0, behavior: 'auto'});
    let cancelled = false;
    const load = async () => {
      try {
        const data = await adminApi.getVibecodingProjects();
        if (cancelled) return;
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      } catch {
        if (cancelled) return;
        setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Scroll-reveal: elements marked [data-reveal] fade/rise in as they enter the viewport.
  useEffect(() => {
    if (loading) return;
    const root = gridRef.current;
    if (!root) return;
    const targets: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (targets.length === 0) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      targets.forEach((el) => el.classList.add('is-revealed'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add('is-revealed');
            io.unobserve(entry.target);
          }
        });
      },
      {threshold: 0.12, rootMargin: '0px 0px -8% 0px'},
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [loading, projects.length]);

  useEffect(() => {
    if (!selectedProject) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestCloseDetail();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject]);

  const requestCloseDetail = () => {
    setDetailClosing(true);
    window.setTimeout(() => {
      setSelectedProject(null);
      setDetailClosing(false);
    }, 240);
  };

  const copyShareLink = async (slug: string) => {
    if (!navigator.clipboard?.writeText) return;
    const url = `${window.location.origin}/vibecoding/${encodeURIComponent(slug)}`;
    await navigator.clipboard.writeText(url);
    setCopyingSlug(slug);
    window.setTimeout(() => {
      setCopyingSlug((prev) => (prev === slug ? null : prev));
    }, 1400);
  };

  const projectCount = projects.length;
  const latestProject = projects.reduce<VibecodingProject | null>((latest, project) => {
    if (!latest) return project;
    return new Date(project.updatedAt).getTime() > new Date(latest.updatedAt).getTime() ? project : latest;
  }, null);

  const selectedProjectFolder = selectedProject ? getProjectFolder(selectedProject) : '';

  return (
    <div className="vibecoding-page no-grass">
      <div className="vibecoding-atmosphere" aria-hidden="true">
        <div className="vibe-soft-glow" />
      </div>

      <section className="vibecoding-hero-shell">
        <header className="vibecoding-topbar">
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

          <div className="vibecoding-topbar-actions">
            <div className="vibecoding-topbar-chip">
              <span className="vibe-chip-dot" aria-hidden="true" />
              <span>{t('浏览器实验展厅', 'Browser Lab')}</span>
            </div>
            <button
              type="button"
              className="vibecoding-lang-toggle"
              onClick={onToggleLang}
              aria-label={lang === 'zh' ? 'Switch to English' : '切换为中文'}
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
          </div>
        </header>

        <div className="vibecoding-hero">
          <div className="vibecoding-hero-copy">
            <div className="vibecoding-kicker">
              <span>VIBECODING</span>
              <span className="vibe-kicker-sep" aria-hidden="true" />
              <span>{t('实验索引', 'Experiment Index')}</span>
            </div>
            <h1>
              {t('把代码写成', 'Code, reshaped into')}
              <br />
              <em>{t('可分享的互动艺术', 'shareable interactive art')}</em>
            </h1>
            <p>
              {t(
                '这里不是普通作品列表，而是一组可以直接打开、试玩、传播的浏览器实验。每个页面都像一件小型数字装置。',
                'Not a plain archive — a shelf of browser experiments made to be opened, played with, and passed around like small digital installations.',
              )}
            </p>

            <div className="vibecoding-stats" aria-label={t('页面数据', 'Page stats')}>
              <article>
                <strong>{String(projectCount).padStart(2, '0')}</strong>
                <span>{t('已发布实验', 'Experiments')}</span>
              </article>
              <span className="vibe-stat-div" aria-hidden="true" />
              <article>
                <strong>{latestProject ? formatDateLabel(latestProject.updatedAt, lang) : '--'}</strong>
                <span>{t('最近更新', 'Latest update')}</span>
              </article>
              <span className="vibe-stat-div" aria-hidden="true" />
              <article>
                <strong>{t('本地运行', 'Local')}</strong>
                <span>{t('访客设备实时执行', 'Runs on your device')}</span>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="vibecoding-collection-shell">
        <div className="vibecoding-section-head">
          <h2>{t('实验作品', 'The experiments')}</h2>
          <p>
            {t(
              '每一张卡片都不是静态封面，而是一个待展开的实验入口。',
              'Each card is less a thumbnail, more a portal into a runnable experiment.',
            )}
          </p>
        </div>

        <div className="vibecoding-grid" ref={gridRef}>
          {loading ? <div className="vibecoding-empty">{t('正在载入实验…', 'Loading experiments…')}</div> : null}
          {!loading && projectCount === 0 ? (
            <div className="vibecoding-empty">
              <strong>{t('这里还没有公开实验', 'No public experiment yet')}</strong>
              <span>{t('放入第一个 VibeCoding 项目后，这面墙就会亮起来。', 'Publish the first VibeCoding project and this wall lights up.')}</span>
            </div>
          ) : null}

          {projects.map((project, idx) => {
            const folderName = getProjectFolder(project);
            const localizedTitle = getLocalizedProjectTitle(project, lang);
            const localizedDescription = getLocalizedProjectDescription(project, lang);
            const ext = project.entryRelativePath.split('.').pop()?.toUpperCase() || 'HTML';

            return (
              <article
                key={project.id}
                className="vibecoding-card"
                data-reveal=""
                role="button"
                tabIndex={0}
                style={{['--card-index' as string]: String(idx)} as CSSProperties}
                onClick={() => setSelectedProject(project)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedProject(project);
                  }
                }}
                title={localizedTitle}
              >
                <div className="vibecoding-card-media">
                  {project.coverImage ? (
                    <img
                      src={resolveRuntimeContentUrl(project.coverImage)}
                      alt={localizedTitle || 'VibeCoding cover'}
                      loading="lazy"
                    />
                  ) : (
                    <div className="vibecoding-card-fallback">
                      <span className="vibecoding-card-fallback-mark">{(localizedTitle || 'V').slice(0, 1)}</span>
                      <span className="vibecoding-card-fallback-folder">{folderName}</span>
                    </div>
                  )}
                  <span className="vibecoding-card-open" aria-hidden="true">
                    <ArrowUpRight size={16} strokeWidth={1.9} />
                  </span>
                </div>

                <div className="vibecoding-card-body">
                  <div className="vibecoding-card-meta">
                    <span>{ext}</span>
                    <span className="vibe-meta-dot" aria-hidden="true" />
                    <span>{formatDateLabel(project.updatedAt, lang)}</span>
                  </div>
                  <h3 className="vibecoding-card-title">{localizedTitle}</h3>
                  <p className="vibecoding-card-desc">
                    {localizedDescription ||
                      t('一个可直接在浏览器中打开的实验页面。', 'A browser-native experiment, ready to open.')}
                  </p>
                  <div className="vibecoding-card-actions">
                    <span className="vibecoding-open-pill">
                      {t('打开实验', 'Open')}
                      <ArrowUpRight size={13} strokeWidth={2} />
                    </span>
                    <button
                      type="button"
                      className="vibecoding-share-btn"
                      aria-label={t('复制分享链接', 'Copy share link')}
                      onClick={(event) => {
                        event.stopPropagation();
                        void copyShareLink(project.slug);
                      }}
                    >
                      <Copy size={13} strokeWidth={1.9} />
                      <span>{copyingSlug === project.slug ? t('已复制', 'Copied') : t('复制链接', 'Copy')}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selectedProject ? (
        <div
          className={`vibecoding-detail-overlay${detailClosing ? ' is-closing' : ''}`}
          onClick={requestCloseDetail}
          role="presentation"
        >
          <div
            className={`vibecoding-detail-panel${detailClosing ? ' is-closing' : ''}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={getLocalizedProjectTitle(selectedProject, lang) || 'VibeCoding project detail'}
          >
            <button
              type="button"
              className="vibecoding-detail-close"
              onClick={requestCloseDetail}
              aria-label={t('关闭详情', 'Close details')}
            >
              ×
            </button>

            <div className="vibecoding-detail-hero">
              {selectedProject.coverImage ? (
                <img
                  src={resolveRuntimeContentUrl(selectedProject.coverImage)}
                  alt={getLocalizedProjectTitle(selectedProject, lang) || 'VibeCoding cover'}
                />
              ) : (
                <div className="vibecoding-detail-fallback">
                  <span className="vibecoding-detail-fallback-mark">
                    {(getLocalizedProjectTitle(selectedProject, lang) || 'V').slice(0, 1)}
                  </span>
                  <span>{selectedProjectFolder}</span>
                </div>
              )}
            </div>

            <div className="vibecoding-detail-copy">
              <div className="vibecoding-detail-kicker">VIBECODING · {selectedProjectFolder}</div>
              <h3>{getLocalizedProjectTitle(selectedProject, lang)}</h3>
              <div className="vibecoding-detail-meta">
                <span>{selectedProject.slug}</span>
                <span>{formatDateLabel(selectedProject.updatedAt, lang)}</span>
              </div>
              <p>
                {getLocalizedProjectDescription(selectedProject, lang) ||
                  t(
                    '这是一个可以直接在浏览器中运行的实验项目。你可以先了解它，再决定是否进入实验页面。',
                    'A browser-native experiment. Read it first, then step inside whenever you like.',
                  )}
              </p>
              <div className="vibecoding-detail-actions">
                <button
                  type="button"
                  className="vibecoding-detail-enter"
                  onClick={() => openSlugInNewTab(selectedProject.slug)}
                >
                  <span>{t('进入项目', 'Enter project')}</span>
                  <ArrowUpRight size={16} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="vibecoding-detail-share"
                  onClick={() => void copyShareLink(selectedProject.slug)}
                >
                  <Copy size={14} strokeWidth={1.9} />
                  <span>{copyingSlug === selectedProject.slug ? t('已复制', 'Copied') : t('复制链接', 'Copy link')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
