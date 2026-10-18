import {graduationConceptsPublication} from './graduation-concepts-publication.js';

// Preserve the two accepted English-term edits from the latest online edition.
// Only subsection 1.3 and its source records change in this publication.
const sections=structuredClone(graduationConceptsPublication.sections);
const paragraphs=sections[0].paragraphs;
const background=paragraphs.indexOf('1.1 创作的研究背景、依据');
const concepts=paragraphs.indexOf('1.2 相关概念界定');
if(background<0||concepts<0)throw new Error('Cannot locate the accepted background and concepts.');
paragraphs[background+1]=paragraphs[background+1].replace(/^新污染物是指/,'新污染物（Emerging pollutants）是指');
paragraphs[concepts+2]=paragraphs[concepts+2].replace(/^新污染物是指/,'新污染物（Emerging pollutants）是指');

const start=paragraphs.indexOf('1.3 国内外创作实践的现状、趋势');
const end=paragraphs.indexOf('1.4 创作选题的理论意义与实践价值');
if(start<0||end<=start)throw new Error('Cannot locate the proposal practice subsection.');
paragraphs.splice(start+1,end-start-1,
  '1.3.1 国外现状',
  '（1）新污染物科普的创作实践',
  '国外围绕新污染物相关对象的科普，已出现以具体事件和生活问题组织知识的创作。GRID-Arendal于2023年发布的PFAS StoryMap，以比利时一处3M工厂污染问题为线索，结合文字、图像和地图说明物质用途、环境路径与污染处置，并区分有记录和推定的使用场所。[6]Silent Spring Institute的Detox Me则将化学暴露研究转化为生活建议，提供查询、记录、提醒及分享功能，涉及PFAS等主题。[8]这些作品分别从污染事件和公众生活问题组织知识，为专业概念与实际情境建立联系，体现了新污染物科普在内容组织上的不同路径。',
  '（2）数字科普的表达形式',
  '国外数字科普实践通过数据可视化和交互模拟安排科学知识的呈现。NASA的Eyes on the Earth将卫星观测资料组织为可浏览的数据，支持选择二氧化碳、海平面、土壤湿度等指标和时间范围，观察环境变化。[22]科罗拉多大学博尔德分校的PhET则通过参数调节、动画和图表反馈呈现科学现象，其设计研究基于200余次学生个别访谈，讨论界面、探索行为与学习的关系。[23]两类实践分别借助数据浏览和模拟操作组织观察与比较，使数字媒介承担对变化和关系的解释。PhET的研究主要来自科学教育情境，可为公众科普的表达设计提供参照。',
  '（3）人工智能在科普中的应用',
  '国外已有将人工智能用于对话讲解和科学文本转译的探索。2024年10月，剑桥大学动物博物馆与Nature Perspectives为13件动物标本设置AI对话角色，观众可用文字或语音提问，系统按年龄调整表达并提供多语交流。[24]Markowitz（2024）将GPT-4简化的科学陈述与原作者版本比较，发现阅读简化版者在选择题和自由复述构成的理解综合指标上表现较好，差异主要体现在复述准确性。[19]前者探索围绕观众问题组织讲解，后者为文本通俗转译提供实验线索，呈现了人工智能参与科普的不同方式。相关实验针对特定材料与任务，其结论仍需结合使用情境理解。',
  '1.3.2 国内现状',
  '（1）新污染物科普的创作实践',
  '国内生态环境部门和科研机构已围绕新污染物开展科普创作，内容涉及基础知识和具体风险问题。福建省生态环境厅于2024年发布《揭开新污染物的真面目》，将新污染物纳入小山小水说“环保”系列动画，通过角色与动画表达提供公众接触知识的入口。[9]中国科学院生态环境研究中心的《新污染物—避免替代“陷阱”》，则以PFAS及其替代物的暴露水平、生态风险和限制政策相关调查为依据，将物质替代问题转化为科普选题。[25]两类作品分别体现了基本概念普及和具体问题解释的路径，说明相关创作已在不同知识目标与受众接近方式上展开探索。',
  '（2）数字科普的表达形式',
  '国内数字科普创作已采用科学影像、主题网站和虚拟漫游等表达方式。《美丽化学》于2014年上线，运用高清摄影呈现化学反应的颜色和细节，并通过电脑动画与互动内容展示微观结构。[26]郑斌等（2018）利用网站访问资料研究传播路径与受众行为，为讨论科学视觉表达与网络传播的关系提供了案例依据。[27]中国空间站科创体验基地门户则汇集图文、视频和全景漫游，观众可通过点击、缩放自主选择舱段、观察设施。[28]这些实践既通过视听内容组织连续观看，也提供按关注点浏览知识的条件，体现了数字媒介在信息呈现与阅读路径设计上的多种应用。',
  '（3）人工智能在科普中的应用',
  '国内人工智能科普已进入答疑服务和内容制作环节。中国科技馆的“科技馆智能体”面向公众提供科学答疑，喀什科技馆的应用还根据年龄和喜好组织讲解与路线建议。[29][30]2026年抖音“Vibe知识大赏”话题下的《运气的形状》《月老的算法》等短片，创作者标注AI参与制作，以动画讲解概率、匹配算法等知识。[31][32]独立的中文开源项目“vibe-knowledge”则公开了组织文案、分镜、动画代码和视频导出的制作流程，展示AI辅助编程制作科普动画的做法。[33]张燕翔等（2025）从科学性与叙事性协同角度讨论AIGC科普创作，强调内容表达与科学依据的配合。[34]上述案例呈现了机构服务和个体创作两类应用，反映人工智能可参与不同的科普环节。',
  '综合上述实践，新污染物科普已采用概念说明、事件解释与生活建议等组织方式，数字媒介和人工智能则为内容呈现、知识探索及受众适配提供了不同条件。Fähnrich等（2023）将内容、表达、技术、情境和过程纳入数字科学传播质量框架，提示相关创作需结合科学依据、受众和传播目标评价。[35]这些维度可为后续比较案例和明确设计问题提供参考。',
);

const references=[
  ['[22] NASA JET PROPULSION LABORATORY. NASA’s Eyes on the Earth Puts the World at Your Fingertips[EB/OL]. (2021-11-16)[2026-10-18].','https://www.nasa.gov/centers-and-facilities/jpl/nasas-eyes-on-the-earth-puts-the-world-at-your-fingertips/'],
  ['[23] ADAMS W K, REID S, LEMASTER R, et al. A Study of Educational Simulations Part I—Engagement and Learning[J/OL]. Journal of Interactive Learning Research, 2008, 19(3): 397–419.','https://phet.colorado.edu/publications/PhET_Interviews_I.pdf'],
  ['[24] UNIVERSITY OF CAMBRIDGE. Public invited to chat to museum animals in novel AI experiment[EB/OL]. (2024-10-14)[2026-10-18].','https://www.cam.ac.uk/research/news/public-invited-to-chat-to-museum-animals-in-novel-ai-experiment'],
  ['[25] 中国科学院生态环境研究中心. 新污染物—避免替代“陷阱”——2023年中国科学院科普视频图片大赛科普视频类硕博组二等奖[EB/OL]. (2024-03-29)[2026-10-18].','https://www.rcees.cas.cn/kx/kxpj/kpsp/202403/t20240329_7059866.html'],
  ['[26] 美丽化学. 关于[EB/OL]. [2026-10-18].','https://www.beautifulchemistry.net/about-cn'],
  ['[27] 郑斌, 王大鹏, 梁琰. 科普微视频传播路径与受众行为研究——以利用Google Analytics对“美丽化学”网站的分析为例[J/OL]. 科普研究, 2018, 13(3): 29–35. DOI: 10.19293/j.cnki.1673-8357.2018.03.004.','https://castjournals.cast.org.cn/joweb/kpyj/CN/1288940623310988244'],
  ['[28] 中国数字科技馆. 中国空间站科创体验基地[EB/OL]. [2026-10-18].','https://www.cdstm.cn/subjects/csssieb/'],
  ['[29] 中国数字科技馆. AI回答每一份好奇——科技馆智能体[EB/OL]. (2024-11-12)[2026-10-18].','https://www.cdstm.cn/videos/Tops/yc/art/2024/art_648e97c8b69a493eb0cdebd97749145d.html'],
  ['[30] 中国科学技术协会. 绿洲课堂点亮边疆童心[EB/OL]. (2025-08-01)[2026-10-18].','https://www.cast.org.cn/xw/MTBD/art/2025/art_0c93aafa97e64b86be18039fe449589e.html'],
  ['[31] IWANAU. Vibe知识大赏：《运气的形状》[EB/OL]. 抖音, (2026-09-28)[2026-10-18].','https://www.douyin.com/video/7690344836800913785'],
  ['[32] IWANAU. Vibe知识大赏：《月老的算法》[EB/OL]. 抖音, (2026-09-29)[2026-10-18].','https://www.douyin.com/video/7690785624487590054'],
  ['[33] WORLDS3. vibe-knowledge：Vibe知识大赏——纯前端Canvas知识科普动画视频与制作流程skill[EB/OL]. GitHub[2026-10-18].','https://github.com/worlds3/vibe-knowledge'],
  ['[34] 张燕翔, 朱育慧, 黄荣丽, 李红林. AIGC语境下科普创作的科学性与叙事性协同优化策略研究[J/OL]. 科普研究, 2025, 20(2): 43–52. DOI: 10.19293/j.cnki.1673-8357.2025.02.005.','https://castjournals.cast.org.cn/joweb/kpyj/CN/1240340550004568364'],
  ['[35] FÄHNRICH B, WEITKAMP E, KUPPER J F. Exploring ‘quality’ in science communication online: Expert thoughts on how to assess and promote science communication quality in digital media contexts[J/OL]. Public Understanding of Science, 2023, 32(5): 605–621. DOI: 10.1177/09636625221148054.','https://doi.org/10.1177/09636625221148054'],
];
const bibliography=sections.find(section=>section.sourceList&&/参考文献/.test(section.title));
if(!bibliography)throw new Error('Cannot locate the proposal bibliography.');
bibliography.paragraphs.push(...references.map(([text])=>text));
bibliography.links.push(...references,
  ['[6] PFAS StoryMap · 原始作品','https://storymaps.arcgis.com/stories/dc9f7d19d293402ba1c98570bedbcc37'],
  ['[8] Detox Me · 开发机构的功能与生活建议说明','https://silentspring.org/resources/tips-healthier-living'],
  ['[23] PhET · 项目与设计原则','https://phet.colorado.edu/en/about'],
);

export const graduationPracticePublication={
  ...graduationConceptsPublication,
  baseRevision:'885e9dd9-044a-4881-86b4-2c631d9dd6ec',
  revision:'proposal-2026-10-18-practice-v1',
  label:'开题审阅稿 · 1.3国内外实践修订',
  createdAt:undefined,
  sections,
};
