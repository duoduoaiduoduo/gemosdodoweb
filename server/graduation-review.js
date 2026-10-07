import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {reportPages} from '../src/research/reviewDocumentData.js';
import {paginateSections} from './review-pagination.js';

// Each immutable report revision owns its annotations. Never reuse a revision
// identifier after changing the page text or geometry.
export const REVIEW_REVISION = 'discussion-2026-09-17-v1';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value);
const coordinate = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;
export function createGraduationReview(file, {publication,initialDocument,versionLabelPrefix='讨论稿',bodyLimit='150kb',maxSectionCharacters=20000,maxSectionParagraphs=100} = {}) {
  const router = express.Router();
  router.use(express.json({limit: bodyLimit}));
  const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {annotations: []};
  const write = data => {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), {mode: 0o600});
    fs.renameSync(tmp, file);
  };
  const seed=initialDocument
    ? {...initialDocument,pages:initialDocument.pages||paginateSections(initialDocument.sections)}
    : {revision:REVIEW_REVISION,label:'讨论稿 v1',createdAt:'2026-09-17T00:00:00.000Z',sections:reportPages,pages:reportPages};
  const documents=data=>data.documents?.length?data.documents:[seed];
  // A separate document's first edition must survive later bootstrap changes,
  // even before anyone has added a note or edited its text.
  if(initialDocument){
    const data=read();
    if(!data.documents?.length){data.documents=[seed];write(data);}
  }
  // A release appends one version. Stored page geometry and annotations stay intact.
  if (publication) {
    const data=read(), all=documents(data);
    if (!all.some(d=>d.revision===publication.revision)) {
      if (data.documents?.length && all.at(-1).revision!==publication.baseRevision) {
        console.warn('[graduation-review] Publication skipped: latest revision changed.');
      } else {
        const backup=`${file}.before-${publication.revision}`;
        if (fs.existsSync(file)&&!fs.existsSync(backup)) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
        const {baseRevision,...report}=publication;
        data.documents=[...all,{...report,createdAt:report.createdAt||new Date().toISOString(),pages:paginateSections(report.sections)}];
        write(data);
      }
    }
  }
  const publicDocument=({requestId,ownerHash,...doc})=>doc;
  const bundle=(data,revision)=>{const all=documents(data);const current=all[all.length-1];return {document:publicDocument(all.find(d=>d.revision===revision)||current),latestRevision:current.revision,versions:all.map(({revision,label,createdAt})=>({revision,label,createdAt}))};};
  const publicNote = ({ownerHash, ...note}) => note;
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/document', (req,res,next)=>{try{const data=read();if(req.query.revision&&!documents(data).some(d=>d.revision===req.query.revision))return res.status(404).json({error:'报告版本不存在'});res.json(bundle(data,req.query.revision));}catch(e){next(e);}});
  router.post('/document', (req,res,next)=>{
    try{
      const {baseRevision,sections,requestId,ownerKey}=req.body||{};
      if(!validId(requestId)||!validId(ownerKey)||!Array.isArray(sections))return res.status(400).json({error:'请检查报告正文'});
      const data=read(),all=documents(data),duplicate=all.find(d=>d.requestId===requestId);
      if(duplicate){if(duplicate.ownerHash!==hash(ownerKey))return res.status(409).json({error:'保存编号冲突'});return res.json(bundle(data,duplicate.revision));}
      if(baseRevision!==all[all.length-1].revision)return res.status(409).json({error:'报告已被另一位编辑者更新。你的修改已保留，请先导出，再打开最新版核对。'});
      if(sections.length!==all.at(-1).sections.length)return res.status(400).json({error:'请保留本版的完整章节结构'});
      const clean=[];
      for(const section of sections){
        if(!section||typeof section.title!=='string'||!section.title.trim()||section.title.length>80||typeof section.pending!=='string'||section.pending.length>400||!Array.isArray(section.paragraphs)||section.paragraphs.length>maxSectionParagraphs||section.paragraphs.some(p=>typeof p!=='string'||p.length>10000)||section.paragraphs.join('').length>maxSectionCharacters)return res.status(400).json({error:'请检查章节标题与正文长度'});
        // Reference links are preserved from the previous version; editing text cannot introduce executable URLs.
        const previous=all.at(-1).sections[clean.length];
        clean.push({title:section.title.trim(),paragraphs:section.paragraphs.filter(p=>p.trim()),pending:section.pending,links:previous.links||[],...(previous.images?{images:previous.images}:{}),...(previous.tables?{tables:previous.tables}:{}),...(previous.sourceList?{sourceList:true}:{})});
      }
      if(clean.every(s=>!s.paragraphs.length))return res.status(400).json({error:'正文不能为空'});
      const previous=all.at(-1);
      const revision=crypto.randomUUID();const document={revision,label:`${versionLabelPrefix} v${all.length+1}`,createdAt:new Date().toISOString(),sections:clean,pages:paginateSections(clean),requestId,ownerHash:hash(ownerKey),...(previous.title?{title:previous.title}:{}),...(previous.outlineFormat?{outlineFormat:previous.outlineFormat}:{}),...(typeof previous.coverNote==='string'?{coverNote:previous.coverNote}:{}),...(previous.downloads?{downloads:previous.downloads}:{})};
      data.documents=[...all,document];write(data);res.status(201).json(bundle(data,revision));
    }catch(e){next(e);}
  });
  router.get('/:revision', (req, res, next) => {
    try { res.json({annotations: read().annotations.filter(a => a.revision === req.params.revision).map(publicNote)}); }
    catch (e) { next(e); }
  });
  router.post('/:revision', (req, res, next) => {
    try {
      const stored=read();const document=documents(stored).find(d=>d.revision===req.params.revision);
      if (!document) return res.status(409).json({error: '报告版本不存在，请刷新后批注。'});
      const {annotation: a, ownerKey} = req.body || {};
      if (!validId(ownerKey) || !a || !validId(a.id) || !Number.isInteger(a.page) || a.page < 0 || a.page >= document.pages.length || !['pen','text'].includes(a.type)) return res.status(400).json({error: '批注格式不正确'});
      if (a.type === 'pen' && (!Array.isArray(a.points) || a.points.length < 2 || a.points.length > 3000 || a.points.some(p => !p || !coordinate(p.x,760) || !coordinate(p.y,980)))) return res.status(400).json({error:'笔画格式不正确'});
      if (a.type === 'text' && (!coordinate(a.x,540) || !coordinate(a.y,800) || typeof a.text !== 'string' || !a.text.trim() || a.text.length > 500)) return res.status(400).json({error:'文字批注格式不正确'});
      const data = stored;
      const existing = data.annotations.find(n => n.id === a.id);
      if (existing) {
        if (existing.ownerHash !== hash(ownerKey) || existing.revision !== req.params.revision) return res.status(409).json({error:'批注编号冲突'});
        return res.json({annotation:publicNote(existing)});
      }
      if (data.annotations.filter(n => n.revision === req.params.revision).length >= 2000) return res.status(409).json({error:'本版批注已满，请整理后发布新版本。'});
      const note = {id:a.id,page:a.page,type:a.type,revision:req.params.revision,createdAt:new Date().toISOString(),ownerHash:hash(ownerKey),...(a.type==='pen'?{points:a.points.map(({x,y})=>({x,y}))}:{x:a.x,y:a.y,text:a.text.trim()})};
      data.annotations.push(note); write(data); res.status(201).json({annotation:publicNote(note)});
    } catch(e) { next(e); }
  });
  router.delete('/:revision/:id', (req,res,next) => {
    try {
      const {ownerKey}=req.body||{};
      if (!validId(ownerKey)) return res.status(403).json({error:'只能撤销当前浏览器创建的批注。'});
      const data=read(); const note=data.annotations.find(a=>a.id===req.params.id && a.revision===req.params.revision);
      if (!note) return res.json({success:true});
      if (note.ownerHash!==hash(ownerKey)) return res.status(403).json({error:'只能撤销当前浏览器创建的批注。'});
      data.annotations=data.annotations.filter(a=>a!==note); write(data); res.json({success:true});
    }catch(e){next(e);}
  });
  router.use((err,req,res,next)=>{console.error('[graduation-review]',err.message);res.status(err.status===413?413:500).json({error:err.status===413?'提交内容过长，请缩短后重试。':'批注暂时无法保存，请重试。'});});
  return router;
}
