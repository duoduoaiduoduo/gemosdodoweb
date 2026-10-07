# 独立照片空间重建依赖

这一目录从 `public/vibecoding-projects/still-memory-box/browser-inference/`
复制必要推理代码与 ONNX Runtime，供毕业设计原型使用。原作品没有修改。
无需原作 UI、示例空间、IndexedDB 记忆库、播放器或影片编码器。

入口为上一级的上一级 `reconstruction.js`。提供：

- `probeReconstruction({mode,signal})`：检测模式、完整缓存和首次模型体积，
  不下载 ONNX 模型、不初始化推理会话。`mode` 为 `auto`、`desktop` 或 `lite`。
- `reconstructPhoto(blob,{mode,confirmDownload,signal,onStatus,onProgress})`：
  缓存完整时直接本地重建；缓存不全且未收到 `confirmDownload:true` 时，
  抛出 `MODEL_DOWNLOAD_CONFIRMATION_REQUIRED` 并附带 `error.probe`。
  页面须先向用户显示体积，取得一次主动确认，再传入这个参数。
  Worker 同样拦截未经确认的模型下载，防止缓存变化绕过确认。
- `unpackStill(blob)`、`packStill(record)`：兼容原 Web / Mac / Android
  的 STLL v1 文件，不修改原作品的 IndexedDB。
- `validateGaussianBuffer(buffer)`：检查最少 100 个粒子、64 字节记录、
  有限数值及有效不透明度和协方差对角线。

`onStatus(text,event)` 接收阶段提示。`onProgress({loaded,total,ratio,phase})`
接收模型下载字节进度。成功返回
`{buffer:ArrayBuffer,method:'sharp-webgpu'|'sharp-lite-wasm',gaussianCount,hasPhotoUV:true}`。
导入文件的返回值另含 `photo`、`metadata`、`settings`，方法为 `still-import`。
新空间在每条 64 字节记录的 float[11]、float[15] 中存入原照片 U、V。
按照 SHARP composer 与 NDC 相机约定，U=0.5+mean_x/(2*mean_z)、
V=0.5+mean_y/(2*mean_z)，V 从原图顶部 0 到底部 1；坐标来自模型
学习后的真实视线投影，不由缩放后的场景边界反推。学习偏移可能产生
边缘范围外的有限 UV；转换时丢弃投影中心超出照片范围的粒子，保留
照片内准确坐标，不将越界视线钳制到边缘。剩余粒子不足 100 时仍报错。
`packStill` 将 `hasPhotoUV` 保存在 JSON 元数据中，旧文件缺失时导入
返回 false，不能将旧空槽误作照片坐标。
进度到 100% 只代表模型文件下载完成，后面仍有初始化与真实推理。
完成、失败及取消时专用 Worker 均会终止。页面应在初始化和推理时暂停
其他昂贵渲染，并提示保持前台。

## 模型资源与实现

支持 WebGPU `shader-f16` 的浏览器采用原 1536×1536 FP16 SHARP
管线，固定社区转换版本 `1a426c9ac9394d2490ad4c78f8422c42771042a1`。
首次模型文件合计 1,315,309,892 字节，优先镜像线路、失败后尝试
Hugging Face。预处理使用浏览器 Canvas 与 30mm 等效焦距估计。

其他支持 Worker、WebAssembly 和 OPFS 的浏览器采用实验性的
256×256 CPU Lite 管线。两文件合计 808,585,157 字节，最多 32,768
个 Gaussian；逐步下载、Range 续传及 SHA-256 校验成功后才标记缓存。
它降低分辨率与细节，CPU 初始化和推理可能需要数分钟或因设备内存不足失败。
浏览器成功不能仅凭演示渲染或原生 APK 的成功推断。

大模型保留在外部模型源或本站固定目录
`/models/gemos-still-lite-v1/`，不复制进 Git 或应用构建。
2026-10-07 对真实站点的 HEAD 检查确认：两文件均为 HTTP 200，
Content-Length 分别为 9,033,925 和 799,551,232，支持 byte ranges，
二进制 MIME 与一年 immutable 缓存。检查没有下载模型内容。

照片只在本机解码与推理；模型下载向站点或模型提供者发请求，
请求不包含照片。算法是单张照片空间估计，不提供隐藏表面实测、
化学成分、污染浓度或风险检测。不存在用示例结果替代失败推理的逻辑。

本副本共享同源、同固定版本的 OPFS 模型缓存名称，以避免重复下载；
这不会访问原作品的照片记忆库。Worker 和下载代码增加明确的下载
授权参数；转换代码在原空槽增加照片 UV，其余推理、协方差转换、
科学模型与校验流程保留原实现。

## 授权与验证

独立应用代码沿用上层 `LICENSE` 中的 MIT 授权。模型、运行时和
SHA-256 实现保留 `licenses/` 下各自许可；Apple SHARP 模型及衍生
权重仍受其研究模型许可约束，应用 MIT 不包含这些模型权重。

已检查 JavaScript 语法、静态依赖闭合，以及现有 Mac-test.still 和
Web-roundtrip.still 的导入—导出往返（650,000 粒子，照片与模型字节
保持一致）；已检查非法长度与 NaN 被拒绝。CLI 中的格式测试不代表
真实浏览器成功运行整套模型。浏览器完整下载、推理和设备稳定性仍需
获得浏览器控制权限后实测；此实现没有借其他浏览器绕过权限。
