export type LayoutMode = 'phone' | 'desktop';
const PHONE_BREAKPOINT = 768;

function matchMediaSafe(query: string): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

function getViewportCssWidth(): number {
  const rootWidth = document.documentElement?.clientWidth || 0;
  const innerWidth = window.innerWidth || 0;
  const visualWidth = window.visualViewport?.width || 0;
  const rawScreenWidth = window.screen?.width || 0;
  const rawScreenHeight = window.screen?.height || 0;
  const dpr = window.devicePixelRatio || 1;

  const physicalMin = Math.min(
    rawScreenWidth > 0 ? rawScreenWidth : Number.POSITIVE_INFINITY,
    rawScreenHeight > 0 ? rawScreenHeight : Number.POSITIVE_INFINITY,
  );
  const normalizedScreenWidth =
    Number.isFinite(physicalMin) && physicalMin > 0
      ? (physicalMin > 1400 && dpr > 1 ? physicalMin / dpr : physicalMin)
      : 0;

  const candidates = [rootWidth, visualWidth, innerWidth, normalizedScreenWidth]
    .filter((n) => Number.isFinite(n) && n > 0);
  if (candidates.length === 0) return 1024;
  return Math.min(...candidates);
}

export function hasTouchCapability(): boolean {
  const maxTouchPoints = Number((navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints || 0);
  if (maxTouchPoints > 0) return true;
  if ('ontouchstart' in window) return true;
  if (matchMediaSafe('(pointer: coarse)')) return true;
  return false;
}

export function detectLayoutMode(): LayoutMode {
  const width = getViewportCssWidth();
  if (width <= PHONE_BREAKPOINT) return 'phone';
  return 'desktop';
}

export function isDesktopGrassAllowed(layoutMode: LayoutMode): boolean {
  if (layoutMode !== 'desktop') return false;
  if (hasTouchCapability()) return false;
  return matchMediaSafe('(hover: hover)');
}
