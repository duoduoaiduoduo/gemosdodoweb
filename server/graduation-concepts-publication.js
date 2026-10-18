import {graduationTitleResetPublication} from './research-title-reset-publications.js';

// Define the three concepts from the accepted background, without fixing a work's form.
const sections=structuredClone(graduationTitleResetPublication.sections);
const paragraphs=sections[0].paragraphs;
const start=paragraphs.indexOf('1.2 相关概念界定');
const end=paragraphs.indexOf('1.3 国内外创作实践的现状、趋势');
if(start<0||end<=start)throw new Error('Cannot locate the proposal concept subsection.');
paragraphs.splice(start+1,end-start-1,
  '（1）新污染物',
  '新污染物是指新近发现或受到关注、对生态环境或人体健康存在较大风险，而尚未纳入环境管理或现有管理措施不足以有效防控其风险的有毒有害化学物质等。[3]“新”体现了人们对相关风险的认识和管理关注的变化，不一定是物质刚刚出现。目前广泛关注的主要类别包括持久性有机污染物、内分泌干扰物、抗生素和微塑料等，各类物质的来源、环境行为及健康影响存在差异，需结合具体对象加以理解。[15]',
  '（2）数字科普',
  '科普面向公众开展科学知识、科学方法、科学思想与科学精神的普及。[17]本研究所称数字科普，是指以数字媒介为载体，对科学内容进行组织、表达与传播，支持公众获取、理解和交流科学信息的活动。其表达可综合使用文字、图像、音视频等形式，也可通过交互和网络传播提供查询、探索与交流的机会。[18]数字科普的讨论包括科学内容的准确转译、表达方式的可理解性，以及不同受众接触和参与科普的便利性。',
  '（3）人工智能',
  '人工智能（Artificial Intelligence，AI）涉及使计算系统能够围绕特定目标，根据输入信息进行推断，形成预测、内容、建议或决策等输出的技术与方法。[20]生成式人工智能是其中能够根据输入生成文本、图像等内容的一类技术。[21]本研究将人工智能作为数字科普的辅助技术条件，关注其在资料组织、通俗表达及根据受众差异调整内容方面的应用可能。人工智能输出仍需依据可靠科学资料进行核验，其具体作用应结合科普目标与受众需求加以评价。',
);

const references=[
  ['[20] OECD. Explanatory memorandum on the updated OECD definition of an AI system[R/OL]. Paris: OECD Publishing, 2024[2026-10-18]. DOI: 10.1787/623da898-en.','https://www.oecd.org/en/publications/explanatory-memorandum-on-the-updated-oecd-definition-of-an-ai-system_623da898-en.html'],
  ['[21] MIAO F, HOLMES W. Guidance for generative AI in education and research[R/OL]. Paris: UNESCO, 2023[2026-10-18].','https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research'],
];
const bibliography=sections.find(section=>section.sourceList&&/参考文献/.test(section.title));
if(!bibliography)throw new Error('Cannot locate the proposal bibliography.');
bibliography.paragraphs.push(...references.map(([text])=>text));
bibliography.links.push(...references);

export const graduationConceptsPublication={
  ...graduationTitleResetPublication,
  baseRevision:graduationTitleResetPublication.revision,
  revision:'proposal-2026-10-18-concepts-v1',
  label:'开题审阅稿 · 1.2概念界定',
  createdAt:undefined,
  sections,
};
