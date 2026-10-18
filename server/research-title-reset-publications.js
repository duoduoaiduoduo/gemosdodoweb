import {graduationBackgroundRefinementPublication} from './graduation-background-refinement-publication.js';
import {thesisTitlePublication} from './thesis-title-publication.js';

// Reproduce the accepted online v36 text, including its small urgency addition.
// This release changes only the provisional title; prior editions stay intact.
const sections=structuredClone(graduationBackgroundRefinementPublication.sections);
for(const section of sections)section.paragraphs=section.paragraphs.filter(p=>p.trim());
const policy=sections[0].paragraphs.findIndex(p=>p.startsWith('国家政策已对新污染物科普'));
if(policy<0)throw new Error('Cannot locate the accepted policy paragraph.');
const anchor='将公众认知与社会参与纳入治理工作。[1]';
sections[0].paragraphs[policy]=sections[0].paragraphs[policy].replace(anchor,
  anchor+'考虑到部分新污染物可在环境中长期蓄积，且短期危害不易察觉，及时开展科普，帮助公众认识潜在影响与合理应对方式，具有现实迫切性。[15]');

const title='面向新污染物科普的设计研究';
export const graduationTitleResetPublication={
  ...graduationBackgroundRefinementPublication,
  baseRevision:'f316a761-9290-44f2-84fc-a680756dc98f',
  revision:'proposal-2026-10-18-title-scope-v1',
  label:'开题审阅稿 · 题目调整',
  createdAt:'2026-10-18T13:40:15.075Z',
  title,
  sections,
};

export const thesisTitleResetPublication={
  ...thesisTitlePublication,
  baseRevision:thesisTitlePublication.revision,
  revision:'thesis-2026-10-18-title-scope-v1',
  label:'硕士论文 · 题目调整',
  createdAt:'2026-10-18T13:40:15.075Z',
  title,
};
