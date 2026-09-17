import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Download, BookOpen, ArrowRight } from 'lucide-react';
import './graduation.css';

const steps = [
  { name: '现实议题', question: '为什么值得关注？', status: '已有背景依据', because: '新污染物已进入国家环境治理议程。', therefore: '梳理议题的现实背景与科普内容边界。', evidence: '政策原文、环境科学综述；记录具体出处及适用范围。', gap: '政策关注证明议题重要，尚不能证明某类人群需要某种科普设计。' },
  { name: '受众问题', question: '谁在哪里遇到困难？', status: '待调研', because: '尚不清楚目标人群在什么情境下，误解或无法理解哪些信息。', therefore: '先选择可接触的人群，通过访谈和理解任务识别具体困难。', evidence: '匿名访谈记录、原话、任务表现及反例；说明样本局限。', gap: '不能预设“公众不了解”，也不能从少量访谈推断所有公众。' },
  { name: '传播缺口', question: '现有方式缺少什么？', status: '待分析', because: '尚未比较已有科普材料如何解释同一个问题。', therefore: '围绕内容组织、关系表达、交互反馈和证据呈现比较案例。', evidence: '可追溯案例、统一比较维度、与用户困难对应的分析。', gap: '形式不够新颖，不等于已有传播方式无效。' },
  { name: '设计介入', question: '为什么用这个设计？', status: '待论证', because: '只有明确理解障碍，才能判断信息与交互设计可以介入哪里。', therefore: '让每项设计策略对应一项已识别的问题，再决定作品媒介。', evidence: '问题—策略对应表、相关设计研究、内容结构与低保真原型。', gap: '网页、装置或游戏是待选择的形式；交互本身不是有效性的证明。' },
  { name: '效果验证', question: '怎么知道有帮助？', status: '待制定', because: '设计是否改善理解，需要可观察的结果。', therefore: '安排理解任务、前后测或对照比较，记录改善与未改善之处。', evidence: '测试方案、评价指标、任务数据及定性反馈；控制内容等差异。', gap: '喜欢、好看或停留时间更长，不能单独证明知识理解得到改善。' },
];
const sources = [
  { type: '官方解释 · 2023', title: '什么是新污染物？', name: '生态环境部｜重点管控新污染物清单答记者问', url: 'https://www.mee.gov.cn/ywdt/zbft/202301/t20230113_1012751.shtml', note: '用于界定概念与治理背景。不能据此推断目标受众的认知状况。' },
  { type: '政策解读 · 2022', title: '为什么进入治理议程？', name: '生态环境部｜新污染物治理行动方案答记者问', url: 'https://www.mee.gov.cn/ywdt/zbft/202205/t20220524_983044.shtml', note: '用于理解治理任务与研究背景。设计介入的必要性仍需独立论证。' },
  { type: '官方说明 · 2022', title: '研究范围可以如何收窄？', name: '生态环境部｜3月例行新闻发布会', url: 'https://www.mee.gov.cn/ywdt/xwfb/202203/t20220330_973154.shtml', note: '介绍持久性有机污染物、内分泌干扰物、抗生素、微塑料等类别。具体研究对象待确定。' },
];
const schedule = [
  ['09.17—09.23', '明确问题边界', '一页选题说明：候选对象、受众、问题与待补证据'],
  ['09.24—10.07', '整理文献与案例', '文献矩阵、案例比较表、初步研究缺口'],
  ['10.08—10.14', '探索用户问题', '小规模访谈与理解任务，记录反例及样本局限'],
  ['10.15—10.21', '建立设计逻辑', '问题—策略对应表、内容框架、交互草图'],
  ['10.22—10.28', '完成开题初稿', '按学校六部分模板组织证据、方案和计划'],
  ['10.29—11.04', '导师反馈与修订', '调整研究问题与论证，完成汇报初稿'],
  ['11.05—11.12', '准备开题汇报', '检查引文、演练答辩、核对提交要求'],
];
const outline = [
  ['研究背景与依据', '现实背景 → 国内外研究与实践 → 尚未解决的问题 → 理论意义与实践价值'],
  ['创作方案与研究内容', '目标受众、具体研究问题、内容范围、拟研究内容；已有成果如实填写'],
  ['创作初步构想、草图', '内容结构、使用情境、用户流程与初步草图，说明每个构想对应的问题'],
  ['创作基本思路与方法', '文献与案例分析 → 探索调研 → 设计转化 → 原型 → 测试与迭代'],
  ['重点、难点、创新与预期成果', '区分拟探索的创新与已证实的贡献；说明科学准确性、可行性及交付物'],
  ['参考文献', '为每项重要判断保留作者、年份、出处与页码；引用前核对原文'],
];
const noteKey = 'gemos-graduation-notes-v1';
export default function GraduationPage() {
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState('logic');
  const [notes, setNotes] = useState(() => { try { return localStorage.getItem(noteKey) || ''; } catch { return ''; } });
  const [saved, setSaved] = useState('');
  useEffect(() => {
    document.documentElement.classList.add('graduation-mode');
    document.body.classList.add('graduation-mode');
    const oldTitle = document.title;
    document.title = '毕业设计 · 研究工作台 | GemosDodo';
    window.scrollTo(0, 0);
    return () => { document.title = oldTitle; document.documentElement.classList.remove('graduation-mode'); document.body.classList.remove('graduation-mode'); };
  }, []);
  const saveNote = (value: string) => {
    setNotes(value);
    try { localStorage.setItem(noteKey, value); setSaved('已保存到当前浏览器'); }
    catch { setSaved('浏览器无法保存，请导出备份'); }
  };
  const exportNotes = () => {
    const text = `# 毕业设计研究笔记\n\n信息与交互设计 · 硕士\n研究方向：新污染物科普（具体题目待论证）\n开题日期：2026-11-13\n\n${notes || '尚未填写笔记。'}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = '毕业设计研究笔记.md'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const current = steps[active];
  return <div className="grad-page no-grass" lang="zh-CN">
    <header className="grad-header"><Link to="/" className="grad-brand">Gemos<span>.</span></Link><span>RESEARCH JOURNAL / 2026</span><Link to="/"><ArrowLeft size={15} /> 返回首页</Link></header>
    <main className="grad-main">
      <section className="grad-hero">
        <div><p className="grad-eyebrow"><span /> 信息与交互设计 · 硕士毕业设计</p><h1>从一个问题，<br />走向有依据的设计<span>。</span></h1><p className="grad-intro">新污染物科普研究工作台。<br />把每一次阅读、观察与设计决定，连接成清晰的论证。</p><a className="grad-start" href="#grad-workspace">开始梳理论证 <ArrowRight size={17} /></a></div>
        <aside className="grad-milestone"><div className="grad-tag">下一站 / 开题</div><p className="grad-date">11<span>/</span>13</p><p className="grad-year">2026 · 研究准备阶段</p><div className="grad-milestone-bottom"><span>当前重点</span><strong>选题必要性论证</strong><p>具体污染物、目标人群与作品形式<br />将在证据积累后确定。</p></div></aside>
      </section>
      <div className="grad-principle"><span>研究主线</span><p>因为什么，<strong>所以才做什么。</strong></p><span>每一个设计决定，都有来处。</span></div>
      <section id="grad-workspace" className="grad-workspace">
        <nav className="grad-tabs" aria-label="研究工作台栏目">{[['logic', '01', '论证链'], ['sources', '02', '资料起点'], ['plan', '03', '开题计划'], ['outline', '04', '报告框架']].map(([id, n, title]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)} className={tab === id ? 'active' : ''}><span>{n}</span>{title}</button>)}</nav>
        {tab === 'logic' && <section className="grad-panel"><div className="grad-section-head"><div><p className="grad-eyebrow">BUILD THE ARGUMENT</p><h2>让选题一步步立得住</h2></div><span className="grad-status">背景已找到 · 设计必要性待论证</span></div><p className="grad-muted">点击每一环，查看需要补齐的依据。以下是研究框架，尚未形成调研结论。</p><div className="grad-chain">{steps.map((s, i) => <button key={s.name} onClick={() => setActive(i)} aria-pressed={active === i} className={active === i ? 'active' : ''}><span>0{i + 1}</span><strong>{s.name}</strong><small>{s.question}</small><ArrowUpRight size={16} /></button>)}</div><article className="grad-argument"><div className="grad-argument-title"><h3>{current.question}</h3><span>{current.status}</span></div><div className="grad-reason-grid"><div><label>因为 / 当前判断</label><p>{current.because}</p></div><div><label>所以 / 下一步行动</label><p>{current.therefore}</p></div></div><div className="grad-evidence"><BookOpen size={18} /><p><strong>需要的证据</strong>{current.evidence}</p></div><p className="grad-boundary">论证边界：{current.gap}</p></article></section>}
        {tab === 'sources' && <section className="grad-panel"><div className="grad-section-head"><div><p className="grad-eyebrow">READ WITH A QUESTION</p><h2>先建立可靠的资料起点</h2></div></div><p className="grad-muted">这三份官方资料支持背景界定。学术文献、设计案例与用户证据仍待补充。</p><div className="grad-source-grid">{sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"><span>{s.type}<ArrowUpRight size={17} /></span><h3>{s.title}</h3><p>{s.name}</p><small>{s.note}</small></a>)}</div><div className="grad-reading"><h3>带着三个问题继续阅读</h3><p>受众在哪些概念或关系上存在理解困难？已有传播设计如何回应？用什么任务可以判断理解是否改善？</p><p className="grad-muted">文献记录建议：研究对象 / 方法与样本 / 主要发现 / 局限 / 与本选题的关系 / 原文出处。</p></div></section>}
        {tab === 'plan' && <section className="grad-panel"><div className="grad-section-head"><div><p className="grad-eyebrow">TOWARDS NOVEMBER 13</p><h2>把开题拆成可完成的步骤</h2></div><span className="grad-status">建议安排 · 待与导师核对</span></div><div className="grad-schedule">{schedule.map(([date, title, result], i) => <article key={date}><span className="grad-step-number">0{i + 1}</span><time>{date}</time><h3>{title}</h3><p>{result}</p></article>)}</div></section>}
        {tab === 'outline' && <section className="grad-panel"><div className="grad-section-head"><div><p className="grad-eyebrow">PROPOSAL STRUCTURE</p><h2>研究积累，最终进入这六部分</h2></div></div><p className="grad-muted">根据学校模板整理。另附毕业创作进度；各栏 8000 字符为输入上限。</p><div className="grad-outline">{outline.map(([title, content], i) => <details key={title}><summary><span>0{i + 1}</span>{title}<span className="grad-expand">＋</span></summary><p>{content}</p></details>)}</div></section>}
      </section>
      <section className="grad-notebook"><div><p className="grad-eyebrow">FIELD NOTES</p><h2>把今天的问题留下来。</h2><p>记录导师反馈、阅读发现，<br />或一个还没有答案的疑问。</p><button onClick={exportNotes}><Download size={16} /> 导出笔记</button></div><div><label htmlFor="grad-notes">研究随记</label><textarea id="grad-notes" value={notes} onChange={e => saveNote(e.target.value)} placeholder={'今天找到的证据：\n它支持什么判断：\n它还不能说明什么：\n下一步要验证的问题：'} /><div className="grad-save"><span>仅保存在当前浏览器，不会同步服务器。请定期导出。</span><span role="status">{saved}</span></div></div></section>
      <footer className="grad-footer"><span>GemosDodo · 毕业设计研究档案</span><span>从证据出发，向设计前进。</span></footer>
    </main>
  </div>;
}
