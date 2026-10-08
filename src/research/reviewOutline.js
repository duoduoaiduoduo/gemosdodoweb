/**
 * @typedef {{id:string, title:string, level:1|2|3, pageIndex:number,
 *   paragraphIndex?:number}} ReviewOutlineEntry
 */

const CONTINUATION = /[（(]\s*续\s*[）)]\s*$/u;
const SOURCES_PAGE = /[（(]\s*图表与来源\s*[）)]\s*$/u;
const MAX_HEADING_LENGTH = 80;

function paragraphLevel(title) {
  if (Array.from(title).length > MAX_HEADING_LENGTH || /[\r\n]/u.test(title)) return null;
  if (/(?:https?:\/\/|www\.|mailto:|\[[^\]]*\]\s*\()/iu.test(title)) return null;

  // Appendix labels in older editions end in a full stop. An internal full
  // stop still distinguishes a heading followed by prose from a title alone.
  const text = title.replace(/。$/u, '');
  if (/[。！？!?；;，,]/u.test(text)) return null;

  const numeric = /^(\d+\.\d+(?:\.\d+)?)(?:\s+(.+)|([\p{L}（(].*))$/u.exec(text);
  if (numeric && /\p{L}/u.test(numeric[2] || numeric[3])) {
    return numeric[1].split('.').length === 2 ? 2 : 3;
  }
  if (/^[（(]\d+[）)]\s*\p{L}.*$/u.test(text)) return 2;
  if (/^附录\s*[A-Z]\s*[：:]\s*\p{L}.*$/iu.test(text)) return 3;
  return null;
}

/**
 * Derive anchors from the existing pages without changing their pagination.
 * Coordinates are zero-based; anchor suffixes match the one-based DOM IDs.
 *
 * @param {ReadonlyArray<{title:string, paragraphs:ReadonlyArray<string>}>} pages
 * @returns {ReviewOutlineEntry[]}
 */
export function buildReviewOutline(pages) {
  /** @type {ReviewOutlineEntry[]} */
  const outline = [];
  pages.forEach((page, pageIndex) => {
    const title = page.title.trim();
    if (SOURCES_PAGE.test(title)) return;
    if (title && !CONTINUATION.test(title)) {
      outline.push({id:`review-chapter-${pageIndex + 1}`, title, level:1, pageIndex});
    }
    page.paragraphs.forEach((paragraph, paragraphIndex) => {
      const title = paragraph.trim();
      const level = paragraphLevel(title);
      if (level === null) return;
      outline.push({
        id:`review-paragraph-${pageIndex + 1}-${paragraphIndex + 1}`,
        title, level, pageIndex, paragraphIndex,
      });
    });
  });
  return outline;
}
