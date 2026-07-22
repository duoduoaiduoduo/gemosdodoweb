# Mobile Frontend Review Snapshot

这个文件是给“艺术家程序员”看的触控端前端代码整理版。  
它不会被项目编译引用，只是一个独立参考文档，不会影响网站运行。

## 1) 触控端页面结构（React）

来源：`src/App.tsx`

```tsx
function TouchHome({
  t,
  bridge,
  isPhone,
  onToggleLang,
  onOpenAwards,
  onOpenPdfs,
  onOpenAdmin,
  onScrollArchive,
}: {
  t: (zh: string, en: string) => string;
  bridge: ReturnType<typeof getAppBridge>;
  isPhone: boolean;
  onToggleLang: () => void;
  onOpenAwards: () => void;
  onOpenPdfs: () => void;
  onOpenAdmin: () => void;
  onScrollArchive: () => void;
}) {
  return (
    <div className="touch-home">
      <div id="canvas-container"></div>

      <div className="m-shell no-grass">
        <header className="m-topbar">
          <button type="button" className="m-topbar-lang" onClick={onToggleLang}>EN / 中文</button>
          <button type="button" className="m-topbar-admin" onClick={onOpenAdmin} aria-label={t('后台', 'Admin')}>
            <i data-lucide="lock"></i>
          </button>
        </header>

        <section className="m-hero">
          <div className="m-logo-zone">
            <img src="/avatar.png" alt="Avatar" className="m-avatar" />
            <img src="/logo.png" alt="Logo" className="m-logo" />
          </div>
          <div className="m-title-zone">
            <h1>{t('多多 GemosDodo 的刻录石碑', 'The Engraved Stela of GemosDodo')}</h1>
            <p>Digital Archive & Creative Works</p>
            <p>Est. 2024 / Interactive Sector</p>
            <p className="m-icp-inline">浙ICP备2026017753号</p>
          </div>
          {!isPhone ? (
            <button type="button" className="m-scroll-hint" onClick={onScrollArchive}>
              <i data-lucide="chevron-down"></i>
              <span>{t('下滑探索全景纪事', 'Explore Archive')}</span>
            </button>
          ) : null}
        </section>

        <section className="m-filter-row">
          <button type="button" className="m-filter-item filter-item active" onClick={(e) => bridge.filterTimeline?.('all', e.currentTarget)}>全部</button>
          <button type="button" className="m-filter-item filter-item" onClick={(e) => bridge.filterTimeline?.('project', e.currentTarget)}>作品</button>
          <button type="button" className="m-filter-item filter-item" onClick={(e) => bridge.filterTimeline?.('video', e.currentTarget)}>视频</button>
          <button type="button" className="m-filter-item filter-item" onClick={(e) => bridge.filterTimeline?.('edu', e.currentTarget)}>教育</button>
        </section>
      </div>

      <section className="masonry-section m-masonry" id="masonrySection">
        <h2 className="masonry-header">全部纪事 / ARCHIVE</h2>
        <div className="masonry-grid no-grass" id="masonryGrid"></div>
      </section>

      <div className="m-bottom-nav no-grass">
        <button type="button" className="m-nav-btn m-nav-awards" onClick={onOpenAwards}>
          <i data-lucide="copy"></i>
          <span>奖状</span>
        </button>
        <button type="button" className="m-nav-btn m-nav-pdfs" onClick={onOpenPdfs}>
          <i data-lucide="book-open"></i>
          <span>作品集</span>
        </button>
      </div>

      <aside id="rollerContainer" className="m-bridge-roller" aria-hidden="true">
        <div id="rollerWheel"></div>
      </aside>
    </div>
  );
}
```

路由跳转归位（避免从中下位置进入奖状/PDF页）：

```tsx
const navigateToHash = (hash: '#awards' | '#pdfs' | '#/admin') => {
  window.scrollTo({ top: 0, behavior: 'auto' });
  window.location.hash = hash;
  if (hash === '#awards') setIsAwardsRoute(true);
  if (hash === '#pdfs') setIsPdfsRoute(true);
  if (hash === '#/admin') setIsAdminRoute(true);
};
```

---

## 2) 触控端交互逻辑（脚本）

来源：`src/script.ts`

```ts
function computeLayoutMode() {
  const width = window.innerWidth || 0;
  if (width <= 768) return 'phone';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

function shouldEnableGrass() {
  return layoutMode === 'desktop';
}

function shouldRenderCows() {
  return layoutMode !== 'phone';
}
```

```ts
function plantGrass(clientX, clientY, target) {
  if (!shouldEnableGrass()) return;
  if (target.closest('.no-grass')) return;
  // ...
}
```

```ts
// 详情页里点击关联奖状/PDF时，先回到顶部再跳 hash
card.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'auto' });
  window.location.hash = `#awards?focus=${encodeURIComponent(award.id)}`;
});

card.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'auto' });
  window.location.hash = `#pdfs?focus=${encodeURIComponent(pdf.id)}`;
});
```

---

## 3) 触控端样式（重点）

来源：`src/index.css`

### 3.1 触控壳层核心类
- `.touch-home`
- `.m-shell`
- `.m-topbar`, `.m-topbar-lang`, `.m-topbar-admin`
- `.m-hero`, `.m-logo-zone`, `.m-title-zone`, `.m-icp-inline`
- `.m-filter-row`, `.m-filter-item`
- `.m-bottom-nav`, `.m-nav-btn`
- `.m-masonry .masonry-grid`

### 3.2 重要行为样式（当前版本）

```css
/* 手机筛选按钮文字居中修正 */
@media (max-width: 1024px) {
  body.layout-phone .m-filter-item,
  body.layout-tablet .m-filter-item {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    line-height: 1.1 !important;
    padding: 0 8px !important;
  }
}
```

```css
/* 手机双列卡片流，超窄屏回退单列 */
@media (max-width: 1024px) {
  body.layout-phone .masonry-grid,
  body.layout-phone .m-masonry .masonry-grid {
    column-count: 2 !important;
    column-gap: 10px !important;
  }
}
@media (max-width: 340px) {
  body.layout-phone .masonry-grid,
  body.layout-phone .m-masonry .masonry-grid {
    column-count: 1 !important;
  }
}
```

```css
/* 桌面详情关闭键可见性增强 */
.detail-close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 60;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #ffffff;
  border: 1px solid rgba(255,255,255,0.58);
  background: rgba(14, 18, 26, 0.62);
  box-shadow: 0 12px 28px rgba(0,0,0,0.34);
}
```

---

## 4) 给审阅者的源码入口（最关键）

请重点看以下文件的实现细节：

- `src/App.tsx`（触控端结构、路由切换、入口按钮）
- `src/index.css`（触控视觉和响应式规则）
- `src/script.ts`（触控模式行为：滚动、种草、牛牛、卡片渲染）
- `src/AwardsPage.tsx`（奖状页首屏归位、卡片行为）
- `src/PdfsPage.tsx`（作品集页首屏归位、阅读层行为）

