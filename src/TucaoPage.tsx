import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import './tucao.css';

type Lang = 'zh' | 'en';

type TucaoPageProps = {
  lang: Lang;
  onBack: () => void;
};

type Seat = {
  index: number;
  name: string;
  color: string;
  taken: boolean;
  posts: number;
  grudgeMade: number;
  online: boolean;
};

type Post = {
  id: string;
  seat: number;
  name: string;
  text: string;
  mood: string;
  at: number;
  cheers: number;
};

type Placed = {uid: string; id: string; x: number; y: number; by: number};

type CatalogItem = {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  rate: number;
  w: number;
  h: number;
  desc: string;
};

type MoodDef = {label: string; emoji: string; gain: number};

type Room = {
  grudge: number;
  grudgeTotal: number;
  ratePerMin: number;
  seats: Seat[];
  placed: Placed[];
  posts: Post[];
  catalog: CatalogItem[];
  moods: Record<string, MoodDef>;
  seatCount: number;
};

/** 飘浮气泡（本地动效，不入库） */
type Bubble = {key: string; text: string; name: string; color: string; x: number; y: number};
/** +怨气 冒字 */
type Pop = {key: string; text: string; x: number; y: number};

const LS_SEAT = 'tucao_seat_v1';
const LS_NAME = 'tucao_name_v1';
const LS_CHEERED = 'tucao_cheered_v1';

const fmt = (n: number) => {
  if (n >= 100000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 10000) return `${(n / 10000).toFixed(2)}万`;
  return Math.floor(n).toLocaleString('zh-CN');
};

const ago = (at: number, t: (zh: string, en: string) => string) => {
  const d = Date.now() - at;
  if (d < 60000) return t('刚刚', 'now');
  if (d < 3600000) return `${Math.floor(d / 60000)}${t('分钟前', 'm')}`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}${t('小时前', 'h')}`;
  return `${Math.floor(d / 86400000)}${t('天前', 'd')}`;
};

export default function TucaoPage({lang, onBack}: TucaoPageProps) {
  const t = useCallback((zh: string, en: string) => (lang === 'zh' ? zh : en), [lang]);

  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [mySeat, setMySeat] = useState<number>(-1);
  const [showJoin, setShowJoin] = useState(true);
  const [pickSeat, setPickSeat] = useState<number>(-1);
  const [nameInput, setNameInput] = useState('');
  const [err, setErr] = useState('');

  const [draft, setDraft] = useState('');
  const [mood, setMood] = useState('tired');
  const [tab, setTab] = useState<'wall' | 'shop'>('wall');
  const [mobilePanel, setMobilePanel] = useState<'room' | 'seats' | 'wall'>('room');

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [cheered, setCheered] = useState<Set<string>>(new Set());

  /** 本地乐观显示的怨气（每秒自己涨，让数字是"活"的），服务端快照到达时校正 */
  const [localGrudge, setLocalGrudge] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const roomElRef = useRef<HTMLDivElement | null>(null);
  const mySeatRef = useRef(-1);
  const dragRef = useRef<{uid: string; moved: boolean; lastSent: number} | null>(null);
  const reconnectRef = useRef<number>(0);
  const closedByUsRef = useRef(false);

  useEffect(() => {
    mySeatRef.current = mySeat;
  }, [mySeat]);

  /* ---------------- 恢复上次的昵称/座位 ---------------- */
  useEffect(() => {
    try {
      const n = localStorage.getItem(LS_NAME);
      if (n) setNameInput(n);
      const s = localStorage.getItem(LS_SEAT);
      if (s !== null && Number.isFinite(Number(s))) setPickSeat(Number(s));
      const c = localStorage.getItem(LS_CHEERED);
      if (c) setCheered(new Set(JSON.parse(c) as string[]));
    } catch {
      /* noop */
    }
  }, []);

  /* ---------------- 动效（要定义在 connect 之前，它会用到） ---------------- */
  const spawnBubble = useCallback(
    (post: Post, r: Room) => {
      const seat = r.seats.find((s) => s.index === post.seat);
      const key = `${post.id}-${Math.random().toString(36).slice(2, 6)}`;
      const b: Bubble = {
        key,
        text: post.text,
        name: post.name || t('匿名', 'anon'),
        color: seat?.color || '#e07b00',
        x: 16 + Math.random() * 68,
        y: 30 + Math.random() * 34,
      };
      setBubbles((prev) => [...prev.slice(-6), b]);
      window.setTimeout(() => setBubbles((prev) => prev.filter((x) => x.key !== key)), 7200);
    },
    [t],
  );

  const spawnPop = useCallback((text: string) => {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const p: Pop = {key, text, x: 42 + Math.random() * 16, y: 52 + Math.random() * 16};
    setPops((prev) => [...prev.slice(-5), p]);
    window.setTimeout(() => setPops((prev) => prev.filter((x) => x.key !== key)), 1300);
  }, []);

  /* ---------------- WebSocket ---------------- */
  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}//${window.location.host}/api/tucao/live`);
    } catch {
      setErr(t('连不上吐槽间，检查下网络。', 'Cannot reach the room. Check your network.'));
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectRef.current = 0;
      // 断线重连后自动回座
      const seat = mySeatRef.current;
      if (seat >= 0) {
        const nm = localStorage.getItem(LS_NAME) || '';
        if (nm) ws.send(JSON.stringify({action: 'claim', seat, name: nm}));
      }
    };

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }

      if (msg.type === 'room') {
        const r = msg.room as Room;
        setRoom(r);
        setLocalGrudge(r.grudge);

        const flash = msg.flash as {kind?: string; post?: Post; gain?: number} | undefined;
        if (flash?.kind === 'post' && flash.post) {
          spawnBubble(flash.post, r);
          if (typeof flash.gain === 'number') spawnPop(`+${flash.gain}`);
        }
      } else if (msg.type === 'event') {
        const e = msg.event as {kind?: string; uid?: string; x?: number; y?: number};
        if (e?.kind === 'move' && e.uid) {
          // 别人拖动家具：只改这一件，不整体刷新（避免自己正在拖的被打断）
          setRoom((prev) => {
            if (!prev) return prev;
            if (dragRef.current?.uid === e.uid) return prev;
            return {
              ...prev,
              placed: prev.placed.map((p) =>
                p.uid === e.uid ? {...p, x: e.x ?? p.x, y: e.y ?? p.y} : p,
              ),
            };
          });
        }
      } else if (msg.type === 'seated') {
        const seat = Number(msg.seat);
        setMySeat(seat);
        mySeatRef.current = seat;
        setShowJoin(false);
        setErr('');
        try {
          localStorage.setItem(LS_SEAT, String(seat));
        } catch {
          /* noop */
        }
      } else if (msg.type === 'error') {
        const reason = String(msg.reason || '');
        const map: Record<string, string> = {
          'seat-busy': t('这个位子有人正坐着，换一个。', 'That seat is taken right now.'),
          'need-name': t('先起个名字。', 'Pick a name first.'),
          'bad-seat': t('座位号不对。', 'Invalid seat.'),
          'not-seated': t('先入座才能吐槽。', 'Take a seat first.'),
          'not-enough': t('怨气不够，再多吐几句。', 'Not enough grudge — keep venting.'),
          'room-full': t('房间塞满了，先卖掉点东西。', 'Room is full — sell something first.'),
          'too-fast': t('慢点儿，喘口气。', 'Easy — take a breath.'),
          'no-such-item': t('没有这件家具。', 'No such item.'),
        };
        setErr(map[reason] || t('出错了，重试一下。', 'Something went wrong.'));
        window.setTimeout(() => setErr(''), 3200);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (closedByUsRef.current) return;
      // 指数退避重连
      const n = Math.min(6, reconnectRef.current + 1);
      reconnectRef.current = n;
      window.setTimeout(() => {
        if (!closedByUsRef.current) connect();
      }, Math.min(8000, 600 * 2 ** (n - 1)));
    };

    ws.onerror = () => {
      setConnected(false);
    };
  }, [t, spawnBubble, spawnPop]);

  useEffect(() => {
    closedByUsRef.current = false;
    connect();
    return () => {
      closedByUsRef.current = true;
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    };
  }, [connect]);

  /** 心跳：维持在线状态 */
  useEffect(() => {
    if (mySeat < 0) return;
    const id = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({action: 'heartbeat'}));
    }, 20000);
    return () => window.clearInterval(id);
  }, [mySeat]);

  /** 本地怨气自增，让数字看起来在动 */
  useEffect(() => {
    if (!room) return;
    const perSec = room.ratePerMin / 60;
    if (perSec <= 0) return;
    const id = window.setInterval(() => setLocalGrudge((g) => g + perSec), 1000);
    return () => window.clearInterval(id);
  }, [room?.ratePerMin, room]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  /* ---------------- 交互 ---------------- */
  const doClaim = () => {
    const name = nameInput.trim();
    if (!name) {
      setErr(t('先起个名字。', 'Pick a name first.'));
      return;
    }
    if (pickSeat < 0) {
      setErr(t('选个位子坐。', 'Pick a seat.'));
      return;
    }
    try {
      localStorage.setItem(LS_NAME, name);
    } catch {
      /* noop */
    }
    send({action: 'claim', seat: pickSeat, name});
  };

  const doPost = () => {
    const text = draft.trim();
    if (!text || mySeat < 0) return;
    send({action: 'post', text, mood});
    setDraft('');
  };

  const doCheer = (id: string) => {
    if (cheered.has(id)) return;
    send({action: 'cheer', id});
    const next = new Set(cheered);
    next.add(id);
    setCheered(next);
    try {
      localStorage.setItem(LS_CHEERED, JSON.stringify([...next].slice(-300)));
    } catch {
      /* noop */
    }
  };

  const doBuy = (item: CatalogItem) => {
    // 买下来直接落在房间里随机空位，之后可以拖
    send({action: 'buy', id: item.id, x: 14 + Math.random() * 72, y: 46 + Math.random() * 42});
  };

  /* ---------------- 拖动家具 ---------------- */
  const onFurnPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, p: Placed) => {
    if (mySeat < 0) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {uid: p.uid, moved: false, lastSent: 0};
  };

  const onRoomPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = roomElRef.current;
    if (!drag || !el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(96, Math.max(4, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(94, Math.max(44, ((e.clientY - rect.top) / rect.height) * 100));
    drag.moved = true;
    setRoom((prev) =>
      prev ? {...prev, placed: prev.placed.map((it) => (it.uid === drag.uid ? {...it, x, y} : it))} : prev,
    );
    // 拖动很高频，上报节流到 ~60ms 一次
    const now = Date.now();
    if (now - drag.lastSent > 60) {
      drag.lastSent = now;
      send({action: 'move', uid: drag.uid, x, y});
    }
  };

  const onRoomPointerUp = () => {
    const drag = dragRef.current;
    if (drag?.moved) {
      const item = room?.placed.find((p) => p.uid === drag.uid);
      if (item) send({action: 'move', uid: item.uid, x: item.x, y: item.y});
    }
    dragRef.current = null;
  };

  /* ---------------- 派生数据 ---------------- */
  const catalog = room?.catalog || [];
  const moods: Record<string, MoodDef> = room?.moods || {};
  const ownedCount = useMemo(() => {
    const m: Record<string, number> = {};
    (room?.placed || []).forEach((p) => {
      m[p.id] = (m[p.id] || 0) + 1;
    });
    return m;
  }, [room?.placed]);

  const leaderboard = useMemo(
    () => [...(room?.seats || [])].filter((s) => s.taken).sort((a, b) => b.grudgeMade - a.grudgeMade),
    [room?.seats],
  );

  const onlineCount = (room?.seats || []).filter((s) => s.online).length;
  const grudgeShown = Math.floor(localGrudge);

  /* ============================ 视图 ================================== */
  // no-grass：阻止首页「点哪长草」彩蛋在吐槽间里种草
  return (
    <div className="tc-root no-grass">
      <header className="tc-bar">
        <button type="button" className="tc-btn" onClick={onBack}>
          ← {t('回家', 'Home')}
        </button>
        <div className="tc-bar-title">
          <b>{t('吐槽间', 'The Vent Room')}</b>
          <span>Vent Room</span>
        </div>

        <div className="tc-bar-spacer" />

        <div className="tc-meter">
          <div className="tc-meter-cell">
            <span className="tc-meter-label">{t('全屋怨气', 'Grudge')}</span>
            <span className="tc-meter-val tc-hot">{fmt(grudgeShown)}</span>
          </div>
          <div className="tc-meter-cell">
            <span className="tc-meter-label">{t('每分钟', 'Per min')}</span>
            <span className="tc-meter-sub">+{room?.ratePerMin ?? 0}</span>
          </div>
          <div className="tc-meter-cell">
            <span className="tc-meter-label">{t('在线', 'Online')}</span>
            <span className="tc-meter-sub">
              {onlineCount}/{room?.seatCount ?? 7}
            </span>
          </div>
        </div>

        <span className="tc-conn">
          <i className={`tc-conn-dot${connected ? ' tc-on' : ''}`} />
          {connected ? t('已连接', 'Live') : t('重连中', 'Reconnecting')}
        </span>

        {mySeat >= 0 ? (
          <button type="button" className="tc-btn tc-btn-sm" onClick={() => setShowJoin(true)}>
            {t('换座', 'Switch seat')}
          </button>
        ) : null}

        <div className="tc-mobile-tabs">
          {(['seats', 'room', 'wall'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`tc-btn tc-btn-sm${mobilePanel === k ? ' tc-btn-accent' : ''}`}
              style={{flex: 1}}
              onClick={() => setMobilePanel(k)}
            >
              {k === 'seats' ? t('座位', 'Seats') : k === 'room' ? t('房间', 'Room') : t('吐槽墙', 'Wall')}
            </button>
          ))}
        </div>
      </header>

      {err ? (
        <div style={{padding: '8px 14px 0'}}>
          <p className="tc-error">{err}</p>
        </div>
      ) : null}

      <div className="tc-body" data-panel={mobilePanel}>
        {/* ---------------- 左：七个座位 ---------------- */}
        <aside className="tc-col tc-col-left">
          <div className="tc-col-head">
            <span className="tc-col-title">
              {t('七个座位', 'Seven seats')} · {onlineCount}/{room?.seatCount ?? 7}
            </span>
          </div>
          <div className="tc-col-scroll">
            {(room?.seats || []).map((s) => {
              const isMe = s.index === mySeat;
              const open = !s.taken;
              return (
                <div
                  key={s.index}
                  className={`tc-seat${open ? ' tc-seat-open' : ''}${isMe ? ' tc-seat-me' : ''}`}
                  onClick={() => {
                    if (open) {
                      setPickSeat(s.index);
                      setShowJoin(true);
                    }
                  }}
                  role={open ? 'button' : undefined}
                  tabIndex={open ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (open && (e.key === 'Enter' || e.key === ' ')) {
                      setPickSeat(s.index);
                      setShowJoin(true);
                    }
                  }}
                >
                  <span
                    className={`tc-seat-dot${open ? ' tc-empty' : ''}`}
                    style={open ? undefined : {background: s.color}}
                  >
                    {open ? s.index + 1 : (s.name || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="tc-seat-body">
                    <span className={`tc-seat-name${open ? ' tc-dim' : ''}`}>
                      {open ? t(`空位 ${s.index + 1}`, `Seat ${s.index + 1}`) : s.name}
                      {isMe ? t('（你）', ' (you)') : ''}
                    </span>
                    <span className="tc-seat-meta">
                      {open
                        ? t('点一下坐下', 'tap to sit')
                        : `${s.posts} ${t('条', 'posts')} · ${fmt(s.grudgeMade)} ${t('怨气', 'grudge')}`}
                    </span>
                  </span>
                  {!open ? <i className={`tc-online${s.online ? '' : ' tc-off'}`} title={s.online ? '在线' : '离线'} /> : null}
                </div>
              );
            })}

            {leaderboard.length > 1 ? (
              <>
                <div className="tc-col-title" style={{padding: '10px 4px 2px'}}>
                  {t('怨气榜', 'Top venters')}
                </div>
                {leaderboard.slice(0, 3).map((s, i) => (
                  <div key={s.index} className="tc-seat" style={{padding: '7px 10px'}}>
                    <span className="tc-seat-dot" style={{background: s.color, width: 22, height: 22, fontSize: 11}}>
                      {i + 1}
                    </span>
                    <span className="tc-seat-body">
                      <span className="tc-seat-name" style={{fontSize: 12.5}}>
                        {s.name}
                      </span>
                      <span className="tc-seat-meta">{fmt(s.grudgeMade)}</span>
                    </span>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        </aside>

        {/* ---------------- 中：房间 + 输入 ---------------- */}
        <main className="tc-col">
          <div className="tc-stage">
            <div
              className="tc-room"
              ref={roomElRef}
              onPointerMove={onRoomPointerMove}
              onPointerUp={onRoomPointerUp}
              onPointerLeave={onRoomPointerUp}
              onPointerCancel={onRoomPointerUp}
            >
              <div className="tc-room-deco tc-deco-window" aria-hidden="true" />
              <div className="tc-room-deco tc-deco-clock" aria-hidden="true" />
              <div className="tc-room-floor" />
              <div className="tc-room-skirt" aria-hidden="true" />
              <div className="tc-room-grid" aria-hidden="true">
                {[52, 62, 72, 82, 92].map((top) => (
                  <i key={top} style={{top: `${top}%`}} />
                ))}
              </div>

              {(room?.placed || []).length === 0 ? (
                <div className="tc-room-hint">
                  {t(
                    '房间还空着。先吐几句攒怨气，再去右边商店买点东西摆进来。',
                    'Empty room. Vent a bit to earn grudge, then buy something from the shop.',
                  )}
                </div>
              ) : null}

              {/* 家具（按 y 排序做近大远小 + 遮挡） */}
              {[...(room?.placed || [])]
                .sort((a, b) => a.y - b.y)
                .map((p) => {
                  const item = catalog.find((c) => c.id === p.id);
                  if (!item) return null;
                  // 地板范围 44%~94%：越靠下越近越大（0.78 ~ 1.42）
                  const t01 = Math.min(1, Math.max(0, (p.y - 44) / 50));
                  const depth = 0.78 + t01 * 0.64;
                  const size = Math.round(item.h * 0.62 * depth);
                  const isDragging = dragRef.current?.uid === p.uid;
                  const owner = room?.seats.find((s) => s.index === p.by);
                  return (
                    <button
                      type="button"
                      key={p.uid}
                      className={`tc-furn${isDragging ? ' tc-dragging' : ''}`}
                      style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        zIndex: Math.round(p.y * 10),
                      }}
                      onPointerDown={(e) => onFurnPointerDown(e, p)}
                      onDoubleClick={() => {
                        if (mySeat >= 0) send({action: 'sell', uid: p.uid});
                      }}
                      title={`${item.name} · +${item.rate}/min${owner?.name ? ` · ${owner.name}${t('放的', "'s")}` : ''}${t('（双击卖掉，退一半）', ' (double-click to sell for half)')}`}
                      aria-label={item.name}
                    >
                      <span className="tc-furn-emoji" style={{fontSize: size}}>
                        {item.emoji}
                      </span>
                      <span className="tc-furn-tag">
                        {item.name} +{item.rate}
                      </span>
                    </button>
                  );
                })}

              {/* 飘浮气泡 */}
              {bubbles.map((b) => (
                <div key={b.key} className="tc-bubble" style={{left: `${b.x}%`, top: `${b.y}%`}}>
                  <b style={{color: b.color}}>{b.name}</b>
                  {b.text}
                </div>
              ))}

              {/* +怨气 */}
              {pops.map((p) => (
                <div key={p.key} className="tc-pop" style={{left: `${p.x}%`, top: `${p.y}%`}}>
                  {p.text}
                </div>
              ))}
            </div>

            {/* 吐槽输入 */}
            <div className="tc-compose">
              <div className="tc-moods">
                {Object.entries(moods).map(([key, m]) => (
                  <button
                    key={key}
                    type="button"
                    className="tc-mood"
                    aria-pressed={mood === key}
                    onClick={() => setMood(key)}
                  >
                    <span>{m.emoji}</span>
                    <span>{m.label}</span>
                    <span className="tc-mood-gain">+{m.gain}</span>
                  </button>
                ))}
              </div>
              <div className="tc-compose-row">
                <textarea
                  className="tc-textarea"
                  value={draft}
                  maxLength={140}
                  placeholder={
                    mySeat < 0
                      ? t('先在左边挑个座位坐下…', 'Take a seat on the left first…')
                      : t('今天又发生了什么离谱的事？(Enter 发送，Shift+Enter 换行)', "What absurd thing happened today? (Enter to send)")
                  }
                  disabled={mySeat < 0}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      doPost();
                    }
                  }}
                />
                <button
                  type="button"
                  className="tc-btn tc-btn-accent tc-send"
                  disabled={mySeat < 0 || !draft.trim()}
                  onClick={doPost}
                >
                  {t('吐出去', 'Vent')}
                </button>
              </div>
              <div className="tc-count">{draft.length}/140</div>
            </div>
          </div>
        </main>

        {/* ---------------- 右：吐槽墙 / 商店 ---------------- */}
        <aside className="tc-col tc-col-right">
          <div className="tc-col-head">
            <div className="tc-tabs">
              <button type="button" aria-pressed={tab === 'wall'} onClick={() => setTab('wall')}>
                {t('吐槽墙', 'Wall')}
              </button>
              <button type="button" aria-pressed={tab === 'shop'} onClick={() => setTab('shop')}>
                {t('商店', 'Shop')}
              </button>
            </div>
          </div>

          <div className="tc-col-scroll">
            {tab === 'wall' ? (
              (room?.posts || []).length === 0 ? (
                <p className="tc-empty-note">
                  {t('还没人吐槽。第一个开口的人最勇敢。', 'Nobody vented yet. Be the brave first.')}
                </p>
              ) : (
                [...(room?.posts || [])].reverse().map((p) => {
                  const seat = room?.seats.find((s) => s.index === p.seat);
                  const m = moods[p.mood];
                  return (
                    <article key={p.id} className="tc-post">
                      <div className="tc-post-top">
                        <span className="tc-post-mood">{m?.emoji || '💬'}</span>
                        <span className="tc-post-who" style={{color: seat?.color}}>
                          {p.name || t('匿名', 'anon')}
                        </span>
                        <span className="tc-post-time">{ago(p.at, t)}</span>
                      </div>
                      <div className="tc-post-text">{p.text}</div>
                      <div className="tc-post-foot">
                        <button
                          type="button"
                          className="tc-cheer"
                          disabled={mySeat < 0 || cheered.has(p.id)}
                          onClick={() => doCheer(p.id)}
                          title={t('我也是！(+4 怨气)', 'Same! (+4 grudge)')}
                        >
                          🙋 {t('我也是', 'Same')} {p.cheers > 0 ? p.cheers : ''}
                        </button>
                      </div>
                    </article>
                  );
                })
              )
            ) : (
              <>
                <p className="tc-note" style={{padding: '0 4px 4px'}}>
                  {t(
                    '买来的家具会一直产怨气 —— 关掉页面也在涨（最多存 12 小时）。买完可以拖着摆位，双击卖掉退一半。',
                    'Furniture keeps generating grudge even while you are away (up to 12h). Drag to arrange, double-click to sell for half.',
                  )}
                </p>
                {catalog.map((item) => {
                  const owned = ownedCount[item.id] || 0;
                  const afford = grudgeShown >= item.cost;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="tc-shop-item"
                      disabled={mySeat < 0 || !afford}
                      onClick={() => doBuy(item)}
                    >
                      <span className="tc-shop-emoji">{item.emoji}</span>
                      <span className="tc-shop-body">
                        <span className="tc-shop-name">
                          {item.name}
                          {owned > 0 ? <span className="tc-shop-owned"> ×{owned}</span> : null}
                        </span>
                        <span className="tc-shop-desc">{item.desc}</span>
                        <span className="tc-shop-rate">+{item.rate}/min</span>
                      </span>
                      <span className="tc-shop-cost">{item.cost === 0 ? t('免费', 'free') : fmt(item.cost)}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </aside>
      </div>

      {/* ---------------- 入座弹窗 ---------------- */}
      {showJoin ? (
        <div className="tc-overlay">
          <div className="tc-panel">
            <div>
              <span className="tc-panel-eyebrow">{t('七人吐槽间', 'Seven seats')}</span>
              <h1 className="tc-panel-title">{t('挑个位子，开始吐槽', 'Grab a seat and start venting')}</h1>
            </div>
            <p className="tc-panel-desc">
              {t(
                '这里能坐七个人。吐槽会变成「怨气」，怨气能买家具摆进房间；家具会自己产怨气 —— 你不在的时候也在涨。所以这既是个树洞，也是个大家一起装修的挂机游戏。',
                'Seven people fit here. Venting turns into "grudge", which buys furniture for the room. Furniture keeps producing grudge even while you are away — a shared idle game that doubles as a place to complain.',
              )}
            </p>

            <div className="tc-field">
              <span className="tc-label">{t('你叫什么', 'Your name')}</span>
              <input
                className="tc-input"
                value={nameInput}
                maxLength={12}
                placeholder={t('随便起，12 字以内', 'Anything, up to 12 chars')}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') doClaim();
                }}
              />
            </div>

            <div className="tc-field">
              <span className="tc-label">{t('坐哪个位子', 'Pick a seat')}</span>
              <div className="tc-seat-pick">
                {(room?.seats || []).map((s) => {
                  const busy = s.taken && s.online && s.index !== mySeat;
                  return (
                    <button
                      key={s.index}
                      type="button"
                      className="tc-seat-chip"
                      aria-pressed={pickSeat === s.index}
                      disabled={busy}
                      onClick={() => setPickSeat(s.index)}
                      title={busy ? t('有人在坐', 'occupied') : s.name || t('空位', 'free')}
                    >
                      <i style={{background: s.color}} />
                      {s.index + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {err ? <p className="tc-error">{err}</p> : null}

            <p className="tc-note">
              {t('位子上有人在线时不能顶掉；离线的位子可以接着用。', 'You cannot take a seat while its owner is online; offline seats can be reused.')}
            </p>

            <div style={{display: 'flex', gap: 9, justifyContent: 'flex-end'}}>
              {mySeat >= 0 ? (
                <button type="button" className="tc-btn" onClick={() => setShowJoin(false)}>
                  {t('先不换', 'Cancel')}
                </button>
              ) : null}
              <button
                type="button"
                className="tc-btn tc-btn-accent"
                style={{height: 44, padding: '0 20px'}}
                disabled={!connected || !nameInput.trim() || pickSeat < 0}
                onClick={doClaim}
              >
                {t('坐下', 'Sit down')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
