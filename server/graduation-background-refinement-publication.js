import {graduationBackgroundPublication} from './graduation-background-publication.js';

// A narrow follow-up edition: retain source records and all unaffected content.
const sections=structuredClone(graduationBackgroundPublication.sections);
const paragraphs=sections[0].paragraphs;
const start=paragraphs.indexOf('1.1 创作的研究背景、依据');
const removedSentence='2024年修订的《中华人民共和国科学技术普及法》明确，科普应采取公众易于接触、理解、接受和参与的方式，同时保障所传播信息的科学性。[17]';
if(start<0||!paragraphs[start+3]?.includes(removedSentence)||!paragraphs[start+4]?.startsWith('人工智能的发展'))throw new Error('Cannot locate the accepted background paragraphs.');
paragraphs[start+3]=paragraphs[start+3].replace(removedSentence,'');
paragraphs[start+4]='人工智能的发展，为以数字媒介为载体的科普提供了新的研究条件。《全民科学素质行动规划纲要（2021—2035年）》明确提出推进科普与人工智能等技术融合，强调需求感知、用户分层和情景应用，为根据受众差异组织科普内容提供了政策支持。[18]相较于预先制作、统一呈现的数字科普内容，生成式人工智能可辅助专业资料的通俗转译，并围绕受众的知识背景、兴趣与具体疑问调整解释内容和表达形式，为科普的个性化适配与多样化呈现拓展空间。由此，面向新污染物科普，在可靠科学资料与内容审核的基础上，探索兼顾内容准确性、个性化解释与多样化表达的数字科普方式，并检验其对公众理解和参与的实际作用，具有进一步研究的价值。';

export const graduationBackgroundRefinementPublication={
  ...graduationBackgroundPublication,
  baseRevision:graduationBackgroundPublication.revision,
  revision:'proposal-2026-10-18-background-v2',
  label:'开题审阅稿 · 1.1数字媒介表述优化',
  sections,
};
