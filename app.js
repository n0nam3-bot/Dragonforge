// app.js — SpriteSmith Studio main entry point

import { removeBackground }        from './bgremove.js';
import { POSES, detectBodyInfo, renderFrame } from './animator.js';
import { bakeSheet, exportPNG, exportJSON }   from './spritesheet.js';

// ════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════
let state = {
  charCanvas:  null,  // bg-removed character canvas
  bodyInfo:    null,  // detected body regions
  pose:        'idle',
  direction:   'right',
  speed:       1.0,
  frameCount:  8,
  frameSize:   128,
  layout:      'horizontal',
  sheetCanvas: null,
};

let animPhase  = 0;
let lastTime   = null;
let rafId      = null;

// ════════════════════════════════════════════════════════
// ELEMENT REFS
// ════════════════════════════════════════════════════════
const $ = (id) => document.getElementById(id);

const uploadZone      = $('uploadZone');
const uploadTrigger   = $('uploadTrigger');
const uploadPreview   = $('uploadPreview');
const uploadThumb     = $('uploadThumb');
const fileInput       = $('fileInput');
const clearBtn        = $('clearBtn');
const bgBar           = $('bgBar');
const progFill        = $('progFill');
const progLabel       = $('progLabel');
const poseGrid        = $('poseGrid');
const dirGroup        = $('dirGroup');
const speedSlider     = $('speedSlider');
const speedVal        = $('speedVal');
const framesSlider    = $('framesSlider');
const framesVal       = $('framesVal');
const sizeSelect      = $('sizeSelect');
const layoutSelect    = $('layoutSelect');
const bakeBtn         = $('bakeBtn');
const exportPNGBtn    = $('exportPNG');
const exportJSONBtn   = $('exportJSON');
const previewCanvas   = $('previewCanvas');
const previewPlhdr    = $('previewPlaceholder');
const sheetCanvas     = $('sheetCanvas');
const sheetPlhdr      = $('sheetPlaceholder');
const poseBadge       = $('poseBadge');
const sheetBadge      = $('sheetBadge');
const saveBtn         = $('saveBtn');
const loadBtn         = $('loadBtn');
const saveStatus      = $('saveStatus');
const toast           = $('toast');

const previewCtx = previewCanvas.getContext('2d');
const sheetCtx   = sheetCanvas.getContext('2d');

// ════════════════════════════════════════════════════════
// POSE GRID BUILD
// ════════════════════════════════════════════════════════
POSES.forEach(p => {
  const btn = document.createElement('button');
  btn.className  = 'pose-btn' + (p.id === state.pose ? ' active' : '');
  btn.dataset.id = p.id;
  btn.innerHTML  = `<span class="pose-ico">${p.ico}</span><span class="pose-lbl">${p.label}</span>`;
  btn.addEventListener('click', () => selectPose(p.id));
  poseGrid.appendChild(btn);
});

// ════════════════════════════════════════════════════════
// UPLOAD HANDLING
// ════════════════════════════════════════════════════════
uploadTrigger.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) handleFile(f);
});

clearBtn.addEventListener('click', () => {
  state.charCanvas = null;
  state.bodyInfo   = null;
  uploadTrigger.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  bgBar.classList.add('hidden');
  bakeBtn.disabled = true;
  previewPlhdr.classList.remove('hidden');
  stopAnimation();
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
});

async function handleFile(file) {
  const url = URL.createObjectURL(file);
  const img  = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await new Promise(res => { img.onload = res; });
  URL.revokeObjectURL(url);

  // Show thumb immediately
  uploadThumb.src = img.src || url;
  uploadThumb.src = img.src; // after onload this is a usable src

  // Show progress bar
  bgBar.classList.remove('hidden');
  uploadTrigger.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
  bakeBtn.disabled = true;

  setProgress(0, 'Removing background…');

  try {
    const cleaned = await removeBackground(img, (p) => {
      const pct = Math.round(p * 100);
      const labels = {
        0:   'Sampling edge colours…',
        15:  'Running flood fill…',
        60:  'Refining fringe pixels…',
        80:  'Smoothing alpha edges…',
        92:  'Finalising…',
        100: 'Done!',
      };
      setProgress(p, labels[Object.keys(labels).reduce((a,b) => +b <= pct ? b : a)] ?? '');
    });

    // Update thumb to show bg-removed version
    uploadThumb.src = cleaned.toDataURL();

    state.charCanvas = cleaned;
    state.bodyInfo   = detectBodyInfo(cleaned);

    if (!state.bodyInfo) {
      showToast('No character detected — try a clearer image.', 'warn');
      return;
    }

    bgBar.classList.add('hidden');
    previewPlhdr.classList.add('hidden');
    bakeBtn.disabled = false;

    startAnimation();
    showToast('Character loaded ✓', 'ok');

  } catch (err) {
    console.error(err);
    showToast('Error processing image.', 'err');
    bgBar.classList.add('hidden');
  }
}

// ════════════════════════════════════════════════════════
// ANIMATION LOOP
// ════════════════════════════════════════════════════════
function startAnimation() {
  if (rafId) cancelAnimationFrame(rafId);
  lastTime = null;
  animPhase = 0;
  loop(0);
}

function stopAnimation() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (!state.charCanvas || !state.bodyInfo) return;

  const dt = lastTime ? (now - lastTime) / 1000 : 0;
  lastTime  = now;

  // Advance phase; most poses use 1 Hz base cycle, speed multiplies
  animPhase = (animPhase + dt * state.speed * 0.8) % 1;

  // Fit canvas to wrapper size
  const wrap = previewCanvas.parentElement;
  const size = Math.min(wrap.clientWidth, wrap.clientHeight) || 320;
  if (previewCanvas.width !== size || previewCanvas.height !== size) {
    previewCanvas.width  = size;
    previewCanvas.height = size;
  }

  renderFrame(previewCtx, state.charCanvas, state.bodyInfo,
    state.pose, animPhase, state.direction);

  poseBadge.textContent = `${state.pose.toUpperCase()} · ${state.direction.toUpperCase()}`;
}

// ════════════════════════════════════════════════════════
// CONTROLS
// ════════════════════════════════════════════════════════
function selectPose(id) {
  state.pose = id;
  animPhase  = 0;
  poseGrid.querySelectorAll('.pose-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.id === id);
  });
}

dirGroup.querySelectorAll('.tog').forEach(btn => {
  btn.addEventListener('click', () => {
    dirGroup.querySelectorAll('.tog').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.direction = btn.dataset.val;
  });
});

speedSlider.addEventListener('input', () => {
  state.speed    = parseFloat(speedSlider.value);
  speedVal.textContent = state.speed.toFixed(2) + '×';
});

framesSlider.addEventListener('input', () => {
  state.frameCount = parseInt(framesSlider.value);
  framesVal.textContent = state.frameCount;
});

sizeSelect.addEventListener('change', () => {
  state.frameSize = parseInt(sizeSelect.value);
});

layoutSelect.addEventListener('change', () => {
  state.layout = layoutSelect.value;
});

// ════════════════════════════════════════════════════════
// BAKE
// ════════════════════════════════════════════════════════
bakeBtn.addEventListener('click', () => {
  if (!state.charCanvas || !state.bodyInfo) return;
  bakeBtn.textContent = '⏳ Baking…';
  bakeBtn.disabled    = true;

  setTimeout(() => {
    try {
      state.sheetCanvas = bakeSheet(
        state.charCanvas, state.bodyInfo,
        state.pose, state.direction,
        state.frameCount, state.frameSize, state.layout
      );

      // Show in sheet canvas area
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
      showToast('Bake failed.', 'err');
    } finally {
      bakeBtn.textContent = '⚡ BAKE SPRITE SHEET';
      bakeBtn.disabled    = false;
    }
  }, 30);
});

// ════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════
// SAVE / LOAD  (localStorage)
// ════════════════════════════════════════════════════════
const STORAGE_KEY = 'spritesmithStudio_v1';

saveBtn.addEventListener('click', () => {
  try {
    if (!state.charCanvas) { showToast('Nothing to save yet.', 'warn'); return; }

    const payload = {
      charDataURL:  state.charCanvas.toDataURL(),
      pose:         state.pose,
      direction:    state.direction,
      speed:        state.speed,
      frameCount:   state.frameCount,
      frameSize:    state.frameSize,
      layout:       state.layout,
      savedAt:      new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    saveStatus.textContent = 'Saved ✓';
    saveStatus.classList.add('visible');
    setTimeout(() => saveStatus.classList.remove('visible'), 2500);
    showToast('Project saved to browser ✓', 'ok');
  } catch (e) {
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
    img.src   = payload.charDataURL;
    await new Promise(res => { img.onload = res; });

    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);

    state.charCanvas  = canvas;
    state.bodyInfo    = detectBodyInfo(canvas);

    // Restore settings
    state.pose        = payload.pose        || 'idle';
    state.direction   = payload.direction   || 'right';
    state.speed       = payload.speed       || 1.0;
    state.frameCount  = payload.frameCount  || 8;
    state.frameSize   = payload.frameSize   || 128;
    state.layout      = payload.layout      || 'horizontal';

    // Sync UI
    uploadThumb.src = payload.charDataURL;
    uploadTrigger.classList.add('hidden');
    uploadPreview.classList.remove('hidden');
    bgBar.classList.add('hidden');
    previewPlhdr.classList.add('hidden');
    bakeBtn.disabled = false;

    selectPose(state.pose);
    speedSlider.value        = state.speed;
    speedVal.textContent     = state.speed.toFixed(2) + '×';
    framesSlider.value       = state.frameCount;
    framesVal.textContent    = state.frameCount;
    sizeSelect.value         = state.frameSize;
    layoutSelect.value       = state.layout;

    dirGroup.querySelectorAll('.tog').forEach(b => {
      b.classList.toggle('active', b.dataset.val === state.direction);
    });

    startAnimation();
    showToast(`Project loaded (saved ${timeAgo(payload.savedAt)}) ✓`, 'ok');
  } catch (e) {
    console.error(e);
    showToast('Failed to load saved project.', 'err');
  }
});

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function setProgress(pct, label) {
  progFill.style.width  = (pct * 100) + '%';
  progLabel.textContent = label;
}

let toastTimer = null;
function showToast(msg, type = 'ok') {
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h/24)}d ago`;
}
