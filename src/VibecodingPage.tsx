import {useEffect, useState, type CSSProperties} from 'react';
import {ArrowUpRight, Code2, Copy, Orbit, Sparkles} from 'lucide-react';
import {adminApi, type VibecodingProject} from './adminApi';
import {resolveRuntimeContentUrl} from './runtimeUrls';

const palettePresets = [
  {accent: '#7cf7cf', glow: 'rgba(124, 247, 207, 0.35)', panel: '#0c191b', ink: '#e9fff7'},
  {accent: '#ff8f5b', glow: 'rgba(255, 143, 91, 0.3)', panel: '#1b1210', ink: '#fff0e8'},
  {accent: '#61c8ff', glow: 'rgba(97, 200, 255, 0.28)', panel: '#0c141d', ink: '#edf8ff'},
  {accent: '#f06fff', glow: 'rgba(240, 111, 255, 0.28)', panel: '#19111f', ink: '#fff0ff'},
  {accent: '#ffe66f', glow: 'rgba(255, 230, 111, 0.24)', panel: '#1b170d', ink: '#fffbe8'},
];

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

  useEffect(() => {
    if (!selectedProject) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedProject(null);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedProject]);

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
        <div className="vibe-aurora vibe-aurora-a" />
        <div className="vibe-aurora vibe-aurora-b" />
        <div className="vibe-grid-haze" />
        <div className="vibe-noise-lines" />
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
              <Sparkles size={14} strokeWidth={1.8} />
              <span>{t('浏览器实验展厅', 'Browser-native art lab')}</span>
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
              <Orbit size={15} strokeWidth={1.8} />
              <span>VIBECODING SIGNAL / 01</span>
            </div>
            <h1>{t('把代码写成可分享的互动艺术', 'Turning code into shareable interactive art')}</h1>
            <p>
              {t(
                '这里不是普通作品列表，而是一组可以直接打开、试玩、传播的浏览器实验。每个页面都像一个小型数字装置，在别人的电脑里继续生长。',
                'This is not a plain project archive. It is a shelf of browser experiments designed to be opened, played with, and passed around like small digital installations.',
              )}
            </p>

            <div className="vibecoding-hero-tags" aria-label={t('页面特性', 'Page highlights')}>
              <span>{t('可直接打开', 'Open instantly')}</span>
              <span>{t('可复制分享', 'Shareable links')}</span>
              <span>{t('HTML / CSS / JS', 'HTML / CSS / JS')}</span>
              <span>{t('作者友好型实验', 'Artist-friendly experiments')}</span>
            </div>

            <div className="vibecoding-stats">
              <article>
                <strong>{String(projectCount).padStart(2, '0')}</strong>
                <span>{t('已发布实验', 'Published experiments')}</span>
              </article>
              <article>
                <strong>{latestProject ? formatDateLabel(latestProject.updatedAt, lang) : '--'}</strong>
                <span>{t('最近更新', 'Latest update')}</span>
              </article>
              <article>
                <strong>{t('本地运行', 'Runs locally')}</strong>
                <span>{t('由访问者设备实时执行', 'Executed live on the visitor device')}</span>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="vibecoding-collection-shell">
        <div className="vibecoding-section-head">
          <div>
            <span className="vibecoding-section-kicker">EXPERIMENT INDEX</span>
            <h2>{t('实验卡片墙', 'Experiment card wall')}</h2>
          </div>
          <p>
            {t(
              '每一张卡片都不是静态封面，而是一个待展开的实验入口。',
              'Each card is treated less like a thumbnail and more like a portal into a runnable experiment.',
            )}
          </p>
        </div>

        <section className="vibecoding-grid">
          {loading ? <div className="vibecoding-empty">{t('正在校准实验信号...', 'Calibrating experiment signals...')}</div> : null}
          {!loading && projectCount === 0 ? (
            <div className="vibecoding-empty">
              <strong>{t('这里还没有公开实验', 'No public experiment yet')}</strong>
              <span>{t('等你放入第一个 VibeCoding 项目后，这面墙就会开始发光。', 'As soon as the first VibeCoding project is published, this wall will light up.')}</span>
            </div>
          ) : null}

          {projects.map((project, idx) => {
            const palette = palettePresets[idx % palettePresets.length];
            const folderName = getProjectFolder(project);
            const localizedTitle = getLocalizedProjectTitle(project, lang);
            const localizedDescription = getLocalizedProjectDescription(project, lang);

            return (
              <article
                key={project.id}
                className="vibecoding-card"
                role="button"
                tabIndex={0}
                style={
                  {
                    ['--vibe-accent' as string]: palette.accent,
                    ['--vibe-glow' as string]: palette.glow,
                    ['--vibe-panel' as string]: palette.panel,
                    ['--vibe-light-ink' as string]: palette.ink,
                    ['--card-index' as string]: String(idx),
                  } as CSSProperties
                }
                onClick={() => setSelectedProject(project)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedProject(project);
                  }
                }}
                title={localizedTitle}
              >
                <div className="vibecoding-card-shell">
                  <div className="vibecoding-card-chassis">
                    <div className="vibecoding-card-screen">
                      {project.coverImage ? (
                        <img
                          src={resolveRuntimeContentUrl(project.coverImage)}
                          alt={localizedTitle || 'VibeCoding cover'}
                          loading="lazy"
                        />
                      ) : (
                        <div className="vibecoding-card-fallback">
                          <div className="vibecoding-card-fallback-grid" />
                          <div className="vibecoding-card-fallback-ring vibe-fallback-ring-a" />
                          <div className="vibecoding-card-fallback-ring vibe-fallback-ring-b" />
                          <div className="vibecoding-card-fallback-copy">
                            <span className="vibecoding-card-badge">HTML LAB</span>
                            <strong>{localizedTitle}</strong>
                            <span>{folderName}</span>
                          </div>
                        </div>
                      )}
                      <div className="vibecoding-card-overlay">
                        <span>{t('可交互实验', 'Interactive experiment')}</span>
                        <ArrowUpRight size={15} strokeWidth={1.8} />
                      </div>
                    </div>

                    <div className="vibecoding-card-body">
                      <div className="vibecoding-card-topline">
                        <span>{project.slug}</span>
                        <span>{folderName}</span>
                      </div>
                      <div className="vibecoding-card-title">{localizedTitle}</div>
                      <div className="vibecoding-card-desc">
                        {localizedDescription ||
                          t('这是一个可直接在浏览器中打开的实验页面。', 'A browser-native experiment ready to be opened instantly.')}
                      </div>

                      <div className="vibecoding-card-telemetry">
                        <span>{formatDateLabel(project.updatedAt, lang)}</span>
                        <span>{project.entryRelativePath.split('.').pop()?.toUpperCase() || 'HTML'}</span>
                      </div>

                      <div className="vibecoding-card-actions">
                        <span className="vibecoding-open-pill">
                          {t('打开实验', 'Open experiment')}
                          <ArrowUpRight size={14} strokeWidth={1.8} />
                        </span>
                        <button
                          type="button"
                          className="share-link-btn vibecoding-share-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyShareLink(project.slug);
                          }}
                        >
                          <Copy size={14} strokeWidth={1.8} />
                          <span>{copyingSlug === project.slug ? t('已复制', 'Copied') : t('复制链接', 'Copy Link')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </section>

      {selectedProject ? (
        <div className="vibecoding-detail-overlay" onClick={() => setSelectedProject(null)} role="presentation">
          <div
            className="vibecoding-detail-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={getLocalizedProjectTitle(selectedProject, lang) || 'VibeCoding project detail'}
          >
            <button
              type="button"
              className="vibecoding-detail-close"
              onClick={() => setSelectedProject(null)}
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
                  <Code2 size={44} strokeWidth={1.7} />
                  <span>{selectedProjectFolder}</span>
                </div>
              )}
            </div>

            <div className="vibecoding-detail-copy">
              <div className="vibecoding-detail-kicker">VIBECODING DETAIL</div>
              <h3>{getLocalizedProjectTitle(selectedProject, lang)}</h3>
              <div className="vibecoding-detail-meta">
                <span>{selectedProject.slug}</span>
                <span>{selectedProjectFolder}</span>
                <span>{formatDateLabel(selectedProject.updatedAt, lang)}</span>
              </div>
              <p>
                {getLocalizedProjectDescription(selectedProject, lang) ||
                  t(
                    '这是一个可以直接在浏览器中运行的实验项目。你可以先阅读它，再决定是否进入实验页面。',
                    'This is a browser-native experiment. Read it first, then decide when to enter the project.',
                  )}
              </p>
              <div className="vibecoding-detail-actions">
                <button
                  type="button"
                  className="vibecoding-detail-enter"
                  onClick={() => openSlugInNewTab(selectedProject.slug)}
                >
                  <span>{t('进入项目', 'Enter Project')}</span>
                  <ArrowUpRight size={16} strokeWidth={1.9} />
                </button>
                <button
                  type="button"
                  className="share-link-btn vibecoding-detail-share"
                  onClick={() => void copyShareLink(selectedProject.slug)}
                >
                  <Copy size={14} strokeWidth={1.8} />
                  <span>{copyingSlug === selectedProject.slug ? t('已复制', 'Copied') : t('复制链接', 'Copy Link')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
