import {useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {ArrowLeft, Bell, Check, ChevronRight, CloudRain, Flower2, Heart, Leaf, Moon, Pause, Play, RotateCcw, Sun, Users, X} from 'lucide-react';
import {Cow, hosts, type CowData} from './pasture/Cow';
import {Blossom, Tree} from './pasture/Island';
import './pasture/pasture.css';

import {arrange, clamp, clearance, createHerd, cuddle, fieldPoint, gather, stepHerd, type Agent, type Field, type Point, type Seed, type State} from './pasture/behavior';
type Flower = Point & {id: number};
const mix = (a: number[], b: number[], v: number) => `rgb(${a.map((n, i) => Math.round(n + (b[i] - n) * v)).join(',')})`;

function Sheet({title, children, close}: {title: string; children: ReactNode; close: () => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {ref.current?.showModal(); return () => ref.current?.close();}, []);
  return <dialog ref={ref} className="pg-sheet" aria-label={title} onCancel={(e) => {e.preventDefault(); close();}} onClick={(e) => {if (e.target === e.currentTarget) close();}}><div className="pg-sheet-inner"><header><h2>{title}</h2><button className="pg-icon" onClick={close} aria-label="Close / 关闭"><X size={20} /></button></header>{children}</div></dialog>;
}

export default function PasturePage({lang, onBack, onToggleLang}: {lang: 'zh' | 'en'; onBack: () => void; onToggleLang: () => void}) {
  const t = useCallback((zh: string, en: string) => lang === 'en' ? en : zh, [lang]);
  const [cows, setCows] = useState<CowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tool, setTool] = useState<'feed' | 'flower'>('feed');
  const [rain, setRain] = useState(false);
  const [time, setTime] = useState(28);
  const [autoTime, setAutoTime] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [active, setActive] = useState<CowData | null>(null);
  const [residents, setResidents] = useState(false);
  const [flowers, setFlowers] = useState<Flower[]>([]);
  const [food, setFood] = useState<Seed[]>([]);
  const [feeds, setFeeds] = useState(0);
  const [pets, setPets] = useState(0);
  const [notice, setNotice] = useState('');
  const [cowSize, setCowSize] = useState(72);
  const [behavior, setBehavior] = useState<Record<string, {state: State; hungry: boolean}>>({});
  const field = useRef<Field>({width: 800, height: 300, cowSize: 88});
  const simTime = useRef(0);
  const nightRef = useRef(0);
  const agents = useRef<Agent[]>([]);
  const elements = useRef<Record<string, HTMLButtonElement | null>>({});
  const lawn = useRef<HTMLDivElement>(null);
  const seeds = useRef<Seed[]>([]);
  const identity = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const inhabitants = cows.length ? cows : hosts;
  const night = clamp((time - 56) / 30, 0, 1);
  nightRef.current = night;
  const sunset = Math.max(0, 1 - Math.abs(time - 57) / 20);
  const scene = {
    '--pg-cow-size': `${cowSize}px`,
    '--pg-sky': mix([245, 247, 242], [28, 41, 45], night), '--pg-ink': mix([35, 51, 43], [236, 243, 232], night),
    '--pg-muted': mix([114, 126, 114], [168, 186, 175], night), '--pg-grass': mix([188, 210, 156], [80, 112, 91], night),
    '--pg-grass-light': mix([214, 228, 190], [106, 140, 116], night), '--pg-earth': mix([147, 172, 128], [52, 78, 67], night),
    '--pg-tree': mix([132, 166, 122], [57, 93, 73], night), '--pg-glass': night > .5 ? 'rgba(41,58,57,.82)' : 'rgba(255,255,255,.79)',
    '--pg-night': night, '--pg-sunset': sunset,
  } as CSSProperties;
  const phaseLabel = time < 16 ? t('晨光', 'Dawn') : time < 48 ? t('晴昼', 'Daylight') : time < 72 ? t('日落', 'Sunset') : t('星夜', 'Starlight');

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {setReduced(media.matches); if (media.matches) setPaused(true);};
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setFailed(false);
    fetch('/api/data', {signal: controller.signal}).then((r) => {if (!r.ok) throw new Error('load'); return r.json();}).then((data) => setCows(Array.isArray(data.cows) ? data.cows : [])).catch((e) => {if (e.name !== 'AbortError') setFailed(true);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    agents.current = createHerd(inhabitants, agents.current);
  }, [cows]);
  useEffect(() => {
    const el = lawn.current;
    if (!el) return;
    const measure = () => {
      const {width,height} = el.getBoundingClientRect();
      if (!width || !height) return;
      let size = Math.min(width < 500 ? 72 : 108, Math.sqrt(width*height*.42/Math.max(1,agents.current.length))*.78);
      const next = {width,height,cowSize:Math.max(24,size)};
      arrange(agents.current,next);
      for (let attempt=0;attempt<10;attempt++) {
        const crowded = agents.current.some((a,i)=>agents.current.slice(i+1).some((b)=>clearance(a,b,next)<1.08));
        if (!crowded || next.cowSize<=24) break;
        next.cowSize=Math.max(24,next.cowSize*.9); arrange(agents.current,next);
      }
      field.current=next; setCowSize(next.cowSize);
    };
    measure(); const observer=new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, [cows]);
  useEffect(() => {
    if (!autoTime || paused) return;
    const timer = setInterval(() => setTime((v) => (v + .35) % 101), 1000);
    return () => clearInterval(timer);
  }, [autoTime, paused]);
  useEffect(() => () => {if (noticeTimer.current) clearTimeout(noticeTimer.current);}, []);
  const tell = (text: string) => {setNotice(text); if (noticeTimer.current) clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(''), 3000);};

  useEffect(() => {
    let frame = 0, last = 0, nextReport = 0;
    const step = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, .05); last = now;
      const running = !paused && !document.hidden;
      let foodChanged = false;
      if (running) {
        simTime.current += dt;
        foodChanged=stepHerd(agents.current,seeds.current,field.current,dt,simTime.current,nightRef.current);
      }
      for (const a of agents.current) {
        const walking=running && a.moving, eating=a.state==='eat';
        const el = elements.current[a.key];
        if (el) {
          el.style.left = `${a.x}%`; el.style.top = `${a.y}%`;
          el.style.transform = `translate(-50%,-100%) scale(${.76 + a.y / 160})`;
          // Diagonal leg pairs share the movement clock, so rushing to food speeds up the gait.
          const stride = walking && !reduced ? Math.sin(a.phase) : 0;
          el.style.setProperty('--pg-leg-a', `${stride * 25}deg`);
          el.style.setProperty('--pg-leg-b', `${-stride * 25}deg`);
          el.style.setProperty('--pg-lift-a', `${-Math.max(0, stride) * 3}px`);
          el.style.setProperty('--pg-lift-b', `${-Math.max(0, -stride) * 3}px`);
          el.style.setProperty('--pg-bob', `${-Math.abs(stride) * 1.6}px`);
          el.style.setProperty('--pg-sway', `${stride * 1.2}deg`);
          el.style.zIndex = String(Math.round(a.y));
          el.style.setProperty('--pg-facing', String(a.facing));
          el.dataset.state = a.state; el.dataset.walking = String(walking); el.dataset.loved = String(a.heart > 0); el.dataset.eating = String(eating);
        }
      }
      const fresh = seeds.current.filter((s) => s.bites > 0 && simTime.current - s.born < 50);
      if (foodChanged || fresh.length !== seeds.current.length) {seeds.current = fresh; setFood([...fresh]);}
      if (now>nextReport) {
        nextReport=now+700;
        setBehavior(Object.fromEntries(agents.current.map((a)=>[a.key,{state:a.state,hungry:a.hunger>=a.appetite}])));
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [paused, reduced]);

  const drop = (point: Point) => {
    const location = fieldPoint(point.x, point.y);
    if (toolRef.current === 'flower') {
      setFlowers((list) => [...list.slice(-35), {...location, id: identity.current++}]);
    } else {
      const seed = {...location, id: identity.current++, born: simTime.current, bites: 3};
      seeds.current = [...seeds.current.slice(-15), seed]; setFood([...seeds.current]); setFeeds((v) => v + 1);
    }
  };
  const call = () => {
    const count=gather(agents.current,field.current);
    tell(paused ? t('继续时间，醒着的牛牛才会过来。', 'Resume time to let awake cows come over.') : count ? t(`${count} 只牛牛愿意过来，睡着的继续做梦。`, `${count} friends are coming. Sleepy ones keep dreaming.`) : t('大家正在休息或吃饭，晚一点再叫吧。', 'Everyone is resting or eating. Try again later.'));
  };
  const pet = (cow: CowData) => {
    const a = agents.current.find((agent) => agent.cow === cow);
    if (a) cuddle(a);
    setPets((v) => v + 1); tell(a?.state==='sleep' ? t('轻轻摸一下，让它继续睡。', 'A gentle touch. Let them sleep.') : t('这份喜欢，牛牛收到了。', 'A little love, received.'));
  };
  const stateName = (state?: State) => state==='sleep' ? t('正在睡觉','Sleeping') : state==='eat' ? t('慢慢吃草','Eating') : state==='seek' ? t('去吃一口','Getting a snack') : state==='walk' || state==='gather' ? t('散步中','Strolling') : t('歇一会儿','Resting');
  const activeAgent=agents.current.find((a)=>a.cow===active);
  const activeBehavior=activeAgent ? behavior[activeAgent.key] : undefined;
  const sleepers=Object.keys(behavior).filter((key)=>behavior[key].state==='sleep').length;

  return <div className={`pg-page ${rain ? 'is-raining' : ''} ${paused ? 'is-paused' : ''}`} style={scene} lang={lang === 'zh' ? 'zh-CN' : 'en'}>
    <header className="pg-header"><button onClick={onBack} className="pg-back"><ArrowLeft size={18} />{t('回到主页', 'Home')}</button><span className="pg-brand">Gemos<span> / </span>{t('牛牛牧场', 'Pasture')}</span><button className="pg-icon" onClick={onToggleLang} aria-label={t('切换语言', 'Change language')}>{lang === 'zh' ? 'EN' : '中'}</button></header>
    <main className="pg-main">
      <div className="pg-intro"><p className="pg-eyebrow">A LITTLE WORLD, JUST FOR YOU</p><h1>{t('在这里，慢一点。', 'A little less hurry.')}</h1><p>{t('喂喂牛，种朵花。把时间留给无所事事。', 'Feed a friend. Plant a flower. Let the world wait.')}</p></div>
      <div className="pg-world" aria-label={t('互动草岛', 'Interactive meadow')}>
        <div className="pg-atmosphere" aria-hidden="true"><span className="pg-orb" />{Array.from({length: 18}, (_, i) => <i key={i} style={{left: `${(i * 37 + 9) % 94}%`, top: `${(i * 23 + 5) % 53}%`, animationDelay: `${i % 4}s`}} />)}</div>
        <div className="pg-cloud pg-cloud-one" aria-hidden="true" /><div className="pg-cloud pg-cloud-two" aria-hidden="true" />
        <div className="pg-island-shadow" aria-hidden="true" />
        <div className="pg-lawn" ref={lawn} tabIndex={0} role="group" aria-label={tool === 'feed' ? t('草地：点击投喂，键盘回车在中央投喂', 'Meadow: click to feed, or press Enter to feed in the center') : t('草地：点击种花，键盘回车在中央种花', 'Meadow: click to plant, or press Enter to plant in the center')} onKeyDown={(e) => {if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {e.preventDefault(); drop({x: 50, y: 64});}}} onClick={(e) => {if ((e.target as HTMLElement).closest('button')) return; const rect = e.currentTarget.getBoundingClientRect(); drop({x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100});}}>
          <div className="pg-ground" aria-hidden="true"><div className="pg-pond"><i /><i /></div>{Array.from({length: 42}, (_, i) => <i className="pg-grass-mark" key={i} style={{left: `${(i * 37 + 7) % 90 + 5}%`, top: `${(i * 29 + 3) % 78 + 10}%`, transform: `rotate(${i % 3 * 20}deg)`}} />)}</div>
          <div className="pg-tree pg-tree-one"><Tree /></div><div className="pg-tree pg-tree-two"><Tree variant={1} /></div><div className="pg-stone pg-stone-one" /><div className="pg-stone pg-stone-two" />
          {[{id: -1, x: 26, y: 71}, {id: -2, x: 78, y: 61}, {id: -3, x: 69, y: 31}, ...flowers].map((f) => <span className="pg-flower" key={f.id} style={{left: `${f.x}%`, top: `${f.y}%`, zIndex: Math.round(f.y - 1)}}><Blossom variant={Math.abs(f.id) % 3} /></span>)}
          {food.map((s) => <span key={s.id} className="pg-seed" style={{left: `${s.x}%`, top: `${s.y}%`, zIndex: Math.round(s.y - 1)}} aria-hidden="true"><Leaf size={22} /><i /></span>)}
          {inhabitants.map((cow, i) => <button key={cow.id || `cow-${i}`} ref={(el) => {elements.current[cow.id || `cow-${i}`] = el;}} className="pg-cow" onClick={(e) => {e.stopPropagation(); pet(cow); setActive(cow);}} aria-label={t(`认识${cow.name || '牛牛'}`, `Meet ${cow.name || 'a cow'}`)}><span className="pg-cow-sleep" aria-hidden="true">z<span>z</span></span><span className="pg-cow-heart"><Heart size={18} fill="currentColor" /></span><span className="pg-cow-shadow" /><span className="pg-cow-art"><Cow data={cow} /></span><span className="pg-cow-name">{cow.name || t('小牛牛', 'Little cow')} · {stateName(behavior[cow.id || `cow-${i}`]?.state)}</span></button>)}
        </div>
        {rain && <div className="pg-rain" aria-hidden="true">{Array.from({length: 32}, (_, i) => <i key={i} style={{left: `${i * 3.2}%`, animationDelay: `${i % 7 * .16}s`}} />)}</div>}
        <div className="pg-world-caption"><span className="pg-status-dot" />{loading ? t('正在迎接牛牛…', 'Welcoming the herd…') : rain ? t('一场刚刚好的小雨', 'A soft little shower') : t('风很轻，草地很软', 'A soft breeze. A softer landing.')}</div>
      </div>
      <aside className="pg-time-card"><div><span>{t('此刻的小岛', 'Your island, right now')}</span><strong>{phaseLabel}{rain ? t(' · 小雨', ' · Rain') : ''}</strong></div><div className="pg-time-slider"><Sun size={17} /><input type="range" min="0" max="100" step="1" value={time} onChange={(e) => {setTime(Number(e.target.value)); setAutoTime(false);}} aria-label={t('拨动昼夜', 'Change time of day')} aria-valuetext={phaseLabel} /><Moon size={16} /></div><div className="pg-time-bottom"><button onClick={() => setAutoTime(!autoTime)} aria-pressed={autoTime}>{autoTime ? <Pause size={13} /> : <Play size={13} />}{t('昼夜流转', 'Day cycle')}</button><button className="pg-pause" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? t('继续时间', 'Resume') : t('暂停一下', 'Pause')}</button></div></aside>
      <aside className="pg-resident-card"><button onClick={() => setResidents(true)}><span className="pg-resident-icon"><Users size={18} /></span><span><strong>{inhabitants.length} {t('位小岛住客', 'island friends')}</strong><small>{t(`${sleepers} 只在做梦，其余各有心情`, `${sleepers} dreaming. Everyone has their own mood.`)}</small></span><ChevronRight size={17} /></button><div><span><Leaf size={14} />{feeds} {t('次投喂', 'feeds')}</span><span><Heart size={14} />{pets} {t('次贴贴', 'cuddles')}</span></div></aside>
      <div className="pg-bottom"><div className="pg-tool-dock" role="group" aria-label={t('牧场玩法', 'Meadow tools')}><button aria-pressed={tool === 'feed'} onClick={() => setTool('feed')}><Leaf size={21} /><span>{t('喂一口', 'Feed')}</span></button><button aria-pressed={tool === 'flower'} onClick={() => setTool('flower')}><Flower2 size={21} /><span>{t('种朵花', 'Plant')}</span></button><span className="pg-dock-divider" /><button aria-pressed={rain} onClick={() => setRain(!rain)}><CloudRain size={21} /><span>{t('下点雨', 'Rain')}</span></button><button onClick={call}><Bell size={21} /><span>{t('来集合', 'Gather')}</span></button></div><p className="pg-tool-hint">{tool === 'feed' ? t('饿了、离得近、又有空位，牛牛才会来。', 'Hungry, nearby, and a free spot. Then it’s snack time.') : t('点点草地，让喜欢的地方开花。', 'Tap the meadow. Leave a little bloom behind.')}</p>{flowers.length > 0 && <button className="pg-clear" onClick={() => setFlowers([])}><RotateCcw size={12} />{t('清理本次种花', 'Clear your flowers')}</button>}</div>
      {failed && <div className="pg-fetch-error" role="alert">{t('住客暂未加载，先和小岛伙伴玩一会儿。', 'Residents could not load. The island hosts are here.')}<button onClick={() => setRetry((v) => v + 1)}>{t('重试', 'Retry')}</button></div>}
    </main>
    <div className={`pg-toast ${notice ? 'is-visible' : ''}`} role="status"><Check size={15} />{notice}</div>
    {active && <Sheet title={active.name || t('小岛住客', 'Island friend')} close={() => setActive(null)}><div className="pg-profile-art" data-state={activeBehavior?.state} key={pets}><Cow data={active} /><span className="pg-profile-heart"><Heart size={24} fill="currentColor" /></span></div><p className="pg-behavior-status" role="status">{stateName(activeBehavior?.state)} · {activeBehavior?.hungry ? t('有点饿了','A little hungry') : t('肚子还饱着','Feeling full')}</p><p className="pg-message">{active.message || t('没什么大事，只是想和你一起晒晒太阳。', 'Nothing much. Just a little sunshine with you.')}</p><button className="pg-pet-button" onClick={() => pet(active)}><Heart size={18} />{t('再摸摸它', 'One more cuddle')}</button><small className="pg-session-note">{t('投喂、种花与贴贴，留在这一次相遇里。', 'Feeds, flowers and cuddles stay in this visit.')}</small></Sheet>}
    {residents && <Sheet title={t('小岛住客', 'Island friends')} close={() => setResidents(false)}><div className="pg-residents">{inhabitants.map((cow, i) => <button key={cow.id || i} onClick={() => {setResidents(false); setActive(cow);}}><Cow data={cow} /><span>{cow.name || t('小牛牛', 'Little cow')}</span><ChevronRight size={18} /></button>)}</div>{!cows.length && <p className="pg-session-note">{t('这几位是小岛的常驻伙伴。', 'These are the island’s resident hosts.')}</p>}</Sheet>}
  </div>;
}
