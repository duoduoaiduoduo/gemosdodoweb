type RunLanguageErosionTransitionOptions = {
  durationMs: number;
  switchLanguage: () => void | Promise<void>;
};

type TextRecord = {
  node: Text;
  chars: string[];
};

type MorphRecord = {
  node: Text;
  sourceChars: string[];
  targetChars: string[];
  sourceLen: number;
  targetLen: number;
  maxLen: number;
};

const BLOCKED_PARENT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const ASCII_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}<>?/\\|~`.,:;';
const CJK_POOL =
  '\u7684\u4e00\u662f\u5728\u4e0d\u4e86\u6709\u548c\u4eba\u8fd9\u4e2d\u5927\u4e3a\u4e0a\u4e2a\u56fd\u6211\u4ee5\u8981\u4ed6\u65f6\u6765\u7528\u4eec\u751f\u5230\u4f5c\u5730\u4e8e\u51fa\u5c31\u5206\u5bf9\u6210\u4f1a\u53ef\u4e3b\u53d1\u5e74\u52a8\u540c\u5de5\u4e5f\u80fd\u4e0b\u8fc7\u5b50\u8bf4\u4ea7\u79cd\u9762\u800c\u65b9\u540e\u591a\u5b9a\u884c\u5b66\u6cd5\u6240\u6c11\u5f97\u7ecf\u5341\u4e4b\u8fdb\u7740\u7b49';
const LOW_POWER_MAX_CHARS = 700;
const DEFAULT_MAX_CHARS = 1300;
const TICK_MS = 34;

const isInViewport = (rect: DOMRect) =>
  rect.width > 0 &&
  rect.height > 0 &&
  rect.bottom > 0 &&
  rect.right > 0 &&
  rect.top < window.innerHeight &&
  rect.left < window.innerWidth;

const isWhitespace = (char: string) => /\s/.test(char);
const isCjkLike = (char: string) => /[\u3000-\u9fff]/.test(char);
const pickFrom = (pool: string) => pool[Math.floor(Math.random() * pool.length)] || '#';

const pickErosionChar = (hint: string) => {
  if (isWhitespace(hint)) return hint;
  if (isCjkLike(hint)) return pickFrom(CJK_POOL);
  return pickFrom(ASCII_POOL);
};

const nextTick = () => new Promise<void>((resolve) => window.setTimeout(resolve, TICK_MS));

const getCharBudget = () => {
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 8;
  const memory = typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8
    : 8;
  const lowPower = cores <= 4 || memory <= 4;
  return lowPower ? LOW_POWER_MAX_CHARS : DEFAULT_MAX_CHARS;
};

const collectVisibleTextRecords = (root: HTMLElement, charBudget: number): TextRecord[] => {
  const records: TextRecord[] = [];
  let usedChars = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const textNode = node as Text;
      if (!textNode.nodeValue || !textNode.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = textNode.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (BLOCKED_PARENT_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current && usedChars < charBudget) {
    const node = current as Text;
    const parent = node.parentElement;
    const raw = node.nodeValue || '';
    if (!parent || !raw.trim()) {
      current = walker.nextNode();
      continue;
    }

    const style = window.getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) {
      current = walker.nextNode();
      continue;
    }

    if (!isInViewport(parent.getBoundingClientRect())) {
      current = walker.nextNode();
      continue;
    }

    const chars = Array.from(raw);
    let localCount = 0;
    for (let i = 0; i < chars.length; i += 1) {
      if (isWhitespace(chars[i])) continue;
      localCount += 1;
    }
    if (localCount === 0) {
      current = walker.nextNode();
      continue;
    }

    if (usedChars + localCount > charBudget) {
      const remaining = Math.max(0, charBudget - usedChars);
      if (remaining === 0) break;
      const clipped: string[] = [];
      let kept = 0;
      for (let i = 0; i < chars.length; i += 1) {
        if (!isWhitespace(chars[i])) {
          if (kept >= remaining) break;
          kept += 1;
        }
        clipped.push(chars[i]);
      }
      records.push({ node, chars: clipped });
      usedChars += kept;
      break;
    }

    records.push({ node, chars });
    usedChars += localCount;
    current = walker.nextNode();
  }

  return records;
};

const buildMorphRecords = (source: TextRecord[], target: TextRecord[]): MorphRecord[] => {
  const len = Math.min(source.length, target.length);
  const output: MorphRecord[] = [];
  for (let i = 0; i < len; i += 1) {
    const sourceChars = source[i].chars;
    const targetChars = target[i].chars;
    output.push({
      node: target[i].node,
      sourceChars,
      targetChars,
      sourceLen: sourceChars.length,
      targetLen: targetChars.length,
      maxLen: Math.max(sourceChars.length, targetChars.length),
    });
  }
  return output;
};

const renderMorphAt = (records: MorphRecord[], progress: number) => {
  for (let r = 0; r < records.length; r += 1) {
    const record = records[r];
    const { sourceChars, targetChars, sourceLen, targetLen, maxLen } = record;

    const interpolatedLen = Math.round(sourceLen + (targetLen - sourceLen) * progress);
    const currentLen = Math.max(0, Math.min(maxLen, interpolatedLen));
    const out = new Array<string>(currentLen);
    const base = Math.max(1, maxLen - 1);

    for (let i = 0; i < currentLen; i += 1) {
      const sourceChar = i < sourceLen ? sourceChars[i] : '';
      const targetChar = i < targetLen ? targetChars[i] : '';
      const order = i / base;
      const scrambleStart = order * 0.54;
      const revealStart = Math.min(0.99, scrambleStart + 0.32);

      if (progress < scrambleStart) {
        if (sourceChar) {
          out[i] = sourceChar;
        } else if (targetChar) {
          out[i] = pickErosionChar(targetChar);
        } else {
          out[i] = '';
        }
        continue;
      }

      if (progress < revealStart) {
        const local = (progress - scrambleStart) / Math.max(0.001, revealStart - scrambleStart);
        const hintChar = targetChar || sourceChar || 'A';
        out[i] = local > 0.72 && targetChar ? targetChar : pickErosionChar(hintChar);
        continue;
      }

      if (targetChar) {
        out[i] = targetChar;
      } else if (sourceChar) {
        out[i] = pickErosionChar(sourceChar);
      } else {
        out[i] = '';
      }
    }

    record.node.nodeValue = out.join('');
  }
};

const setFinalTarget = (records: MorphRecord[]) => {
  for (let i = 0; i < records.length; i += 1) {
    records[i].node.nodeValue = records[i].targetChars.join('');
  }
};

const runMorphAnimation = async (records: MorphRecord[], durationMs: number) => {
  const startedAt = performance.now();
  while (true) {
    const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
    renderMorphAt(records, progress);
    if (progress >= 1) break;
    await nextTick();
  }
};

export async function runLanguageErosionTransition({
  durationMs,
  switchLanguage,
}: RunLanguageErosionTransitionOptions): Promise<void> {
  const root = document.getElementById('root');
  const prefersReducedMotion = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  let switched = false;
  const safeSwitchLanguage = async () => {
    if (switched) return;
    switched = true;
    await Promise.resolve(switchLanguage());
  };

  if (!root || prefersReducedMotion) {
    await safeSwitchLanguage();
    return;
  }

  const budget = getCharBudget();
  const sourceRecords = collectVisibleTextRecords(root, budget);
  if (sourceRecords.length === 0) {
    await safeSwitchLanguage();
    return;
  }

  let visualBoostOn = false;
  const setVisualBoost = (active: boolean) => {
    if (visualBoostOn === active) return;
    visualBoostOn = active;
    window.dispatchEvent(new CustomEvent('lang-transition-visual', { detail: { active } }));
  };

  try {
    setVisualBoost(true);
    await safeSwitchLanguage();
    const targetRecords = collectVisibleTextRecords(root, budget);
    if (targetRecords.length === 0) return;

    const morphRecords = buildMorphRecords(sourceRecords, targetRecords);
    if (morphRecords.length === 0) return;

    // First paint of animation starts from source form length/state, not translated full text.
    renderMorphAt(morphRecords, 0);
    await runMorphAnimation(morphRecords, durationMs);
    setFinalTarget(morphRecords);
  } catch {
    await safeSwitchLanguage();
  } finally {
    setVisualBoost(false);
  }
}
