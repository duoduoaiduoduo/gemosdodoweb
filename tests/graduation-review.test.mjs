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
