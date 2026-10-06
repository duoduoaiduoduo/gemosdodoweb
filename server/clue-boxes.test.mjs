import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createClueBoxes} from './clue-boxes.js';

const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
const PHOTO = `data:image/jpeg;base64,${JPEG}`;
const body = overrides => ({name: '我的洗衣盒子', topic: 'laundry', photoDataUrl: PHOTO,
  hotspot: {x: 0.25, y: 0.5, radius: 0.12}, publicConsent: true, ...overrides});

async function start(root) {
  const app = express();
  app.use('/api/clue-boxes', createClueBoxes({root}));
  app.post('/unrelated', express.json(), (req, res) => res.json({ok: true}));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, base: `${origin}/api/clue-boxes`,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clue-boxes-'));
  const app = await start(root);
  t.after(async () => { await app.close(); fs.rmSync(root, {recursive: true, force: true}); });
  return {root, ...app};
}

const post = (base, value, headers = {}) => fetch(`${base}/boxes`, {
  method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(value),
});
const erase = (base, id, token, extra = {}) => fetch(`${base}/boxes/${id}`, {
  method: 'DELETE', headers: token ? {Authorization: `Bearer ${token}`} : {}, ...extra,
});

test('public boxes persist across a router restart, serve JPEGs, and expose only fixed topic content', async t => {
  const app = await setup(t);
  const response = await post(app.base, body({id: '../../outside', title: '伪造科学结论', source: 'javascript:alert(1)', html: '<script>bad</script>'}));
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.match(created.box.id, /^[0-9a-f-]{36}$/);
  assert.equal(created.box.title, '衣物洗涤与微纤维');
  assert.equal(created.box.source.url, 'https://doi.org/10.1016/j.marpolbul.2016.09.025');
  assert.deepEqual(created.box.hotspot, body().hotspot);
  assert.equal(created.box.photoWidth, 2);
  assert.equal(created.box.photoHeight, 2);
  assert.equal(created.box.thumbnailUrl, `/api/clue-boxes/boxes/${created.box.id}/photo`);
  assert.ok(Number.isFinite(Date.parse(created.box.createdAt)));
  assert.match(created.deleteToken, /^[A-Za-z0-9_-]{43}$/);
  const stored = JSON.parse(fs.readFileSync(path.join(app.root, created.box.id, 'box.json'), 'utf8'));
  assert.equal(stored.deleteTokenHash, crypto.createHash('sha256').update(created.deleteToken).digest('hex'));
  assert.ok(!JSON.stringify(stored).includes(created.deleteToken));
  assert.equal(stored.publicConsent, true);
  assert.deepEqual(fs.readdirSync(app.root), [created.box.id]);
  assert.deepEqual(fs.readdirSync(path.join(app.root, created.box.id)).sort(), ['box.json', 'photo.jpg']);
  assert.ok(!('html' in stored));
  const restarted = await start(app.root);
  try {
    const listingResponse = await fetch(`${restarted.base}/boxes`);
    assert.equal(listingResponse.status, 200);
    const listing = await listingResponse.json();
    assert.equal(listing.total, 1);
    assert.deepEqual(listing.boxes, [created.box]);
    assert.deepEqual(await (await fetch(`${restarted.base}/boxes/${created.box.id}`)).json(), {box: created.box});
    assert.ok(!JSON.stringify(listing).includes(created.deleteToken));
    assert.ok(!JSON.stringify(listing).includes(stored.deleteTokenHash));
    const photo = await fetch(`${restarted.origin}${created.box.photoUrl}`);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    assert.equal(photo.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), Buffer.from(JPEG, 'base64'));
    assert.equal((await erase(restarted.base, created.box.id, created.deleteToken)).status, 200);
    assert.equal((await fetch(`${app.base}/boxes/${created.box.id}/photo`)).status, 404);
    assert.deepEqual(await (await fetch(`${app.base}/boxes`)).json(), {boxes: [], total: 0});
  } finally { await restarted.close(); }
});

test('only explicit public consent permits persistence', async t => {
  const app = await setup(t);
  for (const publicConsent of [undefined, false, 'true', 1, null]) {
    const response = await post(app.base, body({publicConsent}));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'PUBLIC_CONSENT_REQUIRED');
  }
  assert.deepEqual(fs.readdirSync(app.root), []);
});

test('rejects invalid JPEGs, noncanonical base64, dimensions, names and hotspot coordinates', async t => {
  const app = await setup(t);
  const bytes = Buffer.from(JPEG, 'base64');
  const invalidDimensions = Buffer.from(bytes);
  const frame = invalidDimensions.indexOf(Buffer.from([0xff, 0xc0]));
  invalidDimensions.writeUInt16BE(0, frame + 5);
  const invalid = [
    body({photoDataUrl: `data:image/png;base64,${JPEG}`}),
    body({photoDataUrl: 'data:image/jpeg;base64,bm90LWEtaW1hZ2U='}),
    body({photoDataUrl: 'data:image/jpeg;base64,/9j/2Q=='}),
    body({photoDataUrl: PHOTO.slice(0, -1)}),
    body({photoDataUrl: `${PHOTO}\n`}),
    body({photoDataUrl: `data:image/jpeg;base64,${Buffer.concat([bytes, Buffer.from('extra')]).toString('base64')}`}),
    body({photoDataUrl: `data:image/jpeg;base64,${invalidDimensions.toString('base64')}`}),
    body({hotspot: {x: -0.1, y: 0.5, radius: 0.1}}),
    body({hotspot: {x: 0.5, y: 1.01, radius: 0.1}}),
    body({hotspot: {x: 0.5, y: 0.5, radius: 1.1}}),
    body({hotspot: {x: '0.5', y: 0.5, radius: 0.1}}),
    body({hotspot: {x: 0.5, y: null, radius: 0.1}}),
    body({hotspot: []}), body({hotspot: null}),
    body({name: 'a'.repeat(49)}), body({name: ''}), body({name: '  '}),
    body({name: '换行\n文字'}), body({name: '\u0000名称'}),
    body({name: '隐藏\u202e方向'}), body({name: '<img src=x>'}),
    body({topic: 'pfas'}),
  ];
  for (const value of invalid) assert.equal((await post(app.base, value)).status, 400, JSON.stringify({...value, photoDataUrl: '(photo)'}));
  assert.deepEqual(fs.readdirSync(app.root), []);
  const large = Buffer.alloc(600 * 1024 + 1).toString('base64');
  assert.equal((await post(app.base, body({photoDataUrl: `data:image/jpeg;base64,${large}`}))).status, 413);
  const boundary = await post(app.base, body({name: '衣'.repeat(48), hotspot: {x: 0, y: 1, radius: 0}}));
  assert.equal(boundary.status, 201);
  // Valid JPEG comment segments bring the fixture exactly to the byte ceiling.
  // This also checks the large canonical-base64 path, not only tiny thumbnails.
  const comments = [];
  let remaining = 600 * 1024 - bytes.length;
  while (remaining > 0) {
    const comment = Buffer.alloc(Math.min(remaining, 60000));
    comment[0] = 0xff; comment[1] = 0xfe;
    comment.writeUInt16BE(comment.length - 2, 2);
    comments.push(comment);
    remaining -= comment.length;
  }
  const maxPhoto = Buffer.concat([bytes.subarray(0, 2), ...comments, bytes.subarray(2)]);
  assert.equal(maxPhoto.length, 600 * 1024);
  assert.equal((await post(app.base, body({photoDataUrl: `data:image/jpeg;base64,${maxPhoto.toString('base64')}`}))).status, 201);
});

test('delete requires the owner Bearer token; no GET or later errors expose credentials', async t => {
  const app = await setup(t);
  const created = await (await post(app.base, body())).json();
  const id = created.box.id;
  assert.equal((await erase(app.base, id)).status, 403);
  const wrong = crypto.randomBytes(32).toString('base64url');
  assert.equal((await erase(app.base, id, wrong)).status, 403);
  const inBody = await erase(app.base, id, undefined, {headers: {'Content-Type': 'application/json'}, body: JSON.stringify({deleteToken: created.deleteToken})});
  assert.equal(inBody.status, 403);
  for (const url of [`${app.base}/boxes`, `${app.base}/boxes/${id}`]) {
    const raw = await (await fetch(url)).text();
    assert.ok(!raw.includes('deleteToken'));
    assert.ok(!raw.includes(created.deleteToken));
  }
  assert.equal((await fetch(`${app.base}/boxes/${id}?deleteToken=${created.deleteToken}`, {method: 'DELETE'})).status, 403);
  const removed = await erase(app.base, id, created.deleteToken);
  assert.deepEqual(await removed.json(), {success: true});
  assert.deepEqual(fs.readdirSync(app.root), []);
  assert.equal((await fetch(`${app.base}/boxes/${id}`)).status, 404);
  assert.equal((await fetch(`${app.base}/boxes/${id}/photo`)).status, 404);
});

test('client paths and symlinks cannot escape the archive', async t => {
  const app = await setup(t);
  for (const id of ['..%2F..%2Foutside', '%2Fetc%2Fpasswd', 'not-a-uuid', '%00']) {
    for (const suffix of ['', '/photo']) assert.equal((await fetch(`${app.base}/boxes/${id}${suffix}`)).status, 400);
    assert.equal((await erase(app.base, id, crypto.randomBytes(32).toString('base64url'))).status, 400);
  }
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'clue-outside-'));
  t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
  fs.writeFileSync(path.join(outside, 'photo.jpg'), Buffer.from(JPEG, 'base64'));
  const linkId = crypto.randomUUID();
  fs.symlinkSync(outside, path.join(app.root, linkId), 'dir');
  assert.deepEqual(await (await fetch(`${app.base}/boxes`)).json(), {boxes: [], total: 0});
  assert.equal((await fetch(`${app.base}/boxes/${linkId}/photo`)).status, 404);
  const created = await (await post(app.base, body())).json();
  const photoFile = path.join(app.root, created.box.id, 'photo.jpg');
  fs.unlinkSync(photoFile);
  fs.symlinkSync(path.join(outside, 'photo.jpg'), photoFile);
  assert.equal((await fetch(`${app.base}/boxes/${created.box.id}/photo`)).status, 404);
  assert.ok(fs.existsSync(path.join(outside, 'photo.jpg')));
});

test('creation is limited to eight per IP per hour without blocking reads, deletion or other routes', async t => {
  const app = await setup(t);
  const creations = await Promise.all(Array.from({length: 9}, (_, i) => post(app.base, body({name: `盒子${i}`}), {'X-Forwarded-For': `192.0.2.${i}`})));
  assert.equal(creations.filter(response => response.status === 201).length, 8);
  const limited = creations.find(response => response.status === 429);
  assert.ok(limited);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await (await fetch(`${app.base}/boxes`)).json()).total, 8);
  const first = await creations.find(response => response.status === 201).json();
  assert.equal((await erase(app.base, first.box.id, first.deleteToken)).status, 200);
  assert.equal((await post(app.base, body())).status, 429);
  const unrelated = await fetch(`${app.origin}/unrelated`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
  assert.equal(unrelated.status, 200);
});

test('persistent count and byte ceilings reject creates without partial writes', async t => {
  const app = await setup(t);
  for (let i = 0; i < 1000; i++) fs.mkdirSync(path.join(app.root, crypto.randomUUID()));
  const countFull = await post(app.base, body());
  assert.equal(countFull.status, 409);
  assert.equal((await countFull.json()).code, 'ARCHIVE_FULL');
  assert.equal(fs.readdirSync(app.root).length, 1000);
  for (const id of fs.readdirSync(app.root)) fs.rmdirSync(path.join(app.root, id));
  const stale = path.join(app.root, `.pending-${crypto.randomUUID()}`);
  fs.mkdirSync(stale);
  const file = path.join(stale, 'photo.jpg');
  fs.writeFileSync(file, '');
  fs.truncateSync(file, 600 * 1024 * 1024);
  const bytesFull = await post(app.base, body());
  assert.equal(bytesFull.status, 507);
  assert.equal((await bytesFull.json()).code, 'STORAGE_LIMIT');
  assert.deepEqual(fs.readdirSync(app.root), [path.basename(stale)]);
  assert.deepEqual(await (await fetch(`${app.base}/boxes`)).json(), {boxes: [], total: 0});
});

test('JSON parser failures and oversized bodies stay within this router', async t => {
  const app = await setup(t);
  const bad = await fetch(`${app.base}/boxes`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{'});
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'INVALID_REQUEST');
  const oversized = await post(app.base, body({name: 'x'.repeat(1024 * 1024)}));
  assert.equal(oversized.status, 413);
  assert.ok(!(await oversized.text()).includes(app.root));
  assert.deepEqual(fs.readdirSync(app.root), []);
});

test('a failed atomic commit leaves no public or partially stored box and can be retried', async t => {
  const app = await setup(t);
  const rename = t.mock.method(fs, 'renameSync', () => { throw Object.assign(new Error('simulated commit failure'), {code: 'EIO'}); });
  try {
    const response = await post(app.base, body());
    assert.equal(response.status, 500);
    const raw = await response.text();
    assert.ok(!raw.includes(app.root));
    assert.ok(!raw.includes('deleteToken'));
    assert.deepEqual(fs.readdirSync(app.root), []);
    assert.deepEqual(await (await fetch(`${app.base}/boxes`)).json(), {boxes: [], total: 0});
  } finally { rename.mock.restore(); }
  assert.equal((await post(app.base, body())).status, 201);
});
