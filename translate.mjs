import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Replace imports and add state
content = content.replace(
  "import { useEffect } from 'react';\nimport { initApp } from './script';",
  `import { useEffect, useState } from 'react';
import { initApp } from './script';`
);

content = content.replace(
  "export default function App() {",
  `export default function App() {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');

  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;

  const toggleLang = () => {
    const newLang = lang === 'zh' ? 'en' : 'zh';
    setLang(newLang);
    if ((window as any).setAppLanguage) {
      (window as any).setAppLanguage(newLang);
    }
  };`
);

content = content.replace(
  '<div className="hero-screen">',
  `<button 
        className="lang-toggle-btn animate-item no-grass" 
        style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 100, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-color)', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', transitionDelay: '0s' }}
        onClick={toggleLang}
      >
        {lang === 'zh' ? 'EN' : '中'}
      </button>
      <div className="hero-screen">`
);

const replacements = [
  ['多多 GemosDodo', "{t('多多 GemosDodo', 'GemosDodo')}"],
  ['的刻录石碑', "{t('的刻录石碑', 'The Engraved Stela')}"],
  ['The Engraved Stela of GemosDodo', "{t('The Engraved Stela of GemosDodo', '多多 GemosDodo 的刻录石碑')}"],
  ['交互指南 / GUIDE', "{t('交互指南 / GUIDE', 'GUIDE')}"],
  ['滚动右侧视图，或下滑探索瀑布流', "{t('滚动右侧视图，或下滑探索瀑布流', 'Scroll right view, or swipe down for waterfall')}"],
  ['点击页面空白处，种下互动小草', "{t('点击页面空白处，种下互动小草', 'Click empty space to plant grass')}"],
  ['使用左下角按钮，孵化专属牛牛', "{t('使用左下角按钮，孵化专属牛牛', 'Use bottom-left to hatch your cow')}"],
  ['点击孵化出的牛牛，查看留给多多的信', "{t('点击孵化出的牛牛，查看留给多多的信', 'Click hatched cows to view their message')}"],
  ['下滑探索全景纪事', "{t('下滑探索全景纪事', 'Scroll down to explore archive')}"],
  ['全 部 纪 事 / ARCHIVE', "{t('全 部 纪 事 / ARCHIVE', 'ARCHIVE')}"],
  ['>全部<', ">{t('全部', 'All')}<"],
  ['>作品<', ">{t('作品', 'Project')}<"],
  ['>视频<', ">{t('视频', 'Video')}<"],
  ['>获奖<', ">{t('获奖', 'Award')}<"],
  ['>教育<', ">{t('教育', 'Edu')}<"],
  ['🧬 创造专属牛牛', "🧬 {t('创造专属牛牛', 'Create Exclusive Cow')}"],
  ['牛牛实验室 MAX', "{t('牛牛实验室 MAX', 'Cow Lab MAX')}"],
  ['给它取个名字：', "{t('给它取个名字：', 'Give it a name:')}"],
  ['你想对多多说什么：', "{t('你想对多多说什么：', 'Message to Dodo:')}"],
  ['体型形状', "{t('体型形状', 'Body Shape')}"],
  ['>标准身材<', ">{t('标准身材', 'Classic')}<"],
  ['圆润肥胖', "{t('圆润肥胖', 'Chubby')}"],
  ['方方正正', "{t('方方正正', 'Boxy')}"],
  ['斑点形状', "{t('斑点形状', 'Spot Shape')}"],
  ['经典斑点', "{t('经典斑点', 'Classic')}"],
  ['爱心斑点', "{t('爱心斑点', 'Heart')}"],
  ['纯色无斑', "{t('纯色无斑', 'Plain')}"],
  ['眼睛风格', "{t('眼睛风格', 'Eye Style')}"],
  ['经典豆豆', "{t('经典豆豆', 'Normal')}"],
  ['开心笑眼', "{t('开心笑眼', 'Happy')}"],
  ['慵懒眯眯', "{t('慵懒眯眯', 'Sleepy')}"],
  ['牛角形状', "{t('牛角形状', 'Horn Style')}"],
  ['经典短角', "{t('经典短角', 'Classic')}"],
  ['弯曲长角', "{t('弯曲长角', 'Long')}"],
  ['恶魔尖角', "{t('恶魔尖角', 'Devil')}"],
  ['尾巴形状', "{t('尾巴形状', 'Tail Style')}"],
  ['经典细尾', "{t('经典细尾', 'Classic')}"],
  ['猪猪卷尾', "{t('猪猪卷尾', 'Curly')}"],
  ['闪电尾巴', "{t('闪电尾巴', 'Lightning')}"],
  ['>身体<', ">{t('身体', 'Body')}<"],
  ['>斑点<', ">{t('斑点', 'Spot')}<"],
  ['>牛角<', ">{t('牛角', 'Horn')}<"],
  ['>鼻子<', ">{t('鼻子', 'Nose')}<"],
  ['>四肢<', ">{t('四肢', 'Legs')}<"],
  ['>牛蹄<', ">{t('牛蹄', 'Hoof')}<"],
  ['>尾巴<', ">{t('尾巴', 'Tail')}<"],
  ['>眼睛<', ">{t('眼睛', 'Eye')}<"],
  ['立即孵化！', "{t('立即孵化！', 'Hatch Now!')}"],
  ['牛牛的名字', "{t('牛牛的名字', 'Name')}"],
  ['这里是留给多多的话...', "{t('这里是留给多多的话...', 'Message...')}"],
  ['管理员验证', "{t('管理员验证', 'Admin Login')}"],
  ['>账号<', ">{t('账号', 'User')}<"],
  ['>密码<', ">{t('密码', 'Pass')}<"],
  ['登录控制台', "{t('登录控制台', 'Login')}"],
  ['控制台面板', "{t('控制台面板', 'Panel')}"],
  ['➕ 添加作品纪事 (含瀑布流配图)', "{t('➕ 添加作品纪事 (含瀑布流配图)', '➕ Add Post')}"],
  ['>分类<', ">{t('分类', 'Category')}<"],
  ['>日期<', ">{t('日期', 'Date')}<"],
  ['>标题<', ">{t('标题', 'Title')}<"],
  ['>描述<', ">{t('描述', 'Description')}<"],
  ['封面图片 URL', "{t('封面图片 URL', 'Cover URL')}"],
  ['双端同步发布', "{t('双端同步发布', 'Publish')}"],
  ['🐄 生态管理 (活跃牛牛)', "{t('🐄 生态管理 (活跃牛牛)', '🐄 Ecology (Active Cows)')}"],
  ['defaultValue="多多的牛"', 'key={lang} defaultValue={t("多多的牛", "Dodo\'s Cow")}'],
  ['placeholder="写下你想留给多多的一句话..."', 'placeholder={t("写下你想留给多多的一句话...", "Write your message to Dodo...")}'],
  ['placeholder="如: 2024.11"', 'placeholder={t("如: 2024.11", "e.g. 2024.11")}'],
  ['placeholder="输入纪事标题"', 'placeholder={t("输入纪事标题", "Title")}'],
  ['placeholder="简短描述..."', 'placeholder={t("简短描述...", "Desc...")}'],
  ['placeholder="不填则自动生成占位图"', 'placeholder={t("不填则自动生成占位图", "Leave empty for placeholder")}'],
];

for (const [zh, en] of replacements) {
    // avoid double replacing the key
    if (content.indexOf(zh) !== -1) {
        content = content.replaceAll(zh, en);
    }
}

fs.writeFileSync('src/App.tsx', content, 'utf-8');
console.log('App.tsx updated');
