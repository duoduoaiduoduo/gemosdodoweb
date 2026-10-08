import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReviewOutline} from '../src/research/reviewOutline.js';
import {paginateSections} from '../server/review-pagination.js';
import {thesisInitialDocument} from '../server/thesis-document.js';
import {thesisPublication} from '../server/thesis-publication.js';
import {thesisLiteraturePublication} from '../server/thesis-literature-publication.js';

const numericHeadings = document => document.sections.flatMap(section =>
  section.paragraphs.filter(paragraph => /^\d+\.\d+(?:\.\d+)?\s/u.test(paragraph)));

test('real v3 pagination yields the complete outline in document order without changing pages', () => {
  const pages = paginateSections(thesisLiteraturePublication.sections);
  const before = structuredClone(pages);
  const expected = numericHeadings(thesisLiteraturePublication);
  const outline = buildReviewOutline(pages);
  const numeric = outline.filter(entry => /^\d+\.\d+/u.test(entry.title));

  assert.equal(pages.length, 34);
  assert.equal(expected.length, 83);
  assert.deepEqual(numeric.map(entry => entry.title), expected);
  assert.equal(outline.length, 98, '6 chapters/sections, 83 numeric, 3 short labels, 6 appendices');
  assert.deepEqual(outline.filter(entry => entry.level === 1).map(entry => entry.title),
    thesisLiteraturePublication.sections.map(section => section.title));
  assert.deepEqual(outline.filter(entry => /^（\d+）/u.test(entry.title)).map(entry => entry.title),
    ['（1）中文摘要与英文摘要', '（2）参考文献', '（3）附录']);
  assert.deepEqual(outline.filter(entry => /^附录[A-F]：/u.test(entry.title)).map(entry => entry.title),
    thesisLiteraturePublication.sections.at(-1).paragraphs.filter(paragraph => /^附录[A-F]：/u.test(paragraph)));
  assert.equal(numeric.filter(entry => pages[entry.pageIndex].title.endsWith('（续）')).length, 41);
  for (const entry of outline) {
    if (entry.paragraphIndex === undefined) {
      assert.equal(entry.id, `review-chapter-${entry.pageIndex + 1}`);
      assert.equal(pages[entry.pageIndex].title, entry.title);
    } else {
      assert.equal(entry.id, `review-paragraph-${entry.pageIndex + 1}-${entry.paragraphIndex + 1}`);
      assert.equal(pages[entry.pageIndex].paragraphs[entry.paragraphIndex], entry.title);
    }
  }
  assert.deepEqual(pages, before);
  assert.deepEqual(buildReviewOutline(pages), outline);
});

for (const document of [thesisInitialDocument, thesisPublication]) {
  test(`${document.label} also derives its own headings without content-specific rules`, () => {
    const pages = paginateSections(document.sections);
    const outline = buildReviewOutline(pages);
    assert.deepEqual(outline.filter(entry => /^\d+\.\d+/u.test(entry.title)).map(entry => entry.title),
      numericHeadings(document));
    assert.deepEqual(outline.filter(entry => entry.level === 1).map(entry => entry.title),
      document.sections.map(section => section.title));
    assert.equal(outline.filter(entry => /^附录[A-F]：/u.test(entry.title)).length, 6);
  });
}

test('continuations keep new paragraph anchors while source pages add no repeated headings', () => {
  const pages = [
    {title:'第一章 绪论', paragraphs:['1.1 研究背景', '普通正文。', '1.1.1 现实需求']},
    {title:'第一章 绪论（续）', paragraphs:['1.2 创作现状', '（1）中文摘要']},
    {title:'第一章 绪论（图表与来源）', paragraphs:['1.1 研究背景']},
    {title:'后记', paragraphs:['附录A：访谈材料。']},
    {title:'后记(续)', paragraphs:['（2）英文摘要']},
    {title:'后记(图表与来源)', paragraphs:['1.2 创作现状']},
  ];
  assert.deepEqual(buildReviewOutline(pages), [
    {id:'review-chapter-1', title:'第一章 绪论', level:1, pageIndex:0},
    {id:'review-paragraph-1-1', title:'1.1 研究背景', level:2, pageIndex:0, paragraphIndex:0},
    {id:'review-paragraph-1-3', title:'1.1.1 现实需求', level:3, pageIndex:0, paragraphIndex:2},
    {id:'review-paragraph-2-1', title:'1.2 创作现状', level:2, pageIndex:1, paragraphIndex:0},
    {id:'review-paragraph-2-2', title:'（1）中文摘要', level:2, pageIndex:1, paragraphIndex:1},
    {id:'review-chapter-4', title:'后记', level:1, pageIndex:3},
    {id:'review-paragraph-4-1', title:'附录A：访谈材料。', level:3, pageIndex:3, paragraphIndex:0},
    {id:'review-paragraph-5-1', title:'（2）英文摘要', level:2, pageIndex:4, paragraphIndex:0},
  ]);
});

test('sentence paragraphs, references, links and long or split prose are not headings', () => {
  const paragraphs = [
    '（1）知识的公众说明。美国环境保护署将基础认识和行动信息连接起来。',
    '（2）数字表达与交互形式。地图与游戏分别承担不同的信息任务。',
    '1.1 一个说明，后面继续描述具体研究内容。',
    '1.1.1 这是正文；它解释科学材料的条件',
    '（3）为什么需要参与？这里提供说明',
    '[1] 作者. 参考文献题名[J]. 2026.',
    '1. 普通编号说明',
    '1.1.1.1 超出三级的编号',
    'https://example.org/source',
    '1.1 资料 https://example.org/source',
    '1.1 [资料](../source)',
    '附录A：访谈材料。后面继续介绍研究过程。',
    '（1）多行标题\n这里其实有正文',
    `1.1 ${'这段没有句子标点但它是很长的正文'.repeat(20)}`,
    '没有编号的普通正文',
  ];
  const pages = paginateSections([{title:'第一章', paragraphs, pending:'', links:[]}]);
  assert.deepEqual(buildReviewOutline(pages), [
    {id:'review-chapter-1', title:'第一章', level:1, pageIndex:0},
  ]);
});

test('title punctuation, edited numbering and coordinates are preserved without mutating input', () => {
  const paragraphs = Object.freeze([' 12.3 内容：来源、范围与条件 ', '12.3.4方法与评价（待完善）', '12.4 3D模型', '（1）序', '附录Z: Supplemental materials。']);
  const pages = Object.freeze([Object.freeze({title:'其他章节', paragraphs})]);
  const outline = buildReviewOutline(pages);
  assert.deepEqual(outline.map(entry => [entry.title, entry.level]), [
    ['其他章节', 1], ['12.3 内容：来源、范围与条件', 2],
    ['12.3.4方法与评价（待完善）', 3], ['12.4 3D模型', 2], ['（1）序', 2], ['附录Z: Supplemental materials。', 3],
  ]);
  assert.equal(outline.at(-1).paragraphIndex, 4);
  assert.equal(paragraphs[0], ' 12.3 内容：来源、范围与条件 ');
  assert.deepEqual(buildReviewOutline([]), []);
});
