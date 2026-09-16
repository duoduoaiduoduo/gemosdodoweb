import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {createTransfer,RETENTION_MS} from '../server/transfer.js';
test('private cross-device transfer, expiry boundary, persistence, quota and isolated cleanup',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'gemos-transfer-')),root=path.join(base,'transfer');fs.mkdirSync(path.join(base,'uploads'));fs.writeFileSync(path.join(base,'uploads','permanent'),'keep');let clock=Date.now();const secret='test-only-password';let service=createTransfer({root,secret,now:()=>clock,checkDisk:false});const app=express();app.use('/api/transfer',(req,res,next)=>service.router(req,res,next));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/transfer`;let cookie='';
 const request=(p,o={})=>fetch(url+p,{...o,headers:{Cookie:cookie,...o.headers}});
 const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const login=async()=>{const r=await request('/session',json('POST',{secret}));assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/; Secure/);cookie=r.headers.get('set-cookie').split(';')[0];};
 try {
  assert.equal((await request('/files')).status,401);
  assert.equal((await request('/session',json('POST',{secret:'wrong'}))).status,401);await login();
  assert.equal((await request('/files',{...json('POST',{name:'x',size:0}),headers:{'Content-Type':'application/json',Origin:'https://evil.example'}})).status,403);
  const bytes=Buffer.from([0,255,9,0,80]);let r=await request('/files',json('POST',{name:'任意文件.html',size:bytes.length}));assert.equal(r.status,201);const {id}=await r.json();
  assert.equal((await request(`/files/${id}/complete`,{method:'POST'})).status,409);
  assert.equal((await request(`/files/${id}/chunks/1`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes})).status,409);
  r=await request(`/files/${id}/chunks/0`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes});assert.equal(r.status,200);
  clock+=60000;r=await request(`/files/${id}/complete`,{method:'POST'});const {file}=await r.json();assert.equal(file.expiresAt-file.createdAt,RETENTION_MS);assert.equal(file.createdAt,clock);
  service.close();service=createTransfer({root,secret,now:()=>clock,checkDisk:false});await login();
  r=await request('/files');assert.equal((await r.json()).files.length,1);
  r=await request(`/files/${id}/download`);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/^attachment;/);assert.equal(r.headers.get('content-type'),'application/octet-stream');assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);
  r=await request(`/files/${id}/download`,{headers:{Range:'bytes=1-2'}});assert.equal(r.status,206);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(1,3));
  const empty=await(await request('/files',json('POST',{name:'empty',size:0}))).json();assert.equal((await request(`/files/${empty.id}/complete`,{method:'POST'})).status,200);
  const pending=await(await request('/files',json('POST',{name:'pending',size:1024**3}))).json();assert.ok(pending.id);assert.equal((await request('/files',json('POST',{name:'too-much',size:1024**3}))).status,507);
  clock=file.expiresAt-1;await login();assert.equal((await request(`/files/${id}/download`)).status,200);
  clock=file.expiresAt;assert.equal((await request(`/files/${id}/download`)).status,410);service.cleanup();assert.equal(fs.existsSync(path.join(root,id)),false);assert.equal(fs.existsSync(path.join(root,pending.id)),false);assert.equal(fs.readFileSync(path.join(base,'uploads/permanent'),'utf8'),'keep');assert.equal((await(await request('/files')).json()).files.length,0);
  await request('/session',{method:'DELETE'});cookie='';assert.equal((await request('/files')).status,401);
 } finally{service.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(base,{recursive:true,force:true});}
});
