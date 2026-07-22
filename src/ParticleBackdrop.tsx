import { useEffect, useRef } from 'react';

type VisualMode = 'base' | 'lang' | 'work';
type RGB = [number, number, number];

type VisualProfile = {
  count: number;
  speed: number;
  size: number;
  alpha: number;
  riverBlend: number;
  riverWidth: number;
  camera: number;
  curveAmp: number;
  turbulence: number;
};

type Particle = {
  x: number;
  yBase: number;
  lane: number;
  depth: number;
  speed: number;
  size: number;
  alpha: number;
  phase: number;
  wiggle: number;
  paletteIndex: number;
  presence: number;
  retiring: boolean;
};

type RuntimeParams = VisualProfile & {
  opacity: number;
};

const WORK_VISUAL_EVENT = 'work-visual-state';
const LANG_VISUAL_EVENT = 'lang-transition-visual';
const TAU = Math.PI * 2;
const PALETTE_SIZE = 6;
const POINTER_REPEL_RADIUS = 210;
const POINTER_REPEL_STRENGTH = 18;

const VISUAL_PROFILES: Record<VisualMode, VisualProfile> = {
  base: {
    count: 110,
    speed: 0.032,
    size: 1.04,
    alpha: 0.24,
    riverBlend: 0.12,
    riverWidth: 0.42,
    camera: 0.22,
    curveAmp: 0.08,
    turbulence: 0.08,
  },
  lang: {
    count: 250,
    speed: 0.075,
    size: 1.62,
    alpha: 0.56,
    riverBlend: 0.9,
    riverWidth: 0.28,
    camera: 0.46,
    curveAmp: 0.26,
    turbulence: 0.22,
  },
  work: {
    count: 460,
    speed: 0.046,
    size: 2.25,
    alpha: 0.74,
    riverBlend: 0.98,
    riverWidth: 0.14,
    camera: 0.92,
    curveAmp: 0.14,
    turbulence: 0.1,
  },
};

const BASE_PALETTE = ['#6b7280', '#94a3b8', '#7f8aa3', '#8ca2a8', '#a5b0bd', '#7e8897'];
const LANG_PALETTE = ['#8ea2bc', '#9cb4cc', '#b4ccda', '#90aab5', '#9ea7bf', '#7f8fa7'];
const WORK_FALLBACK_PALETTE = ['#6fb9df', '#e58fb0', '#8ecfa4', '#d4a36a', '#7da9f5', '#b794e8'];

const hexToRgb = (hex: string): RGB => {
  const clean = hex.trim().replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((s) => s + s).join('') : clean.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [127, 127, 127];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const palettesToRgb = (palette: string[]): RGB[] => palette.map(hexToRgb);

const BASE_PALETTE_RGB = palettesToRgb(BASE_PALETTE);
const LANG_PALETTE_RGB = palettesToRgb(LANG_PALETTE);
const WORK_FALLBACK_PALETTE_RGB = palettesToRgb(WORK_FALLBACK_PALETTE);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const expEase = (current: number, target: number, dt: number, strength: number) =>
  current + (target - current) * (1 - Math.exp(-strength * dt));

const colorDistance = (a: RGB, b: RGB) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const normalizePalette = (input: RGB[], minLen = 3, targetLen = PALETTE_SIZE): RGB[] => {
  const source = input.length >= minLen ? input.slice() : WORK_FALLBACK_PALETTE_RGB.slice();
  const out: RGB[] = [];
  for (let i = 0; i < targetLen; i += 1) {
    const c = source[i % source.length];
    out.push([c[0], c[1], c[2]]);
  }
  return out;
};

const extractPaletteFromImage = async (imageUrl: string): Promise<RGB[] | null> => {
  const url = String(imageUrl || '').trim();
  if (!url) return null;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 56;
  canvas.height = 56;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    // Cross-origin image without CORS headers can taint canvas.
    return null;
  }

  const buckets = new Map<string, { rgb: RGB; score: number }>();
  const step = 4;
  const q = 32;

  for (let i = 0; i < data.length; i += step * 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 120) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (luma < 0.06 || luma > 0.95) continue;

    const qr = Math.round(r / q) * q;
    const qg = Math.round(g / q) * q;
    const qb = Math.round(b / q) * q;
    const rgb: RGB = [clamp(qr, 0, 255), clamp(qg, 0, 255), clamp(qb, 0, 255)];
    const key = `${rgb[0]}-${rgb[1]}-${rgb[2]}`;
    const weight = 1 + sat * 2.2 + Math.abs(0.5 - luma) * 0.25;
    const prev = buckets.get(key);
    if (prev) {
      prev.score += weight;
    } else {
      buckets.set(key, { rgb, score: weight });
    }
  }

  const ranked = Array.from(buckets.values())
    .sort((a, b) => b.score - a.score)
    .map((item) => item.rgb);

  if (ranked.length === 0) return null;

  const picked: RGB[] = [];
  for (let i = 0; i < ranked.length; i += 1) {
    const color = ranked[i];
    if (!picked.some((candidate) => colorDistance(candidate, color) < 42)) {
      picked.push(color);
    }
    if (picked.length >= PALETTE_SIZE) break;
  }

  return picked.length > 0 ? picked : null;
};

const createParticle = (): Particle => ({
  x: Math.random() * 1.2 - 0.1,
  yBase: Math.random(),
  lane: Math.random() * 2 - 1,
  depth: Math.random(),
  speed: 0.65 + Math.random() * 0.95,
  size: 0.76 + Math.random() * 1.34,
  alpha: 0.58 + Math.random() * 0.62,
  phase: Math.random() * TAU,
  wiggle: 0.3 + Math.random() * 0.9,
  paletteIndex: Math.floor(Math.random() * PALETTE_SIZE),
  presence: 0,
  retiring: false,
});

const warmupParticles = (count: number): Particle[] => {
  const out: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    const particle = createParticle();
    particle.presence = 1;
    out.push(particle);
  }
  return out;
};

type ParticleBackdropProps = {
  enabled: boolean;
};

export default function ParticleBackdrop({ enabled }: ParticleBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let disposed = false;
    let rafId = 0;
    let lastTime = performance.now();
    let renderWidth = 0;
    let renderHeight = 0;
    let dpr = 1;
    let time = Math.random() * 100;
    let langVisualActive = false;
    let workVisualActive = false;
    let pointerX = 0;
    let pointerY = 0;
    let pointerActive = false;
    let pointerInfluence = 0;
    let workCoverImage = '';
    let workPaletteRequestToken = 0;
    let workPalette: RGB[] = WORK_FALLBACK_PALETTE_RGB.slice();

    const params: RuntimeParams = {
      ...VISUAL_PROFILES.base,
      opacity: enabledRef.current ? 1 : 0,
    };
    const particles: Particle[] = warmupParticles(Math.round(VISUAL_PROFILES.base.count));
    const paletteCurrent = normalizePalette(BASE_PALETTE_RGB);
    const paletteTarget = normalizePalette(BASE_PALETTE_RGB);

    const resize = () => {
      dpr = clamp(window.devicePixelRatio || 1, 1, 1.8);
      renderWidth = Math.max(1, Math.floor(window.innerWidth));
      renderHeight = Math.max(1, Math.floor(window.innerHeight));
      canvas.width = Math.floor(renderWidth * dpr);
      canvas.height = Math.floor(renderHeight * dpr);
      canvas.style.width = `${renderWidth}px`;
      canvas.style.height = `${renderHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!pointerActive) {
        pointerX = renderWidth * 0.5;
        pointerY = renderHeight * 0.5;
      }
    };

    const onLangVisual = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      langVisualActive = !!detail?.active;
    };

    const requestWorkPalette = async (coverImage: string, token: number) => {
      const extracted = await extractPaletteFromImage(coverImage).catch(() => null);
      if (disposed || token !== workPaletteRequestToken) return;
      workPalette = extracted && extracted.length > 0 ? normalizePalette(extracted) : normalizePalette(WORK_FALLBACK_PALETTE_RGB);
    };

    const onWorkVisual = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean; coverImage?: string }>).detail || {};
      workVisualActive = !!detail.active;
      const nextCoverImage = String(detail.coverImage || '').trim();
      if (workVisualActive) {
        if (nextCoverImage && nextCoverImage !== workCoverImage) {
          workCoverImage = nextCoverImage;
          workPaletteRequestToken += 1;
          void requestWorkPalette(workCoverImage, workPaletteRequestToken);
        }
        if (!nextCoverImage) {
          workCoverImage = '';
          workPalette = normalizePalette(WORK_FALLBACK_PALETTE_RGB);
        }
      } else {
        workCoverImage = '';
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerActive = true;
    };

    const onPointerLeave = () => {
      pointerActive = false;
    };

    const setPaletteTarget = (mode: VisualMode) => {
      const source =
        mode === 'work'
          ? normalizePalette(workPalette)
          : mode === 'lang'
            ? normalizePalette(LANG_PALETTE_RGB)
            : normalizePalette(BASE_PALETTE_RGB);
      for (let i = 0; i < PALETTE_SIZE; i += 1) {
        paletteTarget[i] = source[i];
      }
    };

    const stepParticles = (dt: number, mode: VisualMode) => {
      const desiredCount = Math.max(30, Math.round(params.count));
      const deltaCount = desiredCount - particles.length;
      if (deltaCount > 0) {
        const spawnCount = Math.min(deltaCount, Math.max(1, Math.ceil(deltaCount * 0.14)));
        for (let i = 0; i < spawnCount; i += 1) {
          particles.push(createParticle());
        }
      } else if (deltaCount < 0) {
        let retireBudget = Math.min(-deltaCount, Math.max(1, Math.ceil(-deltaCount * 0.12)));
        for (let i = particles.length - 1; i >= 0 && retireBudget > 0; i -= 1) {
          if (!particles[i].retiring) {
            particles[i].retiring = true;
            retireBudget -= 1;
          }
        }
      }

      const baseRiverCenter = 0.5;
      const cameraDepthBlend = clamp(1 - params.camera * 0.58, 0.2, 1);
      const motionScale = enabledRef.current ? 1 : 0.35;
      const removeIndices: number[] = [];
      pointerInfluence = expEase(pointerInfluence, pointerActive && enabledRef.current ? 1 : 0, dt, 5.2);

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        if (p.retiring) {
          p.presence -= dt * 2.2;
          if (p.presence <= 0) {
            removeIndices.push(i);
            continue;
          }
        } else {
          p.presence = Math.min(1, p.presence + dt * 1.9);
        }

        const speedLayer = 0.62 + p.speed * 0.7;
        p.x += params.speed * speedLayer * motionScale * dt;
        if (p.x > 1.12) {
          p.x = -0.12;
          p.yBase = Math.random();
          p.lane = Math.random() * 2 - 1;
          p.depth = Math.random();
          p.phase = Math.random() * TAU;
          p.retiring = false;
          p.paletteIndex = Math.floor(Math.random() * PALETTE_SIZE);
        }
      }

      for (let i = removeIndices.length - 1; i >= 0; i -= 1) {
        particles.splice(removeIndices[i], 1);
      }

      ctx.clearRect(0, 0, renderWidth, renderHeight);

      for (let i = 0; i < PALETTE_SIZE; i += 1) {
        const c = paletteCurrent[i];
        const t = paletteTarget[i];
        c[0] = expEase(c[0], t[0], dt, 2.2);
        c[1] = expEase(c[1], t[1], dt, 2.2);
        c[2] = expEase(c[2], t[2], dt, 2.2);
      }

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const x = p.x;
        const curvePrimary =
          Math.sin(x * Math.PI * 1.22 + time * 0.3 + p.phase * 0.14) * (0.18 + params.curveAmp * 0.42) +
          Math.sin(x * Math.PI * 2.08 - time * 0.16 + p.phase * 0.38) * (0.045 + params.curveAmp * 0.16);
        const riverCenter = baseRiverCenter + curvePrimary * 0.54;
        const laneSpread = p.lane * params.riverWidth * (0.24 + p.depth * 0.88);
        const turbulence = Math.sin(time * (0.82 + p.wiggle * 0.56) + p.phase * 2.1) * params.turbulence * 0.075;
        const riverY = riverCenter + laneSpread + turbulence;
        const y = lerp(p.yBase, riverY, params.riverBlend);

        const perspective = 1 / (1 + params.camera * 1.68 + p.depth * 0.82);
        const workSizeBoost = mode === 'work' ? 1.34 : 1;
        const size = (0.52 + params.size * p.size) * (0.5 + perspective * 1.9) * workSizeBoost;
        const brightnessBoost = mode === 'work' ? 1.24 : 1;
        const alpha = params.alpha * p.alpha * p.presence * (0.45 + perspective * 0.95) * params.opacity * brightnessBoost;
        if (alpha <= 0.005) continue;

        const px = x * renderWidth;
        const py = y * renderHeight;
        const drift = params.speed * (0.8 + p.speed * 0.5) * renderWidth * 0.09 * cameraDepthBlend;
        let drawX = px;
        let drawY = py;
        if (pointerInfluence > 0.01) {
          const dx = drawX - pointerX;
          const dy = drawY - pointerY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0.0001 && dist < POINTER_REPEL_RADIUS) {
            const falloff = (POINTER_REPEL_RADIUS - dist) / POINTER_REPEL_RADIUS;
            const softFalloff = falloff * falloff * falloff;
            const push = softFalloff * POINTER_REPEL_STRENGTH * pointerInfluence * (0.7 + (1 - p.depth) * 0.35);
            drawX += (dx / dist) * push;
            drawY += (dy / dist) * push;
          }
        }
        const c = paletteCurrent[p.paletteIndex % PALETTE_SIZE];
        const r = Math.round(clamp(c[0], 0, 255));
        const g = Math.round(clamp(c[1], 0, 255));
        const b = Math.round(clamp(c[2], 0, 255));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;

        const radius = Math.max(0.4, size);
        ctx.beginPath();
        ctx.arc(drawX, drawY, radius, 0, TAU);
        ctx.fill();

        if (mode === 'work' && alpha > 0.08) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${clamp(alpha * 0.46, 0, 1).toFixed(3)})`;
          ctx.arc(drawX, drawY, Math.max(0.22, radius * 0.42), 0, TAU);
          ctx.fill();
        }

        if (mode === 'base' && alpha > 0.06) {
          ctx.beginPath();
          ctx.moveTo(drawX - drift * 0.62, drawY);
          ctx.lineTo(drawX - drift * 0.14, drawY);
          ctx.lineWidth = Math.max(0.16, size * 0.32);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${clamp(alpha * 0.36, 0, 1).toFixed(3)})`;
          ctx.stroke();
        }
      }
    };

    const tick = (now: number) => {
      if (disposed) return;
      const dt = clamp((now - lastTime) / 1000, 1 / 120, 1 / 24);
      lastTime = now;
      time += dt;

      const mode: VisualMode = workVisualActive ? 'work' : langVisualActive ? 'lang' : 'base';
      const target = VISUAL_PROFILES[mode];
      const isEnabled = enabledRef.current;

      params.count = expEase(params.count, target.count, dt, 2.7);
      params.speed = expEase(params.speed, target.speed, dt, 2.4);
      params.size = expEase(params.size, target.size, dt, 2.5);
      params.alpha = expEase(params.alpha, target.alpha, dt, 2.2);
      params.riverBlend = expEase(params.riverBlend, target.riverBlend, dt, 2.8);
      params.riverWidth = expEase(params.riverWidth, target.riverWidth, dt, 2.5);
      params.camera = expEase(params.camera, target.camera, dt, 2.3);
      params.curveAmp = expEase(params.curveAmp, target.curveAmp, dt, 2.4);
      params.turbulence = expEase(params.turbulence, target.turbulence, dt, 2.3);
      params.opacity = expEase(params.opacity, isEnabled ? 1 : 0, dt, 3.4);

      setPaletteTarget(mode);
      stepParticles(dt, mode);
      rafId = window.requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.addEventListener(LANG_VISUAL_EVENT, onLangVisual as EventListener);
    window.addEventListener(WORK_VISUAL_EVENT, onWorkVisual as EventListener);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    window.addEventListener('pointercancel', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);
    document.addEventListener('mouseleave', onPointerLeave);
    rafId = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      window.removeEventListener(LANG_VISUAL_EVENT, onLangVisual as EventListener);
      window.removeEventListener(WORK_VISUAL_EVENT, onWorkVisual as EventListener);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerMove);
      window.removeEventListener('pointercancel', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      document.removeEventListener('mouseleave', onPointerLeave);
      ctx.clearRect(0, 0, renderWidth, renderHeight);
    };
  }, []);

  return <canvas ref={canvasRef} className={`particle-backdrop${enabled ? ' is-active' : ''}`} aria-hidden="true" />;
}
