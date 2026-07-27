<div align="center">

<img src="./docs/assets/gemos-banner.jpg" alt="Gemos" width="820" />

<br/>

<img src="./docs/assets/gemos-wordmark.png" alt="Gemos" width="260" />

### 多多 Gemos 的个人作品与创作空间

一个由代码、设计与想象力搭起来的地方 —— 记录作品、奖项、手账、实验与那些天马行空的小玩意。

<a href="https://gemosdodo.art"><img src="https://img.shields.io/badge/在线访问-gemosdodo.art-E07B00?style=for-the-badge&labelColor=1a1440" alt="在线访问" /></a>
&nbsp;
<img src="https://img.shields.io/badge/React-19-1a1440?style=for-the-badge&logo=react&logoColor=61DAFB&labelColor=1a1440" alt="React 19" />
&nbsp;
<img src="https://img.shields.io/badge/Vite-6-1a1440?style=for-the-badge&logo=vite&logoColor=E07B00&labelColor=1a1440" alt="Vite 6" />
&nbsp;
<img src="https://img.shields.io/badge/TypeScript-5-1a1440?style=for-the-badge&logo=typescript&logoColor=3178C6&labelColor=1a1440" alt="TypeScript" />

</div>

---

## ✦ 这是什么

**Gemos（多多）个人网站** —— 不是模板，不是脚手架，而是一个真正在跑的个人创作站点，线上地址 **[gemosdodo.art](https://gemosdodo.art)**。

从一个想法开始，用 React 一点点手写出来：中英双语、桌面 / 平板 / 手机三套布局自适应，暖橘配色贯穿始终。这里既是作品陈列馆，也是可以随手记录、随手玩的地方。

<div align="center">
<img src="./docs/assets/gemos-avatar.png" alt="Gemos Avatar" width="150" />
</div>

## ✦ 有些什么

| 板块 | 路径 | 说明 |
| :-- | :-- | :-- |
| 🏠 **首页** | `/` | 粒子背景 + 时间线，桌面/手机各一套布局 |
| 🏆 **奖状墙** | `/awards` | 一路走来的奖项与荣誉 |
| 🖼️ **作品集** | `/pdfs` | 设计 / 文档作品，内置 PDF 阅读器 |
| 📔 **手账** | `/journal` | 随手记录的日常与灵感碎片 |
| 🧪 **浏览器实验展厅** | `/vibecoding` | 用代码写成的可分享互动实验（如黑洞编辑器、高斯泼溅查看器） |
| 🐮 **牛牛牧场** | `/pasture` | 实时模拟小世界：牛会自己漫步、能撒草料投喂、昼夜天气循环 |
| 📄 **提案** | `/proposal` | 可批注的提案 PDF |
| ⚙️ **后台** | `/admin` | 内容管理（作品/时间线/奖项/手账等） |

## ✦ 技术栈

- **前端** — React 19 · React Router 7 · Vite 6 · Tailwind CSS 4 · TypeScript
- **后端** — Express（RESTful API，JSON 文件持久化，无数据库）
- **动效** — Motion，配合手写的 rAF 实时模拟（牛牛牧场）
- **其他** — 图片上传（multer）、访客地域统计（ip2region）、PDF 渲染（pdf.js）
- **部署** — PM2 + Nginx，Git push 触发服务器自动构建部署

## ✦ 本地运行

**环境要求：** Node.js 18+

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（复制 .env.example 为 .env.local）
#    GEMINI_API_KEY  —— Gemini API Key
#    ADMIN_SECRET    —— 后台写接口的密钥
#    MAX_UPLOAD_MB   —— 图片上传上限（默认 10）

# 3. 启动
npm run dev      # 前端开发服务器（:3000）
npm run server   # 后端 API（:3001）
npm start        # 前后端一起起

# 构建
npm run build
```

## ✦ 目录一览

```
gemosdodoweb/
├─ src/                    前端源码
│  ├─ App.tsx              主壳 + 路由
│  ├─ AdminStudio.tsx      后台管理
│  ├─ AwardsPage.tsx       奖状墙
│  ├─ PdfsPage.tsx         作品集
│  ├─ JournalPage.tsx      手账
│  ├─ VibecodingPage.tsx   浏览器实验展厅
│  ├─ PasturePage.tsx      牛牛牧场（实时模拟）
│  ├─ ProposalPdfPage.tsx  提案
│  └─ index.css            全站样式
├─ server.js               Express 后端
├─ public/                 静态资源
└─ docs/                   文档
```

---

<div align="center">

**Made with 🧡 by 多多 Gemos**

[gemosdodo.art](https://gemosdodo.art)

</div>
