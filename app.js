// app.js — SpriteSmith Studio v5 (Puppet Engine)

import { removeBackground }           from './bgremove.js';
import { detectPuppet }               from './bodyDetect.js';
import { POSES, renderFrame }         from './animator.js';

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  puppet:      null,   // result from detectPuppet()
  cleanCanvas: null,   // bg-removed source canvas
  pose:        'idle',
  direction:   'right',
  speed:       1.0,
  frameCount:  8,
  frameSize:   128,
  layout:      'horizontal',
  sheetCanvas: null,
  adjustments: { neck: 0, shoulder: 0, waist: 0, hips: 0 },
};

let animPhase = 0;
let lastTime  = null;
let rafId     = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $             = id => document.getElementById(id);
const uploadZone    = $('uploadZone');
const uploadTrigger = $('uploadTrigger');
const uploadPreview = $('uploadPreview');
const uploadThumb   = $('uploadThumb');
const fileInput     = $('fileInput');
const clearBtn      = $('clearBtn');
const bgBar         = $('bgBar');
const progFill      = $('progFill');
const progLabel     = $('progLabel');
const skelNote      = $('skelNote');
const skelControls  = $('skelControls');
const neckSlider    = $('neckSlider');
const neckVal       = $('neckVal');
const shoulderSlider= $('shoulderSlider');
const shoulderVal   = $('shoulderVal');
const waistSlider   = $('waistSlider');
const waistVal      = $('waistVal');
const hipsSlider    = $('hipsSlider');
const hipsVal       = $('hipsVal');
const recutBtn      = $('recutBtn');
const partsPreview  = $('partsPreview');
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

const previewCtx = previewCanvas.getContext('2d');
const sheetCtx   = sheetCanvas.getContext('2d');

// ── Pose grid ─────────────────────────────────────────────────────────────────
POSES.forEach(p => {
  const btn = document.createElement('button');
  btn.className  = 'pose-btn' + (p.id === state.pose ? ' active' : '');
  btn.dataset.id = p.id;
  btn.innerHTML  = `<span class="pose-ico">${p.ico}</span><span class="pose-lbl">${p.label}</span>`;
  btn.addEventListener('click', () => selectPose(p.id));
  poseGrid.appendChild(btn);
});

function selectPose(id) {
  state.pose = id;
  animPhase  = 0;
  const oneShot = ['die','crouch'];
  // Reset one-shot poses so they replay
  poseGrid.querySelectorAll('.pose-btn').forEach(b => b.classList.toggle('active', b.dataset.id === id));
}

// ── Direction ──────────────────────────────────────────────────────────────────
dirGroup.querySelectorAll('.tog').forEach(btn =>
  btn.addEventListener('click', () => {
    dirGroup.querySelectorAll('.tog').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.direction = btn.dataset.val;
  })
);

// ── Speed ─────────────────────────────────────────────────────────────────────
speedSlider.addEventListener('input', () => {
  state.speed = parseFloat(speedSlider.value);
  speedVal.textContent = state.speed.toFixed(2) + '×';
});

// ── Frames / size / layout ────────────────────────────────────────────────────
framesSlider.addEventListener('input', () => {
  state.frameCount = parseInt(framesSlider.value);
  framesVal.textContent = state.frameCount;
});
sizeSelect.addEventListener('change',   () => { state.frameSize = parseInt(sizeSelect.value); });
layoutSelect.addEventListener('change', () => { state.layout = layoutSelect.value; });

// ── Skeleton sliders ──────────────────────────────────────────────────────────
function bindSkelSlider(slider, valEl, key) {
  slider.addEventListener('input', () => {
    const v = parseInt(slider.value);
    state.adjustments[key] = v;
    valEl.textContent = (v >= 0 ? '+' : '') + v + 'px';
  });
}
bindSkelSlider(neckSlider,     neckVal,     'neck');
bindSkelSlider(shoulderSlider, shoulderVal, 'shoulder');
bindSkelSlider(waistSlider,    waistVal,    'waist');
bindSkelSlider(hipsSlider,     hipsVal,     'hips');

recutBtn.addEventListener('click', async () => {
  if (!state.cleanCanvas) return;
  recutBtn.textContent = '⏳ Re-cutting…';
  recutBtn.disabled    = true;
  bgBar.classList.remove('hidden');
  await recutCharacter(state.cleanCanvas);
  bgBar.classList.add('hidden');
  recutBtn.textContent = '✂ Re-cut Parts';
  recutBtn.disabled    = false;
});

// ── Upload ────────────────────────────────────────────────────────────────────
uploadTrigger.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) handleFile(f);
});

clearBtn.addEventListener('click', resetAll);

function resetAll() {
  state.puppet = null; state.cleanCanvas = null; state.sheetCanvas = null;
  uploadTrigger.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  bgBar.classList.add('hidden');
  bakeBtn.disabled = exportPNGBtn.disabled = exportJSONBtn.disabled = true;
  previewPlhdr.classList.remove('hidden');
  sheetPlhdr.classList.remove('hidden');
  skelNote.textContent = 'Upload a character to detect body parts.';
  skelControls.classList.add('hidden');
  stopAnimation();
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
}

async function handleFile(file) {
  const objURL = URL.createObjectURL(file);
  const img    = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objURL; });

  uploadThumb.src = objURL;
  uploadTrigger.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
  bgBar.classList.remove('hidden');
  bakeBtn.disabled = true;

  setProgress(0, 'Removing background…');

  let cleaned;
  try {
    cleaned = await removeBackground(img, p => setProgress(p * 0.50, bgLabel(p)));
    URL.revokeObjectURL(objURL);
    uploadThumb.src = cleaned.toDataURL();
  } catch (e) {
    console.error(e); showToast('Background removal failed.', 'err');
    bgBar.classList.add('hidden'); return;
  }

  state.cleanCanvas = cleaned;
  await recutCharacter(cleaned);
}

async function recutCharacter(cleaned) {
  setProgress(0.52, 'Detecting skeleton…');
  await tick();

  let puppet;
  try {
    puppet = await detectPuppet(cleaned, state.adjustments, p => {
      setProgress(0.50 + p * 0.50, skelLabel(p));
    });
  } catch (e) {
    console.error(e); showToast('Skeleton detection failed.', 'err');
    bgBar.classList.add('hidden'); return;
  }

  if (!puppet) {
    showToast('No character detected. Try a clearer image.', 'warn');
    bgBar.classList.add('hidden'); return;
  }

  state.puppet = puppet;
  bgBar.classList.add('hidden');
  previewPlhdr.classList.add('hidden');
  bakeBtn.disabled = false;

  // Show skeleton tuning
  skelNote.textContent = `${Object.keys(puppet.parts).length} body parts detected.`;
  skelControls.classList.remove('hidden');
  renderPartsChips(puppet);

  startAnimation();
  showToast(`Puppet ready — ${Object.keys(puppet.parts).length} parts ✓`, 'ok');
}

function renderPartsChips(puppet) {
  partsPreview.innerHTML = '';
  const names = { hair:'hair', head:'head', torso:'torso', armA:'arm A', armB:'arm B', hips:'hips', legA:'leg A', legB:'leg B' };
  for (const [id, label] of Object.entries(names)) {
    const div = document.createElement('div');
    div.className = 'part-chip ' + (puppet.parts[id]?.canvas ? 'ok' : 'miss');
    div.textContent = label;
    partsPreview.appendChild(div);
  }
}

// ── Animation loop ────────────────────────────────────────────────────────────
function startAnimation() {
  stopAnimation();
  lastTime = null; animPhase = 0;
  rafId = requestAnimationFrame(loop);
}
function stopAnimation() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (!state.puppet) return;

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
  const sz   = Math.min(wrap.clientWidth  || 400, wrap.clientHeight || 400, 500);
  if (previewCanvas.width !== sz || previewCanvas.height !== sz) {
    previewCanvas.width = previewCanvas.height = sz;
  }

  renderFrame(previewCtx, state.puppet, state.pose, animPhase, state.direction);
  poseBadge.textContent = `${state.pose.toUpperCase()} · ${state.direction.toUpperCase()}`;
}

// ── Bake ──────────────────────────────────────────────────────────────────────
bakeBtn.addEventListener('click', () => {
  if (!state.puppet) return;
  bakeBtn.textContent = '⏳ Baking…';
  bakeBtn.disabled    = true;

  setTimeout(() => {
    try {
      const fs    = state.frameSize;
      const count = state.frameCount;
      const cols  = state.layout === 'grid' ? Math.ceil(Math.sqrt(count)) : count;
      const rows  = state.layout === 'grid' ? Math.ceil(count / cols) : 1;

      const sheet = document.createElement('canvas');
      sheet.width  = cols * fs;
      sheet.height = rows * fs;
      const sCtx   = sheet.getContext('2d');
      sCtx.clearRect(0, 0, sheet.width, sheet.height);

      const tmp   = document.createElement('canvas');
      tmp.width   = tmp.height = fs;
      const tCtx  = tmp.getContext('2d');

      for (let f = 0; f < count; f++) {
        const t   = f / count;
        const col = f % cols;
        const row = Math.floor(f / cols);
        tCtx.clearRect(0, 0, fs, fs);
        renderFrame(tCtx, state.puppet, state.pose, t, state.direction);
        sCtx.drawImage(tmp, col * fs, row * fs);
      }

      state.sheetCanvas = sheet;
      sheetCanvas.width  = sheet.width;
      sheetCanvas.height = sheet.height;
      sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
      sheetCtx.drawImage(sheet, 0, 0);
      sheetPlhdr.classList.add('hidden');
      sheetBadge.textContent = `${count} frames · ${sheet.width}×${sheet.height}px`;
      exportPNGBtn.disabled  = false;
      exportJSONBtn.disabled = false;
      showToast(`Sprite sheet baked (${count} frames) ✓`, 'ok');
    } catch (e) {
      console.error(e); showToast('Bake failed — see console.', 'err');
    } finally {
      bakeBtn.textContent = '⚡ BAKE SPRITE SHEET';
      bakeBtn.disabled    = false;
    }
  }, 30);
});

// ── Export ────────────────────────────────────────────────────────────────────
exportPNGBtn.addEventListener('click', () => {
  if (!state.sheetCanvas) return;
  state.sheetCanvas.toBlob(blob => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `spritesmith_${state.pose}_${state.direction}.png`,
    });
    a.click();
  }, 'image/png');
  showToast('PNG exported ↓', 'ok');
});

exportJSONBtn.addEventListener('click', () => {
  if (!state.sheetCanvas) return;
  const fs    = state.frameSize;
  const count = state.frameCount;
  const cols  = state.layout === 'grid' ? Math.ceil(Math.sqrt(count)) : count;
  const fname = `spritesmith_${state.pose}_${state.direction}`;

  const frames = Array.from({ length: count }, (_, i) => ({
    filename: `${fname}_${String(i).padStart(3,'0')}`,
    frame: { x: (i % cols) * fs, y: Math.floor(i / cols) * fs, w: fs, h: fs },
    rotated: false, trimmed: false,
    spriteSourceSize: { x:0, y:0, w:fs, h:fs },
    sourceSize: { w:fs, h:fs },
    duration: 100,
  }));

  const json = JSON.stringify({
    frames,
    meta: {
      app:'SpriteSmith Studio', version:'5.0',
      image:`${fname}.png`, format:'RGBA8888',
      size:{ w:state.sheetCanvas.width, h:state.sheetCanvas.height },
      pose:state.pose, direction:state.direction,
      frameCount:count, frameSize:fs, layout:state.layout,
      date:new Date().toISOString(),
    },
  }, null, 2);

  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([json], { type:'application/json' })),
    download: `${fname}.json`,
  }).click();

  exportPNGBtn.click();
  showToast('JSON + PNG exported ↓', 'ok');
});

// ── Save / Load ───────────────────────────────────────────────────────────────
const STORAGE_KEY = 'spritesmithStudio_v5';

saveBtn.addEventListener('click', () => {
  if (!state.cleanCanvas) { showToast('Upload a character first.', 'warn'); return; }
  try {
    const payload = {
      charDataURL:  state.cleanCanvas.toDataURL('image/png'),
      adjustments:  state.adjustments,
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
    showToast('Project saved ✓', 'ok');
  } catch (e) {
    console.error(e); showToast('Save failed (storage full?)', 'err');
  }
});

loadBtn.addEventListener('click', async () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { showToast('No saved project found.', 'warn'); return; }
  try {
    const p = JSON.parse(raw);

    // Restore settings
    state.adjustments  = p.adjustments  || { neck:0, shoulder:0, waist:0, hips:0 };
    state.pose         = p.pose         || 'idle';
    state.direction    = p.direction    || 'right';
    state.speed        = p.speed        || 1.0;
    state.frameCount   = p.frameCount   || 8;
    state.frameSize    = p.frameSize    || 128;
    state.layout       = p.layout       || 'horizontal';

    // Sync UI
    selectPose(state.pose);
    speedSlider.value       = state.speed;
    speedVal.textContent    = state.speed.toFixed(2) + '×';
    framesSlider.value      = state.frameCount;
    framesVal.textContent   = state.frameCount;
    sizeSelect.value        = state.frameSize;
    layoutSelect.value      = state.layout;
    neckSlider.value        = state.adjustments.neck;
    shoulderSlider.value    = state.adjustments.shoulder;
    waistSlider.value       = state.adjustments.waist;
    hipsSlider.value        = state.adjustments.hips;
    neckVal.textContent     = fmtAdj(state.adjustments.neck);
    shoulderVal.textContent = fmtAdj(state.adjustments.shoulder);
    waistVal.textContent    = fmtAdj(state.adjustments.waist);
    hipsVal.textContent     = fmtAdj(state.adjustments.hips);
    dirGroup.querySelectorAll('.tog').forEach(b =>
      b.classList.toggle('active', b.dataset.val === state.direction));

    // Reload character
    showToast('Loading saved project…', 'ok');
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = p.charDataURL; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);

    uploadThumb.src = p.charDataURL;
    uploadTrigger.classList.add('hidden');
    uploadPreview.classList.remove('hidden');
    bgBar.classList.remove('hidden');

    state.cleanCanvas = c;
    await recutCharacter(c);

    showToast(`Loaded (saved ${timeAgo(p.savedAt)}) ✓`, 'ok');
  } catch (e) {
    console.error(e); showToast('Load failed.', 'err');
    bgBar.classList.add('hidden');
  }
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function setProgress(pct, label) {
  progFill.style.width  = (Math.min(pct, 1) * 100) + '%';
  if (label) progLabel.textContent = label;
}

const bgLabel  = p => p < 0.2 ? 'Sampling edge colours…' : p < 0.6 ? 'Removing background…' : p < 0.9 ? 'Smoothing edges…' : 'Done!';
const skelLabel= p => p < 0.3 ? 'Scanning body profile…' : p < 0.6 ? 'Finding joints…' : p < 0.9 ? 'Cutting parts…' : 'Finalising…';
const fmtAdj   = v => (v >= 0 ? '+' : '') + v + 'px';

let toastTimer = null;
function showToast(msg, type = 'ok') {
  toastEl.textContent = msg;
  toastEl.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function tick() { return new Promise(r => setTimeout(r, 0)); }

// Resize observer keeps preview square
const ro = new ResizeObserver(() => {
  const wrap = previewCanvas.parentElement;
  const sz   = Math.min(wrap.clientWidth || 400, 500);
  previewCanvas.width = previewCanvas.height = sz;
  if (state.puppet) renderFrame(previewCtx, state.puppet, state.pose, animPhase, state.direction);
});
ro.observe(previewCanvas.parentElement);
