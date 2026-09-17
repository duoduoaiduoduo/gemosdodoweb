import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const snapshot=JSON.parse(await readFile(new URL('../public/research/literature-trend.json',import.meta.url)));
const raw=JSON.parse(await readFile(new URL('../public/research/literature-trend-raw.json',import.meta.url)));
test('each plotted annual value reconciles to retained numerator and denominator API responses',()=>{
 assert.deepEqual(snapshot.rows.map(r=>r.year),Array.from({length:16},(_,i)=>2010+i));
 assert.equal(raw.length,32);
 for(const r of snapshot.rows){
  const numerator=raw.find(v=>v.year===r.year&&v.kind==='mentions');
  const denominator=raw.find(v=>v.year===r.year&&v.kind==='all');
  assert.equal(r.mentions,numerator.response.hitCount);assert.equal(r.total,denominator.response.hitCount);
  assert.equal(r.query,numerator.response.request.queryString);
  assert.equal(denominator.query,`SRC:MED AND PUB_YEAR:${r.year}`);
  assert.ok(r.total>0&&r.mentions>=0&&r.mentions<=r.total);
  assert.ok(Math.abs(r.per10000-r.mentions/r.total*10000)<1e-10);
  assert.equal(new URL(r.apiUrl).searchParams.get('query'),r.query);
  for(const term of snapshot.terms)assert.ok(r.query.includes(`TITLE_ABS:"${term}"`));
 }
});
