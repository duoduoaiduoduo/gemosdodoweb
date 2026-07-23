// @ts-nocheck

import { detectLayoutMode, isDesktopGrassAllowed } from './layoutMode';

declare global {
  interface Window {
    openModal: (id: string) => void;
    closeModal: (id: string) => void;
    setHomeDetailId: (id: string | null, options?: { replace?: boolean }) => void;
    filterTimeline: (type: string, el: HTMLElement) => void;
    doLogin: () => void;
    adminAddTimeline: () => void;
    adminDeleteTimeline: (index: number) => void;
    adminAddBlock: (type: string) => void;
    adminRemoveBlock: (index: number) => void;
    adminUpdateBlock: (index: number, field: string, value: string) => void;
    adminKillCow: (id: string) => void;
    spawnCow: () => void;
    lucide: any;
    THREE: any;
    currentLang: string;
    currentFilterCode: string;
    setAppLanguage: (lang: string) => void;
    refreshAdminCowList: () => void;
    refreshAdminTimelineList: () => void;
    renderAdminBlocksEditor: () => void;
    openDetailById: (id: string) => void;
    refreshSiteData: () => void;
    navigateApp?: (to: string) => void;
  }
}

window.currentLang = window.currentLang || 'zh';
window.currentFilterCode = window.currentFilterCode || 'all';
window.setAppLanguage = (lang: string) => {
    window.currentLang = lang;
    if(typeof (window as any).initTimelineData === 'function') (window as any).initTimelineData();
    if(typeof (window as any).renderTimeline === 'function') (window as any).renderTimeline(window.currentFilterCode);
    if(typeof (window as any).updatePreview === 'function') (window as any).updatePreview();
    if(document.getElementById('adminModal')?.classList.contains('active')) {
        if(typeof (window as any).refreshAdminCowList === 'function') (window as any).refreshAdminCowList();
        if(typeof (window as any).refreshAdminTimelineList === 'function') (window as any).refreshAdminTimelineList();
        if(typeof (window as any).renderAdminBlocksEditor === 'function') (window as any).renderAdminBlocksEditor();
    }
};

let initialized = false;
let timelineData = [];
let awardsData = [];
let pdfsData = [];
let adminTimelineDraftBlocks = [];
let cowsSeedData = [];
const PENDING_OPEN_DETAIL_KEY = 'gemosdodoweb_pending_open_detail_id';
const DETAIL_MODAL_ID = 'detailModal';
const DETAIL_MODAL_ENTER_MS = 980;
const WORK_VISUAL_EVENT = 'work-visual-state';

export function initApp() {
    if (initialized) return;
    initialized = true;

    // 窗口尺寸变化时用 JS 重算瀑布流列数（避免 CSS columns 在 Safari 的错位）
    let masonryResizeRAF = 0;
    window.addEventListener('resize', () => {
        if (masonryResizeRAF) cancelAnimationFrame(masonryResizeRAF);
        masonryResizeRAF = requestAnimationFrame(() => relayoutMasonry());
    });

    let currentDetailCoverImage = '';
    let detailImageQueueToken = 0;

    const emitWorkVisualState = (active, coverImage = '') => {
        window.dispatchEvent(
            new CustomEvent(WORK_VISUAL_EVENT, {
                detail: { active: !!active, coverImage: String(coverImage || '') },
            }),
        );
    };

    function getCategoryLabel(cat) { 
        const isEn = window.currentLang === 'en';
        const map = isEn ? { 'project': 'Project', 'video': 'Video', 'edu': 'Edu' } : { 'project': '作品', 'video': '视频', 'edu': '教育' }; 
        return map[cat] || (isEn ? 'Record' : '记录'); 
    }

    function attachDeferredDetailImage(img, src) {
        const safeSrc = typeof src === 'string' ? src.trim() : '';
        if (!safeSrc) return;
        img.removeAttribute('src');
        img.setAttribute('data-detail-src', safeSrc);
        img.loading = 'eager';
        img.decoding = 'async';
    }

    function queueDetailImagesTopToBottom(contentContainer) {
        const token = ++detailImageQueueToken;
        const run = async () => {
            const images = Array.from(contentContainer.querySelectorAll('img[data-detail-src]'));
            images.sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                if (Math.abs(ra.top - rb.top) > 1) return ra.top - rb.top;
                return ra.left - rb.left;
            });
            for (const img of images) {
                if (token !== detailImageQueueToken) break;
                const src = img.getAttribute('data-detail-src');
                if (!src) continue;
                await new Promise((resolve) => {
                    let settled = false;
                    const finish = () => {
                        if (settled) return;
                        settled = true;
                        resolve(null);
                    };
                    img.addEventListener('load', finish, { once: true });
                    img.addEventListener('error', finish, { once: true });
                    img.src = src;
                    img.removeAttribute('data-detail-src');
                    if (img.complete) finish();
                });
            }
        };
        requestAnimationFrame(() => {
            void run();
        });
    }

    function renderLayoutContent(layout, contentContainer) {
        if (!layout || layout.version !== 1 || !Array.isArray(layout.elements) || layout.elements.length === 0) {
            return false;
        }

        const canvasWidth = Number(layout.canvas?.width) || 1920;
        const canvasHeight = Number(layout.canvas?.height) || 1080;
        const bgColor = layout.canvas?.bgColor || 'transparent';

        const viewport = document.createElement('div');
        viewport.className = 'detail-layout-viewport';

        const canvas = document.createElement('div');
        canvas.className = 'detail-layout-canvas';
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;
        canvas.style.background = bgColor;

        const sortedElements = [...layout.elements].sort((a, b) => (a.z || 0) - (b.z || 0));
        sortedElements.forEach((el) => {
            const node = document.createElement('div');
            node.className = 'detail-layout-el';
            node.style.left = `${el.x || 0}px`;
            node.style.top = `${el.y || 0}px`;
            node.style.width = `${Math.max(1, el.w || 0)}px`;
            node.style.height = `${Math.max(1, el.h || 0)}px`;
            node.style.zIndex = String(el.z || 0);
            node.style.transform = `rotate(${el.rotation || 0}deg)`;

            if (el.type === 'text') {
                node.classList.add('detail-layout-text');
                node.textContent = el.content || '';
                node.style.color = el.style?.color || 'var(--primary-color)';
                node.style.fontSize = `${Math.max(12, Number(el.style?.fontSize) || 16)}px`;
                node.style.fontWeight = `${Number(el.style?.fontWeight) || 500}`;
                node.style.lineHeight = '1.35';
                node.style.whiteSpace = 'pre-wrap';
                node.style.wordBreak = 'break-word';
            } else if (el.type === 'image') {
                const img = document.createElement('img');
                img.alt = '';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = el.style?.fit === 'contain' ? 'contain' : 'cover';
                img.style.borderRadius = `${Math.max(0, Number(el.style?.radius) || 0)}px`;
                attachDeferredDetailImage(img, el.url || '');
                node.appendChild(img);
            } else {
                return;
            }

            canvas.appendChild(node);
        });

        viewport.appendChild(canvas);
        contentContainer.appendChild(viewport);

        const baseWidth = Math.max(1, canvasWidth);
        const applyScale = () => {
            const scale = Math.min(1, (contentContainer.clientWidth || baseWidth) / baseWidth);
            canvas.style.transform = `scale(${scale})`;
            viewport.style.height = `${canvasHeight * scale}px`;
        };
        applyScale();
        requestAnimationFrame(applyScale);
        return true;
    }

    function renderFlowContent(blocks, contentContainer) {
        if (!Array.isArray(blocks) || blocks.length === 0) return false;
        const flow = document.createElement('div');
        flow.className = 'detail-flow-content';
        blocks.forEach((block) => {
            if (block?.type === 'text') {
                const p = document.createElement('div');
                p.className = 'detail-flow-text';
                p.textContent = window.currentLang === 'en' ? (block.contentEn || block.content || '') : (block.content || '');
                flow.appendChild(p);
            } else if (block?.type === 'image' && block.url) {
                const wrap = document.createElement('div');
                wrap.className = 'detail-flow-image-wrap';
                const img = document.createElement('img');
                img.className = 'detail-flow-image';
                img.alt = block.caption || '';
                attachDeferredDetailImage(img, block.url);
                wrap.appendChild(img);
                const capText = window.currentLang === 'en' ? (block.captionEn || block.caption || '') : (block.caption || '');
                if (capText) {
                    const cap = document.createElement('div');
                    cap.className = 'detail-flow-caption';
                    cap.textContent = capText;
                    wrap.appendChild(cap);
                }
                flow.appendChild(wrap);
            }
        });
        contentContainer.appendChild(flow);
        return true;
    }

    function resolveVideoEmbed(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return null;
        const value = rawUrl.trim();
        if (!value) return null;
        let url;
        try {
            url = new URL(value, window.location.href);
        } catch {
            return null;
        }
        if (!/^https?:$/i.test(url.protocol)) return null;

        const isDirectVideo = /\.(mp4|webm|ogg)(\?|#|$)/i.test(url.href);
        if (isDirectVideo) {
            return { kind: 'video', src: url.href };
        }

        const host = url.hostname.toLowerCase();
        const isBili = host.includes('bilibili.com') || host.includes('b23.tv');
        if (isBili) {
            const bvidFromPath = (url.pathname.match(/BV[0-9A-Za-z]+/i) || [])[0];
            const avFromPath = (url.pathname.match(/av(\d+)/i) || [])[1];
            const bvid = url.searchParams.get('bvid') || bvidFromPath;
            const aid = url.searchParams.get('aid') || avFromPath;
            const page = Number(url.searchParams.get('p') || '1');
            const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
            if (bvid) {
                return {
                    kind: 'iframe',
                    src: `https://player.bilibili.com/player.html?isOutside=true&bvid=${encodeURIComponent(bvid)}&page=${safePage}&p=${safePage}&high_quality=1&as_wide=1&danmaku=0`,
                };
            }
            if (aid) {
                return {
                    kind: 'iframe',
                    src: `https://player.bilibili.com/player.html?isOutside=true&aid=${encodeURIComponent(aid)}&page=${safePage}&p=${safePage}&high_quality=1&as_wide=1&danmaku=0`,
                };
            }
        }

        return { kind: 'iframe', src: url.href };
    }

    function normalizeVideoSources(item, fallbackUrl) {
        const fromItem = Array.isArray(item?.videoSources) ? item.videoSources : [];
        const normalized = fromItem
            .map((source) => {
                const url = typeof source?.url === 'string' ? source.url.trim() : '';
                if (!url) return null;
                return {
                    label: typeof source?.label === 'string' && source.label.trim() ? source.label.trim() : 'Original',
                    url,
                    height: Number(source?.height) || 0,
                    bitrateKbps: Number(source?.bitrateKbps) || 0,
                };
            })
            .filter(Boolean);
        if (normalized.length > 0) return normalized;
        const fallback = typeof fallbackUrl === 'string' ? fallbackUrl.trim() : '';
        if (!fallback) return [];
        return [{ label: 'Original', url: fallback, height: 0, bitrateKbps: 0 }];
    }

    function chooseAutoVideoSource(sources) {
        if (!Array.isArray(sources) || sources.length === 0) return null;
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const effectiveType = String(conn?.effectiveType || '').toLowerCase();
        const downlink = Number(conn?.downlink) || 0;
        const saveData = !!conn?.saveData;
        let preferredHeight = 1080;
        if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g' || (downlink > 0 && downlink < 1.5)) {
            preferredHeight = 480;
        } else if (effectiveType === '3g' || (downlink > 0 && downlink < 5)) {
            preferredHeight = 720;
        }
        const sorted = [...sources].sort((a, b) => (Number(a.height) || 0) - (Number(b.height) || 0));
        const candidate = [...sorted].reverse().find((item) => (Number(item.height) || 9999) <= preferredHeight);
        return candidate || sorted[0] || sources[0];
    }

    function switchVideoSource(video, nextUrl) {
        if (!video || !nextUrl || video.src === nextUrl) return;
        const currentTime = Number(video.currentTime) || 0;
        const wasPaused = video.paused;
        video.src = nextUrl;
        video.load();
        const restore = () => {
            try {
                video.currentTime = currentTime;
            } catch {}
            if (!wasPaused) {
                void video.play().catch(() => {});
            }
            video.removeEventListener('loadedmetadata', restore);
        };
        video.addEventListener('loadedmetadata', restore);
    }

    function renderDetailVideo(item, contentContainer) {
        const videoUrl = item?.videoUrl;
        const resolved = resolveVideoEmbed(videoUrl);
        if (!resolved) return false;

        const wrapper = document.createElement('div');
        wrapper.className = 'detail-video-wrap';

        if (resolved.kind === 'video') {
            const sources = normalizeVideoSources(item, resolved.src);
            const video = document.createElement('video');
            video.className = 'detail-video-frame';
            video.controls = true;
            video.preload = 'metadata';
            video.playsInline = true;
            const autoSource = chooseAutoVideoSource(sources) || sources[0];
            video.src = autoSource?.url || resolved.src;
            wrapper.appendChild(video);

            if (sources.length > 1) {
                const controls = document.createElement('div');
                controls.className = 'detail-video-quality-bar';

                const label = document.createElement('span');
                label.className = 'detail-video-quality-label';
                label.textContent = window.currentLang === 'en' ? 'Quality' : '清晰度';
                controls.appendChild(label);

                const select = document.createElement('select');
                select.className = 'detail-video-quality-select';
                const autoOption = document.createElement('option');
                autoOption.value = '__auto__';
                autoOption.textContent = `${window.currentLang === 'en' ? 'Auto' : '自动'} · ${autoSource?.label || 'Auto'}`;
                select.appendChild(autoOption);
                sources.forEach((source) => {
                    const option = document.createElement('option');
                    option.value = source.url;
                    option.textContent = source.label || 'Original';
                    select.appendChild(option);
                });
                select.value = '__auto__';
                select.addEventListener('change', () => {
                    const nextUrl = select.value === '__auto__'
                        ? (chooseAutoVideoSource(sources)?.url || autoSource?.url || resolved.src)
                        : select.value;
                    switchVideoSource(video, nextUrl);
                });
                controls.appendChild(select);
                wrapper.appendChild(controls);
            }
        } else {
            const iframe = document.createElement('iframe');
            iframe.className = 'detail-video-frame';
            iframe.src = resolved.src;
            iframe.allowFullscreen = true;
            iframe.loading = 'lazy';
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            wrapper.appendChild(iframe);
        }

        contentContainer.appendChild(wrapper);
        return true;
    }

    function renderWorkAwardStack(item) {
        const hero = document.getElementById('detailHero');
        if (!hero) return;
        const prev = hero.querySelector('.detail-work-awards');
        if (prev) prev.remove();

        const linkedAwards = awardsData
            .filter((award) => Array.isArray(award?.workEntryIds) && award.workEntryIds.includes(item.id))
            .slice(0, 6);
        if (linkedAwards.length === 0) return;

        const stack = document.createElement('div');
        stack.className = 'detail-work-awards';
        const stackCards = [];

        const applyHoverState = (hoverIdx) => {
            const hasHover = Number.isInteger(hoverIdx);
            stack.classList.toggle('is-hovering', !!hasHover);
            stackCards.forEach((node, nodeIdx) => {
                const offset = hasHover ? nodeIdx - hoverIdx : 0;
                node.style.setProperty('--detail-hover-diff', String(offset));
                node.classList.toggle('is-hovered', hasHover && nodeIdx === hoverIdx);
            });
        };

        linkedAwards.forEach((award, idx) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'detail-work-award-card';
            card.style.left = `${idx * 18}px`;
            card.style.zIndex = String(40 + idx);
            card.style.setProperty('--detail-stack-index', String(idx));
            card.style.setProperty('--detail-stack-center', String(idx - (linkedAwards.length - 1) / 2));

            const img = document.createElement('img');
            img.src = award.thumbnailImage || award.image || '';
            img.alt = award.title || '';
            img.loading = 'lazy';
            img.decoding = 'async';
            card.appendChild(img);

            const label = document.createElement('span');
            label.textContent = award.title || '';
            card.appendChild(label);

            card.addEventListener('pointerenter', () => applyHoverState(idx));
            card.addEventListener('focus', () => applyHoverState(idx));

            card.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'auto' });
                const target = `/awards?focus=${encodeURIComponent(award.id)}`;
                if (typeof window.navigateApp === 'function') {
                    window.navigateApp(target);
                    return;
                }
                window.location.assign(target);
            });
            stack.appendChild(card);
            stackCards.push(card);
        });
        stack.addEventListener('pointerleave', () => applyHoverState(null));
        stack.addEventListener('focusout', () => {
            if (!stack.contains(document.activeElement)) {
                applyHoverState(null);
            }
        });
        hero.appendChild(stack);
    }

    function renderWorkPdfStack(item) {
        const hero = document.getElementById('detailHero');
        if (!hero) return;
        const prev = hero.querySelector('.detail-work-pdfs');
        if (prev) prev.remove();

        const linkedPdfs = pdfsData
            .filter((pdf) => Array.isArray(pdf?.workEntryIds) && pdf.workEntryIds.includes(item.id))
            .slice(0, 6);
        if (linkedPdfs.length === 0) return;

        const stack = document.createElement('div');
        stack.className = 'detail-work-pdfs';
        linkedPdfs.forEach((pdf, idx) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'detail-work-pdf-card';
            card.style.left = `${idx * 20}px`;
            card.style.zIndex = String(50 + idx);
            card.style.setProperty('--detail-stack-index', String(idx));
            const title = (pdf.title || '').replace(/"/g, '&quot;');
            card.innerHTML = `
                <div class="detail-work-pdf-badge">PDF</div>
                <span title="${title}">${title}</span>
            `;
            card.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'auto' });
                const target = `/pdfs?focus=${encodeURIComponent(pdf.id)}`;
                if (typeof window.navigateApp === 'function') {
                    window.navigateApp(target);
                    return;
                }
                window.location.assign(target);
            });
            stack.appendChild(card);
        });
        hero.appendChild(stack);
    }

    let detailModalOpenTimer = 0;

    function markDetailMotionUnits(contentContainer) {
        if (contentContainer) {
            Array.from(contentContainer.children).forEach((node, index) => {
                if (!(node instanceof HTMLElement)) return;
                node.style.setProperty('--detail-stagger-index', String(index));
            });
        }
        document.querySelectorAll('.detail-work-award-card').forEach((node, index) => {
            if (!(node instanceof HTMLElement)) return;
            node.style.setProperty('--detail-stack-index', String(index));
        });
        document.querySelectorAll('.detail-work-pdf-card').forEach((node, index) => {
            if (!(node instanceof HTMLElement)) return;
            node.style.setProperty('--detail-stack-index', String(index));
        });
    }

    function openDetailModal(item) {
        if (typeof window.setHomeDetailId === 'function' && item?.id) {
            window.setHomeDetailId(String(item.id));
        }
        document.getElementById('detailCategory').textContent = getCategoryLabel(item.category);
        document.getElementById('detailDate').textContent = item.date;
        document.getElementById('detailTitle').textContent = window.currentLang === 'en' ? (item.titleEn || item.title) : item.title;
        
        const placeholderUrl = `https://via.placeholder.com/1200x600/222222/ffffff?text=${encodeURIComponent(getCategoryLabel(item.category))}`;
        document.getElementById('detailHero').style.backgroundImage = `url(${item.image || placeholderUrl})`;
        currentDetailCoverImage = item?.image ? String(item.image) : '';
        emitWorkVisualState(true, currentDetailCoverImage);
        renderWorkAwardStack(item);
        renderWorkPdfStack(item);
        
        const scrollContainer = document.querySelector('.detail-scroll-container');
        if (scrollContainer) scrollContainer.scrollTop = 0;
        
        const contentContainer = document.getElementById('detailRichContent');
        detailImageQueueToken += 1;
        contentContainer.innerHTML = ''; // Clear previous
        renderDetailVideo(item, contentContainer);

        if (item.contentMode === 'flow') {
            if (!renderFlowContent(item.blocks, contentContainer)) {
                const p = document.createElement('div');
                p.className = 'rich-text';
                p.textContent = window.currentLang === 'en' ? (item.descEn || item.desc) : item.desc;
                contentContainer.appendChild(p);
            }
        } else if (renderLayoutContent(item.layout, contentContainer)) {
            // Layout mode rendered, skip legacy blocks.
        } else if (item.blocks && item.blocks.length > 0) {
            item.blocks.forEach(block => {
                if (block.type === 'text') {
                    const p = document.createElement('div');
                    p.className = 'rich-text';
                    p.innerHTML = window.currentLang === 'en' ? (block.contentEn || block.content) : block.content;
                    contentContainer.appendChild(p);
                } else if (block.type === 'image') {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'rich-image-container';
                    const caption = window.currentLang === 'en' ? (block.captionEn || block.caption) : block.caption;
                    const img = document.createElement('img');
                    img.className = 'rich-image';
                    img.alt = caption || '';
                    attachDeferredDetailImage(img, block.url || '');
                    wrapper.appendChild(img);
                    if (caption) {
                        const cap = document.createElement('div');
                        cap.className = 'rich-caption';
                        cap.textContent = caption;
                        wrapper.appendChild(cap);
                    }
                    contentContainer.appendChild(wrapper);
                } else if (block.type === 'gallery') {
                    const grid = document.createElement('div');
                    grid.className = 'rich-gallery';
                    block.urls.forEach(url => {
                        const img = document.createElement('img');
                        attachDeferredDetailImage(img, url || '');
                        grid.appendChild(img);
                    });
                    contentContainer.appendChild(grid);
                }
            });
        } else {
            // Fallback if no blocks
            const p = document.createElement('div');
            p.className = 'rich-text';
            p.textContent = window.currentLang === 'en' ? (item.descEn || item.desc) : item.desc;
            contentContainer.appendChild(p);
        }

        markDetailMotionUnits(contentContainer);
        window.openModal(DETAIL_MODAL_ID);
        queueDetailImagesTopToBottom(contentContainer);
    }

    function openDetailById(id) {
        const item = timelineData.find((it) => it && it.id === id);
        if (!item) return;
        openDetailModal(item);
    }

    function openPendingDetailAfterRefresh() {
        let pendingId = '';
        try {
            pendingId = (window.sessionStorage.getItem(PENDING_OPEN_DETAIL_KEY) || '').trim();
            if (pendingId) window.sessionStorage.removeItem(PENDING_OPEN_DETAIL_KEY);
        } catch {
            pendingId = '';
        }
        if (!pendingId) return;
        window.setTimeout(() => {
            openDetailById(pendingId);
        }, 180);
    }

    const rollerWheel = document.getElementById('rollerWheel');
    const rollerContainer = document.getElementById('rollerContainer');
    let allRollerDOMs = []; 
    let activeRollerItems = [];
    let currentRotation = 0;
    const anglePerItem = 32; 
    const rollerRadius = 450; 
    let snapTimeout; 
    let rollerScrollBound = false;
    let layoutMode = 'desktop';

    function computeLayoutMode() {
        return detectLayoutMode();
    }

    function isCompactRollerMode() {
        return layoutMode !== 'desktop';
    }

    function shouldEnableGrass() {
        return isDesktopGrassAllowed(layoutMode);
    }

    function shouldRenderCows() {
        return layoutMode !== 'phone';
    }

    function clearRenderedCows() {
        cows.forEach((cow) => {
            try {
                clearInterval(cow.wanderInterval);
                cow.el.remove();
            } catch {}
        });
        cows = [];
    }

    function renderCowsByLayout() {
        clearRenderedCows();
        if (!shouldRenderCows()) return;
        if (!Array.isArray(cowsSeedData)) return;
        cowsSeedData.forEach((c) => {
            cows.push(
                new Cow(
                    c.name,
                    c.bodyColor,
                    c.spotColor,
                    c.hornColor,
                    c.noseColor,
                    c.legColor,
                    c.hoofColor,
                    c.tailColor,
                    c.eyeColor,
                    c.eyeStyle,
                    c.spotType,
                    c.bodyShape,
                    c.hornStyle,
                    c.tailStyle,
                    c.message,
                    c.id,
                    c.createdAt
                )
            );
        });
    }

    function applyResponsiveLayoutMode() {
        const prevMode = layoutMode;
        const nextMode = computeLayoutMode();
        if (layoutMode === nextMode) return;
        layoutMode = nextMode;
        document.body.classList.remove('layout-phone', 'layout-tablet', 'layout-desktop');
        document.body.classList.add(`layout-${layoutMode}`);
        if (rollerContainer) {
            rollerContainer.classList.toggle('roller-compact', isCompactRollerMode());
        }
        renderTimeline(window.currentFilterCode || 'all');
        if (prevMode !== layoutMode) {
            renderCowsByLayout();
        }
    }

    function getCategoryLabel(cat) {
        const labels = {
            all: window.currentLang === 'zh' ? '全部' : 'ALL',
            project: window.currentLang === 'zh' ? '作品' : 'PROJECT',
            video: window.currentLang === 'zh' ? '视频' : 'VIDEO',
            edu: window.currentLang === 'zh' ? '教育' : 'EDU'
        };
        return labels[cat] || (window.currentLang === 'zh' ? '纪事' : 'LOG');
    }

    function initTimelineData() {
        rollerWheel.innerHTML = ''; allRollerDOMs = [];
        timelineData.forEach((item) => {
            const coverAspect = getCardAspect(item);
            const [rawW, rawH] = String(coverAspect).split(':').map((n) => Number(n));
            const coverW = Number.isFinite(rawW) && rawW > 0 ? rawW : 4;
            const coverH = Number.isFinite(rawH) && rawH > 0 ? rawH : 3;
            const coverRatio = coverW / coverH;
            const coverClass =
                coverRatio >= 1.35
                    ? 'roller-cover-wide'
                    : coverRatio <= 0.85
                        ? 'roller-cover-tall'
                        : 'roller-cover-square';
            const coverSrc = String(item.thumbnailImage || item.image || '').replace(/"/g, '&quot;');
            const coverHtml = coverSrc
                ? `<div class="roller-cover ${coverClass}" style="--roller-cover-aspect:${coverW} / ${coverH};">
                        <div class="card-image-skeleton"></div>
                        <img src="${coverSrc}" class="card-fade-image" alt="" loading="lazy" decoding="async" 
                             onload="this.classList.add('is-loaded'); if(this.previousElementSibling) this.previousElementSibling.classList.add('is-hidden');">
                   </div>`
                : '';
            const div = document.createElement('div'); div.className = 'roller-item';
            div.innerHTML = `
                <div class="roller-date-left">${item.date}</div>
                <div class="roller-card-shell">
                    <div class="roller-meta-row">
                        <span class="roller-cat-badge">${getCategoryLabel(item.category)}</span>
                        <span class="roller-date-mobile">${item.date}</span>
                    </div>
                    <div class="roller-content-row${coverHtml ? ' has-cover' : ''}">
                        <div class="roller-text-stack">
                            <div class="roller-title">${window.currentLang === 'en' ? (item.titleEn || item.title) : item.title}</div>
                            <div class="roller-desc">${window.currentLang === 'en' ? (item.descEn || item.desc) : item.desc}</div>
                        </div>
                        ${coverHtml}
                    </div>
                </div>
            `;
            div.addEventListener('click', () => openDetailModal(item));
            rollerWheel.appendChild(div); allRollerDOMs.push(div);
        });
    }

    function renderTimeline(filterType) {
        let visibleCount = 0; activeRollerItems = []; currentRotation = 0;

        if (isCompactRollerMode()) {
            allRollerDOMs.forEach((div, index) => {
                const isVisible = filterType === 'all' || timelineData[index].category === filterType;
                div.classList.remove('active', 'adjacent');
                div.style.transform = 'none';
                if (isVisible) {
                    div.classList.remove('hidden-item');
                    activeRollerItems.push(div);
                } else {
                    div.classList.add('hidden-item');
                }
            });
            if (activeRollerItems[0]) activeRollerItems[0].classList.add('active');
            renderMasonry(filterType);
            return;
        }
        
        allRollerDOMs.forEach((div, index) => {
            const isVisible = filterType === 'all' || timelineData[index].category === filterType;
            if (isVisible) {
                const angle = visibleCount * anglePerItem;
                div.style.transform = `translateY(-50%) rotateX(${-angle}deg) translateZ(${rollerRadius}px) scale(1)`;
                div.classList.remove('hidden-item'); activeRollerItems.push(div); visibleCount++;
            } else {
                const match = div.style.transform.match(/rotateX\(([-0-9.]+)deg\)/);
                const currentAngle = match ? match[1] : (-index * anglePerItem);
                div.style.transform = `translateY(-50%) rotateX(${currentAngle}deg) translateZ(${rollerRadius - 250}px) scale(0.5)`;
                div.classList.add('hidden-item'); div.classList.remove('active'); 
            }
        });
        updateRoller();
        renderMasonry(filterType);
    }

    function getCardAspect(item) {
        const allowed = new Set(['3:4', '4:3', '1:1', '16:9', '9:16']);
        return allowed.has(item?.coverAspect) ? item.coverAspect : '3:4';
    }

    function getMasonryCols(width) {
        if (width >= 1200) return 4;
        if (width >= 900) return 3;
        if (width >= 600) return 2;
        return 1;
    }

    // 用绝对定位计算瀑布流（兼容 Safari / Windows，避免 CSS columns + 3D transform 在 Safari 的渲染 bug）
    function relayoutMasonry() {
        const grid = document.getElementById('masonryGrid');
        if (!grid) return;
        const cards = Array.prototype.slice.call(grid.querySelectorAll('.masonry-card'));
        if (cards.length === 0) return;
        const gridWidth = grid.clientWidth;
        if (gridWidth <= 0) return;
        const cols = getMasonryCols(gridWidth);
        const gap = 24;
        const colWidth = (gridWidth - gap * (cols - 1)) / cols;
        const colHeights = new Array(cols).fill(0);
        cards.forEach((card) => {
            const aspect = parseFloat(card.dataset.ratio) || (3 / 4);
            const cardHeight = colWidth / aspect;
            card.style.width = colWidth + 'px';
            card.style.height = Math.round(cardHeight) + 'px';
            // 放入当前最矮的列（标准瀑布流）
            let col = 0;
            for (let i = 1; i < cols; i++) {
                if (colHeights[i] < colHeights[col]) col = i;
            }
            card.style.left = Math.round(col * (colWidth + gap)) + 'px';
            card.style.top = Math.round(colHeights[col]) + 'px';
            colHeights[col] += cardHeight + gap;
        });
        grid.style.height = Math.round(Math.max.apply(null, colHeights)) + 'px';
    }

    function renderMasonry(filterType) {
        const grid = document.getElementById('masonryGrid');
        if (!grid) return;
        grid.innerHTML = '';
        const isMobile = isCompactRollerMode();
        
        let colLeft, colRight;
        if (isMobile) {
            colLeft = document.createElement('div');
            colLeft.className = 'art-masonry-column art-column-left';
            colRight = document.createElement('div');
            colRight.className = 'art-masonry-column art-column-right';
            grid.appendChild(colLeft);
            grid.appendChild(colRight);
        }

        let delayCount = 0;
        let leftHeight = 0;
        let rightHeight = 0;
        // metadataHeight is a rough estimate of the text block height relative to column width (approx 60-80px)
        const metadataHeight = 0.5; 

        timelineData.forEach((item) => {
            if (filterType !== 'all' && item.category !== filterType) return;

            const card = document.createElement('div');
            card.className = isMobile ? 'art-card' : 'masonry-card no-grass';

            const aspectStr = getCardAspect(item);
            const ratio = aspectStr.replace(':', '/');
            const [w, h] = aspectStr.split(':').map(Number);
            const aspect = (w && h) ? (w / h) : (3/4);
            const estimatedCardHeight = (1 / aspect) + metadataHeight;

            const placeholderUrl = `https://via.placeholder.com/600x800/222222/ffffff?text=${encodeURIComponent(getCategoryLabel(item.category))}`;
            const imgSrc = item.thumbnailImage || item.image || placeholderUrl;
            const displayTitle = window.currentLang === 'en' ? (item.titleEn || item.title) : item.title;
            const displayDesc = window.currentLang === 'en' ? (item.descEn || item.desc) : item.desc;

            if (isMobile) {
                // ── Mobile: pure image on top, text block below updated to Neo-Brutalism ──
                card.innerHTML = `
                  <div class="card-img-wrapper">
                    <div class="card-image-skeleton"></div>
                    <img src="${imgSrc}" class="card-fade-image" alt="${displayTitle}" loading="lazy"
                         onload="this.classList.add('is-loaded'); if(this.previousElementSibling) this.previousElementSibling.classList.add('is-hidden');">
                  </div>
                  <div class="card-meta">
                    <div class="card-info">
                      <h4>${displayTitle}</h4>
                      <span class="card-date">${item.date}</span>
                    </div>
                  </div>
                `;
            } else {
                // ── Desktop: 绝对定位瀑布流卡片，鼠标倾斜用内联 transform（不依赖父级 perspective）──
                card.style.aspectRatio = ratio;
                card.dataset.ratio = String(aspect);
                card.style.position = 'absolute';
                card.innerHTML = `
                    <div class="card-image-skeleton"></div>
                    <img src="${imgSrc}" class="masonry-img card-fade-image" alt="${displayTitle}" loading="lazy"
                         onload="this.classList.add('is-loaded'); if(this.previousElementSibling) this.previousElementSibling.classList.add('is-hidden');">
                    ${item.logo ? `<img src="${item.logo}" class="masonry-card-logo" alt="logo">` : ''}
                    <div class="masonry-overlay">
                        <div class="masonry-overlay-inner">
                            <span class="masonry-card-badge">${getCategoryLabel(item.category)}</span>
                            <div class="masonry-card-title">${displayTitle}</div>
                            <div class="masonry-card-desc">${displayDesc}</div>
                            <div class="masonry-card-date">${item.date}</div>
                        </div>
                    </div>
                `;

                // 鼠标移动时做轻微 3D 倾斜（Safari 下不再与 CSS columns 冲突，hover 稳定）
                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const rotateX = ((e.clientY - rect.top - rect.height / 2) / (rect.height / 2)) * -12;
                    const rotateY = ((e.clientX - rect.left - rect.width / 2) / (rect.width / 2)) * 12;
                    card.style.transform = `perspective(1000px) translateY(-15px) scale(1.03) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
                });
                card.addEventListener('mouseleave', () => { card.style.transform = ''; });
            }

            card.addEventListener('click', () => openDetailModal(item));
            card.style.animation = `cardFadeIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) backwards ${delayCount * 0.05}s`;
            
            if (isMobile) {
                // Distribute to the shorter column
                if (leftHeight <= rightHeight) {
                    colLeft.appendChild(card);
                    leftHeight += estimatedCardHeight;
                } else {
                    colRight.appendChild(card);
                    rightHeight += estimatedCardHeight;
                }
            } else {
                grid.appendChild(card);
            }

            delayCount++;
        });

        if (!isMobile) {
            relayoutMasonry();
        }
    }

    function filterTimeline(filterType, element) {
        window.currentFilterCode = filterType;
        clearTimeout(snapTimeout);
        // NOTE: Active class state is now managed by React components (DesktopFilterSidebar, TouchHome).
        // We only update the content here.
        renderTimeline(filterType);
    }

    function initRollerScroll() {
        if (rollerScrollBound) return;
        rollerScrollBound = true;
        const container = document.getElementById('rollerContainer');
        container.addEventListener('wheel', (e) => {
            if (isCompactRollerMode()) return;
            if(activeRollerItems.length === 0) return;
            const maxRotation = Math.max(0, (activeRollerItems.length - 1) * anglePerItem);
            
            if ((e.deltaY < 0 && currentRotation <= 0) || (e.deltaY > 0 && currentRotation >= maxRotation)) {
                return;
            }
            
            e.preventDefault(); 
            handleRollerMovement(e.deltaY * 0.12);
        }, { passive: false });

        let touchStartY = 0;
        container.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
        container.addEventListener('touchmove', (e) => {
            if (isCompactRollerMode()) return;
            if(activeRollerItems.length === 0) return;
            const touchY = e.touches[0].clientY;
            const deltaY = touchStartY - touchY;
            
            const maxRotation = Math.max(0, (activeRollerItems.length - 1) * anglePerItem);
            if ((deltaY < 0 && currentRotation <= 0) || (deltaY > 0 && currentRotation >= maxRotation)) {
                touchStartY = touchY;
                return;
            }
            
            if (e.cancelable) e.preventDefault(); 
            touchStartY = touchY;
            handleRollerMovement(deltaY * 0.3); 
        }, { passive: false });
    }

    function handleRollerMovement(deltaAngle) {
        if (isCompactRollerMode()) return;
        const maxRotation = Math.max(0, (activeRollerItems.length - 1) * anglePerItem);
        currentRotation += deltaAngle;
        if (currentRotation < 0) currentRotation = 0;
        if (currentRotation > maxRotation) currentRotation = maxRotation;
        updateRoller();

        clearTimeout(snapTimeout);
        snapTimeout = setTimeout(() => {
            let targetIndex = Math.round(currentRotation / anglePerItem);
            targetIndex = Math.max(0, Math.min(targetIndex, activeRollerItems.length - 1));
            currentRotation = targetIndex * anglePerItem;
            updateRoller();
        }, 800); 
    }

    function updateRoller() {
        if (isCompactRollerMode()) {
            rollerWheel.style.transform = 'none';
            return;
        }
        rollerWheel.style.transform = `translateZ(${-rollerRadius}px) rotateX(${currentRotation}deg)`;
        if(activeRollerItems.length === 0) return;
        let activeIndex = Math.round(currentRotation / anglePerItem);
        if (activeIndex < 0) activeIndex = 0;
        if (activeIndex >= activeRollerItems.length) activeIndex = activeRollerItems.length - 1;
        activeRollerItems.forEach((item, i) => {
            item.classList.remove('active', 'adjacent');
            if (i === activeIndex) { 
                item.classList.add('active'); 
            } else if (Math.abs(i - activeIndex) === 1) {
                item.classList.add('adjacent');
            }
        });
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;

        if (id === DETAIL_MODAL_ID) {
            modal.classList.remove('detail-modal-closing');
            modal.classList.remove('detail-modal-composing');
            modal.classList.remove('active');
            void modal.offsetWidth;
            modal.classList.add('detail-modal-composing');
            modal.classList.add('active');
            clearTimeout(detailModalOpenTimer);
            detailModalOpenTimer = window.setTimeout(() => {
                modal.classList.remove('detail-modal-composing');
            }, DETAIL_MODAL_ENTER_MS);
            emitWorkVisualState(true, currentDetailCoverImage);
            return;
        }

        modal.classList.add('active');
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;

        if (id === DETAIL_MODAL_ID) {
            clearTimeout(detailModalOpenTimer);
            detailImageQueueToken += 1;
            modal.classList.remove('detail-modal-closing');
            modal.classList.remove('detail-modal-composing');
            modal.classList.remove('active');
            if (typeof window.setHomeDetailId === 'function') {
                window.setHomeDetailId(null, { replace: true });
            }
            currentDetailCoverImage = '';
            emitWorkVisualState(false, '');
            return;
        }

        modal.classList.remove('active');
    }

    function doLogin() {
        if (document.getElementById('adminUser').value === '15168781256' && document.getElementById('adminPass').value === 'Qq13209985101') {
            closeModal('loginModal');
            document.getElementById('adminUser').value = ''; document.getElementById('adminPass').value = '';
            refreshAdminCowList();
            refreshAdminTimelineList();
            renderAdminBlocksEditor();
            openModal('adminModal');
        } else { alert(window.currentLang === 'en' ? 'Auth failed!' : '身份验证失败'); }
    }

    function getRichBlockTypeLabel(type) {
        const isEn = window.currentLang === 'en';
        if (type === 'text') return isEn ? 'Text' : '文本';
        if (type === 'image') return isEn ? 'Image' : '图片';
        return isEn ? 'Gallery' : '图集';
    }

    function renderAdminBlocksEditor() {
        const container = document.getElementById('adminBlocksEditor');
        if (!container) return;

        if (adminTimelineDraftBlocks.length === 0) {
            const emptyText = window.currentLang === 'en'
                ? 'No rich content blocks yet. Use buttons above to build your layout.'
                : '当前还没有图文块，可使用上方按钮进行排版。';
            container.innerHTML = `<div class="admin-empty">${emptyText}</div>`;
            return;
        }

        const isEn = window.currentLang === 'en';
        container.innerHTML = adminTimelineDraftBlocks.map((block, index) => {
            if (block.type === 'text') {
                return `
                    <div class="admin-block-item">
                        <div class="admin-block-head">
                            <span>${index + 1}. ${getRichBlockTypeLabel(block.type)}</span>
                            <button class="del-btn" onclick="window.adminRemoveBlock(${index})">${isEn ? 'Delete' : '删除'}</button>
                        </div>
                        <textarea class="admin-textarea" placeholder="${isEn ? 'Text content' : '文本内容'}" oninput="window.adminUpdateBlock(${index}, 'content', this.value)">${block.content || ''}</textarea>
                        <textarea class="admin-textarea" placeholder="${isEn ? 'English content (optional)' : '英文内容（可选）'}" oninput="window.adminUpdateBlock(${index}, 'contentEn', this.value)">${block.contentEn || ''}</textarea>
                    </div>
                `;
            }

            if (block.type === 'image') {
                return `
                    <div class="admin-block-item">
                        <div class="admin-block-head">
                            <span>${index + 1}. ${getRichBlockTypeLabel(block.type)}</span>
                            <button class="del-btn" onclick="window.adminRemoveBlock(${index})">${isEn ? 'Delete' : '删除'}</button>
                        </div>
                        <input class="admin-inline-input" type="text" placeholder="${isEn ? 'Image URL' : '图片 URL'}" value="${block.url || ''}" oninput="window.adminUpdateBlock(${index}, 'url', this.value)" />
                        <input class="admin-inline-input" type="text" placeholder="${isEn ? 'Caption (optional)' : '图注（可选）'}" value="${block.caption || ''}" oninput="window.adminUpdateBlock(${index}, 'caption', this.value)" />
                        <input class="admin-inline-input" type="text" placeholder="${isEn ? 'Caption EN (optional)' : '英文图注（可选）'}" value="${block.captionEn || ''}" oninput="window.adminUpdateBlock(${index}, 'captionEn', this.value)" />
                    </div>
                `;
            }

            return `
                <div class="admin-block-item">
                    <div class="admin-block-head">
                        <span>${index + 1}. ${getRichBlockTypeLabel(block.type)}</span>
                        <button class="del-btn" onclick="window.adminRemoveBlock(${index})">${isEn ? 'Delete' : '删除'}</button>
                    </div>
                    <textarea class="admin-textarea" placeholder="${isEn ? 'One image URL per line' : '每行一个图片 URL'}" oninput="window.adminUpdateBlock(${index}, 'urlsText', this.value)">${block.urlsText || ''}</textarea>
                </div>
            `;
        }).join('');
    }

    function adminAddBlock(type) {
        if (type === 'text') {
            adminTimelineDraftBlocks.push({ type: 'text', content: '', contentEn: '' });
        } else if (type === 'image') {
            adminTimelineDraftBlocks.push({ type: 'image', url: '', caption: '', captionEn: '' });
        } else if (type === 'gallery') {
            adminTimelineDraftBlocks.push({ type: 'gallery', urlsText: '' });
        }
        renderAdminBlocksEditor();
    }

    function adminRemoveBlock(index) {
        if (index < 0 || index >= adminTimelineDraftBlocks.length) return;
        adminTimelineDraftBlocks.splice(index, 1);
        renderAdminBlocksEditor();
    }

    function adminUpdateBlock(index, field, value) {
        if (!adminTimelineDraftBlocks[index]) return;
        adminTimelineDraftBlocks[index][field] = value;
    }

    function buildBlocksForSubmit() {
        return adminTimelineDraftBlocks
            .map((block) => {
                if (block.type === 'text') {
                    const content = (block.content || '').trim();
                    if (!content) return null;
                    return { type: 'text', content, contentEn: (block.contentEn || '').trim() };
                }
                if (block.type === 'image') {
                    const url = (block.url || '').trim();
                    if (!url) return null;
                    return {
                        type: 'image',
                        url,
                        caption: (block.caption || '').trim(),
                        captionEn: (block.captionEn || '').trim(),
                    };
                }
                const urls = (block.urlsText || '')
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean);
                if (urls.length === 0) return null;
                return { type: 'gallery', urls };
            })
            .filter(Boolean);
    }

    function refreshAdminTimelineList() {
        const list = document.getElementById('adminTimelineList');
        if (!list) return;
        list.innerHTML = '';

        if (timelineData.length === 0) {
            list.innerHTML = `<div class="admin-empty">${window.currentLang === 'en' ? 'No timeline entries' : '当前没有时间轴条目'}</div>`;
            return;
        }

        timelineData.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'timeline-list-item';
            row.innerHTML = `
                <span>
                    <b>${window.currentLang === 'en' ? (item.titleEn || item.title) : item.title}</b>
                    <span style="color:#999; font-size:0.75rem;">(${item.date} / ${getCategoryLabel(item.category)})</span>
                </span>
                <button class="del-btn" onclick="window.adminDeleteTimeline(${index})">${window.currentLang === 'en' ? 'Delete' : '删除'}</button>
            `;
            list.appendChild(row);
        });
    }

    async function adminAddTimeline() {
        const cat = document.getElementById('addType').value;
        const date = document.getElementById('addDate').value || 'Now';
        const title = document.getElementById('addTitle').value || '未命名纪事';
        const desc = document.getElementById('addDesc').value || '';
        const imageUrl = document.getElementById('addImage').value || '';
        const blocks = buildBlocksForSubmit();

        const newItem = { category: cat, date: date, title: title, desc: desc, image: imageUrl, blocks };

        try {
            const res = await fetch('/api/timeline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newItem)
            });
            if(res.ok) {
                timelineData.unshift(newItem);
                initTimelineData();
                renderTimeline(window.currentFilterCode);
                refreshAdminTimelineList();

                document.getElementById('addTitle').value = '';
                document.getElementById('addDesc').value = '';
                document.getElementById('addImage').value = '';
                adminTimelineDraftBlocks = [];
                renderAdminBlocksEditor();
                alert(window.currentLang === 'en' ? 'Published successfully!' : '发布成功');
            } else {
                alert('API Error');
            }
        } catch (e) {
            console.error(e);
            alert('Failed to publish! Is Backend running?');
        }
    }

    async function adminDeleteTimeline(index) {
        if (index < 0 || index >= timelineData.length) return;
        try {
            const res = await fetch('/api/timeline/' + index, { method: 'DELETE' });
            if (res.ok) {
                timelineData.splice(index, 1);
                initTimelineData();
                renderTimeline(window.currentFilterCode);
                refreshAdminTimelineList();
            } else {
                alert(window.currentLang === 'en' ? 'Delete failed' : '删除失败');
            }
        } catch (e) {
            console.error(e);
            alert(window.currentLang === 'en' ? 'Delete failed! Is Backend running?' : '删除失败，请确认后端是否运行');
        }
    }

    function refreshAdminCowList() {
        const list = document.getElementById('adminCowList'); list.innerHTML = '';
        if(cows.length === 0) { list.innerHTML = `<div style="color:#999; text-align:center; padding:10px;">${window.currentLang === 'en' ? 'No active cows' : '当前没有活跃的牛牛'}</div>`; return; }
        cows.forEach(cow => {
            const item = document.createElement('div'); item.className = 'cow-list-item';
            item.innerHTML = `<span><b>${cow.name}</b> <span style="color:#999; font-size:0.75rem;">(${cow.createdAt})</span></span><button class="del-btn" onclick="window.adminKillCow('${cow.id}')">${window.currentLang === 'en' ? 'Release' : '放生'}</button>`;
            list.appendChild(item);
        });
    }

    async function adminKillCow(id) {
        const cowIndex = cows.findIndex(c => c.id === id);
        if(cowIndex > -1) { 
            try {
                const res = await fetch('/api/cows/' + id, { method: 'DELETE' });
                if(res.ok) {
                    cows[cowIndex].el.remove(); clearInterval(cows[cowIndex].wanderInterval); cows.splice(cowIndex, 1); refreshAdminCowList(); 
                }
            } catch (e) {
                console.error(e);
                alert('Failed to release cow! Is Backend running?');
            }
        }
    }

    let cows = []; let grassList = [];

    function getCowSVG(bodyColor, spotColor, hornColor, noseColor, legColor, hoofColor, tailColor, eyeColor, eyeStyle, spotType, bodyShape, hornStyle, tailStyle) {
        let bodySVG = '';
        if (bodyShape === 'chubby') bodySVG = `<rect x="15" y="38" width="70" height="42" rx="21" fill="${bodyColor}" stroke="#333" stroke-width="2"/>`;
        else if (bodyShape === 'boxy') bodySVG = `<rect x="20" y="40" width="60" height="35" rx="4" fill="${bodyColor}" stroke="#333" stroke-width="2"/>`;
        else bodySVG = `<rect x="20" y="40" width="60" height="35" rx="12" fill="${bodyColor}" stroke="#333" stroke-width="2"/>`;

        let hornSVG = '';
        if (hornStyle === 'long') hornSVG = `<path d="M 68 25 Q 55 5 75 5" stroke="${hornColor}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M 82 25 Q 95 5 75 5" stroke="${hornColor}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
        else if (hornStyle === 'devil') hornSVG = `<path d="M 68 25 L 62 10 L 71 18 Z" fill="${hornColor}" stroke="#333" stroke-width="1.5"/><path d="M 82 25 L 88 10 L 79 18 Z" fill="${hornColor}" stroke="#333" stroke-width="1.5"/>`;
        else hornSVG = `<path d="M 68 25 Q 65 15 70 15" stroke="${hornColor}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M 82 25 Q 85 15 80 15" stroke="${hornColor}" stroke-width="3" fill="none" stroke-linecap="round"/>`;

        let tailSVG = ''; let tailTipColor = (spotColor === 'none' ? tailColor : spotColor);
        if (tailStyle === 'curly') tailSVG = `<path d="M 22 45 C 5 45 5 55 15 55 C 22 55 22 65 10 65" stroke="${tailColor}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="10" cy="65" r="4" fill="${tailTipColor}"/>`;
        else if (tailStyle === 'lightning') tailSVG = `<polyline points="22,45 15,50 20,55 10,65" stroke="${tailColor}" stroke-width="3" fill="none" stroke-linejoin="round"/><polygon points="10,65 6,70 14,70" fill="${tailTipColor}"/>`;
        else tailSVG = `<path d="M 22 45 Q 10 45 10 60" stroke="${tailColor}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="10" cy="60" r="4" fill="${tailTipColor}"/>`;

        let eyeSVG = '';
        if (eyeStyle === 'happy') eyeSVG = `<path d="M 70 32 Q 72 29 74 32 M 80 32 Q 82 29 84 32" stroke="${eyeColor}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
        else if (eyeStyle === 'sleepy') eyeSVG = `<path d="M 70 33 Q 72 35 74 33 M 80 33 Q 82 35 84 33" stroke="${eyeColor}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
        else eyeSVG = `<circle cx="72" cy="32" r="2.5" fill="${eyeColor}"/><circle cx="82" cy="32" r="2.5" fill="${eyeColor}"/>`;

        let spotSVG = '';
        if (spotType === 'classic') spotSVG = `<circle cx="35" cy="55" r="8" fill="${spotColor}"/><path d="M 60 40 Q 70 40 70 50 Q 60 55 55 45 Z" fill="${spotColor}"/>`;
        else if (spotType === 'heart') spotSVG = `<path d="M 46 50 A 5 5 0 0 1 54 50 A 5 5 0 0 1 62 50 Q 62 58 54 66 Q 46 58 46 50 Z" fill="${spotColor}"/>`;

        return `<svg viewBox="0 0 100 100" width="100%" height="100%">${tailSVG}<rect x="25" y="70" width="8" height="15" rx="3" fill="${legColor}"/><rect x="40" y="70" width="8" height="15" rx="3" fill="${legColor}"/><rect x="65" y="70" width="8" height="15" rx="3" fill="${legColor}"/><rect x="25" y="80" width="8" height="5" rx="2" fill="${hoofColor}"/><rect x="40" y="80" width="8" height="5" rx="2" fill="${hoofColor}"/><rect x="65" y="80" width="8" height="5" rx="2" fill="${hoofColor}"/>${bodySVG}${spotSVG}<rect x="65" y="25" width="25" height="30" rx="8" fill="${bodyColor}" stroke="#333" stroke-width="2"/><rect x="70" y="40" width="20" height="15" rx="4" fill="${noseColor}" stroke="#333" stroke-width="1.5"/><circle cx="75" cy="45" r="2" fill="rgba(0,0,0,0.3)"/><circle cx="85" cy="45" r="2" fill="rgba(0,0,0,0.3)"/>${eyeSVG}${hornSVG}</svg>`;
    }

    function getCowSpawnPoint() {
        const avatar = document.querySelector('.avatar-unlock-hit');
        const scrollY = window.scrollY || 0;
        let baseX = 80;
        let baseY = 110 + scrollY;

        if (avatar && typeof avatar.getBoundingClientRect === 'function') {
            const rect = avatar.getBoundingClientRect();
            baseX = rect.left + rect.width * 0.5;
            baseY = rect.top + rect.height + 26 + scrollY;
        }

        // Add small jitter so multiple cows do not overlap completely.
        const jitterX = (Math.random() - 0.5) * 28;
        const jitterY = (Math.random() - 0.5) * 16;
        const x = Math.max(40, Math.min(window.innerWidth - 40, baseX + jitterX));
        const y = Math.max(scrollY + 56, baseY + jitterY);
        return {x, y};
    }

    class Cow {
        constructor(name, bodyColor, spotColor, hornColor, noseColor, legColor, hoofColor, tailColor, eyeColor, eyeStyle, spotType, bodyShape, hornStyle, tailStyle, message, existingId, existingCreatedAt) {
            this.id = existingId || 'cow_' + Date.now() + '_' + Math.floor(Math.random()*1000);
            const spawn = getCowSpawnPoint();
            this.x = spawn.x; this.y = spawn.y; this.targetX = this.x; this.targetY = this.y;
            this.speed = 1.2 + Math.random() * 0.8; this.state = 'IDLE'; this.facingRight = true; this.targetGrass = null; this.name = name;

            this.message = message || (window.currentLang === 'en' ? "This cow is shy and just left a footprint." : "这只牛牛很害羞，只留下了一个脚印。");
            const now = new Date(); const pad = (num) => String(num).padStart(2, '0');
            this.createdAt = existingCreatedAt || `${now.getFullYear()}.${pad(now.getMonth()+1)}.${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

            this.el = document.createElement('div'); this.el.className = 'cow-entity no-grass';
            this.el.style.position = 'absolute';
            
            this.nameEl = document.createElement('div'); this.nameEl.className = 'cow-name'; this.nameEl.innerText = name;
            this.spriteEl = document.createElement('div'); this.spriteEl.className = 'cow-sprite';
            this.spriteEl.innerHTML = getCowSVG(bodyColor, spotColor, hornColor, noseColor, legColor, hoofColor, tailColor, eyeColor, eyeStyle, spotType, bodyShape, hornStyle, tailStyle);

            this.el.appendChild(this.nameEl); this.el.appendChild(this.spriteEl); document.body.appendChild(this.el);
            this.el.addEventListener('click', () => { 
                document.getElementById('msgDialogName').innerText = window.currentLang === 'en' ? `${name}'s Message` : `${name} 留下的信`;
                document.getElementById('msgDialogTime').innerText = window.currentLang === 'en' ? `Hatched at ${this.createdAt}` : `孵化于 ${this.createdAt}`;
                document.getElementById('msgDialogContent').innerText = this.message;
                openModal('messageDialog'); 
            });
            
            this.wanderInterval = setInterval(() => this.randomWander(), 3000 + Math.random() * 2000); this.update();
        }

        randomWander() {
        if ((this.state === 'IDLE' || this.state === 'WANDERING') && grassList.length === 0) {
                const scrollY = window.scrollY;
                this.targetX = 100 + Math.random() * (window.innerWidth - 200); 
                this.targetY = scrollY + 100 + Math.random() * (window.innerHeight - 200);
                this.state = 'WANDERING'; this.el.classList.add('walking'); this.el.classList.remove('eating');
            }
        }

        eat(grass) {
            this.state = 'EATING'; this.el.classList.remove('walking'); this.el.classList.add('eating');
            if (grass.el.parentNode) grass.el.remove(); grassList = grassList.filter(g => g !== grass);
            setTimeout(() => { this.state = 'IDLE'; this.el.classList.remove('eating'); this.checkGrass(); }, 2000);
        }

        checkGrass() {
            if (grassList.length > 0) {
                let closestGrass = grassList[0]; let minDist = Infinity;
                grassList.forEach(g => { let dist = Math.sqrt(Math.pow(g.x - this.x, 2) + Math.pow(g.y - this.y, 2)); if(dist < minDist) { minDist = dist; closestGrass = g; } });
                this.targetGrass = closestGrass; this.targetX = closestGrass.x; this.targetY = closestGrass.y;
                this.state = 'SEEKING'; this.el.classList.add('walking'); this.el.classList.remove('eating');
            }
        }

        update() {
            if (this.state === 'WANDERING' || this.state === 'SEEKING') {
                if (this.state === 'SEEKING' && !grassList.includes(this.targetGrass)) { this.checkGrass(); if(this.state !== 'SEEKING') this.randomWander(); }
                let dx = this.targetX - this.x; let dy = this.targetY - this.y; let dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 5) { if (this.state === 'SEEKING' && grassList.includes(this.targetGrass)) { this.eat(this.targetGrass); } else { this.state = 'IDLE'; this.el.classList.remove('walking'); } } 
                else { this.x += (dx / dist) * this.speed; this.y += (dy / dist) * this.speed; }
                if (dx > 0) this.facingRight = true; else if (dx < 0) this.facingRight = false;
            }
            this.el.style.transform = `translate(${this.x - 30}px, ${this.y - 60}px)`;
            this.spriteEl.style.transform = this.facingRight ? 'scaleX(1)' : 'scaleX(-1)';
            requestAnimationFrame(() => this.update());
        }
    }

    const inputs = ['cowNameInput', 'bodyColorInput', 'spotColorInput', 'hornColorInput', 'noseColorInput', 'legColorInput', 'hoofColorInput', 'tailColorInput', 'eyeColorInput', 'eyeStyleInput', 'spotTypeInput', 'bodyShapeInput', 'hornStyleInput', 'tailStyleInput'];
    inputs.forEach(id => {
        const el = document.getElementById(id); 
        if(el) {
            el.addEventListener('input', updatePreview);
            if(el.tagName === 'SELECT') el.addEventListener('change', updatePreview);
        }
    });

    function updatePreview() {
        const getVal = (id) => document.getElementById(id)?.value;
        const previewContainer = document.getElementById('cowPreviewContainer');
        if(previewContainer) {
            previewContainer.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center;"><div class="cow-name" style="position: relative; top: 10px; z-index: 2;">${getVal('cowNameInput') || (window.currentLang === 'en' ? 'Unknown Cow' : '未知牛牛')}</div><div style="width: 80px; height: 80px;">${getCowSVG(getVal('bodyColorInput'), getVal('spotColorInput'), getVal('hornColorInput'), getVal('noseColorInput'), getVal('legColorInput'), getVal('hoofColorInput'), getVal('tailColorInput'), getVal('eyeColorInput'), getVal('eyeStyleInput'), getVal('spotTypeInput'), getVal('bodyShapeInput'), getVal('hornStyleInput'), getVal('tailStyleInput'))}</div></div>`;
        }
    }

    async function spawnCow() {
        if (!shouldRenderCows()) {
            closeModal('diyPanel');
            return;
        }
        const getVal = (id) => document.getElementById(id)?.value;
        const newCowData = {
           name: getVal('cowNameInput') || (window.currentLang === 'en' ? 'Nameless Cow' : '无名牛牛'),
           bodyColor: getVal('bodyColorInput'),
           spotColor: getVal('spotColorInput'),
           hornColor: getVal('hornColorInput'),
           noseColor: getVal('noseColorInput'),
           legColor: getVal('legColorInput'),
           hoofColor: getVal('hoofColorInput'),
           tailColor: getVal('tailColorInput'),
           eyeColor: getVal('eyeColorInput'),
           eyeStyle: getVal('eyeStyleInput'),
           spotType: getVal('spotTypeInput'),
           bodyShape: getVal('bodyShapeInput'),
           hornStyle: getVal('hornStyleInput'),
           tailStyle: getVal('tailStyleInput'),
           message: getVal('cowMessageInput')
        };

        const now = new Date(); const pad = (num) => String(num).padStart(2, '0');
        const createdAt = `${now.getFullYear()}.${pad(now.getMonth()+1)}.${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const id = 'cow_' + Date.now() + '_' + Math.floor(Math.random()*1000);

        try {
            const res = await fetch('/api/cows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...newCowData, id, createdAt })
            });
            if(res.ok) {
                cows.push(new Cow(newCowData.name, newCowData.bodyColor, newCowData.spotColor, newCowData.hornColor, newCowData.noseColor, newCowData.legColor, newCowData.hoofColor, newCowData.tailColor, newCowData.eyeColor, newCowData.eyeStyle, newCowData.spotType, newCowData.bodyShape, newCowData.hornStyle, newCowData.tailStyle, newCowData.message, id, createdAt));
            }
        } catch(e) {
            cows.push(new Cow(newCowData.name, newCowData.bodyColor, newCowData.spotColor, newCowData.hornColor, newCowData.noseColor, newCowData.legColor, newCowData.hoofColor, newCowData.tailColor, newCowData.eyeColor, newCowData.eyeStyle, newCowData.spotType, newCowData.bodyShape, newCowData.hornStyle, newCowData.tailStyle, newCowData.message, id, createdAt));
        }

        document.getElementById('cowMessageInput').value = ''; closeModal('diyPanel'); 
        if(document.getElementById('adminModal')?.classList.contains('active')) { refreshAdminCowList(); }
    }

    window.openModal = openModal;
    window.closeModal = closeModal;
    window.filterTimeline = filterTimeline;
    window.doLogin = doLogin;
    window.adminAddTimeline = adminAddTimeline;
    window.adminDeleteTimeline = adminDeleteTimeline;
    window.adminAddBlock = adminAddBlock;
    window.adminRemoveBlock = adminRemoveBlock;
    window.adminUpdateBlock = adminUpdateBlock;
    window.adminKillCow = adminKillCow;
    window.spawnCow = spawnCow;
    window.initTimelineData = initTimelineData;
    window.renderTimeline = renderTimeline;
    window.updatePreview = updatePreview;
    window.refreshAdminCowList = refreshAdminCowList;
    window.refreshAdminTimelineList = refreshAdminTimelineList;
    window.renderAdminBlocksEditor = renderAdminBlocksEditor;
    window.openDetailById = openDetailById;

    function plantGrass(clientX, clientY, target) {
        if (!shouldEnableGrass()) return;
        if (target.closest('.no-grass')) return;
        
        const scrollY = window.scrollY;
        
        let grass = { x: clientX, y: clientY + scrollY, el: document.createElement('div') }; 
        grass.el.className = 'grass'; grass.el.innerHTML = '🌱'; 
        grass.el.style.left = grass.x + 'px'; grass.el.style.top = grass.y + 'px'; 
        document.body.appendChild(grass.el);
        
        grassList.push(grass); cows.forEach(cow => { if(cow.state !== 'EATING') cow.checkGrass(); });
    }

    let lastTouchTime = 0;
    window.addEventListener('touchstart', (e) => {
        lastTouchTime = Date.now();
        if(e.touches.length > 0) {
            plantGrass(e.touches[0].clientX, e.touches[0].clientY, e.target);
        }
    }, {passive: true});

    window.addEventListener('click', (e) => {
        if (Date.now() - lastTouchTime < 500) return;
        plantGrass(e.clientX, e.clientY, e.target);
    });

    if (window.lucide) {
        window.lucide.createIcons(); 
    }
    
    layoutMode = computeLayoutMode();
    document.body.classList.add(`layout-${layoutMode}`);
    if (rollerContainer) {
        rollerContainer.classList.toggle('roller-compact', isCompactRollerMode());
    }
    window.addEventListener('resize', applyResponsiveLayoutMode);
    window.addEventListener('orientationchange', applyResponsiveLayoutMode);
    window.addEventListener('pageshow', applyResponsiveLayoutMode);

    // WeChat / in-app WebView fix: viewport dimensions can be wrong at sync init.
    // Re-detect once after first paint (rAF) and again after 300ms for slower engines.
    const recheckLayout = () => {
        const detected = computeLayoutMode();
        if (detected !== layoutMode) {
            layoutMode = detected;
            document.body.classList.remove('layout-phone', 'layout-tablet', 'layout-desktop');
            document.body.classList.add(`layout-${layoutMode}`);
            if (rollerContainer) {
                rollerContainer.classList.toggle('roller-compact', isCompactRollerMode());
            }
            renderTimeline(window.currentFilterCode || 'all');
        }
    };
    requestAnimationFrame(() => {
        recheckLayout();
        setTimeout(recheckLayout, 300);
    });

    const markSiteEntered = () => {
        if (!document.body.classList.contains('site-entered')) {
            document.body.classList.add('site-entered');
        }
    };
    const siteEnterFallbackTimer = window.setTimeout(markSiteEntered, 1200);

    function refreshSiteData() {
        fetch('/api/data')
            .then(res => res.json())
            .then(data => {
                timelineData = (data.timeline || []).filter((item) => item?.category !== 'award');
                awardsData = data.awards || [];
                pdfsData = data.pdfs || [];
                cowsSeedData = Array.isArray(data.cows) ? data.cows : [];
                renderCowsByLayout();

                initTimelineData();
                renderTimeline(window.currentFilterCode || 'all');
                initRollerScroll();
                updatePreview();
                renderAdminBlocksEditor();
                setTimeout(markSiteEntered, 100);
                openPendingDetailAfterRefresh();
            })
            .catch(err => {
                console.error('Failed to load data', err);
                initTimelineData();
                renderTimeline('all');
                initRollerScroll();
                markSiteEntered();
                openPendingDetailAfterRefresh();
            })
            .finally(() => {
                clearTimeout(siteEnterFallbackTimer);
            });
    }

    window.refreshSiteData = refreshSiteData;
    refreshSiteData();
}



