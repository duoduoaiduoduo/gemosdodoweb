import {graduationPersonalizedTitlePublication} from './research-personalized-title-publications.js';
import {orderProposalBibliography} from './graduation-bibliography-publication.js';

// Publish the user's approved six-panel hand-drawn storyboard and replace only
// its obsolete section 3.2. Historical editions and their annotations stay intact.
const sections = structuredClone(graduationPersonalizedTitlePublication.sections);
const concept = sections.find(section => section.title === '三、创作初步构想、草图');
const sketchIndex = concept?.paragraphs.indexOf('3.2 方案草图') ?? -1;
if (sketchIndex < 0) throw new Error('Cannot locate proposal section 3.2.');

concept.paragraphs = [
  ...concept.paragraphs.slice(0, sketchIndex + 1),
  '方案草图以六格分镜呈现从日常拍照进入科普的使用过程，包括拍摄生活照片、关联科普主题、观看个性化科普短片、获得视觉作品、分享与浏览图鉴。短片部分重点示意生活情境、知识解释与合理行动的叙事衔接；三维场景与艺术化卡片作为观看后的纪念作品，供用户保存和分享。图中洗衣情境仅作关联示例，主题选择须有可靠资料支持。未形成可靠关联时，仍可生成视觉作品，但不纳入对应图鉴。',
];
const caption = '图1 从日常拍照进入个性化科普的使用流程（方案草图）';
concept.images = [{
  src: '/graduation/reports/2026-10-19/concept-storyboard-v1/01-concept-storyboard.png',
  alt: '六格单色线描分镜：拍摄、关联、看科普、获得作品、分享、图鉴',
  caption,
  displayHeight: 354,
}];

// The old Skill citation appeared only in the superseded 3.2 paragraph. Remove
// its now-uncited entry while retaining all remaining first-citation numbers.
export const storyboardBibliographyAudit = orderProposalBibliography(sections);
export const graduationStoryboardPublication = {
  ...graduationPersonalizedTitlePublication,
  baseRevision: graduationPersonalizedTitlePublication.revision,
  revision: 'proposal-2026-10-19-storyboard-v1',
  label: '开题审阅稿 · 六格草图更新',
  createdAt: undefined,
  sections: storyboardBibliographyAudit.sections,
};
