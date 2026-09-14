import './still-case.css';

export const STILL_WORK_ID = 'entry_gemos_still_mac_20260914';
/** Curated, authored markup shared by the desktop archive and mobile detail. */
export function stillCaseMarkup(lang: string) {
  const t = (zh: string, en: string) => lang === 'en' ? en : zh;
  const asset = (name: string) => `/gemos-still/assets/${name}.jpg`;
  return `<article class="still-case">
    <section class="sc-intro">
      <p class="sc-eyebrow">A PERSONAL EXPERIMENT / GEMOSDODO</p>
      <h2>${t('让一张照片，<br>有一个可以重返的地方。', 'Give a photograph<br>a place to return to.')}</h2>
      <p class="sc-lead">${t('相册保存了很多瞬间，却很少让我们再靠近一点。我想做一台小小的记忆电脑：把平面的照片放进去，让它成为可以转动、靠近、重新观看的空间。', 'Our photo libraries hold countless moments. I wanted to make a small memory computer: a place where a flat photograph becomes a scene you can turn, approach, and revisit.')}</p>
      <dl class="sc-meta"><div><dt>${t('创作', 'Created by')}</dt><dd>Gemosdodo</dd></div><div><dt>${t('形态', 'Format')}</dt><dd>${t('Mac 原生应用 · Web 体验', 'Native Mac app · Web experience')}</dd></div><div><dt>${t('方向', 'Exploration')}</dt><dd>${t('影像 / 空间 / 交互', 'Images / Space / Interaction')}</dd></div></dl>
    </section>
    <figure class="sc-hero"><img src="${asset('hero')}" alt="${t('复古记忆电脑里的紫蓝色粒子潮汐', 'A violet particle tide inside the memory terminal')}" decoding="async"><figcaption><span>GEMOS STILL / THE MEMORY TERMINAL</span><span>${t('Mac 版真实渲染', 'Rendered in the Mac app')}</span></figcaption></figure>
    <section class="sc-section">
      <div class="sc-section-heading"><p class="sc-eyebrow">01 / FROM PHOTO TO SPACE</p><h3>${t('不是换一种相框，<br>而是多一个观看的角度。', 'More than a frame.<br>A different point of view.')}</h3><p>${t('选一张照片，在本机重建高斯场景。前景与远处有了距离，轻轻旋转，就能感受原来藏在画面里的空间层次。', 'Choose a photograph and reconstruct a Gaussian scene locally. A gentle turn reveals depth between the foreground and the distance.')}</p></div>
      <div class="sc-comparison"><figure><img src="${asset('coast-photo')}" alt="${t('用于重建的海边源照片', 'Source coastal photograph')}" loading="lazy"><figcaption><span>01</span>${t('一张照片', 'A photograph')}</figcaption></figure><figure><img src="${asset('coast-scene')}" alt="${t('源照片实际生成的三维记忆盒', 'The reconstructed coastal memory box')}" loading="lazy"><figcaption><span>02</span>${t('一个可以探索的小世界', 'A little world to explore')}</figcaption></figure></div>
      <p class="sc-caption">${t('这组海边源图由 AI 创作，经 SHARP 实际重建、Mac 原生渲染。单张照片的重建有视角局限，无法完整还原未被拍到的部分。', 'The coastal source image was AI-created, then reconstructed with SHARP and rendered in the native Mac app. A single image cannot fully recover surfaces outside the original view.')}</p>
    </section>
    <section class="sc-section sc-ritual">
      <figure><img src="${asset('glass')}" alt="${t('透明玻璃里的粒子潮汐细节', 'Particle tide behind the glass')}" loading="lazy"></figure>
      <div><p class="sc-eyebrow">02 / A SMALL RITUAL</p><h3>${t('让收藏，<br>有一点仪式感。', 'A small ritual<br>for a lasting moment.')}</h3><p>${t('复古外壳、透明玻璃、流动的粒子。熟悉的电脑形态，装着一个不太寻常的世界。', 'A retro shell, transparent glass, and flowing particles. A familiar computer holding an unfamiliar little world.')}</p>
      <ol class="sc-steps"><li><span>01</span><div><h4>${t('把瞬间放进去', 'Insert a moment')}</h4><p>${t('照片化成卡片，缓缓进入卡槽。', 'The photograph becomes a card and slides into the slot.')}</p></div></li><li><span>02</span><div><h4>${t('看风景被构筑', 'Watch a scene take shape')}</h4><p>${t('粒子环绕、聚合，风景从下往上逐层显现。', 'Particles circulate and gather as the scene emerges from the ground up.')}</p></div></li><li><span>03</span><div><h4>${t('再靠近一点', 'Move a little closer')}</h4><p>${t('旋转、缩放，找到属于这段记忆的角度。', 'Rotate and zoom to find your own view of the memory.')}</p></div></li></ol></div>
    </section>
    <section class="sc-section"><div class="sc-section-heading"><p class="sc-eyebrow">03 / MADE TO BE SHARED</p><h3>${t('把整个过程，<br>变成一段可以分享的影片。', 'Turn the experience<br>into a film to share.')}</h3><p>${t('从卡片入仓到场景显现，用自动运镜与钢琴配乐，把这次收藏完整地讲给别人看。', 'From the arrival of the card to the reveal of the scene, camera choreography and a piano score tell the story of your memory.')}</p></div>
      <video class="sc-film" src="/gemos-still/assets/coast-introduction-v1.mp4" poster="${asset('hero')}" controls playsinline preload="none" aria-label="${t('播放 Gemos Still 展示影片', 'Play the Gemos Still showcase')}"></video>
      <div class="sc-specs"><span><strong>4K / 1080P</strong>${t('影片导出', 'Video export')}</span><span><strong>30 / 60 fps</strong>${t('帧率选择', 'Frame rate options')}</span><span><strong>.still</strong>${t('保存与交换记忆', 'Save and exchange memories')}</span></div>
      <p class="sc-caption">${t('本片使用上面的海边照片，经本机重建后实际渲染。依次展示照片入仓、空间构筑与环绕观看；此处为适合网页播放的压缩版本。', 'Rendered from the coastal photograph above, reconstructed locally. Follow the photo into the terminal, watch the space emerge, and explore it in orbit. This is a compressed edit for web playback.')}</p>
    </section>
    <section class="sc-section sc-making"><div><p class="sc-eyebrow">04 / UNDER THE GLASS</p><h3>${t('好奇心是起点。<br>技术让它发生。', 'Curiosity starts it.<br>Technology makes it possible.')}</h3></div><div class="sc-tech"><div><h4>SHARP / Gaussian Splatting</h4><p>${t('将单张照片重建为空间场景，照片与生成内容留在本机。', 'Reconstruct a spatial scene from a single photograph, keeping the photo and generated content on your device.')}</p></div><div><h4>AppKit / SceneKit / Metal</h4><p>${t('原生 Mac 界面与渲染，让玻璃、粒子、相机与交互在同一个小世界中工作。', 'Native Mac interface and rendering bring glass, particles, cameras, and interaction into one small world.')}</p></div><div><h4>${t('开放的创作', 'An open experiment')}</h4><p>${t('项目源码公开，记忆文件可在网页版继续打开。你也可以看看这个盒子是如何做出来的。', 'The source is public, and memory files can be opened in the web version. Explore how the terminal was made.')}</p></div></div></section>
    <section class="sc-end"><img src="/gemos-still/assets/icon.png" alt="" width="64" height="64"><p class="sc-eyebrow">YOUR NEXT MEMORY</p><h3>${t('下一段记忆，<br>留给你来收藏。', 'The next memory<br>is yours to keep.')}</h3><p>${t('了解 Mac 版，或先在浏览器里体验。', 'Discover the Mac app, or try the web experience.')}</p><div class="sc-actions"><a class="sc-primary" href="/gemos-still/">${t('了解并下载 Mac 版', 'Discover the Mac app')} <span aria-hidden="true">↗</span></a><a href="/vibecoding-projects/still-memory-box/index.html">${t('体验网页版', 'Try it on the web')} ↗</a></div><a class="sc-github" href="https://github.com/duoduoaiduoduo/gemos-still">${t('在 GitHub 查看源码', 'View source on GitHub')} ↗</a><p class="sc-caption">${t('Mac 预览版适用于 Apple 芯片与 macOS 14 及以上，建议 16 GB 内存。尚未经过 Apple 公证，下载前请阅读安装说明。SHARP 模型遵循其研究许可。', 'Mac preview: Apple silicon, macOS 14 or later, 16 GB memory recommended. Not yet notarized by Apple; read the installation notes before downloading. SHARP is subject to its research license.')}</p></section>
  </article>`;
}
