import type {CowData} from './Cow';
export type Point = {x: number; y: number};
export type State = 'rest' | 'walk' | 'seek' | 'eat' | 'sleep' | 'gather';
export type Agent = Point & {key: string; cow: CowData; target: Point; facing: number; phase: number; heart: number; state: State; timer: number; hunger: number; energy: number; foodId?: number; blocked: number; moving: boolean; rng: number; appetite: number};
export type Seed = Point & {id: number; born: number; bites: number};
export type Field = {width: number; height: number; cowSize: number};
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function fieldPoint(x: number, y: number): Point {
  const dx = (x - 50) / 40, dy = (y - 53) / 33, d = Math.max(1, Math.hypot(dx, dy));
  return {x: 50 + dx / d * 40, y: 53 + dy / d * 33};
}
function random(a: Agent) {a.rng = (Math.imul(a.rng, 1664525) + 1013904223) >>> 0; return a.rng / 4294967296;}
export function distance(a: Point, b: Point, f: Field) {return Math.hypot((a.x - b.x) * f.width / 100, (a.y - b.y) * f.height / 100);}
// A footprint in screen pixels: sharing a normalized target must not shrink personal space on a phone.
export function clearance(a: Point, b: Point, f: Field) {
  const depth = .76 + (a.y + b.y) / 320;
  return Math.hypot((a.x - b.x) * f.width / 100 / (f.cowSize * .94 * depth), (a.y - b.y) * f.height / 100 / (f.cowSize * .60 * depth));
}
function candidates(): Point[] {
  const points: Point[] = [];
  for (let y = 23; y <= 83; y += 4) for (let x = 12; x <= 88; x += 4) {
    if (Math.hypot((x - 50) / 40, (y - 53) / 33) < .91) points.push({x,y});
  }
  return points;
}
const spots = candidates();
export function arrange(herd: Agent[], f: Field) {
  const placed: Agent[] = [];
  for (const a of herd) {
    // Best available point, instead of repeatedly pushing live cows away from each other.
    let best = spots[0], score = -Infinity;
    for (const p of spots) {
      const gap = placed.length ? Math.min(...placed.map((b) => clearance(p,b,f))) : 2;
      const value = Math.min(gap, 2) - distance(a,p,f) / Math.max(f.width,f.height) * .18;
      if (value > score) {score = value; best = p;}
    }
    Object.assign(a,best); a.target = {...best}; a.moving = false; a.foodId = undefined;
    if (a.state !== 'sleep') {a.state = 'rest'; a.timer = 3 + random(a) * 9;}
    placed.push(a);
  }
}
export function createHerd(cows: CowData[], previous: Agent[] = []): Agent[] {
  return cows.map((cow,i) => {
    const key = cow.id || `cow-${i}`, old = previous.find((a) => a.key === key);
    if (old) return {...old,cow};
    let seed = 2166136261; for (const ch of key) seed = Math.imul(seed ^ ch.charCodeAt(0),16777619);
    const a: Agent = {key,cow,x:25+i*9%50,y:37+i*13%37,target:{x:50,y:53},facing:1,phase:i,heart:0,state:i%5===2?'sleep':'rest',timer:0,hunger:0,energy:0,foodId:undefined,blocked:0,moving:false,rng:seed>>>0,appetite:0};
    a.hunger = .15 + random(a) * .65; a.energy = .4 + random(a) * .55; a.appetite = .42 + random(a)*.2;
    a.timer = a.state === 'sleep' ? 18 + random(a)*18 : 4 + random(a)*10;
    return a;
  });
}
function rest(a: Agent, duration?: number) {a.state = 'rest'; a.timer = duration ?? 7 + random(a)*10; a.target={x:a.x,y:a.y}; a.foodId=undefined; a.blocked=0; a.moving=false;}
function available(p: Point, a: Agent, herd: Agent[], f: Field, goals = false) {
  return herd.every((b) => b === a || (clearance(p,b,f) >= 1.06 && (!goals || !['seek','gather','walk'].includes(b.state) || clearance(p,b.target,f) >= 1.06)));
}
function destination(a: Agent, herd: Agent[], f: Field, center?: Point) {
  const origin = center || a;
  const choices = spots.filter((p) => distance(p,origin,f) < (center ? f.width : Math.min(150,f.width*.32)) && available(p,a,herd,f,true));
  if (!choices.length) return undefined;
  if (center) return choices.sort((p,q) => distance(p,center,f)-distance(q,center,f))[0];
  return choices[Math.floor(random(a)*choices.length)];
}
export function gather(herd: Agent[], f: Field) {
  let count = 0;
  for (const a of herd) {
    if (a.state === 'sleep' || a.state === 'eat') continue;
    const goal = destination(a,herd,f,{x:50,y:64});
    if (!goal) continue;
    a.target={...goal}; a.state='gather'; a.timer=9; a.foodId=undefined; a.blocked=0; count++;
  }
  return count;
}
export function cuddle(a: Agent) {a.heart=3; if (a.state !== 'sleep') rest(a,5);}

export function stepHerd(herd: Agent[], seeds: Seed[], f: Field, dt: number, now: number, night: number) {
  let foodChanged=false;
  for (const a of herd) {
    a.moving=false; a.heart=Math.max(0,a.heart-dt); a.timer-=dt;
    a.hunger=clamp(a.hunger+dt*.003,0,1);
    if (a.state === 'sleep') {
      a.energy=clamp(a.energy+dt*.022,0,1);
      if (a.timer<=0 && a.energy>.75) rest(a,8+random(a)*8);
      continue; // Neither a snack nor the gather bell wakes a sleeping cow.
    }
    a.energy=clamp(a.energy-dt*(night>.55?.010:.003),0,1);
    if (a.state === 'rest') {
      if (a.timer<=0 && (a.energy<.3 || (night>.65 && random(a)<.7))) {
        a.state='sleep'; a.timer=20+random(a)*20; a.foodId=undefined; continue;
      }
      // Individual appetite and a finite attraction radius; reservations belong to one diner.
      if (a.hunger>=a.appetite && a.timer<8) {
        const reach=Math.min(190, f.width*.38);
        const nearby=seeds.filter((s)=>s.bites>0 && now-s.born<50 && distance(a,s,f)<=reach && !herd.some((b)=>b!==a && b.foodId===s.id)).sort((p,q)=>distance(a,p,f)-distance(a,q,f));
        for (const s of nearby) {
          const goal=fieldPoint(s.x,s.y);
          if (!available(goal,a,herd,f,true)) continue;
          a.state='seek'; a.target=goal; a.foodId=s.id; a.timer=10; a.blocked=0; break;
        }
      }
      if (a.state === 'rest' && a.timer<=0) {
        if (random(a)<.55) {rest(a); continue;}
        const goal=destination(a,herd,f);
        if (goal) {a.target={...goal}; a.state='walk'; a.timer=3+random(a)*4; a.blocked=0;} else rest(a);
      }
    }
    if (a.state === 'eat' || a.state === 'seek') {
      const s=seeds.find((seed)=>seed.id===a.foodId && seed.bites>0 && now-seed.born<50);
      if (!s) {rest(a); continue;}
      if (a.state === 'eat') {
        if (a.timer<=0) {s.bites--; foodChanged=true; a.hunger=Math.max(0,a.hunger-.48); a.heart=2; rest(a,12+random(a)*8);}
        continue;
      }
    }
    if (!['walk','seek','gather'].includes(a.state)) continue;
    const dist=distance(a,a.target,f);
    if (dist<3) {
      if (a.state==='seek') {a.state='eat'; a.timer=2.2;} else rest(a);
      continue;
    }
    if (a.timer<=0 || a.blocked>1.4) {rest(a,8+random(a)*8); continue;}
    const heading=Math.atan2((a.target.y-a.y)*f.height,(a.target.x-a.x)*f.width);
    const speed=(a.state==='seek'?38:22)*Math.min(1,f.width/600+.4);
    // Try a short detour; if none is clear, wait instead of shoving an idle or sleeping cow.
    const side=a.rng%2?1:-1;
    for (const turn of [0,.65*side,-.65*side,1.15*side,-1.15*side]) {
      const p=fieldPoint(a.x+Math.cos(heading+turn)*Math.min(dist,speed*dt)/f.width*100,a.y+Math.sin(heading+turn)*Math.min(dist,speed*dt)/f.height*100);
      if (distance(a,p,f)<.001 || !herd.every((b)=>b===a || clearance(p,b,f)>=1)) continue;
      a.facing=p.x>=a.x?1:-1; a.x=p.x; a.y=p.y; a.moving=true; a.blocked=0; a.phase+=dt*(a.state==='seek'?11:6.5); break;
    }
    if (!a.moving) a.blocked+=dt;
  }
  return foodChanged;
}
