(() => {
  const $ = (id) => document.getElementById(id);
  const sourceCanvas = $('sourceCanvas');
  const previewCanvas = $('previewCanvas');
  const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const pCtx = previewCanvas.getContext('2d');

  const sourceBadge = $('sourceBadge');
  const previewBadge = $('previewBadge');

  const ui = {
    fileInput: $('fileInput'),
    demoBtn: $('demoBtn'),
    fitBtn: $('fitBtn'),
    presetBtn: $('presetBtn'),
    clearPartsBtn: $('clearPartsBtn'),
    playBtn: $('playBtn'),
    recordBtn: $('recordBtn'),
    facingSelect: $('facingSelect'),
    partPresetSelect: $('partPresetSelect'),
    addPartBtn: $('addPartBtn'),
    assignMaskBtn: $('assignMaskBtn'),
    commitSelectionBtn: $('commitSelectionBtn'),
    invertSelectionBtn: $('invertSelectionBtn'),
    clearSelectionBtn: $('clearSelectionBtn'),
    selectionModeSelect: $('selectionModeSelect'),
    wandRange: $('wandRange'),
    featherRange: $('featherRange'),
    zoomRange: $('zoomRange'),
    speedRange: $('speedRange'),
    strideRange: $('strideRange'),
    bounceRange: $('bounceRange'),
    leanRange: $('leanRange'),
    travelRange: $('travelRange'),
    armRange: $('armRange'),
    resetRigBtn: $('resetRigBtn'),
    exportStillBtn: $('exportStillBtn'),
    partsList: $('partsList'),
  };

  const TAU = Math.PI * 2;
  const JOINTS = [
    'pelvis', 'chest', 'neck', 'head',
    'lShoulder', 'lElbow', 'lHand',
    'rShoulder', 'rElbow', 'rHand',
    'lHip', 'lKnee', 'lFoot',
    'rHip', 'rKnee', 'rFoot',
  ];

  const PART_PRESETS = {
    torso: { label: 'Torso', prox: 'pelvis', dist: 'chest', depth: 40 },
    pelvis: { label: 'Pelvis', prox: 'pelvis', dist: 'chest', depth: 42 },
    head: { label: 'Head', prox: 'neck', dist: 'head', depth: 90 },
    neck: { label: 'Neck', prox: 'chest', dist: 'neck', depth: 85 },
    lUpperArm: { label: 'Left Upper Arm', prox: 'lShoulder', dist: 'lElbow', depth: 66 },
    lForearm: { label: 'Left Forearm', prox: 'lElbow', dist: 'lHand', depth: 68 },
    rUpperArm: { label: 'Right Upper Arm', prox: 'rShoulder', dist: 'rElbow', depth: 64 },
    rForearm: { label: 'Right Forearm', prox: 'rElbow', dist: 'rHand', depth: 66 },
    lThigh: { label: 'Left Thigh', prox: 'lHip', dist: 'lKnee', depth: 22 },
    lShin: { label: 'Left Shin', prox: 'lKnee', dist: 'lFoot', depth: 24 },
    rThigh: { label: 'Right Thigh', prox: 'rHip', dist: 'rKnee', depth: 20 },
    rShin: { label: 'Right Shin', prox: 'rKnee', dist: 'rFoot', depth: 22 },
    hair: { label: 'Hair', prox: 'head', dist: 'neck', depth: 95 },
    cape: { label: 'Cape', prox: 'chest', dist: 'pelvis', depth: 10 },
    weapon: { label: 'Weapon', prox: 'rHand', dist: 'rHand', depth: 100 },
    shield: { label: 'Shield', prox: 'lHand', dist: 'lHand', depth: 100 },
    custom: { label: 'Custom Part', prox: 'chest', dist: 'chest', depth: 50 },
  };

  const state = {
    image: null,
    imgW: 0,
    imgH: 0,
    facing: 'right',
    playing: true,
    time: 0,
    lastTs: 0,
    sourceZoom: 1,
    sourcePanX: 0,
    sourcePanY: 0,
    sourceFit: 1,
    tool: 'pan',
    selectionMode: 'replace',
    wandTol: 26,
    feather: 3,
    selectionMask: null,
    selectionPath: [],
    drawingLasso: false,
    panning: false,
    panStart: null,
    lassoActive: false,
    dragJoint: null,
    joints: {},
    parts: [],
    selectedPartId: null,
    selectedJoint: null,
    placePivotPartId: null,
    needsSourceRedraw: true,
    needsPreviewRedraw: true,
    recorder: null,
    recorderChunks: [],
    recording: false,
    demoLoaded: false,
    baseImageBounds: null,
    sourceLayout: null,
  };

  const sourceBaseCanvas = document.createElement('canvas');
  const sourceBaseCtx = sourceBaseCanvas.getContext('2d', { willReadFrequently: true });
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d');
  const overlayCanvas = document.createElement('canvas');
  const overlayCtx = overlayCanvas.getContext('2d');

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5) ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const hypot = Math.hypot;
  const normAngle = (a) => {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  };

  function point(x, y) { return { x, y }; }
  function clonePoint(p) { return { x: p.x, y: p.y }; }

  function makeCanvasSize(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height, dpr };
  }

  function imageBoundsFallback() {
    if (!state.imgW || !state.imgH) return { x: 0, y: 0, w: 1, h: 1 };
    return { x: 0, y: 0, w: state.imgW, h: state.imgH };
  }

  function defaultJoints(bounds, facing = state.facing) {
    const dir = facing === 'right' ? 1 : -1;
    const cx = bounds.x + bounds.w * 0.52;
    const top = bounds.y + bounds.h * 0.04;
    const shoulderY = top + bounds.h * 0.24;
    const neckY = top + bounds.h * 0.17;
    const headY = top + bounds.h * 0.07;
    const pelvisY = top + bounds.h * 0.52;
    const kneeY = top + bounds.h * 0.80;
    const footY = top + bounds.h * 0.98;
    const shoulderSpan = bounds.w * 0.13;
    const hipSpan = bounds.w * 0.11;
    const armBend = bounds.w * 0.07;
    const legBend = bounds.w * 0.05;
    return {
      pelvis: point(cx, pelvisY),
      chest: point(cx + dir * bounds.w * 0.02, shoulderY),
      neck: point(cx + dir * bounds.w * 0.025, neckY),
      head: point(cx + dir * bounds.w * 0.03, headY),
      lShoulder: point(cx - shoulderSpan * 0.5 - dir * armBend * 0.25, shoulderY),
      lElbow: point(cx - shoulderSpan * 0.7 - dir * armBend * 0.8, top + bounds.h * 0.42),
      lHand: point(cx - shoulderSpan * 0.9 - dir * armBend * 1.2, top + bounds.h * 0.56),
      rShoulder: point(cx + shoulderSpan * 0.5 + dir * armBend * 0.25, shoulderY),
      rElbow: point(cx + shoulderSpan * 0.7 + dir * armBend * 0.8, top + bounds.h * 0.42),
      rHand: point(cx + shoulderSpan * 0.9 + dir * armBend * 1.2, top + bounds.h * 0.56),
      lHip: point(cx - hipSpan * 0.48 - dir * legBend * 0.10, pelvisY),
      lKnee: point(cx - hipSpan * 0.56 + dir * legBend * 0.24, kneeY),
      lFoot: point(cx - hipSpan * 0.50 + dir * legBend * 0.28, footY),
      rHip: point(cx + hipSpan * 0.48 + dir * legBend * 0.10, pelvisY),
      rKnee: point(cx + hipSpan * 0.56 + dir * legBend * 0.24, kneeY),
      rFoot: point(cx + hipSpan * 0.50 + dir * legBend * 0.28, footY),
    };
  }

  function buildStarterRig() {
    state.parts = [
      makePart('torso'), makePart('pelvis'), makePart('head'), makePart('neck'),
      makePart('lUpperArm'), makePart('lForearm'), makePart('rUpperArm'), makePart('rForearm'),
      makePart('lThigh'), makePart('lShin'), makePart('rThigh'), makePart('rShin'),
    ];
    state.selectedPartId = state.parts[0]?.id || null;
    bakeDefaultJoints();
    rebuildAllPartArt();
    renderPartsList();
    setBadge('Starter rig created. Select a part and use Lasso or Wand to assign its mask.');
  }

  function makePart(kind = 'custom') {
    const preset = PART_PRESETS[kind] || PART_PRESETS.custom;
    const id = `part_${Math.random().toString(36).slice(2, 9)}`;
    return {
      id,
      kind,
      name: preset.label,
      proxJoint: preset.prox,
      distJoint: preset.dist,
      depth: preset.depth,
      visible: true,
      pivotSource: null,
      pivotMode: 'prox',
      maskCanvas: null,
      artCanvas: null,
      artRect: null,
      sourceLength: null,
    };
  }

  function setBadge(text) { sourceBadge.textContent = text; }
  function setPreviewBadge(text) { previewBadge.textContent = text; }

  function fitSource() {
    if (!state.imgW || !state.imgH) return;
    const rect = sourceCanvas.getBoundingClientRect();
    state.sourceFit = Math.min(rect.width / state.imgW, rect.height / state.imgH) * 0.94;
    state.sourceZoom = 1;
    state.sourcePanX = 0;
    state.sourcePanY = 0;
    ui.zoomRange.value = '1';
    state.needsSourceRedraw = true;
  }

  function sourceLayout() {
    const rect = sourceCanvas.getBoundingClientRect();
    const scale = state.sourceFit * state.sourceZoom;
    const w = state.imgW * scale;
    const h = state.imgH * scale;
    const x = rect.width / 2 - w / 2 + state.sourcePanX;
    const y = rect.height / 2 - h / 2 + state.sourcePanY;
    return { rect, scale, x, y, w, h };
  }

  function screenToImage(pt) {
    const lay = state.sourceLayout || sourceLayout();
    return { x: (pt.x - lay.x) / lay.scale, y: (pt.y - lay.y) / lay.scale };
  }

  function imageToScreen(pt) {
    const lay = state.sourceLayout || sourceLayout();
    return { x: lay.x + pt.x * lay.scale, y: lay.y + pt.y * lay.scale };
  }

  function updateJointUIFromState() {
    if (!state.selectedJoint) return;
  }

  function bakeDefaultJoints() {
    const bounds = imageBoundsFallback();
    state.joints = defaultJoints(bounds);
    state.needsSourceRedraw = true;
  }

  function createDemoImage() {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 1200;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#f6f0dd');
    g.addColorStop(1, '#d4c5a8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#3d2c55';
    ctx.beginPath();
    ctx.ellipse(450, 265, 95, 112, -0.08, 0, TAU);
    ctx.fill();
    ctx.fillRect(338, 350, 200, 315);
    ctx.beginPath();
    ctx.moveTo(338, 375);
    ctx.lineTo(250, 515);
    ctx.lineTo(286, 540);
    ctx.lineTo(370, 430);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(538, 375);
    ctx.lineTo(640, 510);
    ctx.lineTo(600, 530);
    ctx.lineTo(500, 430);
    ctx.fill();
    ctx.fillRect(364, 655, 74, 325);
    ctx.fillRect(462, 655, 74, 325);
    ctx.beginPath();
    ctx.moveTo(364, 955);
    ctx.lineTo(330, 1160);
    ctx.lineTo(420, 1160);
    ctx.lineTo(438, 955);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(462, 955);
    ctx.lineTo(438, 1160);
    ctx.lineTo(530, 1160);
    ctx.lineTo(536, 955);
    ctx.fill();
    ctx.fillStyle = '#201828';
    ctx.beginPath();
    ctx.arc(405, 225, 16, 0, TAU); ctx.arc(496, 225, 16, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1d1823';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(448, 290); ctx.lineTo(444, 326); ctx.stroke();
    ctx.strokeStyle = '#8c6c63';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(450, 260, 126, Math.PI * 1.07, Math.PI * 1.94); ctx.stroke();
    ctx.fillStyle = '#6b4e8c';
    ctx.beginPath();
    ctx.arc(440, 245, 170, Math.PI * 1.1, Math.PI * 1.9); ctx.fill();
    return c.toDataURL('image/png');
  }

  function loadImageFromSrc(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function loadImageFile(file) {
    const url = URL.createObjectURL(file);
    const img = await loadImageFromSrc(url);
    URL.revokeObjectURL(url);
    setImage(img);
  }

  function setImage(img) {
    state.image = img;
    state.imgW = img.naturalWidth || img.width;
    state.imgH = img.naturalHeight || img.height;
    sourceBaseCanvas.width = state.imgW;
    sourceBaseCanvas.height = state.imgH;
    sourceBaseCtx.clearRect(0, 0, state.imgW, state.imgH);
    sourceBaseCtx.drawImage(img, 0, 0);
    state.baseImageBounds = { x: 0, y: 0, w: state.imgW, h: state.imgH };
    bakeDefaultJoints();
    fitSource();
    state.selectionMask = null;
    state.selectionPath = [];
    if (!state.parts.length) buildStarterRig();
    rebuildAllPartArt();
    state.needsSourceRedraw = true;
    state.needsPreviewRedraw = true;
    setBadge(`Loaded ${state.imgW} × ${state.imgH} image`);
    setPreviewBadge('Use the rig controls to animate');
  }

  function rebuildAllPartArt() {
    for (const part of state.parts) rebuildPartArt(part);
    renderPartsList();
    state.needsPreviewRedraw = true;
  }

  function maskToBounds(mask) {
    if (!mask) return null;
    const w = mask.width, h = mask.height;
    const data = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      let row = y * w * 4;
      for (let x = 0; x < w; x++) {
        const a = data[row + x * 4 + 3];
        if (a > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function computeSourceLength(part, rect) {
    if (!rect) return 1;
    const kind = part.kind || '';
    if (/(Arm|Leg|Thigh|Shin|Forearm)/i.test(kind)) return Math.max(1, rect.h * 0.98);
    if (/(Torso|Pelvis|Cape|Hair)/i.test(kind)) return Math.max(1, rect.h * 0.85);
    if (/Head|Neck/i.test(kind)) return Math.max(1, rect.h * 0.8);
    return Math.max(1, Math.hypot(rect.w, rect.h) * 0.9);
  }

  function rebuildPartArt(part) {
    if (!state.image || !part.maskCanvas) {
      part.artCanvas = null;
      part.artRect = null;
      part.sourceLength = null;
      return;
    }
    const bounds = maskToBounds(part.maskCanvas);
    if (!bounds) {
      part.artCanvas = null;
      part.artRect = null;
      part.sourceLength = null;
      return;
    }
    const pad = 2;
    const x = clamp(bounds.x - pad, 0, state.imgW);
    const y = clamp(bounds.y - pad, 0, state.imgH);
    const w = clamp(bounds.w + pad * 2, 1, state.imgW - x);
    const h = clamp(bounds.h + pad * 2, 1, state.imgH - y);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(sourceBaseCanvas, x, y, w, h, 0, 0, c.width, c.height);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(part.maskCanvas, x, y, w, h, 0, 0, c.width, c.height);
    ctx.restore();
    part.artCanvas = c;
    part.artRect = { x, y, w, h };
    part.sourceLength = computeSourceLength(part, part.artRect);
    if (part.pivotMode !== 'custom') {
      const anchor = state.joints[part.proxJoint] || { x: x + w / 2, y: y + h / 2 };
      part.pivotSource = clonePoint(anchor);
    } else if (!part.pivotSource) {
      const anchor = state.joints[part.proxJoint] || { x: x + w / 2, y: y + h / 2 };
      part.pivotSource = clonePoint(anchor);
    }
    state.needsPreviewRedraw = true;
    state.needsSourceRedraw = true;
  }

  function selectionCanvasFromLasso(points) {
    if (!state.image || points.length < 3) return null;
    const c = document.createElement('canvas');
    c.width = state.imgW;
    c.height = state.imgH;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fill();
    if (state.feather > 0) {
      const blurred = document.createElement('canvas');
      blurred.width = c.width;
      blurred.height = c.height;
      const bctx = blurred.getContext('2d');
      bctx.filter = `blur(${state.feather}px)`;
      bctx.drawImage(c, 0, 0);
      return blurred;
    }
    return c;
  }

  function selectionCanvasFromMask(mask) {
    if (!mask) return null;
    const out = document.createElement('canvas');
    out.width = mask.width;
    out.height = mask.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(mask, 0, 0);
    return out;
  }

  function floodFillMask(seedX, seedY, tolerance = 26) {
    if (!state.image) return null;
    const w = state.imgW, h = state.imgH;
    const img = sourceBaseCtx.getImageData(0, 0, w, h);
    const data = img.data;
    const mask = document.createElement('canvas');
    mask.width = w; mask.height = h;
    const mctx = mask.getContext('2d');
    const out = mctx.createImageData(w, h);
    const outData = out.data;
    const idx = ((Math.floor(seedY) * w) + Math.floor(seedX)) * 4;
    if (idx < 0 || idx >= data.length) return null;
    const sr = data[idx], sg = data[idx + 1], sb = data[idx + 2], sa = data[idx + 3];
    const tol = tolerance * tolerance * 3;
    const visited = new Uint8Array(w * h);
    const qx = new Int32Array(w * h);
    const qy = new Int32Array(w * h);
    let qh = 0, qt = 0;
    const seedI = (Math.floor(seedY) * w + Math.floor(seedX));
    qx[qt] = Math.floor(seedX); qy[qt] = Math.floor(seedY); qt++;
    visited[seedI] = 1;
    while (qh < qt) {
      const x = qx[qh], y = qy[qh]; qh++;
      const i = y * w + x;
      const di = i * 4;
      const dr = data[di] - sr;
      const dg = data[di + 1] - sg;
      const db = data[di + 2] - sb;
      const da = data[di + 3] - sa;
      const dist = dr * dr + dg * dg + db * db + da * da * 0.5;
      if (dist > tol) continue;
      outData[di + 3] = 255;
      if (x > 0) {
        const ni = i - 1;
        if (!visited[ni]) { visited[ni] = 1; qx[qt] = x - 1; qy[qt] = y; qt++; }
      }
      if (x < w - 1) {
        const ni = i + 1;
        if (!visited[ni]) { visited[ni] = 1; qx[qt] = x + 1; qy[qt] = y; qt++; }
      }
      if (y > 0) {
        const ni = i - w;
        if (!visited[ni]) { visited[ni] = 1; qx[qt] = x; qy[qt] = y - 1; qt++; }
      }
      if (y < h - 1) {
        const ni = i + w;
        if (!visited[ni]) { visited[ni] = 1; qx[qt] = x; qy[qt] = y + 1; qt++; }
      }
    }
    mctx.putImageData(out, 0, 0);
    if (state.feather > 0) {
      const blurred = document.createElement('canvas');
      blurred.width = w; blurred.height = h;
      const bctx = blurred.getContext('2d');
      bctx.filter = `blur(${state.feather}px)`;
      bctx.drawImage(mask, 0, 0);
      return blurred;
    }
    return mask;
  }

  function combineMasks(target, source, mode = 'replace') {
    if (!source) return target;
    if (!target) return mode === 'subtract' ? null : selectionCanvasFromMask(source);
    if (mode === 'replace') return selectionCanvasFromMask(source);
    const out = document.createElement('canvas');
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(target, 0, 0);
    ctx.globalCompositeOperation = mode === 'subtract' ? 'destination-out' : 'source-over';
    ctx.drawImage(source, 0, 0);
    return out;
  }

  function applySelectionToPart(part, mode = 'replace') {
    if (!state.selectionMask) return;
    part.maskCanvas = combineMasks(part.maskCanvas, state.selectionMask, mode);
    rebuildPartArt(part);
  }

  function invertMask(mask) {
    if (!mask) return null;
    const c = document.createElement('canvas');
    c.width = mask.width;
    c.height = mask.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(mask, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i + 3] = 255 - img.data[i + 3];
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function clearSelection() {
    state.selectionMask = null;
    state.selectionPath = [];
    state.drawingLasso = false;
    state.needsSourceRedraw = true;
  }

  function updateSelectionMaskFromPath() {
    if (state.selectionPath.length < 3) {
      state.selectionPath = [];
      state.drawingLasso = false;
      state.needsSourceRedraw = true;
      return;
    }
    state.selectionMask = selectionCanvasFromLasso(state.selectionPath);
    state.selectionPath = [];
    state.drawingLasso = false;
    state.needsSourceRedraw = true;
  }

  function selectedPart() { return state.parts.find(p => p.id === state.selectedPartId) || null; }
  function partById(id) { return state.parts.find(p => p.id === id) || null; }

  function renderPartsList() {
    const current = state.selectedPartId;
    ui.partsList.innerHTML = '';
    if (!state.parts.length) {
      ui.partsList.innerHTML = '<div class="help-text">No parts yet. Use <b>Add Standard Rig</b> or create a custom part.</div>';
      return;
    }
    for (const part of state.parts) {
      const row = document.createElement('div');
      row.className = 'part-row' + (part.id === current ? ' active' : '');
      row.dataset.id = part.id;
      row.innerHTML = `
        <input class="part-name" value="${escapeHtml(part.name)}" title="Part name" />
        <select class="part-kind"></select>
        <select class="prox-joint"></select>
        <select class="dist-joint"></select>
        <label class="toggle"><input type="checkbox" class="vis-toggle" ${part.visible ? 'checked' : ''}/>show</label>
        <button class="btn tiny bind-pivot">Pivot</button>
        <button class="btn tiny ghost delete-part">Del</button>
      `;
      const kindSel = row.querySelector('.part-kind');
      for (const k of Object.keys(PART_PRESETS)) {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = PART_PRESETS[k].label;
        if (k === part.kind) opt.selected = true;
        kindSel.appendChild(opt);
      }
      const proxSel = row.querySelector('.prox-joint');
      const distSel = row.querySelector('.dist-joint');
      for (const j of JOINTS) {
        const o1 = document.createElement('option'); o1.value = j; o1.textContent = j; if (j === part.proxJoint) o1.selected = true; proxSel.appendChild(o1);
        const o2 = document.createElement('option'); o2.value = j; o2.textContent = j; if (j === part.distJoint) o2.selected = true; distSel.appendChild(o2);
      }
      row.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
        state.selectedPartId = part.id;
        state.placePivotPartId = null;
        renderPartsList();
        state.needsSourceRedraw = true;
      });
      row.querySelector('.part-name').addEventListener('input', (e) => { part.name = e.target.value; });
      row.querySelector('.part-kind').addEventListener('change', (e) => {
        part.kind = e.target.value;
        const preset = PART_PRESETS[part.kind] || PART_PRESETS.custom;
        part.proxJoint = preset.prox;
        part.distJoint = preset.dist;
        part.depth = preset.depth;
        renderPartsList();
        rebuildPartArt(part);
      });
      row.querySelector('.prox-joint').addEventListener('change', (e) => { part.proxJoint = e.target.value; rebuildPartArt(part); });
      row.querySelector('.dist-joint').addEventListener('change', (e) => { part.distJoint = e.target.value; rebuildPartArt(part); });
      row.querySelector('.vis-toggle').addEventListener('change', (e) => { part.visible = e.target.checked; state.needsPreviewRedraw = true; });
      row.querySelector('.bind-pivot').addEventListener('click', () => {
        state.placePivotPartId = part.id;
        setBadge(`Click on the source image to place the pivot for “${part.name}”.`);
      });
      row.querySelector('.delete-part').addEventListener('click', () => {
        state.parts = state.parts.filter(p => p.id !== part.id);
        if (state.selectedPartId === part.id) state.selectedPartId = state.parts[0]?.id || null;
        renderPartsList();
        state.needsPreviewRedraw = true;
      });
      ui.partsList.appendChild(row);
    }
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function addPart(kind) {
    const part = makePart(kind);
    state.parts.push(part);
    state.selectedPartId = part.id;
    renderPartsList();
    rebuildPartArt(part);
    state.needsPreviewRedraw = true;
  }

  function clearParts() {
    state.parts = [];
    state.selectedPartId = null;
    renderPartsList();
    state.needsPreviewRedraw = true;
    setBadge('Parts cleared. Add a standard rig or create custom parts.');
  }

  function getCanvasPoint(evt, canvas) {
    const r = canvas.getBoundingClientRect();
    return { x: evt.clientX - r.left, y: evt.clientY - r.top };
  }

  function sourceHitJoint(pos) {
    const lay = state.sourceLayout || sourceLayout();
    const imagePt = screenToImage(pos);
    let best = null;
    let bestD = 18 / lay.scale;
    for (const [k, p] of Object.entries(state.joints)) {
      const d = hypot(imagePt.x - p.x, imagePt.y - p.y);
      if (d < bestD) { best = k; bestD = d; }
    }
    return best;
  }

  function setJoint(name, imgPt) {
    state.joints[name] = clonePoint(imgPt);
    state.needsSourceRedraw = true;
    state.needsPreviewRedraw = true;
    for (const part of state.parts) if (part.pivotMode === 'prox' && part.proxJoint === name && !part.pivotSource) part.pivotSource = clonePoint(imgPt);
    for (const part of state.parts) if (part.pivotSource && part.pivotSourceJoint === name) part.pivotSource = clonePoint(imgPt);
  }

  function drawChecker(ctx, w, h) {
    const size = 24;
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  function drawSource() {
    const rect = makeCanvasSize(sourceCanvas, sCtx);
    if (!state.image) {
      sCtx.clearRect(0, 0, rect.w, rect.h);
      drawChecker(sCtx, rect.w, rect.h);
      sCtx.fillStyle = 'rgba(255,255,255,.10)';
      sCtx.textAlign = 'center';
      sCtx.font = '600 18px Inter, sans-serif';
      sCtx.fillText('Import a character image to begin', rect.w / 2, rect.h / 2 - 10);
      sCtx.font = '13px Inter, sans-serif';
      sCtx.fillText('Use Lasso or Wand to build part masks, then animate with the rig.', rect.w / 2, rect.h / 2 + 14);
      return;
    }
    const lay = sourceLayout();
    state.sourceLayout = lay;
    sCtx.clearRect(0, 0, rect.w, rect.h);
    drawChecker(sCtx, rect.w, rect.h);
    sCtx.drawImage(sourceBaseCanvas, lay.x, lay.y, lay.w, lay.h);

    if (state.selectionMask) {
      sCtx.save();
      sCtx.globalCompositeOperation = 'source-over';
      sCtx.fillStyle = 'rgba(109,201,255,0.32)';
      sCtx.fillRect(lay.x, lay.y, lay.w, lay.h);
      sCtx.globalCompositeOperation = 'destination-in';
      sCtx.drawImage(state.selectionMask, lay.x, lay.y, lay.w, lay.h);
      sCtx.restore();
      sCtx.save();
      sCtx.strokeStyle = 'rgba(109,201,255,0.98)';
      sCtx.lineWidth = 2;
      sCtx.setLineDash([8, 6]);
      const b = maskBounds(state.selectionMask);
      if (b) sCtx.strokeRect(lay.x + b.x * lay.scale, lay.y + b.y * lay.scale, b.w * lay.scale, b.h * lay.scale);
      sCtx.restore();
    }

    if (state.drawingLasso && state.selectionPath.length > 1) {
      sCtx.save();
      sCtx.strokeStyle = 'rgba(255,201,107,0.98)';
      sCtx.lineWidth = 2.5;
      sCtx.beginPath();
      const p0 = imageToScreen(state.selectionPath[0]);
      sCtx.moveTo(p0.x, p0.y);
      for (let i = 1; i < state.selectionPath.length; i++) {
        const p = imageToScreen(state.selectionPath[i]);
        sCtx.lineTo(p.x, p.y);
      }
      sCtx.stroke();
      sCtx.restore();
    }

    if (state.parts.length) {
      for (const part of state.parts) {
        if (!part.visible || !part.artRect) continue;
        const c = part.id === state.selectedPartId ? 'rgba(139,255,204,.95)' : 'rgba(255,255,255,.20)';
        sCtx.save();
        sCtx.strokeStyle = c;
        sCtx.lineWidth = part.id === state.selectedPartId ? 2.2 : 1.2;
        sCtx.setLineDash([5, 4]);
        const x = lay.x + part.artRect.x * lay.scale;
        const y = lay.y + part.artRect.y * lay.scale;
        const w = part.artRect.w * lay.scale;
        const h = part.artRect.h * lay.scale;
        sCtx.strokeRect(x, y, w, h);
        sCtx.restore();
      }
    }

    sCtx.save();
    sCtx.fillStyle = 'rgba(109,201,255,.95)';
    sCtx.strokeStyle = 'rgba(7,10,14,.95)';
    sCtx.lineWidth = 2;
    for (const [name, p] of Object.entries(state.joints)) {
      const s = imageToScreen(p);
      sCtx.beginPath(); sCtx.arc(s.x, s.y, 6.5, 0, TAU); sCtx.fill(); sCtx.stroke();
      sCtx.fillStyle = 'rgba(236,244,252,.8)';
      sCtx.font = '11px Inter, sans-serif';
      sCtx.fillText(name, s.x + 9, s.y - 8);
      sCtx.fillStyle = 'rgba(109,201,255,.95)';
    }
    for (const part of state.parts) {
      if (!part.pivotSource) continue;
      const s = imageToScreen(part.pivotSource);
      sCtx.fillStyle = part.id === state.selectedPartId ? 'rgba(255,201,107,.95)' : 'rgba(139,255,204,.85)';
      sCtx.beginPath(); sCtx.arc(s.x, s.y, 4, 0, TAU); sCtx.fill();
    }
    sCtx.restore();

    if (state.placePivotPartId) {
      const part = partById(state.placePivotPartId);
      if (part?.pivotSource) {
        const s = imageToScreen(part.pivotSource);
        sCtx.save();
        sCtx.strokeStyle = 'rgba(255,201,107,.95)';
        sCtx.lineWidth = 2;
        sCtx.beginPath(); sCtx.moveTo(s.x - 10, s.y); sCtx.lineTo(s.x + 10, s.y); sCtx.moveTo(s.x, s.y - 10); sCtx.lineTo(s.x, s.y + 10); sCtx.stroke();
        sCtx.restore();
      }
    }

    sCtx.save();
    sCtx.fillStyle = 'rgba(255,255,255,.06)';
    sCtx.fillRect(10, rect.h - 30, 246, 20);
    sCtx.fillStyle = 'rgba(230,240,250,.85)';
    sCtx.font = '12px Inter, sans-serif';
    sCtx.fillText(`Tool: ${state.tool}  |  Zoom: ${state.sourceZoom.toFixed(2)}x  |  Selection: ${state.selectionMode}`, 18, rect.h - 15);
    sCtx.restore();
  }

  function maskBounds(maskCanvasEl) {
    if (!maskCanvasEl) return null;
    const ctx = maskCanvasEl.getContext('2d', { willReadFrequently: true });
    const { width, height } = maskCanvasEl;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3];
        if (a > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function solve2Bone(root, target, len1, len2, bendSign) {
    const dx = target.x - root.x;
    const dy = target.y - root.y;
    const dist = Math.max(0.0001, Math.min(Math.hypot(dx, dy), len1 + len2 - 0.001));
    const baseAngle = Math.atan2(dy, dx);
    const cosA = clamp((len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist), -1, 1);
    const angOffset = Math.acos(cosA);
    const ang = baseAngle + bendSign * angOffset;
    const mid = { x: root.x + Math.cos(ang) * len1, y: root.y + Math.sin(ang) * len1 };
    return { mid, end: { x: target.x, y: target.y }, angle1: Math.atan2(mid.y - root.y, mid.x - root.x), angle2: Math.atan2(target.y - mid.y, target.x - mid.x) };
  }

  function poseAt(t) {
    const rect = previewCanvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const dir = state.facing === 'right' ? 1 : -1;
    const cycle = (t * state.speed * 0.9) % 1;
    const phase = cycle * TAU;
    const bob = Math.sin(phase * 2) * (h * 0.025 * state.bounce);
    const sway = Math.sin(phase) * (w * 0.015 * state.travel);
    const centerX = w * 0.5 + sway;
    const groundY = h * 0.82;
    const baseY = groundY - (state.imgH || 900) * 0.30 + bob;
    const torsoLen = (state.imgH || 900) * 0.16;
    const neckLen = torsoLen * 0.35;
    const headLen = torsoLen * 0.7;
    const upperArmLen = (state.imgH || 900) * 0.14;
    const lowerArmLen = (state.imgH || 900) * 0.13;
    const thighLen = (state.imgH || 900) * 0.17;
    const shinLen = (state.imgH || 900) * 0.18;
    const hipGap = (state.imgW || 700) * 0.055;
    const shoulderGap = (state.imgW || 700) * 0.075;
    const stride = (state.imgW || 700) * 0.12 * state.stride;
    const lift = (state.imgH || 900) * 0.055 * state.bounce;
    const armSwing = (state.imgW || 700) * 0.09 * state.armSwing;
    const lean = dir * (0.12 + state.lean * 0.28) * Math.sin(phase) + dir * state.lean * 0.06;

    const pelvis = { x: centerX, y: baseY };
    const chest = { x: centerX + dir * torsoLen * lean * 0.45, y: baseY - torsoLen * 0.88 };
    const neck = { x: chest.x + dir * torsoLen * lean * 0.25, y: chest.y - neckLen };
    const head = { x: neck.x + dir * torsoLen * lean * 0.20, y: neck.y - headLen * 0.65 };

    const lHip = { x: pelvis.x - hipGap, y: pelvis.y };
    const rHip = { x: pelvis.x + hipGap, y: pelvis.y };
    const lShoulder = { x: chest.x - shoulderGap, y: chest.y };
    const rShoulder = { x: chest.x + shoulderGap, y: chest.y };

    const leftFront = dir * stride * 0.52;
    const leftBack = -dir * stride * 0.28;
    const rightFront = dir * stride * 0.52;
    const rightBack = -dir * stride * 0.28;

    const leftSwing = cycle < 0.5 ? false : true;
    const rightSwing = cycle < 0.5 ? true : false;
    const swingT = easeInOut(leftSwing ? (cycle - 0.5) / 0.5 : cycle / 0.5);
    const swingT2 = easeInOut(rightSwing ? cycle / 0.5 : (cycle - 0.5) / 0.5);

    const leftFoot = leftSwing
      ? { x: pelvis.x + lerp(leftFront, leftBack, swingT), y: groundY - Math.sin(swingT * Math.PI) * lift }
      : { x: pelvis.x + leftFront, y: groundY };
    const rightFoot = rightSwing
      ? { x: pelvis.x + lerp(rightBack, rightFront, swingT2), y: groundY - Math.sin(swingT2 * Math.PI) * lift }
      : { x: pelvis.x + rightBack, y: groundY };

    const leftHandTarget = { x: lShoulder.x - dir * armSwing * Math.cos(phase + Math.PI * 0.05), y: lShoulder.y + Math.sin(phase + Math.PI * 0.45) * lift * 0.5 + (cycle < 0.5 ? lift * 0.06 : -lift * 0.04) };
    const rightHandTarget = { x: rShoulder.x + dir * armSwing * Math.cos(phase + Math.PI * 0.05), y: rShoulder.y + Math.sin(phase + Math.PI * 0.45 + Math.PI) * lift * 0.5 + (cycle < 0.5 ? -lift * 0.04 : lift * 0.06) };

    const leftLeg = solve2Bone(lHip, leftFoot, thighLen, shinLen, dir * (leftSwing ? 1 : -1) * 0.95);
    const rightLeg = solve2Bone(rHip, rightFoot, thighLen, shinLen, dir * (rightSwing ? 1 : -1) * 0.95);
    const leftArm = solve2Bone(lShoulder, leftHandTarget, upperArmLen, lowerArmLen, dir * (cycle < 0.5 ? -1 : 1));
    const rightArm = solve2Bone(rShoulder, rightHandTarget, upperArmLen, lowerArmLen, dir * (cycle < 0.5 ? 1 : -1));

    const joints = {
      pelvis, chest, neck, head,
      lShoulder, lElbow: leftArm.mid, lHand: leftArm.end,
      rShoulder, rElbow: rightArm.mid, rHand: rightArm.end,
      lHip, lKnee: leftLeg.mid, lFoot: leftLeg.end,
      rHip, rKnee: rightLeg.mid, rFoot: rightLeg.end,
    };

    const bones = {
      torso: Math.atan2(chest.y - pelvis.y, chest.x - pelvis.x),
      neck: Math.atan2(neck.y - chest.y, neck.x - chest.x),
      head: Math.atan2(head.y - neck.y, head.x - neck.x),
      lUpperArm: leftArm.angle1,
      lForearm: leftArm.angle2,
      rUpperArm: rightArm.angle1,
      rForearm: rightArm.angle2,
      lThigh: leftLeg.angle1,
      lShin: leftLeg.angle2,
      rThigh: rightLeg.angle1,
      rShin: rightLeg.angle2,
    };
    return { joints, bones, centerX, groundY, cycle };
  }

  function partAngleForPose(part, pose) {
    const k = part.kind;
    if (k === 'torso' || k === 'pelvis') return pose.bones.torso;
    if (k === 'neck') return pose.bones.neck;
    if (k === 'head') return pose.bones.head;
    if (k === 'lUpperArm') return pose.bones.lUpperArm;
    if (k === 'lForearm') return pose.bones.lForearm;
    if (k === 'rUpperArm') return pose.bones.rUpperArm;
    if (k === 'rForearm') return pose.bones.rForearm;
    if (k === 'lThigh') return pose.bones.lThigh;
    if (k === 'lShin') return pose.bones.lShin;
    if (k === 'rThigh') return pose.bones.rThigh;
    if (k === 'rShin') return pose.bones.rShin;
    if (part.proxJoint && part.distJoint && pose.joints[part.proxJoint] && pose.joints[part.distJoint]) {
      const a = pose.joints[part.proxJoint], b = pose.joints[part.distJoint];
      return Math.atan2(b.y - a.y, b.x - a.x);
    }
    if (part.proxJoint && pose.joints[part.proxJoint] && state.joints[part.proxJoint]) {
      const parent = state.joints[part.proxJoint];
      return 0 + (state.facing === 'right' ? 0 : Math.PI);
    }
    return 0;
  }

  function partScaleForPose(part, pose) {
    const kind = part.kind || '';
    const a = pose.joints[part.proxJoint];
    const b = pose.joints[part.distJoint];
    const targetLen = (a && b) ? Math.hypot(b.x - a.x, b.y - a.y) : null;
    if (!targetLen || !part.sourceLength) return 1;
    if (/Torso|Pelvis|Head|Neck|Arm|Forearm|Leg|Thigh|Shin/i.test(kind)) return targetLen / Math.max(1, part.sourceLength);
    return 1;
  }

  function sortPartsForDraw() {
    return [...state.parts].filter(p => p.visible && p.artCanvas).sort((a, b) => (a.depth || 0) - (b.depth || 0));
  }

  function drawPreview(ts) {
    const rect = makeCanvasSize(previewCanvas, pCtx);
    pCtx.clearRect(0, 0, rect.w, rect.h);
    const bg = pCtx.createLinearGradient(0, 0, 0, rect.h);
    bg.addColorStop(0, '#1b2633');
    bg.addColorStop(1, '#0b1016');
    pCtx.fillStyle = bg;
    pCtx.fillRect(0, 0, rect.w, rect.h);

    const groundY = rect.h * 0.82;
    pCtx.save();
    pCtx.fillStyle = 'rgba(255,255,255,0.04)';
    pCtx.fillRect(0, groundY, rect.w, rect.h - groundY);
    pCtx.strokeStyle = 'rgba(109,201,255,0.25)';
    pCtx.lineWidth = 2;
    pCtx.beginPath(); pCtx.moveTo(0, groundY + 0.5); pCtx.lineTo(rect.w, groundY + 0.5); pCtx.stroke();
    pCtx.restore();

    if (!state.image || !state.parts.length) {
      pCtx.save();
      pCtx.fillStyle = 'rgba(255,255,255,.12)';
      pCtx.textAlign = 'center';
      pCtx.font = '600 20px Inter, sans-serif';
      pCtx.fillText('Add a rig and assign masks to see the walk preview', rect.w / 2, rect.h / 2 - 8);
      pCtx.font = '13px Inter, sans-serif';
      pCtx.fillText('This version uses cutout layers + bones, not mesh warping.', rect.w / 2, rect.h / 2 + 16);
      pCtx.restore();
      return;
    }

    const pose = poseAt(state.time);
    const parts = sortPartsForDraw();
    // Layer order tuned for side-scroller overlap.
    const nearFront = state.facing === 'right';
    const drawOrder = [];
    const byKind = (k) => parts.filter(p => p.kind === k);
    const torsoParts = parts.filter(p => /torso|pelvis|neck/i.test(p.kind));
    const headParts = parts.filter(p => /head|hair/i.test(p.kind));
    const leftBack = parts.filter(p => ['lThigh','lShin','lUpperArm','lForearm'].includes(p.kind));
    const rightBack = parts.filter(p => ['rThigh','rShin','rUpperArm','rForearm'].includes(p.kind));

    if (nearFront) {
      drawOrder.push(...byKind('lThigh'), ...byKind('lShin'), ...byKind('lUpperArm'), ...byKind('lForearm'));
      drawOrder.push(...torsoParts);
      drawOrder.push(...byKind('rUpperArm'), ...byKind('rForearm'), ...headParts);
      drawOrder.push(...byKind('rThigh'), ...byKind('rShin'));
    } else {
      drawOrder.push(...byKind('rThigh'), ...byKind('rShin'), ...byKind('rUpperArm'), ...byKind('rForearm'));
      drawOrder.push(...torsoParts);
      drawOrder.push(...byKind('lUpperArm'), ...byKind('lForearm'), ...headParts);
      drawOrder.push(...byKind('lThigh'), ...byKind('lShin'));
    }
    // Add anything not handled.
    for (const part of parts) if (!drawOrder.includes(part)) drawOrder.push(part);

    // Optional silhouette shadow.
    pCtx.save();
    pCtx.fillStyle = 'rgba(0,0,0,0.20)';
    pCtx.beginPath(); pCtx.ellipse(pose.centerX, groundY + 5, 120, 22, 0, 0, TAU); pCtx.fill();
    pCtx.restore();

    for (const part of drawOrder) {
      if (!part.visible || !part.artCanvas || !part.proxJoint) continue;
      const anchor = pose.joints[part.proxJoint];
      if (!anchor) continue;
      const angle = partAngleForPose(part, pose);
      const scale = partScaleForPose(part, pose);
      const pivot = part.pivotSource || state.joints[part.proxJoint] || { x: 0, y: 0 };
      const localPivotX = (part.artRect ? pivot.x - part.artRect.x : 0);
      const localPivotY = (part.artRect ? pivot.y - part.artRect.y : 0);
      pCtx.save();
      pCtx.translate(anchor.x, anchor.y);
      pCtx.rotate(angle);
      pCtx.scale(scale, scale);
      pCtx.drawImage(part.artCanvas, -localPivotX, -localPivotY);
      pCtx.restore();
    }

    if (!state.playing) {
      pCtx.save();
      pCtx.fillStyle = 'rgba(255,201,107,.85)';
      pCtx.font = '600 12px Inter, sans-serif';
      pCtx.fillText('Paused', 14, 22);
      pCtx.restore();
    }
  }

  function exportStillPNG() {
    const c = document.createElement('canvas');
    const rect = previewCanvas.getBoundingClientRect();
    c.width = previewCanvas.width;
    c.height = previewCanvas.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(previewCanvas, 0, 0);
    const a = document.createElement('a');
    a.download = 'walk-preview.png';
    a.href = c.toDataURL('image/png');
    a.click();
  }

  function startRecording() {
    if (state.recording) {
      state.recorder?.stop();
      return;
    }
    const stream = previewCanvas.captureStream(60);
    let mime = 'video/webm';
    if (window.MediaRecorder && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) mime = 'video/webm;codecs=vp9';
    else if (window.MediaRecorder && MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) mime = 'video/webm;codecs=vp8';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    state.recorder = rec;
    state.recorderChunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) state.recorderChunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(state.recorderChunks, { type: rec.mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'walk-preview.webm';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      state.recording = false;
      ui.recordBtn.textContent = 'Record';
    };
    rec.start();
    state.recording = true;
    ui.recordBtn.textContent = 'Stop';
    setTimeout(() => { if (state.recording) rec.stop(); }, 5000);
  }

  function onSourcePointerDown(evt) {
    if (!state.image) return;
    const pos = getCanvasPoint(evt, sourceCanvas);
    if (state.placePivotPartId) {
      const part = partById(state.placePivotPartId);
      if (part) {
        part.pivotSource = screenToImage(pos);
        part.pivotMode = 'custom';
        state.placePivotPartId = null;
        rebuildPartArt(part);
        setBadge(`Pivot placed for ${part.name}.`);
        state.needsSourceRedraw = true;
      }
      return;
    }
    if (state.tool === 'pan') {
      state.panning = true;
      state.panStart = { x: pos.x, y: pos.y, panX: state.sourcePanX, panY: state.sourcePanY };
      sourceCanvas.setPointerCapture(evt.pointerId);
      return;
    }
    if (state.tool === 'joint') {
      const hit = sourceHitJoint(pos);
      if (hit) {
        state.dragJoint = hit;
        state.selectedJoint = hit;
        sourceCanvas.setPointerCapture(evt.pointerId);
        setBadge(`Dragging joint ${hit}.`);
      } else {
        const imgPt = screenToImage(pos);
        const closest = nearestJoint(imgPt, 26 / (state.sourceLayout?.scale || 1));
        if (closest) state.selectedJoint = closest;
      }
      state.needsSourceRedraw = true;
      return;
    }
    if (state.tool === 'lasso') {
      state.drawingLasso = true;
      state.selectionPath = [screenToImage(pos)];
      sourceCanvas.setPointerCapture(evt.pointerId);
      state.needsSourceRedraw = true;
      return;
    }
    if (state.tool === 'wand') {
      const imgPt = screenToImage(pos);
      const mask = floodFillMask(imgPt.x, imgPt.y, Number(ui.wandRange.value));
      if (mask) {
        const mode = state.selectionMode;
        state.selectionMask = combineMasks(state.selectionMask, mask, mode);
        state.needsSourceRedraw = true;
        setBadge('Wand selection created. Assign it to the active part.');
      }
      return;
    }
  }

  function nearestJoint(imgPt, maxDist) {
    let best = null; let bestD = maxDist;
    for (const name of JOINTS) {
      const p = state.joints[name]; if (!p) continue;
      const d = Math.hypot(imgPt.x - p.x, imgPt.y - p.y);
      if (d < bestD) { best = name; bestD = d; }
    }
    return best;
  }

  function onSourcePointerMove(evt) {
    if (!state.image) return;
    const pos = getCanvasPoint(evt, sourceCanvas);
    if (state.panning && state.panStart) {
      state.sourcePanX = state.panStart.panX + (pos.x - state.panStart.x);
      state.sourcePanY = state.panStart.panY + (pos.y - state.panStart.y);
      state.needsSourceRedraw = true;
      return;
    }
    if (state.dragJoint) {
      setJoint(state.dragJoint, screenToImage(pos));
      return;
    }
    if (state.drawingLasso) {
      const p = screenToImage(pos);
      const last = state.selectionPath[state.selectionPath.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) {
        state.selectionPath.push(p);
        state.needsSourceRedraw = true;
      }
    }
  }

  function onSourcePointerUp(evt) {
    if (state.panning) state.panning = false;
    if (state.dragJoint) state.dragJoint = null;
    if (state.drawingLasso) {
      state.drawingLasso = false;
      updateSelectionMaskFromPath();
    }
    state.panStart = null;
  }

  function zoomAtPointer(factor, clientX, clientY) {
    if (!state.image) return;
    const rect = sourceCanvas.getBoundingClientRect();
    const before = { x: clientX - rect.left, y: clientY - rect.top };
    const imgPt = screenToImage(before);
    state.sourceZoom = clamp(state.sourceZoom * factor, 0.5, 4);
    ui.zoomRange.value = String(state.sourceZoom);
    const lay = sourceLayout();
    const newScreen = { x: lay.x + imgPt.x * lay.scale, y: lay.y + imgPt.y * lay.scale };
    state.sourcePanX += before.x - newScreen.x;
    state.sourcePanY += before.y - newScreen.y;
    state.needsSourceRedraw = true;
  }

  function setupEvents() {
    window.addEventListener('resize', () => {
      state.needsSourceRedraw = true;
      state.needsPreviewRedraw = true;
    });

    sourceCanvas.addEventListener('wheel', (e) => {
      if (!state.image) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      zoomAtPointer(factor, e.clientX, e.clientY);
    }, { passive: false });

    sourceCanvas.addEventListener('pointerdown', onSourcePointerDown);
    sourceCanvas.addEventListener('pointermove', onSourcePointerMove);
    sourceCanvas.addEventListener('pointerup', onSourcePointerUp);
    sourceCanvas.addEventListener('pointercancel', onSourcePointerUp);

    ui.fileInput.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (f) await loadImageFile(f);
    });

    ui.demoBtn.addEventListener('click', async () => {
      const img = await loadImageFromSrc(createDemoImage());
      setImage(img);
      state.demoLoaded = true;
      if (!state.parts.length) buildStarterRig();
      setBadge('Demo image loaded. You can replace it with your own character image anytime.');
    });

    ui.fitBtn.addEventListener('click', fitSource);

    ui.presetBtn.addEventListener('click', () => {
      buildStarterRig();
    });
    ui.clearPartsBtn.addEventListener('click', clearParts);

    ui.playBtn.addEventListener('click', () => {
      state.playing = !state.playing;
      ui.playBtn.textContent = state.playing ? 'Pause' : 'Play';
      if (state.playing) state.lastTs = performance.now();
    });
    ui.recordBtn.addEventListener('click', startRecording);

    ui.facingSelect.addEventListener('change', () => {
      state.facing = ui.facingSelect.value;
      bakeDefaultJoints();
      state.needsSourceRedraw = true;
      state.needsPreviewRedraw = true;
    });

    document.querySelectorAll('input[name="tool"]').forEach(r => {
      r.addEventListener('change', () => {
        if (r.checked) state.tool = r.value;
      });
    });

    ui.selectionModeSelect.addEventListener('change', () => state.selectionMode = ui.selectionModeSelect.value);
    ui.wandRange.addEventListener('input', () => state.wandTol = Number(ui.wandRange.value));
    ui.featherRange.addEventListener('input', () => { state.feather = Number(ui.featherRange.value); state.needsSourceRedraw = true; });
    ui.zoomRange.addEventListener('input', () => { state.sourceZoom = Number(ui.zoomRange.value); state.needsSourceRedraw = true; });

    ui.speedRange.addEventListener('input', () => state.speed = Number(ui.speedRange.value));
    ui.strideRange.addEventListener('input', () => state.stride = Number(ui.strideRange.value));
    ui.bounceRange.addEventListener('input', () => state.bounce = Number(ui.bounceRange.value));
    ui.leanRange.addEventListener('input', () => state.lean = Number(ui.leanRange.value));
    ui.travelRange.addEventListener('input', () => state.travel = Number(ui.travelRange.value));
    ui.armRange.addEventListener('input', () => state.armSwing = Number(ui.armRange.value));

    ui.addPartBtn.addEventListener('click', () => addPart(ui.partPresetSelect.value));
    ui.assignMaskBtn.addEventListener('click', () => {
      const part = selectedPart();
      if (!part) return setBadge('Select a part first.');
      applySelectionToPart(part, state.selectionMode);
      setBadge(`Assigned selection to ${part.name}.`);
      clearSelection();
      renderPartsList();
    });

    ui.commitSelectionBtn.addEventListener('click', () => {
      const part = selectedPart();
      if (!part) return setBadge('Select a part first.');
      applySelectionToPart(part, state.selectionMode);
      clearSelection();
      renderPartsList();
      setBadge(`Selection assigned to ${part.name}.`);
    });

    ui.invertSelectionBtn.addEventListener('click', () => {
      state.selectionMask = invertMask(state.selectionMask);
      state.needsSourceRedraw = true;
    });
    ui.clearSelectionBtn.addEventListener('click', clearSelection);

    ui.resetRigBtn.addEventListener('click', () => {
      bakeDefaultJoints();
      for (const part of state.parts) {
        part.pivotSource = null;
        rebuildPartArt(part);
      }
      setBadge('Rig reset to default joint placement.');
    });

    ui.exportStillBtn.addEventListener('click', exportStillPNG);
  }

  function ensurePresetOptions() {
    ui.partPresetSelect.innerHTML = '';
    for (const [key, preset] of Object.entries(PART_PRESETS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = preset.label;
      ui.partPresetSelect.appendChild(opt);
    }
  }

  function frame(ts) {
    if (state.playing) {
      if (!state.lastTs) state.lastTs = ts;
      const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
      state.lastTs = ts;
      state.time += dt;
      state.needsPreviewRedraw = true;
    } else {
      state.lastTs = ts;
    }
    if (state.needsSourceRedraw) { drawSource(); state.needsSourceRedraw = false; }
    if (state.needsPreviewRedraw) { drawPreview(ts); state.needsPreviewRedraw = false; }
    requestAnimationFrame(frame);
  }

  async function boot() {
    ensurePresetOptions();
    setupEvents();
    state.sourceZoom = 1;
    ui.zoomRange.value = '1';
    state.speed = Number(ui.speedRange.value);
    state.stride = Number(ui.strideRange.value);
    state.bounce = Number(ui.bounceRange.value);
    state.lean = Number(ui.leanRange.value);
    state.travel = Number(ui.travelRange.value);
    state.armSwing = Number(ui.armRange.value);
    state.wandTol = Number(ui.wandRange.value);
    state.feather = Number(ui.featherRange.value);
    state.selectionMode = ui.selectionModeSelect.value;
    state.facing = ui.facingSelect.value;
    setBadge('Import a character image or load the demo.');
    setPreviewBadge('Build masks for parts, then the walk will update here.');
    buildStarterRig();
    requestAnimationFrame(frame);
  }

  boot();
})();
