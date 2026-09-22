/* Scroll-led product story. Native page scrolling remains in charge. */
(() => {
  'use strict';

  const root = document.querySelector('#photo-to-space');
  if (!root || !('IntersectionObserver' in window) || !window.requestAnimationFrame) return;

  const track = root.querySelector('.journey-track');
  const sticky = root.querySelector('.journey-sticky');
  const stage = root.querySelector('.journey-stage');
  const fallback = root.querySelector('.journey-static');
  const caption = root.querySelector('.journey-caption');
  const canvas = root.querySelector('canvas.journey-canvas');
  const posterElement = root.querySelector('.journey-poster');
  const poster = posterElement?.matches('img') ? posterElement : posterElement?.querySelector('img');
  const photoElement = root.querySelector('.journey-photo');
  const photo = photoElement?.matches('img') ? photoElement : photoElement?.querySelector('img');
  if (!track || !sticky || !stage || !fallback || !canvas || !poster || !photo) return;

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const notes = [...root.querySelectorAll('[data-journey-note]')];
  const buttons = [...root.querySelectorAll('[data-journey-go]')];
  const labels = [...root.querySelectorAll('[data-journey-label]')];
  const frameCount = Math.min(180, Math.max(2, Number(root.dataset.frameCount) || 40));
  // Choose once per visit so rotating a phone never downloads a second sequence.
  const compactFrames = window.innerWidth <= 800;
  const assetBase = new URL(root.dataset.frameBase || 'assets/scroll-coast-v1/', document.baseURI);
  const frameBase = compactFrames ? new URL('mobile/', assetBase) : assetBase;
  const frames = Array(frameCount).fill(null);
  const requested = new Set();
  const failed = new Set();
  const variables = [
    '--journey-photo-opacity', '--journey-photo-scale', '--journey-photo-y',
    '--journey-scene-opacity', '--journey-scene-clip', '--journey-progress',
  ];
  const stops = [0.06, 0.5, 0.93];
  let prepared = false;
  let preparing = false;
  let initialFailed = false;
  let enabled = false;
  let nearby = false;
  let scheduled = false;
  let loading = 0;
  let targetFrame = 0;
  let activeNote = -1;
  let lastDrawing = '';
  let resizeNeeded = true;
  let photoLift = 0;

  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const between = (value, start, end) => ease((value - start) / (end - start));
  const viewportHeight = () => window.innerHeight || document.documentElement.clientHeight;
  // Browser chrome can change a phone's reported viewport height mid-scroll.
  // Keep an admitted story active through those small changes; only genuinely
  // short/landscape viewports return to the static layout.
  const allowed = () => !reducedMotion.matches && viewportHeight() >= (enabled ? 520 : 640);
  const stickyTop = () => Number.parseFloat(getComputedStyle(sticky).top) || 0;

  function imageReady(image) {
    image.loading = 'eager';
    if (image.complete) {
      return image.naturalWidth ? Promise.resolve(image) : Promise.reject(new Error('Image unavailable'));
    }
    return new Promise((resolve, reject) => {
      const clean = () => {
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', error);
      };
      const loaded = () => { clean(); resolve(image); };
      const error = () => { clean(); reject(new Error('Image unavailable')); };
      image.addEventListener('load', loaded, { once: true });
      image.addEventListener('error', error, { once: true });
    });
  }

  function prepare() {
    if (preparing || prepared || initialFailed || !nearby || !allowed()) return;
    preparing = true;
    // The static poster may be a wider product photograph. Fetch the matching
    // first animation frame separately before changing the visible experience.
    const firstFrame = new Image();
    firstFrame.decoding = 'async';
    firstFrame.src = new URL('frame-00.webp', frameBase).href;
    Promise.all([imageReady(firstFrame), imageReady(photo)])
      .then(() => {
        frames[0] = firstFrame;
        requested.add(0);
        prepared = true;
        schedule();
      })
      .catch(() => { initialFailed = true; })
      .finally(() => { preparing = false; });
  }

  function enable() {
    // Expanding a section already being read would move the content under the reader.
    // Hash visits and a slow initial download therefore keep the complete static story.
    if (enabled || !prepared || !allowed() || root.getBoundingClientRect().top < viewportHeight()) return;
    enabled = true;
    root.classList.add('scroll-enhanced');
    poster.src = frames[0].src;
    track.hidden = false;
    fallback.hidden = true;
    if (caption) caption.hidden = false;
    resizeNeeded = true;
    lastDrawing = '';
    activeNote = -1;
  }

  function disable() {
    if (!enabled) return;
    const before = root.getBoundingClientRect();
    const navTop = stickyTop();
    const readingStory = before.top <= navTop && before.bottom > navTop;
    const readingBelow = before.bottom <= navTop;
    const followingSection = document.querySelector('#ritual');
    const followingTop = followingSection?.getBoundingClientRect().top;
    const focusInTrack = track.contains(document.activeElement);
    const lastNote = activeNote;

    enabled = false;
    root.classList.remove('scroll-enhanced');
    track.hidden = true;
    fallback.hidden = false;
    if (caption) caption.hidden = true;
    variables.forEach(name => stage.style.removeProperty(name));
    notes.forEach(note => note.removeAttribute('aria-hidden'));
    buttons.forEach(button => button.removeAttribute('aria-current'));
    activeNote = -1;

    // Continue with the corresponding source/result in the static comparison.
    const comparison = fallback.querySelector('.comparison');
    const view = lastNote <= 0 ? 'photo' : 'scene';
    if (comparison) comparison.dataset.view = view;
    fallback.querySelectorAll('.comparison-switch button[data-view]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });

    // Collapsing a long sticky track must not throw the reader past the next
    // chapter. Preserve its viewport position if they have already moved on;
    // otherwise show this chapter's static heading immediately under the nav.
    let destination = null;
    if (readingStory) {
      destination = window.scrollY + root.getBoundingClientRect().top - navTop;
    } else if (readingBelow) {
      const change = followingSection && Number.isFinite(followingTop)
        ? followingSection.getBoundingClientRect().top - followingTop
        : root.getBoundingClientRect().bottom - before.bottom;
      destination = window.scrollY + change;
    }
    if (destination !== null) {
      const documentStyle = document.documentElement.style;
      const previous = documentStyle.getPropertyValue('scroll-behavior');
      const priority = documentStyle.getPropertyPriority('scroll-behavior');
      // Explicitly override the page's smooth-scroll CSS for this compensation.
      documentStyle.setProperty('scroll-behavior', 'auto', 'important');
      window.scrollTo({ top: Math.max(0, destination), left: window.scrollX, behavior: 'auto' });
      if (previous) documentStyle.setProperty('scroll-behavior', previous, priority);
      else documentStyle.removeProperty('scroll-behavior');
    }
    if (focusInTrack) {
      const heading = fallback.querySelector('h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
  }

  function progress() {
    const rect = track.getBoundingClientRect();
    const travel = rect.height - sticky.getBoundingClientRect().height;
    return travel > 1 ? clamp((stickyTop() - rect.top) / travel) : 0;
  }

  function resizeCanvas() {
    // A fixed 5:4 drawing surface, displayed with object-fit: contain, keeps the
    // render undistorted even when a phone's stage is a different aspect ratio.
    const rect = stage.getBoundingClientRect();
    const renderHeight = Math.min(rect.height, rect.width * 0.8);
    photoLift = -renderHeight * 0.085;
    const displayWidth = Math.min(rect.width, rect.height * 1.25);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.min(compactFrames ? 640 : 1000, Math.round(displayWidth * pixelRatio)));
    const height = Math.max(1, Math.round(width * 0.8));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      lastDrawing = '';
    }
    resizeNeeded = false;
  }

  function drawImage(image, alpha) {
    const ratio = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    context.globalAlpha = alpha;
    context.drawImage(image, (canvas.width - width) * 0.5, (canvas.height - height) * 0.5, width, height);
  }

  function drawFrame(frame) {
    const lower = Math.floor(frame);
    const upper = Math.min(frameCount - 1, lower + 1);
    let first = lower;
    let second = upper;
    let mix = frame - lower;
    if (!frames[lower] || !frames[upper]) {
      let nearest = 0;
      let distance = Infinity;
      frames.forEach((image, index) => {
        if (image && Math.abs(index - frame) < distance) {
          nearest = index;
          distance = Math.abs(index - frame);
        }
      });
      first = second = nearest;
      mix = 0;
    }
    if (!frames[first]) return;
    // Four decimal places prevent repeat draws caused only by insignificant float jitter.
    const key = `${first}:${second}:${mix.toFixed(4)}:${canvas.width}`;
    if (key === lastDrawing) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawImage(frames[first], 1);
    if (second !== first && mix > 0) drawImage(frames[second], mix);
    context.globalAlpha = 1;
    lastDrawing = key;
  }

  function setNote(index) {
    if (index === activeNote) return;
    activeNote = index;
    notes.forEach(note => {
      const current = Number(note.dataset.journeyNote) === index;
      note.classList.toggle('is-current', current);
      note.setAttribute('aria-hidden', String(!current));
    });
    buttons.forEach(button => {
      const current = Number(button.dataset.journeyGo) === index;
      button.classList.toggle('is-current', current);
      if (current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    labels.forEach(label => { label.textContent = ['01 / 一张照片', '02 / 空间显现', '03 / 一段记忆'][index]; });
  }

  function nextFrame() {
    let best = -1;
    let distance = Infinity;
    for (let i = 1; i < frameCount; i += 1) {
      if (requested.has(i) || failed.has(i)) continue;
      const score = Math.abs(i - targetFrame);
      if (score < distance) { best = i; distance = score; }
    }
    return best;
  }

  function loadFrames() {
    if (!enabled || !nearby || !allowed()) return;
    while (loading < 3) {
      const index = nextFrame();
      if (index < 0) return;
      requested.add(index);
      loading += 1;
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        frames[index] = image;
        loading -= 1;
        image.onload = image.onerror = null;
        if (nearby) schedule();
        loadFrames();
      };
      image.onerror = () => {
        failed.add(index);
        loading -= 1;
        image.onload = image.onerror = null;
        // Missing frames never make the static first-frame poster disappear.
        loadFrames();
      };
      image.src = new URL(`frame-${String(index).padStart(2, '0')}.webp`, frameBase).href;
    }
  }

  function update() {
    scheduled = false;
    if (!allowed()) { disable(); return; }
    prepare();
    enable();
    if (!enabled || !nearby) return;
    const rect = track.getBoundingClientRect();
    const onScreen = rect.top < viewportHeight() && rect.bottom > 0;
    const p = progress();
    targetFrame = (frameCount - 1) * between(p, 0.55, 1);
    loadFrames();
    if (!onScreen) return;
    if (resizeNeeded) resizeCanvas();
    stage.style.setProperty('--journey-progress', p.toFixed(4));
    stage.style.setProperty('--journey-photo-opacity', (1 - between(p, 0.25, 0.46)).toFixed(4));
    stage.style.setProperty('--journey-photo-scale', (1 - 0.08 * between(p, 0, 0.3) - 0.27 * between(p, 0.25, 0.48)).toFixed(4));
    stage.style.setProperty('--journey-photo-y', `${(-4 * between(p, 0, 0.3) + photoLift * between(p, 0.25, 0.48)).toFixed(2)}px`);
    stage.style.setProperty('--journey-scene-opacity', between(p, 0.25, 0.48).toFixed(4));
    stage.style.setProperty('--journey-scene-clip', `${(100 * (1 - between(p, 0.25, 0.5))).toFixed(2)}%`);
    setNote(p < 0.3 ? 0 : p < 0.6 ? 1 : 2);
    drawFrame(targetFrame);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      if (!enabled) return;
      const index = Number(button.dataset.journeyGo);
      if (!Number.isInteger(index) || index < 0 || index >= stops.length) return;
      const rect = track.getBoundingClientRect();
      const travel = rect.height - sticky.getBoundingClientRect().height;
      const top = window.scrollY + rect.top - stickyTop() + Math.max(0, travel) * stops[index];
      window.scrollTo({ top, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    });
  });

  const observer = new IntersectionObserver(entries => {
    nearby = entries[0].isIntersecting;
    if (nearby) schedule();
  }, { rootMargin: '1200px 0px' });
  observer.observe(root);
  window.addEventListener('scroll', () => { if (nearby) schedule(); }, { passive: true });
  window.addEventListener('resize', () => { resizeNeeded = true; schedule(); }, { passive: true });
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { resizeNeeded = true; if (enabled && nearby) schedule(); }).observe(stage);
  }
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', schedule);
  else reducedMotion.addListener(schedule);
})();
