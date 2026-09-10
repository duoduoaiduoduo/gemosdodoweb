import {useRef, useState} from 'react';
import {ArrowUpRight, ChevronLeft, ChevronRight, LayoutList, RectangleHorizontal, Search, X} from 'lucide-react';
import MobileReel from './MobileReel';
import {MobileImage} from './MobileMedia';
import {categoryName, displayDate, localized, type Category, type Language, type Work} from './types';
import {archiveResults, initialArchive, workYear, type ArchiveState} from './archive';

export default function MobileArchive({works, lang, state, onChange, onOpen}: {
  works: Work[]; lang: Language; state: ArchiveState; onChange: (state: ArchiveState) => void; onOpen: (id: string) => void;
}) {
  const t = (zh: string, en: string) => localized(lang, zh, en);
  const [findOpen, setFindOpen] = useState(false);
  const toolbar = useRef<HTMLDivElement>(null);
  const result = archiveResults(works, state);
  const years = [...new Set(works.map(workYear))].sort((a, b) => b.localeCompare(a));
  const datedYears = years.filter((year) => year !== 'other');
  const filtered = state.category !== 'all' || state.year !== 'all' || !!state.query;
  const change = (next: Partial<ArchiveState>) => {
    // A new filter should reveal its first result even when changed deep in the list.
    if (window.scrollY > (toolbar.current?.parentElement?.offsetTop || 0)) toolbar.current?.scrollIntoView({block: 'start', behavior: 'instant'});
    onChange({...state, ...next, page: 1, cursor: 0});
  };
  const turnPage = (page: number) => {
    onChange({...state, page});
    toolbar.current?.scrollIntoView({block: 'start', behavior: 'instant'});
    toolbar.current?.focus({preventScroll: true});
  };

  return <section className="mi-archive" aria-label={t('创作档案', 'The archive')}>
    <div className="mi-section-heading"><h2>{t('创作档案', 'The archive')}</h2><span>{works.length} {t('件作品', 'works')}</span></div>
    <div className={`mi-archive-tools ${state.view === 'gallery' ? 'mi-discovery-tools' : ''}`} ref={toolbar} tabIndex={-1}>
      <div className="mi-filters" role="group" aria-label={t('筛选作品', 'Filter work')}>{(['all', 'project', 'video', 'edu'] as Category[]).map((value) => <button key={value} aria-pressed={state.category === value} onClick={() => change({category: value})}>{categoryName(value, lang)}</button>)}</div>
      <div className="mi-discovery-actions"><div className="mi-view-switch" role="group" aria-label={t('浏览方式', 'View style')}><button aria-pressed={state.view === 'gallery'} onClick={() => change({view: 'gallery'})}><RectangleHorizontal size={15} />{t('逛逛', 'Explore')}</button><button aria-pressed={state.view === 'index'} onClick={() => change({view: 'index'})}><LayoutList size={15} />{t('目录', 'Index')}</button></div><button className="mi-find-toggle" aria-expanded={findOpen} onClick={() => setFindOpen(!findOpen)}><Search size={16} />{t('找作品', 'Find work')}{filtered && <span className="mi-filter-dot" />}</button></div>
      {findOpen && <div className="mi-archive-controls">
        <label className="mi-archive-search"><Search size={17} aria-hidden="true" /><input type="search" value={state.query} onChange={(event) => change({query: event.target.value})} placeholder={t('搜索作品', 'Search work')} aria-label={t('搜索作品标题或简介', 'Search titles or descriptions')} />{state.query && <button aria-label={t('清空搜索', 'Clear search')} onClick={() => change({query: ''})}><X size={16} /></button>}</label>
        <select className="mi-year-select" aria-label={t('按年份筛选', 'Filter by year')} value={state.year} onChange={(event) => change({year: event.target.value})}>
          <option value="all">{t('全部年份', 'All years')}</option>{datedYears.map((year) => <option key={year} value={year}>{year}</option>)}{years.includes('other') && <option value="other">{t('其他日期', 'Other dates')}</option>}
        </select>
      </div>}
      {state.view === 'index' && <div className="mi-archive-meta">
        <div className="mi-archive-position"><span role="status">{result.total ? `${result.start + 1}–${result.start + result.items.length} / ${result.total}` : t('没有匹配作品', 'No matches')}</span>
          {result.pages > 1 && <select aria-label={t('快速跳页', 'Quick page jump')} value={result.page} onChange={(event) => turnPage(Number(event.target.value))}>{Array.from({length: result.pages}, (_, i) => <option key={i} value={i + 1}>{t(`第 ${i + 1} 页`, `Page ${i + 1}`)}</option>)}</select>}
        </div>
      </div>}
    </div>
    {state.view === 'gallery' ? <MobileReel works={result.matches} cursor={state.cursor} onSelect={(cursor) => onChange({...state, cursor})} onOpen={onOpen} lang={lang} /> :
    <div className={`mi-work-list mi-archive-results ${state.view === 'index' ? 'mi-work-index' : ''}`} key={`${state.category}-${state.year}-${state.query}-${state.view}-${result.page}`}>
      {result.items.map((item, i) => <button className="mi-work-card" key={item.id} onClick={() => onOpen(item.id)}>
        <MobileImage src={item.thumbnailImage || item.image} alt="" priority={i === 0} />
        <div className="mi-work-caption"><div><p>{categoryName(item.category, lang)}{item.date ? ` / ${displayDate(item.date, lang)}` : ''}</p><h3>{localized(lang, item.title, item.titleEn)}</h3></div><span className="mi-card-arrow"><ArrowUpRight size={20} strokeWidth={1.6} /></span></div>
      </button>)}
    </div>}
    {!result.total && <div className="mi-state"><p>{t('换个关键词，或放宽筛选', 'Try another word or a broader filter')}</p>{filtered && <button className="mi-text-action" onClick={() => onChange({...initialArchive, view: state.view})}>{t('查看全部作品', 'Show all work')}</button>}</div>}
    {state.view === 'index' && result.pages > 1 && <nav className="mi-archive-pages" aria-label={t('作品翻页', 'Archive pages')}>
      <button disabled={result.page === 1} onClick={() => turnPage(result.page - 1)} aria-label={t('上一页', 'Previous page')}><ChevronLeft size={19} /></button>
      <label>{t('第', 'Page')}<select aria-label={t('跳转页码', 'Go to page')} value={result.page} onChange={(event) => turnPage(Number(event.target.value))}>{Array.from({length: result.pages}, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select><span>/ {result.pages}</span></label>
      <button disabled={result.page === result.pages} onClick={() => turnPage(result.page + 1)} aria-label={t('下一页', 'Next page')}><ChevronRight size={19} /></button>
    </nav>}
  </section>;
}
