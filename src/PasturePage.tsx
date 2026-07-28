import {useEffect, useMemo, useRef, useState, useCallback} from 'react';
import type {CSSProperties, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent} from 'react';

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
  const outline = '#2f2a26';
  const bodyX = bodyShape === 'chubby' ? 13 : 17;
  const bodyY = bodyShape === 'chubby' ? 39 : 41;
  const bodyW = bodyShape === 'chubby' ? 72 : 62;
  const bodyH = bodyShape === 'chubby' ? 43 : 37;
  const bodyRx = bodyShape === 'boxy' ? 9 : bodyShape === 'chubby' ? 23 : 18;
  const bodySVG = `<rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${bodyRx}" fill="${bodyColor}" stroke="${outline}" stroke-width="2.4"/>`;

  let hornSVG = '';
  if (hornStyle === 'long') {
    hornSVG = `<path d="M 70 30 Q 55 8 76 10" stroke="${hornColor}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M 89 30 Q 104 8 83 10" stroke="${hornColor}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  } else if (hornStyle === 'devil') {
    hornSVG = `<path d="M 71 31 L 65 15 L 76 24 Z" fill="${hornColor}" stroke="${outline}" stroke-width="1.6" stroke-linejoin="round"/><path d="M 88 31 L 94 15 L 83 24 Z" fill="${hornColor}" stroke="${outline}" stroke-width="1.6" stroke-linejoin="round"/>`;
  } else {
    hornSVG = `<path d="M 71 30 Q 68 20 74 20" stroke="${hornColor}" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M 88 30 Q 91 20 85 20" stroke="${hornColor}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
  }

  const tailTipColor = (spotColor === 'none' ? tailColor : spotColor);
  let tailSVG = '';
  if (tailStyle === 'curly') {
    tailSVG = `<path d="M 19 48 C 5 47 4 58 14 59 C 22 60 22 70 10 70" stroke="${tailColor}" stroke-width="3.4" fill="none" stroke-linecap="round"/><circle cx="10" cy="70" r="4.6" fill="${tailTipColor}" stroke="${outline}" stroke-width="1.4"/>`;
  } else if (tailStyle === 'lightning') {
    tailSVG = `<polyline points="19,48 12,54 17,60 8,70" stroke="${tailColor}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><polygon points="8,70 4,76 13,76" fill="${tailTipColor}" stroke="${outline}" stroke-width="1.4" stroke-linejoin="round"/>`;
  } else {
    tailSVG = `<path d="M 19 48 Q 8 49 9 64" stroke="${tailColor}" stroke-width="3.4" fill="none" stroke-linecap="round"/><circle cx="9" cy="64" r="4.6" fill="${tailTipColor}" stroke="${outline}" stroke-width="1.4"/>`;
  }

  let eyeSVG = '';
  if (eyeStyle === 'happy') {
    eyeSVG = `<path d="M 73 39 Q 75.5 36 78 39 M 84 39 Q 86.5 36 89 39" stroke="${eyeColor}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  } else if (eyeStyle === 'sleepy') {
    eyeSVG = `<path d="M 73 40 Q 75.5 42 78 40 M 84 40 Q 86.5 42 89 40" stroke="${eyeColor}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  } else {
    eyeSVG = `<circle cx="76" cy="39" r="2.8" fill="${eyeColor}"/><circle cx="87" cy="39" r="2.8" fill="${eyeColor}"/><circle cx="77" cy="38" r="0.8" fill="#fff" opacity="0.85"/><circle cx="88" cy="38" r="0.8" fill="#fff" opacity="0.85"/>`;
  }

  let spotSVG = '';
  if (spotType === 'classic') {
    spotSVG = `<circle cx="35" cy="56" r="8.5" fill="${spotColor}"/><path d="M 58 44 Q 69 44 68 55 Q 58 61 53 50 Z" fill="${spotColor}"/>`;
  } else if (spotType === 'heart') {
    spotSVG = `<path d="M 45 53 A 5.5 5.5 0 0 1 54 53 A 5.5 5.5 0 0 1 63 53 Q 63 62 54 70 Q 45 62 45 53 Z" fill="${spotColor}"/>`;
  }

  const earSVG = `<path d="M 69 35 Q 58 30 60 42 Q 66 46 72 41 Z" fill="${bodyColor}" stroke="${outline}" stroke-width="2" stroke-linejoin="round"/><path d="M 90 35 Q 101 30 99 42 Q 93 46 87 41 Z" fill="${bodyColor}" stroke="${outline}" stroke-width="2" stroke-linejoin="round"/>`;
  const legSVG = `<rect x="28" y="72" width="8" height="16" rx="4" fill="${legColor}"/><rect x="47" y="72" width="8" height="16" rx="4" fill="${legColor}"/><rect x="67" y="72" width="8" height="16" rx="4" fill="${legColor}"/><rect x="28" y="84" width="8" height="6" rx="3" fill="${hoofColor}"/><rect x="47" y="84" width="8" height="6" rx="3" fill="${hoofColor}"/><rect x="67" y="84" width="8" height="6" rx="3" fill="${hoofColor}"/>`;
  const headSVG = `<rect x="66" y="29" width="31" height="31" rx="14" fill="${bodyColor}" stroke="${outline}" stroke-width="2.4"/>`;
  const muzzleSVG = `<rect x="72" y="43" width="25" height="17" rx="8.5" fill="${noseColor}" stroke="${outline}" stroke-width="1.8"/><circle cx="79" cy="50" r="1.8" fill="rgba(0,0,0,0.34)"/><circle cx="89" cy="50" r="1.8" fill="rgba(0,0,0,0.34)"/>`;

  return `<svg viewBox="0 0 110 100" width="100%" height="100%" stroke-linejoin="round">${tailSVG}${legSVG}${bodySVG}${spotSVG}${earSVG}${headSVG}${muzzleSVG}${eyeSVG}${hornSVG}</svg>`;
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

// Deterministic pseudo-random from a string seed.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

// ---- Simulation types ----
// The lawn is a virtual field in percentage coordinates (0..100 on both axes).
// x/y are the cow's foot position on that field. Depth (y) drives scale + z.
type CowState = 'wander' | 'graze' | 'idle' | 'seekFood' | 'eat';

type Mood = 'content' | 'happy' | 'bored';

type CowAgent = {
  data: CowData;
  key: string;
  x: number; // 0..100 field %
  y: number; // 0..100 field % (bigger = nearer/bottom)
  tx: number; // target x
  ty: number; // target y
  facing: 1 | -1; // 1 = right, -1 = left
  speed: number; // % per second
  state: CowState;
  stateT: number; // seconds remaining in current state
  scaleBase: number; // per-cow size variety
  fed: number; // times fed
  mood: Mood;
  moodT: number; // seconds since last fed (for boredom)
  bobPhase: number; // walking bob offset
  el?: HTMLButtonElement | null;
  emoteT: number; // emote bubble timer
  emote: string; // current emote glyph
};

type FoodSprite = {
  id: number;
  x: number;
  y: number;
  amount: number; // bites left
  born: number; // timestamp
};

type Critter = {
  id: number;
  kind: 'bird' | 'butterfly' | 'rabbit';
  born: number;
  dur: number;
  fromLeft: boolean;
  y: number; // vertical band %
};

// Field bounds (in %). Keep cows off the very edges & fence.
const FX_MIN = 6;
const FX_MAX = 92;
const FY_MIN = 20; // top of grazable lawn (below fence)
const FY_MAX = 86; // bottom

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

// scale from depth: far (small y) -> small, near (big y) -> big
function depthScale(y: number, base: number) {
  const tNorm = (y - FY_MIN) / (FY_MAX - FY_MIN); // 0..1
  return (0.72 + tNorm * 0.5) * base;
}

const TIME_PHASES = ['day', 'dusk', 'night', 'dawn'] as const;
type TimePhase = (typeof TIME_PHASES)[number];

export default function PasturePage({lang, onBack, onToggleLang}: PasturePageProps) {
  const t = useCallback((zh: string, en: string) => (lang === 'en' ? en : zh), [lang]);
  const [cows, setCows] = useState<CowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<CowData | null>(null);
  const [feedTotal, setFeedTotal] = useState(0);
  const [phase, setPhase] = useState<TimePhase>('day');
  const [foods, setFoods] = useState<FoodSprite[]>([]);
  const [critters, setCritters] = useState<Critter[]>([]);
  const [hint, setHint] = useState(true);

  const lawnRef = useRef<HTMLDivElement | null>(null);
  const agentsRef = useRef<CowAgent[]>([]);
  // DOM node per cow, keyed by cow key — decoupled from agent object identity so
  // rebuilding agents (when cows change) never loses the element references.
  const elsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const foodsRef = useRef<FoodSprite[]>([]);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const pointerRef = useRef<{x: number; y: number; active: boolean}>({x: 50, y: 50, active: false});
  const foodIdRef = useRef(1);
  const critterIdRef = useRef(1);
  const feedCountRef = useRef(0);

  // keep foods ref in sync with state (state used for render, ref for sim loop)
  useEffect(() => {
    foodsRef.current = foods;
  }, [foods]);

  // ---- fetch cows ----
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

  // ---- build agents from cows ----
  useEffect(() => {
    const prev = new Map<string, CowAgent>(agentsRef.current.map((a) => [a.key, a]));
    agentsRef.current = cows.map((c, i) => {
      const key = c.id || `${c.name || 'cow'}-${i}`;
      // if this cow already existed, keep its live position/state so nothing snaps
      const existing = prev.get(key);
      if (existing) {
        existing.data = c;
        existing.el = elsRef.current[key] ?? existing.el ?? null;
        return existing;
      }
      const rx = hashSeed(key + 'x');
      const ry = hashSeed(key + 'y');
      const rs = hashSeed(key + 's');
      const x = FX_MIN + rx * (FX_MAX - FX_MIN);
      const y = FY_MIN + ry * (FY_MAX - FY_MIN);
      return {
        data: c,
        key,
        x,
        y,
        tx: x,
        ty: y,
        facing: rx > 0.5 ? 1 : -1,
        speed: 3.2 + rs * 2.6,
        state: 'graze' as CowState,
        stateT: 1 + rs * 3,
        scaleBase: 0.92 + rs * 0.26,
        fed: 0,
        mood: 'content' as Mood,
        moodT: 0,
        bobPhase: rx * Math.PI * 2,
        el: elsRef.current[key] ?? null,
        emoteT: 0,
        emote: '',
      };
    });
  }, [cows]);

  // ---- day/night cycle (advances every ~30s of real time) ----
  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((p) => {
        const idx = TIME_PHASES.indexOf(p);
        return TIME_PHASES[(idx + 1) % TIME_PHASES.length];
      });
    }, 30000);
    return () => window.clearInterval(id);
  }, []);

  // ---- ambient critters spawn occasionally ----
  useEffect(() => {
    let alive = true;
    const spawn = () => {
      if (!alive) return;
      const kinds: Critter['kind'][] = ['bird', 'butterfly', 'butterfly', 'rabbit'];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const c: Critter = {
        id: critterIdRef.current++,
        kind,
        born: performance.now(),
        dur: kind === 'bird' ? 7000 : kind === 'rabbit' ? 5200 : 9000,
        fromLeft: Math.random() > 0.5,
        y: kind === 'bird' ? 8 + Math.random() * 14 : kind === 'rabbit' ? 78 + Math.random() * 8 : 34 + Math.random() * 34,
      };
      setCritters((list) => [...list.filter((it) => performance.now() - it.born < it.dur), c]);
      const next = 6000 + Math.random() * 9000;
      window.setTimeout(spawn, next);
    };
    const first = window.setTimeout(spawn, 3500);
    return () => {
      alive = false;
      window.clearTimeout(first);
    };
  }, []);

  // ---- pick a new wander target ----
  const pickTarget = (a: CowAgent) => {
    a.tx = FX_MIN + Math.random() * (FX_MAX - FX_MIN);
    a.ty = FY_MIN + Math.random() * (FY_MAX - FY_MIN);
    a.state = 'wander';
    a.stateT = 0;
  };

  // ---- the simulation loop ----
  useEffect(() => {
    if (loading || cows.length === 0) return;

    const step = (ts: number) => {
      const last = lastTsRef.current || ts;
      let dt = (ts - last) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.1) dt = 0.1; // clamp big gaps (tab switch)

      const agents = agentsRef.current;
      const foodList = foodsRef.current;
      const pointer = pointerRef.current;
      let foodChanged = false;

      for (const a of agents) {
        a.moodT += dt;
        if (a.emoteT > 0) a.emoteT -= dt;

        // hungry mood over time
        if (a.moodT > 22) a.mood = 'bored';
        else if (a.moodT < 6 && a.fed > 0) a.mood = 'happy';
        else a.mood = 'content';

        // --- food seeking has priority ---
        let nearestFood: FoodSprite | null = null;
        let nearestD = 999;
        for (const f of foodList) {
          if (f.amount <= 0) continue;
          const d = Math.hypot(f.x - a.x, f.y - a.y);
          if (d < nearestD) {
            nearestD = d;
            nearestFood = f;
          }
        }
        // only chase food within reasonable range (28% of field)
        if (nearestFood && nearestD < 30 && a.state !== 'eat') {
          a.tx = nearestFood.x;
          a.ty = clamp(nearestFood.y, FY_MIN, FY_MAX);
          a.state = 'seekFood';
        }

        if (a.state === 'seekFood' && nearestFood) {
          const dx = a.tx - a.x;
          const dy = a.ty - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 2.2) {
            // arrived → eat
            a.state = 'eat';
            a.stateT = 1.6;
            a.emote = '❤️';
            a.emoteT = 1.6;
          } else {
            const sp = a.speed * 1.7 * dt; // rush to food
            a.x += (dx / dist) * sp;
            a.y += (dy / dist) * sp;
            a.facing = dx >= 0 ? 1 : -1;
            a.bobPhase += dt * 11;
          }
        } else if (a.state === 'eat') {
          a.stateT -= dt;
          if (a.stateT <= 0) {
            // consume one bite from nearest food
            if (nearestFood) {
              nearestFood.amount -= 1;
              foodChanged = true;
            }
            a.fed += 1;
            a.moodT = 0;
            a.mood = 'happy';
            a.emote = '😋';
            a.emoteT = 1.4;
            // more food nearby? keep eating : resume wander
            if (nearestFood && nearestFood.amount > 0 && nearestD < 30) {
              a.state = 'seekFood';
            } else {
              a.state = 'idle';
              a.stateT = 0.8 + Math.random() * 1.2;
            }
          }
        } else if (a.state === 'wander') {
          const dx = a.tx - a.x;
          const dy = a.ty - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 1.5) {
            // reached → graze or idle
            a.state = Math.random() > 0.4 ? 'graze' : 'idle';
            a.stateT = 2 + Math.random() * 4;
          } else {
            const sp = a.speed * dt;
            a.x += (dx / dist) * sp;
            a.y += (dy / dist) * sp;
            a.facing = dx >= 0 ? 1 : -1;
            a.bobPhase += dt * 7;
          }
        } else {
          // graze / idle → count down then pick new target
          a.stateT -= dt;
          if (a.stateT <= 0) {
            pickTarget(a);
          }
        }

        a.x = clamp(a.x, FX_MIN, FX_MAX);
        a.y = clamp(a.y, FY_MIN, FY_MAX);

        // --- write to DOM ---
        const el = elsRef.current[a.key] || a.el;
        if (el) {
          const sc = depthScale(a.y, a.scaleBase);
          const walking = a.state === 'wander' || a.state === 'seekFood';
          const bob = walking ? Math.sin(a.bobPhase) * 3 : 0;
          el.style.left = `${a.x}%`;
          el.style.top = `${a.y}%`;
          el.style.transform = `translate(-50%, -100%) scale(${sc}) translateY(${bob}px)`;
          el.style.zIndex = String(6 + Math.round(a.y));
          el.dataset.state = a.state;
          el.dataset.facing = a.facing === -1 ? 'left' : 'right';
          el.dataset.mood = a.mood;
          // pointer-look on hover proximity (subtle head tilt handled via CSS data-mood)
          // emote bubble
          const em = el.querySelector('.pasture-emote') as HTMLElement | null;
          if (em) {
            if (a.emoteT > 0 && a.emote) {
              em.textContent = a.emote;
              em.style.opacity = '1';
              em.style.transform = 'translateX(-50%) translateY(-6px) scale(1)';
            } else {
              em.style.opacity = '0';
              em.style.transform = 'translateX(-50%) translateY(0) scale(0.6)';
            }
          }
        }
      }

      // hover / pointer curiosity: nearest cow to pointer looks toward it (light effect via facing)
      if (pointer.active) {
        for (const a of agents) {
          if (a.state === 'graze' || a.state === 'idle') {
            const d = Math.hypot(pointer.x - a.x, pointer.y - a.y);
            if (d < 18) a.facing = pointer.x >= a.x ? 1 : -1;
          }
        }
      }

      if (foodChanged) {
        // prune eaten food
        const remaining = foodsRef.current.filter((f) => f.amount > 0);
        if (remaining.length !== foodsRef.current.length) {
          setFoods(remaining);
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loading, cows.length]);

  // ---- pointer tracking over lawn ----
  const onLawnMove = (e: ReactPointerEvent) => {
    const el = lawnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    pointerRef.current = {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
      active: true,
    };
  };
  const onLawnLeave = () => {
    pointerRef.current.active = false;
  };

  // ---- scatter food where the user clicks the lawn ----
  const onLawnClick = (e: ReactMouseEvent) => {
    const el = lawnRef.current;
    if (!el) return;
    // ignore clicks that originated on a cow button (handled separately)
    const target = e.target as HTMLElement;
    if (target.closest('.pasture-cow')) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (y < FY_MIN - 2) return; // don't drop in the sky/fence zone
    const cx = clamp(x, FX_MIN, FX_MAX);
    const cy = clamp(y, FY_MIN, FY_MAX);
    const f: FoodSprite = {
      id: foodIdRef.current++,
      x: cx,
      y: cy,
      amount: 3,
      born: performance.now(),
    };
    setFoods((list) => [...list, f]);
    feedCountRef.current += 1;
    setFeedTotal(feedCountRef.current);
    if (hint) setHint(false);
  };

  const laid = useMemo(() => {
    return cows.map((c, i) => {
      const key = c.id || `${c.name || 'cow'}-${i}`;
      return {c, key};
    });
  }, [cows]);

  // Close dialog on Escape
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const registerCowEl = useCallback((key: string, el: HTMLButtonElement | null) => {
    // store in the key→node map first (survives agent rebuilds), then link to the
    // agent if it already exists. Ref callbacks can fire before the build-agents
    // effect runs, so relying only on agentsRef.find() would silently drop the node.
    elsRef.current[key] = el;
    const a = agentsRef.current.find((x) => x.key === key);
    if (a) a.el = el;
  }, []);

  return (
    <div className={`pasture-root phase-${phase}`} lang={lang}>
      {/* Sky layer */}
      <div className="pasture-sky" aria-hidden="true">
        <div className="pasture-celestial pasture-sun" />
        <div className="pasture-celestial pasture-moon" />
        <div className="pasture-stars" />
        <div className="pasture-cloud pc-1" />
        <div className="pasture-cloud pc-2" />
        <div className="pasture-cloud pc-3" />
        <div className="pasture-cloud pc-4" />
        <div className="pasture-hill pasture-hill-back" />
        <div className="pasture-hill pasture-hill-front" />
      </div>

      {/* Top bar */}
      <header className="pasture-topbar">
        <button
          type="button"
          className="pasture-back"
          onClick={onBack}
          aria-label={t('返回首页', 'Back to home')}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t('回家', 'Home')}</span>
        </button>

        <div className="pasture-sign" role="img" aria-label={t('牛牛牧场', 'Cow Pasture')}>
          <span className="pasture-sign-emoji" aria-hidden="true">🐮</span>
          <span className="pasture-sign-text">{t('牛牛牧场', 'Cow Pasture')}</span>
          <span className="pasture-sign-count">
            {loading
              ? t('清点中…', 'Counting…')
              : t(`现居 ${cows.length} 只牛牛`, `${cows.length} cows`)}
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

      {/* HUD: feed counter + time badge */}
      {!loading && cows.length > 0 ? (
        <div className="pasture-hud" aria-hidden="false">
          <div className="pasture-hud-pill">
            <span className="pasture-hud-emoji">🌾</span>
            <span>{t('已投喂', 'Fed')}</span>
            <b>{feedTotal}</b>
          </div>
          <div className="pasture-hud-pill pasture-hud-time" title={t('昼夜循环', 'Day/night cycle')}>
            <span className="pasture-hud-emoji">
              {phase === 'day' ? '☀️' : phase === 'dusk' ? '🌅' : phase === 'night' ? '🌙' : '🌄'}
            </span>
            <span>
              {phase === 'day'
                ? t('白天', 'Day')
                : phase === 'dusk'
                ? t('黄昏', 'Dusk')
                : phase === 'night'
                ? t('夜晚', 'Night')
                : t('清晨', 'Dawn')}
            </span>
          </div>
        </div>
      ) : null}

      {/* The field */}
      <main className="pasture-field">
        {loading ? (
          <div className="pasture-empty">{t('正在唤醒牛牛们…', 'Waking up the cows…')}</div>
        ) : cows.length === 0 ? (
          <div className="pasture-empty">
            {t('牧场空空的，还没有牛牛入住～', 'The pasture is empty — no cows yet.')}
          </div>
        ) : (
          <div
            className="pasture-lawn"
            ref={lawnRef}
            onClick={onLawnClick}
            onPointerMove={onLawnMove}
            onPointerLeave={onLawnLeave}
          >
            {/* fence */}
            <div className="pasture-fence" aria-hidden="true">
              {Array.from({length: 16}).map((_, i) => (
                <span className="fence-post" key={i} />
              ))}
              <span className="fence-rail fence-rail-top" />
              <span className="fence-rail fence-rail-bottom" />
            </div>

            {/* fireflies (only visible at night via CSS) */}
            <div className="pasture-fireflies" aria-hidden="true">
              {Array.from({length: 14}).map((_, i) => {
                const s = hashSeed('ff' + i);
                const s2 = hashSeed('ff2' + i);
                return (
                  <span
                    className="firefly"
                    key={i}
                    style={{
                      left: `${6 + s * 88}%`,
                      top: `${24 + s2 * 60}%`,
                      animationDelay: `${s * 6}s`,
                      animationDuration: `${4 + s2 * 4}s`,
                    }}
                  />
                );
              })}
            </div>

            {/* scattered food */}
            {foods.map((f) => (
              <span
                key={f.id}
                className={`pasture-food amount-${f.amount}`}
                style={{left: `${f.x}%`, top: `${f.y}%`, zIndex: 5 + Math.round(f.y)} as CSSProperties}
                aria-hidden="true"
              >
                🌾
              </span>
            ))}

            {/* cows */}
            {laid.map(({c, key}) => (
              <button
                type="button"
                key={key}
                ref={(el) => registerCowEl(key, el)}
                className="pasture-cow"
                data-state="graze"
                data-facing="right"
                data-mood="content"
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(c);
                }}
                aria-label={t(`查看 ${c.name || '牛牛'} 的留言`, `See ${c.name || 'cow'}'s message`)}
              >
                <span className="pasture-emote" aria-hidden="true" />
                <span className="pasture-cow-shadow" aria-hidden="true" />
                <span
                  className="pasture-cow-svg"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{__html: cowSVGFor(c)}}
                />
                {c.name ? <span className="pasture-nametag">{c.name}</span> : null}
              </button>
            ))}

            {/* ambient critters */}
            {critters.map((cr) => (
              <span
                key={cr.id}
                className={`pasture-critter critter-${cr.kind} ${cr.fromLeft ? 'from-left' : 'from-right'}`}
                style={{top: `${cr.y}%`, animationDuration: `${cr.dur}ms`} as CSSProperties}
                aria-hidden="true"
              >
                {cr.kind === 'bird' ? '🐦' : cr.kind === 'rabbit' ? '🐇' : '🦋'}
              </span>
            ))}

            {/* flowers decor */}
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
                      top: `${20 + seed2 * 68}%`,
                      fontSize: `${14 + seed * 12}px`,
                      opacity: 0.55 + seed2 * 0.35,
                    }}
                  >
                    {kinds[Math.floor(seed2 * kinds.length)]}
                  </span>
                );
              })}
            </div>

            {/* feed hint */}
            {hint ? (
              <div className="pasture-feed-hint" aria-hidden="true">
                {t('点击草地任意处撒草料喂牛 🌾', 'Click the grass to scatter feed 🌾')}
              </div>
            ) : null}
          </div>
        )}
      </main>

      {/* Message dialog */}
      {active ? (
        <div className="pasture-dialog-overlay" onClick={() => setActive(null)} role="presentation">
          <div className="pasture-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="pasture-dialog-portrait" aria-hidden="true">
              <div className="pasture-dialog-svg" dangerouslySetInnerHTML={{__html: cowSVGFor(active)}} />
            </div>
            <div className="pasture-dialog-body">
              <div className="pasture-dialog-name">{active.name || t('无名牛牛', 'A shy cow')}</div>
              <div className="pasture-dialog-message">
                {active.message
                  ? `“${active.message}”`
                  : t('这只牛牛还没有留言，正忙着吃草～', 'This cow left no message — busy grazing.')}
              </div>
              <button type="button" className="pasture-dialog-close" onClick={() => setActive(null)}>
                {t('哞，再见！', 'Moo, bye!')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
