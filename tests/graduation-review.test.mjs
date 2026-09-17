import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGraduationReview,REVIEW_REVISION} from '../server/graduation-review.js';

test('annotations persist independently, retries are idempotent, and undo is owner scoped',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grad-review-'));
  const file=path.join(dir,'notes.json');
  const app=express();app.use('/review',createGraduationReview(file));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${server.address().port}/review/${REVIEW_REVISION}`;
  const firstOwner='11111111-1111-1111-1111-111111111111',secondOwner='22222222-2222-2222-2222-222222222222';
  const request=(method,body,suffix='')=>fetch(url+suffix,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const a={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',page:0,type:'pen',points:[{x:100,y:110},{x:200,y:120}]};
  const b={id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',page:1,type:'text',x:50,y:200,text:'请补充必要性依据'};
  try{
    const responses=await Promise.all([request('POST',{ownerKey:firstOwner,annotation:a}),request('POST',{ownerKey:secondOwner,annotation:b})]);
    assert.deepEqual(responses.map(r=>r.status),[201,201]);
    assert.equal((await request('POST',{ownerKey:firstOwner,annotation:a})).status,200);
    let data=await (await fetch(url)).json();assert.equal(data.annotations.length,2);assert.ok(data.annotations.every(n=>!('ownerHash'in n)));
    assert.equal(JSON.parse(fs.readFileSync(file)).annotations.length,2);
    assert.equal((await request('DELETE',{ownerKey:secondOwner},'/'+a.id)).status,403);
    assert.equal((await request('POST',{ownerKey:secondOwner,annotation:a})).status,409);
    assert.equal((await request('POST',{ownerKey:firstOwner,annotation:{...a,id:'cccccccc-cccc-cccc-cccc-cccccccccccc',points:[{x:-1,y:1},{x:1,y:1}]}})).status,400);
    assert.equal((await (await fetch(url.replace(REVIEW_REVISION,'older-revision'))).json()).annotations.length,0);
    assert.equal((await request('DELETE',{ownerKey:firstOwner},'/'+a.id)).status,200);
    data=await(await fetch(url)).json();assert.equal(data.annotations.length,1);assert.equal(data.annotations[0].text,b.text);
    // Recreate the router to verify persisted state survives a server restart.
    const app2=express();app2.use('/review',createGraduationReview(file));const server2=app2.listen(0,'127.0.0.1');await new Promise(r=>server2.once('listening',r));
    try{const restored=await(await fetch(`http://127.0.0.1:${server2.address().port}/review/${REVIEW_REVISION}`)).json();assert.equal(restored.annotations[0].id,b.id);}finally{server2.close();}
  }finally{server.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('direct edits preserve old text and annotations, paginate, reject stale saves, and retry idempotently',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grad-edit-'));
  const file=path.join(dir,'notes.json');const app=express();app.use('/review',createGraduationReview(file));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/review`;
  const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    const seed=await(await fetch(base+'/document')).json();const oldText=seed.document.sections[0].paragraphs[0];
    const sections=structuredClone(seed.document.sections);sections[0].paragraphs[0]='导师修改后的研究问题。';sections[1].paragraphs.push('需要进一步分析受众的理解困难。'.repeat(160));
    const payload={baseRevision:REVIEW_REVISION,sections,ownerKey:'11111111-1111-1111-1111-111111111111',requestId:'22222222-2222-2222-2222-222222222222'};
    const response=await post('/document',payload);assert.equal(response.status,201);const saved=await response.json();assert.equal(saved.versions.length,2);assert.ok(saved.document.pages.length>6);assert.equal(saved.document.sections[0].paragraphs[0],sections[0].paragraphs[0]);
    const content=saved.document.pages.filter(p=>p.title.startsWith(sections[1].title)).flatMap(p=>p.paragraphs).join('');assert.equal(content,sections[1].paragraphs.join(''));
    const retry=await(await post('/document',payload)).json();assert.equal(retry.document.revision,saved.document.revision);assert.equal(retry.versions.length,2);
    assert.equal((await post('/document',{...payload,requestId:'33333333-3333-3333-3333-333333333333'})).status,409);
    const original=await(await fetch(base+'/document?revision='+REVIEW_REVISION)).json();assert.equal(original.document.sections[0].paragraphs[0],oldText);
    const ownerKey=payload.ownerKey;const note={id:'44444444-4444-4444-4444-444444444444',type:'text',page:saved.document.pages.length-1,x:100,y:200,text:'新版尾页意见'};
    assert.equal((await post('/'+saved.document.revision,{ownerKey,annotation:note})).status,201);
    assert.equal((await(await fetch(base+'/'+REVIEW_REVISION)).json()).annotations.length,0);
    assert.equal((await(await fetch(base+'/'+saved.document.revision)).json()).annotations.length,1);
    const latest=await(await fetch(base+'/document')).json();assert.equal(latest.document.revision,saved.document.revision);
  }finally{server.close();fs.rmSync(dir,{recursive:true,force:true});}
});
