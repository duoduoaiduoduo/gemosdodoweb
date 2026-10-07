import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createGraduationReview,REVIEW_REVISION} from '../server/graduation-review.js';
import {graduationPublication} from '../server/graduation-publication.js';

const OWNER='11111111-1111-1111-1111-111111111111';
const PUBLICATION_REVISION='publication-2026-10-06-test';
const DOWNLOADS=[
  ['Word 可编辑版','/graduation/report-review.docx'],
  ['PDF 阅读版','/graduation/report-review.pdf'],
];
const OLD_SECTIONS=Array.from({length:6},(_,index)=>({
  title:`旧稿第 ${index+1} 部分`,paragraphs:[`旧稿正文 ${index+1}。`],pending:'待导师讨论',
  links:[[ `旧参考 ${index+1}`,`https://example.org/old/${index+1}` ]],
}));
// Deliberately unlike current pagination: existing annotation coordinates belong
// to these stored pages and publication must never regenerate their layout.
const OLD_PAGES=[
  {title:'旧版固定首页',paragraphs:['旧版第一段。','旧版第二段。'],pending:'原版页脚',links:[]},
  {title:'旧版固定尾页',paragraphs:['旧版第六部分。'],pending:'',links:OLD_SECTIONS[5].links},
];
const OLD_NOTE={
  id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',page:1,type:'text',x:100,y:220,
  text:'旧稿尾页批注，必须留在原来的页面。',revision:REVIEW_REVISION,
  createdAt:'2026-09-18T00:00:00.000Z',
  ownerHash:crypto.createHash('sha256').update(OWNER).digest('hex'),
};

function fixture(){
  return {
    documents:[{
      revision:REVIEW_REVISION,label:'讨论稿 v1',createdAt:'2026-09-17T00:00:00.000Z',
      sections:structuredClone(OLD_SECTIONS),pages:structuredClone(OLD_PAGES),
    }],
    annotations:[structuredClone(OLD_NOTE)],
  };
}

function publication(overrides={}){
  const sections=Array.from({length:6},(_,index)=>({
    title:`审阅稿第 ${index+1} 部分`,paragraphs:[`完整审阅稿正文 ${index+1}。`],pending:'',links:[],
  }));
  sections[2].images=[{src:'/graduation/concept-01.png',alt:'照片驱动的交互流程草图',caption:'图 1：照片、空间探索与科普卡。'}];
  sections[3].tables=[{caption:'表 1：研究计划',rows:[['阶段','任务'],['开题前','访谈与草图']],widths:[0.3,0.7]}];
  sections[5].sourceList=true;
  sections[5].links=Array.from({length:17},(_,index)=>[`参考文献 ${index+1}`,`https://example.org/reference/${index+1}`]);
  return {
    revision:PUBLICATION_REVISION,label:'导师审阅稿 2026-10-06',createdAt:'2026-10-06T10:00:00.000Z',
    baseRevision:REVIEW_REVISION,title:'面向新污染物科普的照片驱动空间交互设计研究',
    downloads:structuredClone(DOWNLOADS),sections,...overrides,
  };
}

async function harness(t,{data=fixture(),report=publication(),existingBackup=false}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grad-publication-'));
  const file=path.join(dir,'notes.json');
  if(data!==null)fs.writeFileSync(file,JSON.stringify(data));
  if(existingBackup)fs.writeFileSync(`${file}.before-${report.revision}`,'previous successful backup');
  const servers=[];
  async function start(published=report){
    const app=express();app.use('/review',createGraduationReview(file,{publication:published}));
    const server=app.listen(0,'127.0.0.1');servers.push(server);
    await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    return `http://127.0.0.1:${server.address().port}/review`;
  }
  t.after(async()=>{
    await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const base=await start();
  const get=async(route='/document',url=base)=>{
    const response=await fetch(url+route);assert.equal(response.status,200);return response.json();
  };
  const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {file,base,start,get,post,read:()=>JSON.parse(fs.readFileSync(file,'utf8'))};
}

test('controlled publication adds one immutable revision and is idempotent across restarts',async t=>{
  const original=fixture();const h=await harness(t,{data:original});
  const result=await h.get();
  assert.equal(result.document.revision,PUBLICATION_REVISION);
  assert.equal(result.latestRevision,PUBLICATION_REVISION);
  assert.equal(result.versions.length,2);
  assert.equal(result.document.title,publication().title);
  assert.deepEqual(result.document.downloads,DOWNLOADS);
  const persisted=h.read();
  assert.equal(JSON.stringify(persisted.documents[0]),JSON.stringify(original.documents[0]));
  assert.equal(JSON.stringify(persisted.annotations),JSON.stringify(original.annotations));
  const bytes=fs.readFileSync(h.file,'utf8');
  const restarted=await h.start();
  const restored=await h.get('/document',restarted);
  assert.equal(restored.document.revision,PUBLICATION_REVISION);
  assert.equal(restored.versions.length,2);
  assert.equal(fs.readFileSync(h.file,'utf8'),bytes);
  const old=await h.get('/document?revision='+REVIEW_REVISION);
  assert.deepEqual(old.document.pages,OLD_PAGES);
  assert.deepEqual(old.document.sections,OLD_SECTIONS);
});

test('publication base conflict preserves a newer saved document and the complete stored state',async t=>{
  const data=fixture();
  const competing={...structuredClone(data.documents[0]),revision:'newer-editor-revision-2026',label:'另一编辑者已保存',title:'导师刚修改的标题'};
  data.documents.push(competing);
  const bytes=JSON.stringify(data);
  const h=await harness(t,{data});
  const result=await h.get();
  assert.equal(result.document.revision,competing.revision);
  assert.equal(result.versions.length,2);
  assert.equal(fs.readFileSync(h.file,'utf8'),bytes);
  assert.ok(h.read().documents.every(document=>document.revision!==PUBLICATION_REVISION));
});

test('publication paginates controlled images, tables and long source lists without losing content',async t=>{
  const h=await harness(t);const {document}=await h.get();const report=publication();
  const imagePages=document.pages.filter(page=>page.images?.length);
  const tablePages=document.pages.filter(page=>page.tables?.length);
  const sourcePages=document.pages.filter(page=>page.sourceList);
  assert.ok(imagePages.length>0);assert.ok(tablePages.length>0);assert.ok(sourcePages.length>=3);
  assert.deepEqual(imagePages.flatMap(page=>page.images),report.sections[2].images);
  assert.deepEqual(tablePages.flatMap(page=>page.tables),report.sections[3].tables);
  assert.ok(imagePages.every(page=>!page.paragraphs?.length&&!page.tables?.length));
  assert.ok(tablePages.every(page=>!page.paragraphs?.length&&!page.images?.length));
  assert.ok(sourcePages.every(page=>page.links.length>0&&page.links.length<=8&&!page.paragraphs?.length));
  assert.deepEqual(sourcePages.flatMap(page=>page.links),report.sections[5].links);
  assert.equal(document.pages.flatMap(page=>page.paragraphs||[]).join(''),report.sections.flatMap(section=>section.paragraphs).join(''));
});

test('text edits inherit controlled media, references, title and downloads while ignoring injected attachment fields',async t=>{
  const h=await harness(t);const published=(await h.get()).document;
  const sections=structuredClone(published.sections);
  sections[0].title='导师修改后的第一部分';sections[0].paragraphs=['导师修改后的研究问题。'];sections[0].pending='请核对受众界定';
  for(const section of sections){
    section.images=[{src:'javascript:alert(1)',alt:'替换图片',caption:'恶意附件'}];
    section.tables=[{caption:'替换表格',rows:[['恶意表格']],widths:[1]}];
    section.links=[['替换引用','javascript:alert(1)']];
    section.sourceList=false;
  }
  const payload={baseRevision:PUBLICATION_REVISION,ownerKey:OWNER,requestId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    sections,title:'恶意覆盖标题',downloads:[['恶意下载','javascript:alert(1)']]};
  const response=await h.post('/document',payload);assert.equal(response.status,201);
  const saved=await response.json();
  assert.equal(saved.document.sections[0].title,sections[0].title);
  assert.deepEqual(saved.document.sections[0].paragraphs,sections[0].paragraphs);
  assert.equal(saved.document.sections[0].pending,sections[0].pending);
  assert.equal(saved.document.title,published.title);
  assert.deepEqual(saved.document.downloads,published.downloads);
  saved.document.sections.forEach((section,index)=>{
    for(const key of ['images','tables','links'])assert.deepEqual(section[key]||[],published.sections[index][key]||[],`section ${index} ${key} is inherited`);
    assert.equal(Boolean(section.sourceList),Boolean(published.sections[index].sourceList),`section ${index} source-list layout is inherited`);
  });
  assert.ok(!JSON.stringify(saved.document).includes('javascript:'));
  assert.deepEqual((await h.get('/document?revision='+PUBLICATION_REVISION)).document,published);
  const retry=await h.post('/document',payload);assert.equal(retry.status,200);
  assert.equal((await retry.json()).document.revision,saved.document.revision);
  const restarted=await h.start();
  assert.equal((await h.get('/document',restarted)).document.revision,saved.document.revision);
  assert.equal(h.read().documents.length,3);
});

test('old and published revision annotations remain isolated and keep old page geometry',async t=>{
  const h=await harness(t);const published=(await h.get()).document;
  const oldBefore=JSON.stringify(h.read().annotations);
  assert.equal((await h.get('/'+REVIEW_REVISION)).annotations.length,1);
  assert.deepEqual((await h.get('/'+PUBLICATION_REVISION)).annotations,[]);
  const note={id:'cccccccc-cccc-cccc-cccc-cccccccccccc',page:published.pages.length-1,type:'text',x:100,y:200,text:'新版参考文献页意见'};
  assert.equal((await h.post('/'+PUBLICATION_REVISION,{ownerKey:OWNER,annotation:note})).status,201);
  assert.equal((await h.post('/'+PUBLICATION_REVISION,{ownerKey:OWNER,annotation:{...note,id:OLD_NOTE.id}})).status,409);
  const old=await h.get('/'+REVIEW_REVISION);const latest=await h.get('/'+PUBLICATION_REVISION);
  assert.equal(old.annotations.length,1);assert.equal(old.annotations[0].id,OLD_NOTE.id);assert.equal(old.annotations[0].page,1);
  assert.equal(latest.annotations.length,1);assert.equal(latest.annotations[0].text,note.text);
  assert.equal(JSON.stringify(h.read().annotations.filter(annotation=>annotation.revision===REVIEW_REVISION)),oldBefore);
  assert.deepEqual((await h.get('/document?revision='+REVIEW_REVISION)).document.pages,OLD_PAGES);
  const restarted=await h.start();
  assert.equal((await h.get('/'+REVIEW_REVISION,restarted)).annotations[0].id,OLD_NOTE.id);
  assert.equal((await h.get('/'+PUBLICATION_REVISION,restarted)).annotations[0].id,note.id);
});

test('publication can seed an empty store while retaining the original report revision',async t=>{
  const h=await harness(t,{data:null});const result=await h.get();
  assert.equal(result.document.revision,PUBLICATION_REVISION);
  assert.deepEqual(result.versions.map(version=>version.revision),[REVIEW_REVISION,PUBLICATION_REVISION]);
  assert.deepEqual(h.read().annotations,[]);
  const original=await h.get('/document?revision='+REVIEW_REVISION);
  assert.ok(original.document.pages.length>0);
});

test('an interrupted publication can reuse its existing backup without preventing startup',async t=>{
  const h=await harness(t,{existingBackup:true});
  assert.equal((await h.get()).document.revision,PUBLICATION_REVISION);
  assert.equal(fs.readFileSync(`${h.file}.before-${PUBLICATION_REVISION}`,'utf8'),'previous successful backup');
  assert.deepEqual(h.read().annotations,fixture().annotations);
});

test('the actual seven-section report retains all figures and accepts a subsequent text revision',async t=>{
  const report={...graduationPublication,baseRevision:REVIEW_REVISION};
  const h=await harness(t,{report});const published=(await h.get()).document;
  assert.equal(published.sections.length,7);
  assert.ok(published.sections[5].title.startsWith('六、毕业创作进度'));
  assert.ok(published.sections[6].title.startsWith('七、参考文献'));
  assert.equal(published.pages.flatMap(p=>p.images||[]).length,1);
  assert.equal(published.pages.flatMap(p=>p.links||[]).length,11);
  assert.equal(published.pages.flatMap(p=>p.paragraphs||[]).join(''),report.sections.flatMap(s=>s.paragraphs).join(''));
  const sections=structuredClone(published.sections);sections[0].paragraphs.unshift('后续导师意见示例。');
  const response=await h.post('/document',{baseRevision:published.revision,sections,ownerKey:OWNER,requestId:'dddddddd-dddd-dddd-dddd-dddddddddddd'});
  assert.equal(response.status,201);assert.equal((await response.json()).document.sections.length,7);
  assert.deepEqual((await h.get('/document?revision='+REVIEW_REVISION)).document.pages,OLD_PAGES);
});
