import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGraduationReview,REVIEW_REVISION} from '../server/graduation-review.js';
import {paginateSections} from '../server/review-pagination.js';

const OWNER='11111111-1111-1111-1111-111111111111';
const OTHER_OWNER='22222222-2222-2222-2222-222222222222';
const NOTE_ID='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const THESIS_REVISION='thesis-outline-2026-10-07-test';
function initialDocument(){
  const sections=['摘要','第一章 绪论','第二章 文献研究','第三章 研究方法','第四章 设计实践','第五章 评价计划','第六章 讨论与结论','参考文献','附录'].map(title=>({title,paragraphs:[`${title}：本章拟讨论的内容，尚未完成研究。`],pending:'',links:[]}));
  sections[3].images=[{src:'/graduation/thesis/outline.png',alt:'拟研究流程',caption:'研究流程大纲'}];
  sections[7].sourceList=true;sections[7].links=[['资料来源','https://example.org/thesis-source']];
  return {revision:THESIS_REVISION,label:'论文大纲草案 v1',createdAt:'2026-10-07T08:00:00.000Z',title:'硕士专业学位论文大纲草案',outlineFormat:'reference',coverNote:'大纲草案，用户研究与论文尚未完成。',downloads:[['论文大纲导出','/graduation/thesis/outline.pdf']],sections};
}

async function harness(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'thesis-review-'));
  const proposalFile=path.join(dir,'annotations.json'),thesisFile=path.join(dir,'thesis-annotations.json'),servers=[];
  async function start(options={}){
    const app=express();
    app.use('/api/graduation-review',createGraduationReview(proposalFile));
    app.use('/api/thesis-review',createGraduationReview(thesisFile,{initialDocument:options.initialDocument||initialDocument(),versionLabelPrefix:'论文讨论稿',bodyLimit:'1mb',maxSectionCharacters:60000,maxSectionParagraphs:300,...(options.publication?{publication:options.publication}:{})}));
    const server=app.listen(0,'127.0.0.1');servers.push(server);
    await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
    const base=`http://127.0.0.1:${server.address().port}`;
    return {
      request:(scope,route,method='GET',body)=>fetch(`${base}/api/${scope}-review${route}`,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}),
      async get(scope,route='/document'){const response=await this.request(scope,route);assert.equal(response.status,200);return response.json();},
    };
  }
  t.after(async()=>{
    await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const client=await start();
  return {client,start,proposalFile,thesisFile,read:()=>JSON.parse(fs.readFileSync(thesisFile,'utf8'))};
}

async function proposalBaseline(client,file){
  const note={id:NOTE_ID,page:0,type:'text',x:100,y:180,text:'开题报告的独立批注。'};
  const response=await client.request('graduation','/'+REVIEW_REVISION,'POST',{ownerKey:OWNER,annotation:note});
  assert.equal(response.status,201);
  return fs.readFileSync(file,'utf8');
}

test('thesis initial edition is persisted and isolated from the proposal and changed bootstrap data',async t=>{
  const h=await harness(t),seed=initialDocument();
  assert.ok(fs.existsSync(h.thesisFile),'persist the initial edition before any request or annotation');
  const thesis=await h.client.get('thesis'),proposal=await h.client.get('graduation');
  assert.deepEqual(thesis.versions.map(version=>version.revision),[THESIS_REVISION]);
  assert.equal(proposal.document.revision,REVIEW_REVISION);
  assert.deepEqual(thesis.document.sections,seed.sections);
  assert.deepEqual(thesis.document.pages,paginateSections(seed.sections));
  assert.equal(thesis.document.coverNote,seed.coverNote);
  const proposalBytes=await proposalBaseline(h.client,h.proposalFile);

  // The same identifier may exist in separate files without one API replacing the other note.
  const note={id:NOTE_ID,page:0,type:'text',x:80,y:230,text:'论文大纲的独立批注。'};
  assert.equal((await h.client.request('thesis','/'+THESIS_REVISION,'POST',{ownerKey:OWNER,annotation:note})).status,201);
  assert.equal((await h.client.get('graduation','/'+REVIEW_REVISION)).annotations[0].text,'开题报告的独立批注。');
  assert.equal((await h.client.get('thesis','/'+THESIS_REVISION)).annotations[0].text,note.text);
  assert.equal((await h.client.request('thesis','/'+REVIEW_REVISION,'POST',{ownerKey:OWNER,annotation:note})).status,409);
  assert.equal((await h.client.request('graduation','/'+THESIS_REVISION,'POST',{ownerKey:OWNER,annotation:note})).status,409);
  assert.equal((await h.client.request('thesis','/document?revision='+REVIEW_REVISION)).status,404);
  assert.equal((await h.client.request('graduation','/document?revision='+THESIS_REVISION)).status,404);
  const savedBytes=fs.readFileSync(h.thesisFile,'utf8');
  const changed=initialDocument();changed.revision='thesis-new-bootstrap-2026-test';changed.sections[0].paragraphs=['部署时改变的种子，不应重排已有大纲。'];changed.coverNote='改变的种子说明';
  const restarted=await h.start({initialDocument:changed});
  assert.deepEqual((await restarted.get('thesis')).document,thesis.document);
  assert.equal((await restarted.get('thesis','/'+THESIS_REVISION)).annotations[0].text,note.text);
  assert.equal(fs.readFileSync(h.thesisFile,'utf8'),savedBytes);
  assert.equal(fs.readFileSync(h.proposalFile,'utf8'),proposalBytes);
});

test('thesis edits preserve the first edition, annotations and metadata with idempotent conflict-safe saves',async t=>{
  const h=await harness(t),published=(await h.client.get('thesis')).document;
  const proposalBytes=await proposalBaseline(h.client,h.proposalFile);
  const oldNote={id:NOTE_ID,page:0,type:'text',x:80,y:180,text:'请先明确论文研究问题。'};
  assert.equal((await h.client.request('thesis','/'+THESIS_REVISION,'POST',{ownerKey:OWNER,annotation:oldNote})).status,201);
  const oldAnnotations=h.read().annotations;
  const sections=structuredClone(published.sections);
  sections[1].paragraphs.push('拟进一步讨论设计问题与使用情境。'.repeat(180));
  sections[3].images=[{src:'javascript:alert(1)',alt:'伪造附件',caption:'不应采用'}];
  const payload={baseRevision:THESIS_REVISION,sections,requestId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',ownerKey:OWNER,coverNote:'已完成论文',title:'覆盖原题',outlineFormat:'other',downloads:[['伪造下载','javascript:alert(1)']]};
  const response=await h.client.request('thesis','/document','POST',payload);assert.equal(response.status,201);
  const saved=await response.json();assert.equal(saved.versions.length,2);assert.equal(saved.document.label,'论文讨论稿 v2');
  assert.equal(saved.document.sections.length,9);
  for(const field of ['title','coverNote','outlineFormat','downloads'])assert.deepEqual(saved.document[field],published[field]);
  assert.deepEqual(saved.document.sections[3].images,published.sections[3].images);
  assert.deepEqual(saved.document.sections[7].links,published.sections[7].links);
  assert.equal(saved.document.pages.flatMap(page=>page.paragraphs).join(''),sections.flatMap(section=>section.paragraphs).join(''));
  assert.deepEqual((await h.client.get('thesis','/document?revision='+THESIS_REVISION)).document,published);
  assert.deepEqual(h.read().annotations,oldAnnotations);
  assert.ok(!JSON.stringify(saved.document).includes('javascript:'));
  const retry=await h.client.request('thesis','/document','POST',payload);assert.equal(retry.status,200);
  assert.equal((await retry.json()).document.revision,saved.document.revision);
  assert.equal((await h.client.request('thesis','/document','POST',{...payload,ownerKey:OTHER_OWNER})).status,409);
  assert.equal((await h.client.request('thesis','/document','POST',{...payload,requestId:'cccccccc-cccc-cccc-cccc-cccccccccccc'})).status,409);
  assert.equal((await h.client.request('graduation','/document','POST',{...payload,baseRevision:saved.document.revision})).status,409);
  assert.equal((await h.client.request('thesis','/document','POST',{...payload,baseRevision:saved.document.revision,requestId:'dddddddd-dddd-dddd-dddd-dddddddddddd',sections:sections.slice(0,-1)})).status,400);
  const newNote={id:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',page:saved.document.pages.length-1,type:'pen',points:[{x:100,y:120},{x:120,y:130}]};
  assert.equal((await h.client.request('thesis','/'+saved.document.revision,'POST',{ownerKey:OWNER,annotation:newNote})).status,201);
  assert.equal((await h.client.get('thesis','/'+THESIS_REVISION)).annotations.length,1);
  assert.equal((await h.client.get('thesis','/'+saved.document.revision)).annotations.length,1);
  const bytes=fs.readFileSync(h.thesisFile,'utf8'),changed=initialDocument();changed.sections[0].paragraphs=['改变的种子正文。'];
  const restarted=await h.start({initialDocument:changed});
  assert.equal((await restarted.get('thesis')).document.revision,saved.document.revision);
  assert.equal((await restarted.get('thesis','/'+THESIS_REVISION)).annotations[0].text,oldNote.text);
  assert.equal((await restarted.get('thesis','/'+saved.document.revision)).annotations[0].id,newNote.id);
  assert.equal(fs.readFileSync(h.thesisFile,'utf8'),bytes);
  assert.equal(fs.readFileSync(h.proposalFile,'utf8'),proposalBytes);
});

test('future thesis publications append once, back up the stored outline and honor the latest base revision',async t=>{
  const h=await harness(t),initial=(await h.client.get('thesis')).document;
  const proposalBytes=await proposalBaseline(h.client,h.proposalFile);
  const note={id:NOTE_ID,page:0,type:'text',x:70,y:190,text:'大纲原版意见必须保留。'};
  assert.equal((await h.client.request('thesis','/'+THESIS_REVISION,'POST',{ownerKey:OWNER,annotation:note})).status,201);
  const before=fs.readFileSync(h.thesisFile,'utf8');
  const publication={...initialDocument(),revision:'thesis-controlled-release-test',baseRevision:THESIS_REVISION,label:'论文方案讨论稿',coverNote:'研究方案修订，尚未完成评价。'};
  publication.sections[0].paragraphs=['受控论文修订正文。'];
  const publishedClient=await h.start({publication}),published=await publishedClient.get('thesis');
  assert.deepEqual(published.versions.map(version=>version.revision),[THESIS_REVISION,publication.revision]);
  assert.equal(published.document.coverNote,publication.coverNote);
  assert.deepEqual((await publishedClient.get('thesis','/document?revision='+THESIS_REVISION)).document,initial);
  assert.equal((await publishedClient.get('thesis','/'+THESIS_REVISION)).annotations[0].text,note.text);
  assert.equal(fs.readFileSync(`${h.thesisFile}.before-${publication.revision}`,'utf8'),before);
  const bytes=fs.readFileSync(h.thesisFile,'utf8'),restarted=await h.start({publication});
  assert.equal((await restarted.get('thesis')).versions.length,2);
  assert.equal(fs.readFileSync(h.thesisFile,'utf8'),bytes);
  const competing={...publication,revision:'thesis-stale-base-release-test'};
  const stale=await h.start({publication:competing});
  assert.equal((await stale.get('thesis')).document.revision,publication.revision);
  assert.equal(fs.readFileSync(h.thesisFile,'utf8'),bytes);
  assert.ok(!fs.existsSync(`${h.thesisFile}.before-${competing.revision}`));
  assert.equal(fs.readFileSync(h.proposalFile,'utf8'),proposalBytes);
});

test('long thesis chapters exceed proposal limits while preserving every character across pages',async t=>{
  const h=await harness(t),thesis=(await h.client.get('thesis')).document,proposal=(await h.client.get('graduation')).document;
  const proposalBytes=await proposalBaseline(h.client,h.proposalFile);
  const paragraphs=Array.from({length:200},(_,index)=>`第${index+1}段：${'拟开展论文研究与记录。'.repeat(24)}`);
  assert.ok(paragraphs.join('').length>20000&&paragraphs.join('').length<=60000);
  assert.ok(paragraphs.length>100&&paragraphs.length<=300);
  const sections=structuredClone(thesis.sections);sections[1].paragraphs=paragraphs;
  const payload={baseRevision:THESIS_REVISION,sections,requestId:'ffffffff-ffff-ffff-ffff-ffffffffffff',ownerKey:OWNER};
  assert.ok(Buffer.byteLength(JSON.stringify(payload))>150*1024);
  const response=await h.client.request('thesis','/document','POST',payload);assert.equal(response.status,201);
  const saved=await response.json();
  assert.deepEqual(saved.document.sections[1].paragraphs,paragraphs);
  const chapterPages=saved.document.pages.filter(page=>page.title.startsWith(sections[1].title));
  assert.ok(chapterPages.length>80);
  assert.equal(chapterPages.flatMap(page=>page.paragraphs).join(''),paragraphs.join(''));
  assert.deepEqual((await h.client.get('thesis','/document?revision='+THESIS_REVISION)).document,thesis);
  const proposalSections=structuredClone(proposal.sections);proposalSections[1].paragraphs=paragraphs;
  const rejected=await h.client.request('graduation','/document','POST',{...payload,baseRevision:REVIEW_REVISION,sections:proposalSections});
  assert.ok([400,413].includes(rejected.status));
  assert.equal(fs.readFileSync(h.proposalFile,'utf8'),proposalBytes);
  assert.equal((await h.client.get('graduation')).document.revision,REVIEW_REVISION);
});

test('production SPA fallback accepts thesis direct and version URLs without swallowing API or asset paths',()=>{
  // Inspect the actual production whitelist without importing server.js and
  // starting its stores, timers, WebSockets or production listener.
  const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
  const prefix="app.get(['/', ",start=source.indexOf(prefix),end=source.indexOf('], (req, res) => {',start);
  assert.ok(start>=0&&end>start,'production SPA whitelist exists');
  const literal=source.slice(start+prefix.length,end);
  assert.ok(literal.startsWith('/^')&&literal.endsWith('$/'));
  const whitelist=new RegExp(literal.slice(1,-1));
  for(const address of ['/graduation/thesis','/graduation/thesis?version=thesis-outline-2026-10-07-test','/graduation','/graduation/review','/graduation/research','/awards','/vibecoding/example']){
    assert.ok(whitelist.test(new URL(address,'https://example.org').pathname),address);
  }
  for(const pathname of ['/api/thesis-review/document','/graduation/thesis-other','/graduation/thesis/chapter','/graduation/reports/missing.pdf','/assets/missing.js'])assert.equal(whitelist.test(pathname),false,pathname);
  const fallback=source.slice(start,source.indexOf('\n  });',end));
  assert.ok(fallback.includes("res.sendFile(path.join(distRoot, 'index.html'))"));
  assert.ok(source.slice(source.lastIndexOf('if (fs.existsSync(distRoot))',start),start).includes('app.use(express.static(distRoot))'));
});
