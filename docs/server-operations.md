# 服务器维护与自动部署

已有 SSH 连接记录位于项目上一级 `.workbuddy/memory/MEMORY.md`；现有密钥位于同级 `.ssh_keys/gemosdodo_ed25519`（不得提交密钥）。按记录使用 admin 登录并通过免密 sudo 执行维护，无须新建凭据。

已核实生产路径 `/www/wwwroot/gemosdodoweb`，Nginx 根目录为该目录下 `dist`，PM2 网站进程 `gemosdodoweb-site` 的脚本为 `server.js`，自动部署进程为 `gemosdodoweb-autodeploy`。

2026-09-13 故障：PM2 自动部署仍 online，但拉取持续被服务器本地修改的 `vibecoding-projects.json` 阻止。服务器读取实验列表时会规范化并写回入口地址，删去入口查询参数；文件又受 Git 跟踪，和远端更新相撞。服务器停留在 `4a2a7aa`，GitHub 已到 `8572a00`。现场 fetch 成功、磁盘约 20 GB 可用，失败发生在安装和构建之前。目录锁当时有真实上传备份任务持有，不能直接删锁。

修复：实验运行数据写入忽略的 `vibecoding-projects.runtime.json`，仓库 `vibecoding-projects.json` 仅在运行文件缺失时作为初始数据。服务器迁移时必须先备份并复制现有线上列表到运行文件，绝不能用本地测试数据覆盖。后续管理实验内容使用后台/API；仅修改种子文件不会覆盖已有线上列表。

自动部署与手动部署共用 `flock`；旧目录锁必须在确认旧部署和复制进程均退出后处理。fetch、依赖安装与构建都有超时和可见错误。以 `.deploy-state/deployed-commit` 和 `dist/deployment.json` 判断已成功发布版本，构建失败后即使 HEAD 已更新仍会重试。依赖使用 npm ci，防止安装改写 lockfile。

构建在 `.deploy-state` 的独立目录完成，再替换 dist。保留上一版 dist 和小型 JSON 快照供回退；不复制或清理 uploads，也不清理已有备份或修改服务配置。磁盘不足 1 GiB 时明确报错停止；历史构建占用需维护人员按确认的保留策略另行管理。服务必须已存在且 PM2 路径与仓库一致。成功标记仅在本机服务实际返回相同提交后写入。

本地部署 GUI 核对公开 `/deployment.json` 的提交号，不再把任意 HTTP 200 当成新版上线。发布完成仍须核验真实 HTTPS 页面资源及用户交互，不能仅看 git pull 或 PM2 状态。

回归检查：`python3 tests/deploy.test.py` 验证构建失败重试、fetch 失败、锁争用/旧锁、磁盘不足和数据不变；`node --test tests/runtime-data.test.mjs` 验证种子不被写回、现有与空的运行列表均保留。
