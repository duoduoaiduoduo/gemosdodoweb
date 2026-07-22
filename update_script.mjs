import fs from 'fs';

let content = fs.readFileSync('src/script.ts', 'utf-8');

// Add global language state
content = content.replace(
  'let initialized = false;',
  `window.currentLang = 'zh';\nwindow.currentFilterCode = 'all';\n\nwindow.setAppLanguage = (lang) => {\n  window.currentLang = lang;\n  initTimelineData();\n  renderTimeline(window.currentFilterCode);\n  updatePreview();\n  if (document.getElementById('adminModal')?.classList.contains('active')) {\n    refreshAdminCowList();\n  }\n};\n\nlet initialized = false;`
);

// Update getCategoryLabel
content = content.replace(
  "function getCategoryLabel(cat) { const map = { 'project': '作品', 'video': '视频', 'award': '获奖', 'edu': '教育' }; return map[cat] || '记录'; }",
  `function getCategoryLabel(cat) { 
        const isEn = window.currentLang === 'en';
        const map = isEn 
            ? { 'project': 'Project', 'video': 'Video', 'award': 'Award', 'edu': 'Edu' }
            : { 'project': '作品', 'video': '视频', 'award': '获奖', 'edu': '教育' }; 
        return map[cat] || (isEn ? 'Record' : '记录'); 
    }`
);

// Update timeline data
const tlReplacement = `titleEn: 'Digital Interactive Portfolio Launched', descEn: 'Built this digital stela with Three.js and 3D space computation.',`;
content = content.replace(
    `title: '数字互动作品集上线', \n            desc: '使用 Three.js 与 3D 空间计算，搭建了这座结合视觉透视与高级感排版的数字刻录石碑。',`,
    `title: '数字互动作品集上线', titleEn: 'Digital Interactive Portfolio Launched', \n            desc: '使用 Three.js 与 3D 空间计算，搭建了这座结合视觉透视与高级感排版的数字刻录石碑。', descEn: 'Built this digital stela with Three.js and 3D space computation, featuring visual perspective and premium typography.',`
);
content = content.replace(
    `title: '「代码与诗」个人Vlog发布', \n            desc: '记录了我在开发这个互动网站期间的心路历程，探讨了数字艺术与人类情感的连接边界。',`,
    `title: '「代码与诗」个人Vlog发布', titleEn: '"Code and Poetry" Vlog Released', \n            desc: '记录了我在开发这个互动网站期间的心路历程，探讨了数字艺术与人类情感的连接边界。', descEn: 'Documented my journey developing this interactive site, exploring the boundary between digital art and human emotion.',`
);
content = content.replace(
    `title: '腾讯前端开发实习', \n            desc: '参与核心业务的用户界面重构工作，优化了动画渲染性能，提升了数十万用户的交互体验。',`,
    `title: '腾讯前端开发实习', titleEn: 'Tencent Frontend Internship',\n            desc: '参与核心业务的用户界面重构工作，优化了动画渲染性能，提升了数十万用户的交互体验。', descEn: 'Participated in UI refactoring for core business, optimizing animation performance and enhancing experience for thousands of users.',`
);
content = content.replace(
    `title: '数字艺术设计大赛一等奖', \n            desc: '作品《赛博放牧人》获得评审团一致好评，探索了虚拟世界中人工智能生命的游牧状态。',`,
    `title: '数字艺术设计大赛一等奖', titleEn: 'Digital Art Design First Prize', \n            desc: '作品《赛博放牧人》获得评审团一致好评，探索了虚拟世界中人工智能生命的游牧状态。', descEn: 'My piece "Cyber Herder" received unanimous praise from the jury, exploring the nomadic state of AI life in the virtual world.',`
);
content = content.replace(
    `title: '踏入计算机科学殿堂', \n            desc: '进入大学，开始系统学习编程与计算机图形学，写下第一行 Hello World，开启了数字创造之旅。',`,
    `title: '踏入计算机科学殿堂', titleEn: 'Entering Computer Science',\n            desc: '进入大学，开始系统学习编程与计算机图形学，写下第一行 Hello World，开启了数字创造之旅。', descEn: 'Started college and systematically learned programming and computer graphics, writing my first Hello World.',`
);
content = content.replace(
    `title: '极简主义的启蒙', \n            desc: '首次接触包豪斯与现代主义设计理念，奠定了“少即是多”的个人视觉美学基础。',`,
    `title: '极简主义的启蒙', titleEn: 'Minimalism Enlightenment', \n            desc: '首次接触包豪斯与现代主义设计理念，奠定了“少即是多”的个人视觉美学基础。', descEn: 'First encounter with Bauhaus and modernist design concepts, laying the personal aesthetic foundation of "less is more".',`
);

// Map blocks
content = content.replace(/content: '这个项目旨在探索网页交互的边界，将传统的2D浏览体验转化为3D空间中的探索。我希望通过这种方式，让每一个访问者都能感受到数字艺术的魅力。'/g, "content: '这个项目旨在探索网页交互的边界，将传统的2D浏览体验转化为3D空间中的探索。我希望通过这种方式，让每一个访问者都能感受到数字艺术的魅力。', contentEn: 'This project aims to explore the boundaries of web interaction, transforming traditional 2D browsing into 3D spatial exploration.'");
content = content.replace(/caption: '主视觉设计与空间透视'/g, "caption: '主视觉设计与空间透视', captionEn: 'Main Visual Design and Spatial Perspective'");
content = content.replace(/content: '在视觉排版上，我大量参考了瑞士国际主义风格，强调网格、留白与无衬线字体的力量。同时结合了现代的毛玻璃效果与深色模式，营造出一种“数字刻录石碑”的神秘感与高级感。'/g, "content: '在视觉排版上，我大量参考了瑞士国际主义风格，强调网格、留白与无衬线字体的力量。同时结合了现代的毛玻璃效果与深色模式，营造出一种“数字刻录石碑”的神秘感与高级感。', contentEn: 'In visual typography, I heavily referenced the Swiss International Style, emphasizing grids, negative space, and sans-serif fonts.'");
content = content.replace(/content: '视频记录了从灵感诞生到代码实现的整个过程。在这个过程中，我不断思考技术与艺术的交汇点。'/g, "content: '视频记录了从灵感诞生到代码实现的整个过程。在这个过程中，我不断思考技术与艺术的交汇点。', contentEn: 'The video documents the entire process from inspiration to code implementation.'");
content = content.replace(/caption: '视频封面截图'/g, "caption: '视频封面截图', captionEn: 'Video Cover Screenshot'");
content = content.replace(/content: '在实习期间，我主要负责核心业务模块的性能优化与UI重构。通过引入虚拟列表和优化重绘逻辑，使得页面帧率提升了40%。'/g, "content: '在实习期间，我主要负责核心业务模块的性能优化与UI重构。通过引入虚拟列表和优化重绘逻辑，使得页面帧率提升了40%。', contentEn: 'During my internship, I optimized performance and refactored UI, increasing frame rate by 40%.'");
content = content.replace(/content: '《赛博放牧人》是一个关于AI生命形态的交互艺术装置。观众可以通过手势控制虚拟空间中的“电子羊群”。'/g, "content: '《赛博放牧人》是一个关于AI生命形态的交互艺术装置。观众可以通过手势控制虚拟空间中的“电子羊群”。', contentEn: 'Cyber Herder is an interactive art installation about AI life forms. Viewers can control the electronic flock via gestures.'");
content = content.replace(/caption: '展览现场记录'/g, "caption: '展览现场记录', captionEn: 'Exhibition Record'");
content = content.replace(/content: '大学的计算机图形学课程为我打开了新世界的大门，让我意识到代码不仅可以处理逻辑，还可以创造视觉奇观。'/g, "content: '大学的计算机图形学课程为我打开了新世界的大门，让我意识到代码不仅可以处理逻辑，还可以创造视觉奇观。', contentEn: 'College graphics courses opened a new world for me, making me realize code can create visual spectacles.'");
content = content.replace(/content: '包豪斯的设计理念深刻影响了我的审美。我开始在设计中去除不必要的装饰，专注于功能与形式的统一。'/g, "content: '包豪斯的设计理念深刻影响了我的审美。我开始在设计中去除不必要的装饰，专注于功能与形式的统一。', contentEn: 'Bauhaus design concepts deeply influenced my aesthetics. I started removing unnecessary decorations and focusing on form-function unity.'");
content = content.replace(/caption: '早期设计练习作品'/g, "caption: '早期设计练习作品', captionEn: 'Early Design Practices'");

// openDetailModal
content = content.replace(
  "document.getElementById('detailTitle').textContent = item.title;",
  `document.getElementById('detailTitle').textContent = window.currentLang === 'en' ? (item.titleEn || item.title) : item.title;`
);

content = content.replace(
  "p.innerHTML = block.content;",
  "p.innerHTML = window.currentLang === 'en' ? (block.contentEn || block.content) : block.content;"
);

content = content.replace(
  "const p = document.createElement('div');\\s*p.className = 'rich-text';\\s*p.textContent = item.desc;",
  "const p = document.createElement('div');\\n            p.className = 'rich-text';\\n            p.textContent = window.currentLang === 'en' ? (item.descEn || item.desc) : item.desc;"
);

// We should use regex properly
content = content.replace(
  /p\.textContent = item\.desc;/g,
  "p.textContent = window.currentLang === 'en' ? (item.descEn || item.desc) : item.desc;"
);

content = content.replace(
  /<img src="\${block\.url}" class="rich-image" alt="\${block\.caption || ''}" loading="lazy" \/>\\s*\${block\.caption \? `<div class="rich-caption">\${block\.caption}<\/div>` : ''}/g,
  `<img src="\${block.url}" class="rich-image" alt="\${window.currentLang === 'en' ? (block.captionEn || block.caption || '') : (block.caption || '')}" loading="lazy" />
                        \${block.caption ? \`<div class="rich-caption">\${window.currentLang === 'en' ? (block.captionEn || block.caption) : block.caption}</div>\` : ''}`
);

// initTimelineData
content = content.replace(
  /<div class="roller-title">\${item\.title}<\/div>\\s*<div class="roller-desc">\${item\.desc}<\/div>/g,
  `<div class="roller-title">\${window.currentLang === 'en' ? (item.titleEn || item.title) : item.title}</div>
                <div class="roller-desc">\${window.currentLang === 'en' ? (item.descEn || item.desc) : item.desc}</div>`
);

// renderMasonry
content = content.replace(
  /<div class="masonry-card-title">\${item\.title}<\/div>\\s*<div class="masonry-card-desc">\${item\.desc}<\/div>/g,
  `<div class="masonry-card-title">\${window.currentLang === 'en' ? (item.titleEn || item.title) : item.title}</div>
                    <div class="masonry-card-desc">\${window.currentLang === 'en' ? (item.descEn || item.desc) : item.desc}</div>`
);

// filterTimeline
content = content.replace(
  /function filterTimeline\(filterType, element\) {/,
  `function filterTimeline(filterType, element) {
        window.currentFilterCode = filterType;`
);

// Cows logic
content = content.replace(
  /this\.message = message \|\| "这只牛牛很害羞，只留下了一个脚印，什么也没说。";/,
  `this.message = message || (window.currentLang === 'en' ? "This cow is shy and just left a footprint." : "这只牛牛很害羞，只留下了一个脚印，什么也没说。");`
);

content = content.replace(
  /document\.getElementById\('msgDialogName'\)\.innerText = `\$\{name\} 留下的信`;/,
  `document.getElementById('msgDialogName').innerText = (window.currentLang === 'en' ? \`\$\{name\}'s Message\` : \`\$\{name\} 留下的信\`);`
);

content = content.replace(
  /document\.getElementById\('msgDialogTime'\)\.innerText = `孵化于 \$\{this\.createdAt\}`;/,
  `document.getElementById('msgDialogTime').innerText = (window.currentLang === 'en' ? \`Hatched at \$\{this.createdAt\}\` : \`孵化于 \$\{this.createdAt\}\`);`
);

content = content.replace(
  /getVal\('cowNameInput'\) \|\| '未知牛牛'/,
  `getVal('cowNameInput') || (window.currentLang === 'en' ? 'Unknown Cow' : '未知牛牛')`
);

content = content.replace(
  /getVal\('cowNameInput'\) \|\| '无名牛'/,
  `getVal('cowNameInput') || (window.currentLang === 'en' ? 'Nameless Cow' : '无名牛')`
);

content = content.replace(
  /if\(cows\.length === 0\) \{ list\.innerHTML = '<div style="color:#999; text-align:center; padding:10px;">当前没有活跃的牛牛<\/div>'; return; \}/,
  `if(cows.length === 0) { list.innerHTML = '<div style="color:#999; text-align:center; padding:10px;">' + (window.currentLang === 'en' ? 'No active cows' : '当前没有活跃的牛牛') + '</div>'; return; }`
);

content = content.replace(
  />放生<\/button>/,
  `>\${window.currentLang === 'en' ? 'Release' : '放生'}<\/button>`
);

content = content.replace(
  /alert\('身份验证失败！'\);/,
  `alert(window.currentLang === 'en' ? 'Auth failed!' : '身份验证失败！');`
);

content = content.replace(
  /alert\('发布成功！上方滚筒与下方瀑布流均已同步更新。'\);/,
  `alert(window.currentLang === 'en' ? 'Published successfully!' : '发布成功！上方滚筒与下方瀑布流均已同步更新。');`
);

fs.writeFileSync('src/script.ts', content, 'utf-8');
console.log('Script updated');
