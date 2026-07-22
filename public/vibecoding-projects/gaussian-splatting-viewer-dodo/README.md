# Gaussian Splatting Viewer

这是一个精简后的本地 Gaussian Splatting 查看与编辑工具。

## 入口

- `veiw.html`: 主预览与编辑页面
- `server.js`: 本地静态文件服务器
- `一键打开查看器.lnk`: 带 logo 的一键启动器，双击后自动启动服务器并打开查看器
- `一键打开查看器.cmd`: 一键启动脚本，供快捷方式调用
- `start_server.cmd` / `run_server_8080.cmd`: 启动本地服务器

启动后访问:

```text
http://127.0.0.1:8080/veiw.html
```

也可以直接访问根地址:

```text
http://127.0.0.1:8080/
```

## 功能

- 导入 `.ply` / `.splat` / `.ksplat`
- 调整 FOV、景深、高斯大小、模型坐标系和参考辅助
- 记录、更新、删除相机关键帧
- 播放飞行动画和编辑时间线
- 单张截图与序列渲染
- 保存、读取、导入、导出工程 JSON

## 保留文件

- `veiw.html`
- `default_scene_sh2.ksplat`
- `GaussianSplats3D-src/build/gaussian-splats-3d.module.js`
- `GaussianSplats3D-src/build/demo/lib/three.module.js`
- `server.js`
- `start_server.cmd`
- `run_server_8080.cmd`
- `assets/launcher-logo.png`
- `assets/launcher-logo.ico`
- `assets/gemos-dodo-logo.png`
