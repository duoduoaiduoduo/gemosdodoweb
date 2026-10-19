import { createRenderer } from './renderer.js?v=fire-v28c';
import { DEFAULT_PARAMETERS as defaults } from './parameters.js?v=fire-v28c';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
let renderer;
const viewQuery = new URLSearchParams(location.search);
if (viewQuery.has('chapter')) {
  const url = new URL(location.href); url.searchParams.delete('chapter'); history.replaceState(null, '', url);
}
let paused = viewQuery.has('still');
let focused = false;
let toastTimer;
let riding = false, rideRequested = false, dragSteer = 0, leftHeld = false, rightHeld = false;
let fireMode = false, fireUsed = false, fireCanvasPointer = null, fireToolDrag = null, suppressFireClick = false;
let fireRegrowing = false, fireGrowthProgress = 0, fireGrowthSeen = false, suppressBurnedStats = false;
const pressed = new Set();
const params = { ...defaults };

function updateReadout(key, value) {
  if (key === 'focusPosition') {
    const percent = Math.round((value + 1.2) / 2.4 * 100);
    $('focusPositionOutput').value = `${percent}%`;
    $('focusPosition').setAttribute('aria-valuetext', `${percent}%，从近景到远景`);
  } else if (key === 'flowerRatio') {
    const percent = Math.round(value * 100);
    $('flowerRatioOutput').value = `${percent}%`;
    $('flowerRatio').setAttribute('aria-valuetext', `${percent}%，${percent === 0 ? '只保留草' : '以当前花量为100%'}`);
  } else $(`${key}Output`).value = value.toFixed(2);
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').hidden = true, 2600);
}

function setPaused(value) {
  paused = value;
  if (paused) {
    stopIgniter();
    if (fireToolDrag) suppressFireClick = true;
    fireToolDrag = null;
    dragging = false;
    clearInput();
  }
  renderer?.setPaused(paused);
  $('pauseIcon').hidden = paused;
  $('playIcon').hidden = !paused;
  $('playLabel').textContent = paused ? '继续' : '暂停';
  $('playPause').setAttribute('aria-label', paused ? '继续动画' : '暂停动画');
}

function updateRideUI() {
  const inRide = !fireMode && (riding || rideRequested);
  $('studio').classList.toggle('is-riding', inRide);
  $('rideEntry').setAttribute('aria-pressed', String(rideRequested));
  $('rideEntryLabel').textContent = rideRequested ? '回看混沌' : '滑入混沌';
  $('rideEntryArrow').textContent = rideRequested ? '↙' : '↗';
  $('rideReadout').hidden = !inRide;
  $('rideTouch').hidden = !inRide;
  document.querySelector('.caption h1').textContent = inRide ? '在流动中滑行。' : fireMode ? '一簇火，一场新生。' : '草木，成流。';
  document.querySelector('.caption p').textContent = inRide ? '← → / A D 转向 · 空格跳跃 · P 暂停' : fireMode ? '按住点燃 · 滑动蔓延 · 点击火种恢复旋转' : '拖动旋转 · 滚动缩放';
  canvas.setAttribute('aria-label', inRide ? '在同一个流动花草粒子体上滑板；左右转向，空格跳跃' : fireMode ? '点火模式；按住或滑动点燃草木，点击火种退出' : '实时 WebGPU 流动草叶与花朵；拖动旋转，滚动缩放');
}

function updateFireUI() {
  $('studio').classList.toggle('is-igniting', fireMode);
  $('studio').classList.toggle('is-regrowing', fireRegrowing);
  $('fireSeed').disabled = !renderer || fireRegrowing || !$('error').hidden;
  $('fireSeed').setAttribute('aria-pressed', String(fireMode));
  $('fireSeed').setAttribute('aria-label', fireRegrowing ? '草木正在重新生长' : fireMode ? '退出点火模式，恢复旋转' : '拖动火种到草木，或点击进入点火模式');
  $('fireSeedLabel').textContent = fireMode ? '收起火种' : '火种';
  $('fireHint').textContent = fireRegrowing ? '草木正在重新生长' : fireMode ? '按住草木，让火焰蔓延' : '拖动火种，点燃草木';
  const regrowLabel = fireRegrowing ? `生长中 · ${Math.round(fireGrowthProgress * 100)}%` : '重新生长';
  $('fireRegrow').querySelector('span').textContent = regrowLabel;
  $('fireRegrow').setAttribute('aria-label', regrowLabel);
  $('fireRegrow').setAttribute('aria-busy', String(fireRegrowing));
  $('fireRegrow').dataset.growing = String(fireRegrowing);
  $('fireRegrow').style.setProperty('--growth-progress', `${fireGrowthProgress * 100}%`);
  $('fireRegrow').disabled = !renderer || !fireUsed || fireRegrowing;
}

function stopIgniter() {
  renderer?.setIgniter?.({ x: 0, y: 0, active: false });
  fireCanvasPointer = null;
  $('fireCursor').hidden = true;
}

function setFireMode(value) {
  if (value && (!renderer || fireRegrowing || !$('settings').hidden)) return;
  stopIgniter();
  fireMode = value;
  if (value) {
    if (riding || rideRequested) {
      renderer.exitRide();
      const state = renderer.getState(); params.yaw = state.yaw; params.pitch = state.pitch;
    }
    rideRequested = riding = false;
    clearInput();
    setPaused(false);
  }
  updateFireUI(); updateRideUI();
}

function applyFirePoint(event) {
  if (!renderer || fireRegrowing || !fireMode || !$('settings').hidden || document.hidden) return stopIgniter();
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  const onCanvas = x >= 0 && x <= 1 && y >= 0 && y <= 1 && document.elementFromPoint(event.clientX, event.clientY) === canvas;
  if (!onCanvas) {
    renderer.setIgniter?.({ x: 0, y: 0, active: false });
    $('fireCursor').hidden = true;
    return;
  }
  const studioRect = $('studio').getBoundingClientRect();
  $('fireCursor').style.left = `${event.clientX - studioRect.left}px`;
  $('fireCursor').style.top = `${event.clientY - studioRect.top}px`;
  $('fireCursor').hidden = false;
  renderer.setIgniter?.({ x, y, active: true });
  suppressBurnedStats = false;
  if (!fireUsed) { fireUsed = true; updateFireUI(); }
}

function updateSteer() {
  if (!renderer || fireMode || !(riding || rideRequested)) return;
  const left = leftHeld || pressed.has('ArrowLeft') || pressed.has('KeyA');
  const right = rightHeld || pressed.has('ArrowRight') || pressed.has('KeyD');
  renderer.setInput({ steer: Math.max(-1, Math.min(1, (right ? 1 : 0) - (left ? 1 : 0) + dragSteer)) });
}

function clearInput() {
  pressed.clear(); leftHeld = rightHeld = false; dragSteer = 0;
  renderer?.setInput({ steer: 0 });
  $('steerLeft').classList.remove('held'); $('steerRight').classList.remove('held');
}

function toggleRide() {
  if (!renderer) return;
  setFireMode(false);
  rideRequested = !rideRequested; clearInput();
  setPaused(false);
  if (rideRequested) { renderer.enterRide(); }
  else {
    renderer.exitRide();
    const state = renderer.getState(); params.yaw = state.yaw; params.pitch = state.pitch;
  }
  updateRideUI(); settings(false); canvas.focus({ preventScroll: true });
}

function settings(value) {
  $('settings').hidden = !value;
  $('studio').classList.toggle('settings-open', value);
  $('openSettings').setAttribute('aria-expanded', String(value));
  if (value) {
    setFireMode(false);
    fireToolDrag = null;
    clearInput();
    $('settings').scrollTop = 0;
    $('closeSettings').focus({ preventScroll: true });
  }
}

function focus(value) {
  focused = value;
  $('studio').classList.toggle('is-focused', value);
  $('exitFocus').hidden = !value;
  settings(false);
  canvas.focus({ preventScroll: true });
}

function reset() {
  setFireMode(false); fireUsed = fireRegrowing = fireGrowthSeen = false; fireGrowthProgress = 0;
  suppressBurnedStats = true; renderer?.clearFire?.(); updateFireUI();
  rideRequested = riding = false; clearInput(); updateRideUI();
  Object.assign(params, defaults);
  renderer?.reset();
  syncControls();
  renderer?.setParameters(params);
  setPaused(false);
  toast('已恢复默认参数');
}

function syncControls() {
  for (const key of ['speed', 'turbulence', 'dispersion', 'pointSize', 'focusPosition', 'flowerRatio']) {
    $(key).value = params[key];
    updateReadout(key, params[key]);
  }
  selectQuality(params.quality);
  selectBackground(params.background);
}

function selectQuality(quality) {
  params.quality = quality;
  document.querySelectorAll('[data-quality]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.quality === quality));
  });
  renderer?.setParameters({ quality });
}

function selectBackground(background) {
  if (!['sky', 'white', 'black'].includes(background)) return;
  params.background = background;
  $('studio').dataset.background = background;
  document.querySelectorAll('button[data-background]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.background === background));
  });
  document.querySelector('meta[name="theme-color"]').content = {
    sky: '#9acee8', white: '#ffffff', black: '#000000',
  }[background];
  renderer?.setParameters({ background });
}

async function start() {
  $('error').hidden = true;
  $('loading').hidden = false;
  stopIgniter(); fireToolDrag = null; fireMode = fireUsed = fireRegrowing = fireGrowthSeen = false;
  fireGrowthProgress = 0; suppressBurnedStats = false;
  renderer?.destroy();
  renderer = undefined; rideRequested = riding = false; updateRideUI();
  $('rideEntry').disabled = true;
  $('fireSeed').disabled = true; updateFireUI();
  try {
    renderer = await createRenderer(canvas, {
      initialTime: Number(viewQuery.get('at') || 0),
      onReady: () => {
        $('loading').hidden = true;
        $('engineLabel').textContent = 'WEBGPU · LIVE';
        $('liveDot').classList.add('active');
      },
      onStats: (stats) => {
        if (typeof stats.fps === 'number') $('fps').textContent = `${Math.round(stats.fps)} FPS`;
        riding = Boolean(stats.riding || stats.rideBlend > 0.001);
        $('rideDistance').textContent = `${Math.floor(stats.distance || 0).toLocaleString()} m`;
        $('rideAirborne').hidden = !stats.airborne;
        let fireUIChanged = false;
        if (stats.regrowing === true) {
          const progress = Math.max(fireGrowthProgress, Math.min(1, Math.max(0, Number(stats.growthProgress) || 0)));
          fireUIChanged = !fireRegrowing || progress !== fireGrowthProgress;
          fireRegrowing = fireGrowthSeen = true; fireGrowthProgress = progress;
        } else if (fireRegrowing && fireGrowthSeen && stats.regrowing === false) {
          fireRegrowing = fireGrowthSeen = fireUsed = false; fireGrowthProgress = 0;
          suppressBurnedStats = true; fireUIChanged = true;
        }
        if (!fireRegrowing && !suppressBurnedStats && stats.burnedFraction > 0 && !fireUsed) { fireUsed = true; fireUIChanged = true; }
        if (fireUIChanged) updateFireUI();
        updateRideUI();
      },
      onError: showError,
    });
    renderer.setParameters(params);
    setPaused(paused);
    $('loading').hidden = true;
    $('engineLabel').textContent = 'WEBGPU · LIVE';
    $('liveDot').classList.add('active');
    $('rideEntry').disabled = false;
    $('fireSeed').disabled = false; updateFireUI();
  } catch (error) { showError(error); }
}

function showError(error) {
  stopIgniter();
  $('fireSeed').disabled = true; $('fireRegrow').disabled = true;
  console.error('WebGPU renderer:', error);
  $('loading').hidden = true;
  $('error').hidden = false;
  $('engineLabel').textContent = 'WEBGPU · UNAVAILABLE';
  $('liveDot').classList.remove('active');
  const message = String(error?.message || error || '');
  $('errorMessage').textContent = /not supported|unavailable|adapter|navigator.gpu/i.test(message)
    ? '请使用支持 WebGPU 的浏览器，并确认浏览器已开启图形加速。'
    : `渲染器初始化遇到问题：${message}`;
}

$('playPause').addEventListener('click', () => { setPaused(!paused); canvas.focus({ preventScroll: true }); });
$('openSettings').addEventListener('click', () => settings($('settings').hidden));
$('closeSettings').addEventListener('click', () => { settings(false); canvas.focus({ preventScroll: true }); });
$('focus').addEventListener('click', () => focus(true));
$('exitFocus').addEventListener('click', () => focus(false));
$('reset').addEventListener('click', reset);
$('retry').addEventListener('click', start);
$('qualityHigh').addEventListener('click', () => selectQuality('high'));
$('qualityNormal').addEventListener('click', () => selectQuality('normal'));
document.querySelectorAll('button[data-background]').forEach((button) => {
  button.addEventListener('click', () => selectBackground(button.dataset.background));
});
$('rideEntry').addEventListener('click', toggleRide);
$('fireSeed').addEventListener('click', (event) => {
  if (suppressFireClick && event.detail !== 0) return;
  setFireMode(!fireMode);
  canvas.focus({ preventScroll: true });
});
$('fireSeed').addEventListener('pointerdown', (event) => {
  if (!renderer || fireRegrowing || event.button !== 0) return;
  suppressFireClick = false;
  fireToolDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  $('fireSeed').setPointerCapture(event.pointerId);
});
$('fireSeed').addEventListener('pointermove', (event) => {
  if (!fireToolDrag || fireToolDrag.id !== event.pointerId) return;
  if (!fireToolDrag.moved && Math.hypot(event.clientX - fireToolDrag.x, event.clientY - fireToolDrag.y) > 6) {
    fireToolDrag.moved = true;
    setFireMode(true);
  }
  if (fireToolDrag.moved) applyFirePoint(event);
});
function releaseFireTool(event) {
  if (!fireToolDrag || fireToolDrag.id !== event.pointerId) return;
  if (fireToolDrag.moved || event.type !== 'pointerup') {
    suppressFireClick = true;
  }
  fireToolDrag = null;
  stopIgniter();
}
$('fireSeed').addEventListener('pointerup', releaseFireTool);
$('fireSeed').addEventListener('pointercancel', releaseFireTool);
$('fireSeed').addEventListener('lostpointercapture', releaseFireTool);
$('fireRegrow').addEventListener('click', () => {
  if (!renderer || fireRegrowing) return;
  stopIgniter(); setFireMode(false); fireToolDrag = null;
  if (!renderer.regrowFire?.()) return;
  fireRegrowing = true; fireGrowthSeen = false; fireGrowthProgress = 0;
  suppressBurnedStats = true; updateFireUI(); setPaused(false);
  canvas.focus({ preventScroll: true });
});
$('rideJump').addEventListener('pointerdown', event => { event.preventDefault(); if (!paused) renderer?.jump(); });
for (const [id, side] of [['steerLeft', 'left'], ['steerRight', 'right']]) {
  const button = $(id);
  button.addEventListener('pointerdown', event => {
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    if (side === 'left') leftHeld = true; else rightHeld = true;
    button.classList.add('held'); updateSteer();
  });
  const release = () => {
    if (side === 'left') leftHeld = false; else rightHeld = false;
    button.classList.remove('held'); updateSteer();
  };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}

for (const key of ['speed', 'turbulence', 'dispersion', 'pointSize', 'focusPosition', 'flowerRatio']) {
  $(key).addEventListener('input', (event) => {
    const value = Number(event.target.value);
    params[key] = value;
    updateReadout(key, value);
    renderer?.setParameters({ [key]: value });
  });
}

$('capture').addEventListener('click', () => {
  if (!renderer || $('error').hidden === false) return toast('请等待渲染器就绪');
  canvas.focus({ preventScroll: true });
  // Capture during the next rendered frame, before the presentation buffer expires.
  canvas.dispatchEvent(new CustomEvent('capture-frame', { detail: (blob) => {
    if (!blob) return toast('保存失败，请重试');
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `草木流形-${Date.now()}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 3000);
    toast('画面已保存');
  } }));
});

let dragging = false;
let pointerX = 0;
let pointerY = 0;
let dragOrigin = 0;
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  if (fireMode) {
    if (!renderer || !$('settings').hidden || fireCanvasPointer !== null) return;
    canvas.focus({ preventScroll: true });
    fireCanvasPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    setPaused(false); applyFirePoint(event); return;
  }
  dragging = true;
  pointerX = event.clientX;
  dragOrigin = event.clientX;
  pointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (fireMode) {
    if (event.pointerId === fireCanvasPointer) applyFirePoint(event);
    return;
  }
  if (!dragging) return;
  if (riding || rideRequested) {
    dragSteer = Math.max(-1, Math.min(1, (event.clientX - dragOrigin) / 85)); updateSteer(); return;
  }
  params.yaw += (event.clientX - pointerX) * 0.007;
  params.pitch = Math.max(-1.35, Math.min(1.35, params.pitch + (event.clientY - pointerY) * 0.007));
  pointerX = event.clientX;
  pointerY = event.clientY;
  renderer?.setParameters({ yaw: params.yaw, pitch: params.pitch });
});
function stopDrag(event) {
  if (!event || event.pointerId === fireCanvasPointer) stopIgniter();
  dragging = false; dragSteer = 0; updateSteer();
}
canvas.addEventListener('pointerup', stopDrag);
canvas.addEventListener('pointercancel', stopDrag);
canvas.addEventListener('lostpointercapture', stopDrag);
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (riding || rideRequested) return;
  params.zoom = Math.max(0.65, Math.min(1.6, params.zoom * Math.exp(-event.deltaY * 0.001)));
  renderer?.setParameters({ zoom: params.zoom });
}, { passive: false });
canvas.addEventListener('dblclick', () => { if (!fireMode) focus(!focused); });
document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') { setFireMode(false); focus(false); settings(false); return; }
  if (event.target instanceof HTMLInputElement) return;
  if (event.code === 'KeyF' && !event.repeat) { focus(!focused); return; }
  if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
  if ((riding || rideRequested) && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) { event.preventDefault(); pressed.add(event.code); updateSteer(); }
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault(); if (riding || rideRequested) { if (!paused) renderer?.jump(); } else setPaused(!paused);
  }
  if (event.code === 'KeyP' && !event.repeat) setPaused(!paused);
  if (event.code === 'KeyR') reset();
});
document.addEventListener('keyup', event => { if (pressed.delete(event.code)) updateSteer(); });
window.addEventListener('blur', () => { clearInput(); stopDrag(); fireToolDrag = null; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInput(); stopDrag(); fireToolDrag = null; }
  renderer?.setPaused(document.hidden || paused);
});
syncControls();
updateFireUI();
start();
