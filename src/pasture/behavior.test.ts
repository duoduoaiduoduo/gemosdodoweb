import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arrange, clearance, createHerd, gather, stepHerd, type Field, type Agent, type Seed} from './behavior.ts';
const field: Field={width:850,height:310,cowSize:76};
const cows=(n:number)=>Array.from({length:n},(_,i)=>({id:`cow-${i}`,name:`Cow ${i}`}));
function prepared(n:number,f:Field) {
 const herd=createHerd(cows(n)); arrange(herd,f);
 for(let k=0;k<10 && herd.some((a,i)=>herd.slice(i+1).some(b=>clearance(a,b,f)<1.08));k++){f.cowSize*=.9;arrange(herd,f);}
 return herd;
}
const foodAt=(a:Agent,id=1):Seed=>({id,x:a.x+2,y:a.y,born:0,bites:3});
test('sleep, fullness and distance independently prevent chasing food',()=>{
 for(const reason of ['sleep','full','far']) {
  const herd=createHerd(cows(1)), a=herd[0]; a.x=20;a.y=53;a.target={x:a.x,y:a.y};a.state=reason==='sleep'?'sleep':'rest';a.timer=reason==='sleep'?20:6;a.hunger=reason==='full'?0:1;
  const seed=foodAt(a); if(reason==='far')seed.x=88;
  for(let i=0;i<40;i++)stepHerd(herd,[seed],field,.05,i*.05,0);
  assert.equal(a.foodId,undefined,reason);assert.equal(seed.bites,3,reason);assert.equal(a.x,20,reason);
 }
});
test('a hungry nearby cow eats then rests with a reduced appetite',()=>{
 const herd=createHerd(cows(1)),a=herd[0];a.x=50;a.y=53;a.state='rest';a.timer=0;a.hunger=.9;const seed=foodAt(a);
 for(let i=0;i<150;i++)stepHerd(herd,[seed],field,.05,i*.05,0);
 assert.equal(seed.bites,2);assert.equal(a.state,'rest');assert.ok(a.hunger<.5);assert.equal(a.foodId,undefined);
});
test('gather respects sleep and assigns separated destinations',()=>{
 const f={...field},herd=prepared(7,f);herd[2].state='sleep';const sleeping={x:herd[2].x,y:herd[2].y};gather(herd,f);
 assert.equal(herd[2].state,'sleep');assert.deepEqual({x:herd[2].x,y:herd[2].y},sleeping);
 const coming=herd.filter(a=>a.state==='gather');for(let i=0;i<coming.length;i++)for(let j=i+1;j<coming.length;j++)assert.ok(clearance(coming[i].target,coming[j].target,f)>=1);
});
test('crowded herds keep spacing and unique food claims throughout two minutes',()=>{
 for(const setup of [{width:900,height:320,cowSize:88,n:24},{width:340,height:190,cowSize:55,n:16}]) {
  const f={...setup},herd=prepared(setup.n,f);const seeds=Array.from({length:12},(_,i)=>({id:i,x:48+i%3,y:52+i%2,born:0,bites:3}));
  let rests=0,sleeps=0,moves=0;
  for(let frame=0;frame<2400;frame++){
   stepHerd(herd,seeds,f,.05,frame*.05,frame>1000?1:0);
   const claims=herd.map(a=>a.foodId).filter(id=>id!==undefined);assert.equal(new Set(claims).size,claims.length);
   for(let i=0;i<herd.length;i++) {
    const a=herd[i];rests+=Number(a.state==='rest');sleeps+=Number(a.state==='sleep');moves+=Number(a.moving);
    assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));
    for(let j=i+1;j<herd.length;j++)assert.ok(clearance(a,herd[j],f)>=.999,`overlap at ${setup.width}px, frame ${frame}`);
   }
  }
  assert.ok(rests>0&&sleeps>0&&moves>0);
 }
});
test('walks are bounded by real rests and nighttime can bring sleep',()=>{
 const herd=createHerd(cows(1)),a=herd[0];a.state='rest';a.timer=0;a.energy=.8;a.hunger=0;
 let streak=0,longest=0,sawRest=false,sawSleep=false;
 for(let i=0;i<4000;i++){
  stepHerd(herd,[],field,.05,i*.05,1);
  streak=a.moving?streak+.05:0;longest=Math.max(longest,streak);sawRest ||= a.state==='rest';sawSleep ||= (a as Agent).state==='sleep';
 }
 assert.ok(longest<7.2);assert.ok(sawRest&&sawSleep);
});
