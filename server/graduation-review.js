import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Each immutable report revision owns its annotations. Never reuse a revision
// identifier after changing the page text or geometry.
export const REVIEW_REVISION = 'discussion-2026-09-17-v1';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value);
const coordinate = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;
export function createGraduationReview(file) {
  const router = express.Router();
  router.use(express.json({limit: '150kb'}));
  const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {annotations: []};
  const write = data => {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), {mode: 0o600});
    fs.renameSync(tmp, file);
  };
  const publicNote = ({ownerHash, ...note}) => note;
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/:revision', (req, res, next) => {
    try { res.json({annotations: read().annotations.filter(a => a.revision === req.params.revision).map(publicNote)}); }
    catch (e) { next(e); }
  });
  router.post('/:revision', (req, res, next) => {
    try {
      if (req.params.revision !== REVIEW_REVISION) return res.status(409).json({error: '报告版本已更新，请刷新后批注。'});
      const {annotation: a, ownerKey} = req.body || {};
      if (!validId(ownerKey) || !a || !validId(a.id) || !Number.isInteger(a.page) || a.page < 0 || a.page > 5 || !['pen','text'].includes(a.type)) return res.status(400).json({error: '批注格式不正确'});
      if (a.type === 'pen' && (!Array.isArray(a.points) || a.points.length < 2 || a.points.length > 3000 || a.points.some(p => !p || !coordinate(p.x,760) || !coordinate(p.y,980)))) return res.status(400).json({error:'笔画格式不正确'});
      if (a.type === 'text' && (!coordinate(a.x,540) || !coordinate(a.y,800) || typeof a.text !== 'string' || !a.text.trim() || a.text.length > 500)) return res.status(400).json({error:'文字批注格式不正确'});
      const data = read();
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
  router.use((err,req,res,next)=>{console.error('[graduation-review]',err.message);res.status(err.status===413?413:500).json({error:err.status===413?'笔画过长，请分段批注。':'批注暂时无法保存，请重试。'});});
  return router;
}
