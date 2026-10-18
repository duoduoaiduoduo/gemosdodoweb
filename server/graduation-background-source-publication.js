import {graduationBackgroundRefinementPublication} from './graduation-background-refinement-publication.js';

// Name the source in the accepted paragraph; keep earlier editions immutable.
const sections=structuredClone(graduationBackgroundRefinementPublication.sections);
const paragraphs=sections[0].paragraphs;
const index=paragraphs.indexOf('1.1 创作的研究背景、依据')+1;
if(index<1||!paragraphs[index]?.includes('生态环境部指出，')||!paragraphs[index].endsWith('现实需要。[15]'))throw new Error('Cannot locate the background source attribution.');
paragraphs[index]=paragraphs[index]
  .replace('生态环境部指出，','据生态环境部2022年3月30日发布的《生态环境部召开3月例行新闻发布会》实录，')
  .replace('多个环节。这些特点','多个环节。[15]这些特点')
  .replace('现实需要。[15]','现实需要。');

export const graduationBackgroundSourcePublication={
  ...graduationBackgroundRefinementPublication,
  baseRevision:graduationBackgroundRefinementPublication.revision,
  revision:'proposal-2026-10-18-background-v3',
  label:'开题审阅稿 · 1.1出处补充',
  sections,
};

// Keep the citation beside its named source, away from a fixed-page text split.
const citedSections=structuredClone(graduationBackgroundSourcePublication.sections);
citedSections[0].paragraphs[index]=citedSections[0].paragraphs[index]
  .replace('发布会》实录，','发布会》实录[15]，')
  .replace('多个环节。[15]这些特点','多个环节。这些特点');
export const graduationBackgroundSourceCitationPublication={
  ...graduationBackgroundSourcePublication,
  baseRevision:graduationBackgroundSourcePublication.revision,
  revision:'proposal-2026-10-18-background-v4',
  label:'开题审阅稿 · 1.1出处核订',
  sections:citedSections,
};
