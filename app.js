// app.js — SpriteSmith Studio manual puppet rig

import { removeBackground } from './bgremove.js';
import {
  PART_LIBRARY, createBlankPart, createStarterRig, duplicatePart,
  computeBB, buildRig, humanLabel, normalizeKind, partColor
} from './bodyDetect.js';
import { SkelEditor } from './skelEditor.js';
import { POSES, renderFrame, bakeSpriteSheet } from './animator.js';

const $ = id => document.getElementById(id);

const uploadZone = $('uploadZone');
const uploadTrigger = $('uploadTrigger');
const uploadPreview = $('uploadPreview');
const uploadThumb = $('uploadThumb');
const fileInput = $('fileInput');
const clearBtn = $('clearBtn');
const bgBar = $('bgBar');
const progFill = $('progFill');
const progLabel = $('progLabel');
const partList = $('partList');
const newPartType = $('newPartType');
const addPartBtn = $('addPartBtn');
const starterRigBtn = $('starterRigBtn');
const parentSelect = $('parentSelect');
const dupPartBtn = $('dupPartBtn');
const delPartBtn = $('delPartBtn');
const upPartBtn = $('upPartBtn');
const downPartBtn = $('downPartBtn');
const showSource = $('showSource');
const showGuides = $('showGuides');
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
const saveBtn = $('saveBtn');
const loadBtn = $('loadBtn');
const saveStatus = $('saveStatus');
const toastEl = $('toast');
const skelNote = $('skelBadge');
const poseBadge = $('poseBadge');
const sheetBadge = $('sheetBadge');
const skelCanvas = $('skelCanvas');
const skelPlhdr = $('skelPlaceholder');
const previewCanvas = $('previewCanvas');
const previewPlhdr = $('previewPlaceholder');
const sheetCanvas = $('sheetCanvas');
const sheetPlhdr = $('sheetPlaceholder');
const previewCtx = previewCanvas.getContext('2d');
const sheetCtx = sheetCanvas.getContext('2d');

const partTypeSelect = newPartType;
const state = {
  sourceCanvas: null,
  sourceUrl: null,
  bb: null,
  parts: [],
  editor: null,
  rig: null,
  selectedPartId: null,
  pose: 'idle',
  direction: 'right',
  speed: 1,
  frameCount: 8,
  frameSize: 128,
  layout: 'horizontal',
  animPhase: 0,
  lastTime: null,
  rafId: 0,
  sheetCanvasOut: null,
  loaded: false,
};

function populatePartTypeMenu() {
  partTypeSelect.innerHTML = '';
  for (const item of PART_LIBRARY) {
    const opt = document.createElement('option');
    opt.value = item.kind;
    opt.textContent = item.label;
    partTypeSelect.appendChild(opt);
  }
  partTypeSelect.value = 'torso';
}

function toast(msg, type = 'ok') {
  toastEl.textContent = msg;
  toastEl.className = `toast ${type}`;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function setProgress(p, label) {
  progFill.style.width = `${Math.max(0, Math.min(1, p)) * 100}%`;
  if (label) progLabel.textContent = label;
}

function bgLabel(p) {
  if (p < 0.2) return 'Scanning edges…';
  if (p < 0.7) return 'Removing background…';
  if (p < 0.95) return 'Cleaning fringe pixels…';
  return 'Almost done…';
}

function tick() { return new Promise(r => requestAnimationFrame(() => r())); }

function resetProject(keepImage = false) {
  state.bb = null;
  state.parts = [];
  state.editor?.destroy();
  state.editor = null;
  state.rig = null;
  state.selectedPartId = null;
  state.loaded = false;
  state.animPhase = 0;
  state.lastTime = null;
  stopAnimation();
  skelPlhdr.classList.remove('hidden');
  previewPlhdr.classList.remove('hidden');
  sheetPlhdr.classList.remove('hidden');
  bakeBtn.disabled = true;
  exportPNGBtn.disabled = true;
  exportJSONBtn.disabled = true;
  skelNote.textContent = 'select a part and place it manually';
  partList.innerHTML = '';
  parentSelect.innerHTML = '';
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  if (!keepImage) {
    state.sourceCanvas = null;
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.sourceUrl = null;
    uploadTrigger.classList.remove('hidden');
    uploadPreview.classList.add('hidden');
  }
  renderPartPanel();
}

function refreshEditor() {
  if (!state.editor) return;
  state.editor.setParts(state.parts);
  state.editor.setSelectedPart(state.selectedPartId);
  state.editor.setShowSource(showSource.checked);
  state.editor.setShowGuides(showGuides.checked);
  renderPartPanel();
  rebuildRig();
}

function rebuildRig() {
  if (!state.sourceCanvas) return;
  state.rig = buildRig(state.sourceCanvas, state.parts);
  if (!state.rig?.parts?.length) {
    previewPlhdr.classList.remove('hidden');
    bakeBtn.disabled = true;
    exportPNGBtn.disabled = true;
    exportJSONBtn.disabled = true;
    return;
  }
  previewPlhdr.classList.add('hidden');
  bakeBtn.disabled = false;
  exportPNGBtn.disabled = false;
  exportJSONBtn.disabled = false;
  renderPreview();
}

function renderPreview() {
  if (!state.rig) return;
  const wrap = previewCanvas.parentElement;
  const sz = Math.min(wrap.clientWidth || 320, wrap.clientHeight || 320, 560);
  if (previewCanvas.width !== sz || previewCanvas.height !== sz) previewCanvas.width = previewCanvas.height = sz;
  renderFrame(previewCtx, state.rig, state.pose, state.animPhase, state.direction);
}

function renderPartPanel() {
  partList.innerHTML = '';
  if (!state.parts.length) {
    const empty = document.createElement('div');
    empty.className = 'panel-note';
    empty.textContent = 'No parts yet. Add a torso, head, arms, legs, or any custom piece.';
    partList.appendChild(empty);
  }

  state.parts.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = `part-item ${p.id === state.selectedPartId ? 'active' : ''}`;
    item.dataset.id = p.id;
    item.innerHTML = `
      <div class="part-dot" style="background:${p.color || partColor(p.kind)}"></div>
      <div class="meta">
        <div class="lbl">${p.label || humanLabel(p.kind)}</div>
        <div class="sub">${normalizeKind(p.kind)} · ${p.parentId ? 'linked' : 'root'} · layer ${idx + 1}</div>
      </div>
    `;
    item.addEventListener('click', () => selectPart(p.id));
    partList.appendChild(item);
  });

  const options = ['<option value="">No Parent</option>'];
  for (const p of state.parts) options.push(`<option value="${p.id}">${p.label || humanLabel(p.kind)}</option>`);
  parentSelect.innerHTML = options.join('');
  const selected = state.parts.find(p => p.id === state.selectedPartId);
  if (selected) parentSelect.value = selected.parentId || '';

  const root = state.parts.find(p => !p.parentId) || state.parts[0] || null;
  skelNote.textContent = selected ? `editing ${selected.label} — drag the box, handles, or pivot` : 'select a part and place it manually';
  if (root) skelNote.textContent += ` · root: ${root.label}`;
}

function selectPart(id) {
  state.selectedPartId = id;
  if (state.editor) state.editor.setSelectedPart(id);
  renderPartPanel();
}

function syncFromEditor(parts) {
  state.parts = parts.map(p => ({ ...structuredClone(p) }));
  if (!state.parts.find(p => p.id === state.selectedPartId)) state.selectedPartId = state.parts[0]?.id ?? null;
  if (state.editor) {
    state.editor.setParts(state.parts);
    state.editor.setSelectedPart(state.selectedPartId);
  }
  renderPartPanel();
  rebuildRig();
}

function initEditor() {
  state.editor?.destroy();
  state.editor = new SkelEditor(skelCanvas, state.sourceCanvas, state.parts, syncFromEditor);
  state.editor.setShowSource(showSource.checked);
  state.editor.setShowGuides(showGuides.checked);
  if (state.selectedPartId) state.editor.setSelectedPart(state.selectedPartId);
  skelPlhdr.classList.add('hidden');
}

function updateParentForSelected(parentId) {
  const p = state.parts.find(x => x.id === state.selectedPartId);
  if (!p) return;
  p.parentId = parentId || null;
  syncFromEditor(state.parts);
}

function addNewPart(kind) {
  if (!state.sourceCanvas) {
    toast('Upload a character first.', 'warn');
    return;
  }
  const part = createBlankPart(kind, state.sourceCanvas.width, state.sourceCanvas.height);
  state.parts.push(part);
  state.selectedPartId = part.id;
  syncFromEditor(state.parts);
  toast(`${part.label} added.`, 'ok');
}

function addStarterRig() {
  if (!state.bb || !state.sourceCanvas) {
    toast('Upload a character first.', 'warn');
    return;
  }
  state.parts = createStarterRig(state.bb, state.sourceCanvas.width, state.sourceCanvas.height);
  state.selectedPartId = state.parts[0]?.id ?? null;
  syncFromEditor(state.parts);
  toast('Starter rig added. Adjust each part manually.', 'ok');
}

function duplicateSelected() {
  const p = state.parts.find(x => x.id === state.selectedPartId);
  if (!p) return;
  const copy = duplicatePart(p);
  state.parts.push(copy);
  state.selectedPartId = copy.id;
  syncFromEditor(state.parts);
  toast('Part duplicated.', 'ok');
}

function deleteSelected() {
  const id = state.selectedPartId;
  if (!id) return;
  const children = new Set(state.parts.filter(p => p.parentId === id).map(p => p.id));
  state.parts = state.parts.filter(p => p.id !== id && !children.has(p.id));
  state.selectedPartId = state.parts[0]?.id ?? null;
  syncFromEditor(state.parts);
  toast('Part removed.', 'ok');
}

function layerMove(delta) {
  const idx = state.parts.findIndex(p => p.id === state.selectedPartId);
  if (idx < 0) return;
  const next = idx + delta;
  if (next < 0 || next >= state.parts.length) return;
  const [item] = state.parts.splice(idx, 1);
  state.parts.splice(next, 0, item);
  syncFromEditor(state.parts);
}

async function handleFile(file) {
  const objURL = URL.createObjectURL(file);
  state.sourceUrl = objURL;
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objURL; });

  uploadThumb.src = objURL;
  uploadTrigger.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
  bgBar.classList.remove('hidden');
  setProgress(0, 'Loading image…');

  let cleaned = null;
  try {
    cleaned = await removeBackground(img, p => setProgress(p, bgLabel(p)));
  } catch (e) {
    console.error(e);
    cleaned = document.createElement('canvas');
    cleaned.width = img.naturalWidth;
    cleaned.height = img.naturalHeight;
    cleaned.getContext('2d').drawImage(img, 0, 0);
    toast('Background remover failed. Loaded source image as-is.', 'warn');
  }

  state.sourceCanvas = cleaned;
  state.bb = computeBB(cleaned) || { x: 0, y: 0, w: cleaned.width, h: cleaned.height };
  setProgress(1, 'Ready');
  bgBar.classList.add('hidden');

  state.parts = [];
  state.selectedPartId = null;
  initEditor();
  rebuildRig();
  showSource.checked = true;
  showGuides.checked = true;
  state.editor?.setShowSource(true);
  state.editor?.setShowGuides(true);
  toast('Image loaded. Add a part or start with the starter rig.', 'ok');
}

function startAnimation() {
  stopAnimation();
  state.lastTime = null;
  state.rafId = requestAnimationFrame(loop);
}

function stopAnimation() {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = 0;
}

function loop(now) {
  state.rafId = requestAnimationFrame(loop);
  if (!state.rig) return;
  const dt = state.lastTime ? (now - state.lastTime) / 1000 : 0;
  state.lastTime = now;
  state.animPhase = (state.animPhase + dt * state.speed * 0.72) % 1;
  renderPreview();
}

function updatePoseSelection(pose) {
  state.pose = pose;
  state.animPhase = 0;
  poseBadge.textContent = pose;
  poseGrid.querySelectorAll('.pose-btn').forEach(b => b.classList.toggle('active', b.dataset.id === pose));
  renderPreview();
}

async function bakeSheet() {
  if (!state.rig) return;
  bakeBtn.disabled = true;
  bakeBtn.textContent = '⏳ Baking…';
  await tick();
  try {
    const sheet = bakeSpriteSheet(state.rig, state.pose, state.frameCount, state.frameSize, state.layout, state.direction);
    state.sheetCanvasOut = sheet;
    sheetCanvas.width = sheet.width;
    sheetCanvas.height = sheet.height;
    sheetCtx.clearRect(0, 0, sheet.width, sheet.height);
    sheetCtx.drawImage(sheet, 0, 0);
    sheetPlhdr.classList.add('hidden');
    sheetBadge.textContent = `${sheet.width}×${sheet.height}`;
    toast('Sprite sheet baked.', 'ok');
  } catch (e) {
    console.error(e);
    toast('Failed to bake sprite sheet.', 'err');
  } finally {
    bakeBtn.textContent = '⚡ BAKE SPRITE SHEET';
    bakeBtn.disabled = false;
  }
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportPNG() {
  const canvas = state.sheetCanvasOut || sheetCanvas;
  canvas.toBlob(blob => {
    if (blob) downloadBlob(blob, 'spritesmith-sheet.png');
  }, 'image/png');
}

function exportJSON() {
  const data = {
    version: 1,
    pose: state.pose,
    direction: state.direction,
    speed: state.speed,
    frameCount: state.frameCount,
    frameSize: state.frameSize,
    layout: state.layout,
    parts: state.parts,
    source: state.sourceCanvas ? { width: state.sourceCanvas.width, height: state.sourceCanvas.height, dataURL: state.sourceCanvas.toDataURL('image/png') } : null,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'spritesmith-project.json');
}

async function saveProject() {
  if (!state.sourceCanvas) return toast('Nothing to save yet.', 'warn');
  const data = {
    version: 1,
    pose: state.pose,
    direction: state.direction,
    speed: state.speed,
    frameCount: state.frameCount,
    frameSize: state.frameSize,
    layout: state.layout,
    parts: state.parts,
    sourceDataURL: state.sourceCanvas.toDataURL('image/png'),
  };
  localStorage.setItem('spritesmith_project_v1', JSON.stringify(data));
  saveStatus.textContent = 'Saved';
  saveStatus.classList.add('visible');
  setTimeout(() => saveStatus.classList.remove('visible'), 1200);
  toast('Project saved to this browser.', 'ok');
}

async function loadProject() {
  const raw = localStorage.getItem('spritesmith_project_v1');
  if (!raw) return toast('No saved project found.', 'warn');
  try {
    const data = JSON.parse(raw);
    if (!data.sourceDataURL) return toast('Saved project has no source image.', 'warn');
    await loadFromDataURL(data.sourceDataURL, data);
    toast('Project restored.', 'ok');
  } catch (e) {
    console.error(e);
    toast('Failed to load saved project.', 'err');
  }
}

async function loadFromDataURL(dataURL, meta = null) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataURL; });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  state.sourceCanvas = canvas;
  state.bb = computeBB(canvas) || { x: 0, y: 0, w: canvas.width, h: canvas.height };
  state.parts = meta?.parts ? meta.parts : [];
  state.pose = meta?.pose || 'idle';
  state.direction = meta?.direction || 'right';
  state.speed = meta?.speed || 1;
  state.frameCount = meta?.frameCount || 8;
  state.frameSize = meta?.frameSize || 128;
  state.layout = meta?.layout || 'horizontal';
  speedSlider.value = String(state.speed);
  speedVal.textContent = `${state.speed.toFixed(2)}×`;
  framesSlider.value = String(state.frameCount);
  framesVal.textContent = String(state.frameCount);
  sizeSelect.value = String(state.frameSize);
  layoutSelect.value = state.layout;
  dirGroup.querySelectorAll('.tog').forEach(b => b.classList.toggle('active', b.dataset.val === state.direction));
  poseGrid.querySelectorAll('.pose-btn').forEach(b => b.classList.toggle('active', b.dataset.id === state.pose));
  uploadTrigger.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
  uploadThumb.src = dataURL;
  initEditor();
  rebuildRig();
  state.loaded = true;
  startAnimation();
}

// UI wiring
populatePartTypeMenu();
PART_LIBRARY.forEach(p => {
  const chip = document.createElement('option');
  chip.value = p.kind;
  chip.textContent = p.label;
});
POSES.forEach(p => {
  const btn = document.createElement('button');
  btn.className = `pose-btn${p.id === state.pose ? ' active' : ''}`;
  btn.dataset.id = p.id;
  btn.innerHTML = `<span class="pose-ico">${p.ico}</span><span class="pose-lbl">${p.label}</span>`;
  btn.addEventListener('click', () => updatePoseSelection(p.id));
  poseGrid.appendChild(btn);
});

// Select initial pose badge
poseBadge.textContent = state.pose;
sheetBadge.textContent = '—';

// upload events
uploadTrigger.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) handleFile(f);
});
clearBtn.addEventListener('click', () => resetProject(false));

// part controls
addPartBtn.addEventListener('click', () => addNewPart(partTypeSelect.value));
starterRigBtn.addEventListener('click', addStarterRig);
parentSelect.addEventListener('change', () => updateParentForSelected(parentSelect.value));
dupPartBtn.addEventListener('click', duplicateSelected);
delPartBtn.addEventListener('click', deleteSelected);
upPartBtn.addEventListener('click', () => layerMove(1));
downPartBtn.addEventListener('click', () => layerMove(-1));
showSource.addEventListener('change', () => state.editor?.setShowSource(showSource.checked));
showGuides.addEventListener('change', () => state.editor?.setShowGuides(showGuides.checked));

// animation controls
dirGroup.querySelectorAll('.tog').forEach(btn => btn.addEventListener('click', () => {
  dirGroup.querySelectorAll('.tog').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.direction = btn.dataset.val;
  renderPreview();
}));
speedSlider.addEventListener('input', () => {
  state.speed = parseFloat(speedSlider.value);
  speedVal.textContent = state.speed.toFixed(2) + '×';
});
framesSlider.addEventListener('input', () => {
  state.frameCount = parseInt(framesSlider.value, 10);
  framesVal.textContent = String(state.frameCount);
});
sizeSelect.addEventListener('change', () => { state.frameSize = parseInt(sizeSelect.value, 10); });
layoutSelect.addEventListener('change', () => { state.layout = layoutSelect.value; });

bakeBtn.addEventListener('click', bakeSheet);
exportPNGBtn.addEventListener('click', exportPNG);
exportJSONBtn.addEventListener('click', exportJSON);
saveBtn.addEventListener('click', saveProject);
loadBtn.addEventListener('click', loadProject);

window.addEventListener('resize', () => { renderPreview(); state.editor?.requestRender(); });

// initial state
resetProject(true);
startAnimation();

