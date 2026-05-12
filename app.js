// app.js — SpriteSmith Studio v3 (LBS warp engine)

import { removeBackground }                 from './bgremove.js';
import { detectSkeleton }                   from './bodyDetect.js';
import { POSES, renderFrame }               from './animator.js';
import { bakeSheet, exportPNG, exportJSON } from './spritesheet.js';

// ════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════
let state = {
  skelData:    null,   // result from detectSkeleton()
  pose:        'idle',
  direction:   'right',
  speed:       1.0,
  frameCount:  8,
  frameSize:   128,
  layout:      'horizontal',
  sheetCanvas: null,
};

let animPhase = 0;
let lastTime  = null;
let rafId     = null;

// ════════════════════════════════════════════════════
// ELEMENT REFS
// ════════════════════════════════════════════════════
const $         = id => document.getElementById(id);
const uploadZone    = $('uploadZone');
const uploadTrigger = $('uploadTrigger');
const uploadPreview = $('uploadPreview');
const uploadThumb   = $('uploadThumb');
const fileInput     = $('fileInput');
const clearBtn      = $('clearBtn');
const bgBar         = $('bgBar');
const progFill      = $('progFill');
const progLabel     = $('progLabel');
const poseGrid      = $('poseGrid');
const dirGroup      = $('dirGroup');
const speedSlider   = $('speedSlider');
const speedVal      = $('speedVal');
const framesSlider  = $('framesSlider');
const framesVal     = $('framesVal');
const sizeSelect    = $('sizeSelect');
const layoutSelect  = $('layoutSelect');
const bakeBtn       = $('bakeBtn');
const exportPNGBtn  = $('exportPNG');
const exportJSONBtn = $('exportJSON');
const previewCanvas = $('previewCanvas');
const previewPlhdr  = $('previewPlaceholder');
const sheetCanvas   = $('sheetCanvas');
const sheetPlhdr    = $('sheetPlaceholder');
const poseBadge     = $('poseBadge');
const sheetBadge    = $('sheetBadge');
const saveBtn       = $('saveBtn');
const loadBtn       = $('loadBtn');
const saveStatus    = $('saveStatus');
const toastEl       = $('toast');

const previewCtx    = previewCanvas.getContext('2d');
const sheetCtx      = sheetCanvas.getContext('2d');

// ════════════════════════════════════════════════════
// POSE GRID BUILD
// ════════════════════════════════════════════════════
POSES.forEach(p => {
  const btn = document.createElement('button');
  btn.className  = 'pose-btn' + (p.id === state.pose ? ' active' : '');
  btn.dataset.id = p.id;
  btn.innerHTML  = `<span class="pose-ico">${p.ico}</span><span class="pose-lbl">${p.label}</span>`;
  btn.addEventListener('click', () => selectPose(p.id));
  poseGrid.appendChild(btn);
});

// ════════════════════════════════════════════════════
// UPLOAD / DRAG-DROP
// ════════════════════════════════════════════════════
uploadTrigger.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) handleFile(f);
});

clearBtn.addEventListener('click', resetCharacter);

function resetCharacter() {
  state.skelData   = null;
  state.sheetCanvas = null;
  uploadTrigger.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  bgBar.classList.add('hidden');
  bakeBtn.disabled     = true;
  exportPNGBtn.disabled = true;
  exportJSONBtn.disabled = true;
  previewPlhdr.classList.remove('hidden');
  sheetPlhdr.classList.remove('hidden');
  poseBadge.textContent  = '—';
  sheetBadge.textContent = '—';
  stopAnimation();
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
}

async function handleFile(file) {
  const objURL = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objURL; });

  uploadThumb.src = objURL;
  bgBar.classList.remove('hidden');
  uploadTrigger.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
  bakeBtn.disabled = true;

  // Stage 1: background removal (0–48%)
  setProgress(0, 'Removing background…');
  let cleaned;
  try {
    cleaned = await removeBackground(img, p => setProgress(p * 0.48, bgLabel(p)));
  } catch (e) {
    console.error(e);
    showToast('Background removal failed.', 'err');
    bgBar.classList.add('hidden');
    return;
  }

  uploadThumb.src = cleaned.toDataURL();
  URL.revokeObjectURL(objURL);

  // Stage 2: skeleton + weight map detection (48–100%)
  setProgress(0.50, 'Analysing character structure…');
  await tick();

  let skelData;
  try {
    skelData = await detectSkeleton(cleaned, p => setProgress(0.50 + p * 0.50, skelLabel(p)));
  } catch (e) {
    console.error(e);
    showToast('Skeleton detection failed — try a clearer sprite.', 'err');
    bgBar.classList.add('hidden');
    return;
  }

  if (!skelData) {
    showToast('No character detected. Use a front/side-facing sprite.', 'warn');
    bgBar.classList.add('hidden');
    return;
  }

  state.skelData = skelData;
  bgBar.classList.add('hidden');
  previewPlhdr.classList.add('hidden');
  bakeBtn.disabled = false;
  showToast('Character loaded — warp engine ready ✓', 'ok');
  startAnimation();
}

const bgLabel   = p => ['Sampling edge colours…','Flood-filling background…',
                         'Cleaning fringe pixels…','Smoothing alpha edges…',
                         'Finalising…','Done!']
  .find((_, i, a) => p < (i + 1) / a.length) ?? 'Done!';

const skelLabel = p => p < 0.20 ? 'Scanning row profiles…'
                     : p < 0.40 ? 'Finding body landmarks…'
                     : p < 0.60 ? 'Building bone regions…'
                     : p < 0.90 ? 'Computing LBS weight maps…'
                     :            'Finalising skeleton…';

// ════════════════════════════════════════════════════
// ANIMATION LOOP
// ════════════════════════════════════════════════════
function startAnimation() {
  stopAnimation();
  lastTime = null; animPhase = 0;
  rafId = requestAnimationFrame(loop);
}
function stopAnimation() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (!state.skelData) return;

  const dt = lastTime ? (now - lastTime) / 1000 : 0;
  lastTime = now;

  const oneShot = ['die', 'crouch'];
  if (oneShot.includes(state.pose)) {
    animPhase = Math.min(animPhase + dt * state.speed * 0.55, 0.999);
  } else {
    animPhase = (animPhase + dt * state.speed * 0.72) % 1;
  }

  // Resize canvas to wrapper
  const wrap = previewCanvas.parentElement;
  const sz   = Math.min(wrap.clientWidth || 320, wrap.clientHeight || 320, 480);
  if (previewCanvas.width !== sz || previewCanvas.height !== sz) {
    previewCanvas.width = previewCanvas.height = sz;
  }

  renderFrame(previewCtx, state.skelData, state.pose, animPhase, state.direction);
  poseBadge.textContent = `${state.pose.toUpperCase()} · ${state.direction.toUpperCase()}`;
}

// ════════════════════════════════════════════════════
// CONTROLS
// ════════════════════════════════════════════════════
function selectPose(id) {
  state.pose = id; animPhase = 0;
  poseGrid.querySelectorAll('.pose-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.id === id));
}

dirGroup.querySelectorAll('.tog').forEach(btn =>
  btn.addEventListener('click', () => {
    dirGroup.querySelectorAll('.tog').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.direction = btn.dataset.val;
  })
);

speedSlider.addEventListener('input', () => {
  state.speed = parseFloat(speedSlider.value);
  speedVal.textContent = state.speed.toFixed(2) + '×';
});
framesSlider.addEventListener('input', () => {
  state.frameCount = parseInt(framesSlider.value);
  framesVal.textContent = state.frameCount;
});
sizeSelect.addEventListener('change',   () => { state.frameSize = parseInt(sizeSelect.value); });
layoutSelect.addEventListener('change', () => { state.layout = layoutSelect.value; });

// ════════════════════════════════════════════════════
// BAKE
// ════════════════════════════════════════════════════
bakeBtn.addEventListener('click', () => {
  if (!state.skelData) return;
  bakeBtn.textContent = '⏳ Baking…';
  bakeBtn.disabled    = true;

  // Run bake async so UI can update
  setTimeout(() => {
    try {
      state.sheetCanvas = bakeSheet(
        state.skelData, state.pose, state.direction,
        state.frameCount, state.frameSize, state.layout
      );

      sheetCanvas.width  = state.sheetCanvas.width;
      sheetCanvas.height = state.sheetCanvas.height;
      sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
      sheetCtx.drawImage(state.sheetCanvas, 0, 0);

      sheetPlhdr.classList.add('hidden');
      sheetBadge.textContent =
        `${state.frameCount} frames · ${state.sheetCanvas.width}×${state.sheetCanvas.height}px`;
      exportPNGBtn.disabled  = false;
      exportJSONBtn.disabled = false;
      showToast(`Sprite sheet baked (${state.frameCount} frames) ✓`, 'ok');
    } catch (e) {
      console.error(e);
      showToast('Bake failed — see console.', 'err');
    } finally {
      bakeBtn.textContent = '⚡ BAKE SPRITE SHEET';
      bakeBtn.disabled    = false;
    }
  }, 30);
});

// ════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════
exportPNGBtn.addEventListener('click', () => {
  if (!state.sheetCanvas) return;
  exportPNG(state.sheetCanvas, state.pose, state.direction);
  showToast('PNG exported ↓', 'ok');
});
exportJSONBtn.addEventListener('click', () => {
  if (!state.sheetCanvas) return;
  exportJSON(state.sheetCanvas, state.frameCount, state.frameSize,
             state.layout, state.pose, state.direction);
  showToast('JSON + PNG exported ↓', 'ok');
});

// ════════════════════════════════════════════════════
// SAVE / LOAD  (localStorage)
// ════════════════════════════════════════════════════
const STORAGE_KEY = 'spritesmithStudio_v3';

saveBtn.addEventListener('click', () => {
  if (!state.skelData) { showToast('Nothing to save yet.', 'warn'); return; }
  try {
    // Store the bg-removed character as a compact PNG dataURL
    const { srcData, srcW, srcH } = state.skelData;
    const tmp = document.createElement('canvas');
    tmp.width = srcW; tmp.height = srcH;
    tmp.getContext('2d').putImageData(srcData, 0, 0);
    const charDataURL = tmp.toDataURL('image/png');

    const payload = {
      charDataURL,
      pose: state.pose, direction: state.direction, speed: state.speed,
      frameCount: state.frameCount, frameSize: state.frameSize,
      layout: state.layout, savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    saveStatus.textContent = 'Saved ✓';
    saveStatus.classList.add('visible');
    setTimeout(() => saveStatus.classList.remove('visible'), 2500);
    showToast('Project saved to browser ✓', 'ok');
  } catch (e) {
    console.error(e);
    showToast('Save failed (storage full?)', 'err');
  }
});

loadBtn.addEventListener('click', async () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { showToast('No saved project found.', 'warn'); return; }

  try {
    const payload = JSON.parse(raw);
    showToast('Loading saved project…', 'ok');

    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = payload.charDataURL; });

    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);

    bgBar.classList.remove('hidden');
    uploadTrigger.classList.add('hidden');
    uploadPreview.classList.remove('hidden');
    uploadThumb.src = payload.charDataURL;
    setProgress(0, 'Rebuilding skeleton…');

    const skelData = await detectSkeleton(c, p => setProgress(p, skelLabel(p)));
    if (!skelData) { showToast('Failed to re-detect skeleton.', 'err'); bgBar.classList.add('hidden'); return; }

    state.skelData     = skelData;
    state.pose         = payload.pose       || 'idle';
    state.direction    = payload.direction  || 'right';
    state.speed        = payload.speed      || 1.0;
    state.frameCount   = payload.frameCount || 8;
    state.frameSize    = payload.frameSize  || 128;
    state.layout       = payload.layout     || 'horizontal';

    // Sync UI
    selectPose(state.pose);
    speedSlider.value     = state.speed;
    speedVal.textContent  = state.speed.toFixed(2) + '×';
    framesSlider.value    = state.frameCount;
    framesVal.textContent = state.frameCount;
    sizeSelect.value      = state.frameSize;
    layoutSelect.value    = state.layout;
    dirGroup.querySelectorAll('.tog').forEach(b =>
      b.classList.toggle('active', b.dataset.val === state.direction));

    bgBar.classList.add('hidden');
    previewPlhdr.classList.add('hidden');
    bakeBtn.disabled = false;
    startAnimation();
    showToast(`Loaded (saved ${timeAgo(payload.savedAt)}) ✓`, 'ok');
  } catch (e) {
    console.error(e);
    showToast('Load failed.', 'err');
    bgBar.classList.add('hidden');
  }
});

// ════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════
function setProgress(pct, label) {
  progFill.style.width  = (Math.min(pct, 1) * 100) + '%';
  if (label) progLabel.textContent = label;
}

let toastTimer = null;
function showToast(msg, type = 'ok') {
  toastEl.textContent = msg;
  toastEl.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function tick() { return new Promise(r => setTimeout(r, 0)); }
