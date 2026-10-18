import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGraduationReview} from '../server/graduation-review.js';
import {
  bibliographyBaseDocument,
  orderProposalBibliography,
  bibliographyAudit,
  graduationBibliographyPublication,
} from '../server/graduation-bibliography-publication.js';

const base = bibliographyBaseDocument;
const release = graduationBibliographyPublication;
const bibliography = sections => sections.find(section => section.sourceList && /参考文献/.test(section.title));
const body = sections => sections.filter(section => section !== bibliography(sections));
const citations = sections => body(sections).flatMap(section => section.paragraphs.flatMap(
  paragraph => [...paragraph.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1])),
));
const unique = values => [...new Set(values)];
const withoutCitations = paragraph => paragraph.replace(/\[\d+\]/g, '');

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test('bibliography ordering preserves all body text and report metadata without mutating v50', () => {
  const original = structuredClone(base);
  const input = freezeDeep(structuredClone(base.sections));
  const ordered = orderProposalBibliography(input);
  assert.deepEqual(input, original.sections);
  assert.notStrictEqual(ordered.sections, input);
  assert.deepEqual(bibliographyAudit.order, ordered.order);
  assert.deepEqual(bibliographyAudit.unused, ordered.unused);
  assert.deepEqual(release.sections, bibliographyAudit.sections);

  assert.equal(release.sections.length, base.sections.length);
  release.sections.forEach((section, index) => {
    const previous = base.sections[index];
    const {paragraphs, links, ...metadata} = section;
    const {paragraphs: oldParagraphs, links: oldLinks, ...oldMetadata} = previous;
    assert.deepEqual(metadata, oldMetadata, `section ${index}: layout, figures and tables survive`);
    if (section !== bibliography(release.sections)) {
      assert.deepEqual(paragraphs.map(withoutCitations), oldParagraphs.map(withoutCitations));
      assert.deepEqual(links, oldLinks);
    }
  });
  const {revision, label, createdAt, sections, ...baseMetadata} = base;
  const {
    revision: newRevision, label: newLabel, createdAt: newCreatedAt,
    baseRevision, sections: newSections, ...releaseMetadata
  } = release;
  assert.deepEqual(releaseMetadata, baseMetadata, 'title, outline format and downloads survive');
  assert.equal(baseRevision, '7f915d33-569a-4496-afc3-0e9e190a7075');
  assert.equal(newRevision, 'proposal-2026-10-19-bibliography-v1');
  assert.deepEqual(base, original);
});

test('first citations run from 1 to 27 with all 30 existing links grouped by cited entry', () => {
  const references = bibliography(release.sections);
  const oldReferences = bibliography(base.sections);
  const oldFirstCitations = unique(citations(base.sections));
  const newFirstCitations = unique(citations(release.sections));
  assert.deepEqual(bibliographyAudit.order, oldFirstCitations);
  assert.deepEqual(newFirstCitations, Array.from({length: 27}, (_, index) => index + 1));
  assert.equal(references.paragraphs.length, 27);
  assert.equal(references.links.length, 30);
  const oldLinks = new Map();
  for (const [label, url] of oldReferences.links) {
    const oldNumber = Number(label.match(/^\[(\d+)\]/)[1]);
    if (!oldLinks.has(oldNumber)) oldLinks.set(oldNumber, []);
    oldLinks.get(oldNumber).push([label, url]);
  }
  const expectedLinks = [];
  references.paragraphs.forEach((paragraph, index) => {
    const number = index + 1;
    assert.match(paragraph, new RegExp(`^\\[${number}\\] `));
    assert.ok(newFirstCitations.includes(number), `reference ${number} is cited in the body`);
    const sourceLinks = oldLinks.get(oldFirstCitations[index]);
    expectedLinks.push(...sourceLinks.map(([label, url], linkIndex) => [
      linkIndex === 0 ? paragraph : label.replace(/^\[\d+\]/, `[${number}]`), url,
    ]));
  });
  assert.deepEqual(references.links, expectedLinks, 'each main entry keeps its original URLs and adjacent supplementary links');
  assert.equal(new Set(references.links.map(([, url]) => url)).size, 30);
  assert.deepEqual(references.links.filter(([label]) => /原始作品|开发机构的功能与生活建议说明|项目与设计原则/.test(label)), [
    ['[9] PFAS StoryMap · 原始作品', 'https://storymaps.arcgis.com/stories/dc9f7d19d293402ba1c98570bedbcc37'],
    ['[10] Detox Me · 开发机构的功能与生活建议说明', 'https://silentspring.org/resources/tips-healthier-living'],
    ['[12] PhET · 项目与设计原则', 'https://phet.colorado.edu/en/about'],
  ]);

  const unused = oldReferences.paragraphs.map(paragraph => Number(paragraph.match(/^\[(\d+)\]/)[1]))
    .filter(number => !oldFirstCitations.includes(number));
  assert.deepEqual(unused, [2, 4, 5, 7, 10, 11, 12, 14]);
  assert.deepEqual(bibliographyAudit.unused, unused);
});

test('verified date, author and title corrections follow their sources after renumbering', () => {
  const references = bibliography(release.sections);
  const entry = oldNumber => references.paragraphs[bibliographyAudit.order.indexOf(oldNumber)];
  assert.match(entry(16), /^\[3\] .*关于新时代进一步加强科学技术普及工作的意见.*\(2022-09-05\)/);
  assert.doesNotMatch(entry(16), /2022-09-04/);
  assert.match(entry(6), /^\[\d+\] MAES T, BERGLIHN E, VAN DOORN E, et al\. PFAS – our intimate relation with these forever chemicals\[EB\/OL\]\. GRID-Arendal,/);
  assert.match(entry(30), /^\[\d+\] 孙亚慧\. 绿洲课堂点亮边疆童心\[EB\/OL\]\. 中国科学技术协会,/);
  assert.match(entry(1), /国务院办公厅\. 国务院办公厅关于印发新污染物治理行动方案的通知/);
  assert.match(entry(18), /国务院\. 国务院关于印发全民科学素质行动规划纲要/);
  assert.match(entry(17), /中华人民共和国科学技术普及法（2024年修订）/);
  assert.match(bibliography(base.sections).paragraphs[15], /2022-09-04/);
  assert.match(bibliography(base.sections).paragraphs[5], /^\[6\] GRID-ARENDAL\./);
  assert.match(bibliography(base.sections).paragraphs[29], /^\[30\] 中国科学技术协会\./);
});

// Intentionally unlike current pagination: these page coordinates already own a note.
const oldPages = [
  {title: 'v50 固定首页', paragraphs: ['原版首页。'], pending: '', links: []},
  {title: 'v50 固定尾页', paragraphs: ['原版参考文献页。'], pending: '', links: []},
];
const oldNote = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', revision: base.revision,
  page: 1, type: 'text', x: 100, y: 220, text: '请核对这一页的引用。',
  createdAt: '2026-10-18T18:00:00.000Z', ownerHash: 'fixture-owner-hash',
};
const fixture = () => ({
  documents: [{...structuredClone(base), pages: structuredClone(oldPages)}],
  annotations: [structuredClone(oldNote)],
});

async function harness(t, data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graduation-bibliography-test-'));
  const file = path.join(dir, 'notes.json');
  fs.writeFileSync(file, JSON.stringify(data));
  const servers = [];
  t.after(async () => {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  async function start() {
    const app = express();
    app.use('/review', createGraduationReview(file, {publication: release}));
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
  return {file, start, get, read: () => JSON.parse(fs.readFileSync(file, 'utf8'))};
}

test('the actual bibliography release appends once and retains v50 pages and annotations on restart', async t => {
  const original = fixture();
  const h = await harness(t, original);
  const url = await h.start();
  const published = await h.get(url);
  assert.equal(published.document.revision, release.revision);
  assert.deepEqual(published.versions.map(version => version.revision), [base.revision, release.revision]);
  assert.deepEqual(published.document.sections, release.sections);
  assert.equal(published.document.title, base.title);
  assert.deepEqual(published.document.downloads, base.downloads);
  assert.deepEqual(published.document.pages.flatMap(page => page.images || []), base.sections.flatMap(section => section.images || []));
  assert.deepEqual(published.document.pages.flatMap(page => page.tables || []), base.sections.flatMap(section => section.tables || []));
  assert.deepEqual(published.document.pages.filter(page => page.sourceList).flatMap(page => page.links || []), bibliography(release.sections).links);
  assert.deepEqual(h.read().documents[0], original.documents[0]);
  assert.deepEqual(h.read().annotations, original.annotations);
  assert.equal(fs.readFileSync(`${h.file}.before-${release.revision}`, 'utf8'), JSON.stringify(original));
  assert.deepEqual((await h.get(url, `/document?revision=${base.revision}`)).document, original.documents[0]);
  const {ownerHash, ...publicNote} = oldNote;
  assert.deepEqual((await h.get(url, `/${base.revision}`)).annotations, [publicNote]);
  assert.deepEqual((await h.get(url, `/${release.revision}`)).annotations, []);

  const bytes = fs.readFileSync(h.file, 'utf8');
  const restarted = await h.start();
  assert.equal((await h.get(restarted)).document.revision, release.revision);
  assert.equal(h.read().documents.length, 2);
  assert.equal(fs.readFileSync(h.file, 'utf8'), bytes);
  assert.deepEqual((await h.get(restarted, `/document?revision=${base.revision}`)).document.pages, oldPages);
  assert.deepEqual((await h.get(restarted, `/${base.revision}`)).annotations, [publicNote]);
});

test('a newer advisor revision prevents the bibliography publication from changing stored data', async t => {
  const original = fixture();
  const newer = {
    ...structuredClone(original.documents[0]),
    revision: 'advisor-edited-after-v50', label: '导师后续修改', title: '导师保存的新题目',
  };
  original.documents.push(newer);
  const h = await harness(t, original);
  const bytes = fs.readFileSync(h.file, 'utf8');
  const url = await h.start();
  const result = await h.get(url);
  assert.deepEqual(result.document, newer);
  assert.deepEqual(result.versions.map(version => version.revision), [base.revision, newer.revision]);
  assert.equal(fs.readFileSync(h.file, 'utf8'), bytes);
  assert.equal(fs.existsSync(`${h.file}.before-${release.revision}`), false);
});
