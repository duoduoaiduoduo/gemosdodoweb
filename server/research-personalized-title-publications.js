import {graduationBibliographyPublication} from './graduation-bibliography-publication.js';
import {thesisTitleResetPublication} from './research-title-reset-publications.js';

// Append the accepted provisional title without changing either document's
// body, references, attachments, or historical editions. Exact base revisions
// keep concurrent author/advisor edits from being overwritten.
export const acceptedResearchTitle = '基于生成式 AI 的新污染物个性化科普设计研究';

export const graduationPersonalizedTitlePublication = {
  ...graduationBibliographyPublication,
  baseRevision: graduationBibliographyPublication.revision,
  revision: 'proposal-2026-10-19-personalized-title-v1',
  label: '开题审阅稿 · 暂定题目更新',
  createdAt: undefined,
  title: acceptedResearchTitle,
};

export const thesisPersonalizedTitlePublication = {
  ...thesisTitleResetPublication,
  baseRevision: thesisTitleResetPublication.revision,
  revision: 'thesis-2026-10-19-personalized-title-v1',
  label: '硕士论文 · 暂定题目更新',
  createdAt: undefined,
  title: acceptedResearchTitle,
};
