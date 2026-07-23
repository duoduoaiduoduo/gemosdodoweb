# Mobile Page Code Reference

This file contains the consolidated logic and styling for the mobile web page. It is provided for the frontend designer as a reference.

## React Component (`TouchHome`)
This is the main mobile home layout located in `src/App.tsx`. 
It implements the top bar (with language and hidden admin toggle), a hero section with personal brand info, a filter row, the masonry gallery container, and a bottom navigation bar.

```tsx
function TouchHome({
  lang,
  t,
  bridge,
  isPhone,
  showAdminEntry,
  isLangTransitioning,
  onAvatarTap,
  onToggleLang,
  onOpenAwards,
  onOpenPdfs,
  onOpenJournal,
  onOpenAdmin,
  onScrollArchive,
}: {
  lang: AppLang;
  t: (zh: string, en: string) => string;
  bridge: ReturnType<typeof getAppBridge>;
  isPhone: boolean;
  showAdminEntry: boolean;
  isLangTransitioning: boolean;
  onAvatarTap: () => void;
  onToggleLang: () => void;
  onOpenAwards: () => void;
  onOpenPdfs: () => void;
  onOpenJournal: () => void;
  onOpenAdmin: () => void;
  onScrollArchive: () => void;
}) {
  return (
    <div className="touch-home">

      <div className="m-shell no-grass">
        <header className="m-topbar">
          <button type="button" className="m-topbar-lang" onClick={onToggleLang} disabled={isLangTransitioning} aria-busy={isLangTransitioning}>
            EN / 中文
          </button>
          {showAdminEntry ? (
            <button type="button" className="m-topbar-admin admin-entry-gate" onClick={onOpenAdmin} aria-label={t('后台', 'Admin')}>
              <i data-lucide="lock"></i>
            </button>
          ) : (
            <span className="m-topbar-admin-placeholder" aria-hidden="true"></span>
          )}
        </header>

        <section className="m-hero">
          <div className="m-logo-zone">
            <img src="/avatar.png" alt="Avatar" className="m-avatar avatar-unlock-hit" onClick={onAvatarTap} />
            <img src="/logo.png" alt="Logo" className="m-logo" />
          </div>
          <div className="m-title-zone">
            <div className="title-with-badge">
              <h1>{t('多多 GemosDodo 的刻录石碑', 'The Engraved Stela of GemosDodo')}</h1>
              <span className="official-badge">{t('官网', 'Official')}</span>
            </div>
            <p>Digital Archive & Creative Works</p>
            <p className="hero-manifesto-line">{t(heroManifesto.zh, heroManifesto.en)}</p>
            <SocialLinks lang={lang} />
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
          <button type="button" className="m-filter-item filter-item active" onClick={(e) => bridge.filterTimeline?.('all', e.currentTarget)}>
            {t('全部', 'All')}
          </button>
          <button type="button" className="m-filter-item filter-item" onClick={(e) => bridge.filterTimeline?.('project', e.currentTarget)}>
            {t('作品', 'Project')}
          </button>
          <button type="button" className="m-filter-item filter-item" onClick={(e) => bridge.filterTimeline?.('video', e.currentTarget)}>
            {t('视频', 'Video')}
          </button>
          <button type="button" className="m-filter-item filter-item" onClick={(e) => bridge.filterTimeline?.('edu', e.currentTarget)}>
            {t('教育', 'Edu')}
          </button>
        </section>
      </div>

      <section className="masonry-section m-masonry" id="masonrySection">
        <h2 className="masonry-header">{t('全部纪事 / ARCHIVE', 'ARCHIVE')}</h2>
        <div className="masonry-grid no-grass" id="masonryGrid"></div>
      </section>

      <div className="m-bottom-nav no-grass">
        <button type="button" className="m-nav-btn m-nav-awards" onClick={onOpenAwards}>
          <i data-lucide="copy"></i>
          <span>{t('奖状', 'Awards')}</span>
        </button>
        <button type="button" className="m-nav-btn m-nav-pdfs" onClick={onOpenPdfs}>
          <i data-lucide="book-open"></i>
          <span>{t('作品集', 'Portfolio')}</span>
        </button>
        <button type="button" className="m-nav-btn m-nav-journal" onClick={onOpenJournal}>
          <i data-lucide="notebook-pen"></i>
          <span>{t('手账本', 'Journal')}</span>
        </button>
      </div>

      <aside id="rollerContainer" className="m-bridge-roller" aria-hidden="true">
        <div id="rollerWheel"></div>
      </aside>
    </div>
  );
}

```

## Mobile CSS Elements
These are the mobile-specific styles and overrides extracted from `src/index.css` (Targeting `.m-` elements and `body.layout-phone` overrides):

```css
body.layout-phone .m-filter-item,
    body.layout-tablet .m-filter-item {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        line-height: 1.1 !important;
        padding: 0 8px !important;
        -webkit-appearance: none;
        appearance: none;
    }

body.layout-phone .m-filter-item {
        font-size: 11px !important;
    }

body.layout-phone .masonry-grid,
    body.layout-phone .m-masonry .masonry-grid {
        column-count: 2 !important;
        column-gap: 12px !important;
    }

body.layout-phone .m-masonry .masonry-card {
        margin-bottom: 12px !important;
    }

body.layout-phone .masonry-grid,
    body.layout-phone .m-masonry .masonry-grid {
        column-count: 1 !important;
    }

/* ── Mobile card: column layout — pure image on top, text below ── */
/* Applied when isMobile path is used in renderMasonry */
body.layout-phone .masonry-card,
body.layout-tablet .masonry-card {
    background: var(--bg-color);
    overflow: visible; /* text body sits below, not inside */
    border-radius: 14px;
    -webkit-mask-image: none;
    mask-image: none;
    box-shadow: none;
    display: flex;
    flex-direction: column;
    will-change: auto;
}

body.layout-phone .masonry-card .masonry-card-title,
body.layout-tablet .masonry-card .masonry-card-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--primary-color);
    line-height: 1.35;
    margin-bottom: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

body.layout-phone .masonry-card .masonry-card-date,
body.layout-tablet .masonry-card .masonry-card-date {
    font-size: 0.68rem;
    color: var(--accent-color, rgba(120,120,120,0.8));
    text-align: left;
    margin-top: 0;
    opacity: 0.7;
}

/* Mobile / topbar: lock only appears after triple-tap; keep it easy to miss */
.m-topbar-admin.admin-entry-gate {
    opacity: 0.14;
    color: var(--m-muted);
    border-color: rgba(148, 163, 184, 0.35);
    transition: opacity 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.m-topbar-admin.admin-entry-gate:active {
    opacity: 0.55;
}

body.layout-phone .icp-record {
    bottom: calc(6px + env(safe-area-inset-bottom, 0px));
    font-size: 11px;
}

/* Responsive overhaul: phone + tablet front-end experience */
body.layout-phone,
body.layout-tablet {
    overflow-x: hidden;
}

body.layout-phone .hero-screen {
    height: auto;
    min-height: 0;
    padding-bottom: 10px;
}

body.layout-phone .roller-container {
    display: none !important;
}

body.layout-phone .stela-container {
    position: relative;
    width: 100%;
    height: auto;
    top: auto;
    left: auto;
    padding: 20px 14px 0;
}

body.layout-phone .stela-content {
    border-left-width: 2px;
    padding-left: 12px;
}

body.layout-phone .main-title {
    font-size: 2rem;
}

body.layout-phone .sub-title {
    font-size: 1.05rem;
    letter-spacing: 0.12rem;
}

body.layout-phone .english-meta {
    margin-top: 10px;
    gap: 2px;
}

body.layout-phone .en-line {
    font-size: 0.6rem;
    letter-spacing: 0.14rem;
}

body.layout-phone .instructions {
    margin-top: 16px;
    gap: 10px;
}

body.layout-phone .inst-item {
    font-size: 0.78rem;
}

body.layout-phone .masonry-section {
    min-height: auto;
    padding: 16px 12px calc(124px + env(safe-area-inset-bottom, 0px));
}

body.layout-phone .masonry-header {
    margin-bottom: 16px;
    font-size: 1.08rem;
    letter-spacing: 0.1rem;
}

body.layout-phone .masonry-grid {
    column-count: 1;
    column-gap: 0;
}

body.layout-phone .masonry-card {
    margin-bottom: 14px;
    border-radius: 14px;
}

body.layout-phone .masonry-card:hover,
body.layout-phone .masonry-card:active {
    transform: none;
}

body.layout-phone .filter-sidebar {
    bottom: calc(110px + env(safe-area-inset-bottom, 0px));
    gap: 10px;
}

body.layout-phone .filter-icon,
body.layout-phone .lang-toggle-btn,
body.layout-phone .awards-floating-entry,
body.layout-phone .pdf-floating-entry {
    min-height: 44px;
}

body.layout-phone .create-btn {
    left: 12px;
    right: 12px;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    transform: none !important;
}

body.layout-phone .awards-floating-entry {
    top: auto;
    right: 12px;
    bottom: calc(66px + env(safe-area-inset-bottom, 0px));
}

body.layout-phone .pdf-floating-entry {
    top: auto;
    right: 72px;
    bottom: calc(66px + env(safe-area-inset-bottom, 0px));
}

body.layout-phone .detail-modal {
    width: 100vw;
    max-width: none;
    height: 100dvh;
    border-radius: 0;
    top: 0;
    left: 0;
    transform: none !important;
}

body.layout-phone .detail-scroll-container {
    height: 100dvh;
}

body.layout-phone .detail-hero {
    height: 34vh;
    min-height: 210px;
}

body.layout-phone .detail-body {
    padding: 0 14px calc(132px + env(safe-area-inset-bottom, 0px)) 14px;
}

body.layout-phone .detail-header {
    margin-top: -46px;
    margin-bottom: 22px;
}

body.layout-phone .detail-title {
    font-size: 1.65rem;
    margin-bottom: 12px;
}

body.layout-phone .detail-rich-content {
    gap: 20px;
}

body.layout-phone .rich-text {
    font-size: 0.98rem;
    line-height: 1.72;
}

body.layout-phone .detail-layout-viewport {
    overflow: auto;
}

body.layout-phone .detail-work-awards {
    left: 12px;
    right: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    width: auto;
    height: 84px;
    display: flex;
    gap: 8px;
    overflow-x: auto;
}

body.layout-phone .detail-work-pdfs {
    left: 12px;
    right: 12px;
    bottom: calc(104px + env(safe-area-inset-bottom, 0px));
    width: auto;
    height: 84px;
    display: flex;
    gap: 8px;
    overflow-x: auto;
}

body.layout-phone .detail-work-award-card,
body.layout-phone .detail-work-pdf-card {
    position: relative;
    left: auto !important;
    top: auto;
    flex: 0 0 auto;
    transform: none !important;
}

body.layout-phone .awards-page,
body.layout-phone .pdf-page {
    padding: 12px 12px calc(16px + env(safe-area-inset-bottom, 0px));
}

body.layout-phone .awards-header,
body.layout-phone .pdf-header {
    align-items: flex-start;
    gap: 10px;
}

body.layout-phone .awards-title-wrap h1,
body.layout-phone .pdf-title-wrap h1 {
    font-size: 1.35rem;
    letter-spacing: 0.04em;
}

body.layout-phone .awards-title-wrap p,
body.layout-phone .pdf-title-wrap p {
    font-size: 0.8rem;
}

body.layout-phone .awards-deck-stage {
    min-height: auto;
    padding: 10px;
}

body.layout-phone .awards-deck-row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    overflow: visible;
    padding: 2px;
}

body.layout-phone .award-card,
body.layout-phone .award-card.is-hovered,
body.layout-phone .award-card.is-neighbor,
body.layout-phone .award-card.is-far {
    width: 100%;
    margin-right: 0;
    transform: none !important;
    filter: none;
}

body.layout-phone .award-card-media {
    min-height: 180px;
    max-height: 260px;
}

body.layout-phone .award-lightbox,
body.layout-phone .pdf-lightbox {
    padding: 0;
}

body.layout-phone .award-lightbox-panel,
body.layout-phone .pdf-lightbox-panel {
    width: 100vw;
    height: 100dvh;
    max-height: none;
    border-radius: 0;
    padding: 10px;
}

body.layout-phone .award-lightbox-media {
    min-height: 40vh;
    max-height: 52vh;
}

body.layout-phone .pdf-viewer-frame {
    min-height: 54vh;
}

body.layout-phone button:active,
body.layout-phone a:active,
body.layout-tablet button:active,
body.layout-tablet a:active {
    transform: scale(0.98);
}

.lang-toggle-btn:disabled,
.m-topbar-lang:disabled {
    cursor: not-allowed;
    opacity: 0.58;
    filter: saturate(0.72);
}

.m-bridge-roller {
    width: 0;
    height: 0;
    overflow: hidden;
    position: absolute;
    pointer-events: none;
}

.m-shell {
    position: relative;
    z-index: 12;
    width: min(960px, 100%);
    margin: 0 auto;
    padding: max(env(safe-area-inset-top), 10px) 14px 0;
    box-sizing: border-box;
}

.m-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.m-topbar-lang,
.m-topbar-admin {
    height: 44px;
    min-width: 44px;
    border-radius: 999px;
    border: 1px solid var(--m-border);
    background: var(--m-surface);
    color: var(--m-text);
    backdrop-filter: blur(10px);
}

.m-topbar-lang {
    padding: 0 14px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
}

.m-topbar-admin {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.m-topbar-admin i {
    width: 16px;
    height: 16px;
}

.m-hero {
    border-radius: 18px;
    border: 1px solid var(--m-border);
    background: var(--m-surface-strong);
    backdrop-filter: blur(12px);
    padding: 14px 14px 12px;
    box-shadow: 0 16px 30px rgba(0,0,0,0.18);
}

.m-logo-zone {
    display: flex;
    align-items: center;
    gap: 10px;
}

.m-avatar {
    width: 40px;
    height: 40px;
    object-fit: contain;
}

.m-logo {
    height: 28px;
    width: auto;
    object-fit: contain;
}

.m-title-zone {
    margin-top: 10px;
}

.m-title-zone h1 {
    margin: 0;
    color: var(--m-text);
    font-size: clamp(1.08rem, 4.8vw, 1.5rem);
    line-height: 1.35;
    letter-spacing: 0.02em;
}

.m-title-zone p {
    margin: 8px 0 0;
    color: var(--m-muted);
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.m-icp-inline {
    margin-top: 6px !important;
    font-size: 11px !important;
    letter-spacing: 0.02em !important;
    text-transform: none !important;
    color: #64748b !important;
}

.m-scroll-hint {
    margin-top: 12px;
    height: 40px;
    width: 100%;
    border: 1px solid var(--m-border);
    border-radius: 12px;
    background: var(--m-surface-soft);
    color: var(--m-text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
}

.m-scroll-hint i {
    width: 14px;
    height: 14px;
}

.m-filter-row {
    position: sticky;
    top: calc(8px + env(safe-area-inset-top));
    z-index: 14;
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
}

.m-filter-item {
    height: 44px;
    width: 100%;
    border-radius: 999px;
    border: 1px solid var(--m-border);
    background: var(--m-surface);
    color: var(--m-text);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 0 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.m-filter-item.active {
    background: var(--m-accent);
    color: var(--m-accent-text);
    border-color: transparent;
    box-shadow: 0 8px 20px rgba(0,0,0,0.2);
}

.m-masonry {
    padding: 14px 12px calc(112px + env(safe-area-inset-bottom)) !important;
    min-height: auto;
}

.m-masonry .masonry-header {
    margin: 0 0 14px;
    text-align: left;
    font-size: 1rem;
    letter-spacing: 0.08em;
}

.m-masonry .masonry-grid {
    column-count: 1 !important;
    column-gap: 0 !important;
}

.m-masonry .masonry-card {
    margin-bottom: 12px;
    border-radius: 14px;
    transform: none !important;
}

.m-bottom-nav {
    position: fixed;
    z-index: 60;
    left: 12px;
    right: 12px;
    bottom: calc(8px + env(safe-area-inset-bottom));
    border-radius: 16px;
    border: 1px solid var(--m-border);
    background: var(--m-surface-strong);
    backdrop-filter: blur(14px);
    padding: 8px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.m-nav-btn {
    height: 52px;
    border-radius: 12px;
    border: 1px solid var(--m-border);
    background: var(--m-surface-soft);
    color: var(--m-text);
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 700;
}

.m-nav-btn i {
    width: 16px;
    height: 16px;
}

.m-nav-awards,
.m-nav-pdfs {
    color: var(--m-action-text);
    background: var(--m-action-bg);
    border-color: var(--m-action-border);
}

body.layout-phone .detail-modal,
body.layout-tablet .detail-modal {
    width: 100vw;
    max-width: none;
    height: 100dvh;
    border-radius: 0;
    top: 0;
    left: 0;
    transform: none !important;
    padding: 0;
}

body.layout-phone .detail-scroll-container,
body.layout-tablet .detail-scroll-container {
    height: 100dvh;
    overflow-y: auto;
}

body.layout-phone .detail-body,
body.layout-tablet .detail-body {
    padding: 0 14px calc(120px + env(safe-area-inset-bottom)) 14px;
}

body.layout-phone .awards-page,
body.layout-phone .pdf-page,
body.layout-tablet .awards-page,
body.layout-tablet .pdf-page {
    padding: 12px 12px calc(16px + env(safe-area-inset-bottom));
}

body.layout-phone .awards-deck-row,
body.layout-tablet .awards-deck-row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    overflow: visible;
    padding: 4px;
}

body.layout-phone .award-card,
body.layout-phone .award-card.is-hovered,
body.layout-phone .award-card.is-neighbor,
body.layout-phone .award-card.is-far,
body.layout-tablet .award-card,
body.layout-tablet .award-card.is-hovered,
body.layout-tablet .award-card.is-neighbor,
body.layout-tablet .award-card.is-far {
    width: 100%;
    margin-right: 0;
    transform: none !important;
    filter: none !important;
}

body.layout-phone .pdf-grid,
body.layout-tablet .pdf-grid {
    grid-template-columns: 1fr;
}

body.layout-phone .award-lightbox-panel,
body.layout-phone .pdf-lightbox-panel {
    width: 100vw;
    height: 100dvh;
    max-height: none;
    border-radius: 0;
    padding: 10px;
}

body.layout-phone .icp-record,
body.layout-tablet .icp-record {
    bottom: calc(6px + env(safe-area-inset-bottom));
    font-size: 11px;
}

body.layout-phone,
    body.layout-tablet {
        background: var(--m-bg);
    }

body.layout-phone .filter-sidebar,
    body.layout-tablet .filter-sidebar,
    body.layout-phone .awards-floating-entry,
    body.layout-phone .pdf-floating-entry,
    body.layout-phone .create-btn,
    body.layout-tablet .create-btn {
        display: none !important;
    }

.m-shell {
        width: min(920px, 100%);
        padding: max(env(safe-area-inset-top), 12px) 14px 0;
    }

.m-topbar {
        margin-bottom: 10px;
    }

.m-topbar-lang,
    .m-topbar-admin {
        border: 1px solid var(--m-line-strong);
        background: var(--m-surface);
        color: var(--m-ink);
        box-shadow: var(--m-shadow-1);
    }

.m-topbar-admin.admin-entry-gate {
        opacity: 0.11;
        color: #94a3b8;
        background: var(--m-surface);
        border-color: rgba(148, 163, 184, 0.32);
        box-shadow: none;
    }

.m-topbar-admin.admin-entry-gate:active {
        opacity: 0.48;
    }

.m-topbar-lang {
        min-width: 98px;
    }

.m-hero {
        border-radius: var(--m-radius-lg);
        border: 1px solid var(--m-line);
        background: var(--m-surface);
        box-shadow: var(--m-shadow-2);
        backdrop-filter: none;
        padding: 14px 14px 12px;
    }

.m-logo-zone {
        gap: 8px;
    }

.m-avatar {
        width: 36px;
        height: 36px;
    }

.m-logo {
        height: 24px;
    }

.m-title-zone {
        margin-top: 10px;
    }

.m-title-zone h1 {
        color: var(--m-ink);
        font-size: clamp(1.03rem, 4.2vw, 1.28rem);
        line-height: 1.45;
        font-weight: 700;
        letter-spacing: 0.01em;
        text-wrap: balance;
    }

.m-title-zone p {
        color: var(--m-ink-soft);
        font-size: 11px;
        letter-spacing: 0.09em;
    }

.m-icp-inline {
        color: #64748b !important;
    }

.m-scroll-hint {
        border: 1px solid var(--m-line);
        border-radius: var(--m-radius-sm);
        background: linear-gradient(180deg, #ffffff, #f7faff);
        color: var(--m-ink);
        font-size: 11px;
        font-weight: 700;
        box-shadow: var(--m-shadow-1);
    }

.m-filter-row {
        top: calc(6px + env(safe-area-inset-top));
        margin-top: 12px;
        gap: 8px;
        padding: 6px;
        border-radius: 999px;
        border: 1px solid var(--m-line);
        background: rgba(255,255,255,0.92);
        box-shadow: var(--m-shadow-1);
        backdrop-filter: blur(6px);
    }

.m-filter-item {
        height: 44px;
        border-radius: 999px;
        border: 1px solid transparent;
        background: transparent;
        color: #334155;
        font-size: 12px;
        font-weight: 700;
    }

.m-filter-item.active {
        background: var(--m-accent-blue-soft);
        color: var(--m-accent-blue);
        border-color: #bfdbfe;
        box-shadow: none;
    }

.m-masonry {
        padding: 12px 12px calc(96px + env(safe-area-inset-bottom)) !important;
    }

.m-masonry .masonry-header {
        margin: 0 2px 12px;
        font-size: 0.95rem;
        letter-spacing: 0.06em;
        color: #1e293b;
    }

.m-masonry .masonry-card {
        border-radius: var(--m-radius-md);
        border: 1px solid var(--m-line);
        box-shadow: var(--m-shadow-1);
    }

.m-masonry .masonry-overlay {
        background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
    }

.m-bottom-nav {
        border-radius: var(--m-radius-md);
        border: 1px solid var(--m-line);
        background: rgba(255,255,255,0.96);
        box-shadow: var(--m-shadow-2);
        padding: 8px;
        gap: 8px;
        bottom: calc(8px + env(safe-area-inset-bottom));
        z-index: 90;
    }

.m-nav-btn {
        height: 52px;
        border-radius: var(--m-radius-sm);
        border: 1px solid var(--m-line);
        background: var(--m-surface);
        color: #1e293b;
        font-size: 11px;
        font-weight: 700;
        gap: 4px;
        transition: transform 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
    }

.m-nav-btn i {
        width: 17px;
        height: 17px;
        stroke-width: 2px;
    }

.m-nav-awards,
    .m-nav-pdfs {
        color: var(--m-accent-blue);
        background: #eff6ff;
        border-color: #bfdbfe;
    }

.m-nav-create {
        color: #0f172a;
        background: #f8fafc;
    }

.m-nav-btn:active {
        transform: scale(0.97);
    }

body.layout-phone .detail-modal,
    body.layout-tablet .detail-modal {
        background: #f8fafd;
    }

body.layout-phone .detail-hero,
    body.layout-tablet .detail-hero {
        min-height: 220px;
        height: 33vh;
    }

body.layout-phone .detail-body,
    body.layout-tablet .detail-body {
        padding: 0 14px calc(130px + env(safe-area-inset-bottom)) 14px;
    }

body.layout-phone .detail-header,
    body.layout-tablet .detail-header {
        margin-top: -26px;
    }

body.layout-phone .detail-title,
    body.layout-tablet .detail-title {
        font-size: 1.38rem;
        color: #0f172a;
    }

body.layout-phone .detail-rich-content,
    body.layout-tablet .detail-rich-content {
        gap: 18px;
    }

body.layout-phone .detail-work-awards,
    body.layout-phone .detail-work-pdfs,
    body.layout-tablet .detail-work-awards,
    body.layout-tablet .detail-work-pdfs {
        height: 78px;
        gap: 8px;
        padding: 4px 2px;
    }

body.layout-phone .detail-work-award-card,
    body.layout-phone .detail-work-pdf-card,
    body.layout-tablet .detail-work-award-card,
    body.layout-tablet .detail-work-pdf-card {
        width: 88px;
        height: 74px;
        border-radius: 12px;
        border: 1px solid var(--m-line-strong);
        background: #ffffff;
        box-shadow: 0 6px 12px rgba(15, 23, 42, 0.12);
    }

body.layout-phone .detail-work-award-card span,
    body.layout-phone .detail-work-pdf-card span,
    body.layout-tablet .detail-work-award-card span,
    body.layout-tablet .detail-work-pdf-card span {
        color: #0f172a;
        font-size: 10px;
        text-shadow: none;
        opacity: 1;
    }

body.layout-phone .awards-page,
    body.layout-tablet .awards-page,
    body.layout-phone .pdf-page,
    body.layout-tablet .pdf-page {
        background:
          radial-gradient(560px 280px at 0% 0%, #e9f0ff, transparent 68%),
          linear-gradient(180deg, #f7f9fd, #eef2f8);
        color: var(--m-ink);
        padding: 12px 12px calc(16px + env(safe-area-inset-bottom));
    }

body.layout-phone .awards-header,
    body.layout-phone .pdf-header,
    body.layout-tablet .awards-header,
    body.layout-tablet .pdf-header {
        gap: 10px;
        align-items: flex-start;
    }

body.layout-phone .awards-title-wrap h1,
    body.layout-phone .pdf-title-wrap h1,
    body.layout-tablet .awards-title-wrap h1,
    body.layout-tablet .pdf-title-wrap h1 {
        color: #0f172a;
        font-size: clamp(1.1rem, 4.8vw, 1.6rem);
        letter-spacing: 0.02em;
    }

body.layout-phone .awards-title-wrap p,
    body.layout-phone .pdf-title-wrap p,
    body.layout-tablet .awards-title-wrap p,
    body.layout-tablet .pdf-title-wrap p {
        color: #64748b;
    }

body.layout-phone .awards-back-btn,
    body.layout-tablet .awards-back-btn {
        border: 1px solid var(--m-line-strong);
        background: linear-gradient(180deg, #ffffff, #f3f6fb);
        color: #0f172a;
        box-shadow: var(--m-shadow-1);
    }

body.layout-phone .awards-back-icon,
    body.layout-tablet .awards-back-icon {
        background: #e2e8f0;
        border-color: #cbd5e1;
        color: #0f172a;
    }

body.layout-phone .awards-deck-stage,
    body.layout-tablet .awards-deck-stage {
        border: 1px solid var(--m-line);
        background: rgba(255,255,255,0.9);
        box-shadow: var(--m-shadow-1);
    }

body.layout-phone .award-card,
    body.layout-tablet .award-card {
        border: 1px solid var(--m-line);
        background: #ffffff;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.1);
    }

body.layout-phone .award-card-info,
    body.layout-tablet .award-card-info {
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
    }

body.layout-phone .award-card-title,
    body.layout-tablet .award-card-title {
        color: #0f172a;
    }

body.layout-phone .award-card-date,
    body.layout-tablet .award-card-date {
        color: #64748b;
    }

body.layout-phone .award-card-glare,
    body.layout-tablet .award-card-glare {
        display: none;
    }

body.layout-phone .pdf-card,
    body.layout-tablet .pdf-card {
        border: 1px solid var(--m-line);
        border-radius: var(--m-radius-md);
        background: #ffffff;
        color: #0f172a;
        box-shadow: var(--m-shadow-1);
    }

body.layout-phone .pdf-card-icon,
    body.layout-tablet .pdf-card-icon {
        border: 1px solid #bfdbfe;
        background: #eff6ff;
        color: #1d4ed8;
    }

body.layout-phone .pdf-card-meta,
    body.layout-phone .pdf-card-desc,
    body.layout-tablet .pdf-card-meta,
    body.layout-tablet .pdf-card-desc {
        color: #64748b;
    }

body.layout-phone .award-lightbox,
    body.layout-phone .pdf-lightbox,
    body.layout-tablet .award-lightbox,
    body.layout-tablet .pdf-lightbox {
        background: rgba(242, 246, 252, 0.94);
        backdrop-filter: blur(4px);
    }

body.layout-phone .award-lightbox-panel,
    body.layout-phone .pdf-lightbox-panel,
    body.layout-tablet .award-lightbox-panel,
    body.layout-tablet .pdf-lightbox-panel {
        border: 1px solid var(--m-line);
        background: #ffffff;
        box-shadow: var(--m-shadow-2);
    }

body.layout-phone .award-lightbox-meta,
    body.layout-tablet .award-lightbox-meta {
        border-color: #e2e8f0;
    }

body.layout-phone .award-lightbox-title,
    body.layout-tablet .award-lightbox-title {
        color: #0f172a;
    }

body.layout-phone .award-lightbox-date,
    body.layout-tablet .award-lightbox-date,
    body.layout-phone .award-lightbox-work,
    body.layout-tablet .award-lightbox-work {
        color: #64748b;
    }

body.layout-phone .award-lightbox-links button,
    body.layout-phone .pdf-side-actions a,
    body.layout-tablet .award-lightbox-links button,
    body.layout-tablet .pdf-side-actions a {
        border: 1px solid #bfdbfe;
        background: #eff6ff;
        color: #1e3a8a;
    }

body.layout-phone .icp-record,
    body.layout-tablet .icp-record {
        display: none;
    }

body.layout-phone .m-scroll-hint {
        display: none !important;
    }

body.layout-phone .m-shell {
        padding-top: max(env(safe-area-inset-top), 10px);
    }

body.layout-phone .m-filter-row {
        top: calc(4px + env(safe-area-inset-top));
    }

body.layout-phone .m-nav-btn,
    body.layout-tablet .m-nav-btn {
        min-height: 52px;
        line-height: 1;
        min-width: 0;
    }

body.layout-phone .m-nav-btn span,
    body.layout-tablet .m-nav-btn span {
        display: inline-block;
        transform: translateY(0.5px);
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

body.layout-phone .m-nav-btn {
        font-size: 10.5px;
    }

body.layout-phone .m-nav-btn i {
        width: 16px;
        height: 16px;
    }

body.layout-phone .m-title-zone h1 {
        font-size: clamp(1rem, 4.6vw, 1.18rem);
    }

body.layout-phone .m-title-zone p {
        font-size: 10px;
    }

body.layout-phone .m-icp-inline {
        font-size: 10px !important;
    }

body.layout-phone .m-shell {
        padding-left: 12px;
        padding-right: 12px;
    }

body.layout-phone .m-bottom-nav {
        left: 10px;
        right: 10px;
    }

body.layout-phone .m-filter-row {
        gap: 6px;
        padding: 5px;
    }

body.layout-phone .m-filter-item {
        font-size: 11px;
        padding: 0 6px;
    }

body.layout-tablet .m-filter-item {
        font-size: 12.5px;
    }

body.layout-phone .masonry-section,
    body.layout-phone .m-masonry {
        padding-left: 10px !important;
        padding-right: 10px !important;
    }

body.layout-phone .detail-close-btn {
        top: 10px;
        right: 10px;
    }

body.layout-phone .detail-body {
        padding-left: 12px;
        padding-right: 12px;
    }

body.layout-phone .awards-page,
    body.layout-phone .pdf-page {
        padding-left: 10px;
        padding-right: 10px;
    }

body.layout-phone .awards-title-wrap h1,
    body.layout-phone .pdf-title-wrap h1 {
        font-size: clamp(1.02rem, 5vw, 1.28rem);
    }

body.layout-phone .awards-title-wrap p,
    body.layout-phone .pdf-title-wrap p {
        font-size: 0.75rem;
    }

body.layout-phone .awards-back-btn.icon-only {
        width: 40px;
        min-width: 40px;
        height: 40px;
        min-height: 40px;
    }

body.layout-phone .award-lightbox-panel,
    body.layout-phone .pdf-lightbox-panel {
        padding: 8px;
    }

body.layout-phone .pdf-side-actions a,
    body.layout-phone .award-lightbox-links button {
        font-size: 0.78rem;
    }

body.layout-tablet .m-shell {
        padding-left: 16px;
        padding-right: 16px;
    }

body.layout-tablet .m-bottom-nav {
        left: 16px;
        right: 16px;
    }

body.layout-tablet .m-masonry {
        padding-left: 16px !important;
        padding-right: 16px !important;
    }

body.layout-tablet .m-nav-btn {
        font-size: 11.5px;
    }

body.layout-phone .m-shell::before,
    body.layout-tablet .m-shell::before {
        content: '';
        position: fixed;
        top: -50%;
        left: -50%;
        width: 200vw;
        height: 200vh;
        z-index: -1;
        background: 
            radial-gradient(circle at 50% 50%, rgba(90, 80, 150, 0.12), transparent 40%),
            radial-gradient(circle at 20% 80%, rgba(60, 100, 130, 0.12), transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(40, 60, 100, 0.08), transparent 45%);
        animation: aurora-flow 30s ease-in-out infinite alternate;
        pointer-events: none;
    }

body.layout-phone .m-shell::before,
        body.layout-tablet .m-shell::before {
            background: 
                radial-gradient(circle at 50% 50%, rgba(80, 40, 130, 0.2), transparent 45%),
                radial-gradient(circle at 20% 80%, rgba(40, 80, 140, 0.2), transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(100, 50, 100, 0.15), transparent 45%);
        }

/* 2. 局部透明与毛玻璃 (Topbar & Filters) */
    body.layout-phone .m-topbar,
    body.layout-tablet .m-topbar {
        background: rgba(255, 255, 255, 0.4) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.15) !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.02) !important;
    }

body.layout-phone .m-topbar,
        body.layout-tablet .m-topbar {
            background: rgba(20, 20, 20, 0.5) !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
        }

body.layout-phone .m-filter-row,
    body.layout-tablet .m-filter-row {
        background: rgba(255, 255, 255, 0.5) !important;
        backdrop-filter: blur(24px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        border-radius: 40px !important;
        padding: 6px !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06) !important;
        display: flex;
        justify-content: space-evenly;
        margin: 0 !important;
    }

body.layout-phone .m-filter-row,
        body.layout-tablet .m-filter-row {
            background: rgba(30, 30, 30, 0.6) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
        }

body.layout-phone .m-filter-item,
    body.layout-tablet .m-filter-item {
        border-radius: 30px !important;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
        flex: 1;
        background: transparent !important;
        border: none !important;
        color: var(--primary-color) !important;
        opacity: 0.7 !important;
        box-shadow: none !important;
    }

body.layout-phone .m-filter-item.active,
    body.layout-tablet .m-filter-item.active {
        background: rgba(10, 10, 10, 0.9) !important;
        color: #fff !important;
        opacity: 1 !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        transform: scale(1.05) !important;
    }

body.layout-phone .m-filter-item.active,
        body.layout-tablet .m-filter-item.active {
            background: rgba(255, 255, 255, 0.95) !important;
            color: #000 !important;
            box-shadow: 0 4px 12px rgba(255,255,255,0.15) !important;
        }

/* 3. 流式排版与负空间 (Typography) */
    body.layout-phone .m-title-zone h1,
    body.layout-tablet .m-title-zone h1 {
        font-family: 'Inter', 'Space Grotesk', system-ui, sans-serif !important;
        font-size: clamp(1.6rem, 7vw, 2.4rem) !important;
        font-weight: 800 !important;
        letter-spacing: -0.02em !important;
        margin-bottom: 12px !important;
        line-height: 1.2 !important;
    }

body.layout-phone .m-title-zone p,
    body.layout-tablet .m-title-zone p {
        font-size: clamp(0.75rem, 3.5vw, 0.95rem) !important;
        letter-spacing: 0.05em !important;
        opacity: 0.7 !important;
        line-height: 1.6 !important;
    }

/* 4. 瀑布流卡片电影感与触摸反馈 (Cards) */
    body.layout-phone .masonry-card,
    body.layout-tablet .masonry-card {
        border: none !important;
        border-radius: 18px !important;
        box-shadow: 0 10px 30px rgba(0,0,0,0.08) !important;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        overflow: hidden !important;
    }

body.layout-phone .masonry-card,
        body.layout-tablet .masonry-card {
            box-shadow: 0 10px 40px rgba(0,0,0,0.4) !important;
            border: 1px solid rgba(255,255,255,0.05) !important;
        }

body.layout-phone .masonry-card:active,
    body.layout-tablet .masonry-card:active {
        transform: scale(0.95) !important;
    }

body.layout-phone .masonry-overlay,
    body.layout-tablet .masonry-overlay {
        background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 50%, transparent 100%) !important;
        padding: 40px 16px 16px 16px !important;
        transform: none !important;
        opacity: 1 !important;
        transition: none !important;
    }

body.layout-phone .masonry-card-badge,
    body.layout-tablet .masonry-card-badge {
        background: rgba(255,255,255,0.2) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2) !important;
    }

/* 5. 灵动岛悬浮底栏 (Dynamic Island Nav) */
    body.layout-phone .m-bottom-nav,
    body.layout-tablet .m-bottom-nav {
        position: fixed !important;
        bottom: 24px !important;
        left: 5% !important;
        width: 90% !important;
        border-radius: 40px !important;
        background: rgba(255, 255, 255, 0.6) !important;
        backdrop-filter: blur(28px) saturate(200%) !important;
        -webkit-backdrop-filter: blur(28px) saturate(200%) !important;
        border: 1px solid rgba(255, 255, 255, 0.4) !important;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12) !important;
        padding: 6px !important;
        display: flex !important;
        justify-content: space-around !important;
        z-index: 100 !important;
    }

body.layout-phone .m-bottom-nav,
        body.layout-tablet .m-bottom-nav {
            background: rgba(20, 20, 20, 0.65) !important;
            border: 1px solid rgba(255, 255, 255, 0.15) !important;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5) !important;
        }

body.layout-phone .m-nav-btn,
    body.layout-tablet .m-nav-btn {
        background: transparent !important;
        border: none !important;
        border-radius: 30px !important;
        color: inherit !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        height: 54px !important;
        flex: 1 !important;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s !important;
        box-shadow: none !important;
    }

body.layout-phone .m-nav-btn i,
    body.layout-tablet .m-nav-btn i {
        margin-bottom: 2px !important;
        color: var(--primary-color) !important;
        opacity: 0.9 !important;
    }

body.layout-phone .m-nav-btn span,
    body.layout-tablet .m-nav-btn span {
        color: var(--primary-color) !important;
        font-weight: 700 !important;
        opacity: 0.8 !important;
        letter-spacing: 0.05em !important;
        font-size: 10px !important;
    }

body.layout-phone .m-nav-btn:active,
    body.layout-tablet .m-nav-btn:active {
        transform: scale(0.9) !important;
        background: rgba(0,0,0,0.08) !important;
    }

body.layout-phone .m-nav-btn:active,
        body.layout-tablet .m-nav-btn:active {
            background: rgba(255,255,255,0.12) !important;
        }

/* 调整主体底部填充，确保不被灵动岛遮挡 */
    body.layout-phone .m-masonry,
    body.layout-tablet .m-masonry {
        padding-bottom: calc(100px + env(safe-area-inset-bottom)) !important;
    }

body.layout-phone .awards-page,
    body.layout-phone .pdf-page,
    body.layout-tablet .awards-page,
    body.layout-tablet .pdf-page {
        padding: 12px 12px calc(16px + env(safe-area-inset-bottom));
    }

body.layout-phone .awards-title-wrap h1,
    body.layout-phone .pdf-title-wrap h1,
    body.layout-tablet .awards-title-wrap h1,
    body.layout-tablet .pdf-title-wrap h1 {
        font-size: clamp(1.1rem, 4.8vw, 1.6rem);
    }

body.layout-phone .awards-title-wrap p,
    body.layout-phone .pdf-title-wrap p,
    body.layout-tablet .awards-title-wrap p,
    body.layout-tablet .pdf-title-wrap p {
        font-size: 0.82rem;
    }

body.layout-phone .awards-deck-stage,
    body.layout-tablet .awards-deck-stage {
        min-height: auto;
        padding: 10px !important;
    }

body.layout-phone .awards-deck-row,
    body.layout-tablet .awards-deck-row {
        display: grid;
        grid-template-columns: 1fr;
        overflow: visible;
        gap: 10px;
    }

body.layout-phone .award-card,
    body.layout-phone .award-card.is-hovered,
    body.layout-phone .award-card.is-neighbor,
    body.layout-phone .award-card.is-far,
    body.layout-tablet .award-card,
    body.layout-tablet .award-card.is-hovered,
    body.layout-tablet .award-card.is-neighbor,
    body.layout-tablet .award-card.is-far {
        width: 100%;
        margin-right: 0 !important;
        transform: translateY(0) !important;
        filter: none !important;
    }

body.layout-phone .award-card-media,
    body.layout-tablet .award-card-media {
        min-height: 188px;
        max-height: 280px;
    }

body.layout-phone .pdf-grid,
    body.layout-tablet .pdf-grid {
        grid-template-columns: 1fr;
    }

body.layout-phone .award-lightbox,
    body.layout-phone .pdf-lightbox {
        padding: 0;
    }

body.layout-phone .award-lightbox-panel,
    body.layout-phone .pdf-lightbox-panel {
        width: 100vw;
        height: 100dvh;
        max-height: none;
        border-radius: 0 !important;
        padding: 10px !important;
    }

body.layout-phone .award-lightbox-panel,
    body.layout-phone .pdf-lightbox-panel,
    body.layout-tablet .award-lightbox-panel,
    body.layout-tablet .pdf-lightbox-panel {
        grid-template-columns: 1fr;
    }

body.layout-phone .award-lightbox-meta,
    body.layout-phone .pdf-lightbox-side,
    body.layout-tablet .award-lightbox-meta,
    body.layout-tablet .pdf-lightbox-side {
        padding: 0;
    }

body.layout-phone .pdf-viewer-frame {
        min-height: 54vh;
    }

body.layout-phone .m-title-zone .hero-manifesto-line,
body.layout-tablet .m-title-zone .hero-manifesto-line {
    font-size: 11px !important;
    letter-spacing: 0.01em !important;
    opacity: 0.92 !important;
}

body.layout-phone .m-title-zone .hero-social-links,
body.layout-tablet .m-title-zone .hero-social-links {
    margin-top: 8px;
    gap: 8px;
}

body.layout-phone .m-title-zone .hero-social-link,
body.layout-tablet .m-title-zone .hero-social-link {
    width: 30px;
    height: 30px;
    border-color: var(--m-border);
    background: var(--m-surface-soft);
    color: var(--m-text);
}

body.layout-phone .m-title-zone .hero-social-link svg,
body.layout-tablet .m-title-zone .hero-social-link svg {
    width: 15px;
    height: 15px;
}

body.layout-phone .m-title-zone .hero-social-link img,
body.layout-tablet .m-title-zone .hero-social-link img {
    width: 15px;
    height: 15px;
}

body.layout-phone .m-title-zone .title-with-badge,
body.layout-tablet .m-title-zone .title-with-badge {
    gap: 6px;
}

body.layout-phone .m-title-zone .official-badge,
body.layout-tablet .m-title-zone .official-badge {
    height: 20px;
    padding: 0 8px;
    font-size: 0.62rem;
}
```
