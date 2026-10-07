import {useState} from 'react';
import {ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Download} from 'lucide-react';
import './clue-box-concept.css';

type ConceptStep = {
  id:string;
  label:string;
  verb:string;
  heading:string;
  description:string;
  output:string;
  readiness:'拟新增'|'局部原型已实现'|'已有基础 · 拟改造';
  implementation:string;
  question:string;
};

const steps:ConceptStep[] = [
  {
    id:'photo',label:'照片适配',verb:'选择',heading:'从一张有场景的日常照片开始。',
    description:'选择包含物件、环境或生活活动的照片，让画面里的细节成为创作入口。纯人脸自拍不进入这条流程；具体适配标准还需要用不同照片试出来。',
    output:'一张适合空间表达、也有生活线索的个人照片。',readiness:'局部原型已实现',
    implementation:'独立原型已支持照片输入和人工场景确认，以洗衣场景作为首个单元。AI 适配筛选、更多场景及其反馈仍待研究；不适配当前单元不代表画面与任何污染物无关。',
    question:'哪些画面值得进入？遇到不适配照片，怎样帮助参与者重新选择？',
  },
  {
    id:'association',label:'有依据的关联',verb:'关联',heading:'让可见的生活细节，连接可追溯的知识。',
    description:'AI 根据可见物件与生活活动提出新污染物科普线索，设计者再核对来源、条件与表达。关联内容随照片场景选择，让每个人的作品保留自己的生活语境。',
    output:'一条有来源和适用条件的场景关联。',readiness:'已有基础 · 拟改造',
    implementation:'洗衣单元已提供有来源链接的条件性说明；专业核验、更多内容、AI 候选提议与人工审核仍待完成。图像识别不用于检测污染物，材料组成不能仅由画面确定。',
    question:'AI 提出什么、设计者确认什么？没有合适依据时，怎样结束或调整这一轮创作？',
  },
  {
    id:'space',label:'照片入仓 3D',verb:'转化',heading:'把熟悉的画面，收藏成可以探索的空间。',
    description:'照片通过 SHARP 重建为三维高斯场景，进入盒子。保留原照片的层次、场景特征与个人记忆，让参与者愿意靠近、转动和继续探索自己的作品。',
    output:'以个人照片为素材的一份空间作品。',readiness:'局部原型已实现',
    implementation:'原作保持独立。新版已接入真实高斯渲染、浏览器 SHARP 重建流程和 .still 导入；内置示例已用原生 SHARP 重建。完整手机推理与触摸手感仍待实测，单图重建有视角与缺失区域限制。',
    question:'哪些视觉特征最值得保留？粒子变化怎样既有表现力，也让人认得自己的照片？',
  },
  {
    id:'hotspot',label:'局部热点与演绎',verb:'探索',heading:'在局部细节里，展开三步故事。',
    description:'由设计者核对并标记局部热点，伴随内容按“来源 → 潜在影响 → 减少释放”展开说明。发光与变色配合内容推进，让知识与空间变化相互回应；进一步的局部流动效果待迭代。',
    output:'一个可以探索的热点，以及三步对应的视觉与文字表达。',readiness:'局部原型已实现',
    implementation:'新版已支持基于照片投影坐标的局部高亮、三步说明及三维点选标记。当前洗衣内容仅在合成纤维条件下成立；下面仍是概念示意，实际体验请打开交互原型。专业内容核验和用户评价待完成。',
    question:'三步内容各适合什么视觉变化？怎样让人理解关系，也保留作品的审美空间？',
  },
  {
    id:'archive',label:'分离、抓取、归档',verb:'收藏',heading:'抓住盒子，把这一段体验留下来。',
    description:'顶部盒子与键盘底座分离。完成探索后，参与者抓取盒子，将这一份个人作品先留在本机，再自愿加入公共盒子库，让操作有一个明确、可感知的收束。',
    output:'一份与个人照片及科普线索相连的归档作品。',readiness:'局部原型已实现',
    implementation:'新版已将屏幕中的盒子与键盘底座分离，支持抓取、托盘归档及本机保存；主动勾选后可公开照片与完整三维。实体抓取和线下装置尚未制作，研究将先核对屏幕操作。',
    question:'抓取发生在屏幕、实体装置还是二者联动？什么反馈能让人感到作品已被收藏？',
  },
  {
    id:'card',label:'个人艺术卡片',verb:'分享',heading:'把自己的作品，变成想分享的一张卡片。',
    description:'用原照片、个人盒子和二维码共同生成卡片。版式、色彩与视觉风格回应照片，让作品漂亮、有个人特色；选择公开后，扫码可以跨设备打开自己的盒子。',
    output:'照片＋盒子＋二维码组成的个人艺术卡片。',readiness:'局部原型已实现',
    implementation:'新版已生成照片、盒子快照和真实二维码组成的数字卡片，并支持保存 PNG；公开作品二维码可以跨设备回看。本页只展示卡片结构；多风格规则、个性化版式与分享效果仍待设计和评价。',
    question:'怎样让不同照片都形成好看的卡片？卡片上保留多少线索，才不会挤走个人表达？',
  },
  {
    id:'collective',label:'公共库与再创作',verb:'接力',heading:'看见彼此的作品，让另一张照片接着发生。',
    description:'公开作品的二维码既能回看本人的盒子，也能连接集体作品。喜欢作品的人可以分享卡片与 Skill，用自己的照片再次创作，延续同一条线上线下的创作链。',
    output:'可回看的个人作品、参与线索的集体艺术档案，以及下一轮创作入口。',readiness:'局部原型已实现',
    implementation:'新版已实现主动公开、共同收藏浏览、同一高斯模型回看及凭证撤回。公共库是作品档案；Skill 规则包、实际跨用户再创作和自然传播评价仍待完成。',
    question:'公共库怎样组织作品？哪些内容公开，怎样邀请他人从自己的照片继续创作？',
  },
];

const phases = [
  {label:'来源',question:'这条场景线索，从哪里开始？',description:'先说明可见物件或生活活动与科普主题的关联条件。'},
  {label:'潜在影响',question:'这条线索，可能怎样继续？',description:'用经核对的内容说明可能的过程与影响，再用空间变化回应。'},
  {label:'减少释放',question:'从日常出发，可以怎样改变？',description:'把相关的减少释放方式带回生活场景，具体建议随主题核验。'},
];

const openQuestions = [
  {label:'照片与依据',text:'照片适配标准、AI 关联范围和人工核对方式怎样界定？'},
  {label:'盒子与动作',text:'盒子的实体与虚拟关系，以及抓取、归档的反馈怎样呈现？'},
  {label:'视觉与知识',text:'热点与三步演绎怎样对应，兼顾理解、审美和个人意义？'},
  {label:'分享与复用',text:'卡片风格、公共库的公开内容与 Skill 复用入口怎样确定？'},
];

const conceptPlan = {
  schemaVersion:2,
  updatedAt:'2026-10-07',
  documentType:'作品构想讨论稿',
  finalTitle:null,
  audience:'待研究与讨论，不预设固定受众',
  goal:'将个人日常照片转化为漂亮、个性化的新污染物主题作品，让人因为喜欢作品而主动分享作品与 Skill。',
  flow:steps,
  hotspotNarrative:phases,
  channels:{
    online:'线上创作、作品浏览、卡片分享和 Skill 复用是传播主线。',
    offline:'线下装置通过照片入仓、空间探索和抓取归档呈现同一条创作链。',
  },
  skill:{status:'拟新增，尚未制作',role:'复用视觉生成规则与传播方法',rules:['照片与场景的适配方式','空间、热点和演绎的视觉规则','个性化卡片版式与作品入口']},
  boundaries:{
    photo:'照片用于场景关联与视觉创作，不能证明污染物存在、浓度、暴露程度或个人健康风险。',
    visuals:'发光、变色和湍流属于艺术演绎，不对应实测含量。',
    archive:'公共库是参与线索与作品的艺术档案，不是污染物实测分布。',
  },
  existingBasis:{name:'Gemos Still',url:'/gemos-still/',image:'/gemos-still/assets/coast-scene.jpg',capabilities:['照片入仓','单图空间重建','记忆盒展示']},
  links:{interactiveSketch:'/graduation/clue-box/index.html',previousConcept:'/graduation/research?view=idea&draft=previous'},
  openQuestions,
};

export default function ClueBoxConcept(){
  const [active,setActive]=useState(0);
  const [phase,setPhase]=useState(0);
  const [exportStatus,setExportStatus]=useState('');
  const step=steps[active];
  const exportPlan=()=>{
    const href=URL.createObjectURL(new Blob([JSON.stringify(conceptPlan,null,2)],{type:'application/json;charset=utf-8'}));
    const anchor=document.createElement('a');
    anchor.href=href;
    anchor.download='作品构想-讨论方案.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(href),1000);
    setExportStatus('已导出本页 JSON 方案。');
  };

  return <div className="rl-content cbc-concept" lang="zh-CN">
    <header className="cbc-hero">
      <div className="cbc-hero-copy">
        <span className="cbc-kicker">作品构想 / 新的讨论稿</span>
        <h2 className="cbc-title">让一张日常照片，<br/>长出想分享的作品。</h2>
        <p className="cbc-lede">从生活场景到空间盒子，再到一张属于自己的艺术卡片。把新污染物的科普线索融入创作，让喜欢成为分享和再次创作的起点。</p>
        <div className="cbc-hero-meta"><span>线上传播优先</span><span>线下体验接入同一条链</span></div>
        <div className="cbc-actions">
          <a className="cbc-button cbc-primary" href="/graduation/clue-box/index.html">交互草图 <ArrowUpRight size={16} aria-hidden="true"/></a>
          <button className="cbc-button" type="button" onClick={exportPlan}><Download size={15} aria-hidden="true"/>导出 JSON 方案</button>
        </div>
        <p className="cbc-export-status" role="status">{exportStatus}</p>
      </div>
      <figure className="cbc-hero-figure">
        <img src="/gemos-still/assets/coast-scene.jpg" alt="Gemos Still 现有作品：键盘底座上方的透明盒子收藏着一张照片转化的空间场景" width="2000" height="1600"/>
        <figcaption><span>现有作品基础</span><a href="/gemos-still/">Gemos Still <ArrowUpRight size={12} aria-hidden="true"/></a></figcaption>
      </figure>
    </header>

    <section className="cbc-flow" aria-labelledby="cbc-flow-title">
      <div className="cbc-section-head"><div><span className="cbc-kicker">01 / 完整创作链</span><h2 id="cbc-flow-title" className="cbc-section-title">从自己的照片，走向彼此的作品。</h2></div><p>点击一步，查看这一环的体验与产出。</p></div>
      <ol className="cbc-steps" aria-label="创作流程步骤">{steps.map((item,index)=><li key={item.id}><button type="button" aria-pressed={active===index} aria-controls="cbc-step-detail" onClick={()=>setActive(index)}><span className="cbc-step-number">{String(index+1).padStart(2,'0')}</span><strong>{item.label}</strong><span className="cbc-step-verb">{item.verb}<ArrowRight size={13} aria-hidden="true"/></span></button></li>)}</ol>
      <article id="cbc-step-detail" className="cbc-step-detail" aria-labelledby="cbc-step-title">
        <div className="cbc-detail-index"><span>{String(active+1).padStart(2,'0')}</span><small>/{String(steps.length).padStart(2,'0')}</small><div className={`cbc-state${(step.readiness.startsWith('已有')||step.readiness.includes('已实现'))?' cbc-state-base':''}`}>{step.readiness}</div></div>
        <div className="cbc-detail-copy">
          <span className="cbc-kicker">{step.label}</span><h3 id="cbc-step-title">{step.heading}</h3><p>{step.description}</p>
          {step.id==='hotspot'&&<div className="cbc-narrative">
            <div className="cbc-phase-tabs" role="group" aria-label="三步演绎">{phases.map((item,index)=><button key={item.label} type="button" aria-pressed={phase===index} onClick={()=>setPhase(index)}><small>0{index+1}</small>{item.label}</button>)}</div>
            <div className={`cbc-phase-panel cbc-phase-${phase}`}><span className="cbc-phase-mark" aria-hidden="true"><i/><i/><i/></span><div><strong>{phases[phase].question}</strong><p>{phases[phase].description}</p></div></div>
            <small className="cbc-demo-caption">三步结构示意 · 洗衣单元已有局部高亮原型，视觉节奏待迭代</small>
          </div>}
          {step.id==='card'&&<div className="cbc-card-structure" aria-label="艺术卡片组成"><span>个人照片</span><b aria-hidden="true">＋</b><span>空间盒子</span><b aria-hidden="true">＋</b><span>作品二维码</span></div>}
          <div className="cbc-output"><span>这一环留下</span><p>{step.output}</p></div>
          <div className="cbc-step-controls"><button type="button" disabled={active===0} onClick={()=>setActive(active-1)}><ChevronLeft size={15} aria-hidden="true"/>上一步</button><span>{active+1} / {steps.length}</span><button type="button" disabled={active===steps.length-1} onClick={()=>setActive(active+1)}>下一步<ChevronRight size={15} aria-hidden="true"/></button></div>
        </div>
      </article>
    </section>

    <section className="cbc-channels" aria-labelledby="cbc-channels-title">
      <div className="cbc-section-head"><div><span className="cbc-kicker">02 / 同一条链，两种入口</span><h2 id="cbc-channels-title" className="cbc-section-title">作品在现场发生，也在线上继续。</h2></div></div>
      <div className="cbc-channel-grid"><article><span className="cbc-channel-label">线上 / 创作与传播主线</span><h3>因为喜欢，主动分享。</h3><p>个人照片生成作品与艺术卡片，选择公开后扫码回看自己的盒子、浏览集体作品，再通过 Skill 用另一张照片接力。</p></article><article><span className="cbc-channel-label">线下 / 空间与动作体验</span><h3>靠近、探索，再把盒子留下。</h3><p>照片入仓、局部热点、旁屏三步演绎与抓取归档，让同一条创作链在装置中变得可感知。</p></article></div>
      <div className="cbc-skill"><div><span className="cbc-kicker">Skill / 可复用的视觉规则</span><h3>把创作方法，也交给下一位创作者。</h3><p>本项目拟把照片适配、内容核验、空间演绎和卡片生成组织成可复用创作规则，并参照 Agent Skills 规范封装为核心交付；模板是包内资源之一。规则包尚未发布，复用效果需通过再创作任务验证。</p></div><ul><li>照片与场景的适配方式</li><li>空间、热点和演绎的视觉规则</li><li>个人卡片版式与作品入口</li></ul></div>
    </section>

    <section className="cbc-discussion" aria-labelledby="cbc-discussion-title"><div className="cbc-section-head"><div><span className="cbc-kicker">03 / 下一轮讨论</span><h2 id="cbc-discussion-title" className="cbc-section-title">先把这四件事一起想清楚。</h2></div></div><div className="cbc-question-grid">{openQuestions.map((item,index)=><article key={item.label}><span>0{index+1} / {item.label}</span><p>{item.text}</p></article>)}</div></section>

    <details className="cbc-evidence"><summary>实现与依据 <span>现有基础、拟新增内容与表达边界</span></summary><div className="cbc-evidence-body">
      <p>这是一份独立的作品讨论稿，最终题名与受众边界仍待开题讨论，洗衣微塑料微纤维为首个演示与验证单元。真实高斯场景、局部热点、屏幕抓取、艺术卡与公共归档已有独立原型；AI 自动关联、可分发 Skill、实体装置和用户评价仍待完成。</p>
      <div className="cbc-evidence-grid">{steps.map(item=><article key={item.id}><strong>{item.label}<small>{item.readiness}</small></strong><p>{item.implementation}</p></article>)}</div>
      <div className="cbc-boundaries"><h3>内容依据怎样进入作品</h3><p>照片仅提供可见物件、场景与活动的关联线索，不能证明污染物存在、浓度、暴露程度或个人健康风险。每条科普线索需要核对原始来源与适用条件；洗衣单元已提供有条件的三步说明，专业核验与其他主题扩展仍待完成。</p><p>粒子的发光、变色与湍流属于艺术演绎，不对应实测含量。公共盒子库是参与线索与作品的艺术档案，不代表污染物的实测分布。</p></div>
      <p className="cbc-page-note">本页不读取或保存个人照片与浏览器草稿；JSON 导出只包含当前方案。开题报告已按同一创作链修订，旧构想保留为历史讨论材料。</p>
    </div></details>

    <footer className="cbc-footer"><span>作品构想讨论稿 · 2026.10.07 更新 · 原型与研究方案同步</span><a href="/graduation/research?view=idea&draft=previous">查看旧构想 <ArrowUpRight size={13} aria-hidden="true"/></a></footer>
  </div>;
}
