import {useEffect, useMemo, useRef, useState} from 'react';
import {adminApi, type VibecodingProject} from './adminApi';
import {resolveRuntimeContentUrl} from './runtimeUrls';

const getLocalizedProjectTitle = (project: VibecodingProject, lang: 'zh' | 'en') =>
  (lang === 'zh' ? project.titleZh : project.titleEn) || project.title || 'Untitled Project';

const getLocalizedProjectDescription = (project: VibecodingProject, lang: 'zh' | 'en') =>
  (lang === 'zh' ? project.descriptionZh : project.descriptionEn) || project.description || '';

export default function VibecodingLaunchPage({
  lang,
  slug,
  onBackToList,
}: {
  lang: 'zh' | 'en';
  slug: string;
  onBackToList: () => void;
}) {
  const [project, setProject] = useState<VibecodingProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const launchAttemptedRef = useRef(false);
  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

  useEffect(() => {
    window.scrollTo({top: 0, behavior: 'auto'});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setProject(null);
    launchAttemptedRef.current = false;
    const load = async () => {
      try {
        const data = await adminApi.getVibecodingProject(slug);
        if (cancelled) return;
        setProject(data.project || null);
      } catch {
        if (cancelled) return;
        setError(t('没有找到这个 VibeCoding 项目', 'This VibeCoding project could not be found.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [lang, slug]);

  const openProject = () => {
    if (!project?.entryUrl) return;
    const targetUrl = resolveRuntimeContentUrl(project.entryUrl);
    window.location.replace(targetUrl);
  };

  useEffect(() => {
    if (!project?.entryUrl || launchAttemptedRef.current) return;
    launchAttemptedRef.current = true;
    openProject();
  }, [project]);

  const copyShareLink = async () => {
    if (!navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1400);
  };

  const projectFolderName = useMemo(
    () => project?.projectRootRelativePath.split('/').pop() || '',
    [project],
  );

  return (
    <div className="vibecoding-launch-page no-grass">
      <div className="vibecoding-launch-panel">
        <button type="button" className="ghost awards-back-btn icon-only" onClick={onBackToList}>
          <span className="awards-back-icon" aria-hidden="true">
            ←
          </span>
        </button>

        {loading ? <div className="vibecoding-launch-state">{t('正在准备项目...', 'Preparing project...')}</div> : null}

        {!loading && error ? <div className="vibecoding-launch-state">{error}</div> : null}

        {!loading && !error && project ? (
          <div className="vibecoding-launch-shell">
            <div className="vibecoding-launch-hero">
              {project.coverImage ? (
                <img src={resolveRuntimeContentUrl(project.coverImage)} alt={getLocalizedProjectTitle(project, lang) || 'VibeCoding cover'} />
              ) : (
                <div className="vibecoding-launch-fallback">
                  <span>HTML</span>
                  <strong>{getLocalizedProjectTitle(project, lang)}</strong>
                </div>
              )}
            </div>

            <div className="vibecoding-launch-copy">
              <div className="vibecoding-launch-kicker">VIBECODING</div>
              <h1>{getLocalizedProjectTitle(project, lang)}</h1>
              {getLocalizedProjectDescription(project, lang) ? <p>{getLocalizedProjectDescription(project, lang)}</p> : null}
              <div className="vibecoding-launch-meta">
                <span>{project.slug}</span>
                {projectFolderName ? <span>{projectFolderName}</span> : null}
              </div>
              <div className="vibecoding-launch-actions">
                <button type="button" onClick={openProject}>
                  {t('打开项目', 'Open Project')}
                </button>
                <button type="button" className="ghost" onClick={() => void copyShareLink()}>
                  {shareCopied ? t('链接已复制', 'Link Copied') : t('复制分享链接', 'Copy Share Link')}
                </button>
                <button type="button" className="ghost" onClick={onBackToList}>
                  {t('返回项目列表', 'Back to Project List')}
                </button>
              </div>
              <div className="vibecoding-launch-note">
                {t(
                  '如果浏览器拦截了自动打开，请点上面的“打开项目”。这个分享页会保持稳定，真实 HTML 会在当前页直接启动。',
                  'If your browser blocks the automatic launch, use “Open Project” above. This share page stays stable while the real HTML launches directly in the current page.',
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
