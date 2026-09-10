import type {Category, Work} from './types';

export type ArchiveState = {category: Category; year: string; query: string; view: 'gallery' | 'index'; page: number; cursor: number};
export const initialArchive: ArchiveState = {category: 'all', year: 'all', query: '', view: 'gallery', page: 1, cursor: 0};
export const workYear = (work: Work) => work.date?.match(/^(\d{4})(?:\D|$)/)?.[1] || 'other';

export function archiveResults(works: Work[], state: ArchiveState) {
  const terms = state.query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = works.filter((work) => {
    if (state.category !== 'all' && work.category !== state.category) return false;
    if (state.year !== 'all' && workYear(work) !== state.year) return false;
    const text = [work.title, work.titleEn, work.desc, work.descEn, work.date].join(' ').normalize('NFKC').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
  const pageSize = state.view === 'gallery' ? 12 : 24;
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(Math.max(1, state.page), pages);
  const start = (page - 1) * pageSize;
  return {matches, items: matches.slice(start, start + pageSize), total: matches.length, pages, page, start};
}
