import { removeBackground } from './bgremove.js';

const PART_TYPES = [
  'torso','chest','pelvis','neck','head','hair','face',
  'upper arm L','lower arm L','hand L','upper arm R','lower arm R','hand R',
  'thigh L','shin L','foot L','thigh R','shin R','foot R',
  'shoulder pad L','shoulder pad R','cape','skirt','weapon','shield','accessory'
];

const DEFAULT_PARENT = {
  head: 'neck', hair: 'head', face: 'head', neck: 'chest', chest: 'torso',
  torso: 'pelvis', pelvis: null,
  'upper arm L': 'chest', 'lower arm L': 'upper arm L', 'hand L': 'lower arm L',
  'upper arm R': 'chest', 'lower arm R': 'upper arm R', 'hand R': 'lower arm R',
  'thigh L': 'pelvis', 'shin L': 'thigh L', 'foot L': 'shin L',
  'thigh R': 'pelvis', 'shin R': 'thigh R', 'foot R': 'shin R',
  'shoulder pad L': 'chest', 'shoulder pad R': 'chest',
  cape: 'chest', skirt: 'pelvis', weapon: 'hand R', shield: 'hand L', accessory: 'torso'
};

const PALETTE = [
  '#6ee7ff','#8b5cf6','#f59e0b','#34d399','#f43f5e','#a3e635','#f97316','#60a5fa',
  '#f472b6','#14b8a6','#e879f9','#c084fc','#fb7185','#22c55e','#facc15','#38bdf8'
];

const state = {
  sourceImage: null,
  sourceCanvas: null,
  cleanCanvas: null,
  sourceW: 0,
  sourceH: 0,
  parts: [],
  selectedPartId: null,
  tool: 'lasso',
  maskOp: 'replace',
  wandTolerance: 28,
  selectionSmooth: 0.3,
  pose: 'walk',
  speed: 1,
  tiltDeg: 0,
  animStart: performance.now(),
  previewSheet: null,
  draggingJoint: null,
  lassoPoints: [],
  lassoActive: false,
  fit: { scale: 1, ox: 0, oy: 0 },
  busy: false,
  savedAt: null,
};

const els = {
  uploadZone: document.getElementById('uploadZone'),
  fileInput: document.getElementById('fileInput'),
  clearImageBtn: document.getElementById('clearImageBtn'),
  toolButtons: [...document.querySelectorAll('[data-tool]')],
  maskButtons: [...document.querySelectorAll('[data-mask-op]')],
  wandTolerance: document.getElementById('wandTolerance'),
  wandToleranceVal: document.getElementById('wandToleranceVal'),
  selectionSmooth: document.getElementById('selectionSmooth'),
  selectionSmoothVal: document.getElementById('selectionSmoothVal'),
  addPartBtn: document.getElementById('addPartBtn'),
  partTypeSelect: document.getElementById('partTypeSelect'),
  partList: document.getElementById('partList'),
  selectedPartEmpty: document.getElementById('selectedPartEmpty'),
  selectedPartEditor: document.getElementById('selectedPartEditor'),
  partNameInput: document.getElementById('partNameInput'),
  partTypeEdit: document.getElementById('partTypeEdit'),
  partParentSelect: document.getElementById('partParentSelect'),
  partVisibleToggle: document.getElementById('partVisibleToggle'),
  showMaskToggle: document.getElementById('showMaskToggle'),
  resetJointBtn: document.getElementById('resetJointBtn'),
  clearMaskBtn: document.getElementById('clearMaskBtn'),
  poseSelect: document.getElementById('poseSelect'),
  speedSlider: document.getElementById('speedSlider'),
  speedVal: document.getElementById('speedVal'),
  tiltSlider: document.getElementById('tiltSlider'),
  tiltVal: document.getElementById('tiltVal'),
  editorCanvas: document.getElementById('editorCanvas'),
  previewCanvas: document.getElementById('previewCanvas'),
  editorPlaceholder: document.getElementById('editorPlaceholder'),
  previewPlaceholder: document.getElementById('previewPlaceholder'),
  canvasStatus: document.getElementById('canvasStatus'),
  previewStatus: document.getElementById('previewStatus'),
  saveBtn: document.getElementById('saveBtn'),
  loadBtn: document.getElementById('loadBtn'),
  exportProjectBtn: document.getElementById('exportProjectBtn'),
  exportPreviewBtn: document.getElementById('exportPreviewBtn'),
  exportSheetBtn: document.getElementById('exportSheetBtn'),
};

const editorCtx = els.editorCanvas.getContext('2d');
const previewCtx = els.previewCanvas.getContext('2d');

populateTypeOptions();
resizeCanvases();
wireEvents();
renderAll();

window.addEventListener('resize', () => {
  resizeCanvases();
  renderAll();
});

// ------------------------------ UI helpers ------------------------------

function populateTypeOptions() {
  for (const sel of [els.partTypeSelect, els.partTypeEdit]) {
    sel.innerHTML = '';
    for (const type of PART_TYPES) {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type;
      sel.appendChild(opt);
    }
  }
  els.partTypeSelect.value = 'torso';
  els.partTypeEdit.value = 'torso';
}

function wireEvents() {
  // upload
  els.uploadZone.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    const file = els.fileInput.files?.[0];
    if (file) loadImageFile(file);
  });
  els.uploadZone.addEventListener('dragover', e => { e.preventDefault(); els.uploadZone.classList.add('drag'); });
  els.uploadZone.addEventListener('dragleave', () => els.uploadZone.classList.remove('drag'));
  els.uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    els.uploadZone.classList.remove('drag');
    const file = e.dataTransfer.files?.[0];
    if (file) loadImageFile(file);
  });
  els.clearImageBtn.addEventListener('click', clearProject);

  // tools
  for (const btn of els.toolButtons) {
    btn.addEventListener('click', () => {
      state.tool = btn.dataset.tool;
      els.toolButtons.forEach(b => b.classList.toggle('active', b === btn));
    });
  }
  for (const btn of els.maskButtons) {
    btn.addEventListener('click', () => {
      state.maskOp = btn.dataset.maskOp;
      els.maskButtons.forEach(b => b.classList.toggle('active', b === btn));
    });
  }
  els.wandTolerance.addEventListener('input', () => {
    state.wandTolerance = Number(els.wandTolerance.value);
    els.wandToleranceVal.textContent = String(state.wandTolerance);
  });
  els.selectionSmooth.addEventListener('input', () => {
    state.selectionSmooth = Number(els.selectionSmooth.value);
    els.selectionSmoothVal.textContent = state.selectionSmooth.toFixed(2);
  });

  // parts
  els.addPartBtn.addEventListener('click', addSelectedPart);
  els.partNameInput.addEventListener('input', () => {
    const part = getSelectedPart();
    if (!part) return;
    part.name = els.partNameInput.value;
    renderParts();
  });
  els.partTypeEdit.addEventListener('change', () => {
    const part = getSelectedPart();
    if (!part) return;
    part.type = els.partTypeEdit.value;
    if (!part.name || part.name.startsWith('Part')) part.name = humanizeType(part.type);
    if (!part.parentId || !findPart(part.parentId)) part.parentId = DEFAULT_PARENT[part.type] ?? null;
    if (!part.joint) part.joint = defaultJointForType(part.type);
    renderSelectedPartEditor();
    renderParts();
    renderAll();
  });
  els.partParentSelect.addEventListener('change', () => {
    const part = getSelectedPart();
    if (!part) return;
    const val = els.partParentSelect.value;
    part.parentId = val || null;
    renderParts();
    renderAll();
  });
  els.partVisibleToggle.addEventListener('change', () => {
    const part = getSelectedPart();
    if (!part) return;
    part.visible = els.partVisibleToggle.checked;
    renderParts();
    renderAll();
  });
  els.showMaskToggle.addEventListener('change', renderAll);
  els.resetJointBtn.addEventListener('click', () => {
    const part = getSelectedPart();
    if (!part || !state.sourceCanvas) return;
    part.joint = defaultJointForType(part.type);
    updatePartCutout(part);
    renderParts();
    renderAll();
  });
  els.clearMaskBtn.addEventListener('click', () => {
    const part = getSelectedPart();
    if (!part) return;
    part.maskCanvas = null;
    part.canvas = null;
    part.anchor = null;
    renderParts();
    renderAll();
  });

  // animation
  els.poseSelect.addEventListener('change', () => { state.pose = els.poseSelect.value; renderAll(); });
  els.speedSlider.addEventListener('input', () => {
    state.speed = Number(els.speedSlider.value);
    els.speedVal.textContent = `${state.speed.toFixed(2)}×`;
    renderAll();
  });
  els.tiltSlider.addEventListener('input', () => {
    state.tiltDeg = Number(els.tiltSlider.value);
    els.tiltVal.textContent = `${state.tiltDeg}°`;
    renderAll();
  });

  // export/save
  els.saveBtn.addEventListener('click', saveProject);
  els.loadBtn.addEventListener('click', loadProject);
  els.exportProjectBtn.addEventListener('click', exportProjectJSON);
  els.exportPreviewBtn.addEventListener('click', exportPreviewPNG);
  els.exportSheetBtn.addEventListener('click', exportSheetPNG);

  // editor canvas interactions
  const pointerDown = e => handlePointerDown(e);
  const pointerMove = e => handlePointerMove(e);
  const pointerUp = e => handlePointerUp(e);
  els.editorCanvas.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
}

// ------------------------------ Loading / projects ------------------------------

async function loadImageFile(file) {
  try {
    const img = await fileToImage(file);
    state.sourceImage = img;

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = img.naturalWidth;
    sourceCanvas.height = img.naturalHeight;
    sourceCanvas.getContext('2d').drawImage(img, 0, 0);
    state.sourceCanvas = sourceCanvas;

    els.canvasStatus.textContent = 'Removing background…';
    els.editorPlaceholder.classList.remove('hidden');

    try {
      state.cleanCanvas = await removeBackground(img, p => {
        els.canvasStatus.textContent = `Removing background… ${Math.round(p * 100)}%`;
      });
    } catch {
      state.cleanCanvas = sourceCanvas;
    }

    state.sourceW = state.cleanCanvas.width;
    state.sourceH = state.cleanCanvas.height;
    state.parts = [];
    state.selectedPartId = null;
    state.savedAt = null;
    state.animStart = performance.now();
    els.canvasStatus.textContent = `${state.sourceW}×${state.sourceH}`;
    els.editorPlaceholder.classList.toggle('hidden', !state.cleanCanvas);
    els.previewPlaceholder.classList.add('hidden');
    state.previewSheet = null;
    renderParts();
    selectPart(null);
    resizeCanvases();
    renderAll();
  } catch (err) {
    console.error(err);
    alert('Could not load image.');
  }
}

function clearProject() {
  state.sourceImage = null;
  state.sourceCanvas = null;
  state.cleanCanvas = null;
  state.sourceW = 0;
  state.sourceH = 0;
  state.parts = [];
  state.selectedPartId = null;
  state.previewSheet = null;
  els.canvasStatus.textContent = 'No image loaded';
  els.editorPlaceholder.classList.remove('hidden');
  els.previewPlaceholder.classList.remove('hidden');
  renderParts();
  selectPart(null);
  renderAll();
}

function saveProject() {
  if (!state.cleanCanvas) return;
  const payload = exportProjectData();
  localStorage.setItem('spritesmith_outline_rig', JSON.stringify(payload));
  state.savedAt = Date.now();
  alert('Project saved locally.');
}

async function loadProject() {
  const raw = localStorage.getItem('spritesmith_outline_rig');
  if (!raw) {
    alert('No saved project found.');
    return;
  }
  const data = JSON.parse(raw);
  await importProjectData(data);
  alert('Project loaded.');
}

function exportProjectJSON() {
  if (!state.cleanCanvas) return;
  const data = exportProjectData();
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'spritesmith_project.json');
}

function exportPreviewPNG() {
  if (!state.cleanCanvas) return;
  const c = document.createElement('canvas');
  c.width = els.previewCanvas.width;
  c.height = els.previewCanvas.height;
  const ctx = c.getContext('2d');
  drawPreview(ctx, performance.now(), true);
  downloadBlobCanvas(c, 'spritesmith_preview.png');
}

function exportSheetPNG() {
  if (!state.cleanCanvas) return;
  const frames = 12;
  const size = 256;
  const sheet = document.createElement('canvas');
  sheet.width = frames * size;
  sheet.height = size;
  const sctx = sheet.getContext('2d');
  for (let i = 0; i < frames; i++) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    drawPreview(c.getContext('2d'), state.animStart + (i / frames) * 1000, true);
    sctx.drawImage(c, i * size, 0, size, size);
  }
  downloadBlobCanvas(sheet, 'spritesmith_sheet.png');
}

function exportProjectData() {
  return {
    version: 1,
    image: state.cleanCanvas?.toDataURL('image/png') ?? null,
    settings: {
      tool: state.tool,
      maskOp: state.maskOp,
      wandTolerance: state.wandTolerance,
      selectionSmooth: state.selectionSmooth,
      pose: state.pose,
      speed: state.speed,
      tiltDeg: state.tiltDeg,
    },
    parts: state.parts.map(part => ({
      id: part.id,
      type: part.type,
      name: part.name,
      parentId: part.parentId,
      visible: part.visible,
      color: part.color,
      joint: part.joint,
      mask: part.maskCanvas?.toDataURL('image/png') ?? null,
    })),
  };
}

async function importProjectData(data) {
  if (!data?.image) return;
  const img = await dataUrlToImage(data.image);
  state.sourceImage = img;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  state.cleanCanvas = c;
  state.sourceCanvas = c;
  state.sourceW = c.width;
  state.sourceH = c.height;
  const settings = data.settings || {};
  state.tool = settings.tool || 'lasso';
  state.maskOp = settings.maskOp || 'replace';
  state.wandTolerance = settings.wandTolerance ?? 28;
  state.selectionSmooth = settings.selectionSmooth ?? 0.3;
  state.pose = settings.pose || 'walk';
  state.speed = settings.speed ?? 1;
  state.tiltDeg = settings.tiltDeg ?? 0;
  els.wandTolerance.value = String(state.wandTolerance);
  els.wandToleranceVal.textContent = String(state.wandTolerance);
  els.selectionSmooth.value = String(state.selectionSmooth);
  els.selectionSmoothVal.textContent = state.selectionSmooth.toFixed(2);
  els.poseSelect.value = state.pose;
  els.speedSlider.value = String(state.speed);
  els.speedVal.textContent = `${state.speed.toFixed(2)}×`;
  els.tiltSlider.value = String(state.tiltDeg);
  els.tiltVal.textContent = `${state.tiltDeg}°`;
  els.toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool === state.tool));
  els.maskButtons.forEach(b => b.classList.toggle('active', b.dataset.maskOp === state.maskOp));

  state.parts = [];
  for (const p of data.parts || []) {
    const part = {
      id: p.id,
      type: p.type,
      name: p.name,
      parentId: p.parentId,
      visible: p.visible !== false,
      color: p.color || colorForType(p.type),
      joint: p.joint || defaultJointForType(p.type),
      maskCanvas: null,
      canvas: null,
      anchor: null,
    };
    if (p.mask) {
      const maskImg = await dataUrlToImage(p.mask);
      part.maskCanvas = document.createElement('canvas');
      part.maskCanvas.width = maskImg.naturalWidth;
      part.maskCanvas.height = maskImg.naturalHeight;
      part.maskCanvas.getContext('2d').drawImage(maskImg, 0, 0);
      updatePartCutout(part);
    }
    state.parts.push(part);
  }
  state.selectedPartId = state.parts[0]?.id ?? null;
  els.canvasStatus.textContent = `${state.sourceW}×${state.sourceH}`;
  els.editorPlaceholder.classList.toggle('hidden', !state.cleanCanvas);
  els.previewPlaceholder.classList.toggle('hidden', !state.cleanCanvas);
  renderParts();
  renderSelectedPartEditor();
  renderAll();
}

// ------------------------------ Part management ------------------------------

function addSelectedPart() {
  if (!state.cleanCanvas) return;
  const type = els.partTypeSelect.value;
  const count = state.parts.filter(p => p.type === type).length + 1;
  const part = {
    id: uid(),
    type,
    name: `${humanizeType(type)} ${count}`,
    parentId: DEFAULT_PARENT[type] ?? null,
    visible: true,
    color: colorForType(type),
    joint: defaultJointForType(type),
    maskCanvas: null,
    canvas: null,
    anchor: null,
  };
  state.parts.push(part);
  selectPart(part.id);
  renderParts();
  renderSelectedPartEditor();
  renderAll();
}

function selectPart(id) {
  state.selectedPartId = id;
  renderParts();
  renderSelectedPartEditor();
  renderAll();
}

function getSelectedPart() {
  return state.parts.find(p => p.id === state.selectedPartId) || null;
}

function findPart(id) {
  return state.parts.find(p => p.id === id) || null;
}

function renderParts() {
  els.partList.innerHTML = '';
  for (const part of state.parts) {
    const row = document.createElement('div');
    row.className = `part-item${part.id === state.selectedPartId ? ' active' : ''}`;
    row.innerHTML = `
      <div class="part-left">
        <span class="part-dot" style="background:${part.color}"></span>
        <div style="min-width:0">
          <div class="part-name">${escapeHtml(part.name)}</div>
          <div class="part-type">${escapeHtml(part.type)}${part.parentId ? ` → ${escapeHtml(findPart(part.parentId)?.name || part.parentId)}` : ''}</div>
        </div>
      </div>
      <div class="part-actions">
        <button class="icon-btn" data-select="${part.id}" title="Select">◉</button>
        <button class="icon-btn" data-delete="${part.id}" title="Delete">✕</button>
      </div>
    `;
    row.addEventListener('click', e => {
      const target = e.target;
      if (target?.dataset?.delete) return;
      selectPart(part.id);
    });
    row.querySelector('[data-select]')?.addEventListener('click', e => {
      e.stopPropagation();
      selectPart(part.id);
    });
    row.querySelector('[data-delete]')?.addEventListener('click', e => {
      e.stopPropagation();
      deletePart(part.id);
    });
    els.partList.appendChild(row);
  }
}

function deletePart(id) {
  state.parts = state.parts.filter(p => p.id !== id);
  for (const p of state.parts) {
    if (p.parentId === id) p.parentId = null;
  }
  if (state.selectedPartId === id) state.selectedPartId = state.parts[0]?.id ?? null;
  renderParts();
  renderSelectedPartEditor();
  renderAll();
}

function renderSelectedPartEditor() {
  const part = getSelectedPart();
  const has = !!part;
  els.selectedPartEmpty.classList.toggle('hidden', has);
  els.selectedPartEditor.classList.toggle('hidden', !has);
  if (!part) return;
  els.partNameInput.value = part.name;
  els.partTypeEdit.value = part.type;
  els.partVisibleToggle.checked = part.visible !== false;
  els.showMaskToggle.checked = true;

  els.partParentSelect.innerHTML = '<option value="">(none)</option>';
  for (const p of state.parts) {
    if (p.id === part.id) continue;
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    els.partParentSelect.appendChild(opt);
  }
  els.partParentSelect.value = part.parentId || '';
}

// ------------------------------ Canvas interaction ------------------------------

function handlePointerDown(e) {
  if (!state.cleanCanvas) return;
  const pos = sourcePointFromEvent(e);
  if (!pos) return;

  const hit = hitTestJoint(pos);
  const selected = getSelectedPart();

  if (state.tool === 'wand') {
    if (!selected) return;
    applyWandSelection(pos.x, pos.y);
    return;
  }

  if (state.tool === 'lasso') {
    state.lassoActive = true;
    state.lassoPoints = [pos];
    els.editorCanvas.setPointerCapture(e.pointerId);
    return;
  }

  if (state.tool === 'joint') {
    if (hit) {
      state.draggingJoint = hit;
      els.editorCanvas.setPointerCapture(e.pointerId);
      return;
    }
    if (selected) {
      selected.joint = clampPoint(pos);
      updatePartCutout(selected);
      renderParts();
      renderSelectedPartEditor();
      renderAll();
    }
  }
}

function handlePointerMove(e) {
  if (!state.cleanCanvas) return;
  const pos = sourcePointFromEvent(e);
  if (!pos) return;

  if (state.lassoActive && state.tool === 'lasso') {
    const last = state.lassoPoints[state.lassoPoints.length - 1];
    const d = dist(last, pos);
    if (d > 3) state.lassoPoints.push(pos);
    renderAll();
    return;
  }

  if (state.draggingJoint) {
    const part = state.draggingJoint.part;
    part.joint = clampPoint(pos);
    updatePartCutout(part);
    renderParts();
    renderSelectedPartEditor();
    renderAll();
  }
}

function handlePointerUp(e) {
  if (!state.cleanCanvas) return;
  if (state.lassoActive && state.tool === 'lasso') {
    state.lassoActive = false;
    if (state.lassoPoints.length >= 3) {
      const mask = polygonMaskCanvas(state.lassoPoints, state.sourceW, state.sourceH, state.selectionSmooth);
      applyMaskToSelectedPart(mask);
    }
    state.lassoPoints = [];
    renderAll();
  }
  if (state.draggingJoint) {
    state.draggingJoint = null;
    renderAll();
  }
}

function hitTestJoint(sourcePoint) {
  const r = 12 / state.fit.scale;
  let best = null;
  let bestD = Infinity;
  for (const part of state.parts) {
    if (!part.joint) continue;
    const d = dist(part.joint, sourcePoint);
    if (d < r && d < bestD) {
      best = { part };
      bestD = d;
    }
  }
  return best;
}

function applyWandSelection(sx, sy) {
  const selected = getSelectedPart();
  if (!selected) return;
  const mask = wandMaskCanvas(state.cleanCanvas || state.sourceCanvas, sx, sy, state.wandTolerance);
  applyMaskToSelectedPart(mask);
}

function applyMaskToSelectedPart(maskCanvas) {
  const part = getSelectedPart();
  if (!part) return;
  if (state.maskOp === 'replace' || !part.maskCanvas) {
    part.maskCanvas = maskCanvas;
  } else {
    part.maskCanvas = combineMaskCanvases(part.maskCanvas, maskCanvas, state.maskOp);
  }
  updatePartCutout(part);
  renderParts();
  renderAll();
}

function updatePartCutout(part) {
  const srcCanvas = state.cleanCanvas || state.sourceCanvas;
  if (!srcCanvas || !part.maskCanvas) {
    part.canvas = null;
    part.anchor = null;
    return;
  }
  const src = srcCanvas;
  const W = src.width;
  const H = src.height;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const mctx = part.maskCanvas.getContext('2d', { willReadFrequently: true });
  const srcData = sctx.getImageData(0, 0, W, H).data;
  const maskData = mctx.getImageData(0, 0, W, H).data;

  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0; i < W * H; i++) {
    if (maskData[i * 4 + 3] > 0) {
      const x = i % W;
      const y = (i / W) | 0;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) {
    part.canvas = null;
    part.anchor = null;
    return;
  }

  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const cut = document.createElement('canvas');
  cut.width = bw;
  cut.height = bh;
  const cctx = cut.getContext('2d');
  const out = cctx.createImageData(bw, bh);
  const od = out.data;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const si = (y * W + x) * 4;
      const di = ((y - y0) * bw + (x - x0)) * 4;
      const alpha = maskData[si + 3];
      if (!alpha) continue;
      od[di] = srcData[si];
      od[di + 1] = srcData[si + 1];
      od[di + 2] = srcData[si + 2];
      od[di + 3] = Math.min(255, srcData[si + 3]);
    }
  }
  cctx.putImageData(out, 0, 0);
  part.canvas = cut;
  part.anchor = {
    x: clamp(part.joint.x - x0, 0, bw - 1),
    y: clamp(part.joint.y - y0, 0, bh - 1),
  };
}

// ------------------------------ Drawing ------------------------------

function renderAll() {
  resizeCanvases();
  drawEditor();
  drawPreview(previewCtx, performance.now(), false);
}

function drawEditor() {
  const canvas = els.editorCanvas;
  const ctx = editorCtx;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!state.cleanCanvas) {
    els.editorPlaceholder.classList.remove('hidden');
    return;
  }
  els.editorPlaceholder.classList.add('hidden');

  state.fit = fitCanvasToImage(w, h, state.sourceW, state.sourceH);
  const { scale, ox, oy } = state.fit;

  // base image
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(state.cleanCanvas, ox, oy, state.sourceW * scale, state.sourceH * scale);
  ctx.restore();

  // masks and labels
  const showMask = els.showMaskToggle.checked;
  if (showMask) {
    for (const part of state.parts) {
      if (!part.maskCanvas || !part.visible) continue;
      ctx.save();
      ctx.globalAlpha = part.id === state.selectedPartId ? 0.55 : 0.32;
      ctx.drawImage(part.maskCanvas, ox, oy, state.sourceW * scale, state.sourceH * scale);
      ctx.restore();
    }
  }

  // lasso preview
  if (state.lassoActive && state.lassoPoints.length > 1) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    const first = state.lassoPoints[0];
    ctx.moveTo(first.x * scale + ox, first.y * scale + oy);
    for (let i = 1; i < state.lassoPoints.length; i++) {
      const p = state.lassoPoints[i];
      ctx.lineTo(p.x * scale + ox, p.y * scale + oy);
    }
    ctx.stroke();
    ctx.restore();
  }

  // skeleton lines
  ctx.save();
  ctx.lineCap = 'round';
  for (const part of state.parts) {
    if (!part.parentId) continue;
    const parent = findPart(part.parentId);
    if (!parent || !parent.joint || !part.joint) continue;
    const ax = parent.joint.x * scale + ox;
    const ay = parent.joint.y * scale + oy;
    const bx = part.joint.x * scale + ox;
    const by = part.joint.y * scale + oy;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = '#dbe7ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.restore();

  // joints
  for (const part of state.parts) {
    if (!part.joint) continue;
    const x = part.joint.x * scale + ox;
    const y = part.joint.y * scale + oy;
    const active = part.id === state.selectedPartId;
    ctx.save();
    ctx.fillStyle = active ? part.color : '#0b0f15';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = active ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, active ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(part.name, x + 10, y - 10);
    ctx.restore();
  }
}

function drawPreview(ctx, now, exportMode) {
  const canvas = ctx.canvas;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!state.cleanCanvas || !state.parts.length) {
    if (!exportMode) els.previewPlaceholder.classList.remove('hidden');
    return;
  }
  if (!exportMode) els.previewPlaceholder.classList.add('hidden');

  const bbox = sourceBBox(state.cleanCanvas);
  const scale = Math.min((W * 0.60) / Math.max(bbox.w, 1), (H * 0.72) / Math.max(bbox.h, 1), 4);
  const root = chooseRootPart();
  const rootSource = root?.joint || centerOfParts() || { x: state.sourceW / 2, y: state.sourceH / 2 };
  const origin = {
    x: W * 0.5 / scale,
    y: H * 0.82 / scale,
  };

  const t = (((now - state.animStart) / 1000) * state.speed) % 1;
  const order = topoOrder();
  const transforms = new Map();

  const rootAnim = rootMotion(state.pose, t, state.tiltDeg);
  for (const part of order) {
    const deltaRot = partMotion(part, state.pose, t);
    const parent = part.parentId ? transforms.get(part.parentId) : null;
    let pos, rot;
    if (!parent) {
      const dx = (part.joint?.x ?? rootSource.x) - rootSource.x;
      const dy = (part.joint?.y ?? rootSource.y) - rootSource.y;
      const off = rotateVec(dx, dy, rootAnim.rot);
      pos = { x: origin.x + off.x + rootAnim.dx, y: origin.y + off.y + rootAnim.dy };
      rot = rootAnim.rot + deltaRot;
    } else {
      const dx = (part.joint?.x ?? 0) - (findPart(part.parentId)?.joint?.x ?? 0);
      const dy = (part.joint?.y ?? 0) - (findPart(part.parentId)?.joint?.y ?? 0);
      const off = rotateVec(dx, dy, parent.rot);
      pos = { x: parent.pos.x + off.x, y: parent.pos.y + off.y };
      rot = parent.rot + deltaRot;
    }
    transforms.set(part.id, { pos, rot, part });
  }

  // order draw by list order but ensure parents are behind children
  const drawOrder = order.slice().sort((a, b) => depthOf(a) - depthOf(b));
  for (const part of drawOrder) {
    const tr = transforms.get(part.id);
    if (!tr || !part.visible || !part.canvas || !part.anchor) continue;
    const px = tr.pos.x * scale;
    const py = tr.pos.y * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(tr.rot);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(part.canvas, -part.anchor.x, -part.anchor.y);
    ctx.restore();
  }

  // shadow / ground anchor
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.88, Math.max(60, bbox.w * scale * 0.18), 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // status
  els.previewStatus.textContent = `${state.pose} • ${state.speed.toFixed(2)}×`;
}

// ------------------------------ Animation math ------------------------------

function rootMotion(pose, t, tiltDeg) {
  const tilt = degToRad(tiltDeg);
  const s = Math.sin(t * Math.PI * 2);
  switch (pose) {
    case 'idle':
      return { dx: 0, dy: Math.abs(s) * -5, rot: tilt + s * 0.03 };
    case 'walk':
      return { dx: 0, dy: Math.abs(s) * -10, rot: tilt + s * 0.06 };
    case 'run':
      return { dx: 0, dy: Math.abs(s) * -14, rot: tilt + s * 0.1 };
    case 'jump': {
      const p = t < 0.45 ? easeOut(t / 0.45) : 1 - easeIn((t - 0.45) / 0.55);
      return { dx: 0, dy: -p * 90, rot: tilt - p * 0.06 };
    }
    default:
      return { dx: 0, dy: 0, rot: tilt };
  }
}

function partMotion(part, pose, t) {
  const side = sideSign(part.type, part.name);
  const s = Math.sin(t * Math.PI * 2);
  const s2 = Math.sin(t * Math.PI * 2 + Math.PI / 2);
  const type = part.type.toLowerCase();

  if (pose === 'idle') {
    if (type.includes('head') || type.includes('neck')) return degToRad(2) * s2;
    if (type.includes('arm')) return degToRad(3) * side * s;
    if (type.includes('thigh') || type.includes('shin')) return degToRad(2) * -side * s;
    if (type.includes('torso') || type.includes('chest') || type.includes('pelvis')) return degToRad(1.5) * s;
    return 0;
  }

  if (pose === 'walk') {
    if (type.includes('head') || type.includes('neck')) return degToRad(3) * s2;
    if (type.includes('torso') || type.includes('chest')) return degToRad(4) * s * 0.25;
    if (type.includes('pelvis')) return degToRad(5) * s * 0.35;
    if (type.includes('upper arm')) return degToRad(28) * (-side) * s;
    if (type.includes('lower arm')) return degToRad(18) * (-side) * Math.sin(t * Math.PI * 2 + 0.2);
    if (type.includes('hand')) return degToRad(8) * (-side) * s;
    if (type.includes('thigh')) return degToRad(30) * (side) * s;
    if (type.includes('shin')) return degToRad(22) * (side) * Math.max(0, s) + degToRad(8) * Math.min(0, s);
    if (type.includes('foot')) return degToRad(10) * (-side) * Math.max(0, s);
    if (type.includes('hair')) return degToRad(6) * s;
  }

  if (pose === 'run') {
    if (type.includes('head') || type.includes('neck')) return degToRad(4) * s2;
    if (type.includes('torso') || type.includes('chest')) return degToRad(6) * s * 0.3;
    if (type.includes('pelvis')) return degToRad(8) * s * 0.5;
    if (type.includes('upper arm')) return degToRad(40) * (-side) * s;
    if (type.includes('lower arm')) return degToRad(25) * (-side) * Math.sin(t * Math.PI * 4 + 0.1);
    if (type.includes('hand')) return degToRad(10) * (-side) * s;
    if (type.includes('thigh')) return degToRad(48) * (side) * s;
    if (type.includes('shin')) return degToRad(36) * (side) * Math.max(0, s) + degToRad(12) * Math.min(0, s);
    if (type.includes('foot')) return degToRad(12) * (-side) * Math.max(0, s);
    if (type.includes('hair')) return degToRad(10) * s;
  }

  if (pose === 'jump') {
    const bob = t < 0.45 ? easeOut(t / 0.45) : 1 - easeIn((t - 0.45) / 0.55);
    if (type.includes('head') || type.includes('neck')) return degToRad(-4) * bob;
    if (type.includes('upper arm')) return degToRad(20) * (-side) * (1 - bob);
    if (type.includes('lower arm')) return degToRad(12) * (-side) * (1 - bob);
    if (type.includes('thigh')) return degToRad(18) * (side) * (1 - bob);
    if (type.includes('shin')) return degToRad(-16) * (side) * (1 - bob);
    if (type.includes('foot')) return degToRad(8) * (-side) * (1 - bob);
    return 0;
  }

  return 0;
}


// ------------------------------ Selection helpers ------------------------------

function polygonMaskCanvas(points, w, h, smoothFactor = 0.3) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const pts = simplifyPoints(points, smoothFactor);
  if (pts.length < 3) return c;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  return c;
}

function wandMaskCanvas(srcCanvas, sx, sy, tolerance) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const start = clampXY(Math.round(sx), Math.round(sy), W, H);
  const idx0 = (start.y * W + start.x) * 4;
  const target = { r: d[idx0], g: d[idx0 + 1], b: d[idx0 + 2], a: d[idx0 + 3] };
  const seen = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  const q = new Uint32Array(W * H);
  let qh = 0, qt = 0;
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (seen[i]) return;
    seen[i] = 1;
    const pi = i * 4;
    const col = { r: d[pi], g: d[pi + 1], b: d[pi + 2], a: d[pi + 3] };
    if (col.a < 20) return;
    if (colorDistance(col, target) <= tolerance) {
      out[i] = 255;
      q[qt++] = i;
    }
  };
  push(start.x, start.y);
  while (qh < qt) {
    const i = q[qh++];
    const x = i % W;
    const y = (i / W) | 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  const mask = document.createElement('canvas');
  mask.width = W;
  mask.height = H;
  const mctx = mask.getContext('2d');
  const outImg = mctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const a = out[i];
    outImg.data[i * 4 + 3] = a;
  }
  mctx.putImageData(outImg, 0, 0);
  return mask;
}

function combineMaskCanvases(base, add, op) {
  const W = Math.max(base.width, add.width);
  const H = Math.max(base.height, add.height);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d');
  octx.clearRect(0, 0, W, H);
  octx.drawImage(base, 0, 0);
  const bd = octx.getImageData(0, 0, W, H);
  const ad = add.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H);
  const b = bd.data;
  const a = ad.data;
  for (let i = 0; i < W * H; i++) {
    const bi = i * 4 + 3;
    const ai = i * 4 + 3;
    if (op === 'add') b[bi] = Math.max(b[bi], a[ai]);
    else if (op === 'subtract') b[bi] = Math.max(0, b[bi] - a[ai]);
  }
  octx.putImageData(bd, 0, 0);
  return out;
}

// ------------------------------ Geometry / transforms ------------------------------

function fitCanvasToImage(canvasW, canvasH, imgW, imgH) {
  if (!imgW || !imgH) return { scale: 1, ox: 0, oy: 0 };
  const scale = Math.min(canvasW / imgW, canvasH / imgH) * 0.92;
  const ox = (canvasW - imgW * scale) / 2;
  const oy = (canvasH - imgH * scale) / 2;
  return { scale, ox, oy };
}

function resizeCanvases() {
  for (const canvas of [els.editorCanvas, els.previewCanvas]) {
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(320, Math.floor(rect.width * dpr));
    const h = Math.max(320, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
}

function sourcePointFromEvent(e) {
  const rect = els.editorCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (els.editorCanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (els.editorCanvas.height / rect.height);
  const sx = (x - state.fit.ox) / state.fit.scale;
  const sy = (y - state.fit.oy) / state.fit.scale;
  if (sx < 0 || sy < 0 || sx > state.sourceW || sy > state.sourceH) return null;
  return { x: sx, y: sy };
}

function sourceBBox(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let x0 = canvas.width, y0 = canvas.height, x1 = -1, y1 = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (d[(y * canvas.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0) return { x: 0, y: 0, w: canvas.width, h: canvas.height };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function chooseRootPart() {
  const priority = ['pelvis', 'torso', 'chest', 'head'];
  for (const p of priority) {
    const found = state.parts.find(x => x.type === p);
    if (found) return found;
  }
  return state.parts.find(p => !p.parentId) || state.parts[0] || null;
}

function centerOfParts() {
  if (!state.parts.length) return null;
  const pts = state.parts.map(p => p.joint).filter(Boolean);
  if (!pts.length) return null;
  const x = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const y = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return { x, y };
}

function topoOrder() {
  const out = [];
  const seen = new Set();
  const byId = new Map(state.parts.map(p => [p.id, p]));
  function visit(part) {
    if (!part || seen.has(part.id)) return;
    seen.add(part.id);
    out.push(part);
    for (const child of state.parts.filter(p => p.parentId === part.id)) visit(child);
  }
  for (const part of state.parts) if (!part.parentId) visit(part);
  for (const part of state.parts) if (!seen.has(part.id)) visit(part);
  return out;
}

function depthOf(part) {
  let d = 0;
  let cur = part;
  const map = new Map(state.parts.map(p => [p.id, p]));
  while (cur?.parentId && map.has(cur.parentId) && d < 50) {
    d++;
    cur = map.get(cur.parentId);
  }
  return d;
}

// ------------------------------ Utility ------------------------------

function defaultJointForType(type) {
  if (!state.sourceW || !state.sourceH) return { x: 0, y: 0 };
  const bb = { x: state.sourceW * 0.15, y: state.sourceH * 0.10, w: state.sourceW * 0.70, h: state.sourceH * 0.80 };
  const cx = bb.x + bb.w * 0.5;
  const left = bb.x + bb.w * 0.28;
  const right = bb.x + bb.w * 0.72;
  const top = bb.y + bb.h * 0.14;
  const upper = bb.y + bb.h * 0.28;
  const mid = bb.y + bb.h * 0.44;
  const low = bb.y + bb.h * 0.62;
  const bottom = bb.y + bb.h * 0.82;
  const t = type.toLowerCase();
  if (t.includes('head')) return { x: cx, y: top };
  if (t.includes('hair')) return { x: cx, y: top - bb.h * 0.04 };
  if (t.includes('face')) return { x: cx, y: top + bb.h * 0.03 };
  if (t.includes('neck')) return { x: cx, y: upper };
  if (t.includes('chest')) return { x: cx, y: mid * 0.86 + upper * 0.14 };
  if (t.includes('torso')) return { x: cx, y: mid };
  if (t.includes('pelvis')) return { x: cx, y: low };
  if (t.includes('upper arm l')) return { x: left, y: upper };
  if (t.includes('lower arm l')) return { x: left - bb.w * 0.11, y: mid };
  if (t.includes('hand l')) return { x: left - bb.w * 0.18, y: mid + bb.h * 0.05 };
  if (t.includes('upper arm r')) return { x: right, y: upper };
  if (t.includes('lower arm r')) return { x: right + bb.w * 0.11, y: mid };
  if (t.includes('hand r')) return { x: right + bb.w * 0.18, y: mid + bb.h * 0.05 };
  if (t.includes('thigh l')) return { x: left, y: low };
  if (t.includes('shin l')) return { x: left - bb.w * 0.02, y: bottom * 0.9 };
  if (t.includes('foot l')) return { x: left - bb.w * 0.05, y: bottom };
  if (t.includes('thigh r')) return { x: right, y: low };
  if (t.includes('shin r')) return { x: right + bb.w * 0.02, y: bottom * 0.9 };
  if (t.includes('foot r')) return { x: right + bb.w * 0.05, y: bottom };
  if (t.includes('shoulder pad l')) return { x: left, y: upper };
  if (t.includes('shoulder pad r')) return { x: right, y: upper };
  if (t.includes('cape')) return { x: cx, y: upper };
  if (t.includes('skirt')) return { x: cx, y: low + bb.h * 0.04 };
  if (t.includes('weapon')) return { x: right + bb.w * 0.15, y: mid };
  if (t.includes('shield')) return { x: left - bb.w * 0.15, y: mid };
  return { x: cx, y: mid };
}

function colorForType(type) {
  const idx = Math.abs(hashCode(type)) % PALETTE.length;
  return PALETTE[idx];
}

function humanizeType(type) {
  return type.replace(/\b\w/g, c => c.toUpperCase());
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function colorDistance(a, b) {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
  return h;
}

function sideSign(type, name) {
  const s = `${type} ${name}`.toLowerCase();
  if (s.includes('left') || /\bl\b/.test(s) || s.endsWith(' l')) return -1;
  if (s.includes('right') || /\br\b/.test(s) || s.endsWith(' r')) return 1;
  return 0;
}

function rotateVec(x, y, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return { x: x * c - y * s, y: x * s + y * c };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function clampPoint(p) { return { x: clamp(p.x, 0, state.sourceW - 1), y: clamp(p.y, 0, state.sourceH - 1) }; }
function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.hypot(dx, dy); }
function degToRad(d) { return d * Math.PI / 180; }
function easeOut(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }
function easeIn(t) { return Math.pow(clamp(t, 0, 1), 3); }
function escapeHtml(str) { return String(str).replace(/[&<>'"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[s])); }
function simplifyPoints(points, smoothFactor) {
  if (points.length <= 3) return points;
  const keep = [];
  const threshold = 2 + (1 - clamp(smoothFactor, 0, 1)) * 10;
  for (const p of points) {
    const last = keep[keep.length - 1];
    if (!last || dist(last, p) >= threshold) keep.push(p);
  }
  if (keep.length < 3) return points;
  return keep;
}
async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  try {
    return await dataUrlToImage(url);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
function dataUrlToImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function downloadBlobCanvas(canvas, filename) {
  canvas.toBlob(blob => blob && downloadBlob(blob, filename), 'image/png');
}
function clampXY(x, y, W, H) { return { x: clamp(x, 0, W - 1), y: clamp(y, 0, H - 1) } }


// initial UI sync
els.wandToleranceVal.textContent = String(state.wandTolerance);
els.selectionSmoothVal.textContent = state.selectionSmooth.toFixed(2);
els.speedVal.textContent = `${state.speed.toFixed(2)}×`;
els.tiltVal.textContent = `${state.tiltDeg}°`;
els.poseSelect.value = state.pose;

// animation loop
function tick(now) {
  if (!state.cleanCanvas) {
    els.previewPlaceholder.classList.remove('hidden');
  } else {
    drawPreview(previewCtx, now, false);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
