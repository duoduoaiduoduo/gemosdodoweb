import type {JournalRecord, VibecodingProject} from '../adminApi';

export type Language = 'zh' | 'en';
export type Category = 'all' | 'project' | 'video' | 'edu';
export type CanvasLayout = JournalRecord['layout'];
export type Work = {
  id: string;
  title: string;
  titleEn?: string;
  desc?: string;
  descEn?: string;
  date?: string;
  category: Exclude<Category, 'all'>;
  image?: string;
  thumbnailImage?: string;
  coverAspect?: string;
  contentMode?: 'flow' | 'whiteboard';
  layout?: CanvasLayout;
  blocks?: Array<{type: string; content?: string; contentEn?: string; url?: string; urls?: string[]; caption?: string; captionEn?: string}>;
  videoUrl?: string;
  videoSources?: Array<{url: string; label?: string; height?: number}>;
};
export type Award = {
  id: string;
  title: string;
  date?: string;
  image?: string;
  thumbnailImage?: string;
  organizer?: string;
  awardLevel?: string;
  projectName?: string;
  certificateNo?: string;
  authorName?: string;
  instructorName?: string;
  organizationName?: string;
  workEntryIds?: string[];
};
export type Portfolio = {
  id: string;
  title: string;
  description?: string;
  date?: string;
  fileUrl: string;
  coverImage?: string;
  size?: number;
  pageCount?: number;
  workEntryIds?: string[];
};
export type SiteData = {
  timeline: Work[];
  awards: Award[];
  pdfs: Portfolio[];
  journals: JournalRecord[];
  vibecodingProjects: VibecodingProject[];
};

export const localized = (lang: Language, zh?: string, en?: string) => (lang === 'en' ? en || zh : zh || en) || '';
export const categoryName = (category: Category, lang: Language) => ({
  all: ['全部', 'All'], project: ['作品', 'Work'], video: ['影像', 'Film'], edu: ['经历', 'Life'],
}[category || 'project'][lang === 'zh' ? 0 : 1]);

export function displayDate(value: string | undefined, lang: Language) {
  if (!value) return '';
  if (/^now$/i.test(value)) return lang === 'zh' ? '最近' : 'Recent';
  const match = value.match(/^(\d{4})[-./](\d{1,2})(?:[-./](\d{1,2}))?/);
  return match ? `${match[1]}.${match[2].padStart(2, '0')}${match[3] ? `.${match[3].padStart(2, '0')}` : ''}` : value;
}

export function fileSize(bytes = 0) {
  if (!bytes) return 'PDF';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
