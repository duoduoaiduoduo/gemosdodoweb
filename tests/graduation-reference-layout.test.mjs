import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGraduationReview} from '../server/graduation-review.js';
import {graduationSchedulePublication as previous} from '../server/graduation-schedule-publication.js';
import {graduationReferenceLayoutPublication as release} from '../server/graduation-reference-layout-publication.js';

const OWNER = '11111111-1111-1111-1111-111111111111';
const bibliography = sections => sections.find(section => section.sourceList && /参考文献/.test(section.title));
const referenceNumber = text => text.match(/^\s*\[(\d+)\]/)?.[1];
const textOf = pages => pages.flatMap(page => page.paragraphs).join('');
const urlsOf = links => links.map(([, url]) => url);
const oldPages = [
  {title: '原版固定首页', paragraphs: ['保留旧版的实际分页。'], pending: '', links: []},
  {title: '原版固定参考文献页', paragraphs: ['这一页已经有导师批注。'], pending: '', links: []},
];
const oldNote = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', revision: previous.revision,
  page: 1, type: 'text', x: 100, y: 220, text: '旧页上的批注不能移动。',
  createdAt: '2026-10-19T00:00:00.000Z', ownerHash: 'fixture-owner-hash',
};
function fixture() {
  const {baseRevision, ...document} = structuredClone(previous);
  return {
    documents: [{...document, createdAt: '2026-10-19T00:00:00.000Z', pages: structuredClone(oldPages)}],
    annotations: [structuredClone(oldNote)],
  };
}

async function harness(t, {data = fixture(), publication = release} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graduation-reference-layout-test-'));
  const file = path.join(dir, 'notes.json');
  fs.writeFileSync(file, JSON.stringify(data));
  const servers = [];
  t.after(async () => {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  async function start() {
    const app = express();
    app.use('/review', createGraduationReview(file, {publication}));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    return `http://127.0.0.1:${server.address().port}/review`;
  }
  const get = async (url, route = '/document') => {
    const response = await fetch(url + route);
    assert.equal(response.status, 200);
    return response.json();
  };
  const post = (url, body) => fetch(url + '/document', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
  });
  return {file, start, get, post, read: () => JSON.parse(fs.readFileSync(file, 'utf8'))};
}

function assertSingleReferenceList(document, expected) {
  const pages = document.pages.filter(page => page.title.startsWith(expected.title));
  assert.ok(pages.length > 0);
  assert.equal(textOf(pages), expected.paragraphs.join(''), 'every reference remains readable exactly once');
  assert.ok(pages.every(page => page.paragraphs.length > 0), 'there is no separate link-only bibliography');
  assert.ok(pages.every(page => !page.sourceList && !page.links.length), 'legacy source-list tail pages are absent');
  const visibleLinks = [];
  for (const page of pages) {
    for (const source of page.paragraphLinks || []) {
      assert.ok(Number.isInteger(source.index) && source.index >= 0 && source.index < page.paragraphs.length);
      const number = referenceNumber(page.paragraphs[source.index]);
      assert.ok(number, 'links attach to the numbered entry, rather than their former position');
      assert.deepEqual(source.links, expected.links.filter(([label]) => referenceNumber(label) === number));
      visibleLinks.push(...source.links);
    }
  }
  assert.deepEqual(urlsOf(visibleLinks).sort(), urlsOf(expected.links).sort(), 'all primary and supplementary URLs remain available');
}

test('the real layout release preserves 26 references and 29 URLs without changing old pages or annotations', async t => {
  const original = fixture();
  const h = await harness(t, {data: original});
  const url = await h.start();
  const {document, versions} = await h.get(url);
  assert.equal(document.revision, release.revision);
  assert.deepEqual(versions.map(version => version.revision), [previous.revision, release.revision]);
  const references = bibliography(document.sections);
  assert.equal(references.paragraphs.length, 26);
  assert.equal(references.links.length, 29);
  assert.equal(references.inlineReferenceLinks, true);
  assert.deepEqual(document.sections, release.sections);
  const withoutFlag = structuredClone(document.sections);
  delete bibliography(withoutFlag).inlineReferenceLinks;
  assert.deepEqual(withoutFlag, previous.sections, 'the release changes presentation metadata, not report content');
  assert.equal(textOf(document.pages), previous.sections.flatMap(section => section.paragraphs).join(''));
  assert.equal(document.title, previous.title);
  assert.deepEqual(document.downloads, previous.downloads);
  assert.deepEqual(document.pages.flatMap(page => page.images || []), previous.sections.flatMap(section => section.images || []));
  assert.deepEqual(document.pages.flatMap(page => page.tables || []), previous.sections.flatMap(section => section.tables || []));
  assertSingleReferenceList(document, references);
  assert.deepEqual(h.read().documents[0], original.documents[0]);
  assert.deepEqual(h.read().annotations, original.annotations);
  assert.deepEqual((await h.get(url, `/document?revision=${previous.revision}`)).document.pages, oldPages);
  const {ownerHash, ...publicNote} = oldNote;
  assert.deepEqual((await h.get(url, `/${previous.revision}`)).annotations, [publicNote]);
  const bytes = fs.readFileSync(h.file, 'utf8');
  const restarted = await h.start();
  assert.equal((await h.get(restarted)).document.revision, release.revision);
  assert.equal(fs.readFileSync(h.file, 'utf8'), bytes, 'restart does not republish or rewrite stored geometry');
});

test('advisor text edits retain inline sources by reference number and cannot inject layout or URLs', async t => {
  const h = await harness(t);
  const url = await h.start();
  const published = (await h.get(url)).document;
  const sections = structuredClone(published.sections);
  const edited = bibliography(sections);
  edited.paragraphs[0] += ' 导师核对后的书目信息。';
  [edited.paragraphs[0], edited.paragraphs[1]] = [edited.paragraphs[1], edited.paragraphs[0]];
  for (const section of sections) {
    section.inlineReferenceLinks = false;
    section.sourceList = false;
    section.links = [['[1] 伪造来源', 'javascript:alert(1)']];
    section.paragraphLinks = [{index: 0, links: [['注入来源', 'https://injected.example/']]}];
  }
  const response = await h.post(url, {
    baseRevision: published.revision, ownerKey: OWNER,
    requestId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', sections,
    paragraphLinks: [{index: 0, links: [['顶层注入', 'https://injected.example/']]}],
  });
  assert.equal(response.status, 201);
  const saved = (await response.json()).document;
  const references = bibliography(saved.sections);
  assert.deepEqual(references.paragraphs, edited.paragraphs);
  assert.equal(references.inlineReferenceLinks, true);
  assert.equal(references.sourceList, true);
  assert.deepEqual(references.links, bibliography(published.sections).links);
  assert.ok(saved.sections.every(section => !Object.hasOwn(section, 'paragraphLinks')));
  assert.ok(!JSON.stringify(saved).includes('injected.example'));
  assert.ok(!JSON.stringify(saved).includes('javascript:'));
  assertSingleReferenceList(saved, references);
  assert.deepEqual((await h.get(url, `/document?revision=${published.revision}`)).document, published);
  assert.deepEqual(h.read().annotations, fixture().annotations);
  assert.equal(textOf(saved.pages), saved.sections.flatMap(section => section.paragraphs).join(''));
});

test('ordinary POST cannot opt an old edition into the controlled inline-reference layout', async t => {
  const h = await harness(t, {publication: null});
  const url = await h.start();
  const old = (await h.get(url)).document;
  const sections = structuredClone(old.sections);
  bibliography(sections).paragraphs[0] += ' 导师文字修改。';
  sections.forEach(section => {
    section.inlineReferenceLinks = true;
    section.paragraphLinks = [{index: 0, links: [['伪造来源', 'https://injected.example/']]}];
  });
  const response = await h.post(url, {
    baseRevision: old.revision, ownerKey: OWNER,
    requestId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', sections,
  });
  assert.equal(response.status, 201);
  const saved = (await response.json()).document;
  assert.ok(saved.sections.every(section => !Object.hasOwn(section, 'inlineReferenceLinks')));
  assert.ok(saved.sections.every(section => !Object.hasOwn(section, 'paragraphLinks')));
  assert.ok(saved.pages.every(page => !page.paragraphLinks));
  assert.deepEqual(saved.pages.filter(page => page.sourceList).flatMap(page => page.links), bibliography(old.sections).links);
  assert.deepEqual((await h.get(url, `/document?revision=${old.revision}`)).document, old);
});
