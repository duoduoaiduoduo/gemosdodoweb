import {graduationStoryboardPublication} from './graduation-storyboard-publication.js';

// Publish the approved full research schedule. Only the existing section-six
// table rows change; prior editions and their page-bound annotations survive.
const sections = structuredClone(graduationStoryboardPublication.sections);
const schedule = sections.find(section => section.title === '六、毕业创作进度及具体时间安排');
if (schedule?.tables?.length !== 1) throw new Error('Cannot locate proposal schedule table.');
schedule.tables[0].rows = [
  ['起止时间', '阶段工作内容及预计完成的指标'],
  ['2026.07—2026.10', '与导师讨论研究方向，梳理文献与案例，开展前期创作探索'],
  ['2026.10—2026.11', '完善研究内容与创作构想，完成开题报告及方案草图'],
  ['2026.11.13', '毕业设计开题，根据评审意见调整研究计划'],
  ['2026.11—2027.01', '开展用户研究，明确科普需求，调整设计方案'],
  ['2027.01—2027.03', '梳理科普内容、设计框架与目标，进行方案设计'],
  ['2027.04—2027.07', '开展设计创作与技术实验，制作原型及科普内容样例'],
  ['2027.08—2027.10', '完善毕业设计原型，开展用户试用，依据反馈修改方案'],
  ['2027.11—2028.02', '整理研究与创作成果，撰写并修改毕业论文'],
  ['2028.03—2028.05', '完善毕业作品与论文，准备毕业答辩与展览'],
];

export const graduationSchedulePublication = {
  ...graduationStoryboardPublication,
  baseRevision: graduationStoryboardPublication.revision,
  revision: 'proposal-2026-10-19-schedule-v1',
  label: '开题审阅稿 · 毕业进度更新',
  createdAt: undefined,
  sections,
};
