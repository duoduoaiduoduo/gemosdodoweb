import test from 'node:test';
import assert from 'node:assert/strict';
import {getReferenceSectionId, normalizeSectionTitle, findReadingPageIndex, findParagraphIndex} from '../src/research/referenceComparison.js';
import {graduationPublication} from '../server/graduation-publication.js';
import {reportPages as originalSections} from '../src/research/reviewDocumentData.js';
import {paginateSections} from '../server/review-pagination.js';

test('normalization strips only pagination suffixes, including repeated full/half-width variants', () => {
  assert.equal(normalizeSectionTitle('  二、创作方案与研究内容（含前期成果）（续） '), '二、创作方案与研究内容（含前期成果）');
  assert.equal(normalizeSectionTitle('三、创作初步构想、草图(图表与来源)'), '三、创作初步构想、草图');
  assert.equal(normalizeSectionTitle('三、创作初步构想、草图（ 续 )( 图表与来源 ） '), '三、创作初步构想、草图');
  assert.equal(normalizeSectionTitle('标题（尚待继续）'), '标题（尚待继续）');
  assert.equal(normalizeSectionTitle('（续）标题'), '（续）标题');
  assert.equal(normalizeSectionTitle(''), '');
  assert.equal(normalizeSectionTitle(null), '');
});

test('section matches follow meaning across actual six-part and seven-part reports', () => {
  const expectedOld = ['background', 'research', 'concept', 'methods', 'outcomes', 'references'];
  const expectedNew = ['background', 'research', 'concept', 'methods', 'outcomes', 'schedule', 'references'];
  assert.equal(originalSections.length, 6);
  assert.equal(graduationPublication.sections.length, 7);
  assert.deepEqual(originalSections.map(section => getReferenceSectionId(section.title)), expectedOld);
  assert.deepEqual(graduationPublication.sections.map(section => getReferenceSectionId(section.title)), expectedNew);
  assert.equal(getReferenceSectionId('六、参考文献'), 'references');
  assert.equal(getReferenceSectionId('七、参考文献（续）'), 'references');
  assert.equal(getReferenceSectionId('七、毕业展示工作计划进度'), 'schedule');
  assert.equal(getReferenceSectionId('第 3 部分 创作方案与研究内容（含前期创作与研究的基础与成果）'), 'research');
  assert.equal(getReferenceSectionId('4. 创作基本思路与创作方法'), 'methods');
});

test('unknown headings and prose cannot accidentally match by number or a loose keyword', () => {
  for (const title of ['一、未命名章节', '二、研究目标', '第一章 绪论', '参考文献的研究内容', '关于创作方法的补充说明', '研究背景与依据是什么？', '第六部分', '一、', '', null]) {
    assert.equal(getReferenceSectionId(title), null, String(title));
  }
});

for (const [label, sections] of [['current', graduationPublication.sections], ['original', originalSections]]) {
  test(`${label} stored-style pagination maps every continuation and source page without mutation`, () => {
    const sectionSnapshot = structuredClone(sections);
    const pages = paginateSections(sections);
    const pageSnapshot = structuredClone(pages);
    let previousSectionIndex = -1;
    for (const page of pages) {
      const id = getReferenceSectionId(page.title);
      const sectionIndex = sections.findIndex(section => getReferenceSectionId(section.title) === id);
      assert.ok(id, page.title);
      assert.ok(sectionIndex >= previousSectionIndex, page.title);
      assert.equal(normalizeSectionTitle(page.title), normalizeSectionTitle(sections[sectionIndex].title));
      previousSectionIndex = sectionIndex;
      for (const fragment of page.paragraphs) {
        const original = sections[sectionIndex].paragraphs;
        const found = findParagraphIndex(original, fragment);
        const exact = original.flatMap((paragraph, index) => paragraph.trim() === fragment.trim() ? [index] : []);
        const containing = original.flatMap((paragraph, index) => paragraph.trim().includes(fragment.trim()) ? [index] : []);
        if (exact.length === 1) assert.equal(found, exact[0]);
        else if (exact.length > 1 || containing.length !== 1) assert.equal(found, -1);
        else assert.equal(found, containing[0]);
      }
    }
    assert.deepEqual(sections, sectionSnapshot);
    assert.deepEqual(pages, pageSnapshot);
  });
}

test('reading line chooses the page under the toolbar, rather than the first visible page', () => {
  const bounds = [{top:-900,bottom:80}, {top:102,bottom:1082}, {top:1104,bottom:2084}];
  const before = structuredClone(bounds);
  assert.equal(findReadingPageIndex(bounds, 120), 1);
  assert.equal(findReadingPageIndex(bounds, 0), 0);
  assert.equal(findReadingPageIndex(bounds, 102), 1);
  assert.equal(findReadingPageIndex(bounds, 80), 0);
  assert.deepEqual(bounds, before);
});

test('page gaps choose the nearest edge, with ties preferring the upcoming page', () => {
  const bounds = [{top:0,bottom:980}, {top:1002,bottom:1982}];
  assert.equal(findReadingPageIndex(bounds, 983), 0);
  assert.equal(findReadingPageIndex(bounds, 991), 1);
  assert.equal(findReadingPageIndex(bounds, 1000), 1);
  assert.equal(findReadingPageIndex(bounds, -50), 0);
  assert.equal(findReadingPageIndex(bounds, 3000), 1);
  assert.equal(findReadingPageIndex([], 0), -1);
  assert.equal(findReadingPageIndex(bounds, NaN), -1);
  assert.equal(findReadingPageIndex([{top:1,bottom:1}, {top:2,bottom:Infinity}, {top:10,bottom:20}], 15), 2);
  assert.equal(findReadingPageIndex([{top:10,bottom:0}], 5), -1);
});

test('paragraph matching prioritizes trim-exact text and supports original long-paragraph fragments', () => {
  const paragraphs = ['前面的说明含有研究方法，但不是当前段落。', '  研究方法  ', '第一段较长的完整正文，分页只显示中间一段内容。'];
  const before = [...paragraphs];
  assert.equal(findParagraphIndex(paragraphs, '\n 研究方法 \n'), 1);
  assert.equal(findParagraphIndex(paragraphs, '分页只显示中间一段'), 2);
  assert.equal(findParagraphIndex(paragraphs, '不存在的内容'), -1);
  assert.equal(findParagraphIndex(paragraphs, '  '), -1);
  assert.equal(findParagraphIndex(paragraphs, null), -1);
  assert.deepEqual(paragraphs, before);
});

test('ambiguous duplicate paragraphs and shared fragments do not cause a misleading jump', () => {
  assert.equal(findParagraphIndex(['重复标题', '重复标题'], '重复标题'), -1);
  assert.equal(findParagraphIndex(['第一段共享内容。', '第二段共享内容。'], '共享内容'), -1);
  assert.equal(findParagraphIndex(['研究', '研究正文'], '研究正文中的另一些内容'), -1);
});
