const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'index.css');

const cssToAppend = `

/* ==========================================
   MOBILE NEO-BRUTALISM & SWISS TYPOGRAPHY
   ========================================== */
body.layout-phone, 
body.layout-tablet {
  --art-bg: #EAE8E3; 
  --art-fg: #111111;
  --art-accent: #FF3B00; 
  --line-width: 1.5px;
  background-color: var(--art-bg) !important;
  color: var(--art-fg) !important;
  font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif !important;
}

body.layout-phone .art-container,
body.layout-tablet .art-container {
  padding-bottom: 80px; 
}

/* 顶部栏 */
body.layout-phone .art-topbar,
body.layout-tablet .art-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: var(--line-width) solid var(--art-fg);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

body.layout-phone .topbar-right,
body.layout-tablet .topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

body.layout-phone .icp-text,
body.layout-tablet .icp-text {
  opacity: 0.5;
}

body.layout-phone .admin-btn,
body.layout-tablet .admin-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--art-fg);
  cursor: pointer;
  display: flex;
  align-items: center;
}

/* 英雄区域 (Hero) */
body.layout-phone .art-hero,
body.layout-tablet .art-hero {
  border-bottom: var(--line-width) solid var(--art-fg);
}

body.layout-phone .hero-grid,
body.layout-tablet .hero-grid {
  display: grid;
  grid-template-columns: 120px 1fr;
  border-bottom: var(--line-width) solid var(--art-fg);
}

body.layout-phone .avatar-container,
body.layout-tablet .avatar-container {
  border-right: var(--line-width) solid var(--art-fg);
  padding: 16px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  cursor: pointer;
}

body.layout-phone .art-avatar,
body.layout-tablet .art-avatar {
  width: 100%;
  aspect-ratio: 1/1;
  object-fit: cover;
  filter: grayscale(100%) contrast(1.2); 
  transition: filter 0.3s ease, transform 0.3s ease;
}
body.layout-phone .art-avatar:active,
body.layout-tablet .art-avatar:active,
body.layout-phone .avatar-container:active .art-avatar,
body.layout-tablet .avatar-container:active .art-avatar {
  filter: grayscale(0%) contrast(1.1);
  transform: scale(1.05);
}

body.layout-phone .title-container,
body.layout-tablet .title-container {
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

body.layout-phone .badge,
body.layout-tablet .badge {
  align-self: flex-start;
  font-size: 9px;
  font-weight: 700;
  border: var(--line-width) solid var(--art-fg);
  padding: 4px 8px;
  margin-bottom: 12px;
  letter-spacing: 0.1em;
}

body.layout-phone .massive-title,
body.layout-tablet .massive-title {
  margin: 0;
  font-size: clamp(2.5rem, 10vw, 3.5rem);
  line-height: 0.85;
  font-weight: 700;
  letter-spacing: -0.04em;
}

body.layout-phone .sub-title,
body.layout-tablet .sub-title {
  margin: 8px 0 0;
  font-size: 1rem;
  line-height: 1.1;
  font-weight: 600;
  letter-spacing: -0.02em;
}

/* 走马灯 (Marquee) */
body.layout-phone .art-marquee,
body.layout-tablet .art-marquee {
  overflow: hidden;
  white-space: nowrap;
  border-bottom: var(--line-width) solid var(--art-fg);
  background: var(--art-fg);
  color: var(--art-bg);
  padding: 8px 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
}

body.layout-phone .marquee-content,
body.layout-tablet .marquee-content {
  display: inline-block;
  animation: marquee 15s linear infinite;
}

body.layout-phone .marquee-content span,
body.layout-tablet .marquee-content span {
  margin-right: 4px;
}

@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-33.33%); }
}

body.layout-phone .hero-meta,
body.layout-tablet .hero-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
}

body.layout-phone .meta-desc,
body.layout-tablet .meta-desc {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.02em;
}

body.layout-phone .art-social-links,
body.layout-tablet .art-social-links {
  display: flex;
  gap: 8px;
}

body.layout-phone .art-social-links button,
body.layout-tablet .art-social-links button {
  width: 36px;
  height: 36px;
  border: var(--line-width) solid var(--art-fg);
  background: transparent;
  color: var(--art-fg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

body.layout-phone .art-social-links button:active,
body.layout-tablet .art-social-links button:active {
  background: var(--art-accent);
  color: #fff;
  border-color: var(--art-accent);
}

/* 分类过滤器 (Filters) */
body.layout-phone .art-filters,
body.layout-tablet .art-filters {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: var(--line-width) solid var(--art-fg);
}

body.layout-phone .art-filter-btn,
body.layout-tablet .art-filter-btn {
  background: transparent;
  border: none;
  border-right: var(--line-width) solid var(--art-fg);
  padding: 14px 0;
  font-size: 11px;
  font-weight: 700;
  font-family: inherit;
  color: var(--art-fg);
  cursor: pointer;
  transition: all 0.2s ease;
  line-height: 1;
}

body.layout-phone .art-filter-btn:last-child,
body.layout-tablet .art-filter-btn:last-child {
  border-right: none;
}

body.layout-phone .art-filter-btn.active,
body.layout-tablet .art-filter-btn.active {
  background: var(--art-fg);
  color: var(--art-bg);
}

body.layout-phone .art-filter-btn:active,
body.layout-tablet .art-filter-btn:active {
  background: var(--art-accent) !important;
  color: #fff !important;
}

/* 瀑布流/网格 (Archive Grid) */
body.layout-phone .archive-header,
body.layout-tablet .archive-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: var(--line-width) solid var(--art-fg);
}

body.layout-phone .archive-header h3,
body.layout-tablet .archive-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

body.layout-phone .art-grid,
body.layout-tablet .art-grid {
  display: flex;
  flex-direction: column;
}

body.layout-phone .art-card,
body.layout-tablet .art-card {
  border-bottom: var(--line-width) solid var(--art-fg);
  display: flex;
  flex-direction: column;
}

body.layout-phone .art-card:last-child,
body.layout-tablet .art-card:last-child {
  border-bottom: none;
}

body.layout-phone .card-img-wrapper,
body.layout-tablet .card-img-wrapper {
  width: 100%;
  border-bottom: var(--line-width) solid var(--art-fg);
  overflow: hidden;
  background: var(--art-fg);
}

body.layout-phone .card-img-wrapper img,
body.layout-tablet .card-img-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(100%) contrast(1.2);
  transition: transform 0.6s ease, filter 0.4s ease;
}

body.layout-phone .art-card:active .card-img-wrapper img,
body.layout-tablet .art-card:active .card-img-wrapper img {
  filter: grayscale(0%);
  transform: scale(1.05);
}

body.layout-phone .card-meta,
body.layout-tablet .card-meta {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
}

body.layout-phone .card-info,
body.layout-tablet .card-info {
  padding: 16px;
  flex: 1;
}

body.layout-phone .card-info h4,
body.layout-tablet .card-info h4 {
  margin: 0 0 6px 0;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
}

body.layout-phone .card-date,
body.layout-tablet .card-date {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.6;
}

body.layout-phone .card-action,
body.layout-tablet .card-action {
  width: 60px;
  border: none;
  border-left: var(--line-width) solid var(--art-fg);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--art-fg);
  transition: all 0.2s ease;
}

body.layout-phone .art-card:active .card-action,
body.layout-tablet .art-card:active .card-action {
  background: var(--art-accent);
  color: #fff;
  border-color: var(--art-accent);
}

/* 底部导航栏 (Bottom Nav) */
body.layout-phone .art-bottom-nav,
body.layout-tablet .art-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 64px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  background: var(--art-bg);
  border-top: var(--line-width) solid var(--art-fg);
  z-index: 100;
}

body.layout-phone .art-bottom-nav button,
body.layout-tablet .art-bottom-nav button {
  background: transparent;
  border: none;
  border-radius: 0;
  border-right: var(--line-width) solid var(--art-fg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--art-fg);
  font-family: inherit;
  cursor: pointer;
  transition: background 0.2s ease;
}

body.layout-phone .art-bottom-nav button:last-child,
body.layout-tablet .art-bottom-nav button:last-child {
  border-right: none;
}

body.layout-phone .art-bottom-nav button span,
body.layout-tablet .art-bottom-nav button span {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  line-height: 1;
}

body.layout-phone .art-bottom-nav button:active,
body.layout-tablet .art-bottom-nav button:active {
  background: var(--art-accent) !important;
  color: #ffffff;
}

/* Hide original floating navigation and old masonry headers safely for mobile */
body.layout-phone .m-bottom-nav,
body.layout-phone .masonry-header,
body.layout-phone .stela-container,
body.layout-tablet .m-bottom-nav,
body.layout-tablet .masonry-header {
  display: none !important;
}

body.layout-phone .masonry-section,
body.layout-tablet .masonry-section {
    padding: 0 !important;
}
body.layout-phone .masonry-grid,
body.layout-tablet .masonry-grid {
    column-count: 1 !important;
    column-gap: 0 !important;
}
`;

fs.appendFileSync(cssPath, cssToAppend);
console.log('Mobile CSS successfully appended to src/index.css');
