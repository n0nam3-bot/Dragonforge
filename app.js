// app.js — SpriteSmith Studio rebuild with lasso/magic-wand part selection

import { removeBackground } from './bgremove.js';
import {
  JOINT_DEFS,
  PART_LIBRARY,
  autoPlaceJoints,
  computeBB,
  computePrincipalAxis,
  buildPuppet,
} from './bodyDetect.js';
import { SkelEditor } from './skelEditor.js';
import { POSES, renderFrame } from './animator.js';

const $ = (id) => document.getElementById(id);
const S = {
  sourceCanvas: null,
  cleanCanvas: null,
  bb: null,
  axis: null,
  joints: null,
  defaultJoints: null,
  parts: [],
  puppet: null,
  editor: null,
  pose: 'walk',
  direction: 'right',
  speed: 1,
  frameCount: 8,
  frameSize: 128,
  layout: 'horizontal',
  sheetCanvas: null,
};
let animPhase = 0;
let lastTime = null;
let rafId = null;

// DOM
const fileInput = $('fileInput');
const uploadZone = $('uploadZone');
const uploadTrigger = $('uploadTrigger');
const uploadPreview = $('uploadPreview');
const uploadThumb = $('uploadThumb');
const clearBtn = $('clearBtn');
const bgBar = $('bgBar');
const progFill = $('progFill');
const progLabel = $('progLabel');
const skelNote = $('skelNote');
const skelControls = $('skelControls');
const showRegions = $('showRegions');
const showSkeleton = $('showSkeleton');
const resetJointsBtn = $('resetJointsBtn');
const applyBtn = $('applyBtn');
const partList = $('partList');
const addPartBtn = $('addPartBtn');
const partType = $('partType');
const poseGrid = $('poseGrid');
const dirGroup = $('dirGroup');
const speedSlider = $('speedSlider');
const speedVal = $('speedVal');
const framesSlider = $('framesSlider');
const framesVal = $('framesVal');
const sizeSelect = $('sizeSelect');
const layoutSelect = $('layoutSelect');
const bakeBtn = $('bakeBtn');
const exportPNGBtn = $('exportPNG');
const exportJSONBtn = $('exportJSON');
const skelCanvas = $('skelCanvas');
const skelPlaceholder = $('skelPlaceholder');
const previewCanvas = $('previewCanvas');
const previewPlaceholder = $('previewPlaceholder');
const sheetCanvas = $('sheetCanvas');
const sheetPlaceholder = $('sheetPlaceholder');
const poseBadge = $('poseBadge');
const sheetBadge = $('sheetBadge');
const saveBtn = $('saveBtn');
const loadBtn = $('loadBtn');
const saveStatus = $('saveStatus');
const toast = $('toast');
const editModeLabel = $('editModeLabel');
const editorModeBtns = [...document.querySelectorAll('[data-editor-mode]')];

const previewCtx = previewCanvas.getContext('2d');
const sheetCtx = sheetCanvas.getContext('2d');

// populate pose buttons
for (const p of POSES) {
  const b = document.createElement('button');
  b.className = 'pose-btn' + (p.id === S.pose ? ' active' : '');
  b.dataset.id = p.id;
  b.innerHTML = `<span class="pose-ico">${p.ico}</span><span class="pose-lbl">${p.label}</span>`;
  b.addEventListener('click', () => setPose(p.id));
  poseGrid.appendChild(b);
}

// Part type options
for (const p of PART_LIBRARY) {
  const opt = document.createElement('option');
  opt.value = p.id;
  opt.textContent = p.label;
  partType.appendChild(opt);
}

// Initial parts suggestion list (optional, user can delete all)
S.parts = [
  makePart('head'),
  makePart('torso'),
  makePart('upperArmL'),
  makePart('lowerArmL'),
  makePart('handL'),
  makePart('upperArmR'),
  makePart('lowerArmR'),
  makePart('handR'),
  makePart('thighL'),
  makePart('shinL'),
  makePart('footL'),
  makePart('thighR'),
  makePart('shinR'),
  makePart('footR'),
];
renderPartList();

// Controls
showRegions.addEventListener('change', () => S.editor?.setShowRegions(showRegions.checked));
showSkeleton.addEventListener('change', () => S.editor?.setShowSkeleton(showSkeleton.checked));
resetJointsBtn.addEventListener('click', () => {
  if (S.editor && S.defaultJoints) S.editor.resetJoints(S.defaultJoints);
});
applyBtn.addEventListener('click', buildRig);
addPartBtn.addEventListener('click', () => {
  S.parts.push(makePart(partType.value));
  renderPartList();
  syncEditorParts();
});

editorModeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    editorModeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.editorMode;
    editModeLabel.textContent = mode.toUpperCase();
    S.editor?.setMode(mode);
  });
});

dirGroup.querySelectorAll('.tog').forEach(btn => btn.addEventListener('click', () => {
  dirGroup.querySelectorAll('.tog').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.direction = btn.dataset.val;
}));

speedSlider.addEventListener('input', () => {
  S.speed = parseFloat(speedSlider.value);
  speedVal.textContent = S.speed.toFixed(2) + '×';
});
framesSlider.addEventListener('input', () => {
  S.frameCount = parseInt(framesSlider.value, 10);
  framesVal.textContent = String(S.frameCount);
});
sizeSelect.addEventListener('change', () => S.frameSize = parseInt(sizeSelect.value, 10));
layoutSelect.addEventListener('change', () => S.layout = layoutSelect.value);

// Upload handling
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

function makePart(typeId) {
  const lib = PART_LIBRARY.find(p => p.id === typeId) || PART_LIBRARY[0];
  return {
    id: crypto.randomUUID(),
    typeId: lib.id,
    label: lib.label,
    parent: null,
    anchorJoint: lib.anchorJoint,
    maskCanvas: null,
    enabled: true,
    color: '#60a5fa',
  };
}

function resetAll() {
  S.sourceCanvas = S.cleanCanvas = S.bb = S.axis = S.defaultJoints = S.joints = S.puppet = null;
  if (S.editor) { S.editor.destroy(); S.editor = null; }
  stopAnimation();
  uploadTrigger.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  bgBar.classList.add('hidden');
  skelPlaceholder.classList.remove('hidden');
  previewPlaceholder.classList.remove('hidden');
  sheetPlaceholder.classList.remove('hidden');
  skelNote.textContent = 'Upload a character to begin.';
  skelControls.classList.add('hidden');
  applyBtn.disabled = bakeBtn.disabled = exportPNGBtn.disabled = exportJSONBtn.disabled = true;
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
}

async function handleFile(file) {
  const obj = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = obj; });

  uploadThumb.src = obj;
  uploadTrigger.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
  bgBar.classList.remove('hidden');
  setProgress(0, 'Removing background…');

  let clean;
  try {
    clean = await removeBackground(img, p => setProgress(p * 0.9, progressLabel(p)));
  } catch (err) {
    console.warn('Background removal failed, using source image.', err);
    clean = document.createElement('canvas');
    clean.width = img.naturalWidth;
    clean.height = img.naturalHeight;
    clean.getContext('2d').drawImage(img, 0, 0);
  }
  URL.revokeObjectURL(obj);

  S.sourceCanvas = clean;
  S.cleanCanvas = clean;
  S.bb = computeBB(clean);
  if (!S.bb) {
    showToast('No visible subject detected.', 'err');
    bgBar.classList.add('hidden');
    return;
  }
  S.axis = computePrincipalAxis(clean);
  S.defaultJoints = autoPlaceJoints(S.bb, S.axis);
  S.joints = JSON.parse(JSON.stringify(S.defaultJoints));

  skelPlaceholder.classList.add('hidden');
  initEditor();
  skelControls.classList.remove('hidden');
  applyBtn.disabled = false;
  bakeBtn.disabled = true;
  exportPNGBtn.disabled = exportJSONBtn.disabled = true;
  bgBar.classList.add('hidden');
  setProgress(1, 'Ready');
  showToast('Character loaded. Draw a lasso around each part, or use wand.', 'ok');
}

function initEditor() {
  if (S.editor) S.editor.destroy();
  fitSkelCanvas();
  S.editor = new SkelEditor(
    skelCanvas,
    S.cleanCanvas,
    S.joints,
    S.parts,
    (j) => { S.joints = j; },
    (parts) => { S.parts = parts; renderPartList(); }
  );
  S.editor.setShowRegions(showRegions.checked);
  S.editor.setShowSkeleton(showSkeleton.checked);
  S.editor.setMode('joint');
  editModeLabel.textContent = 'JOINT';
  editorModeBtns.forEach(b => b.classList.toggle('active', b.dataset.editorMode === 'joint'));
  syncEditorParts();
}

function fitSkelCanvas() {
  const wrap = skelCanvas.parentElement;
  skelCanvas.width = Math.max(240, wrap.clientWidth || 500);
  skelCanvas.height = Math.max(240, wrap.clientHeight || 500);
}

function renderPartList() {
  partList.innerHTML = '';
  const jointOptions = JOINT_DEFS.map(j => `<option value="${j.id}">${j.label}</option>`).join('');
  const partOptions = PART_LIBRARY.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
  for (const part of S.parts) {
    const row = document.createElement('div');
    row.className = 'part-row';
    row.innerHTML = `
      <div class="part-main">
        <input class="part-enable" type="checkbox" ${part.enabled ? 'checked' : ''}>
        <select class="part-type">${partOptions}</select>
        <input class="part-label" value="${escapeHtml(part.label)}" />
      </div>
      <div class="part-sub">
        <select class="part-anchor">${jointOptions}</select>
        <button class="btn-mini btn-part-select">Select</button>
        <button class="btn-mini btn-part-lasso">Lasso</button>
        <button class="btn-mini btn-part-wand">Wand</button>
        <button class="btn-mini btn-part-clear">Clear</button>
        <button class="btn-mini btn-part-del">Delete</button>
      </div>
      <div class="part-hint">${part.maskCanvas ? `${part.maskCanvas.width}×${part.maskCanvas.height} mask` : 'No mask yet'}</div>
    `;
    const typeSel = row.querySelector('.part-type');
    const lblInput = row.querySelector('.part-label');
    const anchorSel = row.querySelector('.part-anchor');
    const enable = row.querySelector('.part-enable');
    typeSel.value = part.typeId;
    anchorSel.value = part.anchorJoint || 'pelvis';
    enable.checked = part.enabled !== false;

    typeSel.addEventListener('change', () => {
      part.typeId = typeSel.value;
      const lib = PART_LIBRARY.find(p => p.id === part.typeId);
      part.label = lib?.label || part.label;
      part.anchorJoint = lib?.anchorJoint || part.anchorJoint;
      renderPartList();
      syncEditorParts();
    });
    lblInput.addEventListener('input', () => { part.label = lblInput.value; syncEditorParts(); });
    anchorSel.addEventListener('change', () => { part.anchorJoint = anchorSel.value; syncEditorParts(); });
    enable.addEventListener('change', () => { part.enabled = enable.checked; syncEditorParts(); });
    row.querySelector('.btn-part-select').addEventListener('click', () => {
      S.editor?.setSelectedPart(part.id);
    });
    row.querySelector('.btn-part-lasso').addEventListener('click', () => {
      S.editor?.setSelectedPart(part.id);
      S.editor?.setMode('lasso');
      setEditorModeButton('lasso');
      editModeLabel.textContent = 'LASSO';
      showToast(`Trace ${part.label} with the lasso.`, 'ok');
    });
    row.querySelector('.btn-part-wand').addEventListener('click', () => {
      S.editor?.setSelectedPart(part.id);
      S.editor?.setMode('wand');
      setEditorModeButton('wand');
      editModeLabel.textContent = 'WAND';
      showToast(`Click inside ${part.label} to auto-select.`, 'ok');
    });
    row.querySelector('.btn-part-clear').addEventListener('click', () => {
      part.maskCanvas = null;
      syncEditorParts();
    });
    row.querySelector('.btn-part-del').addEventListener('click', () => {
      S.parts = S.parts.filter(p => p.id !== part.id);
      renderPartList();
      syncEditorParts();
    });
    partList.appendChild(row);
  }
}

function setEditorModeButton(mode) {
  editorModeBtns.forEach(b => b.classList.toggle('active', b.dataset.editorMode === mode));
}

function syncEditorParts() {
  if (S.editor) S.editor.setParts(S.parts);
}

function setPose(id) {
  S.pose = id;
  animPhase = 0;
  poseGrid.querySelectorAll('.pose-btn').forEach(b => b.classList.toggle('active', b.dataset.id === id));
}

function buildRig() {
  if (!S.cleanCanvas || !S.joints) return;
  applyBtn.disabled = true;
  applyBtn.textContent = '⏳ Building…';
  setTimeout(() => {
    try {
      S.puppet = buildPuppet(S.cleanCanvas, S.joints, S.parts);
      if (!S.puppet) throw new Error('Puppet build failed');
      previewPlaceholder.classList.add('hidden');
      bakeBtn.disabled = false;
      exportPNGBtn.disabled = false;
      exportJSONBtn.disabled = false;
      startAnimation();
      showToast(`Rig built with ${Object.keys(S.puppet.parts).length} parts.`, 'ok');
    } catch (err) {
      console.error(err);
      showToast('Rig build failed.', 'err');
    } finally {
      applyBtn.textContent = '✓ Apply';
      applyBtn.disabled = false;
    }
  }, 30);
}

function startAnimation() {
  stopAnimation();
  lastTime = null;
  animPhase = 0;
  rafId = requestAnimationFrame(loop);
}

function stopAnimation() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (!S.puppet) return;
  const dt = lastTime ? (now - lastTime) / 1000 : 0;
  lastTime = now;
  const oneShot = ['jump', 'attack', 'hurt', 'crouch', 'die'];
  if (oneShot.includes(S.pose)) animPhase = Math.min(animPhase + dt * S.speed * 0.55, 0.999);
  else animPhase = (animPhase + dt * S.speed * 0.72) % 1;
  const wrap = previewCanvas.parentElement;
  const sz = Math.min(wrap.clientWidth || 320, wrap.clientHeight || 320, 480);
  if (previewCanvas.width !== sz || previewCanvas.height !== sz) previewCanvas.width = previewCanvas.height = sz;
  renderFrame(previewCtx, S.puppet, S.pose, animPhase, S.direction);
  poseBadge.textContent = `${S.pose.toUpperCase()} · ${S.direction.toUpperCase()}`;
}

bakeBtn.addEventListener('click', () => {
  if (!S.puppet) return;
  bakeBtn.disabled = true;
  bakeBtn.textContent = '⏳ Baking…';
  setTimeout(() => {
    const fs = S.frameSize;
    const count = S.frameCount;
    const cols = S.layout === 'grid' ? Math.ceil(Math.sqrt(count)) : count;
    const rows = S.layout === 'grid' ? Math.ceil(count / cols) : 1;
    const sheet = document.createElement('canvas');
    sheet.width = cols * fs;
    sheet.height = rows * fs;
    const sCtx = sheet.getContext('2d');
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = fs;
    const tCtx = tmp.getContext('2d');
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const col = i % cols;
      const row = Math.floor(i / cols);
      tCtx.clearRect(0, 0, fs, fs);
      renderFrame(tCtx, S.puppet, S.pose, t, S.direction);
      sCtx.drawImage(tmp, col * fs, row * fs);
    }
    S.sheetCanvas = sheet;
    sheetCanvas.width = sheet.width;
    sheetCanvas.height = sheet.height;
    sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
    sheetCtx.drawImage(sheet, 0, 0);
    sheetPlaceholder.classList.add('hidden');
    sheetBadge.textContent = `${count} frames · ${sheet.width}×${sheet.height}`;
    showToast('Sprite sheet baked.', 'ok');
    bakeBtn.disabled = false;
    bakeBtn.textContent = '⚡ BAKE SPRITE SHEET';
  }, 20);
});

exportPNGBtn.addEventListener('click', () => {
  if (!S.sheetCanvas) return;
  S.sheetCanvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `spritesmith_${S.pose}_${S.direction}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
});

exportJSONBtn.addEventListener('click', () => {
  if (!S.sheetCanvas) return;
  const fs = S.frameSize;
  const count = S.frameCount;
  const cols = S.layout === 'grid' ? Math.ceil(Math.sqrt(count)) : count;
  const base = `spritesmith_${S.pose}_${S.direction}`;
  const json = {
    frames: Array.from({ length: count }, (_, i) => ({
      filename: `${base}_${String(i).padStart(3, '0')}`,
      frame: { x: (i % cols) * fs, y: Math.floor(i / cols) * fs, w: fs, h: fs },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: fs, h: fs },
      sourceSize: { w: fs, h: fs },
      duration: 100,
    })),
    meta: {
      app: 'SpriteSmith Studio',
      version: '7.0',
      image: `${base}.png`,
      format: 'RGBA8888',
      size: { w: S.sheetCanvas.width, h: S.sheetCanvas.height },
      pose: S.pose,
      direction: S.direction,
      frameCount: count,
      frameSize: fs,
      layout: S.layout,
      date: new Date().toISOString(),
      parts: S.parts.map(p => ({ id: p.id, typeId: p.typeId, label: p.label, anchorJoint: p.anchorJoint, enabled: p.enabled })),
    }
  };
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${base}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

const KEY = 'spritesmithStudio_v7';
saveBtn.addEventListener('click', () => {
  if (!S.cleanCanvas) { showToast('Upload a character first.', 'warn'); return; }
  try {
    const payload = {
      charDataURL: S.cleanCanvas.toDataURL('image/png'),
      joints: S.joints,
      parts: serializeParts(S.parts),
      pose: S.pose,
      direction: S.direction,
      speed: S.speed,
      frameCount: S.frameCount,
      frameSize: S.frameSize,
      layout: S.layout,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    saveStatus.textContent = 'Saved ✓';
    saveStatus.classList.add('visible');
    setTimeout(() => saveStatus.classList.remove('visible'), 2500);
    showToast('Project saved.', 'ok');
  } catch (err) {
    console.error(err);
    showToast('Save failed.', 'err');
  }
});

loadBtn.addEventListener('click', async () => {
  const raw = localStorage.getItem(KEY);
  if (!raw) { showToast('No saved project found.', 'warn'); return; }
  try {
    const p = JSON.parse(raw);
    S.pose = p.pose || 'walk';
    S.direction = p.direction || 'right';
    S.speed = p.speed || 1;
    S.frameCount = p.frameCount || 8;
    S.frameSize = p.frameSize || 128;
    S.layout = p.layout || 'horizontal';
    speedSlider.value = S.speed; speedVal.textContent = S.speed.toFixed(2) + '×';
    framesSlider.value = S.frameCount; framesVal.textContent = S.frameCount;
    sizeSelect.value = S.frameSize; layoutSelect.value = S.layout;
    poseGrid.querySelectorAll('.pose-btn').forEach(b => b.classList.toggle('active', b.dataset.id === S.pose));
    dirGroup.querySelectorAll('.tog').forEach(b => b.classList.toggle('active', b.dataset.val === S.direction));
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = p.charDataURL; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    S.cleanCanvas = c;
    S.sourceCanvas = c;
    S.bb = computeBB(c);
    S.axis = computePrincipalAxis(c);
    S.defaultJoints = autoPlaceJoints(S.bb, S.axis);
    S.joints = p.joints || JSON.parse(JSON.stringify(S.defaultJoints));
    S.parts = deserializeParts(p.parts || []);
    await rehydrateMasks(S.parts);
    uploadThumb.src = p.charDataURL;
    uploadTrigger.classList.add('hidden');
    uploadPreview.classList.remove('hidden');
    skelPlaceholder.classList.add('hidden');
    initEditor();
    applyBtn.disabled = false;
    skelControls.classList.remove('hidden');
    showToast(`Loaded saved project (${timeAgo(p.savedAt)}).`, 'ok');
  } catch (err) {
    console.error(err);
    showToast('Load failed.', 'err');
  }
});

function serializeParts(parts) {
  return parts.map(p => ({
    id: p.id,
    typeId: p.typeId,
    label: p.label,
    parent: p.parent,
    anchorJoint: p.anchorJoint,
    enabled: p.enabled,
    maskDataURL: p.maskCanvas ? p.maskCanvas.toDataURL('image/png') : null,
  }));
}

function deserializeParts(serialized) {
  return serialized.map(sp => {
    const part = { ...makePart(sp.typeId || 'head') };
    part.id = sp.id || part.id;
    part.label = sp.label || part.label;
    part.parent = sp.parent || null;
    part.anchorJoint = sp.anchorJoint || part.anchorJoint;
    part.enabled = sp.enabled !== false;
    part._maskDataURL = sp.maskDataURL || null;
    part.maskCanvas = null;
    return part;
  });
}

async function rehydrateMasks(parts) {
  const jobs = parts.map(async (part) => {
    if (!part._maskDataURL) return;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = part._maskDataURL; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    c._bbox = { x: 0, y: 0, w: c.width, h: c.height };
    part.maskCanvas = c;
  });
  await Promise.all(jobs);
}

function progressLabel(p) {
  return p < 0.25 ? 'Sampling background…' : p < 0.6 ? 'Removing background…' : p < 0.9 ? 'Refining…' : 'Done';
}

let toastTimer = null;
function showToast(msg, type = 'ok') {
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
function setProgress(pct, label) {
  progFill.style.width = Math.max(0, Math.min(1, pct)) * 100 + '%';
  if (label) progLabel.textContent = label;
}
function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function setIntervalSafe() {}

window.addEventListener('resize', () => {
  fitSkelCanvas();
  S.editor?.draw();
});

setTimeout(() => {
  fitSkelCanvas();
}, 0);
