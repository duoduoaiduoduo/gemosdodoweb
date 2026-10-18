const PAGE_SUFFIX = /\s*[（(]\s*(?:续|图表与来源)\s*[）)]\s*$/u;
const SECTION_NUMBER = /^(?:第\s*[〇零一二三四五六七八九十百\d]+\s*(?:章|节|部分)|[〇零一二三四五六七八九十百\d]+\s*[、.．:：])\s*/u;

/** Remove pagination suffixes without changing the original section heading.
 * @param {string} title
 * @returns {string}
 */
export function normalizeSectionTitle(title) {
  if (typeof title !== 'string') return '';
  let normalized = title.trim();
  while (PAGE_SUFFIX.test(normalized)) normalized = normalized.replace(PAGE_SUFFIX, '').trim();
  return normalized;
}

/** Match the proposal's meaning, rather than its changing section number.
 * @param {string} title
 * @returns {'background'|'research'|'concept'|'methods'|'outcomes'|'schedule'|'references'|null}
 */
export function getReferenceSectionId(title) {
  const normalized = normalizeSectionTitle(title)
    .replace(SECTION_NUMBER, '')
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/[\s、，,：:]/gu, '');

  if (/^(?:(?:本选题|本课题|选题|课题))?(?:(?:创作与|创作和)?研究的?|创作的?)?背景(?:与|和|及)依据$/u.test(normalized)) return 'background';
  if (/^(?:创作方案(?:与|和|及))?研究内容$/u.test(normalized)) return 'research';
  if (/^(?:创作)?(?:初步)?(?:构想|构思)(?:(?:与|和|及)?草图)?$/u.test(normalized)) return 'concept';
  if (/^(?:创作)?(?:基本)?思路(?:与|和|及)(?:创作|研究)?方法$/u.test(normalized) || /^(?:创作|研究)方法$/u.test(normalized)) return 'methods';
  if (/^(?:创作|研究)?重点难点(?:创新|创新点)(?:与|和|及)?预期成果$/u.test(normalized)) return 'outcomes';
  if (/^(?:毕业(?:设计|展示|创作)|研究)?(?:工作)?(?:计划(?:与)?进度|进度)(?:安排)?$/u.test(normalized) || /^(?:毕业(?:设计|展示|创作)|研究)?进度(?:及|与|和)(?:具体)?时间安排$/u.test(normalized)) return 'schedule';
  if (/^(?:主要)?参考文献(?:(?:与|和|及)资料)?$/u.test(normalized)) return 'references';
  return null;
}

/** Find the page at the reading line; in a gap, use the nearer page edge.
 * A tie prefers the upcoming page. Invalid rectangles are ignored, while
 * returned indices continue to refer to the original bounds array.
 * @param {ReadonlyArray<{top:number,bottom:number}>} bounds
 * @param {number} readingTop
 * @returns {number}
 */
export function findReadingPageIndex(bounds, readingTop) {
  if (!Array.isArray(bounds) || !Number.isFinite(readingTop)) return -1;
  let closest = -1;
  let distance = Infinity;
  let closestIsUpcoming = false;
  for (let index = 0; index < bounds.length; index++) {
    const bound = bounds[index];
    if (!bound || !Number.isFinite(bound.top) || !Number.isFinite(bound.bottom) || bound.bottom <= bound.top) continue;
    if (bound.top <= readingTop && readingTop < bound.bottom) return index;
    const upcoming = bound.top >= readingTop;
    const nextDistance = upcoming ? bound.top - readingTop : readingTop - bound.bottom;
    if (nextDistance < distance || (nextDistance === distance && upcoming && !closestIsUpcoming)) {
      closest = index;
      distance = nextDistance;
      closestIsUpcoming = upcoming;
    }
  }
  return closest;
}

/** Locate a paginated fragment in its original paragraph, without a fuzzy guess.
 * Ambiguous duplicates deliberately return -1 so the reader does not jump to
 * an unrelated occurrence. Exact matches take precedence over containment.
 * @param {ReadonlyArray<string>} paragraphs
 * @param {string} fragment
 * @returns {number}
 */
export function findParagraphIndex(paragraphs, fragment) {
  if (!Array.isArray(paragraphs) || typeof fragment !== 'string' || !fragment.trim()) return -1;
  const text = fragment.trim();
  const exact = [];
  const containing = [];
  paragraphs.forEach((paragraph, index) => {
    if (typeof paragraph !== 'string') return;
    const original = paragraph.trim();
    if (original === text) exact.push(index);
    else if (original.includes(text)) containing.push(index);
  });
  if (exact.length) return exact.length === 1 ? exact[0] : -1;
  return containing.length === 1 ? containing[0] : -1;
}
