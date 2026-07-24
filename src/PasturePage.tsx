import {useEffect, useMemo, useState, useCallback} from 'react';
import type {CSSProperties} from 'react';

type Lang = 'zh' | 'en';

type CowData = {
  id?: string;
  name?: string;
  message?: string;
  bodyColor?: string;
  spotColor?: string;
  hornColor?: string;
  noseColor?: string;
  legColor?: string;
  hoofColor?: string;
  tailColor?: string;
  eyeColor?: string;
  eyeStyle?: string;
  spotType?: string;
  bodyShape?: string;
  hornStyle?: string;
  tailStyle?: string;
  createdAt?: string;
};

type PasturePageProps = {
  lang: Lang;
  onBack: () => void;
  onToggleLang: () => void;
};

// Pure SVG generator — mirrors getCowSVG in script.ts so the pasture cows
// look identical to the ones floating on the home page.
function getCowSVG(
  bodyColor: string,
  spotColor: string,
  hornColor: string,
  noseColor: string,
  legColor: string,
  hoofColor: string,
  tailColor: string,
  eyeColor: string,
  eyeStyle: string,
  spotType: string,
  bodyShape: string,
  hornStyle: string,
  tailStyle: string,
): string {
  let bodySVG = '';
  if (bodyShape === 'chubby') bodySVG = `<rect x="15" y="38" width="70" height="42" rx="21" fill="${bodyColor}" stroke="#333" stroke-width="2"/>`;
  else if (bodyShape === 'boxy') bodySVG = `<rect x="20" y="40" width="60" height="35" rx="4" fill="${bodyColor}" stroke="#333" stroke-width="2"/>`;
  else bodySVG = `<rect x="20" y="40" width="60" height="35" rx="12" fill="${bodyColor}" stroke="#333" stroke-width="2"/>`;

  let hornSVG = '';
  if (hornStyle === 'long') hornSVG = `<path d="M 68 25 Q 55 5 75 5" stroke="${hornColor}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M 82 25 Q 95 5 75 5" stroke="${hornColor}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  else if (hornStyle === 'devil') hornSVG = `<path d="M 68 25 L 62 10 L 71 18 Z" fill="${hornColor}" stroke="#333" stroke-width="1.5"/><path d="M 82 25 L 88 10 L 79 18 Z" fill="${hornColor}" stroke="#333" stroke-width="1.5"/>`;
  else hornSVG = `<path d="M 68 25 Q 65 15 70 15" stroke="${hornColor}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M 82 25 Q 85 15 80 15" stroke="${hornColor}" stroke-width="3" fill="none" stroke-linecap="round"/>`;

  const tailTipColor = (spotColor === 'none' ? tailColor : spotColor);
  let tailSVG = '';
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

function cowSVGFor(c: CowData): string {
  return getCowSVG(
    c.bodyColor || '#ffffff',
    c.spotColor || 'none',
    c.hornColor || '#f2c94c',
    c.noseColor || '#f6b8c4',
    c.legColor || (c.bodyColor || '#ffffff'),
    c.hoofColor || '#333333',
    c.tailColor || (c.bodyColor || '#ffffff'),
    c.eyeColor || '#1a1a1a',
    c.eyeStyle || 'normal',
    c.spotType || 'none',
    c.bodyShape || 'normal',
    c.hornStyle || 'normal',
    c.tailStyle || 'normal',
  );
}

// Deterministic pseudo-random from a string seed so each cow keeps a stable
// slot / animation offset across re-renders (no jumping on state updates).
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

type PastureCow = CowData & {
  _key: string;
  _left: number;   // % across the field (left edge, self-width aware)
  _top: number;    // % down the lawn (depth)
  _flip: boolean;  // face left/right
  _delay: number;  // animation offset
  _dur: number;    // wander duration
  _scale: number;  // near = big, far = small
};

const ROWS = 3;

// Distribute cows evenly across the lawn: split into ROWS depth bands, and
// within each band spread them horizontally into columns with jitter, so they
// never pile up in a corner. Farther (higher) = smaller; nearer = larger.
function layoutCows(cows: CowData[]): PastureCow[] {
  const n = cows.length;
  // rows get more cows toward the front (visual balance)
  return cows.map((c, i) => {
    const key = c.id || `${c.name || 'cow'}-${i}`;
    const r1 = hashSeed(key + 'x');
    const r3 = hashSeed(key + 'f');
    const r4 = hashSeed(key + 'd');
    // assign band by index so bands stay balanced regardless of hash
    const row = i % ROWS;
    // column slot within the band
    const perRow = Math.max(1, Math.ceil(n / ROWS));
    const col = Math.floor(i / ROWS);
    const slotW = 80 / perRow;                    // usable width 6%..86%
    const jitter = (r1 - 0.5) * slotW * 0.4;
    // stagger each depth band horizontally so cross-band columns don't overlap
    const bandShift = [0, slotW * 0.45, slotW * 0.9][row];
    const left = Math.min(82, Math.max(4, 6 + col * slotW + bandShift + jitter));
    // depth: band 0 = far/top, band 2 = near/bottom
    const bandTop = [24, 44, 64][row];
    const top = bandTop + (r4 - 0.5) * 8;
    const scale = [0.78, 0.95, 1.12][row];
    return {
      ...c,
      _key: key,
      _left: left,
      _top: top,
      _flip: r3 > 0.5,
      _delay: -(r4 * 14),
      _dur: 9 + r1 * 8,
      _scale: scale,
    };
  });
}

export default function PasturePage({lang, onBack, onToggleLang}: PasturePageProps) {
  const t = useCallback((zh: string, en: string) => (lang === 'en' ? en : zh), [lang]);
  const [cows, setCows] = useState<CowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PastureCow | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/data')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const list: CowData[] = Array.isArray(d?.cows) ? d.cows : [];
        setCows(list);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const laid = useMemo(() => layoutCows(cows), [cows]);

  // Close dialog on Escape
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  return (
    <div className="pasture-root" lang={lang}>
      {/* Sky layer: sun, drifting clouds, gradient */}
      <div className="pasture-sky" aria-hidden="true">
        <div className="pasture-sun" />
        <div className="pasture-cloud pc-1" />
        <div className="pasture-cloud pc-2" />
        <div className="pasture-cloud pc-3" />
        <div className="pasture-cloud pc-4" />
        <div className="pasture-hill pasture-hill-back" />
        <div className="pasture-hill pasture-hill-front" />
      </div>

      {/* Top bar: back + title board + language */}
      <header className="pasture-topbar">
        <button
          type="button"
          className="pasture-back"
          onClick={onBack}
          aria-label={t('返回首页', 'Back to home')}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{t('回家', 'Home')}</span>
        </button>

        <div className="pasture-sign" role="img" aria-label={t('牛牛牧场', 'Cow Pasture')}>
          <span className="pasture-sign-emoji" aria-hidden="true">🐮</span>
          <span className="pasture-sign-text">{t('牛牛牧场', 'Cow Pasture')}</span>
          <span className="pasture-sign-count">
            {loading
              ? t('清点中…', 'Counting…')
              : t(`现居 ${cows.length} 只牛牛`, `${cows.length} cows live here`)}
          </span>
        </div>

        <button
          type="button"
          className="pasture-lang"
          onClick={onToggleLang}
          aria-label={t('切换语言', 'Toggle language')}
        >
          {lang === 'en' ? '中' : 'EN'}
        </button>
      </header>

      {/* The field */}
      <main className="pasture-field">
        {loading ? (
          <div className="pasture-empty">{t('正在唤醒牛牛们…', 'Waking up the cows…')}</div>
        ) : cows.length === 0 ? (
          <div className="pasture-empty">
            {t('牧场空空的，还没有牛牛入住～', 'The pasture is empty — no cows yet.')}
          </div>
        ) : (
          <div className="pasture-lawn">
            {/* wooden fence across the top edge of the lawn */}
            <div className="pasture-fence" aria-hidden="true">
              {Array.from({length: 16}).map((_, i) => (
                <span className="fence-post" key={i} />
              ))}
              <span className="fence-rail fence-rail-top" />
              <span className="fence-rail fence-rail-bottom" />
            </div>

            {laid.map((c) => (
              <button
                type="button"
                key={c._key}
                className={`pasture-cow${c._flip ? ' flip' : ''}`}
                style={{
                  left: `${c._left}%`,
                  top: `${c._top}%`,
                  zIndex: 4 + Math.round(c._top),
                  '--cow-delay': `${c._delay}s`,
                  '--cow-dur': `${c._dur}s`,
                  '--cow-scale': c._scale,
                } as CSSProperties}
                onClick={() => setActive(c)}
                aria-label={t(`查看 ${c.name || '牛牛'} 的留言`, `See ${c.name || 'cow'}'s message`)}
              >
                <span className="pasture-cow-shadow" aria-hidden="true" />
                <span
                  className="pasture-cow-svg"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{__html: cowSVGFor(c)}}
                />
                {/* grass tufts the cow nibbles at */}
                <span className="pasture-graze" aria-hidden="true">
                  <span className="graze-tuft" />
                  <span className="graze-tuft" />
                  <span className="graze-tuft" />
                </span>
                {c.name ? <span className="pasture-nametag">{c.name}</span> : null}
              </button>
            ))}

            {/* scattered flowers + grass tufts for a lush field */}
            <div className="pasture-decor" aria-hidden="true">
              {Array.from({length: 22}).map((_, i) => {
                const seed = hashSeed('decor' + i);
                const seed2 = hashSeed('decor2' + i);
                const kinds = ['🌼', '🌱', '🌷', '🍀'];
                return (
                  <span
                    className="decor-item"
                    key={i}
                    style={{
                      left: `${4 + seed * 92}%`,
                      top: `${18 + seed2 * 74}%`,
                      fontSize: `${14 + seed * 12}px`,
                      opacity: 0.55 + seed2 * 0.35,
                    }}
                  >
                    {kinds[Math.floor(seed2 * kinds.length)]}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Message dialog when a cow is tapped */}
      {active ? (
        <div
          className="pasture-dialog-overlay"
          onClick={() => setActive(null)}
          role="presentation"
        >
          <div
            className="pasture-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="pasture-dialog-portrait" aria-hidden="true">
              <div
                className="pasture-dialog-svg"
                dangerouslySetInnerHTML={{__html: cowSVGFor(active)}}
              />
            </div>
            <div className="pasture-dialog-body">
              <div className="pasture-dialog-name">{active.name || t('无名牛牛', 'A shy cow')}</div>
              <div className="pasture-dialog-message">
                {active.message
                  ? `“${active.message}”`
                  : t('这只牛牛还没有留言，正忙着吃草～', 'This cow left no message — busy grazing.')}
              </div>
              <button
                type="button"
                className="pasture-dialog-close"
                onClick={() => setActive(null)}
              >
                {t('哞，再见！', 'Moo, bye!')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
