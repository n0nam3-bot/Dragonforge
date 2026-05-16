(() => {
  const $ = (id) => document.getElementById(id);
  const sourceCanvas = $('sourceCanvas');
  const previewCanvas = $('previewCanvas');
  const sCtx = sourceCanvas.getContext('2d');
  const pCtx = previewCanvas.getContext('2d');
  const sourceBadge = $('sourceBadge');
  const previewBadge = $('previewBadge');

  const offscreen = document.createElement('canvas');
  const offCtx = offscreen.getContext('2d');
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  const workingCanvas = document.createElement('canvas');
  const workingCtx = workingCanvas.getContext('2d');

  const JOINTS = [
    'pelvis','chest','neck','head',
    'lShoulder','lElbow','lHand',
    'rShoulder','rElbow','rHand',
    'lHip','lKnee','lFoot',
    'rHip','rKnee','rFoot'
  ];

  const PART_LIBRARY = [
    { id:'torso', label:'Torso', role:'torso', side:'center', a:'pelvis', b:'chest', c:'lShoulder', z:40, color:'rgba(124,196,255,.45)' },
    { id:'head', label:'Head', role:'head', side:'center', a:'neck', b:'head', c:'lShoulder', z:90, color:'rgba(103,232,160,.45)' },
    { id:'hair', label:'Hair', role:'hair', side:'center', a:'neck', b:'head', c:'rShoulder', z:100, color:'rgba(255,184,107,.45)' },

    { id:'lUpperArm', label:'Upper arm L', role:'upperArm', side:'left', a:'lShoulder', b:'lElbow', c:'chest', z:28, color:'rgba(255,120,120,.45)' },
    { id:'lLowerArm', label:'Forearm L', role:'lowerArm', side:'left', a:'lElbow', b:'lHand', c:'lShoulder', z:29, color:'rgba(255,120,120,.45)' },
    { id:'lHand', label:'Hand L', role:'hand', side:'left', a:'lElbow', b:'lHand', c:'lShoulder', z:30, color:'rgba(255,120,120,.45)' },
    { id:'rUpperArm', label:'Upper arm R', role:'upperArm', side:'right', a:'rShoulder', b:'rElbow', c:'chest', z:28, color:'rgba(255,120,120,.45)' },
    { id:'rLowerArm', label:'Forearm R', role:'lowerArm', side:'right', a:'rElbow', b:'rHand', c:'rShoulder', z:29, color:'rgba(255,120,120,.45)' },
    { id:'rHand', label:'Hand R', role:'hand', side:'right', a:'rElbow', b:'rHand', c:'rShoulder', z:30, color:'rgba(255,120,120,.45)' },

    { id:'lThigh', label:'Thigh L', role:'thigh', side:'left', a:'lHip', b:'lKnee', c:'pelvis', z:18, color:'rgba(124,196,255,.45)' },
    { id:'lShin', label:'Shin L', role:'shin', side:'left', a:'lKnee', b:'lFoot', c:'lHip', z:19, color:'rgba(124,196,255,.45)' },
    { id:'lFoot', label:'Foot L', role:'foot', side:'left', a:'lKnee', b:'lFoot', c:'lHip', z:20, color:'rgba(124,196,255,.45)' },
    { id:'rThigh', label:'Thigh R', role:'thigh', side:'right', a:'rHip', b:'rKnee', c:'pelvis', z:18, color:'rgba(124,196,255,.45)' },
    { id:'rShin', label:'Shin R', role:'shin', side:'right', a:'rKnee', b:'rFoot', c:'rHip', z:19, color:'rgba(124,196,255,.45)' },
    { id:'rFoot', label:'Foot R', role:'foot', side:'right', a:'rKnee', b:'rFoot', c:'rHip', z:20, color:'rgba(124,196,255,.45)' },

    { id:'accessory', label:'Accessory', role:'accessory', side:'center', a:'chest', b:'neck', c:'lShoulder', z:95, color:'rgba(255,255,255,.35)' },
  ];

  const state = {
    image: null,
    artW: 0,
    artH: 0,
    play: true,
    speed: 1,
    facing: 1,
    trimThreshold: 28,
    showMask: true,
    showRig: true,
    tool: 'move',
    wandTol: 28,
    feather: 1.6,
    view: { fit: 1, zoom: 1, panX: 0, panY: 0 },
    params: { stride: 0.12, lift: 0.075, bounce: 0.018, lean: 0.11, armSwing: 0.90, sway: 0.02 },
    rest: {},
    pose: {},
    parts: [],
    currentPartId: null,
    drag: null,
    selectionStroke: null,
    time: 0,
    lastTS: performance.now(),
    needsRebuild: true,
    sourcePixels: null,
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const copy = (o) => ({ x: o.x, y: o.y });

  function resizeCanvas(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setBadge(text) {
    previewBadge.textContent = text;
  }

  function fitSource() {
    if (!state.artW || !state.artH) return;
    const rect = sourceCanvas.getBoundingClientRect();
    state.view.fit = Math.min(rect.width / state.artW, rect.height / state.artH) * 0.95;
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
    redraw();
  }

  function sourceViewRect() {
    const rect = sourceCanvas.getBoundingClientRect();
    const scale = state.view.fit * state.view.zoom;
    const drawW = state.artW * scale;
    const drawH = state.artH * scale;
    const x0 = rect.width / 2 - drawW / 2 + state.view.panX;
    const y0 = rect.height / 2 - drawH / 2 + state.view.panY;
    return { x0, y0, scale, drawW, drawH, rect };
  }

  function previewViewRect() {
    const rect = previewCanvas.getBoundingClientRect();
    const scale = Math.min(rect.width / state.artW, rect.height / state.artH) * 0.92;
    const drawW = state.artW * scale;
    const drawH = state.artH * scale;
    const x0 = rect.width / 2 - drawW / 2;
    const y0 = rect.height / 2 - drawH / 2;
    return { x0, y0, scale, drawW, drawH, rect };
  }

  function toSourceScreen(pt) {
    const { x0, y0, scale } = sourceViewRect();
    return { x: x0 + pt.x * scale, y: y0 + pt.y * scale };
  }

  function fromSourceScreen(pt) {
    const { x0, y0, scale } = sourceViewRect();
    return { x: (pt.x - x0) / scale, y: (pt.y - y0) / scale };
  }

  function defaultRestPose() {
    if (!state.artW || !state.artH) return {};
    const w = state.artW;
    const h = state.artH;
    const f = state.facing;
    const cx = w * 0.50 + f * w * 0.015;
    const shoulderY = h * 0.36;
    const neckY = h * 0.26;
    const headY = h * 0.14;
    const pelvisY = h * 0.58;
    const shoulderSpan = w * 0.18;
    const hipSpan = w * 0.13;

    return {
      pelvis: { x: cx - f * w * 0.008, y: pelvisY },
      chest: { x: cx + f * w * 0.012, y: shoulderY },
      neck: { x: cx + f * w * 0.016, y: neckY },
      head: { x: cx + f * w * 0.02, y: headY },

      lShoulder: { x: cx - shoulderSpan * 0.54 - f * w * 0.02, y: shoulderY },
      lElbow: { x: cx - shoulderSpan * 0.78 - f * w * 0.07, y: h * 0.50 },
      lHand: { x: cx - shoulderSpan * 0.96 - f * w * 0.12, y: h * 0.61 },

      rShoulder: { x: cx + shoulderSpan * 0.50 + f * w * 0.05, y: shoulderY },
      rElbow: { x: cx + shoulderSpan * 0.77 + f * w * 0.10, y: h * 0.50 },
      rHand: { x: cx + shoulderSpan * 0.95 + f * w * 0.16, y: h * 0.60 },

      lHip: { x: cx - hipSpan * 0.48 - f * w * 0.01, y: pelvisY },
      lKnee: { x: cx - hipSpan * 0.58 + f * w * 0.02, y: h * 0.75 },
      lFoot: { x: cx - hipSpan * 0.56 + f * w * 0.02, y: h * 0.92 },

      rHip: { x: cx + hipSpan * 0.48 + f * w * 0.02, y: pelvisY },
      rKnee: { x: cx + hipSpan * 0.58 + f * w * 0.06, y: h * 0.75 },
      rFoot: { x: cx + hipSpan * 0.56 + f * w * 0.07, y: h * 0.92 },
    };
  }

  function autoRig() {
    state.rest = defaultRestPose();
    state.pose = JSON.parse(JSON.stringify(state.rest));
    rebuildAllPartLayers();
    refreshRigUI();
    redraw();
  }

  function currentPart() {
    return state.parts.find((p) => p.id === state.currentPartId) || state.parts[0] || null;
  }

  function createPart(spec, isCustom = false) {
    const part = {
      id: spec.id,
      label: spec.label,
      role: spec.role,
      side: spec.side,
      a: spec.a,
      b: spec.b,
      c: spec.c,
      z: spec.z,
      color: spec.color,
      visible: true,
      custom: isCustom,
      maskCanvas: document.createElement('canvas'),
      maskCtx: null,
      layerCanvas: document.createElement('canvas'),
      layerOffset: { x: 0, y: 0 },
      bbox: null,
      dirty: true,
    };
    part.maskCtx = part.maskCanvas.getContext('2d');
    part.maskCanvas.width = Math.max(1, state.artW || 1);
    part.maskCanvas.height = Math.max(1, state.artH || 1);
    part.layerCanvas.width = 1;
    part.layerCanvas.height = 1;
    return part;
  }

  function initParts() {
    state.parts = PART_LIBRARY.map((spec) => createPart(spec, false));
    state.currentPartId = state.parts[0]?.id || null;
    refreshPartUI();
    refreshRigUI();
  }

  function refreshPartUI() {
    const partSelect = $('partSelect');
    partSelect.innerHTML = '';
    for (const part of state.parts) {
      const opt = document.createElement('option');
      opt.value = part.id;
      opt.textContent = part.label + (part.visible ? '' : ' (hidden)');
      partSelect.appendChild(opt);
    }
    if (state.currentPartId && state.parts.some((p) => p.id === state.currentPartId)) {
      partSelect.value = state.currentPartId;
    } else if (state.parts[0]) {
      state.currentPartId = state.parts[0].id;
      partSelect.value = state.currentPartId;
    }
    refreshAttachMenus();
    refreshPartFields();
  }

  function refreshAttachMenus() {
    const selectIds = ['attachASelect', 'attachBSelect', 'attachCSelect'];
    for (const id of selectIds) {
      const sel = $(id);
      const current = sel.value;
      sel.innerHTML = '';
      for (const j of JOINTS) {
        const opt = document.createElement('option');
        opt.value = j;
        opt.textContent = j;
        sel.appendChild(opt);
      }
      if (current && JOINTS.includes(current)) sel.value = current;
    }
  }

  function refreshPartFields() {
    const p = currentPart();
    if (!p) return;
    $('partNameInput').value = p.label;
    $('attachASelect').value = p.a;
    $('attachBSelect').value = p.b;
    $('attachCSelect').value = p.c;
    $('layerInput').value = p.z;
    $('partSelect').value = p.id;
  }

  function refreshRigUI() {
    $('facingSelect').value = String(state.facing);
    $('speedRange').value = String(state.speed);
    $('strideRange').value = String(state.params.stride);
    $('liftRange').value = String(state.params.lift);
    $('bounceRange').value = String(state.params.bounce);
    $('leanRange').value = String(state.params.lean);
    $('armRange').value = String(state.params.armSwing);
    $('wandRange').value = String(state.wandTol);
    $('featherRange').value = String(state.feather);
    $('showMaskToggle').checked = state.showMask;
    $('showRigToggle').checked = state.showRig;
  }

  function markPartDirty(part) {
    part.dirty = true;
  }

  function clearMask(part) {
    part.maskCtx.clearRect(0, 0, part.maskCanvas.width, part.maskCanvas.height);
    markPartDirty(part);
    rebuildPartLayer(part);
    redraw();
  }

  function ensureSourcePixels() {
    if (!state.artW || !state.artH) return;
    state.sourcePixels = offCtx.getImageData(0, 0, state.artW, state.artH);
  }

  function loadImageFromSource(sourceImage) {
    state.image = sourceImage;
    state.artW = sourceImage.naturalWidth || sourceImage.width;
    state.artH = sourceImage.naturalHeight || sourceImage.height;
    offscreen.width = state.artW;
    offscreen.height = state.artH;
    offCtx.setTransform(1, 0, 0, 1, 0, 0);
    offCtx.clearRect(0, 0, state.artW, state.artH);
    offCtx.drawImage(sourceImage, 0, 0);
    ensureSourcePixels();

    // Resize all masks to the imported image size.
    for (const part of state.parts) {
      part.maskCanvas.width = state.artW;
      part.maskCanvas.height = state.artH;
      part.maskCtx = part.maskCanvas.getContext('2d');
      part.maskCtx.clearRect(0, 0, state.artW, state.artH);
      part.layerCanvas.width = 1;
      part.layerCanvas.height = 1;
      part.layerOffset = { x: 0, y: 0 };
      part.bbox = null;
      part.dirty = true;
    }

    sourceBadge.textContent = `Loaded ${state.artW}×${state.artH}`;
    setBadge('Ready');
    autoRig();
    fitSource();
    redraw();
  }

  function maskBBox(maskCanvas) {
    const w = maskCanvas.width;
    const h = maskCanvas.height;
    const ctx = maskCanvas.getContext('2d');
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4 + 3;
        if (data[i] > 0) {
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

  function rebuildPartLayer(part) {
    if (!state.image || !state.artW || !state.artH) return;
    const bbox = maskBBox(part.maskCanvas);
    part.bbox = bbox;
    if (!bbox) {
      part.layerCanvas.width = 1;
      part.layerCanvas.height = 1;
      part.layerOffset = { x: 0, y: 0 };
      part.dirty = false;
      return;
    }
    const w = bbox.w;
    const h = bbox.h;
    workingCanvas.width = w;
    workingCanvas.height = h;
    workingCtx.setTransform(1, 0, 0, 1, 0, 0);
    workingCtx.clearRect(0, 0, w, h);
    workingCtx.imageSmoothingEnabled = true;
    workingCtx.drawImage(offscreen, bbox.x, bbox.y, w, h, 0, 0, w, h);
    workingCtx.save();
    workingCtx.globalCompositeOperation = 'destination-in';
    workingCtx.filter = `blur(${Math.max(0, state.feather)}px)`;
    workingCtx.drawImage(part.maskCanvas, bbox.x, bbox.y, w, h, 0, 0, w, h);
    workingCtx.restore();

    part.layerCanvas.width = w;
    part.layerCanvas.height = h;
    const lctx = part.layerCanvas.getContext('2d');
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, w, h);
    lctx.drawImage(workingCanvas, 0, 0);
    part.layerOffset = { x: bbox.x, y: bbox.y };
    part.dirty = false;
  }

  function rebuildAllPartLayers() {
    for (const part of state.parts) {
      rebuildPartLayer(part);
    }
  }

  function partById(id) {
    return state.parts.find((p) => p.id === id) || null;
  }

  function updatePartFromUI() {
    const part = currentPart();
    if (!part) return;
    part.label = $('partNameInput').value.trim() || part.label;
    part.a = $('attachASelect').value;
    part.b = $('attachBSelect').value;
    part.c = $('attachCSelect').value;
    part.z = Number($('layerInput').value) || part.z;
    refreshPartUI();
    state.needsRebuild = true;
    redraw();
  }

  function addCustomPart() {
    const n = (state.parts.filter((p) => p.custom).length + 1);
    const name = prompt('Name for the new body part:', `Custom part ${n}`);
    if (!name) return;
    const spec = {
      id: `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      label: name,
      role: 'custom',
      side: 'center',
      a: 'chest',
      b: 'neck',
      c: 'lShoulder',
      z: 60,
      color: 'rgba(255,255,255,.35)',
    };
    const p = createPart(spec, true);
    state.parts.push(p);
    state.currentPartId = p.id;
    refreshPartUI();
    redraw();
  }

  function removeCurrentPart() {
    if (state.parts.length <= 1) return;
    const p = currentPart();
    if (!p) return;
    state.parts = state.parts.filter((x) => x.id !== p.id);
    state.currentPartId = state.parts[0]?.id || null;
    refreshPartUI();
    redraw();
  }

  function maybeAddPoint(arr, pt) {
    if (!arr.length) {
      arr.push(pt);
      return;
    }
    const last = arr[arr.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 3) arr.push(pt);
  }

  function polygonMask(points) {
    const mask = document.createElement('canvas');
    mask.width = state.artW;
    mask.height = state.artH;
    const ctx = mask.getContext('2d');
    ctx.clearRect(0, 0, state.artW, state.artH);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fill();
    return mask;
  }

  function applyMaskOperation(part, maskCanvas, mode = 'add') {
    if (!part) return;
    const ctx = part.maskCtx;
    ctx.save();
    ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.restore();
    markPartDirty(part);
    rebuildPartLayer(part);
    redraw();
  }

  function floodFillMask(screenPt) {
    if (!state.sourcePixels || !state.artW || !state.artH) return null;
    const p = fromSourceScreen(screenPt);
    const x = Math.floor(clamp(p.x, 0, state.artW - 1));
    const y = Math.floor(clamp(p.y, 0, state.artH - 1));
    const { data, width: w, height: h } = state.sourcePixels;
    const idx0 = (y * w + x) * 4;
    const seedR = data[idx0], seedG = data[idx0 + 1], seedB = data[idx0 + 2], seedA = data[idx0 + 3];
    if (seedA < 4) return null;

    const visited = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let qh = 0, qt = 0;
    const push = (ix, iy) => {
      const idx = iy * w + ix;
      if (!visited[idx]) {
        visited[idx] = 1;
        queue[qt++] = idx;
      }
    };
    push(x, y);

    const tol = Number(state.wandTol);
    const tol2 = tol * tol;
    const colorDist2 = (i) => {
      const dr = data[i] - seedR;
      const dg = data[i + 1] - seedG;
      const db = data[i + 2] - seedB;
      const da = data[i + 3] - seedA;
      return dr * dr + dg * dg + db * db + da * da * 0.7;
    };

    while (qh < qt) {
      const idx = queue[qh++];
      const px = idx % w;
      const py = (idx / w) | 0;
      const i = idx * 4;
      if (data[i + 3] > 0 && colorDist2(i) <= tol2) {
        out[idx] = 1;
        if (px > 0) push(px - 1, py);
        if (px < w - 1) push(px + 1, py);
        if (py > 0) push(px, py - 1);
        if (py < h - 1) push(px, py + 1);
      }
    }

    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const ctx = mask.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < out.length; i++) {
      if (out[i]) img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return mask;
  }


  function segmentDistance(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(px - x1, py - y1);
    const c2 = vx * vx + vy * vy;
    if (c1 >= c2) return Math.hypot(px - x2, py - y2);
    const t = c1 / c2;
    const bx = x1 + t * vx;
    const by = y1 + t * vy;
    return Math.hypot(px - bx, py - by);
  }
  function scorePartPixel(x, y, part, rest) {
    const a = rest[part.a];
    const b = rest[part.b];
    const c = rest[part.c] || null;
    const dseg = segmentDistance(x, y, a.x, a.y, b.x, b.y);
    const centerX = (rest.pelvis.x + rest.chest.x) * 0.5;
    const bodyLineX = centerX;
    const frontSide = state.facing > 0 ? 'left' : 'right';
    const sideWeight = ((part.side === frontSide) ? -1 : (part.side === 'center' ? 0 : 1));
    const sideBias = Math.abs(x - bodyLineX) * 0.05 * sideWeight;

    if (part.role === 'torso') {
      const yMid = (rest.pelvis.y + rest.chest.y) * 0.5;
      return dseg * 0.65 + Math.abs(y - yMid) * 0.08 + Math.abs(x - bodyLineX) * 0.12;
    }
    if (part.role === 'head' || part.role === 'hair' || part.role === 'accessory') {
      const headBias = Math.max(0, y - rest.neck.y) * 0.5 + Math.max(0, rest.chest.y - y) * 0.1;
      return dseg * 0.6 + headBias + Math.abs(x - rest.head.x) * 0.08;
    }
    if (part.role === 'upperArm') {
      const shoulderPenalty = dist({ x, y }, a) * 0.10;
      return dseg * 0.75 + shoulderPenalty + sideBias;
    }
    if (part.role === 'lowerArm') {
      const endPenalty = dist({ x, y }, b) * 0.18;
      return dseg * 0.72 + endPenalty + sideBias;
    }
    if (part.role === 'hand') {
      const handPenalty = dist({ x, y }, b) * 0.42;
      return dseg * 0.55 + handPenalty + sideBias;
    }
    if (part.role === 'thigh') {
      const hipPenalty = dist({ x, y }, a) * 0.16;
      return dseg * 0.74 + hipPenalty + sideBias;
    }
    if (part.role === 'shin') {
      const footPenalty = dist({ x, y }, b) * 0.18;
      return dseg * 0.72 + footPenalty + sideBias;
    }
    if (part.role === 'foot') {
      const footPenalty = dist({ x, y }, b) * 0.40;
      return dseg * 0.58 + footPenalty + sideBias;
    }
    return dseg;
  }

  function generateSmartSplit() {
    if (!state.sourcePixels) ensureSourcePixels();
    if (!state.sourcePixels) return;
    const { data, width: w, height: h } = state.sourcePixels;
    const rest = state.rest;
    if (!rest.pelvis) return;

    const alphaThreshold = 6;
    const imgData = Object.fromEntries(state.parts.map((p) => [p.id, new Uint8ClampedArray(w * h)]));
    const opaque = [];
    for (let i = 0; i < w * h; i++) {
      if (data[i * 4 + 3] > alphaThreshold) opaque.push(i);
    }

    for (const idx of opaque) {
      const x = idx % w;
      const y = (idx / w) | 0;
      let best = null;
      let bestScore = Infinity;
      for (const part of state.parts) {
        const s = scorePartPixel(x, y, part, rest);
        if (s < bestScore) {
          bestScore = s;
          best = part;
        }
      }
      if (best) imgData[best.id][idx] = 255;
    }

    for (const part of state.parts) {
      const mask = part.maskCanvas;
      mask.width = w;
      mask.height = h;
      part.maskCtx = mask.getContext('2d');
      part.maskCtx.clearRect(0, 0, w, h);
      const out = part.maskCtx.createImageData(w, h);
      const src = imgData[part.id];
      for (let i = 0; i < src.length; i++) {
        out.data[i * 4 + 3] = src[i];
      }
      part.maskCtx.putImageData(out, 0, 0);
      markPartDirty(part);
      rebuildPartLayer(part);
    }
    redraw();
  }

  function solveAffineFromThree(srcPts, dstPts) {
    const [p0, p1, p2] = srcPts;
    const [q0, q1, q2] = dstPts;
    const det = p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y);
    if (Math.abs(det) < 1e-9) return null;
    const inv = (a00, a01, a02, a10, a11, a12, a20, a21, a22) => [a00, a01, a02, a10, a11, a12, a20, a21, a22];
    const m00 = (p1.y - p2.y) / det;
    const m01 = (p2.x - p1.x) / det;
    const m02 = (p1.x * p2.y - p2.x * p1.y) / det;
    const m10 = (p2.y - p0.y) / det;
    const m11 = (p0.x - p2.x) / det;
    const m12 = (p2.x * p0.y - p0.x * p2.y) / det;
    const m20 = (p0.y - p1.y) / det;
    const m21 = (p1.x - p0.x) / det;
    const m22 = (p0.x * p1.y - p1.x * p0.y) / det;
    return {
      a: q0.x * m00 + q1.x * m10 + q2.x * m20,
      c: q0.x * m01 + q1.x * m11 + q2.x * m21,
      e: q0.x * m02 + q1.x * m12 + q2.x * m22,
      b: q0.y * m00 + q1.y * m10 + q2.y * m20,
      d: q0.y * m01 + q1.y * m11 + q2.y * m21,
      f: q0.y * m02 + q1.y * m12 + q2.y * m22,
    };
  }

  function affineFromSegmentWithHelper(restA, restB, poseA, poseB, helperScale = 0.28) {
    const dx = restB.x - restA.x;
    const dy = restB.y - restA.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const restC = { x: restA.x + nx * len * helperScale, y: restA.y + ny * len * helperScale };

    const pdx = poseB.x - poseA.x;
    const pdy = poseB.y - poseA.y;
    const plen = Math.hypot(pdx, pdy) || 1;
    const pnx = -pdy / plen;
    const pny = pdx / plen;
    const poseC = { x: poseA.x + pnx * plen * helperScale, y: poseA.y + pny * plen * helperScale };

    return solveAffineFromThree([restA, restB, restC], [poseA, poseB, poseC]);
  }

  function poseAt(timeSec) {
    const r = state.rest;
    if (!r.pelvis) return null;
    const t = (timeSec * state.speed) % 1;
    const cycle = t * Math.PI * 2;
    const f = state.facing;

    const root = {
      x: r.pelvis.x + Math.sin(cycle) * state.params.sway * state.artW * f,
      y: r.pelvis.y + Math.max(0, Math.sin(cycle * 2)) * state.params.bounce * state.artH,
    };
    const lean = Math.sin(cycle) * state.params.lean * f;

    const torso = {
      pelvis: copy(root),
      chest: rotateAround(r.chest, r.pelvis, lean),
      neck: rotateAround(r.neck, r.pelvis, lean * 0.60),
      head: rotateAround(r.head, r.pelvis, lean * 0.28),
      lShoulder: rotateAround(r.lShoulder, r.pelvis, lean * 0.70),
      rShoulder: rotateAround(r.rShoulder, r.pelvis, lean * 0.70),
      lHip: rotateAround(r.lHip, r.pelvis, lean * 0.16),
      rHip: rotateAround(r.rHip, r.pelvis, lean * 0.16),
    };

    const frontSide = f > 0 ? 'left' : 'right';
    const backSide = frontSide === 'left' ? 'right' : 'left';

    const stride = state.params.stride * state.artW;
    const lift = state.params.lift * state.artH;
    const armSwing = state.params.armSwing * stride * 0.72;

    const footTarget = (side, phaseOffset) => {
      const phase = (t + phaseOffset) % 1;
      const swing = phase >= 0.5;
      const u = swing ? (phase - 0.5) / 0.5 : phase / 0.5;
      const joint = side === 'left' ? r.lFoot : r.rFoot;
      const baseX = joint.x;
      const baseY = joint.y;
      if (!swing) return { x: baseX, y: baseY };
      const travel = lerp(-0.45, 0.45, u);
      return { x: baseX + f * stride * travel, y: baseY - lift * Math.sin(u * Math.PI) };
    };

    const handTarget = (side, phaseOffset) => {
      const phase = (t + phaseOffset) % 1;
      const s = Math.sin(phase * Math.PI * 2);
      const liftY = Math.max(0, Math.sin((phase * Math.PI * 2) + Math.PI / 2));
      const joint = side === 'left' ? r.lHand : r.rHand;
      return {
        x: joint.x + f * armSwing * s,
        y: joint.y + state.artH * 0.03 * Math.sin((phase * Math.PI * 2) + Math.PI * 0.2) - state.artH * 0.02 * liftY,
      };
    };

    const bendFor = (side, isArm) => {
      const isFront = side === frontSide;
      const sign = isFront ? 1 : -1;
      return isArm ? -f * sign : f * sign;
    };

    const frontFoot = footTarget(frontSide, 0);
    const backFoot = footTarget(backSide, 0.5);
    const frontHand = handTarget(frontSide, 0.5);
    const backHand = handTarget(backSide, 0);

    const lLegTarget = frontSide === 'left' ? frontFoot : backFoot;
    const rLegTarget = frontSide === 'right' ? frontFoot : backFoot;
    const lArmTarget = frontSide === 'left' ? frontHand : backHand;
    const rArmTarget = frontSide === 'right' ? frontHand : backHand;

    const leftLeg = solve2Bone(torso.lHip, lLegTarget, dist(r.lHip, r.lKnee), dist(r.lKnee, r.lFoot), bendFor('left', false));
    const rightLeg = solve2Bone(torso.rHip, rLegTarget, dist(r.rHip, r.rKnee), dist(r.rKnee, r.rFoot), bendFor('right', false));
    const leftArm = solve2Bone(torso.lShoulder, lArmTarget, dist(r.lShoulder, r.lElbow), dist(r.lElbow, r.lHand), bendFor('left', true));
    const rightArm = solve2Bone(torso.rShoulder, rArmTarget, dist(r.rShoulder, r.rElbow), dist(r.rElbow, r.rHand), bendFor('right', true));

    return {
      pelvis: torso.pelvis,
      chest: torso.chest,
      neck: torso.neck,
      head: torso.head,
      lShoulder: torso.lShoulder,
      rShoulder: torso.rShoulder,
      lHip: torso.lHip,
      rHip: torso.rHip,
      lElbow: leftArm.mid,
      lHand: leftArm.end,
      rElbow: rightArm.mid,
      rHand: rightArm.end,
      lKnee: leftLeg.mid,
      lFoot: leftLeg.end,
      rKnee: rightLeg.mid,
      rFoot: rightLeg.end,
      walkPhase: t,
    };
  }

  function rotateAround(pt, origin, angle) {
    const dx = pt.x - origin.x;
    const dy = pt.y - origin.y;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
      x: origin.x + dx * c - dy * s,
      y: origin.y + dx * s + dy * c,
    };
  }

  function solve2Bone(root, target, len1, len2, bendSign) {
    let dx = target.x - root.x;
    let dy = target.y - root.y;
    let d = Math.hypot(dx, dy);
    const minD = Math.abs(len1 - len2) + 0.001;
    const maxD = len1 + len2 - 0.001;
    d = clamp(d, minD, maxD);
    const base = Math.atan2(dy, dx);
    const cosA = clamp((len1 * len1 + d * d - len2 * len2) / (2 * len1 * d), -1, 1);
    const ang = base + bendSign * Math.acos(cosA);
    const mid = { x: root.x + Math.cos(ang) * len1, y: root.y + Math.sin(ang) * len1 };
    const end = { x: root.x + Math.cos(base) * d, y: root.y + Math.sin(base) * d };
    return { mid, end };
  }

  function partLayerOrder(part) {
    let z = Number(part.z) || 0;
    const frontSide = state.facing > 0 ? 'left' : 'right';
    if (part.side === frontSide) z += 25;
    if (part.side !== 'center' && part.side !== frontSide) z -= 5;
    if (part.role === 'head' || part.role === 'hair' || part.role === 'accessory') z += 80;
    if (part.role === 'hand' || part.role === 'foot') z += 5;
    return z;
  }

  function partTransform(part, pose) {
    const rest = state.rest;
    const ra = rest[part.a];
    const rb = rest[part.b];
    const rc = rest[part.c] || null;
    const pa = pose[part.a];
    const pb = pose[part.b];
    const pc = pose[part.c] || null;

    if (!ra || !rb || !pa || !pb) return null;

    let matrix = null;
    if (part.role === 'torso') {
      const altRest = rest.lShoulder || rb;
      const altPose = pose.lShoulder || pb;
      matrix = solveAffineFromThree([ra, rb, altRest], [pa, pb, altPose]);
    } else if (part.role === 'head' || part.role === 'hair' || part.role === 'accessory') {
      const altRest = rest.lShoulder || rb;
      const altPose = pose.lShoulder || pb;
      matrix = solveAffineFromThree([ra, rb, altRest], [pa, pb, altPose]);
    } else {
      matrix = affineFromSegmentWithHelper(ra, rb, pa, pb, 0.28);
      if (!matrix && rc && pc) matrix = solveAffineFromThree([ra, rb, rc], [pa, pb, pc]);
    }
    return matrix;
  }

  function multiplyAffine(m1, m2) {
    return {
      a: m1.a * m2.a + m1.c * m2.b,
      b: m1.b * m2.a + m1.d * m2.b,
      c: m1.a * m2.c + m1.c * m2.d,
      d: m1.b * m2.c + m1.d * m2.d,
      e: m1.a * m2.e + m1.c * m2.f + m1.e,
      f: m1.b * m2.e + m1.d * m2.f + m1.f,
    };
  }

  function partToPreviewMatrix(part, pose, view) {
    const m = partTransform(part, pose);
    if (!m || !part.layerCanvas || part.layerCanvas.width < 1 || part.layerCanvas.height < 1) return null;
    const translate = { a:1, b:0, c:0, d:1, e:part.layerOffset.x, f:part.layerOffset.y };
    const sourceToPose = m;
    const withOffset = multiplyAffine(sourceToPose, translate);
    return {
      a: withOffset.a * view.scale,
      b: withOffset.b * view.scale,
      c: withOffset.c * view.scale,
      d: withOffset.d * view.scale,
      e: view.x0 + withOffset.e * view.scale,
      f: view.y0 + withOffset.f * view.scale,
    };
  }

  function partNamesFromSelection() {
    return state.parts.map((p) => ({ id: p.id, label: p.label }));
  }

  function drawTintedMask(ctx, maskCanvas, color, x, y, w, h, alpha = 0.25) {
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const t = tmp.getContext('2d');
    t.drawImage(maskCanvas, x, y, w, h, 0, 0, w, h);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = color;
    t.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(tmp, x, y, w, h);
    ctx.restore();
  }

  function renderSource() {
    resizeCanvas(sourceCanvas, sCtx);
    sCtx.setTransform(1, 0, 0, 1, 0, 0);
    sCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);

    if (!state.artW || !state.artH) {
      sCtx.fillStyle = 'rgba(255,255,255,.55)';
      sCtx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      sCtx.fillText('Import an image to begin.', 20, 30);
      return;
    }

    const { x0, y0, scale, drawW, drawH, rect } = sourceViewRect();
    sCtx.imageSmoothingEnabled = true;
    sCtx.drawImage(offscreen, x0, y0, drawW, drawH);

    if (state.showMask) {
      for (const part of state.parts) {
        if (!part.visible) continue;
        if (part.maskCanvas.width !== state.artW || part.maskCanvas.height !== state.artH) continue;
        drawTintedMask(sCtx, part.maskCanvas, part.color, x0, y0, drawW, drawH, part.id === state.currentPartId ? 0.35 : 0.15);
      }
    }

    if (state.selectionStroke && state.selectionStroke.length > 1) {
      sCtx.save();
      sCtx.strokeStyle = 'rgba(255,255,255,.95)';
      sCtx.lineWidth = 2;
      sCtx.setLineDash([6, 6]);
      sCtx.beginPath();
      const p0 = toSourceScreen(state.selectionStroke[0]);
      sCtx.moveTo(p0.x, p0.y);
      for (let i = 1; i < state.selectionStroke.length; i++) {
        const p = toSourceScreen(state.selectionStroke[i]);
        sCtx.lineTo(p.x, p.y);
      }
      sCtx.stroke();
      sCtx.restore();
    }

    if (state.showRig) {
      sCtx.save();
      sCtx.lineWidth = 1.5;
      sCtx.strokeStyle = 'rgba(124,196,255,.75)';
      sCtx.fillStyle = 'rgba(124,196,255,.25)';
      const pose = state.pose || state.rest;
      for (const [a, b] of [
        ['pelvis','chest'],['chest','neck'],['neck','head'],
        ['chest','lShoulder'],['lShoulder','lElbow'],['lElbow','lHand'],
        ['chest','rShoulder'],['rShoulder','rElbow'],['rElbow','rHand'],
        ['pelvis','lHip'],['lHip','lKnee'],['lKnee','lFoot'],
        ['pelvis','rHip'],['rHip','rKnee'],['rKnee','rFoot'],
      ]) {
        if (!pose[a] || !pose[b]) continue;
        const pa = toSourceScreen(pose[a]);
        const pb = toSourceScreen(pose[b]);
        sCtx.beginPath();
        sCtx.moveTo(pa.x, pa.y);
        sCtx.lineTo(pb.x, pb.y);
        sCtx.stroke();
      }
      for (const j of JOINTS) {
        const p = pose[j] || state.rest[j];
        if (!p) continue;
        const sp = toSourceScreen(p);
        sCtx.beginPath();
        sCtx.arc(sp.x, sp.y, 5.5, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.strokeStyle = 'rgba(255,255,255,.5)';
        sCtx.stroke();
        sCtx.fillStyle = 'rgba(255,255,255,.95)';
        sCtx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        sCtx.fillText(j, sp.x + 8, sp.y - 7);
        sCtx.fillStyle = 'rgba(124,196,255,.25)';
        sCtx.strokeStyle = 'rgba(124,196,255,.75)';
      }
      sCtx.restore();
    }
  }

  function drawFloorLine(ctx, rect) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    const y = rect.height * 0.82;
    ctx.moveTo(0, y);
    ctx.lineTo(rect.width, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawPreview() {
    resizeCanvas(previewCanvas, pCtx);
    pCtx.setTransform(1, 0, 0, 1, 0, 0);
    pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    const rect = previewCanvas.getBoundingClientRect();
    drawFloorLine(pCtx, rect);

    if (!state.artW || !state.artH || !state.pose) {
      pCtx.fillStyle = 'rgba(255,255,255,.55)';
      pCtx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      pCtx.fillText('Import a sprite to begin.', 20, 30);
      return;
    }

    const view = previewViewRect();
    const pose = state.pose;
    const layers = state.parts
      .filter((p) => p.visible && p.layerCanvas && p.layerCanvas.width > 1 && p.layerCanvas.height > 1)
      .slice()
      .sort((a, b) => partLayerOrder(a) - partLayerOrder(b));

    // Draw shadow beneath the body.
    const feet = ['lFoot', 'rFoot'].map((j) => pose[j]).filter(Boolean);
    if (feet.length) {
      const avgX = feet.reduce((sum, p) => sum + p.x, 0) / feet.length;
      const maxY = Math.max(...feet.map((p) => p.y));
      const sx = view.x0 + avgX * view.scale;
      const sy = rect.height * 0.82 + (maxY / state.artH - 0.86) * 18;
      pCtx.save();
      pCtx.globalAlpha = 0.22;
      pCtx.fillStyle = '#000';
      pCtx.beginPath();
      pCtx.ellipse(sx, sy, rect.width * 0.12, rect.height * 0.025, 0, 0, Math.PI * 2);
      pCtx.fill();
      pCtx.restore();
    }

    for (const part of layers) {
      const m = partToPreviewMatrix(part, pose, view);
      if (!m) continue;
      pCtx.save();
      pCtx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      pCtx.imageSmoothingEnabled = true;
      pCtx.drawImage(part.layerCanvas, 0, 0);
      pCtx.restore();
    }

    if (state.showRig) {
      pCtx.save();
      pCtx.strokeStyle = 'rgba(255,255,255,.14)';
      pCtx.fillStyle = 'rgba(255,255,255,.6)';
      pCtx.lineWidth = 1;
      const bones = [
        ['pelvis','chest'],['chest','neck'],['neck','head'],
        ['chest','lShoulder'],['lShoulder','lElbow'],['lElbow','lHand'],
        ['chest','rShoulder'],['rShoulder','rElbow'],['rElbow','rHand'],
        ['pelvis','lHip'],['lHip','lKnee'],['lKnee','lFoot'],
        ['pelvis','rHip'],['rHip','rKnee'],['rKnee','rFoot']
      ];
      for (const [a, b] of bones) {
        if (!pose[a] || !pose[b]) continue;
        const pa = { x: view.x0 + pose[a].x * view.scale, y: view.y0 + pose[a].y * view.scale };
        const pb = { x: view.x0 + pose[b].x * view.scale, y: view.y0 + pose[b].y * view.scale };
        pCtx.beginPath();
        pCtx.moveTo(pa.x, pa.y);
        pCtx.lineTo(pb.x, pb.y);
        pCtx.stroke();
      }
      for (const j of JOINTS) {
        if (!pose[j]) continue;
        const p = { x: view.x0 + pose[j].x * view.scale, y: view.y0 + pose[j].y * view.scale };
        pCtx.beginPath();
        pCtx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        pCtx.fill();
      }
      pCtx.restore();
    }
  }

  function redraw() {
    if (state.artW && state.artH && !state.pose && Object.keys(state.rest).length) {
      state.pose = JSON.parse(JSON.stringify(state.rest));
    }
    renderSource();
    drawPreview();
  }

  function jointHitTest(screenPt) {
    const pose = state.pose || state.rest;
    let best = null;
    let bestD = 1e9;
    for (const j of JOINTS) {
      const p = pose[j] || state.rest[j];
      if (!p) continue;
      const sp = toSourceScreen(p);
      const d = Math.hypot(screenPt.x - sp.x, screenPt.y - sp.y);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    return bestD <= 16 ? best : null;
  }

  function updatePoseFromRest() {
    state.pose = poseAt(state.time) || JSON.parse(JSON.stringify(state.rest || {}));
    redraw();
  }

  function beginLasso(screenPt) {
    state.selectionStroke = [fromSourceScreen(screenPt)];
    redraw();
  }

  function finishLasso(mode) {
    if (!state.selectionStroke || state.selectionStroke.length < 3) {
      state.selectionStroke = null;
      redraw();
      return;
    }
    const mask = polygonMask(state.selectionStroke);
    applyMaskOperation(currentPart(), mask, mode);
    state.selectionStroke = null;
    redraw();
  }

  function partWorkMode() {
    return $('toolSelect').value;
  }

  function pointerPos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  sourceCanvas.addEventListener('pointerdown', (e) => {
    if (!state.artW) return;
    sourceCanvas.setPointerCapture(e.pointerId);
    const pt = pointerPos(sourceCanvas, e);
    const tool = partWorkMode();
    if (tool === 'move') {
      const hit = jointHitTest(pt);
      if (hit) {
        state.drag = { type: 'joint', id: hit, pid: e.pointerId };
      } else {
        state.drag = { type: 'pan', pid: e.pointerId, start: pt, panX: state.view.panX, panY: state.view.panY };
      }
      return;
    }
    if (tool === 'wand' || tool === 'erase') {
      const sel = floodFillMask(pt);
      if (sel) applyMaskOperation(currentPart(), sel, tool === 'erase' ? 'erase' : 'add');
      state.selectionStroke = null;
      return;
    }
    if (tool === 'lasso') {
      beginLasso(pt);
      state.drag = { type: 'lasso', pid: e.pointerId };
    }
  });

  sourceCanvas.addEventListener('pointermove', (e) => {
    if (!state.drag || state.drag.pid !== e.pointerId) return;
    const pt = pointerPos(sourceCanvas, e);
    if (state.drag.type === 'joint') {
      const imgPt = fromSourceScreen(pt);
      const name = state.drag.id;
      const target = state.rest[name] || { x: 0, y: 0 };
      target.x = clamp(imgPt.x, 0, state.artW);
      target.y = clamp(imgPt.y, 0, state.artH);
      state.rest[name] = target;
      state.pose = poseAt(state.time) || JSON.parse(JSON.stringify(state.rest));
      rebuildAllPartLayers();
      redraw();
      return;
    }
    if (state.drag.type === 'pan') {
      state.view.panX = state.drag.panX + (pt.x - state.drag.start.x);
      state.view.panY = state.drag.panY + (pt.y - state.drag.start.y);
      redraw();
      return;
    }
    if (state.drag.type === 'lasso') {
      maybeAddPoint(state.selectionStroke, fromSourceScreen(pt));
      redraw();
    }
  });

  sourceCanvas.addEventListener('pointerup', (e) => {
    if (state.drag && state.drag.pid === e.pointerId) {
      if (state.drag.type === 'lasso') {
        finishLasso(partWorkMode() === 'erase' ? 'erase' : 'add');
      }
      state.drag = null;
      try { sourceCanvas.releasePointerCapture(e.pointerId); } catch { }
    }
  });
  sourceCanvas.addEventListener('pointercancel', () => { state.drag = null; state.selectionStroke = null; });

  sourceCanvas.addEventListener('wheel', (e) => {
    if (!state.artW) return;
    e.preventDefault();
    const pt = pointerPos(sourceCanvas, e);
    const before = fromSourceScreen(pt);
    const factor = Math.exp(-e.deltaY * 0.0015);
    state.view.zoom = clamp(state.view.zoom * factor, 0.2, 6.5);
    const after = toSourceScreen(before);
    state.view.panX += pt.x - after.x;
    state.view.panY += pt.y - after.y;
    redraw();
  }, { passive: false });

  $('fileInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      loadImageFromSource(img);
    };
    img.src = url;
  });

  $('demoBtn').addEventListener('click', () => {
    const demo = document.createElement('canvas');
    demo.width = 720;
    demo.height = 880;
    const d = demo.getContext('2d');
    d.clearRect(0, 0, demo.width, demo.height);
    const g = d.createLinearGradient(220, 50, 580, 820);
    g.addColorStop(0, '#67e8a0');
    g.addColorStop(1, '#7cc4ff');
    d.fillStyle = g;
    d.beginPath();
    d.arc(360, 150, 68, 0, Math.PI * 2);
    d.fill();
    d.fillRect(304, 220, 112, 275);
    d.fillRect(264, 255, 36, 210);
    d.fillRect(420, 255, 36, 210);
    d.fillRect(300, 490, 48, 210);
    d.fillRect(372, 490, 48, 210);
    d.fillRect(282, 695, 68, 110);
    d.fillRect(388, 695, 68, 110);
    loadImageFromSource(demo);
  });

  $('smartSplitBtn').addEventListener('click', () => {
    generateSmartSplit();
    redraw();
  });

  $('fitBtn').addEventListener('click', fitSource);

  $('resetBtn').addEventListener('click', () => {
    state.time = 0;
    updatePoseFromRest();
  });

  $('playBtn').addEventListener('click', () => {
    state.play = !state.play;
    $('playBtn').textContent = state.play ? 'Pause' : 'Play';
    setBadge(state.play ? 'Playing' : 'Paused');
  });

  $('facingSelect').addEventListener('change', (e) => {
    state.facing = Number(e.target.value) || 1;
    autoRig();
  });
  $('speedRange').addEventListener('input', (e) => { state.speed = Number(e.target.value); });
  $('strideRange').addEventListener('input', (e) => { state.params.stride = Number(e.target.value); });
  $('liftRange').addEventListener('input', (e) => { state.params.lift = Number(e.target.value); });
  $('bounceRange').addEventListener('input', (e) => { state.params.bounce = Number(e.target.value); });
  $('leanRange').addEventListener('input', (e) => { state.params.lean = Number(e.target.value); });
  $('armRange').addEventListener('input', (e) => { state.params.armSwing = Number(e.target.value); });
  $('wandRange').addEventListener('input', (e) => { state.wandTol = Number(e.target.value); });
  $('featherRange').addEventListener('input', (e) => { state.feather = Number(e.target.value); rebuildAllPartLayers(); redraw(); });
  $('showMaskToggle').addEventListener('change', (e) => { state.showMask = e.target.checked; redraw(); });
  $('showRigToggle').addEventListener('change', (e) => { state.showRig = e.target.checked; redraw(); });

  $('partSelect').addEventListener('change', (e) => { state.currentPartId = e.target.value; refreshPartFields(); redraw(); });
  $('addPartBtn').addEventListener('click', addCustomPart);
  $('removePartBtn').addEventListener('click', removeCurrentPart);
  $('partNameInput').addEventListener('change', updatePartFromUI);
  $('attachASelect').addEventListener('change', updatePartFromUI);
  $('attachBSelect').addEventListener('change', updatePartFromUI);
  $('attachCSelect').addEventListener('change', updatePartFromUI);
  $('layerInput').addEventListener('change', updatePartFromUI);
  $('toolSelect').addEventListener('change', () => {
    state.selectionStroke = null;
    redraw();
  });
  $('clearMaskBtn').addEventListener('click', () => clearMask(currentPart()));

  window.addEventListener('resize', () => redraw());

  function tick(ts) {
    const dt = Math.min(0.05, (ts - state.lastTS) / 1000);
    state.lastTS = ts;
    if (state.play && state.artW) {
      state.time = (state.time + dt) % 1;
      state.pose = poseAt(state.time) || state.pose;
      redraw();
      previewBadge.textContent = `Playing ${Math.round(state.time * 100)}%`;
    }
    requestAnimationFrame(tick);
  }

  function boot() {
    initParts();
    const demo = document.createElement('canvas');
    demo.width = 720;
    demo.height = 880;
    const d = demo.getContext('2d');
    const g = d.createLinearGradient(220, 50, 580, 820);
    g.addColorStop(0, '#67e8a0');
    g.addColorStop(1, '#7cc4ff');
    d.fillStyle = g;
    d.beginPath();
    d.arc(360, 150, 68, 0, Math.PI * 2);
    d.fill();
    d.fillRect(304, 220, 112, 275);
    d.fillRect(264, 255, 36, 210);
    d.fillRect(420, 255, 36, 210);
    d.fillRect(300, 490, 48, 210);
    d.fillRect(372, 490, 48, 210);
    d.fillRect(282, 695, 68, 110);
    d.fillRect(388, 695, 68, 110);
    loadImageFromSource(demo);
    redraw();
    requestAnimationFrame(tick);
  }

  boot();
})();
