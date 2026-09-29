<p align="center">
  <img src="./docs/assets/gemos-banner.jpg" alt="GemosDodo — 多多的创作空间" width="100%" />
</p>

<h1 align="center">GemosDodo</h1>

<p align="center"><strong>把经历、想象和研究，慢慢做成作品。</strong></p>

<p align="center">一个持续生长的个人作品空间。这里有设计档案，也有可以亲手试一试的小世界。</p>

<p align="center">
  <a href="https://gemosdodo.art"><strong>走进网站 ↗</strong></a>　·　
  <a href="https://gemosdodo.art/vibecoding-projects/still-memory-box/index.html">体验 Gemos Still ↗</a>　·　
  <a href="https://gemosdodo.art/gemos-still/">了解 Mac 版 ↗</a>
</p>

<p align="center"><code>React 19</code>　<code>TypeScript 5</code>　<code>Vite 6</code>　<code>Express</code></p>

---

**阅读路线**　[探索网站](#探索网站) · [本地运行](#本地运行) · [代码地图](#代码地图) · [数据与权限](#数据与权限) · [发布与维护](#发布与维护)

## 探索网站

| 作品与记录 | 互动与实验 | 研究与协作 |
| :--- | :--- | :--- |
| 作品时间线、奖状、作品集和手账，记录创作从想法到成品的过程。 | 在牛牛牧场放慢脚步；进入浏览器实验，亲自触碰影像与空间。 | 毕业设计工作台、资料库与可批注的报告，让研究过程也成为可阅读的作品。 |

### 作品与日常

- **[首页](https://gemosdodo.art/)** `/` — 个人介绍、作品时间线与详情。桌面和手机拥有各自的首页呈现。
- **[奖状](https://gemosdodo.art/awards)** `/awards` — 奖项、证书与关联作品。
- **[作品集](https://gemosdodo.art/pdfs)** `/pdfs` · **[手账](https://gemosdodo.art/journal)** `/journal` — 可搜索、筛选、分享；PDF 可以在站内阅读。

### 可以玩的地方

- **[浏览器实验](https://gemosdodo.art/vibecoding)** `/vibecoding` — 高斯泼溅查看器、黑洞编辑器、Gemos Still 等作品。每个实验都有稳定的 `/vibecoding/:slug` 分享入口。
- **[牛牛牧场](https://gemosdodo.art/pasture)** `/pasture` — 投喂、种花、切换天气与昼夜；牛牛会自主散步、休息、寻食和入睡。
- **隐藏互动页** `/pingpong` · `/tucao` — 联机乒乓与共享吐槽间，首页没有常规入口。
- **[Gemos Still](https://gemosdodo.art/gemos-still/)** `/gemos-still/` — 记忆盒子的产品介绍与 Mac 版下载；网页版作为独立静态实验托管。

### 研究与管理

- **毕业设计** `/graduation` · `/graduation/research` · `/graduation/review` — 研究工作台、资料库、报告版本和分版本批注。
- **提案** `/proposal` — PDF 阅读与实时同步批注。
- **后台** `/admin` — 内容编辑、上传、访客统计及存储检查。
- **私人文件中转站** `/transfer/` — 管理口令登录、分块上传、到期清理。

> [!NOTE]
> 展示内容的主要界面支持中英切换；部分毕业设计研究内容目前以中文为主。牧场中的投喂、种花与贴贴只保留在本次访问中。

## 本地运行

需要 Node.js 20 或更新版本与 npm。在仓库目录执行：

```bash
npm ci
cp .env.example .env.local
# 编辑 .env.local：使用后台时，将 ADMIN_SECRET 改为自己的强口令
npm start
```

打开 **[localhost:3000](http://localhost:3000)**。这个命令同时启动 Vite 前端（`:3000`）和 Express 后端（`:3001`）；也可以分别运行 `npm run dev` 与 `npm run server`。

只浏览公开页面时，可以从 `.env.local` 删除示例 `ADMIN_SECRET`，后台接口会保持关闭。不要沿用示例口令。本地内容取决于本机的 JSON 与上传文件；新检出的仓库可以没有作品数据，实验列表则可由仓库种子初始化。

<details>
<summary><strong>检查与构建命令</strong></summary>

```bash
npm run lint                       # TypeScript 类型检查
npm run build                      # 生产构建
node --test tests/*.test.mjs       # Node 服务与部署辅助脚本测试
python3 tests/deploy.test.py       # 部署流程测试
```

`.env.example` 列出主要环境变量。示例中的 `MAX_UPLOAD_MB` 为 10 MB；设为 0 时不启用统一上传大小限制，但 PDF、时间线视频及代理仍有各自的限制。`MAX_REQUEST_MB` 控制 JSON 请求体大小。

</details>

## 代码地图

```text
src/main.tsx
   └─ src/App.tsx                 页面选择、语言与布局
      ├─ src/script.ts            桌面首页的时间线与详情交互
      ├─ src/mobile/              手机首页、奖状与媒体阅读
      ├─ src/collections/         作品集、实验、手账的共享浏览界面
      ├─ src/pasture/             牛牛形象与行为模拟
      ├─ src/research/            毕业设计资料与报告
      └─ src/AdminStudio.tsx      内容后台

server.js                         Express API 与 WebSocket 入口
   ├─ server/                    报告批注、中转站、视频处理等模块
   ├─ *.json                     服务器本地内容与状态
   └─ uploads/                   图片、PDF、视频等长期媒体

public/                           静态页面与实验资源
docs/                             设计记录和运维说明
```

前端使用 React Router，但页面由 `src/App.tsx` 根据 `location.pathname` 分发，没有 `<Routes>` 配置表。布局检测只有 `phone` 与 `desktop` 两档：窄屏首页和奖状页走独立的 `MobileSite`；作品集、实验和手账共用响应式 `CollectionPage`。桌面首页还保留了 `script.ts` 的原生 DOM 交互。

数据请求从浏览器进入 `/api`，由 Express 读写 JSON；上传媒体保存在 `uploads/`。开发时 Vite 将 `/api`、`/uploads` 和实时连接代理至后端。提案、乒乓与吐槽间分别使用 `/api/proposal/live`、`/api/pingpong/live`、`/api/tucao/live`。

## 数据与权限

这个项目不使用数据库。**仓库种子、服务器运行数据和用户上传文件有不同的生命周期。**

| 数据 | 保存位置 |
| :--- | :--- |
| 作品时间线、牛牛、奖状、PDF、手账、资源记录 | `data.json`，Git 忽略 |
| 实验项目 | `vibecoding-projects.json` 是仓库种子；实际修改写入 Git 忽略的 `vibecoding-projects.runtime.json` |
| 访客统计、吐槽间、报告版本与批注 | `visitor_stats.json`、`tucao-room.json`、`.graduation-review/`，Git 忽略 |
| 上传媒体、临时私人文件 | `uploads/`、`.transfer-storage/`，Git 忽略且彼此隔离 |
| 提案批注 | `proposal-annotations.json`，**目前仍受 Git 跟踪** |

后台的时间线、资源、奖状、PDF、手账、实验项目、访客统计和存储接口使用 `ADMIN_SECRET`。验证接口限制连续失败尝试；后台在当前标签页的 `sessionStorage` 保存已验证口令，以便继续编辑。

> [!IMPORTANT]
> 接口权限不能只按路径或 HTTP 方法判断。`POST /api/cows`、`DELETE /api/cows/:id` 和 `PUT /api/proposal/annotations` 当前没有管理员口令中间件。毕业设计主页的入口口令也只控制导航：持链接者可以直接打开报告页面，编辑最新版并添加批注；保存使用版本冲突检查，撤销批注需要创建时的浏览器凭据。

`/api/transfer` 使用管理口令换取 24 小时的 HttpOnly 会话 Cookie，完成上传的文件保留五天。常用公开读取接口包括 `GET /api/data`、`/api/awards`、`/api/pdfs`、`/api/journals` 与 `/api/vibecoding`。完整接口以 `server.js` 和 `server/` 中的路由为准。

## 发布与维护

`npm run deploy "提交说明"` 会暂存、提交并推送 `main`，触发网站发布；执行前请检查改动。服务器上的 `autodeploy.sh` 默认每 45 秒检查一次。`deploy.sh` 使用共享锁，备份小型运行 JSON，安装锁定依赖，并在独立目录构建。替换 `dist` 和重启 PM2 后，它会核对实际提供的 `deployment.json`，再写入成功标记；发布不会清理 `uploads/`。

> [!WARNING]
> `proposal-annotations.json` 目前由接口写入，同时受 Git 跟踪。若服务器上的批注使它产生改动，部署脚本会拒绝覆盖该文件。处理部署冲突前，先检查并保存线上批注；不要用本地空数据替换运行内容。

线上数据可能与仓库种子不同。发布后还应核对公开 HTTPS 页面及关键交互。详见 [服务器维护说明](docs/server-operations.md)。

## 延伸阅读

[手机端设计](docs/mobile_redesign.md) · [作品集与手账](docs/collection_refresh.md) · [牛牛牧场](docs/pasture_redesign.md) · [报告与批注](docs/graduation-review.md) · [私人中转站](docs/transfer-station.md)

---

<p align="center">
  <img src="./docs/assets/gemos-avatar.png" alt="多多 Gemos" width="72" />
</p>

<p align="center"><sub>Made with 🧡 by 多多 Gemos</sub></p>
