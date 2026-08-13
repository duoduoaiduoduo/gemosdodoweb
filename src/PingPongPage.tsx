import {useCallback, useEffect, useRef, useState} from 'react';
import './pingpong.css';

type Lang = 'zh' | 'en';

type PingPongPageProps = {
  lang: Lang;
  onBack: () => void;
};

/** 玩法 */
type Mode = 'online' | 'local' | 'ai';
/** 界面阶段 */
type Screen = 'menu' | 'lobby' | 'play' | 'result';
type Difficulty = 'easy' | 'normal' | 'hard';
/** 联机中本机扮演的角色：host 跑权威物理，guest 只上报拍子 */
type Role = 'host' | 'guest';

/* ============================================================================
   逻辑坐标系：固定 1000 x 620，渲染时等比缩放到 canvas。
   球台横向，左右两侧各一块拍子（横屏）；竖屏时改为上下（见 VERTICAL）。
   ========================================================================== */
const W = 1000;
const H = 620;

const PADDLE_W = 14;
const PADDLE_H = 108;
const PADDLE_INSET = 34; // 拍子中心距边界
const BALL_R = 9;

const BALL_SPEED_START = 7.4;
const BALL_SPEED_MAX = 18.5;
const BALL_SPEED_GAIN = 1.045; // 每次击球加速
const PADDLE_SPEED = 9.2; // 键盘每帧移动
const SPIN_FROM_PADDLE = 0.26; // 拍子移动带给球的旋转
const MAX_BOUNCE_ANGLE = 1.02; // ~58°，击球点越靠边角度越大

const WIN_BY = 2;

type Side = 'a' | 'b'; // a = 左（或下），b = 右（或上）

type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  speed: number;
};

type GameState = {
  ball: Ball;
  ay: number; // a 拍中心 y
  by: number; // b 拍中心 y
  scoreA: number;
  scoreB: number;
  server: Side; // 当前发球方
  /** 未发球时球贴在发球方拍上 */
  serving: boolean;
  rally: number;
  over: boolean;
  winner: Side | null;
  /** AI 自动发球的计划时刻（内部用） */
  _aiServeAt?: number;
};

const makeBall = (): Ball => ({x: W / 2, y: H / 2, vx: 0, vy: 0, spin: 0, speed: BALL_SPEED_START});

const initialState = (server: Side = 'a'): GameState => ({
  ball: makeBall(),
  ay: H / 2,
  by: H / 2,
  scoreA: 0,
  scoreB: 0,
  server,
  serving: true,
  rally: 0,
  over: false,
  winner: null,
});

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** 竖屏时上下预留的安全边（逻辑像素前的屏幕像素），防止拍子被比分板/提示条盖住 */
const VERTICAL_PAD_Y = 46;

/**
 * 逻辑坐标系 → 画布的映射参数。draw() 与指针换算共用，避免两处算法不一致。
 */
function viewTransform(cssW: number, cssH: number) {
  const vertical = cssH > cssW;
  if (vertical) {
    const scale = Math.min(cssW / H, (cssH - VERTICAL_PAD_Y * 2) / W);
    return {vertical, scale, offX: (cssW - H * scale) / 2, offY: (cssH - W * scale) / 2};
  }
  const scale = Math.min(cssW / W, cssH / H);
  return {vertical, scale, offX: (cssW - W * scale) / 2, offY: (cssH - H * scale) / 2};
}

/** 真实乒乓换发球：每 2 分换发；双方都到 (target-1) 后每 1 分换发 */
function serverFor(scoreA: number, scoreB: number, first: Side, target: number): Side {
  const total = scoreA + scoreB;
  const deuce = scoreA >= target - 1 && scoreB >= target - 1;
  const turns = deuce
    ? (target - 1) * 2 / 2 + (total - (target - 1) * 2) // 进入决胜后每分换
    : Math.floor(total / 2);
  const flip = Math.floor(turns) % 2 === 1;
  return flip ? (first === 'a' ? 'b' : 'a') : first;
}

function isMatchOver(scoreA: number, scoreB: number, target: number) {
  if (scoreA >= target && scoreA - scoreB >= WIN_BY) return true;
  if (scoreB >= target && scoreB - scoreA >= WIN_BY) return true;
  return false;
}

/* ------------------------------- 音效 ------------------------------------- */
class Sfx {
  private ctx: AudioContext | null = null;
  private muted = false;

  setMuted(m: boolean) {
    this.muted = m;
  }

  private ensure() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** 短促木质"啪" */
  private blip(freq: number, dur: number, type: OscillatorType, gain: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.55), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  paddle() {
    this.blip(680, 0.08, 'triangle', 0.16);
  }
  wall() {
    this.blip(360, 0.06, 'sine', 0.1);
  }
  score() {
    this.blip(240, 0.26, 'sawtooth', 0.11);
  }
  win() {
    const ctx = this.ensure();
    if (!ctx) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      window.setTimeout(() => this.blip(f, 0.2, 'triangle', 0.13), i * 105);
    });
  }
}

/* ---------------------------- AI 难度参数 -------------------------------- */
const AI_TUNING: Record<Difficulty, {speed: number; react: number; err: number}> = {
  // speed: 拍子跟随速度上限；react: 提前预判比例(0~1)；err: 落点误差(逻辑像素)
  easy: {speed: 5.6, react: 0.55, err: 62},
  normal: {speed: 7.8, react: 0.8, err: 30},
  hard: {speed: 10.4, react: 1, err: 10},
};

/* ============================== 组件 ===================================== */
export default function PingPongPage({lang, onBack}: PingPongPageProps) {
  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

  const [screen, setScreen] = useState<Screen>('menu');
  const [mode, setMode] = useState<Mode>('ai');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [target, setTarget] = useState(11);
  const [muted, setMuted] = useState(false);

  // 联机
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [role, setRole] = useState<Role>('host');
  const [connected, setConnected] = useState(false);
  const [peerHere, setPeerHere] = useState(false);
  const [netError, setNetError] = useState('');

  // 展示用比分（React 只负责显示，物理在 ref 里跑）
  const [ui, setUi] = useState({scoreA: 0, scoreB: 0, server: 'a' as Side, serving: true});
  const [result, setResult] = useState<{a: number; b: number; youWin: boolean} | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(initialState('a'));
  const keysRef = useRef<Record<string, boolean>>({});
  const rafRef = useRef<number>(0);
  const sfxRef = useRef<Sfx>(new Sfx());
  const trailRef = useRef<{x: number; y: number}[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const verticalRef = useRef(false);
  /** guest 侧收到的权威快照，用于插值 */
  const netSnapRef = useRef<{ball: Ball; ay: number; by: number; scoreA: number; scoreB: number; server: Side; serving: boolean} | null>(null);
  /** guest 上报自己的拍子位置 */
  const myPaddleRef = useRef(H / 2);
  const lastSendRef = useRef(0);
  const shakeRef = useRef(0);
  const modeRef = useRef<Mode>('ai');
  const roleRef = useRef<Role>('host');
  const diffRef = useRef<Difficulty>('normal');
  const targetRef = useRef(11);
  const screenRef = useRef<Screen>('menu');
  const peerHereRef = useRef(false);
  const prevPaddleRef = useRef({a: H / 2, b: H / 2});

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);
  useEffect(() => {
    diffRef.current = difficulty;
  }, [difficulty]);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);
  useEffect(() => {
    peerHereRef.current = peerHere;
  }, [peerHere]);
  useEffect(() => {
    sfxRef.current.setMuted(muted);
  }, [muted]);

  /* ----------------------- 发球：把球贴在发球方拍上 --------------------- */
  const placeForServe = useCallback((s: GameState) => {
    const from = s.server;
    s.ball.speed = BALL_SPEED_START;
    s.ball.spin = 0;
    s.ball.vx = 0;
    s.ball.vy = 0;
    if (from === 'a') {
      s.ball.x = PADDLE_INSET + PADDLE_W / 2 + BALL_R + 4;
      s.ball.y = s.ay;
    } else {
      s.ball.x = W - PADDLE_INSET - PADDLE_W / 2 - BALL_R - 4;
      s.ball.y = s.by;
    }
    s.serving = true;
    s.rally = 0;
  }, []);

  const launchServe = useCallback((s: GameState) => {
    if (!s.serving || s.over) return;
    const dir = s.server === 'a' ? 1 : -1;
    // 发球角度带一点随机，但不过分
    const ang = (Math.random() * 2 - 1) * 0.34;
    s.ball.speed = BALL_SPEED_START;
    s.ball.vx = Math.cos(ang) * s.ball.speed * dir;
    s.ball.vy = Math.sin(ang) * s.ball.speed;
    s.ball.spin = 0;
    s.serving = false;
    sfxRef.current.paddle();
  }, []);

  /* ------------------------------ 得分 --------------------------------- */
  const awardPoint = useCallback(
    (s: GameState, to: Side) => {
      if (to === 'a') s.scoreA += 1;
      else s.scoreB += 1;
      trailRef.current = [];
      shakeRef.current = 7;
      sfxRef.current.score();

      const tg = targetRef.current;
      if (isMatchOver(s.scoreA, s.scoreB, tg)) {
        s.over = true;
        s.winner = s.scoreA > s.scoreB ? 'a' : 'b';
        sfxRef.current.win();
      } else {
        // 首发方固定为 'a'（每局开局由 a 先发），按总分推导当前发球方
        s.server = serverFor(s.scoreA, s.scoreB, 'a', tg);
        placeForServe(s);
      }
    },
    [placeForServe],
  );

  /* --------------------- 拍子击球：反射 + 角度 + 旋转 -------------------- */
  const hitPaddle = useCallback((s: GameState, side: Side) => {
    const py = side === 'a' ? s.ay : s.by;
    const offset = clamp((s.ball.y - py) / (PADDLE_H / 2), -1, 1);
    const ang = offset * MAX_BOUNCE_ANGLE;
    s.ball.speed = Math.min(BALL_SPEED_MAX, s.ball.speed * BALL_SPEED_GAIN);
    const dir = side === 'a' ? 1 : -1;
    s.ball.vx = Math.cos(ang) * s.ball.speed * dir;
    s.ball.vy = Math.sin(ang) * s.ball.speed;
    // 拍子当帧移动速度 → 旋转
    const moved = side === 'a' ? s.ay - prevPaddleRef.current.a : s.by - prevPaddleRef.current.b;
    s.ball.spin = clamp(moved * SPIN_FROM_PADDLE, -3.4, 3.4);
    s.rally += 1;
    sfxRef.current.paddle();
    shakeRef.current = 3;
  }, []);

  /* ---------------------------- 物理一帧 ------------------------------- */
  const stepPhysics = useCallback(
    (s: GameState, dt: number) => {
      if (s.over) return;
      prevPaddleRef.current = {a: s.ay, b: s.by};

      /* --- 拍子控制 --- */
      const k = keysRef.current;
      const m = modeRef.current;
      const r = roleRef.current;
      const step = PADDLE_SPEED * dt;

      // 非同屏模式下，W/S 与 ↑/↓ 都控本机这一块拍子
      const upA = !!(k['w'] || k['arrowup']);
      const downA = !!(k['s'] || k['arrowdown']);

      if (m === 'local') {
        if (k['w']) s.ay -= step;
        if (k['s']) s.ay += step;
        if (k['arrowup']) s.by -= step;
        if (k['arrowdown']) s.by += step;
      } else if (m === 'ai') {
        if (upA) s.ay -= step;
        if (downA) s.ay += step;
        // --- AI 控 b ---
        const tune = AI_TUNING[diffRef.current];
        let aim = H / 2;
        if (s.ball.vx > 0) {
          // 球飞向 AI：预测落点（含墙面反弹折叠）
          const dist = W - PADDLE_INSET - PADDLE_W / 2 - BALL_R - s.ball.x;
          const time = s.ball.vx !== 0 ? dist / s.ball.vx : 0;
          let py = s.ball.y + s.ball.vy * time;
          const span = H - BALL_R * 2;
          if (span > 0) {
            let f = (py - BALL_R) % (span * 2);
            if (f < 0) f += span * 2;
            py = f > span ? span * 2 - f : f;
            py += BALL_R;
          }
          aim = py * tune.react + (s.ball.y) * (1 - tune.react);
          aim += (Math.random() * 2 - 1) * tune.err;
        } else {
          aim = H / 2 + (s.ball.y - H / 2) * 0.22;
        }
        const dy = aim - s.by;
        s.by += clamp(dy, -tune.speed * dt, tune.speed * dt);
      } else {
        // online
        if (r === 'host') {
          if (upA) s.ay -= step;
          if (downA) s.ay += step;
          // b 由网络快照驱动（远端 guest 上报）
          const snap = netSnapRef.current;
          if (snap) s.by += (snap.by - s.by) * Math.min(1, 0.32 * dt);
        } else {
          if (k['w'] || k['arrowup']) s.by -= step;
          if (k['s'] || k['arrowdown']) s.by += step;
          myPaddleRef.current = s.by;
        }
      }

      s.ay = clamp(s.ay, PADDLE_H / 2, H - PADDLE_H / 2);
      s.by = clamp(s.by, PADDLE_H / 2, H - PADDLE_H / 2);

      /* --- guest 不跑权威物理：插值跟随 host 快照 --- */
      if (m === 'online' && r === 'guest') {
        const snap = netSnapRef.current;
        if (snap) {
          const lerp = Math.min(1, 0.34 * dt);
          s.ball.x += (snap.ball.x - s.ball.x) * lerp;
          s.ball.y += (snap.ball.y - s.ball.y) * lerp;
          s.ball.vx = snap.ball.vx;
          s.ball.vy = snap.ball.vy;
          s.ay += (snap.ay - s.ay) * lerp;
          s.scoreA = snap.scoreA;
          s.scoreB = snap.scoreB;
          s.server = snap.server;
          s.serving = snap.serving;
        }
        if (!s.serving) {
          trailRef.current.push({x: s.ball.x, y: s.ball.y});
          if (trailRef.current.length > 13) trailRef.current.shift();
        }
        return;
      }

      /* --- 发球等待 --- */
      if (s.serving) {
        if (s.server === 'a') {
          s.ball.x = PADDLE_INSET + PADDLE_W / 2 + BALL_R + 4;
          s.ball.y = s.ay;
        } else {
          s.ball.x = W - PADDLE_INSET - PADDLE_W / 2 - BALL_R - 4;
          s.ball.y = s.by;
        }
        // AI 自动发球
        if (m === 'ai' && s.server === 'b') {
          if (!s._aiServeAt) s._aiServeAt = performance.now() + 620;
          if (performance.now() >= s._aiServeAt) {
            s._aiServeAt = 0;
            launchServe(s);
          }
        }
        return;
      }

      /* --- 球运动（旋转让轨迹微弯） --- */
      s.ball.vy += s.ball.spin * 0.045 * dt;
      s.ball.spin *= 1 - 0.012 * dt;
      s.ball.x += s.ball.vx * dt;
      s.ball.y += s.ball.vy * dt;

      trailRef.current.push({x: s.ball.x, y: s.ball.y});
      if (trailRef.current.length > 13) trailRef.current.shift();

      /* --- 上下墙 --- */
      if (s.ball.y - BALL_R <= 0) {
        s.ball.y = BALL_R;
        s.ball.vy = Math.abs(s.ball.vy);
        s.ball.spin *= -0.5;
        sfxRef.current.wall();
      } else if (s.ball.y + BALL_R >= H) {
        s.ball.y = H - BALL_R;
        s.ball.vy = -Math.abs(s.ball.vy);
        s.ball.spin *= -0.5;
        sfxRef.current.wall();
      }

      /* --- 拍子碰撞 --- */
      const aX = PADDLE_INSET + PADDLE_W / 2;
      const bX = W - PADDLE_INSET - PADDLE_W / 2;
      if (
        s.ball.vx < 0 &&
        s.ball.x - BALL_R <= aX + PADDLE_W / 2 &&
        s.ball.x - BALL_R > aX - PADDLE_W / 2 - Math.abs(s.ball.vx) - 2 &&
        Math.abs(s.ball.y - s.ay) <= PADDLE_H / 2 + BALL_R
      ) {
        s.ball.x = aX + PADDLE_W / 2 + BALL_R;
        hitPaddle(s, 'a');
      } else if (
        s.ball.vx > 0 &&
        s.ball.x + BALL_R >= bX - PADDLE_W / 2 &&
        s.ball.x + BALL_R < bX + PADDLE_W / 2 + Math.abs(s.ball.vx) + 2 &&
        Math.abs(s.ball.y - s.by) <= PADDLE_H / 2 + BALL_R
      ) {
        s.ball.x = bX - PADDLE_W / 2 - BALL_R;
        hitPaddle(s, 'b');
      }

      /* --- 出界得分 --- */
      if (s.ball.x + BALL_R < 0) awardPoint(s, 'b');
      else if (s.ball.x - BALL_R > W) awardPoint(s, 'a');
    },
    [awardPoint, hitPaddle, launchServe],
  );

  /* ------------------------------ 渲染 --------------------------------- */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    const vertical = cssH > cssW;
    verticalRef.current = vertical;

    const s = stateRef.current;
    const css = getComputedStyle(canvas);
    const cTable = css.getPropertyValue('--pp-table').trim() || '#e8e5de';
    const cLine = css.getPropertyValue('--pp-table-line').trim() || '#cfc9bc';
    const cInk = css.getPropertyValue('--pp-ink').trim() || '#1c1a17';
    const cAccent = css.getPropertyValue('--pp-accent').trim() || '#e07b00';
    const cInk3 = css.getPropertyValue('--pp-ink-3').trim() || '#8d867a';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    // 纯色底，无渐变
    ctx.fillStyle = cTable;
    ctx.fillRect(0, 0, cssW, cssH);

    // 逻辑 → 屏幕：竖屏时旋转 90°，让球台变成上下对打
    const shake = shakeRef.current;
    const sx = shake ? (Math.random() * 2 - 1) * shake * 0.5 : 0;
    const sy = shake ? (Math.random() * 2 - 1) * shake * 0.5 : 0;
    if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - 0.6);

    ctx.save();
    ctx.translate(sx, sy);
    const view = viewTransform(cssW, cssH);
    ctx.translate(view.offX, view.offY);
    ctx.scale(view.scale, view.scale);
    if (view.vertical) {
      // 竖屏：把横向球台竖过来，并让「本机那块拍子(逻辑 x 小的一侧)」落在屏幕下方，
      // 这样手机上自己的拍子就在拇指附近。逻辑 (x,y) → 画布 (y, W-x)
      ctx.transform(0, -1, 1, 0, 0, W);
    }

    /* 球台标线 —— 扁平细线 */
    ctx.strokeStyle = cLine;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // 中线（虚线网）
    ctx.save();
    ctx.setLineDash([12, 14]);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(W / 2, 6);
    ctx.lineTo(W / 2, H - 6);
    ctx.stroke();
    ctx.restore();

    // 中圈 + 两侧发球区细线
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 64, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W * 0.25, 30);
    ctx.lineTo(W * 0.25, H - 30);
    ctx.moveTo(W * 0.75, 30);
    ctx.lineTo(W * 0.75, H - 30);
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* 拖影 —— 纯色递减透明，非渐变 */
    const trail = trailRef.current;
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      const a = (i + 1) / trail.length;
      ctx.globalAlpha = a * 0.3;
      ctx.fillStyle = cAccent;
      ctx.beginPath();
      ctx.arc(p.x, p.y, BALL_R * (0.42 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* 拍子 —— 扁平圆角矩形 */
    const drawPaddle = (cx: number, cy: number, color: string) => {
      const x = cx - PADDLE_W / 2;
      const y = cy - PADDLE_H / 2;
      const r = 7;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + PADDLE_W - r, y);
      ctx.quadraticCurveTo(x + PADDLE_W, y, x + PADDLE_W, y + r);
      ctx.lineTo(x + PADDLE_W, y + PADDLE_H - r);
      ctx.quadraticCurveTo(x + PADDLE_W, y + PADDLE_H, x + PADDLE_W - r, y + PADDLE_H);
      ctx.lineTo(x + r, y + PADDLE_H);
      ctx.quadraticCurveTo(x, y + PADDLE_H, x, y + PADDLE_H - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
    };
    drawPaddle(PADDLE_INSET + PADDLE_W / 2, s.ay, cAccent);
    drawPaddle(W - PADDLE_INSET - PADDLE_W / 2, s.by, cInk);

    /* 球 */
    ctx.fillStyle = cAccent;
    ctx.beginPath();
    ctx.arc(s.ball.x, s.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    // 发球提示：球外一圈细环
    if (s.serving && !s.over) {
      ctx.strokeStyle = cAccent;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 240) * 0.3;
      ctx.beginPath();
      ctx.arc(s.ball.x, s.ball.y, BALL_R + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* 回合数（小字，居中偏下） */
    if (s.rally > 2 && !s.serving) {
      ctx.fillStyle = cInk3;
      ctx.font = '600 20px -apple-system, "SF Pro Text", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.55;
      if (vertical) {
        // 竖屏下整体做了 90° 旋转，文字要反向转回来才不是躺着的
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(`${s.rally}`, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(`${s.rally}`, W / 2, H / 2);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, []);

  /* --------------------------- 主循环 ---------------------------------- */
  useEffect(() => {
    if (screen !== 'play') return;
    let last = performance.now();
    let acc = 0;
    const FIXED = 1000 / 120; // 固定步长，保证不同刷新率手感一致

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      let elapsed = now - last;
      last = now;
      if (elapsed > 120) elapsed = 120; // 切后台回来别爆冲
      acc += elapsed;
      const s = stateRef.current;
      let guard = 0;
      while (acc >= FIXED && guard < 8) {
        acc -= FIXED;
        guard++;
        // dt 归一到 60fps 基准（FIXED=8.33ms → 0.5）
        stepPhysics(s, FIXED / (1000 / 60));
      }
      draw();

      // host 定期广播权威状态
      if (modeRef.current === 'online' && roleRef.current === 'host' && wsRef.current?.readyState === WebSocket.OPEN) {
        if (now - lastSendRef.current >= 33) {
          lastSendRef.current = now;
          wsRef.current.send(
            JSON.stringify({
              type: 'state',
              ball: {x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy, spin: s.ball.spin, speed: s.ball.speed},
              ay: s.ay,
              by: s.by,
              scoreA: s.scoreA,
              scoreB: s.scoreB,
              server: s.server,
              serving: s.serving,
              over: s.over,
              winner: s.winner,
            }),
          );
        }
      }
      // guest 上报拍子
      if (modeRef.current === 'online' && roleRef.current === 'guest' && wsRef.current?.readyState === WebSocket.OPEN) {
        if (now - lastSendRef.current >= 33) {
          lastSendRef.current = now;
          wsRef.current.send(JSON.stringify({type: 'paddle', y: myPaddleRef.current}));
        }
      }

      // 同步 UI 比分
      setUi((p) =>
        p.scoreA === s.scoreA && p.scoreB === s.scoreB && p.server === s.server && p.serving === s.serving
          ? p
          : {scoreA: s.scoreA, scoreB: s.scoreB, server: s.server, serving: s.serving},
      );

      if (s.over && screenRef.current === 'play') {
        const iAmA = !(modeRef.current === 'online' && roleRef.current === 'guest');
        const youWin = iAmA ? s.winner === 'a' : s.winner === 'b';
        setResult({a: s.scoreA, b: s.scoreB, youWin});
        setScreen('result');
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen, stepPhysics, draw]);

  /* --------------------------- 键盘 ------------------------------------ */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', ' ', 'w', 's'].includes(key)) e.preventDefault();
      keysRef.current[key] = true;
      if (key === ' ' || key === 'enter') {
        const s = stateRef.current;
        // 只有己方发球权才能发
        const m = modeRef.current;
        const mine: Side = m === 'online' && roleRef.current === 'guest' ? 'b' : 'a';
        if (s.serving && !s.over) {
          if (m === 'local') launchServe(s);
          else if (m === 'ai' && s.server === 'a') launchServe(s);
          else if (m === 'online') {
            if (roleRef.current === 'host' && s.server === 'a') launchServe(s);
            else if (roleRef.current === 'guest' && s.server === 'b') {
              wsRef.current?.send(JSON.stringify({type: 'serve'}));
            }
          }
          void mine;
        }
      }
      if (key === 'escape' && screenRef.current === 'play') setScreen('menu');
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    const blur = () => {
      keysRef.current = {};
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [launchServe]);

  /* ------------------- 指针/触摸控制（移动端 + 鼠标） ------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || screen !== 'play') return;

    const applyPointer = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const view = viewTransform(rect.width, rect.height);
      // 竖屏时逻辑 y 对应屏幕 x（球台转了 90°），横屏时对应屏幕 y
      const logical = view.vertical
        ? (clientX - rect.left - view.offX) / view.scale
        : (clientY - rect.top - view.offY) / view.scale;
      const s = stateRef.current;
      const y = clamp(logical, PADDLE_H / 2, H - PADDLE_H / 2);
      if (modeRef.current === 'online' && roleRef.current === 'guest') {
        s.by = y;
        myPaddleRef.current = y;
      } else {
        s.ay = y;
      }
    };

    let dragging = false;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture?.(e.pointerId);
      applyPointer(e.clientX, e.clientY);
      // 点一下也能发球
      const s = stateRef.current;
      const m = modeRef.current;
      if (s.serving && !s.over) {
        if (m === 'local' || (m === 'ai' && s.server === 'a')) launchServe(s);
        else if (m === 'online') {
          if (roleRef.current === 'host' && s.server === 'a') launchServe(s);
          else if (roleRef.current === 'guest' && s.server === 'b') wsRef.current?.send(JSON.stringify({type: 'serve'}));
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging && e.pointerType === 'touch') return;
      applyPointer(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      canvas.releasePointerCapture?.(e.pointerId);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [screen, launchServe]);

  /* --------------------------- 联机 ------------------------------------ */
  const wsUrl = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/pingpong/live`;
  }, []);

  const closeWs = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    }
    setConnected(false);
    setPeerHere(false);
  }, []);

  const openWs = useCallback(
    (payload: {action: 'create' | 'join'; code?: string}) => {
      setNetError('');
      closeWs();
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        setNetError(t('无法建立连接，请检查网络。', 'Could not connect. Check your network.'));
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const type = msg.type as string;

        if (type === 'created') {
          setRoomCode(String(msg.code || ''));
          setRole('host');
          roleRef.current = 'host';
          setScreen('lobby');
        } else if (type === 'joined') {
          setRoomCode(String(msg.code || ''));
          setRole('guest');
          roleRef.current = 'guest';
          setPeerHere(true);
          stateRef.current = initialState('a');
          setUi({scoreA: 0, scoreB: 0, server: 'a', serving: true});
          setScreen('play');
        } else if (type === 'peer-join') {
          setPeerHere(true);
          // host：对手到了，开局
          if (roleRef.current === 'host') {
            stateRef.current = initialState('a');
            placeForServe(stateRef.current);
            setUi({scoreA: 0, scoreB: 0, server: 'a', serving: true});
            setScreen('play');
          }
        } else if (type === 'peer-left') {
          setPeerHere(false);
          setNetError(t('对手离开了房间。', 'Your opponent left the room.'));
          if (screenRef.current === 'play') setScreen('lobby');
        } else if (type === 'state') {
          netSnapRef.current = {
            ball: msg.ball as Ball,
            ay: Number(msg.ay),
            by: Number(msg.by),
            scoreA: Number(msg.scoreA),
            scoreB: Number(msg.scoreB),
            server: msg.server as Side,
            serving: Boolean(msg.serving),
          };
          if (msg.over && roleRef.current === 'guest') {
            const s = stateRef.current;
            s.over = true;
            s.winner = (msg.winner as Side) || null;
          }
        } else if (type === 'paddle') {
          // host 收到 guest 拍子
          const y = Number(msg.y);
          if (Number.isFinite(y)) {
            netSnapRef.current = {
              ...(netSnapRef.current || {
                ball: makeBall(),
                ay: H / 2,
                by: y,
                scoreA: 0,
                scoreB: 0,
                server: 'a',
                serving: true,
              }),
              by: y,
            };
          }
        } else if (type === 'serve') {
          // guest 请求发球（只有它有发球权时 host 才执行）
          const s = stateRef.current;
          if (roleRef.current === 'host' && s.serving && s.server === 'b' && !s.over) launchServe(s);
        } else if (type === 'error') {
          const code = String(msg.reason || '');
          if (code === 'not-found') setNetError(t('房间不存在，检查一下房间码。', 'Room not found — double-check the code.'));
          else if (code === 'full') setNetError(t('这个房间已经满了。', 'That room is already full.'));
          else setNetError(t('出错了，请重试。', 'Something went wrong. Try again.'));
          closeWs();
        }
      };

      ws.onerror = () => {
        setNetError(t('连接失败。服务器可能没开 WebSocket。', 'Connection failed. The server may not support WebSocket.'));
      };
      ws.onclose = () => {
        setConnected(false);
        setPeerHere(false);
      };
    },
    [closeWs, wsUrl, t, placeForServe, launchServe],
  );

  useEffect(() => closeWs, [closeWs]);

  /* --------------------------- 开局 ------------------------------------ */
  const startSolo = useCallback(
    (m: Extract<Mode, 'ai' | 'local'>) => {
      setMode(m);
      modeRef.current = m;
      setRole('host');
      roleRef.current = 'host';
      const s = initialState('a');
      stateRef.current = s;
      placeForServe(s);
      trailRef.current = [];
      setUi({scoreA: 0, scoreB: 0, server: 'a', serving: true});
      setResult(null);
      setScreen('play');
    },
    [placeForServe],
  );

  const restart = useCallback(() => {
    const s = initialState('a');
    stateRef.current = s;
    placeForServe(s);
    trailRef.current = [];
    setUi({scoreA: 0, scoreB: 0, server: 'a', serving: true});
    setResult(null);
    setScreen('play');
  }, [placeForServe]);

  const backToMenu = useCallback(() => {
    closeWs();
    setRoomCode('');
    setJoinCode('');
    setNetError('');
    setResult(null);
    setScreen('menu');
  }, [closeWs]);

  /* ---------------------------- 文案 ----------------------------------- */
  const nameA = mode === 'ai' ? t('你', 'You') : mode === 'local' ? t('玩家 1', 'P1') : role === 'host' ? t('你', 'You') : t('对手', 'Rival');
  const nameB = mode === 'ai' ? t('电脑', 'CPU') : mode === 'local' ? t('玩家 2', 'P2') : role === 'guest' ? t('你', 'You') : t('对手', 'Rival');

  const myServeNow = (() => {
    if (!ui.serving) return false;
    if (mode === 'local') return true;
    if (mode === 'ai') return ui.server === 'a';
    return role === 'host' ? ui.server === 'a' : ui.server === 'b';
  })();

  const shareLink = `${window.location.origin}/pingpong`;

  /* ============================ 视图 ================================== */
  // no-grass：阻止首页那个「点哪长草」彩蛋在球台上种草
  return (
    <div className="pp-root no-grass">
      <header className="pp-bar">
        <button type="button" className="pp-btn" onClick={onBack}>
          ← {t('回家', 'Home')}
        </button>
        <div className="pp-bar-title">
          <b>{t('电子乒乓球', 'Table Tennis')}</b>
          <span>Ping Pong</span>
        </div>
        <div className="pp-bar-spacer" />
        {mode === 'online' && screen !== 'menu' ? (
          <span className="pp-conn">
            <i className={`pp-conn-dot${connected && peerHere ? ' pp-on' : ''}`} />
            {connected ? (peerHere ? t('对战中', 'Live') : t('等待对手', 'Waiting')) : t('未连接', 'Offline')}
          </span>
        ) : null}
        <button
          type="button"
          className="pp-btn pp-btn-icon"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? t('取消静音', 'Unmute') : t('静音', 'Mute')}
          title={muted ? t('取消静音', 'Unmute') : t('静音', 'Mute')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H3v6h3l5 4V5z" />
            {muted ? <path d="m17 9 4 6M21 9l-4 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" />}
          </svg>
        </button>
        {screen === 'play' ? (
          <button type="button" className="pp-btn" onClick={backToMenu}>
            {t('退出', 'Quit')}
          </button>
        ) : null}
      </header>

      <div className="pp-stage">
        <div className="pp-canvas-wrap">
          <canvas ref={canvasRef} className="pp-canvas" />

          {screen === 'play' || screen === 'result' ? (
            <div className="pp-score" aria-live="polite">
              <div className="pp-score-cell">
                <span className="pp-score-name">
                  <i className={`pp-serve-dot${ui.server === 'a' ? '' : ' pp-off'}`} />
                  {nameA}
                </span>
                <span className="pp-score-num">{ui.scoreA}</span>
              </div>
              <div className="pp-score-cell">
                <span className="pp-score-name">
                  <i className={`pp-serve-dot${ui.server === 'b' ? '' : ' pp-off'}`} />
                  {nameB}
                </span>
                <span className="pp-score-num">{ui.scoreB}</span>
              </div>
            </div>
          ) : null}

          {screen === 'play' && ui.serving ? (
            <div className="pp-toast">
              {myServeNow ? (
                <>
                  {t('轮到你发球 —— 按', 'Your serve — press ')}
                  <b> {t('空格', 'Space')} </b>
                  {t('或点一下球台', ' or tap the table')}
                </>
              ) : (
                t('等对手发球…', 'Waiting for their serve…')
              )}
            </div>
          ) : null}

          {/* ------------------------- 主菜单 ------------------------- */}
          {screen === 'menu' ? (
            <div className="pp-overlay">
              <div className="pp-panel">
                <div className="pp-panel-head">
                  <span className="pp-panel-eyebrow">{t('私密球室', 'Private room')}</span>
                  <h1 className="pp-panel-title">{t('电子乒乓球', 'Electric Table Tennis')}</h1>
                  <p className="pp-panel-desc">
                    {t(
                      '11 分制，需净胜 2 分。击球点决定回球角度，拍子移动会带旋转 —— 想拉弧线就在击球瞬间划一下。',
                      'First to 11, win by 2. Where the ball meets your paddle sets the angle, and moving as you hit adds spin.',
                    )}
                  </p>
                </div>

                <div className="pp-modes">
                  <button
                    type="button"
                    className="pp-mode"
                    onClick={() => {
                      setMode('online');
                      modeRef.current = 'online';
                      openWs({action: 'create'});
                    }}
                  >
                    <span className="pp-mode-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
                      </svg>
                    </span>
                    <span className="pp-mode-body">
                      <span className="pp-mode-name">{t('联机对战', 'Play online')}</span>
                      <span className="pp-mode-sub">{t('生成房间码，发给朋友就能异地开打', 'Create a room code and send it to your friend')}</span>
                    </span>
                    <span className="pp-mode-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>

                  <button type="button" className="pp-mode" onClick={() => startSolo('local')}>
                    <span className="pp-mode-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M8 4v16M16 4v16" />
                        <rect x="3" y="8" width="18" height="8" rx="2" />
                      </svg>
                    </span>
                    <span className="pp-mode-body">
                      <span className="pp-mode-name">{t('同屏双人', 'Same screen')}</span>
                      <span className="pp-mode-sub">{t('朋友就在旁边 · W/S 对 ↑/↓', 'Friend next to you · W/S vs ↑/↓')}</span>
                    </span>
                    <span className="pp-mode-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>

                  <button type="button" className="pp-mode" onClick={() => startSolo('ai')}>
                    <span className="pp-mode-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="4" y="7" width="16" height="12" rx="3" />
                        <path d="M9 12h.01M15 12h.01M12 3v4" />
                      </svg>
                    </span>
                    <span className="pp-mode-body">
                      <span className="pp-mode-name">{t('人机练习', 'Practice vs CPU')}</span>
                      <span className="pp-mode-sub">{t('先热热手，三档难度', 'Warm up — three difficulty levels')}</span>
                    </span>
                    <span className="pp-mode-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                </div>

                <div className="pp-field">
                  <span className="pp-label">{t('加入朋友的房间', 'Join a room')}</span>
                  <div className="pp-code-row">
                    <input
                      className="pp-input"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase())}
                      placeholder="A1B2"
                      inputMode="text"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={4}
                      aria-label={t('房间码', 'Room code')}
                    />
                    <button
                      type="button"
                      className="pp-btn pp-btn-accent pp-btn-lg"
                      disabled={joinCode.length < 4}
                      onClick={() => {
                        setMode('online');
                        modeRef.current = 'online';
                        openWs({action: 'join', code: joinCode});
                      }}
                    >
                      {t('加入', 'Join')}
                    </button>
                  </div>
                </div>

                <div className="pp-field-pair">
                  <div className="pp-field">
                    <span className="pp-label">{t('电脑难度', 'CPU level')}</span>
                    <div className="pp-seg">
                      {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                        <button key={d} type="button" aria-pressed={difficulty === d} onClick={() => setDifficulty(d)}>
                          {d === 'easy' ? t('轻松', 'Easy') : d === 'normal' ? t('正常', 'Normal') : t('困难', 'Hard')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pp-field">
                    <span className="pp-label">{t('几分一局', 'Points')}</span>
                    <div className="pp-seg">
                      {[5, 11, 21].map((n) => (
                        <button key={n} type="button" aria-pressed={target === n} onClick={() => setTarget(n)}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {netError ? <p className="pp-error">{netError}</p> : null}

                <div className="pp-keys">
                  <div className="pp-key-line">
                    <b>{t('移动', 'Move')}</b>
                    <kbd className="pp-kbd">W</kbd>
                    <kbd className="pp-kbd">S</kbd>
                    <span>{t('或', 'or')}</span>
                    <kbd className="pp-kbd">↑</kbd>
                    <kbd className="pp-kbd">↓</kbd>
                    <span>{t('· 也能用鼠标/手指拖', '· or drag with mouse/finger')}</span>
                  </div>
                  <div className="pp-key-line">
                    <b>{t('发球', 'Serve')}</b>
                    <kbd className="pp-kbd">space</kbd>
                    <span>{t('· 退出按', '· quit with')}</span>
                    <kbd className="pp-kbd">esc</kbd>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* -------------------------- 等待房 -------------------------- */}
          {screen === 'lobby' ? (
            <div className="pp-overlay">
              <div className="pp-panel">
                <div className="pp-panel-head">
                  <span className="pp-panel-eyebrow">{t('房间已开好', 'Room ready')}</span>
                  <h2 className="pp-panel-title">{t('把这个码发给朋友', 'Send this code to your friend')}</h2>
                </div>

                <div className="pp-code-show">
                  <span className="pp-code-big">{roomCode || '····'}</span>
                  <span className="pp-code-hint">
                    {t('朋友打开 ', 'They open ')}
                    <b>{shareLink}</b>
                    {t(' 后输入这个码即可加入。', ' and enter this code to join.')}
                  </span>
                </div>

                <div className="pp-row">
                  <button
                    type="button"
                    className="pp-btn"
                    onClick={() => {
                      void navigator.clipboard?.writeText(`${shareLink}  ${t('房间码', 'Room code')}: ${roomCode}`);
                    }}
                  >
                    {t('复制邀请', 'Copy invite')}
                  </button>
                  <div className="pp-bar-spacer" />
                  <span className="pp-conn">
                    <i className={`pp-conn-dot${connected ? ' pp-on' : ''}`} />
                    {peerHere ? t('对手已就位', 'Opponent ready') : t('等待对手加入…', 'Waiting for opponent…')}
                  </span>
                </div>

                {netError ? <p className="pp-error">{netError}</p> : null}

                <p className="pp-note">
                  {t(
                    '你是主机，负责这局的判定。对手一进来就自动开球。',
                    'You are the host and run the match simulation. The game starts the moment they join.',
                  )}
                </p>

                <div className="pp-row pp-row-end">
                  <button type="button" className="pp-btn" onClick={backToMenu}>
                    {t('取消', 'Cancel')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* -------------------------- 结算 --------------------------- */}
          {screen === 'result' && result ? (
            <div className="pp-overlay">
              <div className="pp-panel">
                <div className="pp-panel-head">
                  <span className="pp-panel-eyebrow">{result.youWin ? t('拿下这局', 'Game won') : t('这局输了', 'Game lost')}</span>
                  <h2 className="pp-panel-title">
                    {result.youWin ? t('赢了 🏓', 'You win 🏓') : t('再来一局？', 'Rematch?')}
                  </h2>
                </div>

                <div className="pp-result-score">
                  {result.a} <i>:</i> {result.b}
                </div>

                <p className="pp-note">
                  {t('最终比分', 'Final score')} · {nameA} {result.a} — {result.b} {nameB}
                </p>

                <div className="pp-row">
                  <button type="button" className="pp-btn pp-btn-accent pp-btn-lg" onClick={restart}>
                    {t('再来一局', 'Play again')}
                  </button>
                  <button type="button" className="pp-btn pp-btn-lg" onClick={backToMenu}>
                    {t('回菜单', 'Menu')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
