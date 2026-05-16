'use strict';

const PART_TYPES = [
  'torso', 'chest', 'pelvis', 'neck', 'head', 'hair', 'face',
  'upper arm L', 'lower arm L', 'hand L',
  'upper arm R', 'lower arm R', 'hand R',
  'thigh L', 'shin L', 'foot L',
  'thigh R', 'shin R', 'foot R',
  'shoulder pad L', 'shoulder pad R', 'cape', 'skirt', 'weapon', 'shield', 'accessory'
];

const DEFAULT_PARENT = {
  torso: null,
  chest: 'torso',
  pelvis: 'torso',
  neck: 'chest',
  head: 'neck',
  hair: 'head',
  face: 'head',
  'upper arm L': 'chest',
  'lower arm L': 'upper arm L',
  'hand L': 'lower arm L',
  'upper arm R': 'chest',
  'lower arm R': 'upper arm R',
  'hand R': 'lower arm R',
  'thigh L': 'pelvis',
  'shin L': 'thigh L',
  'foot L': 'shin L',
  'thigh R': 'pelvis',
  'shin R': 'thigh R',
  'foot R': 'shin R',
  'shoulder pad L': 'chest',
  'shoulder pad R': 'chest',
  cape: 'chest',
  skirt: 'pelvis',
  weapon: 'hand R',
  shield: 'hand L',
  accessory: 'torso'
};

const TYPE_ORDER = [
  'cape', 'skirt', 'pelvis', 'torso', 'chest', 'neck', 'head', 'face', 'hair',
  'thigh L', 'shin L', 'foot L', 'thigh R', 'shin R', 'foot R',
  'upper arm L', 'lower arm L', 'hand L',
  'upper arm R', 'lower arm R', 'hand R',
  'shoulder pad L', 'shoulder pad R', 'weapon', 'shield', 'accessory'
];

const TYPE_COLORS = [
  '#6ee7ff','#8b5cf6','#f59e0b','#34d399','#f43f5e','#a3e635','#f97316','#60a5fa',
  '#f472b6','#14b8a6','#e879f9','#c084fc','#fb7185','#22c55e','#facc15','#38bdf8'
];

const state = {
  image: null,
  parts: [],
  selectedPartId: null,
  tool: 'pan',
  maskMode: 'replace',
  feather: 2,
  sourceZoom: 1,
  wandTolerance: 28,
  sourcePanX: 0,
  sourcePanY: 0,
  sourceFit: 1,
  sourceFitX: 0,
  sourceFitY: 0,
  previewFit: 1,
  previewFitX: 0,
  previewFitY: 0,
  pose: 'walk',
  facing: 'right',
  speed: 1,
  tilt: 8,
  phase: 0,
  showMask: true,
  dragging: null,
  lasso: [],
  raf: 0,
  needsPreviewRedraw: true,
};

const els = {
  importBtn: document.getElementById('importBtn'),
  fileInput: document.getElementById('fileInput'),
  exportProjectBtn: document.getElementById('exportProjectBtn'),
  exportPreviewBtn: document.getElementById('exportPreviewBtn'),
  sourceStatus: document.getElementById('sourceStatus'),
  previewStatus: document.getElementById('previewStatus'),
  sourceCanvas: document.getElementById('sourceCanvas'),
  previewCanvas: document.getElementById('previewCanvas'),
  sourceEmpty: document.getElementById('sourceEmpty'),
  previewEmpty: document.getElementById('previewEmpty'),
  sourceZoom: document.getElementById('sourceZoom'),
  sourceZoomVal: document.getElementById('sourceZoomVal'),
  wandTolerance: document.getElementById('wandTolerance'),
  wandToleranceVal: document.getElementById('wandToleranceVal'),
  fitSourceBtn: document.getElementById('fitSourceBtn'),
  poseSelect: document.getElementById('poseSelect'),
  facingSelect: document.getElementById('facingSelect'),
  speedSlider: document.getElementById('speedSlider'),
  speedVal: document.getElementById('speedVal'),
  tiltSlider: document.getElementById('tiltSlider'),
  tiltVal: document.getElementById('tiltVal'),
  partTypeAdd: document.getElementById('partTypeAdd'),
  addPartBtn: document.getElementById('addPartBtn'),
  partList: document.getElementById('partList'),
  selectedPartHint: document.getElementById('selectedPartHint'),
  maskMode: document.getElementById('maskMode'),
  featherSlider: document.getElementById('featherSlider'),
  featherVal: document.getElementById('featherVal'),
  partName: document.getElementById('partName'),
  partTypeEdit: document.getElementById('partTypeEdit'),
  partParent: document.getElementById('partParent'),
  anchorX: document.getElementById('anchorX'),
  anchorY: document.getElementById('anchorY'),
  tipX: document.getElementById('tipX'),
  tipY: document.getElementById('tipY'),
  partVisible: document.getElementById('partVisible'),
  showMask: document.getElementById('showMask'),
  clearMaskBtn: document.getElementById('clearMaskBtn'),
  deletePartBtn: document.getElementById('deletePartBtn'),
  fitPreviewBtn: document.getElementById('fitPreviewBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
};

const sourceCtx = els.sourceCanvas.getContext('2d');
const previewCtx = els.previewCanvas.getContext('2d');

const DEFAULT_SOURCE_SIZE = 960;

init();

function init() {
  populateTypeOptions();
  bindEvents();
  resizeAll();
  requestAnimationFrame(loop);
  renderSource();
  renderPreview();
  setStatus('No image loaded.', 'preview');
}

function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'p_' + Math.random().toString(36).slice(2, 10);
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function hypot(dx, dy) { return Math.hypot(dx, dy); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function colorForIndex(i) { return TYPE_COLORS[i % TYPE_COLORS.length]; }
function rotatePoint(pt, pivot, ang) {
  const s = Math.sin(ang), c = Math.cos(ang);
  const dx = pt.x - pivot.x, dy = pt.y - pivot.y;
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
}
function pointOnCircle(center, radius, angle) {
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}
function formatPct(v) { return `${Math.round(v * 100)}%`; }
function sourceHasImage() { return !!state.image; }

function populateTypeOptions() {
  const fill = (sel, includeNone = false) => {
    sel.innerHTML = '';
    if (includeNone) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'None';
      sel.appendChild(o);
    }
    for (const type of PART_TYPES) {
      const o = document.createElement('option');
      o.value = type;
      o.textContent = type;
      sel.appendChild(o);
    }
  };
  fill(els.partTypeAdd);
  fill(els.partTypeEdit);
  els.partTypeAdd.value = 'torso';
  els.partTypeEdit.value = 'torso';
}

function bindEvents() {
  els.importBtn.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    if (file) loadImage(file);
  });

  window.addEventListener('resize', () => {
    resizeAll();
    renderSource();
    renderPreview();
  });

  els.sourceCanvas.addEventListener('dragover', (e) => { e.preventDefault(); });
  els.sourceCanvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadImage(file);
  });

  els.sourceZoom.addEventListener('input', () => {
    state.sourceZoom = parseFloat(els.sourceZoom.value);
    els.sourceZoomVal.textContent = formatPct(state.sourceZoom);
    renderSource();
  });

  els.fitSourceBtn.addEventListener('click', () => {
    state.sourceZoom = 1;
    els.sourceZoom.value = '1';
    els.sourceZoomVal.textContent = '100%';
    fitSourceView();
    renderSource();
  });

  els.poseSelect.addEventListener('change', () => {
    state.pose = els.poseSelect.value;
  });
  els.facingSelect.addEventListener('change', () => {
    state.facing = els.facingSelect.value;
  });
  els.wandTolerance.addEventListener('input', () => {
    state.wandTolerance = parseFloat(els.wandTolerance.value);
    els.wandToleranceVal.textContent = String(Math.round(state.wandTolerance));
  });

  els.speedSlider.addEventListener('input', () => {
    state.speed = parseFloat(els.speedSlider.value);
    els.speedVal.textContent = `${state.speed.toFixed(2)}×`;
  });
  els.tiltSlider.addEventListener('input', () => {
    state.tilt = parseFloat(els.tiltSlider.value);
    els.tiltVal.textContent = `${state.tilt.toFixed(0)}°`;
  });

  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  els.partTypeAdd.addEventListener('change', () => {
    // no-op; current selection only.
  });

  els.addPartBtn.addEventListener('click', () => {
    const part = createPart(els.partTypeAdd.value);
    state.parts.push(part);
    state.selectedPartId = part.id;
    syncPartUI();
    renderPartList();
    renderSource();
    renderPreview();
    setStatus(`Added ${part.name}.`, 'source');
  });

  els.maskMode.addEventListener('change', () => {
    state.maskMode = els.maskMode.value;
  });
  els.featherSlider.addEventListener('input', () => {
    state.feather = parseFloat(els.featherSlider.value);
    els.featherVal.textContent = `${state.feather.toFixed(1)}px`;
    if (state.selectedPartId) rebuildSelectedRaster();
  });

  ['input', 'change'].forEach(evt => {
    [els.partName, els.partTypeEdit, els.partParent, els.partVisible, els.showMask,
     els.anchorX, els.anchorY, els.tipX, els.tipY].forEach(el => el.addEventListener(evt, commitSelectedPartEdits));
  });

  els.clearMaskBtn.addEventListener('click', () => {
    const part = selectedPart();
    if (!part) return;
    part.maskCanvas = null;
    part.raster = null;
    renderPartList();
    renderSource();
    renderPreview();
  });

  els.deletePartBtn.addEventListener('click', () => {
    const part = selectedPart();
    if (!part) return;
    const id = part.id;
    state.parts = state.parts.filter(p => p.id !== id);
    for (const p of state.parts) {
      if (p.parentId === id) p.parentId = '';
    }
    state.selectedPartId = state.parts[0] ? state.parts[0].id : null;
    syncPartUI();
    renderPartList();
    renderSource();
    renderPreview();
  });

  els.fitPreviewBtn.addEventListener('click', () => {
    resizeAll();
    renderPreview();
  });

  els.exportJsonBtn.addEventListener('click', exportProjectJSON);
  els.exportProjectBtn.addEventListener('click', exportProjectJSON);
  els.exportPreviewBtn.addEventListener('click', exportPreviewPNG);

  // pointer events for source canvas
  els.sourceCanvas.addEventListener('pointerdown', onSourcePointerDown);
  els.sourceCanvas.addEventListener('pointermove', onSourcePointerMove);
  window.addEventListener('pointerup', onSourcePointerUp);
  els.sourceCanvas.addEventListener('wheel', onSourceWheel, { passive: false });
}

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll('[data-tool]').forEach(btn => btn.classList.toggle('active', btn.dataset.tool === tool));
}

function createPart(type) {
  const idx = state.parts.length;
  const anchor = state.image
    ? { x: state.image.w * 0.5, y: state.image.h * 0.5 }
    : { x: 200, y: 200 };
  const tip = defaultTipForType(type, anchor, state.image ? state.image.h : 400);
  return {
    id: uid(),
    name: type,
    type,
    parentId: DEFAULT_PARENT[type] || '',
    visible: true,
    showMask: true,
    color: colorForIndex(idx),
    anchor,
    tip,
    maskCanvas: null,
    raster: null,
    bounds: null,
    sourceLength: 0,
  };
}

function defaultTipForType(type, anchor, h) {
  const len = Math.max(24, h * 0.1);
  switch (type) {
    case 'head': return { x: anchor.x, y: anchor.y - len * 0.9 };
    case 'neck': return { x: anchor.x, y: anchor.y - len * 0.7 };
    case 'chest': return { x: anchor.x, y: anchor.y - len * 0.8 };
    case 'torso': return { x: anchor.x, y: anchor.y - len * 0.9 };
    case 'pelvis': return { x: anchor.x, y: anchor.y - len * 0.7 };
    case 'upper arm L': return { x: anchor.x - len * 0.85, y: anchor.y + len * 0.1 };
    case 'lower arm L': return { x: anchor.x - len * 0.85, y: anchor.y + len * 0.05 };
    case 'hand L': return { x: anchor.x - len * 0.4, y: anchor.y };
    case 'upper arm R': return { x: anchor.x + len * 0.85, y: anchor.y + len * 0.1 };
    case 'lower arm R': return { x: anchor.x + len * 0.85, y: anchor.y + len * 0.05 };
    case 'hand R': return { x: anchor.x + len * 0.4, y: anchor.y };
    case 'thigh L': return { x: anchor.x - len * 0.35, y: anchor.y + len * 0.9 };
    case 'shin L': return { x: anchor.x - len * 0.28, y: anchor.y + len * 1.0 };
    case 'foot L': return { x: anchor.x - len * 0.7, y: anchor.y + len * 0.1 };
    case 'thigh R': return { x: anchor.x + len * 0.35, y: anchor.y + len * 0.9 };
    case 'shin R': return { x: anchor.x + len * 0.28, y: anchor.y + len * 1.0 };
    case 'foot R': return { x: anchor.x + len * 0.7, y: anchor.y + len * 0.1 };
    case 'hair': return { x: anchor.x, y: anchor.y - len * 0.9 };
    case 'cape': return { x: anchor.x, y: anchor.y + len * 1.2 };
    case 'skirt': return { x: anchor.x, y: anchor.y + len * 1.0 };
    default: return { x: anchor.x + len * 0.6, y: anchor.y };
  }
}

function loadImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    state.image = { img, canvas: c, w: c.width, h: c.height };
    state.parts = [];
    state.selectedPartId = null;
    state.sourceZoom = 1;
    els.sourceZoom.value = '1';
    els.sourceZoomVal.textContent = '100%';
    fitSourceView();
    fitPreviewView();
    // Pre-create a torso part for convenience, but it is not required.
    const torso = createPart('torso');
    torso.anchor = { x: c.width * 0.5, y: c.height * 0.62 };
    torso.tip = { x: c.width * 0.5, y: c.height * 0.42 };
    state.parts.push(torso);
    state.selectedPartId = torso.id;
    syncPartUI();
    renderPartList();
    renderSource();
    renderPreview();
    setStatus(`Loaded ${c.width}×${c.height} image.`, 'source');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus('Could not load image.', 'source');
  };
  img.src = url;
}

function resizeAll() {
  const sourceRect = els.sourceCanvas.parentElement.getBoundingClientRect();
  const previewRect = els.previewCanvas.parentElement.getBoundingClientRect();
  els.sourceCanvas.width = Math.max(300, Math.floor(sourceRect.width));
  els.sourceCanvas.height = Math.max(260, Math.floor(sourceRect.height));
  els.previewCanvas.width = Math.max(300, Math.floor(previewRect.width));
  els.previewCanvas.height = Math.max(260, Math.floor(previewRect.height));
  fitSourceView();
  fitPreviewView();
}

function fitSourceView() {
  if (!state.image) return;
  const cw = els.sourceCanvas.width, ch = els.sourceCanvas.height;
  const scale = Math.min(cw / state.image.w, ch / state.image.h) * 0.92;
  state.sourceFit = scale;
  state.sourceFitX = (cw - state.image.w * scale) / 2;
  state.sourceFitY = (ch - state.image.h * scale) / 2;
}

function fitPreviewView() {
  const cw = els.previewCanvas.width, ch = els.previewCanvas.height;
  state.previewFit = Math.min(cw, ch) * 0.96;
  state.previewFitX = cw / 2;
  state.previewFitY = ch / 2;
}

function sourceTransform() {
  const scale = state.sourceFit * state.sourceZoom;
  return { scale, x: state.sourceFitX + state.sourcePanX, y: state.sourceFitY + state.sourcePanY };
}

function sourceToCanvas(pt) {
  const t = sourceTransform();
  return { x: pt.x * t.scale + t.x, y: pt.y * t.scale + t.y };
}

function canvasToSource(x, y) {
  const t = sourceTransform();
  return { x: (x - t.x) / t.scale, y: (y - t.y) / t.scale };
}

function selectedPart() {
  return state.parts.find(p => p.id === state.selectedPartId) || null;
}

function syncPartUI() {
  const part = selectedPart();
  const has = !!part;
  els.selectedPartHint.textContent = has ? `Editing ${part.name}` : 'Choose a part to edit its mask and joints';
  [els.partName, els.partTypeEdit, els.partParent, els.anchorX, els.anchorY, els.tipX, els.tipY, els.partVisible, els.showMask, els.clearMaskBtn, els.deletePartBtn].forEach(el => el.disabled = !has);
  if (!has) return;
  els.partName.value = part.name;
  els.partTypeEdit.value = part.type;
  populateParentOptions(part.parentId);
  els.anchorX.value = Math.round(part.anchor.x);
  els.anchorY.value = Math.round(part.anchor.y);
  els.tipX.value = Math.round(part.tip.x);
  els.tipY.value = Math.round(part.tip.y);
  els.partVisible.checked = part.visible;
  els.showMask.checked = part.showMask;
}

function populateParentOptions(selectedParent) {
  els.partParent.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'None';
  els.partParent.appendChild(none);
  for (const p of state.parts) {
    if (p.id === state.selectedPartId) continue;
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    els.partParent.appendChild(o);
  }
  els.partParent.value = selectedParent || '';
}

function commitSelectedPartEdits() {
  const part = selectedPart();
  if (!part) return;
  part.name = els.partName.value.trim() || part.type;
  part.type = els.partTypeEdit.value;
  part.parentId = els.partParent.value || '';
  part.anchor = { x: parseFloat(els.anchorX.value) || 0, y: parseFloat(els.anchorY.value) || 0 };
  part.tip = { x: parseFloat(els.tipX.value) || 0, y: parseFloat(els.tipY.value) || 0 };
  part.visible = els.partVisible.checked;
  part.showMask = els.showMask.checked;
  if (state.image) {
    rebuildSelectedRaster(false);
  }
  renderPartList();
  renderSource();
  renderPreview();
}

function renderPartList() {
  els.partList.innerHTML = '';
  if (!state.parts.length) {
    els.partList.innerHTML = '<div class="panel-subtitle" style="padding:10px 2px">No parts yet. Add any body part from the dropdown.</div>';
    return;
  }
  state.parts.forEach((part, index) => {
    const row = document.createElement('div');
    row.className = 'part-item' + (part.id === state.selectedPartId ? ' active' : '');
    row.innerHTML = `
      <div class="part-dot" style="background:${part.color}"></div>
      <div>
        <div class="part-name">${escapeHtml(part.name)}</div>
        <div class="part-meta">${escapeHtml(part.type)} · ${part.parentId ? 'linked' : 'root'} · ${part.maskCanvas ? 'masked' : 'no mask'}</div>
      </div>
      <button class="part-del btn">Edit</button>
    `;
    row.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('part-del')) return;
      state.selectedPartId = part.id;
      syncPartUI();
      renderPartList();
      renderSource();
      renderPreview();
    });
    row.querySelector('.part-del').addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedPartId = part.id;
      syncPartUI();
      renderPartList();
      renderSource();
      renderPreview();
    });
    els.partList.appendChild(row);
  });
  populateParentOptions(selectedPart() && selectedPart().parentId);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function rebuildSelectedRaster(andRender = true) {
  const part = selectedPart();
  if (!part || !state.image) return;
  if (!part.maskCanvas) {
    part.raster = null;
    part.bounds = null;
    part.sourceLength = distance(part.anchor, part.tip);
    if (andRender) { renderSource(); renderPreview(); }
    return;
  }
  const bounds = maskBounds(part.maskCanvas);
  if (!bounds) {
    part.raster = null;
    part.bounds = null;
    part.sourceLength = distance(part.anchor, part.tip);
    if (andRender) { renderSource(); renderPreview(); }
    return;
  }
  const pad = Math.max(2, Math.ceil(state.feather * 2));
  const x = clamp(bounds.x - pad, 0, state.image.w - 1);
  const y = clamp(bounds.y - pad, 0, state.image.h - 1);
  const w = clamp(bounds.w + pad * 2, 1, state.image.w - x);
  const h = clamp(bounds.h + pad * 2, 1, state.image.h - y);
  const crop = document.createElement('canvas');
  crop.width = w;
  crop.height = h;
  const cctx = crop.getContext('2d');
  cctx.clearRect(0, 0, w, h);
  cctx.drawImage(state.image.canvas, x, y, w, h, 0, 0, w, h);
  const maskCrop = document.createElement('canvas');
  maskCrop.width = w;
  maskCrop.height = h;
  const mctx = maskCrop.getContext('2d');
  mctx.clearRect(0, 0, w, h);
  mctx.drawImage(part.maskCanvas, x, y, w, h, 0, 0, w, h);
  if (state.feather > 0) {
    const blur = document.createElement('canvas');
    blur.width = w;
    blur.height = h;
    const bctx = blur.getContext('2d');
    bctx.filter = `blur(${state.feather}px)`;
    bctx.drawImage(maskCrop, 0, 0);
    mctx.clearRect(0, 0, w, h);
    mctx.drawImage(blur, 0, 0);
  }
  cctx.globalCompositeOperation = 'destination-in';
  cctx.drawImage(maskCrop, 0, 0);
  part.raster = crop;
  part.bounds = { x, y, w, h };
  part.sourceLength = distance(part.anchor, part.tip);
  if (andRender) { renderSource(); renderPreview(); }
}

function maskBounds(maskCanvas) {
  if (!maskCanvas) return null;
  const { width: w, height: h } = maskCanvas;
  const ctx = maskCanvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      if (data[i] > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function renderSource() {
  const w = els.sourceCanvas.width, h = els.sourceCanvas.height;
  sourceCtx.clearRect(0, 0, w, h);
  drawPanelBackground(sourceCtx, w, h);
  if (!state.image) {
    els.sourceEmpty.classList.remove('hidden');
    return;
  }
  els.sourceEmpty.classList.add('hidden');
  const t = sourceTransform();
  sourceCtx.save();
  sourceCtx.setTransform(t.scale, 0, 0, t.scale, t.x, t.y);
  sourceCtx.imageSmoothingEnabled = true;
  sourceCtx.drawImage(state.image.canvas, 0, 0);

  // Selection overlay from active part mask.
  const part = selectedPart();
  if (part && part.maskCanvas && part.showMask) {
    sourceCtx.globalAlpha = 0.25;
    sourceCtx.fillStyle = part.color;
    sourceCtx.drawImage(part.maskCanvas, 0, 0);
    sourceCtx.globalAlpha = 1;
    sourceCtx.strokeStyle = part.color;
    sourceCtx.lineWidth = 1 / t.scale;
    const bounds = maskBounds(part.maskCanvas);
    if (bounds) sourceCtx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }

  // Lasso preview while drawing.
  if (state.tool === 'lasso' && state.lasso.length > 1) {
    sourceCtx.strokeStyle = '#ffffff';
    sourceCtx.lineWidth = 2 / t.scale;
    sourceCtx.setLineDash([8 / t.scale, 6 / t.scale]);
    sourceCtx.beginPath();
    sourceCtx.moveTo(state.lasso[0].x, state.lasso[0].y);
    for (let i = 1; i < state.lasso.length; i++) sourceCtx.lineTo(state.lasso[i].x, state.lasso[i].y);
    sourceCtx.stroke();
    sourceCtx.setLineDash([]);
  }

  // Draw anchors for selected part.
  if (part) {
    drawHandle(sourceCtx, part.anchor, '#5ef0c8', 'A');
    drawHandle(sourceCtx, part.tip, '#ffcc66', 'T', 'square');
    sourceCtx.strokeStyle = 'rgba(94,240,200,.5)';
    sourceCtx.lineWidth = 2 / t.scale;
    sourceCtx.beginPath();
    sourceCtx.moveTo(part.anchor.x, part.anchor.y);
    sourceCtx.lineTo(part.tip.x, part.tip.y);
    sourceCtx.stroke();
  }
  sourceCtx.restore();
  setStatus(`Image: ${state.image.w}×${state.image.h} · tool: ${state.tool} · mode: ${state.maskMode}`, 'source');
}

function drawPanelBackground(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#10141c';
  ctx.fillRect(0, 0, w, h);
}

function drawHandle(ctx, pt, color, label, shape = 'round') {
  const t = sourceTransform();
  const size = 8 / t.scale;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2 / t.scale;
  ctx.beginPath();
  if (shape === 'square') {
    ctx.rect(pt.x - size / 2, pt.y - size / 2, size, size);
  } else {
    ctx.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `${12 / t.scale}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, pt.x, pt.y - size * 1.2);
  ctx.restore();
}

function renderPreview() {
  const w = els.previewCanvas.width, h = els.previewCanvas.height;
  previewCtx.clearRect(0, 0, w, h);
  drawPanelBackground(previewCtx, w, h);
  if (!state.image) {
    els.previewEmpty.classList.remove('hidden');
    return;
  }
  els.previewEmpty.classList.add('hidden');
  const body = computeBodyPose(w, h, state.phase);
  const parts = state.parts.slice().filter(p => p.visible && p.raster);
  parts.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));

  // draw a subtle ground shadow
  previewCtx.save();
  previewCtx.fillStyle = 'rgba(0,0,0,.16)';
  previewCtx.beginPath();
  previewCtx.ellipse(body.pelvis.x, body.groundY + 18, body.scale * 0.34, body.scale * 0.06, 0, 0, Math.PI * 2);
  previewCtx.fill();
  previewCtx.restore();

  for (const part of parts) {
    const target = targetForPart(part, body);
    if (!target) continue;
    drawPartPreview(part, target, body);
  }

  if (body.showDebug) drawPreviewSkeleton(body);
  setStatus(`${state.pose} · ${state.facing} · ${state.speed.toFixed(2)}×`, 'preview');
}

function drawPreviewSkeleton(body) {
  const ctx = previewCtx;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,.24)';
  const pairs = [
    [body.pelvis, body.chest], [body.chest, body.neck], [body.neck, body.head],
    [body.chestL, body.elbowL], [body.elbowL, body.wristL],
    [body.chestR, body.elbowR], [body.elbowR, body.wristR],
    [body.hipL, body.kneeL], [body.kneeL, body.ankleL],
    [body.hipR, body.kneeR], [body.kneeR, body.ankleR],
  ];
  for (const [a, b] of pairs) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const p of [body.pelvis, body.chest, body.neck, body.head, body.chestL, body.chestR, body.hipL, body.hipR, body.elbowL, body.elbowR, body.kneeL, body.kneeR, body.wristL, body.wristR, body.ankleL, body.ankleR]) drawPreviewPoint(p);
  ctx.restore();
}

function drawPreviewPoint(pt) {
  const ctx = previewCtx;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function targetForPart(part, body) {
  const type = part.type;
  const len = sourceToPreviewLen(part.sourceLength || distance(part.anchor, part.tip), body);
  const baseMap = {
    torso: [body.pelvis, body.chest],
    pelvis: [body.hipCenter, body.pelvis],
    chest: [body.pelvis, body.chest],
    neck: [body.chest, body.neck],
    head: [body.neck, body.head],
    face: [body.neck, body.head],
    hair: [body.head, pointOnCircle(body.head, len * 0.7, body.headAngle - Math.PI / 2)],
    'upper arm L': [body.chestL, body.elbowL],
    'lower arm L': [body.elbowL, body.wristL],
    'hand L': [body.wristL, pointOnCircle(body.wristL, len * 0.28, body.handDirL)],
    'upper arm R': [body.chestR, body.elbowR],
    'lower arm R': [body.elbowR, body.wristR],
    'hand R': [body.wristR, pointOnCircle(body.wristR, len * 0.28, body.handDirR)],
    'thigh L': [body.hipL, body.kneeL],
    'shin L': [body.kneeL, body.ankleL],
    'foot L': [body.ankleL, pointOnCircle(body.ankleL, len * 0.34, body.footDirL)],
    'thigh R': [body.hipR, body.kneeR],
    'shin R': [body.kneeR, body.ankleR],
    'foot R': [body.ankleR, pointOnCircle(body.ankleR, len * 0.34, body.footDirR)],
    'shoulder pad L': [body.chestL, body.elbowL],
    'shoulder pad R': [body.chestR, body.elbowR],
    cape: [body.chest, pointOnCircle(body.chest, len * 0.9, body.capeAngle)],
    skirt: [body.pelvis, pointOnCircle(body.pelvis, len * 0.8, body.skirtAngle)],
    weapon: [body.wristR, pointOnCircle(body.wristR, len * 0.8, body.weaponAngle)],
    shield: [body.wristL, pointOnCircle(body.wristL, len * 0.7, body.weaponAngle + 1.5)],
    accessory: [body.chest, pointOnCircle(body.chest, len * 0.5, body.accessoryAngle)],
  };
  let pair = baseMap[type];
  if (!pair) {
    const parent = state.parts.find(p => p.id === part.parentId);
    const anchor = parent ? targetForPart(parent, body)?.[1] : body.chest;
    pair = [anchor || body.chest, pointOnCircle(anchor || body.chest, len * 0.6, body.torsoAngle)];
  }
  return pair;
}

function sourceToPreviewLen(srcLen, body) {
  if (!state.image) return srcLen;
  const scale = body.scale / Math.max(state.image.w, state.image.h) * 1.0;
  return Math.max(1, srcLen * scale);
}

function drawPartPreview(part, target, body) {
  const [a, b] = target;
  const srcA = part.anchor;
  const srcB = part.tip;
  const mat = affineFromLine(srcA, srcB, a, b, state.facing === 'left');
  if (!mat) return;
  previewCtx.save();
  previewCtx.setTransform(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
  previewCtx.imageSmoothingEnabled = true;
  previewCtx.drawImage(part.raster, part.bounds.x, part.bounds.y);
  previewCtx.restore();

  if (part.showMask) {
    previewCtx.save();
    previewCtx.setTransform(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
    previewCtx.strokeStyle = part.color;
    previewCtx.lineWidth = 1.25;
    previewCtx.strokeRect(part.bounds.x, part.bounds.y, part.bounds.w, part.bounds.h);
    previewCtx.restore();
  }
}

function affineFromLine(srcA, srcB, dstA, dstB, mirrored = false) {
  const sx = srcB.x - srcA.x;
  const sy = srcB.y - srcA.y;
  const dx = dstB.x - dstA.x;
  const dy = dstB.y - dstA.y;
  const sl = Math.hypot(sx, sy) || 1;
  const dl = Math.hypot(dx, dy) || 1;
  const s = dl / sl;
  let a1 = Math.atan2(sy, sx);
  let a2 = Math.atan2(dy, dx);
  let rot = a2 - a1;
  if (mirrored) rot = Math.PI - rot;
  const cos = Math.cos(rot) * s;
  const sin = Math.sin(rot) * s;
  const e = dstA.x - (srcA.x * cos - srcA.y * sin);
  const f = dstA.y - (srcA.x * sin + srcA.y * cos);
  return { a: cos, b: sin, c: -sin, d: cos, e, f };
}

function computeBodyPose(w, h, phase) {
  const facing = state.facing === 'left' ? -1 : 1;
  const scale = Math.min(w, h) * 0.28;
  const centerX = w * 0.5;
  const groundY = h * 0.78;
  const cycle = state.pose === 'idle' ? phase * 0.5 : phase;
  const walk = Math.sin(cycle * Math.PI * 2);
  const walk2 = Math.sin(cycle * Math.PI * 2 + Math.PI);
  const bob = state.pose === 'idle' ? Math.sin(phase * Math.PI * 2) * scale * 0.008 : Math.abs(Math.sin(cycle * Math.PI * 2)) * -scale * 0.06;
  const sway = Math.sin(cycle * Math.PI * 2 + Math.PI / 2) * scale * 0.03;
  const torsoTilt = radians(state.tilt) + Math.sin(cycle * Math.PI * 2) * 0.08;
  const pelvis = { x: centerX + sway * 0.15, y: groundY - scale * 1.4 + bob };
  const chest = { x: pelvis.x + Math.sin(torsoTilt) * scale * 0.18, y: pelvis.y - scale * 0.62 };
  const neck = { x: chest.x + Math.sin(torsoTilt) * scale * 0.08, y: chest.y - scale * 0.18 };
  const head = { x: neck.x + Math.sin(torsoTilt) * scale * 0.05, y: neck.y - scale * 0.24 };
  const headAngle = torsoTilt * 0.25;
  const chestL = { x: chest.x - facing * scale * 0.24, y: chest.y + scale * 0.02 };
  const chestR = { x: chest.x + facing * scale * 0.24, y: chest.y + scale * 0.02 };
  const hipL = { x: pelvis.x - facing * scale * 0.13, y: pelvis.y + scale * 0.03 };
  const hipR = { x: pelvis.x + facing * scale * 0.13, y: pelvis.y + scale * 0.03 };
  const armLen1 = scale * 0.38;
  const armLen2 = scale * 0.34;
  const legLen1 = scale * 0.46;
  const legLen2 = scale * 0.45;
  const handBase = scale * 0.12;
  const footBase = scale * 0.14;

  const armWave = state.pose === 'idle' ? Math.sin(phase * Math.PI * 2) * 0.12 : Math.sin(cycle * Math.PI * 2) * 0.9;
  const armTargetL = { x: chestL.x - facing * scale * 0.12 - armWave * facing * scale * 0.05, y: chestL.y + scale * 0.44 + Math.max(0, -armWave) * scale * 0.07 };
  const armTargetR = { x: chestR.x + facing * scale * 0.12 + armWave * facing * scale * 0.05, y: chestR.y + scale * 0.44 + Math.max(0, armWave) * scale * 0.07 };
  const kneeTargetL = { x: hipL.x - facing * scale * 0.03 + walk * facing * scale * 0.18, y: pelvis.y + scale * 0.66 };
  const kneeTargetR = { x: hipR.x + facing * scale * 0.03 + walk2 * facing * scale * 0.18, y: pelvis.y + scale * 0.66 };
  const footTargetL = { x: hipL.x - facing * scale * 0.06 + Math.sin(cycle * Math.PI * 2 + Math.PI * 0.6) * facing * scale * 0.28, y: groundY - Math.max(0, Math.sin(cycle * Math.PI * 2 + Math.PI * 0.6)) * scale * 0.34 };
  const footTargetR = { x: hipR.x + facing * scale * 0.06 + Math.sin(cycle * Math.PI * 2 - Math.PI * 0.6) * facing * scale * 0.28, y: groundY - Math.max(0, Math.sin(cycle * Math.PI * 2 - Math.PI * 0.6)) * scale * 0.34 };
  const armL = solve2Bone(chestL, armTargetL, armLen1, armLen2, -facing);
  const armR = solve2Bone(chestR, armTargetR, armLen1, armLen2, facing);
  const legL = solve2Bone(hipL, footTargetL, legLen1, legLen2, facing);
  const legR = solve2Bone(hipR, footTargetR, legLen1, legLen2, -facing);

  return {
    scale,
    facing,
    cycle,
    groundY,
    pelvis,
    chest,
    neck,
    head,
    chestL,
    chestR,
    hipL,
    hipR,
    elbowL: armL.mid,
    wristL: armL.end,
    elbowR: armR.mid,
    wristR: armR.end,
    kneeL: legL.mid,
    ankleL: legL.end,
    kneeR: legR.mid,
    ankleR: legR.end,
    headAngle,
    torsoAngle: torsoTilt,
    handDirL: -Math.PI / 2 + facing * 0.35,
    handDirR: -Math.PI / 2 - facing * 0.35,
    footDirL: Math.PI / 8 * facing,
    footDirR: Math.PI / 8 * facing,
    capeAngle: Math.PI / 2 + Math.sin(cycle * Math.PI * 2) * 0.1,
    skirtAngle: Math.PI / 2,
    weaponAngle: -Math.PI / 6 * facing,
    accessoryAngle: -Math.PI / 2,
    showDebug: false,
  };
}

function solve2Bone(origin, target, len1, len2, bendSign = 1) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const d0 = Math.hypot(dx, dy) || 0.001;
  const maxD = Math.max(1, len1 + len2 - 0.001);
  const d = Math.min(d0, maxD);
  const nx = dx / d0;
  const ny = dy / d0;
  const base = Math.atan2(ny, nx);
  const cosA = clamp((len1 * len1 + d * d - len2 * len2) / (2 * len1 * d), -1, 1);
  const ang = Math.acos(cosA) * bendSign;
  const joint = {
    x: origin.x + Math.cos(base + ang) * len1,
    y: origin.y + Math.sin(base + ang) * len1,
  };
  const end = {
    x: origin.x + nx * d,
    y: origin.y + ny * d,
  };
  return { mid: joint, end };
}

function radians(deg) { return deg * Math.PI / 180; }

function renderPartMaskPreview(canvas) {
  if (!canvas) return;
}

function setStatus(text, which = 'source') {
  if (which === 'source') els.sourceStatus.textContent = text;
  else els.previewStatus.textContent = text;
}

function onSourceWheel(e) {
  if (!state.image) return;
  e.preventDefault();
  const delta = -e.deltaY * 0.0015;
  const oldZoom = state.sourceZoom;
  const newZoom = clamp(oldZoom * (1 + delta), 0.25, 3);
  const rect = els.sourceCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const before = canvasToSource(mouseX, mouseY);
  state.sourceZoom = newZoom;
  els.sourceZoom.value = String(newZoom);
  els.sourceZoomVal.textContent = formatPct(newZoom);
  const afterCanvas = sourceToCanvas(before);
  state.sourcePanX += mouseX - afterCanvas.x;
  state.sourcePanY += mouseY - afterCanvas.y;
  renderSource();
}

function onSourcePointerDown(e) {
  if (!state.image) return;
  els.sourceCanvas.setPointerCapture(e.pointerId);
  const pt = canvasToSource(e.offsetX, e.offsetY);
  const part = selectedPart();

  if (state.tool === 'pan' || e.button === 1 || e.buttons === 4) {
    state.dragging = { kind: 'pan', x: e.clientX, y: e.clientY, panX: state.sourcePanX, panY: state.sourcePanY };
    return;
  }

  if (part) {
    const handle = hitHandle(part, pt);
    if (handle) {
      state.dragging = { kind: handle, partId: part.id };
      return;
    }
  }

  if (state.tool === 'lasso') {
    state.lasso = [pt];
    state.dragging = { kind: 'lasso' };
    renderSource();
    return;
  }

  if (state.tool === 'wand') {
    applyWandSelection(pt);
    return;
  }
}

function onSourcePointerMove(e) {
  if (!state.image) return;
  const part = selectedPart();
  if (!state.dragging) return;
  if (state.dragging.kind === 'pan') {
    state.sourcePanX = state.dragging.panX + (e.clientX - state.dragging.x);
    state.sourcePanY = state.dragging.panY + (e.clientY - state.dragging.y);
    renderSource();
    return;
  }
  const pt = canvasToSource(e.offsetX, e.offsetY);
  if (state.dragging.kind === 'lasso') {
    const last = state.lasso[state.lasso.length - 1];
    if (!last || distance(last, pt) > 3) state.lasso.push(pt);
    renderSource();
    return;
  }
  if (!part) return;
  if (state.dragging.kind === 'anchor') {
    part.anchor = pt;
    syncPartUI();
    rebuildSelectedRaster();
  } else if (state.dragging.kind === 'tip') {
    part.tip = pt;
    syncPartUI();
    rebuildSelectedRaster();
  }
  renderSource();
  renderPreview();
}

function onSourcePointerUp(e) {
  if (!state.image) return;
  if (!state.dragging) return;
  const drag = state.dragging;
  state.dragging = null;
  if (drag.kind === 'lasso') {
    finishLassoSelection();
  }
}

function hitHandle(part, pt) {
  const a = distance(part.anchor, pt);
  const b = distance(part.tip, pt);
  const thresh = 12 / (state.sourceFit * state.sourceZoom);
  if (a < thresh) return 'anchor';
  if (b < thresh) return 'tip';
  return null;
}

function applyWandSelection(pt) {
  const part = selectedPart();
  if (!part || !state.image) return;
  const selection = floodFillSelection(state.image.canvas, Math.round(pt.x), Math.round(pt.y), state.wandTolerance);
  if (!selection) return;
  applySelectionToPart(part, selection);
}

function finishLassoSelection() {
  const part = selectedPart();
  if (!part || state.lasso.length < 3 || !state.image) {
    state.lasso = [];
    renderSource();
    return;
  }
  const selection = polygonMask(state.image.w, state.image.h, state.lasso);
  state.lasso = [];
  applySelectionToPart(part, selection);
}

function applySelectionToPart(part, selectionCanvas) {
  if (!part.maskCanvas || state.maskMode === 'replace') {
    part.maskCanvas = selectionCanvas;
  } else {
    const merged = document.createElement('canvas');
    merged.width = state.image.w;
    merged.height = state.image.h;
    const mctx = merged.getContext('2d');
    mctx.clearRect(0, 0, merged.width, merged.height);
    mctx.drawImage(part.maskCanvas, 0, 0);
    mctx.globalCompositeOperation = state.maskMode === 'subtract' ? 'destination-out' : 'source-over';
    mctx.drawImage(selectionCanvas, 0, 0);
    part.maskCanvas = merged;
  }
  rebuildSelectedRaster();
  renderPartList();
  renderSource();
  renderPreview();
}

function polygonMask(w, h, points) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
  if (state.feather > 0) softenMask(c, state.feather);
  return c;
}

function floodFillSelection(imgCanvas, startX, startY, tolerance = 30) {
  const w = imgCanvas.width, h = imgCanvas.height;
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return null;
  const ctx = imgCanvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const idx = (startY * w + startX) * 4;
  const seed = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  if (seed[3] < 5) return null;
  const visited = new Uint8Array(w * h);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const image = octx.createImageData(w, h);
  const outData = image.data;
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let qh = 0, qt = 0;
  qx[qt] = startX; qy[qt] = startY; qt++;
  visited[startY * w + startX] = 1;

  const within = (i) => {
    const dr = Math.abs(data[i] - seed[0]);
    const dg = Math.abs(data[i + 1] - seed[1]);
    const db = Math.abs(data[i + 2] - seed[2]);
    const da = Math.abs(data[i + 3] - seed[3]);
    return (dr + dg + db + da) <= tolerance * 4;
  };
  while (qh < qt) {
    const x = qx[qh], y = qy[qh];
    qh++;
    const i = (y * w + x) * 4;
    if (!within(i)) continue;
    outData[i + 3] = 255;
    if (x > 0) {
      const n = y * w + (x - 1);
      if (!visited[n]) { visited[n] = 1; qx[qt] = x - 1; qy[qt] = y; qt++; }
    }
    if (x < w - 1) {
      const n = y * w + (x + 1);
      if (!visited[n]) { visited[n] = 1; qx[qt] = x + 1; qy[qt] = y; qt++; }
    }
    if (y > 0) {
      const n = (y - 1) * w + x;
      if (!visited[n]) { visited[n] = 1; qx[qt] = x; qy[qt] = y - 1; qt++; }
    }
    if (y < h - 1) {
      const n = (y + 1) * w + x;
      if (!visited[n]) { visited[n] = 1; qx[qt] = x; qy[qt] = y + 1; qt++; }
    }
  }
  octx.putImageData(image, 0, 0);
  if (state.feather > 0) softenMask(out, state.feather);
  return out;
}

function softenMask(canvas, px) {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext('2d');
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(canvas, 0, 0);
  const dst = canvas.getContext('2d');
  dst.clearRect(0, 0, canvas.width, canvas.height);
  dst.drawImage(c, 0, 0);
}

function exportProjectJSON() {
  if (!state.image) return;
  const data = {
    source: { width: state.image.w, height: state.image.h },
    settings: { pose: state.pose, facing: state.facing, speed: state.speed, tilt: state.tilt, feather: state.feather },
    parts: state.parts.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      parentId: p.parentId,
      visible: p.visible,
      showMask: p.showMask,
      color: p.color,
      anchor: p.anchor,
      tip: p.tip,
      mask: p.maskCanvas ? p.maskCanvas.toDataURL('image/png') : null,
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'spritemith-project.json');
}

function exportPreviewPNG() {
  if (!state.image) return;
  renderPreview();
  els.previewCanvas.toBlob(blob => {
    if (blob) downloadBlob(blob, 'spritemith-preview.png');
  });
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function loop(now) {
  state.raf = requestAnimationFrame(loop);
  if (!state.image) return;
  const speed = state.speed || 1;
  const increment = speed * (state.pose === 'idle' ? 0.004 : 0.009);
  state.phase = (state.phase + increment) % 1;
  renderPreview();
}

function resizePreviewOnly() {
  const rect = els.previewCanvas.parentElement.getBoundingClientRect();
  els.previewCanvas.width = Math.max(300, Math.floor(rect.width));
  els.previewCanvas.height = Math.max(260, Math.floor(rect.height));
  fitPreviewView();
}

function resizeSourceOnly() {
  const rect = els.sourceCanvas.parentElement.getBoundingClientRect();
  els.sourceCanvas.width = Math.max(300, Math.floor(rect.width));
  els.sourceCanvas.height = Math.max(260, Math.floor(rect.height));
  fitSourceView();
}



