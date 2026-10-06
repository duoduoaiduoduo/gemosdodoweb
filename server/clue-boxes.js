import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_PHOTO_BYTES = 600 * 1024;
const MAX_BOXES = 1000;
const MAX_STORE_BYTES = 600 * 1024 * 1024;
const CREATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_CREATES_PER_IP = 8;
const MAX_TRACKED_IPS = 10000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const HASH = /^[0-9a-f]{64}$/;
const JPEG_PREFIX = 'data:image/jpeg;base64,';
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const TITLE = '衣物洗涤与微纤维';
const SOURCE = Object.freeze({
  title: 'Napper与Thompson（2016）：合成织物洗涤释放研究',
  url: 'https://doi.org/10.1016/j.marpolbul.2016.09.025',
});
const hashToken = token => crypto.createHash('sha256').update(token).digest();
const coordinate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const plainName = value => typeof value === 'string' && value.trim().length > 0
  && Array.from(value).length <= 48 && !/[\p{Cc}\p{Cf}<>]/u.test(value);
const validHotspot = value => value && typeof value === 'object' && !Array.isArray(value)
  && coordinate(value.x) && coordinate(value.y) && coordinate(value.radius);

function apiError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

// Validate marker structure and dimensions without decoding a potentially huge
// image. This accepts ordinary baseline/progressive JPEGs and does not claim a
// pixel-level authenticity check or any scientific measurement of the photo.
function jpegDimensions(bytes) {
  const invalid = () => { throw apiError(400, 'INVALID_PHOTO', '请提供有效的JPEG照片。'); };
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8
      || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) invalid();
  let offset = 2;
  let frame;
  let hasScan = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) invalid();
    while (bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) invalid();
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!frame || !hasScan || offset !== bytes.length) invalid();
      return frame;
    }
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)
        || offset + 2 > bytes.length) invalid();
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length - 2) invalid();
    if (FRAME_MARKERS.has(marker)) {
      if (frame || length < 11) invalid();
      const precision = bytes[offset + 2];
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      const components = bytes[offset + 7];
      if (![8, 12].includes(precision) || components < 1 || components > 4
          || length !== 8 + 3 * components || width < 1 || height < 1
          || width > 8192 || height > 8192 || width * height > 32_000_000) invalid();
      frame = {width, height};
    }
    if (marker === 0xda) {
      const components = bytes[offset + 2];
      if (!frame || components < 1 || components > 4 || length !== 6 + 2 * components) invalid();
      hasScan = true;
      offset += length;
      // Skip entropy-coded data, including escaped FF and restart markers. A
      // progressive JPEG can then supply another table or another scan.
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const start = offset++;
        while (bytes[offset] === 0xff) offset++;
        if (offset >= bytes.length) invalid();
        const next = bytes[offset];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { offset++; continue; }
        offset = start;
        break;
      }
    } else {
      offset += length;
    }
  }
  invalid();
}

function decodePhoto(value) {
  if (typeof value !== 'string' || !value.startsWith(JPEG_PREFIX)) {
    throw apiError(400, 'INVALID_PHOTO', '照片必须是JPEG格式的base64数据。');
  }
  const encoded = value.slice(JPEG_PREFIX.length);
  if (encoded.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) {
    throw apiError(413, 'PHOTO_TOO_LARGE', '照片不能超过600 KiB。');
  }
  if (!encoded || encoded.length % 4 !== 0 || !BASE64.test(encoded)) {
    throw apiError(400, 'INVALID_PHOTO', '照片base64格式不正确。');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_PHOTO_BYTES) throw apiError(413, 'PHOTO_TOO_LARGE', '照片不能超过600 KiB。');
  if (bytes.toString('base64') !== encoded) throw apiError(400, 'INVALID_PHOTO', '照片base64格式不正确。');
  return {bytes, ...jpegDimensions(bytes)};
}

function regularFile(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() ? stat : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

function writeDurably(file, data) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

export function createClueBoxes({root} = {}) {
  if (typeof root !== 'string' || !root.trim()) throw new TypeError('createClueBoxes需要独立的存储root。');
  fs.mkdirSync(path.resolve(root), {recursive: true, mode: 0o700});
  const store = fs.realpathSync(path.resolve(root));
  const recentCreates = new Map();
  const router = express.Router();
  router.use(express.json({limit: '1mb'}));
  router.use((req, res, next) => {
    res.set({'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
    next();
  });

  const directory = id => path.join(store, id);
  const readBox = id => {
    const dir = directory(id);
    try {
      // Never follow a planted symlink out of this dedicated archive.
      if (!fs.lstatSync(dir).isDirectory()) return null;
      const file = path.join(dir, 'box.json');
      const jsonStat = regularFile(file);
      const photoStat = regularFile(path.join(dir, 'photo.jpg'));
      if (!jsonStat || jsonStat.size > 8192 || !photoStat || photoStat.size > MAX_PHOTO_BYTES) return null;
      let box;
      try { box = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (error) { if (error instanceof SyntaxError) return null; throw error; }
      if (box?.version !== 1 || box.id !== id || box.topic !== 'laundry' || box.publicConsent !== true
          || !plainName(box.name) || !validHotspot(box.hotspot) || !HASH.test(box.deleteTokenHash)
          || typeof box.createdAt !== 'string' || !Number.isFinite(Date.parse(box.createdAt))) return null;
      return box;
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
      throw error;
    }
  };
  const publicBox = box => ({
    id: box.id,
    name: box.name,
    title: TITLE,
    topic: 'laundry',
    createdAt: box.createdAt,
    hotspot: {x: box.hotspot.x, y: box.hotspot.y, radius: box.hotspot.radius},
    photoUrl: `/api/clue-boxes/boxes/${box.id}/photo`,
    thumbnailUrl: `/api/clue-boxes/boxes/${box.id}/photo`,
    photoWidth: box.photoWidth,
    photoHeight: box.photoHeight,
    source: {...SOURCE},
  });
  const requireId = id => {
    if (!UUID.test(id)) throw apiError(400, 'INVALID_ID', '盒子编号格式不正确。');
    return id;
  };
  const storageUsage = () => {
    let count = 0;
    let bytes = 0;
    for (const entry of fs.readdirSync(store, {withFileTypes: true})) {
      if (entry.isDirectory() && UUID.test(entry.name)) count++;
      if (!entry.isDirectory() || !(UUID.test(entry.name) || /^\.(?:pending|deleting)-/.test(entry.name))) continue;
      // Include unfinished writes/deletions in the byte ceiling without exposing
      // them in public listings. Only this module writes into the store.
      for (const file of fs.readdirSync(path.join(store, entry.name))) {
        const stat = regularFile(path.join(store, entry.name, file));
        if (stat) bytes += stat.size;
      }
    }
    return {count, bytes};
  };
  const checkRate = (ip, now) => {
    for (const [key, times] of recentCreates) {
      const active = times.filter(time => now - time < CREATE_WINDOW_MS);
      if (active.length) recentCreates.set(key, active);
      else recentCreates.delete(key);
    }
    const times = recentCreates.get(ip) || [];
    if (times.length >= MAX_CREATES_PER_IP) {
      const error = apiError(429, 'CREATE_RATE_LIMIT', '每个网络地址每小时最多公开8个盒子，请稍后再试。');
      error.retryAfter = Math.max(1, Math.ceil((times[0] + CREATE_WINDOW_MS - now) / 1000));
      throw error;
    }
    if (!recentCreates.has(ip) && recentCreates.size >= MAX_TRACKED_IPS) {
      const error = apiError(429, 'CREATE_RATE_LIMIT', '公开创建暂时繁忙，请稍后再试。');
      error.retryAfter = 60;
      throw error;
    }
    return times;
  };

  router.get('/boxes', (req, res, next) => {
    try {
      const boxes = fs.readdirSync(store, {withFileTypes: true})
        .filter(entry => entry.isDirectory() && UUID.test(entry.name))
        .map(entry => readBox(entry.name)).filter(Boolean)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .map(publicBox);
      res.json({boxes, total: boxes.length});
    } catch (error) { next(error); }
  });

  router.get('/boxes/:id/photo', (req, res, next) => {
    try {
      const id = requireId(req.params.id);
      const box = readBox(id);
      if (!box) return res.status(404).json({error: '盒子不存在。', code: 'BOX_NOT_FOUND'});
      res.type('image/jpeg').send(fs.readFileSync(path.join(directory(id), 'photo.jpg')));
    } catch (error) { next(error); }
  });

  router.get('/boxes/:id', (req, res, next) => {
    try {
      const box = readBox(requireId(req.params.id));
      if (!box) return res.status(404).json({error: '盒子不存在。', code: 'BOX_NOT_FOUND'});
      res.json({box: publicBox(box)});
    } catch (error) { next(error); }
  });

  router.post('/boxes', (req, res, next) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw apiError(400, 'INVALID_BOX', '请检查盒子内容。');
      if (body.publicConsent !== true) throw apiError(400, 'PUBLIC_CONSENT_REQUIRED', '公开展示需要明确同意。');
      if (!plainName(body.name)) throw apiError(400, 'INVALID_NAME', '名称应为1至48个字符的纯文本，不含控制字符或HTML标记。');
      if (body.topic !== 'laundry') throw apiError(400, 'INVALID_TOPIC', '当前仅支持洗衣场景演示。');
      if (!validHotspot(body.hotspot)) throw apiError(400, 'INVALID_HOTSPOT', '热点位置和半径必须是0至1之间的数字。');
      const photo = decodePhoto(body.photoDataUrl);
      const now = Date.now();
      // Use Express's configured, trusted client address; never trust an
      // arbitrary X-Forwarded-For supplied directly by the caller.
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const times = checkRate(ip, now);
      const id = crypto.randomUUID();
      const deleteToken = crypto.randomBytes(32).toString('base64url');
      const box = {
        version: 1, id, name: body.name.trim(), topic: 'laundry', title: TITLE,
        publicConsent: true, createdAt: new Date(now).toISOString(),
        hotspot: {x: body.hotspot.x, y: body.hotspot.y, radius: body.hotspot.radius},
        photoWidth: photo.width, photoHeight: photo.height,
        source: {...SOURCE}, deleteTokenHash: hashToken(deleteToken).toString('hex'),
      };
      const json = JSON.stringify(box);
      const usage = storageUsage();
      if (usage.count >= MAX_BOXES) throw apiError(409, 'ARCHIVE_FULL', '公共盒子档案已满，请稍后再试。');
      if (usage.bytes + photo.bytes.length + Buffer.byteLength(json) > MAX_STORE_BYTES) {
        throw apiError(507, 'STORAGE_LIMIT', '公共盒子存储已满，请稍后再试。');
      }
      const pending = path.join(store, `.pending-${id}`);
      try {
        fs.mkdirSync(pending, {mode: 0o700});
        writeDurably(path.join(pending, 'photo.jpg'), photo.bytes);
        writeDurably(path.join(pending, 'box.json'), json);
        // One rename commits both files; readers cannot observe half a box.
        fs.renameSync(pending, directory(id));
      } catch (error) {
        fs.rmSync(pending, {recursive: true, force: true});
        throw error;
      }
      recentCreates.set(ip, [...times, now]);
      res.status(201).json({box: publicBox(box), deleteToken});
    } catch (error) { next(error); }
  });

  router.delete('/boxes/:id', (req, res, next) => {
    try {
      const id = requireId(req.params.id);
      const auth = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.get('Authorization') || '');
      if (!auth || !TOKEN.test(auth[1])) throw apiError(403, 'DELETE_FORBIDDEN', '需要创建此盒子时取得的删除凭证。');
      const box = readBox(id);
      if (!box) return res.status(404).json({error: '盒子不存在。', code: 'BOX_NOT_FOUND'});
      if (!crypto.timingSafeEqual(hashToken(auth[1]), Buffer.from(box.deleteTokenHash, 'hex'))) {
        throw apiError(403, 'DELETE_FORBIDDEN', '删除凭证不正确。');
      }
      const tombstone = path.join(store, `.deleting-${id}-${crypto.randomUUID()}`);
      fs.renameSync(directory(id), tombstone);
      fs.rmSync(tombstone, {recursive: true, force: true});
      res.json({success: true});
    } catch (error) { next(error); }
  });

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.status === 413) return res.status(413).json({error: '提交内容过大；JPEG照片最多600 KiB。', code: error.code || 'BODY_TOO_LARGE'});
    if (error.type === 'entity.parse.failed' || error instanceof URIError) return res.status(400).json({error: '请求格式不正确。', code: 'INVALID_REQUEST'});
    if ([400, 403, 409, 429, 507].includes(error.status)) {
      if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
      return res.status(error.status).json({error: error.message, code: error.code});
    }
    // Do not disclose filesystem paths, submitted photos or credential material.
    res.status(500).json({error: '盒子暂时无法读取或保存，请稍后再试。', code: 'STORE_UNAVAILABLE'});
  });
  return router;
}
