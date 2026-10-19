import {graduationSchedulePublication} from './graduation-schedule-publication.js';

// Keep the editable bibliography and all URLs, displaying each entry once with
// its own sources. Only this new edition opts in; historical page geometry stays.
const sections = structuredClone(graduationSchedulePublication.sections);
const bibliography = sections.find(section => section.sourceList && /参考文献/.test(section.title));
if (!bibliography) throw new Error('Cannot locate proposal bibliography.');
bibliography.inlineReferenceLinks = true;

export const graduationReferenceLayoutPublication = {
  ...graduationSchedulePublication,
  baseRevision: graduationSchedulePublication.revision,
  revision: 'proposal-2026-10-19-references-layout-v1',
  label: '开题审阅稿 · 参考文献合并排版',
  createdAt: undefined,
  sections,
};
