import {graduationPublication} from './graduation-publication.js';

// Append the accepted 1.1 revision without changing the published base edition.
// Keep the remaining sections, attachments and existing citation numbers intact.
const sections=structuredClone(graduationPublication.sections);
const background=sections[0];
const start=background.paragraphs.indexOf('1.1 创作的研究背景、依据');
const end=background.paragraphs.indexOf('1.2 相关概念界定');
if(start<0||end<=start)throw new Error('Cannot locate the proposal background subsection.');
background.paragraphs.splice(start+1,end-start-1,
  '新污染物是指对生态环境或人体健康存在风险，但尚未纳入环境管理或现有管理措施不足的污染物，主要涉及持久性有机污染物、内分泌干扰物、抗生素和微塑料等。相关物质的生产和使用与人类生活密切联系，进入环境后，部分物质难以降解，可能在生物体内积累，并产生生殖发育、神经或其他健康影响。生态环境部指出，新污染物的环境与健康风险具有隐蔽性，部分危害短期内不易察觉，其来源广泛、涉及行业众多，治理需要贯穿生产、使用和排放等多个环节。这些特点使新污染物成为需要持续关注的环境与健康议题，也提出了向公众解释相关知识的现实需要。[15]',
  '国家政策已对新污染物科普及科普形式创新提出明确要求。2022年发布的《国务院办公厅关于印发新污染物治理行动方案的通知》（国办发〔2022〕15号）要求开展新污染物治理科普宣传教育，引导公众科学认识环境风险、树立绿色消费理念，并发挥社会监督作用，将公众认知与社会参与纳入治理工作。[1]同年，中共中央办公厅、国务院办公厅印发的《关于新时代进一步加强科学技术普及工作的意见》提出，以公众需求为导向加强科普创作，鼓励科技工作者与文学、艺术、教育、传媒工作者合作，通过多种形式开展科普，并运用新技术丰富作品形态。上述政策分别明确了新污染物科普的公共任务和科普表达创新的发展方向，为本选题提供了政策依据。[16]',
  '科普的目标在于帮助公众获得必要的科学知识，理解科学方法，并能够运用相关知识分析和判断实际问题。2024年修订的《中华人民共和国科学技术普及法》明确，科普应采取公众易于接触、理解、接受和参与的方式，同时保障所传播信息的科学性。[17]对于新污染物科普而言，需要让公众理解相关物质的来源、与日常生活的联系、可能产生的影响及合理应对方式，并认识到具体风险与接触途径、接触程度等条件有关。在此基础上，帮助公众形成有依据的环境风险判断，了解个人能够参与的行动，以及企业和公共治理承担的责任，是开展相关科普的重要目标。',
  '人工智能的发展为实现上述目标提供了新的研究条件。《全民科学素质行动规划纲要（2021—2035年）》明确提出推进科普与人工智能等技术融合，强调需求感知、用户分层和情景应用，为根据受众差异组织科普内容提供了政策支持。[18]生成式人工智能可以辅助专业资料的通俗转译，围绕不同知识背景和具体疑问调整解释方式，为科普内容的制作与适配提供支持。Markowitz的科学文本阅读实验发现，经过AI简化的科学摘要能够改善读者的部分理解表现，为人工智能辅助科学传播提供了实证线索。[19]由此，面向新污染物科普，在可靠科学资料与内容审核的基础上，探索更贴近公众生活经验、适应不同理解需求的知识表达方式，并检验其对理解和参与的实际作用，具有进一步研究的价值。',
);

const references=[
  ['[15] 生态环境部. 生态环境部召开3月例行新闻发布会[EB/OL]. (2022-03-30)[2026-10-18].','https://www.mee.gov.cn/ywdt/xwfb/202203/t20220330_973154.shtml'],
  ['[16] 中共中央办公厅, 国务院办公厅. 关于新时代进一步加强科学技术普及工作的意见[EB/OL]. (2022-09-04)[2026-10-18].','https://most.gov.cn/xxgk/xinxifenlei/fdzdgknr/fgzc/gfxwj/gfxwj2022/202209/t20220905_182273.html'],
  ['[17] 全国人民代表大会常务委员会. 中华人民共和国科学技术普及法：2024年修订[EB/OL]. (2024-12-25)[2026-10-18].','https://www.most.gov.cn/xxgk/xinxifenlei/fdzdgknr/fgzc/flfg/202412/t20241226_192778.html'],
  ['[18] 国务院. 关于印发全民科学素质行动规划纲要（2021—2035年）的通知：国发〔2021〕9号[EB/OL]. (2021-06-25)[2026-10-18].','https://www.mee.gov.cn/zcwj/gwywj/202106/t20210625_841836.shtml'],
  ['[19] MARKOWITZ D M. From complexity to clarity: How AI enhances perceptions of scientists and the public’s understanding of science[J/OL]. PNAS Nexus, 2024, 3(9): pgae387. DOI: 10.1093/pnasnexus/pgae387.','https://doi.org/10.1093/pnasnexus/pgae387'],
];
const bibliography=sections.find(section=>section.sourceList&&/参考文献/.test(section.title));
if(!bibliography)throw new Error('Cannot locate the proposal bibliography.');
bibliography.paragraphs.push(...references.map(([text])=>text));
bibliography.links.push(...references);

export const graduationBackgroundPublication={
  ...graduationPublication,
  baseRevision:graduationPublication.revision,
  revision:'proposal-2026-10-18-background-v1',
  label:'开题审阅稿 · 1.1研究背景修订',
  sections,
};
