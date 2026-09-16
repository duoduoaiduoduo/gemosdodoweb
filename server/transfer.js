import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const RETENTION_MS=5*24*60*60*1000;
export const CHUNK_SIZE=8*1024*1024;
const MAX_FILE=1024**3,QUOTA=2*1024**3,RESERVE=1024**3;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function createTransfer({root,secret,now=Date.now,intervalMs=60000,checkDisk=true,secureCookies=true}){
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const router=express.Router(),attempts=new Map();
 const dir=id=>{if(!ID.test(id))throw Object.assign(Error('文件不存在'),{status:404});return path.join(root,id);};
 const read=id=>{try{return JSON.parse(fs.readFileSync(path.join(dir(id),'meta.json'),'utf8'));}catch{throw Object.assign(Error('文件不存在或已到期'),{status:404});}};
 const save=m=>{const d=dir(m.id);fs.writeFileSync(path.join(d,'meta.tmp'),JSON.stringify(m),{mode:0o600});fs.renameSync(path.join(d,'meta.tmp'),path.join(d,'meta.json'));};
 const scan=()=>fs.readdirSync(root).filter(id=>ID.test(id)).flatMap(id=>{try{return[read(id)];}catch{return[];}});
 const cleanup=()=>{for(const m of scan()){if((m.status==='ready'&&m.expiresAt<=now())||(m.status==='uploading'&&m.touchedAt+24*60*60*1000<=now()))fs.rmSync(dir(m.id),{recursive:true,force:true});}};
 const timer=setInterval(()=>{try{cleanup();}catch(e){console.error('[transfer cleanup]',e.message);}},intervalMs);timer.unref();cleanup();
 const sign=value=>crypto.createHmac('sha256',secret||'disabled').update(value).digest('hex');
 const equal=(a,b)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);};
 const cookie=(req,res,value,age)=>res.setHeader('Set-Cookie',`gemos_transfer=${value}; Path=/api/transfer; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookies?'; Secure':''}`);
 router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');if(!['GET','HEAD'].includes(req.method)&&req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'请从本站操作'});}catch{return res.status(403).json({error:'无效来源'});}}next();});
 router.post('/session',express.json({limit:'2kb'}),(req,res)=>{
  if(!secret)return res.status(503).json({error:'尚未配置后台口令'});
  const key=req.ip,t=now();for(const [k,v]of attempts)if(v.until<=t)attempts.delete(k);
  const record=attempts.get(key)||{count:0,until:t+15*60000};
  if(record.count>=10)return res.status(429).json({error:'尝试次数过多，请 15 分钟后再试'});
  if(!equal(String(req.body?.secret||''),secret)){record.count++;if(attempts.size<10000)attempts.set(key,record);return res.status(401).json({error:'口令不正确'});}
  attempts.delete(key);const value=`${t+24*60*60*1000}.${crypto.randomBytes(16).toString('hex')}`;cookie(req,res,`${value}.${sign(value)}`,86400);res.json({success:true});
 });
 router.delete('/session',(req,res)=>{cookie(req,res,'',0);res.json({success:true});});
 router.use((req,res,next)=>{const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('gemos_transfer='))?.slice(15)||'';const [until,nonce,sig]=token.split('.');if(!secret||!until||!nonce||!sig||Number(until)<=now()||!equal(sign(`${until}.${nonce}`),sig))return res.status(401).json({error:'请先登录中转站'});next();});
 router.get('/files',(req,res)=>{cleanup();const files=scan();res.json({files:files.filter(m=>m.status==='ready').sort((a,b)=>b.createdAt-a.createdAt),used:files.reduce((n,m)=>n+m.size,0),quota:QUOTA,maxFile:MAX_FILE,chunkSize:CHUNK_SIZE,serverTime:now()});});
 router.post('/files',express.json({limit:'2kb'}),(req,res,next)=>{try{
  cleanup();const size=req.body?.size;const name=String(req.body?.name||'').replace(/[\\/]/g,'_').replace(/[\x00-\x1f\x7f]/g,'').slice(0,180).trim();
  if(!name||!Number.isSafeInteger(size)||size<0||size>MAX_FILE)return res.status(400).json({error:'文件信息无效，单文件最多 1 GB'});
  const used=scan().reduce((n,m)=>n+m.size,0);if(used+size>QUOTA)return res.status(507).json({error:'中转站容量不足，请等待文件到期后再上传'});
  if(checkDisk){const s=fs.statfsSync(root);if(s.bavail*s.bsize<size+RESERVE)return res.status(507).json({error:'服务器剩余空间不足，请稍后再试'});}
  const id=crypto.randomUUID(),t=now(),m={id,name,size,received:0,chunks:0,status:'uploading',touchedAt:t};fs.mkdirSync(dir(id),{mode:0o700});fs.writeFileSync(path.join(dir(id),'payload'),'');save(m);res.status(201).json({id,chunkSize:CHUNK_SIZE});
 }catch(e){next(e);}});
 router.post('/files/:id/chunks/:index',express.raw({type:'application/octet-stream',limit:CHUNK_SIZE}),(req,res,next)=>{try{
  const m=read(req.params.id);if(m.status!=='uploading'||Number(req.params.index)!==m.chunks)return res.status(409).json({error:'上传顺序已失效，请重新上传'});
  if(!Buffer.isBuffer(req.body)||!req.body.length||m.received+req.body.length>m.size)return res.status(400).json({error:'文件分块大小无效'});
  const p=path.join(dir(m.id),'payload');fs.truncateSync(p,m.received);fs.appendFileSync(p,req.body);m.received+=req.body.length;m.chunks++;m.touchedAt=now();save(m);res.json({received:m.received});
 }catch(e){next(e);}});
 router.post('/files/:id/complete',(req,res,next)=>{try{const m=read(req.params.id);if(m.status!=='uploading'||m.received!==m.size||fs.statSync(path.join(dir(m.id),'payload')).size!==m.size)return res.status(409).json({error:'文件尚未上传完整'});m.status='ready';m.createdAt=now();m.expiresAt=m.createdAt+RETENTION_MS;save(m);res.json({file:m});}catch(e){next(e);}});
 // Cancel only unfinished uploads. Completed files follow their five-day lifetime.
 router.delete('/files/:id/pending',(req,res,next)=>{try{const m=read(req.params.id);if(m.status!=='uploading')return res.status(409).json({error:'已完成的文件不能作为未完成上传清理'});fs.rmSync(dir(m.id),{recursive:true,force:true});res.json({success:true});}catch(e){next(e);}});
 router.get('/files/:id/download',(req,res,next)=>{try{const m=read(req.params.id);if(m.status!=='ready'||m.expiresAt<=now())return res.status(410).json({error:'文件已到期或不可下载'});res.setHeader('Content-Type','application/octet-stream');res.download('payload',m.name,{root:dir(m.id),dotfiles:'deny'},e=>{if(e&&!res.headersSent)next(e);});}catch(e){next(e);}});
 router.use((err,req,res,next)=>{if(res.headersSent)return next(err);console.error('[transfer]',err.message);res.status(err.status||500).json({error:err.status===413?'单个分块过大，请重新选择文件':err.status===404?err.message:'暂时无法完成操作，请重试'});});
 return {router,cleanup,close:()=>clearInterval(timer)};
}
