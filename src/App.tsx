import { ReactNode, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock, Copy, BookOpen, PenTool, Code2, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { initApp } from './script';
import AdminStudio from './AdminStudio';
import AwardsPage from './AwardsPage';
import PdfsPage from './PdfsPage';
import JournalPage from './JournalPage';
import VibecodingPage from './VibecodingPage';
import VibecodingLaunchPage from './VibecodingLaunchPage';
import PasturePage from './PasturePage';
import { getAppBridge } from './appBridge';
import { runLanguageErosionTransition } from './langErosion';
import { detectLayoutMode, type LayoutMode } from './layoutMode';
import ParticleBackdrop from './ParticleBackdrop';

const ProposalPdfPage = lazy(() => import('./ProposalPdfPage'));

type AppLang = 'zh' | 'en';
type SocialIconId = 'bilibili' | 'xiaohongshu' | 'douyin' | 'wechat' | 'youtube' | 'instagram' | 'x' | 'github';

type SocialLink = {
  id: string;
  name: string;
  url: string;
  icon?: SocialIconId;
  iconSrc?: string;
};

const socialLinksByLang: Record<AppLang, SocialLink[]> = {
  zh: [
    { id: 'bilibili', name: 'Bilibili', url: 'https://space.bilibili.com/488258780?spm_id_from=333.33.0.0', iconSrc: '/social/bilibili.svg' },
    { id: 'xiaohongshu', name: 'Xiaohongshu', url: 'https://www.xiaohongshu.com/user/profile/5e59ee3200000000010091d9', iconSrc: '/social/xiaohongshu.svg' },
    { id: 'douyin', name: 'Douyin', url: 'https://www.douyin.com/user/self', iconSrc: '/social/douyin.svg' },
    { id: 'github', name: 'GitHub', url: 'https://github.com/duoduoaiduoduo', icon: 'github' },
  ],
  en: [
    { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/@Gemos_Dodo', iconSrc: '/social/youtube.svg' },
    { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/gemos_dodo/', iconSrc: '/social/instagram.svg' },
    { id: 'github', name: 'GitHub', url: 'https://github.com/duoduoaiduoduo', icon: 'github' },
    { id: 'x', name: 'X', url: 'https://x.com/duoqian1421848', icon: 'x' },
  ],
};

const heroManifesto = {
  zh: '一直在细细的感受自己的经历与一点都不等量的创作',
  en: 'Endlessly scrutinizing the depth of my life, against a body of work that feels utterly disproportionate.',
} as const;

function SocialPlatformIcon({ icon }: { icon: SocialIconId }) {
  let body: ReactNode = null;
  switch (icon) {
    case 'bilibili':
      body = (
        <path
          fill="currentColor"
          d="M6 7h12c1.66 0 3 1.34 3 3v8c0 1.66-1.34 3-3 3H6c-1.66 0-3-1.34-3-3v-8c0-1.66 1.34-3 3-3Zm3.9 4.8L8 14h2.1L8.9 17l5.2-3.7h-2.2l1.8-2.5h-1.8ZM8 3.2l2.4 2.6h1.4L9.9 3H8Zm6.1 0-1.9 2.8h1.4L16 3.2h-1.9Z"
        />
      );
      break;
    case 'xiaohongshu':
      body = (
        <path
          fill="currentColor"
          d="M6.2 4h11.6c1.8 0 3.2 1.4 3.2 3.2v9.6c0 1.8-1.4 3.2-3.2 3.2H6.2C4.4 20 3 18.6 3 16.8V7.2C3 5.4 4.4 4 6.2 4Zm1.4 4v2.2h2.7V8H7.6Zm3.9 0v2.2h2.8V8h-2.8Zm4 0v2.2h2.9V8h-2.9Zm-7.9 4.1c1.6 0 2.5.8 3.2 1.6.6-.8 1.6-1.6 3.1-1.6 2.2 0 3.6 1.6 3.6 3.8h-2.3c0-.9-.5-1.6-1.3-1.6-.8 0-1.3.7-1.3 1.6h-2.2c0-.9-.6-1.6-1.4-1.6-.8 0-1.2.7-1.2 1.6H6.3c0-2.2 1.2-3.8 3.3-3.8Z"
        />
      );
      break;
    case 'douyin':
      body = (
        <path
          fill="currentColor"
          d="M13.2 4.2c.7 1.3 1.7 2.1 3.2 2.5v2.6c-1.1-.1-2.2-.5-3.2-1.2v4.3a5 5 0 1 1-4.2-4.9v2.7a2.4 2.4 0 1 0 1.7 2.3V4.2h2.5Z"
        />
      );
      break;
    case 'wechat':
      body = (
        <path
          fill="currentColor"
          d="M9.6 5.1c3.4 0 6.1 2.2 6.1 5 0 2.7-2.7 5-6.1 5-.5 0-1-.1-1.5-.2l-2.2 1.3.7-2c-1.9-.9-3.1-2.5-3.1-4.1 0-2.8 2.7-5 6.1-5Zm6.2 4.8c2.6 0 4.7 1.7 4.7 3.8 0 2.1-2.1 3.8-4.7 3.8-.4 0-.8 0-1.1-.1l-1.7 1 .5-1.5c-1.4-.7-2.4-1.8-2.4-3.2 0-2.1 2.1-3.8 4.7-3.8ZM7.8 9.4a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Zm3.7 0a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Zm3.2 3.2a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4Zm2.8 0a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4Z"
        />
      );
      break;
    case 'youtube':
      body = (
        <path
          fill="currentColor"
          d="M20.8 8.2a2.9 2.9 0 0 0-2-2C17 5.7 12 5.7 12 5.7s-5 0-6.8.5a2.9 2.9 0 0 0-2 2C2.7 10 2.7 12 2.7 12s0 2 .5 3.8a2.9 2.9 0 0 0 2 2c1.8.5 6.8.5 6.8.5s5 0 6.8-.5a2.9 2.9 0 0 0 2-2c.5-1.8.5-3.8.5-3.8s0-2-.5-3.8Zm-10.8 6V9.8l3.9 2.2-3.9 2.2Z"
        />
      );
      break;
    case 'instagram':
      body = (
        <path
          fill="currentColor"
          d="M8 3h8c2.8 0 5 2.2 5 5v8c0 2.8-2.2 5-5 5H8c-2.8 0-5-2.2-5-5V8c0-2.8 2.2-5 5-5Zm0 2.2A2.8 2.8 0 0 0 5.2 8v8A2.8 2.8 0 0 0 8 18.8h8a2.8 2.8 0 0 0 2.8-2.8V8A2.8 2.8 0 0 0 16 5.2H8Zm4 2.1a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4Zm0 2.2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm4.9-2.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"
        />
      );
      break;
    case 'x':
      body = (
        <path
          fill="currentColor"
          d="M4.6 4h4.5l3.2 4.8L16.7 4H19l-5.6 6.4L19.4 20h-4.5l-3.6-5.4L6.5 20H4.2l6.1-7L4.6 4Zm2.5 1.9 8.2 12.2h1.5L8.6 5.9H7.1Z"
        />
      );
      break;
    case 'github':
      body = (
        <path
          fill="currentColor"
          d="M12 .6C5.7.6.6 5.7.6 12c0 5 3.3 9.3 7.8 10.8.6.1.8-.2.8-.5v-2.1c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.3 1 .1-.8.4-1.3.7-1.5-2.5-.3-5.2-1.3-5.2-5.6 0-1.2.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3 0 0 1-.3 3.1 1.2a10.8 10.8 0 0 1 5.7 0c2.2-1.5 3.1-1.2 3.1-1.2.6 1.5.2 2.7.1 3 .8.8 1.2 1.9 1.2 3.1 0 4.3-2.6 5.3-5.2 5.6.4.3.8 1 .8 2.1v3.1c0 .3.2.7.8.5A11.4 11.4 0 0 0 23.4 12C23.4 5.7 18.3.6 12 .6Z"
        />
      );
      break;
    default:
      break;
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
}

function SocialLinks({ lang }: { lang: AppLang }) {
  const links = socialLinksByLang[lang];
  return (
    <div className="hero-social-links" aria-label={lang === 'zh' ? '社交平台链接' : 'Social links'}>
      {links.map((link) => (
        <a
          key={link.id}
          className="hero-social-link"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={lang === 'zh' ? `${link.name} 主页` : `${link.name} profile`}
          title={link.name}
        >
          {link.iconSrc ? <img src={link.iconSrc} alt="" loading="lazy" /> : <SocialPlatformIcon icon={link.icon || 'x'} />}
        </a>
      ))}
    </div>
  );
}

function CommonModals({
  lang,
  t,
  bridge,
  onCopyCurrentLink,
}: {
  lang: 'zh' | 'en';
  t: (zh: string, en: string) => string;
  bridge: ReturnType<typeof getAppBridge>;
  onCopyCurrentLink: () => void;
}) {
  return (
    <>
      <div className="modal-overlay diy-panel no-grass" id="diyPanel">
        <div className="modal-header">
          <h3>{t('牛牛实验室 MAX', 'Cow Lab MAX')}</h3>
          <span className="close-btn" onClick={() => bridge.closeModal?.('diyPanel')}>
            &times;
          </span>
        </div>
        <div className="preview-box" id="cowPreviewContainer"></div>
        <div className="form-group">
          <label>{t('给它取个名字', 'Give it a name')}</label>
          <input type="text" id="cowNameInput" key={`name-${lang}`} defaultValue={t('多多的牛', "Dodo's Cow")} maxLength={8} />
        </div>
        <div className="form-group">
          <label>{t('你想对多多说什么', 'Message to Dodo')}</label>
          <input
            type="text"
            id="cowMessageInput"
            key={`msg-${lang}`}
            placeholder={t('写下你想留给多多的一句话...', 'Write your message to Dodo...')}
            maxLength={40}
          />
        </div>
        <div className="shape-grid">
          <div className="form-group" style={{ margin: 0 }}>
            <label>{t('体型', 'Body Shape')}</label>
            <select id="bodyShapeInput">
              <option value="classic">{t('标准', 'Classic')}</option>
              <option value="chubby">{t('圆润', 'Chubby')}</option>
              <option value="boxy">{t('方形', 'Boxy')}</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>{t('斑点', 'Spot Shape')}</label>
            <select id="spotTypeInput">
              <option value="classic">{t('经典', 'Classic')}</option>
              <option value="heart">{t('爱心', 'Heart')}</option>
              <option value="none">{t('纯色', 'Plain')}</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>{t('眼睛', 'Eye Style')}</label>
            <select id="eyeStyleInput">
              <option value="normal">{t('正常', 'Normal')}</option>
              <option value="happy">{t('开心', 'Happy')}</option>
              <option value="sleepy">{t('慵懒', 'Sleepy')}</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>{t('牛角', 'Horn Style')}</label>
            <select id="hornStyleInput">
              <option value="classic">{t('经典', 'Classic')}</option>
              <option value="long">{t('长角', 'Long')}</option>
              <option value="devil">{t('尖角', 'Devil')}</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
            <label>{t('尾巴', 'Tail Style')}</label>
            <select id="tailStyleInput">
              <option value="classic">{t('经典', 'Classic')}</option>
              <option value="curly">{t('卷尾', 'Curly')}</option>
              <option value="lightning">{t('闪电', 'Lightning')}</option>
            </select>
          </div>
        </div>
        <div className="color-pickers">
          <div className="color-picker"><label>{t('身体', 'Body')}</label><input type="color" id="bodyColorInput" defaultValue="#ffffff" /></div>
          <div className="color-picker"><label>{t('斑点', 'Spot')}</label><input type="color" id="spotColorInput" defaultValue="#1a1a1a" /></div>
          <div className="color-picker"><label>{t('牛角', 'Horn')}</label><input type="color" id="hornColorInput" defaultValue="#cccccc" /></div>
          <div className="color-picker"><label>{t('鼻子', 'Nose')}</label><input type="color" id="noseColorInput" defaultValue="#ffb6c1" /></div>
          <div className="color-picker"><label>{t('四肢', 'Legs')}</label><input type="color" id="legColorInput" defaultValue="#333333" /></div>
          <div className="color-picker"><label>{t('蹄子', 'Hoof')}</label><input type="color" id="hoofColorInput" defaultValue="#111111" /></div>
          <div className="color-picker"><label>{t('尾巴', 'Tail')}</label><input type="color" id="tailColorInput" defaultValue="#cccccc" /></div>
          <div className="color-picker"><label>{t('眼睛', 'Eye')}</label><input type="color" id="eyeColorInput" defaultValue="#000000" /></div>
        </div>
        <button className="btn-solid" onClick={() => bridge.spawnCow?.()}>
          {t('立即孵化', 'Hatch Now')}
        </button>
      </div>

      <div className="modal-overlay message-dialog no-grass" id="messageDialog">
        <span
          className="close-btn"
          style={{ position: 'absolute', top: '15px', right: '20px' }}
          onClick={() => bridge.closeModal?.('messageDialog')}
        >
          &times;
        </span>
        <div className="message-icon">💌</div>
        <h3 className="message-title" id="msgDialogName">{t('牛牛的名字', 'Name')}</h3>
        <div className="message-time" id="msgDialogTime">2024.10.24 12:00</div>
        <div className="message-content" id="msgDialogContent">{t('这里是留言内容', 'Message')}</div>
      </div>

      <div className="modal-overlay detail-modal no-grass" id="detailModal">
        <span className="close-btn detail-close-btn" onClick={() => bridge.closeModal?.('detailModal')}>
          &times;
        </span>
        <div className="detail-scroll-container">
          <div className="detail-hero" id="detailHero"></div>
          <div className="detail-body">
            <div className="detail-header">
              <h3 className="detail-title" id="detailTitle">{t('标题', 'Title')}</h3>
              <div className="detail-meta">
                <span className="roller-cat-badge" id="detailCategory">{t('分类', 'Category')}</span>
                <span className="detail-date" id="detailDate">{t('日期', 'Date')}</span>
                <button type="button" className="share-link-btn detail-share-btn" onClick={onCopyCurrentLink}>
                  {t('复制链接', 'Copy Link')}
                </button>
              </div>
            </div>
            <div className="detail-rich-content" id="detailRichContent"></div>
          </div>
        </div>
      </div>
    </>
  );
}

function DesktopFilterSidebar({
  t,
  bridge,
}: {
  t: (zh: string, en: string) => string;
  bridge: ReturnType<typeof getAppBridge>;
}) {
  const [activeFilter, setActiveFilter] = useState<string>(
    () => (window as any).currentFilterCode || 'all'
  );

  // Re-run lucide icon initialisation whenever the filter list re-renders
  useEffect(() => {
    const lucide = (window as any).lucide;
    if (lucide && typeof lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  }, [activeFilter]);

  const handleFilter = (type: 'all' | 'project' | 'video' | 'edu', el: HTMLElement) => {
    setActiveFilter(type);
    bridge.filterTimeline?.(type, el);
  };

  return (
    <div className="filter-sidebar no-grass animate-item">
      {(
        [
          { code: 'all' as const, icon: 'layers', zh: '全部', en: 'All' },
          { code: 'project' as const, icon: 'palette', zh: '作品', en: 'Project' },
          { code: 'video' as const, icon: 'film', zh: '视频', en: 'Video' },
          { code: 'edu' as const, icon: 'graduation-cap', zh: '教育', en: 'Edu' },
        ] as const
      ).map(({ code, icon, zh, en }) => (
        <div
          key={code}
          className={`filter-item${activeFilter === code ? ' active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={(e) => handleFilter(code, e.currentTarget as HTMLElement)}
          onKeyDown={(e) => e.key === 'Enter' && handleFilter(code, e.currentTarget as HTMLElement)}
        >
          <div className="filter-icon"><i data-lucide={icon}></i></div>
          <div className="filter-text">{t(zh, en)}</div>
        </div>
      ))}
    </div>
  );
}


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
  onOpenVibecoding,
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
  onOpenVibecoding: () => void;
  onOpenJournal: () => void;
  onOpenAdmin: () => void;
  onScrollArchive: () => void;
}) {
  // Track active filter with React state so the UI re-renders on change
  const [activeFilter, setActiveFilter] = useState<string>(
    () => (window as any).currentFilterCode || 'all'
  );

  const handleFilter = (type: 'all' | 'project' | 'video' | 'edu', el: HTMLElement) => {
    // Update React state first so buttons re-render with correct active class
    setActiveFilter(type);
    // Then delegate to script.ts which updates the roller + masonry
    bridge.filterTimeline?.(type, el);
  };

  const filters: Array<{ code: 'all' | 'project' | 'video' | 'edu'; zh: string; en: string }> = [
    { code: 'all', zh: '全部', en: 'All' },
    { code: 'project', zh: '作品', en: 'Work' },
    { code: 'video', zh: '视频', en: 'Video' },
    { code: 'edu', zh: '教育', en: 'Edu' },
  ];

  return (
    <div className="stack-home">
      {/* 顶部：品牌引子 + 语言/头像/管理 + 进度 */}
      <header className="stack-topbar">
        <div className="stack-brand">
          <p className="stack-eyebrow">GEMOSDODO</p>
          <p className="stack-subtitle">{t('数字档案馆 · 拨开每一件', 'Digital archive · flick to explore')}</p>
        </div>
        <div className="stack-topbar-right">
          <button className="stack-lang" onClick={onToggleLang}>
            {lang === 'zh' ? '中 / EN' : 'EN / 中'}
          </button>
          {showAdminEntry && (
            <button className="stack-icon-btn" onClick={onOpenAdmin} aria-label="admin">
              <Lock size={16} strokeWidth={2} />
            </button>
          )}
          <button className="stack-avatar" onClick={onAvatarTap} aria-label="avatar">
            <img src="/avatar.png" alt="Avatar" />
          </button>
        </div>
      </header>

      {/* 极简筛选（切换换整叠牌） */}
      <div className="stack-filter" role="tablist">
        {filters.map((f) => (
          <button
            key={f.code}
            role="tab"
            aria-selected={activeFilter === f.code}
            className={`stack-filter-item ${activeFilter === f.code ? 'active' : ''}`}
            onClick={(e) => handleFilter(f.code, e.currentTarget)}
          >
            {t(f.zh, f.en)}
          </button>
        ))}
        <span className="stack-progress">
          <span id="stackProgressCur">01</span>
          <span className="stack-progress-sep"> / </span>
          <span id="stackProgressTotal">00</span>
        </span>
      </div>

      {/* 中央：可拨弄的作品卡牌堆（DOM 由 script.ts 填充） */}
      <section className="stack-area">
        <div id="cardStack" className="card-stack" aria-label={t('作品卡牌堆', 'Work card stack')}></div>
        <div id="stackEmpty" className="stack-empty" style={{ display: 'none' }}>
          <p>{t('这一类还没有作品', 'Nothing here yet')}</p>
        </div>
      </section>

      {/* 拨弄提示 + 左右按钮 */}
      <div className="stack-controls">
        <button id="stackPrev" className="stack-nav-btn" aria-label={t('上一张', 'Previous')}>
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <div className="stack-hint">
          <span>{t('上滑展开', 'Swipe up to open')}</span>
          <ArrowUp size={14} strokeWidth={2.4} />
        </div>
        <button id="stackNext" className="stack-nav-btn" aria-label={t('下一张', 'Next')}>
          <ArrowRight size={18} strokeWidth={2} />
        </button>
      </div>

      {/* 底部：极简圆点入口 */}
      <nav className="stack-dock">
        <button className="stack-dock-item" onClick={onOpenAwards}>
          <Copy size={19} strokeWidth={1.7} />
          <span>{t('奖状', 'Awards')}</span>
        </button>
        <button className="stack-dock-item" onClick={onOpenPdfs}>
          <BookOpen size={19} strokeWidth={1.7} />
          <span>{t('作品集', 'Portfolio')}</span>
        </button>
        <button className="stack-dock-item active" aria-current="page">
          <span className="stack-dock-dot" />
          <span>{t('档案', 'Archive')}</span>
        </button>
        <button className="stack-dock-item" onClick={onOpenVibecoding}>
          <Code2 size={19} strokeWidth={1.8} />
          <span>{t('实验室', 'Lab')}</span>
        </button>
        <button className="stack-dock-item" onClick={onOpenJournal}>
          <PenTool size={19} strokeWidth={1.7} />
          <span>{t('手账', 'Journal')}</span>
        </button>
      </nav>

      <aside id="rollerContainer" className="m-bridge-roller" aria-hidden="true" style={{ display: 'none' }}>
        <div id="rollerWheel"></div>
      </aside>
    </div>
  );
}

function DesktopHome({
  lang,
  t,
  bridge,
  showAdminEntry,
  isLangTransitioning,
  onAvatarTap,
  onToggleLang,
  onOpenAwards,
  onOpenPdfs,
  onOpenVibecoding,
  onOpenJournal,
  onOpenAdmin,
  onOpenPasture,
  onScrollArchive,
}: {
  lang: AppLang;
  t: (zh: string, en: string) => string;
  bridge: ReturnType<typeof getAppBridge>;
  showAdminEntry: boolean;
  isLangTransitioning: boolean;
  onAvatarTap: () => void;
  onToggleLang: () => void;
  onOpenAwards: () => void;
  onOpenPdfs: () => void;
  onOpenVibecoding: () => void;
  onOpenJournal: () => void;
  onOpenAdmin: () => void;
  onOpenPasture: () => void;
  onScrollArchive: () => void;
}) {
  return (
    <div className="desktop-home">

      <button
        type="button"
        className="lang-toggle-btn desktop-quick-entry desktop-quick-lang animate-item no-grass"
        onClick={onToggleLang}
        disabled={isLangTransitioning}
        aria-busy={isLangTransitioning}
        aria-label={t('切换语言', 'Toggle language')}
      >
        <span className="desktop-quick-icon" aria-hidden="true">{lang === 'zh' ? 'EN' : '中'}</span>
        <span className="desktop-quick-text">{lang === 'zh' ? 'EN/中文' : '中文/EN'}</span>
      </button>

      <div className="hero-screen">
        <div className="site-logo-container animate-item no-grass">
          <img src="/avatar.png" alt="Avatar" className="site-avatar avatar-unlock-hit" onClick={onAvatarTap} />
          <img src="/logo.png" alt="Logo" className="site-logo" />
        </div>
        <main className="stela-container">
          <section className="stela-content no-grass">
            <div className="title-with-badge">
              <div className="main-title">{t('多多 GemosDodo', 'GemosDodo')}</div>
              <span className="official-badge">{t('官网', 'Official')}</span>
            </div>
            <div className="sub-title">{t('的刻录石碑', 'The Engraved Stela')}</div>
            <div className="english-meta">
              <span className="en-line">Digital Archive & Creative Works</span>
              <span className="en-line hero-manifesto-line">{t(heroManifesto.zh, heroManifesto.en)}</span>
              <SocialLinks lang={lang} />
              <span className="en-line desktop-icp-inline">浙ICP备2026017753号</span>
            </div>
          </section>
        </main>
        <aside className="roller-container no-grass animate-item" id="rollerContainer">
          <div className="roller-axis"></div>
          <div className="roller-wheel" id="rollerWheel"></div>
        </aside>
        <div className="scroll-indicator animate-item" onClick={onScrollArchive}>
          <i data-lucide="chevron-down"></i>
          <div>{t('下滑探索全景纪事', 'Scroll down to explore archive')}</div>
        </div>
      </div>

      <section className="masonry-section" id="masonrySection">
        <h2 className="masonry-header">{t('全部纪事 / ARCHIVE', 'ARCHIVE')}</h2>
        <div className="masonry-grid no-grass" id="masonryGrid"></div>
      </section>

      {/* Desktop filter sidebar — pass the .filter-item element itself to filterTimeline
           so script.ts can toggle active class on the correct node */}
      <DesktopFilterSidebar t={t} bridge={bridge} />

      <button
        type="button"
        className="awards-floating-entry desktop-quick-entry desktop-quick-awards no-grass animate-item"
        onClick={onOpenAwards}
        aria-label={t('进入奖状页面', 'Open awards page')}
      >
        <span className="desktop-quick-icon" aria-hidden="true">AW</span>
        <span className="desktop-quick-text">{t('奖状', 'Awards')}</span>
      </button>

      <button
        type="button"
        className="pdf-floating-entry desktop-quick-entry desktop-quick-pdf no-grass animate-item"
        onClick={onOpenPdfs}
        aria-label={t('进入作品集页面', 'Open portfolio page')}
      >
        <span className="desktop-quick-icon" aria-hidden="true">PDF</span>
        <span className="desktop-quick-text">{t('作品集', 'Portfolio')}</span>
      </button>

      <button
        type="button"
        className="vibecoding-portal no-grass animate-item"
        onClick={onOpenVibecoding}
        aria-label={t('打开 VibeCoding 页面', 'Open VibeCoding page')}
      >
        <span className="vibecoding-portal-core">
          <span className="vibecoding-portal-icon" aria-hidden="true">
            <Code2 size={18} strokeWidth={1.8} />
          </span>
          <span className="vibecoding-portal-text">
            <span className="vibecoding-portal-title">VibeCoding</span>
            <span className="vibecoding-portal-sub">
              {t('可玩 HTML 实验', 'Playable HTML Lab')}
            </span>
          </span>
        </span>
      </button>

      <button
        type="button"
        className="journal-floating-entry desktop-quick-entry desktop-quick-journal no-grass animate-item"
        onClick={onOpenJournal}
        aria-label={t('打开手账本页面', 'Open journal page')}
      >
        <span className="desktop-quick-icon" aria-hidden="true">JR</span>
        <span className="desktop-quick-text">{t('手账本', 'Journal')}</span>
      </button>

      <button
        type="button"
        className="pasture-floating-entry desktop-quick-entry desktop-quick-pasture no-grass animate-item"
        onClick={onOpenPasture}
        aria-label={t('进入牛牛牧场', 'Open cow pasture')}
      >
        <span className="desktop-quick-icon" aria-hidden="true">🐮</span>
        <span className="desktop-quick-text">{t('牛牛牧场', 'Pasture')}</span>
      </button>

      <button className="create-btn no-grass animate-item" onClick={() => bridge.openModal?.('diyPanel')}>
        ✦ {t('创造专属牛牛', 'Create Exclusive Cow')}
      </button>

      {showAdminEntry ? (
        <div className="admin-trigger admin-entry-gate no-grass animate-item" onClick={onOpenAdmin} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpenAdmin()} aria-label={t('后台', 'Admin')}>
          <i data-lucide="lock"></i>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const bridge = getAppBridge();
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [awardsFocusId, setAwardsFocusId] = useState<string | null>(null);
  const [pdfFocusId, setPdfFocusId] = useState<string | null>(null);
  const [journalFocusId, setJournalFocusId] = useState<string | null>(null);
  const [homeDetailId, setHomeDetailId] = useState<string | null>(null);
  const [showAdminEntry, setShowAdminEntry] = useState(false);
  const [isLangTransitioning, setIsLangTransitioning] = useState(false);
  const langTransitionLockRef = useRef(false);
  const avatarUnlockRef = useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 });
  /** Each tap must follow the previous within this gap to count as one chain (3 taps unlock). */
  const AVATAR_CHAIN_GAP_MS = 700;

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(detectLayoutMode);

  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);
  const pathname = location.pathname || '/';
  const isAdminRoute = pathname === '/admin';
  const isAwardsRoute = pathname === '/awards';
  const isPdfsRoute = pathname === '/pdfs';
  const isJournalRoute = pathname === '/journal';
  const isVibecodingRoute = pathname === '/vibecoding';
  const isProposalRoute = pathname === '/proposal';
  const isPastureRoute = pathname === '/pasture';
  const vibecodingSlug =
    pathname.startsWith('/vibecoding/') && pathname.length > '/vibecoding/'.length
      ? decodeURIComponent(pathname.slice('/vibecoding/'.length))
      : '';
  const isVibecodingLaunchRoute = !!vibecodingSlug;
  const showHome =
    !isAdminRoute &&
    !isAwardsRoute &&
    !isPdfsRoute &&
    !isJournalRoute &&
    !isProposalRoute &&
    !isVibecodingRoute &&
    !isVibecodingLaunchRoute &&
    !isPastureRoute;

  const onAvatarTap = () => {
    const now = Date.now();
    const { count, lastAt } = avatarUnlockRef.current;
    const nextCount = lastAt && now - lastAt <= AVATAR_CHAIN_GAP_MS ? count + 1 : 1;
    avatarUnlockRef.current = { count: nextCount, lastAt: now };
    if (nextCount >= 3) {
      setShowAdminEntry(true);
      avatarUnlockRef.current = { count: 0, lastAt: 0 };
    }
  };

  const handleToggleLang = useCallback(() => {
    if (langTransitionLockRef.current || isLangTransitioning) return;
    langTransitionLockRef.current = true;
    setIsLangTransitioning(true);
    const next = lang === 'zh' ? 'en' : 'zh';
    void runLanguageErosionTransition({
      durationMs: 3000,
      switchLanguage: () => {
        flushSync(() => {
          setLang(next);
        });
        bridge.setAppLanguage?.(next);
      },
    }).finally(() => {
      langTransitionLockRef.current = false;
      setIsLangTransitioning(false);
    });
  }, [bridge, isLangTransitioning, lang]);

  useEffect(() => {
    initApp();
  }, []);

  useEffect(() => {
    if (isAdminRoute) return;
    try {
      if (sessionStorage.getItem('visit_ping_v1')) return;
      sessionStorage.setItem('visit_ping_v1', '1');
    } catch {
      // ignore
    }
    const query = new URLSearchParams(location.search || '');
    const utmSource = (query.get('utm_source') || '').trim();
    const utmMedium = (query.get('utm_medium') || '').trim();
    const utmCampaign = (query.get('utm_campaign') || '').trim();
    let referrerHost = '';
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
      referrerHost = referrerHost.replace(/^www\./, '');
    } catch {
      referrerHost = '';
    }
    const source = utmSource
      ? `utm:${utmSource.toLowerCase()}`
      : referrerHost
        ? `ref:${referrerHost}`
        : 'direct';
    const pingParams = new URLSearchParams();
    pingParams.set('source', source);
    pingParams.set('path', window.location.pathname || '/');
    if (referrerHost) pingParams.set('referrerHost', referrerHost);
    if (utmSource) pingParams.set('utm_source', utmSource);
    if (utmMedium) pingParams.set('utm_medium', utmMedium);
    if (utmCampaign) pingParams.set('utm_campaign', utmCampaign);
    fetch(`/api/visit/ping?${pingParams.toString()}`, { method: 'GET', credentials: 'same-origin' }).catch(() => {});
  }, [isAdminRoute]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const nextHomeDetailId = showHome ? params.get('work')?.trim() || null : null;
    const nextAwardsFocusId = isAwardsRoute ? params.get('focus')?.trim() || null : null;
    const nextPdfFocusId = isPdfsRoute ? params.get('focus')?.trim() || null : null;
    const nextJournalFocusId = isJournalRoute ? params.get('focus')?.trim() || null : null;
    setHomeDetailId(nextHomeDetailId);
    setAwardsFocusId(nextAwardsFocusId);
    setPdfFocusId(nextPdfFocusId);
    setJournalFocusId(nextJournalFocusId);
  }, [isAwardsRoute, isPdfsRoute, isJournalRoute, location.search, showHome]);

  useEffect(() => {
    if (!showHome) return;
    if (!homeDetailId) {
      const detailModal = document.getElementById('detailModal');
      if (detailModal?.classList.contains('active')) {
        bridge.closeModal?.('detailModal');
      }
      return;
    }
    const timer = window.setTimeout(() => {
      (window as any).openDetailById?.(homeDetailId);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [bridge, homeDetailId, showHome]);

  useEffect(() => {
    const syncMode = () => setLayoutMode(detectLayoutMode());

    // Re-detect once after first paint — WebViews (WeChat, QQ, etc.) often
    // report correct dimensions only after the viewport meta is applied.
    const raf = requestAnimationFrame(() => {
      syncMode();
      // Second pass after a short delay for slower WebViews
      setTimeout(syncMode, 300);
    });

    window.addEventListener('resize', syncMode);
    window.addEventListener('orientationchange', syncMode);
    window.addEventListener('pageshow', syncMode);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', syncMode);
      window.removeEventListener('orientationchange', syncMode);
      window.removeEventListener('pageshow', syncMode);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.classList.remove('layout-phone', 'layout-tablet', 'layout-desktop');
    document.body.classList.add(`layout-${layoutMode}`);
    return () => {
      document.body.classList.remove('layout-phone', 'layout-tablet', 'layout-desktop');
    };
  }, [layoutMode]);

  useEffect(() => {
    document.body.classList.toggle('awards-mode', isAwardsRoute);
    document.body.classList.toggle('pdfs-mode', isPdfsRoute);
    document.body.classList.toggle('journals-mode', isJournalRoute);
    document.body.classList.toggle('pasture-mode', isPastureRoute);
    return () => {
      document.body.classList.remove('awards-mode');
      document.body.classList.remove('pdfs-mode');
      document.body.classList.remove('journals-mode');
      document.body.classList.remove('pasture-mode');
    };
  }, [isAwardsRoute, isPdfsRoute, isJournalRoute, isPastureRoute]);

  useEffect(() => {
    if (!showAdminEntry) return;
    const lucide = (window as any).lucide;
    if (lucide && typeof lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  }, [showAdminEntry]);

  useEffect(() => {
    (window as any).navigateApp = (to: string) => navigate(to);
    (window as any).setHomeDetailId = (id: string | null, options?: { replace?: boolean }) => {
      const params = new URLSearchParams(location.search || '');
      if (id) params.set('work', id);
      else params.delete('work');
      const nextSearch = params.toString();
      const normalizedCurrentSearch = (location.search || '').replace(/^\?/, '');
      if (location.pathname === '/' && normalizedCurrentSearch === nextSearch) {
        return;
      }
      navigate(
        {
          pathname: '/',
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace: !!options?.replace },
      );
    };
    return () => {
      delete (window as any).navigateApp;
      delete (window as any).setHomeDetailId;
    };
  }, [location.search, navigate]);

  const copyCurrentLink = useCallback(() => {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(window.location.href);
  }, []);

  const goHome = () => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    navigate('/');
  };

  const openHomeDetail = (entryId: string) => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    navigate(`/?work=${encodeURIComponent(entryId)}`);
  };

  const navigateToPath = (path: '/awards' | '/pdfs' | '/vibecoding' | '/journal' | '/admin' | '/pasture') => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    navigate(path);
  };

  useEffect(() => {
    if (showHome) return;
    window.dispatchEvent(new CustomEvent('work-visual-state', { detail: { active: false, coverImage: '' } }));
  }, [showHome]);

  // 从其它路由（如牧场页）切回主页时，主页用 display 切换而非重挂载，
  // 瀑布流是 script.ts 用绝对定位计算的，display:none 期间无法测量宽度，
  // 恢复显示后必须重新触发一次布局，否则卡片会塌成默认堆叠（全景纪事变样）。
  useEffect(() => {
    if (!showHome || layoutMode !== 'desktop') return;
    const relayout = () => {
      if (typeof (window as any).relayoutMasonry === 'function') {
        (window as any).relayoutMasonry();
      }
    };
    // 双 rAF：等 display 恢复、浏览器完成一帧布局后再测量宽度
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(relayout);
      (window as any).__relayoutRAF2 = r2;
    });
    return () => {
      cancelAnimationFrame(r1);
      if ((window as any).__relayoutRAF2) cancelAnimationFrame((window as any).__relayoutRAF2);
    };
  }, [showHome, layoutMode]);

  return (
    <>
      <ParticleBackdrop enabled={showHome && layoutMode === 'desktop'} />
      <div style={{ display: showHome ? undefined : 'none' }} aria-hidden={!showHome}>
        {layoutMode !== 'desktop' ? (
          <TouchHome
            lang={lang}
            t={t}
            bridge={bridge}
            isPhone={layoutMode === 'phone'}
            showAdminEntry={showAdminEntry}
            isLangTransitioning={isLangTransitioning}
            onAvatarTap={onAvatarTap}
            onToggleLang={handleToggleLang}
            onOpenAwards={() => navigateToPath('/awards')}
            onOpenPdfs={() => navigateToPath('/pdfs')}
            onOpenVibecoding={() => navigateToPath('/vibecoding')}
            onOpenJournal={() => navigateToPath('/journal')}
            onOpenAdmin={() => navigateToPath('/admin')}
            onScrollArchive={() => {
              document.getElementById('masonrySection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        ) : (
          <DesktopHome
            lang={lang}
            t={t}
            bridge={bridge}
            showAdminEntry={showAdminEntry}
            isLangTransitioning={isLangTransitioning}
            onAvatarTap={onAvatarTap}
            onToggleLang={handleToggleLang}
            onOpenAwards={() => navigateToPath('/awards')}
            onOpenPdfs={() => navigateToPath('/pdfs')}
            onOpenVibecoding={() => navigateToPath('/vibecoding')}
            onOpenJournal={() => navigateToPath('/journal')}
            onOpenAdmin={() => navigateToPath('/admin')}
            onOpenPasture={() => navigateToPath('/pasture')}
            onScrollArchive={() => {
              document.getElementById('masonrySection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        )}
        <CommonModals lang={lang} t={t} bridge={bridge} onCopyCurrentLink={copyCurrentLink} />
      </div>

      {isAdminRoute ? <AdminStudio lang={lang} onBack={goHome} /> : null}
      {isAwardsRoute ? <AwardsPage lang={lang} focusAwardId={awardsFocusId} onBack={goHome} onOpenWork={openHomeDetail} /> : null}
      {isPdfsRoute ? <PdfsPage lang={lang} focusPdfId={pdfFocusId} onBack={goHome} onOpenWork={openHomeDetail} /> : null}
      {isVibecodingRoute ? <VibecodingPage lang={lang} onBack={goHome} onToggleLang={handleToggleLang} /> : null}
      {isVibecodingLaunchRoute ? <VibecodingLaunchPage lang={lang} slug={vibecodingSlug} onBackToList={() => navigateToPath('/vibecoding')} /> : null}
      {isJournalRoute ? <JournalPage lang={lang} focusJournalId={journalFocusId} onBack={goHome} /> : null}
      {isPastureRoute ? <PasturePage lang={lang} onBack={goHome} onToggleLang={handleToggleLang} /> : null}
      {isProposalRoute ? (
        <Suspense fallback={<div className="proposal-loading">正在加载 PDF...</div>}>
          <ProposalPdfPage />
        </Suspense>
      ) : null}
    </>
  );
}
