import {lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Link, useLocation, useNavigate, useNavigationType} from 'react-router-dom';
import {ArrowUpRight, Check, ChevronLeft, ChevronRight, FileText, Menu, Share2, X} from 'lucide-react';
import {ImageViewer, MobileCanvas, MobileDialog, MobileImage, MobileWorkContent} from './MobileMedia';
import {categoryName, displayDate, fileSize, localized, type Language, type SiteData} from './types';

import MobileArchive from './MobileArchive';
import HomeCompanion from '../HomeCompanion';
import {initialArchive} from './archive';

const MobilePdfReader = lazy(() => import('./MobilePdfReader'));
const sections = [
  {path: '/', zh: '作品', en: 'Work'},
  {path: '/awards', zh: '奖状', en: 'Awards'},
  {path: '/pdfs', zh: '作品集', en: 'Portfolio'},
  {path: '/vibecoding', zh: '实验', en: 'Experiments'},
  {path: '/journal', zh: '手账', en: 'Journal'},
  {path: '/graduation', zh: '毕业设计', en: 'Research'},
];
const emptyData: SiteData = {timeline: [], awards: [], pdfs: [], journals: [], vibecodingProjects: []};

export default function MobileSite({lang, onToggleLang, onAvatarTap, showAdminEntry}: {
  lang: Language; onToggleLang: () => void; onAvatarTap: () => void; showAdminEntry: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [data, setData] = useState<SiteData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [archive, setArchive] = useState(initialArchive);
  const [menuOpen, setMenuOpen] = useState(false);
  const [image, setImage] = useState<{src: string; title: string} | null>(null);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollPositions = useRef(new Map<string, number>());
  const contentRef = useRef<HTMLElement>(null);
  const hasNavigated = useRef(false);
  const t = useCallback((zh: string, en: string) => localized(lang, zh, en), [lang]);
  const path = sections.some((section) => section.path === location.pathname) ? location.pathname : '/';
  const isHome = path === '/';
  const params = new URLSearchParams(location.search);
  const detailId = params.get(isHome ? 'work' : 'focus');
  const currentSection = sections.find((section) => section.path === path)!;
  const work = isHome ? data.timeline.find((entry) => entry.id === detailId) : undefined;
  const award = path === '/awards' ? data.awards.find((entry) => entry.id === detailId) : undefined;
  const pdf = path === '/pdfs' ? data.pdfs.find((entry) => entry.id === detailId) : undefined;
  const journal = path === '/journal' ? data.journals.find((entry) => entry.id === detailId) : undefined;
  const project = path === '/vibecoding' ? data.vibecodingProjects.find((entry) => entry.id === detailId) : undefined;
  const selected = work || award || pdf || journal || project;
  const title = work ? localized(lang, work.title, work.titleEn) : project ? localized(lang, project.titleZh || project.title, project.titleEn) : selected?.title || '';
  const currentTitle = t(currentSection.zh, currentSection.en);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch('/api/data', {signal: controller.signal}).then(async (response) => {
      if (!response.ok) throw new Error('Could not load content');
      const raw = await response.json();
      const next = {...emptyData};
      for (const key of Object.keys(emptyData) as Array<keyof SiteData>) next[key] = (Array.isArray(raw[key]) ? raw[key] : []) as never;
      setData(next);
    }).catch((err) => {if (err.name !== 'AbortError') setError(true);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [retry]);

  // Each history entry owns its scroll position, including the item detail view.
  useLayoutEffect(() => {
    const key = location.key;
    let position = scrollPositions.current.get(key) || 0;
    const restore = requestAnimationFrame(() => {
      window.scrollTo({top: navigationType === 'POP' ? position : 0, behavior: 'instant'});
      if (hasNavigated.current && navigationType !== 'POP') contentRef.current?.focus({preventScroll: true});
      hasNavigated.current = true;
    });
    const remember = () => {position = window.scrollY;};
    window.addEventListener('scroll', remember, {passive: true});
    return () => {
      cancelAnimationFrame(restore);
      window.removeEventListener('scroll', remember);
      scrollPositions.current.set(key, position);
    };
  }, [location.key, navigationType]);

  useEffect(() => {setMenuOpen(false); setImage(null);}, [location.key]);
  useEffect(() => () => {if (noticeTimer.current) clearTimeout(noticeTimer.current);}, []);

  const showNotice = (message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(''), 2400);
  };
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({title: title || 'GemosDodo', url});
      else if (navigator.clipboard) {await navigator.clipboard.writeText(url); showNotice(t('链接已复制', 'Link copied'));}
      else showNotice(t('复制浏览器地址即可分享', 'Copy the address from your browser to share'));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') showNotice(t('请复制浏览器地址分享', 'Copy the address from your browser to share'));
    }
  };
  const openDetail = (id: string) => {
    navigate(`${path}?${isHome ? 'work' : 'focus'}=${encodeURIComponent(id)}`, {state: {mobileDetailFrom: location.key}});
  };
  const backToList = () => {
    if (location.state?.mobileDetailFrom) navigate(-1);
    else navigate(path, {replace: true});
  };
  const viewImage = (src: string, imageTitle = title) => setImage({src, title: imageTitle});
  const relatedWorks = (ids?: string[]) => {
    const entries = data.timeline.filter((entry) => ids?.includes(entry.id));
    return entries.length ? <section className="mi-related"><h2>{t('相关作品', 'Related work')}</h2>{entries.map((entry) => <Link className="mi-link-row" key={entry.id} to={`/?work=${encodeURIComponent(entry.id)}`}><span>{localized(lang, entry.title, entry.titleEn)}</span><ChevronRight size={18} /></Link>)}</section> : null;
  };
  const empty = (label: string) => <div className="mi-state"><span className="mi-empty-line" /><p>{label}</p><span>{t('留一点空白，给接下来的创作。', 'A little space for what comes next.')}</span></div>;
  const pageHead = (heading: string, count: number, unit: string, englishUnit: string) => <header className="mi-page-intro"><p className="mi-eyebrow">GemosDodo / {currentSection.en}</p><h1>{heading}</h1><p className="mi-secondary">{count} {t(unit, englishUnit)}</p></header>;

  return <div className="mi-site no-grass" lang={lang === 'zh' ? 'zh-CN' : 'en'}>
    <header className="mi-topbar">
      {detailId ? <button className="mi-back" onClick={backToList}><ChevronLeft size={22} /><span>{currentTitle}</span></button>
        : <Link to="/" className="mi-wordmark" aria-label={t('GemosDodo 首页', 'GemosDodo home')}>Gemos<span>.</span></Link>}
      <div className="mi-topbar-actions">
        {detailId && <button className="mi-icon" onClick={() => void share()} aria-label={t('分享', 'Share')}><Share2 size={19} /></button>}
        <button className="mi-icon" onClick={() => setMenuOpen(true)} aria-label={t('打开导航', 'Open navigation')} aria-haspopup="dialog" aria-expanded={menuOpen}><Menu size={21} strokeWidth={1.6} /></button>
      </div>
    </header>

    <main ref={contentRef} tabIndex={-1} className={`mi-main ${detailId ? 'mi-detail' : ''}`} key={`${path}-${detailId || 'index'}`}>
      {loading ? <div className="mi-loading" role="status" aria-label={t('正在载入', 'Loading')}><div /><div /><div /></div>
        : error ? <div className="mi-state" role="alert"><h1>{t('暂时没能加载', 'Unable to load')}</h1><p>{t('请检查网络，再试一次。', 'Check your connection and try again.')}</p><button className="mi-primary" onClick={() => setRetry((value) => value + 1)}>{t('重新载入', 'Try again')}</button></div>
          : detailId ? !selected ? <div className="mi-state"><h1>{t('这条内容不在这里了', 'This item is no longer here')}</h1><button className="mi-text-action" onClick={backToList}>{t('返回浏览', 'Back to browsing')}</button></div> : <>
            {work && <>
              <header className="mi-detail-intro"><p className="mi-eyebrow">{categoryName(work.category, lang)}{work.date ? ` · ${displayDate(work.date, lang)}` : ''}</p><h1>{title}</h1>{(work.desc || work.descEn) && <p className="mi-lead">{localized(lang, work.desc, work.descEn)}</p>}</header>
              {work.image && <button className="mi-detail-cover" onClick={() => viewImage(work.image!)} aria-label={t('放大封面', 'Enlarge cover')}><MobileImage src={work.image} alt={title} priority /></button>}
              <MobileWorkContent work={work} lang={lang} onImage={viewImage} />
              {(data.awards.some((item) => item.workEntryIds?.includes(work.id)) || data.pdfs.some((item) => item.workEntryIds?.includes(work.id))) && <section className="mi-related"><h2>{t('关于这件作品', 'More about this work')}</h2>
                {data.awards.filter((item) => item.workEntryIds?.includes(work.id)).map((item) => <Link className="mi-link-row" key={item.id} to={`/awards?focus=${encodeURIComponent(item.id)}`}><span><small>{t('奖状', 'Award')}</small>{item.title}</span><ChevronRight size={18} /></Link>)}
                {data.pdfs.filter((item) => item.workEntryIds?.includes(work.id)).map((item) => <Link className="mi-link-row" key={item.id} to={`/pdfs?focus=${encodeURIComponent(item.id)}`}><span><small>PDF</small>{item.title}</span><ChevronRight size={18} /></Link>)}
              </section>}
            </>}
            {award && <>
              <header className="mi-detail-intro"><p className="mi-eyebrow">{displayDate(award.date, lang) || t('奖状', 'Award')}</p><h1>{title}</h1>{award.organizer && <p className="mi-lead">{award.organizer}</p>}</header>
              {award.image && <button className="mi-certificate" onClick={() => viewImage(award.image!)} aria-label={t('放大证书', 'Enlarge certificate')}><MobileImage src={award.image} alt={title} priority /><span><span>{t('查看原图', 'View original')}</span><ArrowUpRight size={16} /></span></button>}
              <dl className="mi-facts">{[
                [t('作品', 'Project'), award.projectName], [t('级别', 'Level'), award.awardLevel], [t('作者', 'Author'), award.authorName], [t('指导', 'Instructor'), award.instructorName], [t('单位', 'Organization'), award.organizationName], [t('编号', 'Certificate'), award.certificateNo],
              ].filter(([, value]) => !!value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
              {relatedWorks(award.workEntryIds)}
            </>}
            {pdf && <>
              <header className="mi-detail-intro"><p className="mi-eyebrow">PDF · {fileSize(pdf.size)}</p><h1>{title}</h1>{pdf.description && <p className="mi-lead">{pdf.description}</p>}<a className="mi-text-action" href={pdf.fileUrl} target="_blank" rel="noopener noreferrer">{t('打开原文件', 'Open original')}<ArrowUpRight size={16} /></a></header>
              <Suspense fallback={<div className="mi-state" role="status"><span className="mi-spinner" />{t('正在准备阅读…', 'Preparing your document…')}</div>}><MobilePdfReader url={pdf.fileUrl} lang={lang} /></Suspense>
              {relatedWorks(pdf.workEntryIds)}
            </>}
            {journal && <>
              <header className="mi-detail-intro"><p className="mi-eyebrow">{displayDate(journal.date, lang) || t('生活片段', 'A moment in life')}</p><h1>{title}</h1>{journal.note && <p className="mi-lead">{journal.note}</p>}</header>
              {journal.layout?.elements?.length ? <MobileCanvas layout={journal.layout} lang={lang} onImage={viewImage} /> : empty(t('这一页还留着空白', 'This page is still unwritten'))}
            </>}
            {project && <>
              <header className="mi-detail-intro"><p className="mi-eyebrow">{t('浏览器实验', 'Browser experiment')}</p><h1>{title}</h1></header>
              <MobileImage src={project.coverImage} alt={title} className="mi-project-cover" priority />
              <p className="mi-prose">{localized(lang, project.descriptionZh || project.description, project.descriptionEn)}</p>
              <a className="mi-primary" href={`/vibecoding/${encodeURIComponent(project.slug)}`} target="_blank" rel="noopener noreferrer">{t('打开实验', 'Open experiment')}<ArrowUpRight size={18} /></a>
            </>}
            <button className="mi-end-back" onClick={backToList}><ChevronLeft size={18} />{t('返回', 'Back to')} {currentTitle}</button>
          </> : <>
            {isHome && <>
              <header className="mi-home-intro"><p className="mi-eyebrow">{t('多多 GemosDodo', 'GemosDodo')}</p><h1>{t('一些创作。', 'Made with curiosity.')}<br /><span>{t('一些日常。', 'Collected along the way.')}</span></h1><p className="mi-intro-note">{t('设计、影像，还有生活里的灵光一现。', 'Design, moving images, and moments in between.')}</p></header>
              <HomeCompanion lang={lang} />
              <MobileArchive works={data.timeline} lang={lang} state={archive} onChange={setArchive} onOpen={openDetail} />
              <section className="mi-explore"><h2>{t('继续看看', 'Keep exploring')}</h2>{sections.slice(1).map((section) => <Link to={section.path} key={section.path} className="mi-link-row"><span>{t(section.zh, section.en)}</span><ChevronRight size={18} /></Link>)}</section>
            </>}
            {path === '/awards' && <>
              {pageHead(t('奖状', 'Awards'), data.awards.length, '份记录', 'recognitions')}
              <div className="mi-award-list">{data.awards.map((item, i) => <button className="mi-award-card" onClick={() => openDetail(item.id)} key={item.id}>
                <div className="mi-award-mat"><MobileImage src={item.thumbnailImage || item.image} alt={item.title} priority={i === 0} /></div>
                <div className="mi-work-caption"><div><p>{displayDate(item.date, lang)}{item.awardLevel ? ` · ${item.awardLevel}` : ''}</p><h2>{item.title}</h2>{item.organizer && <p>{item.organizer}</p>}</div><ChevronRight size={18} /></div>
              </button>)}</div>
              {!data.awards.length && empty(t('新的认可，还在路上', 'More milestones to come'))}
            </>}
            {path === '/pdfs' && <>
              {pageHead(t('作品集', 'Portfolio'), data.pdfs.length, '本作品集', 'publications')}
              <div className="mi-portfolio-list">{data.pdfs.map((item, i) => <button className="mi-portfolio-card" key={item.id} onClick={() => openDetail(item.id)}>
                {item.coverImage ? <MobileImage src={item.coverImage} alt={item.title} priority={i === 0} /> : <div className="mi-book-cover"><FileText size={36} strokeWidth={1} /><span>GemosDodo</span><strong>{item.title}</strong><span>PORTFOLIO / PDF</span></div>}
                <div className="mi-work-caption"><div><p>PDF · {fileSize(item.size)}</p><h2>{item.title}</h2>{item.description && <p className="mi-card-description">{item.description}</p>}</div><ArrowUpRight size={20} /></div>
              </button>)}</div>
              {!data.pdfs.length && empty(t('下一本作品集，正在酝酿', 'The next collection is taking shape'))}
            </>}
            {path === '/vibecoding' && <>
              {pageHead(t('实验', 'Experiments'), data.vibecodingProjects.length, '个可玩的想法', 'playable ideas')}
              <div className="mi-project-list">{data.vibecodingProjects.map((item, i) => <article className="mi-project" key={item.id}>
                <button className="mi-project-art" onClick={() => openDetail(item.id)} aria-label={localized(lang, item.titleZh || item.title, item.titleEn)}><MobileImage src={item.coverImage} alt={localized(lang, item.titleZh || item.title, item.titleEn)} priority={i === 0} /></button>
                <div className="mi-project-copy"><p className="mi-eyebrow">{t('浏览器实验', 'Browser experiment')}</p><h2><button onClick={() => openDetail(item.id)}>{localized(lang, item.titleZh || item.title, item.titleEn)}</button></h2><p className="mi-card-description">{localized(lang, item.descriptionZh || item.description, item.descriptionEn)}</p>
                  <a className="mi-text-action" href={`/vibecoding/${encodeURIComponent(item.slug)}`} target="_blank" rel="noopener noreferrer">{t('打开实验', 'Open experiment')}<ArrowUpRight size={16} /></a>
                </div>
              </article>)}</div>
              {!data.vibecodingProjects.length && empty(t('好玩的想法，还在发生', 'New ideas are on the way'))}
            </>}
            {path === '/journal' && <>
              {pageHead(t('手账', 'Journal'), data.journals.length, '页生活片段', 'moments collected')}
              <div className="mi-journal-list">{data.journals.map((item, i) => <button className="mi-journal-card" key={item.id} onClick={() => openDetail(item.id)}>
                {(item.coverImage || item.layout?.elements.some((element) => element.type === 'image')) && <MobileImage src={item.coverImage || (item.layout.elements.find((element) => element.type === 'image') as {url: string})?.url} alt={item.title} priority={i === 0} />}
                <div className="mi-journal-copy"><p className="mi-eyebrow">{displayDate(item.date, lang)}</p><h2>{item.title}</h2>{item.note && <p className="mi-card-description">{item.note}</p>}<span className="mi-text-action">{t('翻开这一页', 'Read this entry')}<ChevronRight size={16} /></span></div>
              </button>)}</div>
              {!data.journals.length && empty(t('日常，值得慢慢记下', 'Everyday moments, worth keeping'))}
            </>}
          </>}
    </main>

    {!detailId && <footer className="mi-footer"><Link to="/" className="mi-wordmark">Gemos<span>.</span></Link><p>{t('创作与生活的私人存档。', 'A personal archive of work and life.')}</p><div><span>© {new Date().getFullYear()} GemosDodo</span><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">浙ICP备2026017753号</a></div></footer>}

    {menuOpen && <MobileDialog label={t('网站导航', 'Site navigation')} onClose={() => setMenuOpen(false)} className="mi-menu">
      <div className="mi-menu-top"><span className="mi-wordmark">Gemos<span>.</span></span><button className="mi-icon" onClick={() => setMenuOpen(false)} aria-label={t('关闭导航', 'Close navigation')}><X size={22} strokeWidth={1.6} /></button></div>
      <nav aria-label={t('栏目', 'Sections')}>{sections.map((section, i) => <Link key={section.path} to={section.path} aria-current={path === section.path ? 'page' : undefined} onClick={() => setMenuOpen(false)}><span>{t(section.zh, section.en)}</span><span>{String(i + 1).padStart(2, '0')}</span></Link>)}</nav>
      <div className="mi-menu-bottom"><div className="mi-menu-profile"><button onClick={onAvatarTap} aria-label={t('多多头像', 'Dodo avatar')}><img src="/avatar.png" alt="" /></button><span>{t('多多 GemosDodo', 'GemosDodo')}<small>{t('一直在创作，也一直在感受。', 'Always making. Always noticing.')}</small></span></div>
        <div className="mi-menu-links"><Link to="/pasture">{t('牛牛牧场', 'Pasture')}<ArrowUpRight size={14} /></Link><a href="https://github.com/duoduoaiduoduo" target="_blank" rel="noopener noreferrer">GitHub<ArrowUpRight size={14} /></a>{showAdminEntry && <Link to="/admin">{t('管理', 'Admin')}</Link>}</div>
        <button className="mi-language" onClick={onToggleLang}><span>中文 <span>/</span> English</span><span>{lang === 'zh' ? 'EN' : '中'}<ChevronRight size={16} /></span></button>
      </div>
    </MobileDialog>}
    {image && <ImageViewer {...image} lang={lang} onClose={() => setImage(null)} />}
    <div className={`mi-notice ${notice ? 'is-visible' : ''}`} role="status" aria-live="polite">{notice && <><Check size={17} />{notice}</>}</div>
  </div>;
}
