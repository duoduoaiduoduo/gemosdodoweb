import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateSections} from '../server/review-pagination.js';

const section = (paragraphs, overrides={}) => ({title:'研究内容', paragraphs, pending:'', links:[], ...overrides});
const textOf = pages => pages.flatMap(page => page.paragraphs).join('');
const continuations = page => page.continuationParagraphs || [];

// Match the documented conservative layout budget, independently of the
// paginator's choice of paragraph boundaries or fragment lengths.
function lineCount(text) {
  let count=1, width=0;
  for (const character of text) {
    if (character==='\n') {count++; width=0; continue;}
    const units=character.charCodeAt(0)>255 ? 2 : 1;
    if (width+units>68) {count++; width=0;}
    width+=units;
  }
  return count;
}

function assertPageBudgets(pages) {
  pages.forEach((page, index) => {
    const contentHeight=page.paragraphs.reduce((height, text) => height+lineCount(text)*32+18, 0);
    assert.ok(contentHeight<=(index===0 ? 500 : 690), `page ${index+1} exceeds its text budget: ${contentHeight}`);
  });
}

test('a normal paragraph longer than 240 characters stays one paragraph', () => {
  const paragraph='这是一段需要连续阅读的科普研究内容。'.repeat(16);
  assert.ok(Array.from(paragraph).length>240);
  const pages=paginateSections([section([paragraph])]);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].paragraphs, [paragraph]);
  assert.deepEqual(continuations(pages[0]), []);
  assertPageBudgets(pages);
});

test('a whole paragraph moves to the next page rather than filling a previous page with a fragment', () => {
  const paragraphs=['甲'.repeat(150), '乙'.repeat(150), '丙'.repeat(150)];
  const input=section(paragraphs);
  const before=structuredClone(input);
  const pages=paginateSections([input]);
  assert.deepEqual(pages.map(page => page.paragraphs), [paragraphs.slice(0,2), paragraphs.slice(2)]);
  assert.ok(pages.every(page => continuations(page).length===0));
  assert.equal(textOf(pages), paragraphs.join(''));
  assert.deepEqual(input, before, 'pagination must not mutate the source sections');
  assertPageBudgets(pages);
});

test('separate source paragraphs remain separate even when their text could fit together', () => {
  const paragraphs=['第一段。'.repeat(20), '第二段。'.repeat(20)];
  const pages=paginateSections([section(paragraphs)]);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].paragraphs, paragraphs);
  assert.deepEqual(continuations(pages[0]), []);
});

test('an absent pending note or source footer cannot create an empty tail page', () => {
  const paragraph='尾'.repeat(476);
  const pages=paginateSections([section([paragraph])]);
  assert.equal(lineCount(paragraph)*32+18, 466);
  assert.equal(pages.length, 1, 'the remaining 34 units do not need to reserve an empty footer');
  assert.deepEqual(pages[0].paragraphs, [paragraph]);
  assertPageBudgets(pages);
});

test('genuinely long paragraphs split only across pages and preserve mixed Unicode text exactly', () => {
  const longParagraph='新污染物🌿与日常生活🌊，PFAS与风险条件。\n'.repeat(75);
  const lastParagraph='这是另一个真实段落，保留自己的首行缩进。';
  const pages=paginateSections([section([longParagraph,lastParagraph])]);
  const fragments=[];
  pages.forEach((page, pageIndex) => {
    const indices=continuations(page);
    assert.ok(indices.every(index => Number.isInteger(index) && index>=0 && index<page.paragraphs.length));
    const paragraphFragments=page.paragraphs.filter(text => text!==lastParagraph);
    assert.ok(paragraphFragments.length<=1, 'one source paragraph cannot be split into multiple p elements on the same page');
    paragraphFragments.forEach(fragment => {
      const paragraphIndex=page.paragraphs.indexOf(fragment);
      if (fragments.length===0) {
        assert.ok(!indices.includes(paragraphIndex), 'the first fragment starts a real paragraph');
      } else {
        assert.equal(paragraphIndex, 0, 'a continuation starts at the top of a new page');
        assert.ok(indices.includes(paragraphIndex), `page ${pageIndex+1} must mark its continued paragraph`);
      }
      fragments.push(fragment);
    });
    if (page.paragraphs.includes(lastParagraph)) {
      assert.ok(!indices.includes(page.paragraphs.indexOf(lastParagraph)), 'a subsequent source paragraph must not inherit continuation formatting');
    }
  });
  assert.ok(fragments.length>2);
  assert.equal(fragments.join(''), longParagraph);
  assert.equal(textOf(pages), longParagraph+lastParagraph);
  assert.ok(pages.every(page => page.paragraphs.length>0), 'empty pending text must not create a blank page');
  assertPageBudgets(pages);
});

test('a paragraph exceeding the 500-unit cover budget neither overflows nor leaves an empty cover page', () => {
  const paragraph='封'.repeat(560);
  const pages=paginateSections([section([paragraph])]);
  assert.ok(lineCount(paragraph)*32+18>500);
  assert.ok(lineCount(paragraph)*32+18<=690);
  assert.ok(pages.length>=2);
  assert.ok(pages.every(page => page.paragraphs.length>0));
  assert.equal(textOf(pages), paragraph);
  assert.deepEqual(continuations(pages[0]), []);
  pages.slice(1).forEach(page => assert.deepEqual(continuations(page), [0]));
  assertPageBudgets(pages);
});

test('a heading group fitting a regular page can span the shorter cover without orphaning its headings', () => {
  const headings=['2.1 研究内容', '（1）公众理解'];
  const paragraph='文'.repeat(476);
  const paragraphs=[...headings,paragraph];
  const groupHeight=paragraphs.reduce((height,text) => height+lineCount(text)*32+18, 0);
  assert.ok(groupHeight>500 && groupHeight<=690);
  const pages=paginateSections([section(paragraphs)]);
  assert.deepEqual(pages[0].paragraphs.slice(0,2), headings);
  assert.ok(pages[0].paragraphs[2], 'the shorter cover must retain body text after its headings');
  assert.ok(lineCount(pages[0].paragraphs[2])>=2);
  assert.ok(pages.every(page => page.paragraphs.length>0));
  assert.deepEqual(continuations(pages[0]), []);
  pages.slice(1).forEach(page => assert.deepEqual(continuations(page), [0]));
  assert.equal(textOf(pages), paragraphs.join(''));
  assertPageBudgets(pages);
});

test('empty source strings are skipped instead of becoming empty paragraph elements', () => {
  const heading='2.1 研究内容';
  const paragraph='文'.repeat(80);
  const input=section(['',heading,'',paragraph,'']);
  const before=structuredClone(input);
  const pages=paginateSections([input]);
  assert.deepEqual(pages.flatMap(page => page.paragraphs), [heading,paragraph]);
  assert.ok(pages.every(page => page.paragraphs.every(text => text.length>0)));
  assert.deepEqual(input, before);
  assertPageBudgets(pages);
});

test('headings stay with the following complete paragraph by default, including nested headings', () => {
  const preceding=['甲'.repeat(120), '乙'.repeat(120), '丙'.repeat(120)];
  const group=['2.1 研究内容', '（1）公众理解', '文'.repeat(80)];
  const paragraphs=[...preceding,...group];
  const pages=paginateSections([section(paragraphs)]);
  assert.deepEqual(pages[0].paragraphs, preceding);
  assert.deepEqual(pages[1].paragraphs, group);
  assert.equal(textOf(pages), paragraphs.join(''));
  assert.ok(pages.every(page => continuations(page).length===0));
  assertPageBudgets(pages);
});

test('an explicit heading opt-out retains the independent heading placement', () => {
  const preceding=['甲'.repeat(120), '乙'.repeat(120), '丙'.repeat(120)];
  const heading='2.1 研究内容';
  const paragraph='文'.repeat(80);
  const pages=paginateSections([section([...preceding,heading,paragraph], {keepHeadingsWithNext:false})]);
  assert.deepEqual(pages[0].paragraphs, [...preceding,heading]);
  assert.deepEqual(pages[1].paragraphs, [paragraph]);
  assertPageBudgets(pages);
});

test('headings followed by a paragraph longer than a page retain at least two lines of its text', () => {
  const preceding=['甲'.repeat(120), '乙'.repeat(120), '丙'.repeat(120)];
  const headings=['2.1 研究内容', '（1）公众理解'];
  const longParagraph='研究公众理解的条件及其生活关联。'.repeat(100);
  const paragraphs=[...preceding,...headings,longParagraph];
  const pages=paginateSections([section(paragraphs)]);
  assert.deepEqual(pages[0].paragraphs, preceding);
  const headingPage=pages.find(page => page.paragraphs.includes(headings[0]));
  assert.ok(headingPage);
  assert.deepEqual(headingPage.paragraphs.slice(0,2), headings);
  assert.ok(headingPage.paragraphs[2], 'a heading group must not be orphaned from its body');
  assert.ok(lineCount(headingPage.paragraphs[2])>=2);
  assert.ok(!continuations(headingPage).includes(2), 'the paragraph begins after the headings');
  const continuationPages=pages.filter(page => continuations(page).length>0);
  assert.ok(continuationPages.length>0);
  assert.ok(continuationPages.every(page => continuations(page).every(index => index===0)));
  assert.equal(textOf(pages), paragraphs.join(''));
  assertPageBudgets(pages);
});
