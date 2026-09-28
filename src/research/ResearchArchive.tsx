import { ArrowUpRight, Download } from 'lucide-react';
import './research-archive.css';

const base = '/graduation/archive/';
const sharedChat = 'https://chatgpt.com/s/cx_6aba23dc88448191856ec8579eb926a6';
const files = [
  { name: '完整资料包', detail: 'HTML 阅读版、数据、图片与说明；保留旧项目原貌', file: 'new-pollutants-materials.zip', size: '7.3 MB' },
  { name: '表格工作簿', detail: '跨地区清单、时间节点、研究证据与来源工作表', file: 'new-pollutants-global-dataset-2026.xlsx', size: '62 KB' },
  { name: '国内资料时间线', detail: '80 条记录，含日期口径、层级、限制与原文入口', file: 'china-timeline.csv', size: '37 KB' },
  { name: '物质清单记录', detail: '240 条跨清单记录；包含重叠与物质组', file: 'pollutants-catalog.csv', size: '61 KB' },
  { name: '监测研究摘录', detail: '18 条记录，保留样本、介质、单位和可比性限制', file: 'monitoring-evidence.csv', size: '4 KB' },
  { name: '全部来源入口', detail: '42 条原始政策、机构页面和论文线索', file: 'sources.csv', size: '8 KB' },
  { name: '政策节点', detail: '22 条国内外政策事件及原文链接', file: 'policy-timeline.csv', size: '4 KB' },
  { name: '国内地区覆盖', detail: '31 个省级地区的资料覆盖状态与缺口', file: 'china-province-coverage.csv', size: '6 KB' },
];

export default function ResearchArchive() {
  return <div className="rl-content ra-content" lang="zh-CN">
    <section className="rl-lede"><span className="rl-label">从另一份项目带回来的研究素材 · 2026.09</span><h2>把旧资料收好，也把它们能说明什么讲清楚。</h2><p>这份存档来自你提供的<a href={sharedChat} target="_blank" rel="noopener noreferrer">完整分享记录 <ArrowUpRight size={14}/></a>。我找到了对应的最终文件，保留了原始资料包，并把便于继续分析的数据表单独放在下面。早期对话里出现过较小的记录数；这里统一以最终文件为准。</p></section>
    <div className="ra-stats"><article><strong>42</strong><span>来源入口</span></article><article><strong>80</strong><span>国内时间线记录</span></article><article><strong>240</strong><span>跨清单条目</span></article><article><strong>18</strong><span>监测研究摘录</span></article></div>
    <section className="ra-section"><span className="rl-label">吸收到当前课题的三条提醒</span><h2>数量要读，口径更要读。</h2><div className="ra-insights"><article><span>01 / 定义范围</span><h3>新污染物不是一张全球统一的名单。</h3><p>中国重点管控清单、国际公约、欧盟观察清单和美国饮用水监管候选清单，各自回答不同的管理问题。条目多少不能直接比较风险大小。</p><div><a href="https://www.mee.gov.cn/zcwj/gwywj/202205/t20220524_983032.shtml" target="_blank" rel="noopener noreferrer">中国行动方案 ↗</a><a href="https://www.pops.int/TheConvention/ThePOPs/AllPOPs/tabid/2509/Default.aspx" target="_blank" rel="noopener noreferrer">Stockholm ↗</a><a href="https://eur-lex.europa.eu/eli/dec_impl/2025/439/oj/eng" target="_blank" rel="noopener noreferrer">EU 观察清单 ↗</a><a href="https://www.epa.gov/ccl/ccl-5-chemical-contaminants" target="_blank" rel="noopener noreferrer">EPA CCL 5 ↗</a></div></article><article><span>02 / 读时间线</span><h3>政策节点，不是污染水平的折线。</h3><p>一条时间线可以说明治理和研究怎样受到重视；它不能单独回答污染物在环境里增加了多少。每条记录保留成文、发布或生效日期的不同口径。</p><a href={`${base}china-timeline.csv`} download>查看国内时间线数据 ↗</a></article><article><span>03 / 读监测值</span><h3>先看样本、介质、单位和方法。</h3><p>自来水、再生水与不同地点的研究不能直接拼接成全国趋势。旧项目的监测摘录保留了原始值与限制，可作为回查论文的索引。</p><a href={`${base}monitoring-evidence.csv`} download>查看监测摘录 ↗</a></article></div></section>
    <section className="ra-section"><span className="rl-label">对你现在作品的用途</span><h2>从大资料库，收敛到一张照片能讲清的事。</h2><p className="ra-body">旧项目能帮助你找候选物质、政策背景、时间节点和原文；新作品还需要进一步选择一个生活场景与一条有条件的来源或迁移路径。照片只能提供场景线索，不能把清单记录或其他地点的监测数值贴到这张照片上当作检测结果。导师问“为什么要做”时，这份资料支持议题背景；“为什么要用你的交互形式”仍要靠受众调研与测试。</p></section>
    <section className="ra-section"><span className="rl-label">留存文件 · 原文件名</span><h2>下载和继续核对。</h2><div className="ra-files">{files.map(item=><a href={`${base}${item.file}`} download key={item.file}><div><strong>{item.name}</strong><p>{item.detail}</p></div><span>{item.size}<Download size={16}/></span></a>)}</div><p className="ra-method">这些是另一项目的二次整理素材，并未在本轮逐条重审全部 42 个链接、240 条清单记录及 80 个时间节点。正式写入开题报告前，请回到相应原文核对名称、时间、范围和引用格式。“240 条”含跨清单重复及物质组，不能表述为 240 种独立新污染物；资料缺口也不代表当地不存在政策。</p><a className="ra-readme" href={`${base}README.md`} target="_blank" rel="noopener noreferrer">阅读存档说明 <ArrowUpRight size={14}/></a></section>
  </div>;
}
