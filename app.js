// app.js — SpriteSmith Studio  (v2 — skeletal body detection)

import { removeBackground }                  from './bgremove.js';
import { detectBodyParts }                   from './bodyDetect.js';
import { POSES, renderFrame }                from './animator.js';
import { bakeSheet, exportPNG, exportJSON }  from './spritesheet.js';

// ════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════
let state = {
  bodyData:    null,   // { parts, joints, bb, isFront, landmarks }
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

// ════════════════════════════════════════════════════════
// ELEMENT REFS
// ════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

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

const previewCtx = previewCanvas.getContext('2d');
const sheetCtx   = sheetCanvas.getContext('2d');

// ════════════════════════════════════════════════════════
// POSE GRID
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
// UPLOAD
// ════════════════════════════════════════════════════════
uploadTrigger.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});
uploadZone.addEventListener('dragover', e => {
  e.preventDefault(); uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) handleFile(f);
});

clearBtn.addEventListener('click', resetCharacter);

function resetCharacter() {
  state.bodyData = null;
  uploadTrigger.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  bgBar.classList.add('hidden');
  bakeBtn.disabled = true;
  previewPlhdr.classList.remove('hidden');
  stopAnimation();
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
}

async function handleFile(file) {
  const objectURL = URL.createObjectURL(file);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objectURL; });

  // Show raw thumb immediately while processing
  uploadThumb.src = objectURL;
  bgBar.classList.remove('hidden');
  uploadTrigger.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
  bakeBtn.disabled = true;

  setProgress(0, 'Removing background…');

  let cleaned;
  try {
    cleaned = await removeBackground(img, p => {
      const stages = [[0,'Sampling edge colours…'],[0.15,'Flood-filling background…'],
                      [0.60,'Cleaning fringe pixels…'],[0.80,'Smoothing alpha edges…'],
                      [0.92,'Finalising…'],[1,'Done!']];
      const lbl = stages.reduce((a,b) => p >= b[0] ? b : a)[1];
      setProgress(p * 0.50, lbl); // bg removal = first 50%
    });
  } catch (e) {
    console.error(e);
    showToast('Background removal failed.', 'err');
    bgBar.classList.add('hidden');
    return;
  }

  // Update thumb to cleaned version
  uploadThumb.src = cleaned.toDataURL();
  setProgress(0.52, 'Analysing body structure…');
  await tick();

  let bodyData;
  try {
    bodyData = await detectBodyParts(cleaned, p => {
      setProgress(0.50 + p * 0.50, bodyDetectLabel(p));
    });
  } catch (e) {
    console.error(e);
    showToast('Body detection failed — try a clearer character image.', 'err');
    bgBar.classList.add('hidden');
    return;
  }

  if (!bodyData) {
    showToast('No character detected — try a front-facing sprite.', 'warn');
    bgBar.classList.add('hidden');
    return;
  }

  state.bodyData = bodyData;

  bgBar.classList.add('hidden');
  previewPlhdr.classList.add('hidden');
  bakeBtn.disabled = false;

  // Show detection debug badge
  const pcount = Object.keys(bodyData.parts).length;
  showToast(`Character loaded — ${pcount} body parts detected ✓`, 'ok');

  URL.revokeObjectURL(objectURL);
  startAnimation();
}

function bodyDetectLabel(p) {
  if (p < 0.20) return 'Scanning row profiles…';
  if (p < 0.40) return 'Finding anatomical landmarks…';
  if (p < 0.60) return 'Assigning pixels to body parts…';
  if (p < 0.80) return 'Extracting part canvases…';
  return 'Computing joint anchors…';
}

// ════════════════════════════════════════════════════════
// ANIMATION LOOP
// ════════════════════════════════════════════════════════
function startAnimation() {
  stopAnimation();
  lastTime  = null;
  animPhase = 0;
  rafId = requestAnimationFrame(loop);
}

function stopAnimation() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (!state.bodyData) return;

  const dt  = lastTime ? (now - lastTime) / 1000 : 0;
  lastTime  = now;

  // Advance phase based on speed; die/crouch play once then hold
  const oneShot = ['die', 'crouch'];
  if (oneShot.includes(state.pose)) {
    animPhase = Math.min(animPhase + dt * state.speed * 0.55, 0.999);
  } else {
    animPhase = (animPhase + dt * state.speed * 0.75) % 1;
  }

  // Resize canvas to wrapper
  const wrap = previewCanvas.parentElement;
  const sz   = Math.min(wrap.clientWidth || 320, wrap.clientHeight || 320);
  if (previewCanvas.width !== sz || previewCanvas.height !== sz) {
    previewCanvas.width = previewCanvas.height = sz;
  }

  renderFrame(previewCtx, state.bodyData, state.pose, animPhase, state.direction);
  poseBadge.textContent = `${state.pose.toUpperCase()} · ${state.direction.toUpperCase()}`;
}

// ════════════════════════════════════════════════════════
// CONTROLS
// ════════════════════════════════════════════════════════
function selectPose(id) {
  state.pose = id;
  animPhase  = 0;
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

sizeSelect.addEventListener('change',  () => { state.frameSize = parseInt(sizeSelect.value); });
layoutSelect.addEventListener('change', () => { state.layout = layoutSelect.value; });

// ════════════════════════════════════════════════════════
// BAKE
// ════════════════════════════════════════════════════════
bakeBtn.addEventListener('click', () => {
  if (!state.bodyData) return;
  bakeBtn.textContent = '⏳ Baking…';
  bakeBtn.disabled    = true;

  setTimeout(() => {
    try {
      state.sheetCanvas = bakeSheet(
        state.bodyData, state.pose, state.direction,
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
      showToast('Bake failed — see console for details.', 'err');
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
// SAVE / LOAD
// ════════════════════════════════════════════════════════
const STORAGE_KEY = 'spritesmithStudio_v2';

saveBtn.addEventListener('click', () => {
  if (!state.bodyData) { showToast('Nothing to save yet.', 'warn'); return; }
  try {
    // Serialise only what we can reproduce: the cleaned character PNG + settings
    const charDataURL = state.bodyData.parts.torso?.canvas.toDataURL()
      ?? Object.values(state.bodyData.parts)[0]?.canvas.toDataURL()
      ?? '';

    // Save the composite — re-render all parts onto one canvas for storage
    const comp = compositeCharacter(state.bodyData);
    const payload = {
      charDataURL: comp.toDataURL(),
      pose: state.pose, direction: state.direction, speed: state.speed,
      frameCount: state.frameCount, frameSize: state.frameSize,
      layout: state.layout, savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    saveStatus.textContent = 'Saved ✓';
    saveStatus.classList.add('visible');
    setTimeout(() => saveStatus.classList.remove('visible'), 2500);
    showToast('Project saved ✓', 'ok');
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
    showToast('Loading…', 'ok');

    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = rej;
      img.src = payload.charDataURL;
    });

    // The saved dataURL is already bg-removed — put it on a canvas and re-detect
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);

    bgBar.classList.remove('hidden');
    setProgress(0, 'Re-detecting body parts…');
    uploadTrigger.classList.add('hidden');
    uploadPreview.classList.remove('hidden');
    uploadThumb.src = payload.charDataURL;

    const bodyData = await detectBodyParts(c, p => setProgress(p, bodyDetectLabel(p)));
    if (!bodyData) { showToast('Could not detect parts from saved image.', 'err'); bgBar.classList.add('hidden'); return; }

    state.bodyData = bodyData;

    // Restore settings
    state.pose       = payload.pose       || 'idle';
    state.direction  = payload.direction  || 'right';
    state.speed      = payload.speed      || 1.0;
    state.frameCount = payload.frameCount || 8;
    state.frameSize  = payload.frameSize  || 128;
    state.layout     = payload.layout     || 'horizontal';

    // Sync UI controls
    selectPose(state.pose);
    speedSlider.value = state.speed;
    speedVal.textContent = state.speed.toFixed(2) + '×';
    framesSlider.value = state.frameCount;
    framesVal.textContent = state.frameCount;
    sizeSelect.value = state.frameSize;
    layoutSelect.value = state.layout;
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

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════

/** Flatten all detected parts back onto one canvas for save storage. */
function compositeCharacter(bodyData) {
  const { bb } = bodyData;
  const c = document.createElement('canvas');
  c.width = bb.w; c.height = bb.h;
  const ctx = c.getContext('2d');
  const order = ['legL','legR','hips','torso','armL','armR','head','hair'];
  for (const pid of order) {
    const p = bodyData.parts[pid];
    if (!p) continue;
    ctx.drawImage(p.canvas,
      p.originX - bb.x - p.pad,
      p.originY - bb.y - p.pad,
      p.canvas.width, p.canvas.height);
  }
  return c;
}

function setProgress(pct, label) {
  progFill.style.width  = (Math.min(pct, 1) * 100) + '%';
  progLabel.textContent = label;
}

let toastTimer = null;
const toastEl = document.getElementById('toast');
function showToast(msg, type = 'ok') {
  toastEl.textContent = msg;
  toastEl.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

function timeAgo(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (d < 1)  return 'just now';
  if (d < 60) return `${d}m ago`;
  const h = Math.floor(d / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`;
}

function tick() { return new Promise(r => setTimeout(r, 0)); }
