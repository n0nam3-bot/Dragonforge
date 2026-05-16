(() => {
  const $ = (id) => document.getElementById(id);

  const sourceCanvas = $('sourceCanvas');
  const previewCanvas = $('previewCanvas');
  const sCtx = sourceCanvas.getContext('2d');
  const pCtx = previewCanvas.getContext('2d');
  const sourceBadge = $('sourceBadge');
  const previewBadge = $('previewBadge');

  const ui = {
    fileInput: $('fileInput'),
    demoBtn: $('demoBtn'),
    autoMaskBtn: $('autoMaskBtn'),
    autoRigBtn: $('autoRigBtn'),
    fitBtn: $('fitBtn'),
    resetBtn: $('resetBtn'),
    playBtn: $('playBtn'),
    facingSelect: $('facingSelect'),
    toolSelect: $('toolSelect'),
    maskModeSelect: $('maskModeSelect'),
    wandRange: $('wandRange'),
    featherRange: $('featherRange'),
    zoomRange: $('zoomRange'),
    speedRange: $('speedRange'),
    strideRange: $('strideRange'),
    bounceRange: $('bounceRange'),
    leanRange: $('leanRange'),
    armRange: $('armRange'),
    showMaskToggle: $('showMaskToggle'),
    showRigToggle: $('showRigToggle'),
  };

  const artCanvas = document.createElement('canvas');
  const artCtx = artCanvas.getContext('2d', { willReadFrequently: true });
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  const softMaskCanvas = document.createElement('canvas');
  const softMaskCtx = softMaskCanvas.getContext('2d');
  const cutoutCanvas = document.createElement('canvas');
  const cutoutCtx = cutoutCanvas.getContext('2d');
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  const TAU = Math.PI * 2;
  const MAX_IMPORT_DIM = 980;
  const JOINT_NAMES = [
    'pelvis', 'chest', 'neck', 'head',
    'lShoulder', 'lElbow', 'lHand',
    'rShoulder', 'rElbow', 'rHand',
    'lHip', 'lKnee', 'lFoot',
    'rHip', 'rKnee', 'rFoot',
  ];
  const BONE_DEFS = [
    { name: 'spine', a: 'pelvis', b: 'chest', group: 'torso' },
    { name: 'neck', a: 'chest', b: 'neck', group: 'torso' },
    { name: 'head', a: 'neck', b: 'head', group: 'head' },
    { name: 'lUpperArm', a: 'lShoulder', b: 'lElbow', group: 'armL' },
    { name: 'lLowerArm', a: 'lElbow', b: 'lHand', group: 'armL' },
    { name: 'rUpperArm', a: 'rShoulder', b: 'rElbow', group: 'armR' },
    { name: 'rLowerArm', a: 'rElbow', b: 'rHand', group: 'armR' },
    { name: 'lThigh', a: 'lHip', b: 'lKnee', group: 'legL' },
    { name: 'lShin', a: 'lKnee', b: 'lFoot', group: 'legL' },
    { name: 'rThigh', a: 'rHip', b: 'rKnee', group: 'legR' },
    { name: 'rShin', a: 'rKnee', b: 'rFoot', group: 'legR' },
  ];

  const state = {
    artW: 0,
    artH: 0,
    imageLoaded: false,
    playing: true,
    phase: 0,
    lastTS: 0,
    facing: 1,
    tool: 'joints',
    maskMode: 'add',
    wandTol: 30,
    feather: 1.5,
    speed: 1,
    stride: 0.12,
    bounce: 0.022,
    lean: 0.10,
    armSwing: 1.0,
    showMask: true,
    showRig: true,
    sourceFit: 1,
    sourceZoom: 1,
    sourcePanX: 0,
    sourcePanY: 0,
    isPanning: false,
    dragJoint: null,
    dragOffset: { x: 0, y: 0 },
    lasso: [],
    drawingLasso: false,
    maskBits: null,
    geometry: [],
    vertices: [],
    bones: [],
    restJoints: {},
    poseJoints: {},
    sourceNeedsRedraw: true,
    previewNeedsRedraw: true,
    cutoutDirty: true,
    maskDirty: true,
    sourceBounds: null,
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const len2 = (x, y) => Math.hypot(x, y);
  const point = (x, y) => ({ x, y });
  const clonePoint = (p) => ({ x: p.x, y: p.y });
  const TA = (deg) => deg * Math.PI / 180;

  function resizeDisplayCanvas(canvas, ctx) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: r.width, h: r.height, dpr };
  }

  function fitSourceToCanvas() {
    if (!state.artW || !state.artH) return;
    const r = sourceCanvas.getBoundingClientRect();
    state.sourceFit = Math.min(r.width / state.artW, r.height / state.artH) * 0.94;
    state.sourceZoom = 1;
    state.sourcePanX = 0;
    state.sourcePanY = 0;
    ui.zoomRange.value = '1';
    state.sourceNeedsRedraw = true;
  }

  function sourceLayout() {
    const r = sourceCanvas.getBoundingClientRect();
    const scale = state.sourceFit * state.sourceZoom;
    const w = state.artW * scale;
    const h = state.artH * scale;
    const x = r.width / 2 - w / 2 + state.sourcePanX;
    const y = r.height / 2 - h / 2 + state.sourcePanY;
    return { r, scale, x, y, w, h };
  }

  function previewLayout() {
    const r = previewCanvas.getBoundingClientRect();
    const scale = Math.min(r.width / (state.artW || 1), r.height / (state.artH || 1)) * 0.90;
    const w = state.artW * scale;
    const h = state.artH * scale;
    const x = r.width / 2 - w / 2;
    const y = r.height * 0.83 - h;
    return { r, scale, x, y, w, h };
  }

  function artToScreen(pt, layout = sourceLayout()) {
    return { x: layout.x + pt.x * layout.scale, y: layout.y + pt.y * layout.scale };
  }

  function screenToArt(pt, layout = sourceLayout()) {
    return { x: (pt.x - layout.x) / layout.scale, y: (pt.y - layout.y) / layout.scale };
  }

  function screenToPreviewArt(pt, layout = previewLayout()) {
    return { x: (pt.x - layout.x) / layout.scale, y: (pt.y - layout.y) / layout.scale };
  }

  function setStatus(text) {
    sourceBadge.textContent = text;
  }

  function defaultJointsFromBounds(bounds) {
    const f = state.facing;
    const cx = bounds.x + bounds.w * 0.52;
    const top = bounds.y;
    const bottom = bounds.y + bounds.h;
    const shoulderY = top + bounds.h * 0.32;
    const neckY = top + bounds.h * 0.24;
    const headY = top + bounds.h * 0.11;
    const pelvisY = top + bounds.h * 0.57;
    const kneeY = top + bounds.h * 0.78;
    const footY = bottom - bounds.h * 0.02;
    const shoulderSpan = bounds.w * 0.17;
    const hipSpan = bounds.w * 0.14;
    const armBend = bounds.w * 0.10;
    const legBend = bounds.w * 0.06;

    return {
      pelvis: point(cx + f * bounds.w * 0.00, pelvisY),
      chest: point(cx + f * bounds.w * 0.02, shoulderY),
      neck: point(cx + f * bounds.w * 0.02, neckY),
      head: point(cx + f * bounds.w * 0.03, headY),

      lShoulder: point(cx - shoulderSpan * 0.55 - f * armBend * 0.30, shoulderY),
      lElbow: point(cx - shoulderSpan * 0.78 - f * armBend * 0.80, top + bounds.h * 0.47),
      lHand: point(cx - shoulderSpan * 0.95 - f * armBend * 1.20, top + bounds.h * 0.60),

      rShoulder: point(cx + shoulderSpan * 0.55 + f * armBend * 0.30, shoulderY),
      rElbow: point(cx + shoulderSpan * 0.78 + f * armBend * 0.80, top + bounds.h * 0.47),
      rHand: point(cx + shoulderSpan * 0.95 + f * armBend * 1.20, top + bounds.h * 0.60),

      lHip: point(cx - hipSpan * 0.48 - f * legBend * 0.15, pelvisY),
      lKnee: point(cx - hipSpan * 0.55 + f * legBend * 0.20, kneeY),
      lFoot: point(cx - hipSpan * 0.50 + f * legBend * 0.24, footY),

      rHip: point(cx + hipSpan * 0.48 + f * legBend * 0.15, pelvisY),
      rKnee: point(cx + hipSpan * 0.55 + f * legBend * 0.20, kneeY),
      rFoot: point(cx + hipSpan * 0.50 + f * legBend * 0.24, footY),
    };
  }

  function cloneJoints(src) {
    const out = {};
    for (const name of JOINT_NAMES) out[name] = clonePoint(src[name]);
    return out;
  }

  function setJoints(newJoints) {
    state.restJoints = cloneJoints(newJoints);
    state.poseJoints = cloneJoints(newJoints);
    rebuildBones();
    buildMesh();
    state.sourceNeedsRedraw = true;
    state.previewNeedsRedraw = true;
  }

  function rebuildBones() {
    if (!state.restJoints.pelvis) return;
    state.bones = BONE_DEFS.map((def) => {
      const a = state.restJoints[def.a];
      const b = state.restJoints[def.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return {
        name: def.name,
        a: def.a,
        b: def.b,
        group: def.group,
        restA: clonePoint(a),
        restB: clonePoint(b),
        restLen: Math.max(1, Math.hypot(dx, dy)),
        restAngle: Math.atan2(dy, dx),
        sigma: Math.max(12, Math.hypot(dx, dy) * 0.70),
      };
    });
    computeVertexWeights();
  }

  function getMaskAlphaAt(x, y) {
    if (!state.maskBits || x < 0 || y < 0 || x >= state.artW || y >= state.artH) return 0;
    return state.maskBits[(y | 0) * state.artW + (x | 0)] ? 255 : 0;
  }

  function syncMaskBits() {
    if (!state.artW || !state.artH) return;
    const data = maskCtx.getImageData(0, 0, state.artW, state.artH).data;
    state.maskBits = new Uint8Array(state.artW * state.artH);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      state.maskBits[p] = data[i + 3] > 20 ? 1 : 0;
    }
    state.maskDirty = false;
  }

  function writeMaskBits(bits) {
    const img = maskCtx.createImageData(state.artW, state.artH);
    for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
      if (bits[p]) {
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    maskCtx.putImageData(img, 0, 0);
    syncMaskBits();
    rebuildDerived();
  }

  function rebuildDerived() {
    if (!state.artW || !state.artH) return;
    buildCutout();
    buildMesh();
    state.sourceNeedsRedraw = true;
    state.previewNeedsRedraw = true;
  }

  function buildCutout() {
    if (!state.artW || !state.artH) return;
    softMaskCanvas.width = state.artW;
    softMaskCanvas.height = state.artH;
    cutoutCanvas.width = state.artW;
    cutoutCanvas.height = state.artH;
    tempCanvas.width = state.artW;
    tempCanvas.height = state.artH;

    softMaskCtx.clearRect(0, 0, state.artW, state.artH);
    softMaskCtx.save();
    softMaskCtx.filter = state.feather > 0 ? `blur(${state.feather}px)` : 'none';
    softMaskCtx.drawImage(maskCanvas, 0, 0);
    softMaskCtx.restore();

    cutoutCtx.clearRect(0, 0, state.artW, state.artH);
    cutoutCtx.drawImage(artCanvas, 0, 0);
    cutoutCtx.globalCompositeOperation = 'destination-in';
    cutoutCtx.drawImage(softMaskCanvas, 0, 0);
    cutoutCtx.globalCompositeOperation = 'source-over';
  }

  function bboxFromMask() {
    if (!state.maskBits || !state.maskBits.length) {
      return { x: 0, y: 0, w: state.artW, h: state.artH };
    }
    let minX = state.artW, minY = state.artH, maxX = -1, maxY = -1;
    for (let y = 0; y < state.artH; y++) {
      const row = y * state.artW;
      for (let x = 0; x < state.artW; x++) {
        if (!state.maskBits[row + x]) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) return { x: 0, y: 0, w: state.artW, h: state.artH };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function autoRigFromMask() {
    if (!state.artW || !state.artH) return;
    const bounds = bboxFromMask();
    state.sourceBounds = bounds;
    setJoints(defaultJointsFromBounds(bounds));
  }

  function autoMask() {
    if (!state.artW || !state.artH) return;
    const img = artCtx.getImageData(0, 0, state.artW, state.artH);
    const data = img.data;
    const pxCount = state.artW * state.artH;
    const out = new Uint8Array(pxCount);

    let alphaBorder = 0;
    const borderSamples = [];
    for (let x = 0; x < state.artW; x++) {
      borderSamples.push(samplePixel(data, x, 0));
      borderSamples.push(samplePixel(data, x, state.artH - 1));
    }
    for (let y = 0; y < state.artH; y++) {
      borderSamples.push(samplePixel(data, 0, y));
      borderSamples.push(samplePixel(data, state.artW - 1, y));
    }
    for (const s of borderSamples) if (s[3] < 12) alphaBorder++;

    if (alphaBorder / borderSamples.length > 0.5) {
      for (let i = 0; i < pxCount; i++) {
        out[i] = data[i * 4 + 3] > 16 ? 1 : 0;
      }
      writeMaskBits(out);
      autoRigFromMask();
      setStatus('Transparent background detected');
      return;
    }

    const bg = averageBorderColor(data);
    const visited = new Uint8Array(pxCount);
    const queue = new Uint32Array(pxCount);
    let head = 0;
    let tail = 0;
    const tol = 30 * 30;

    const pushIfBg = (x, y) => {
      if (x < 0 || y < 0 || x >= state.artW || y >= state.artH) return;
      const idx = y * state.artW + x;
      if (visited[idx]) return;
      const i = idx * 4;
      if (colorDistSq(data, i, bg) <= tol || data[i + 3] < 12) {
        visited[idx] = 1;
        queue[tail++] = idx;
      }
    };

    for (let x = 0; x < state.artW; x++) {
      pushIfBg(x, 0);
      pushIfBg(x, state.artH - 1);
    }
    for (let y = 0; y < state.artH; y++) {
      pushIfBg(0, y);
      pushIfBg(state.artW - 1, y);
    }

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % state.artW;
      const y = (idx / state.artW) | 0;
      const i = idx * 4;
      if (!(colorDistSq(data, i, bg) <= tol || data[i + 3] < 12)) continue;
      out[idx] = 0;
      const n1 = idx - 1;
      const n2 = idx + 1;
      const n3 = idx - state.artW;
      const n4 = idx + state.artW;
      if (x > 0 && !visited[n1]) { visited[n1] = 1; queue[tail++] = n1; }
      if (x < state.artW - 1 && !visited[n2]) { visited[n2] = 1; queue[tail++] = n2; }
      if (y > 0 && !visited[n3]) { visited[n3] = 1; queue[tail++] = n3; }
      if (y < state.artH - 1 && !visited[n4]) { visited[n4] = 1; queue[tail++] = n4; }
    }

    for (let i = 0; i < pxCount; i++) {
      out[i] = out[i] ? 1 : (data[i * 4 + 3] > 16 ? 1 : 0);
    }
    writeMaskBits(out);
    autoRigFromMask();
    setStatus('Auto mask applied');
  }

  function samplePixel(data, x, y) {
    const i = (y * state.artW + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }

  function averageBorderColor(data) {
    let r = 0, g = 0, b = 0, n = 0;
    const sample = (x, y) => {
      const i = (y * state.artW + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    };
    for (let x = 0; x < state.artW; x++) {
      sample(x, 0); sample(x, state.artH - 1);
    }
    for (let y = 0; y < state.artH; y++) {
      sample(0, y); sample(state.artW - 1, y);
    }
    return [r / n, g / n, b / n];
  }

  function colorDistSq(data, idx, rgb) {
    const dr = data[idx] - rgb[0];
    const dg = data[idx + 1] - rgb[1];
    const db = data[idx + 2] - rgb[2];
    return dr * dr + dg * dg + db * db;
  }

  function floodFillMask(seedX, seedY, tolerance, mode) {
    if (!state.artW || !state.artH) return;
    const img = artCtx.getImageData(0, 0, state.artW, state.artH);
    const data = img.data;
    const pxCount = state.artW * state.artH;
    const seedIdx = (seedY | 0) * state.artW + (seedX | 0);
    if (seedIdx < 0 || seedIdx >= pxCount) return;

    const si = seedIdx * 4;
    const target = [data[si], data[si + 1], data[si + 2], data[si + 3]];
    const visited = new Uint8Array(pxCount);
    const queue = new Uint32Array(pxCount);
    let head = 0;
    let tail = 0;
    const maxDist = tolerance * tolerance;

    const maskBits = state.maskBits ? state.maskBits.slice() : new Uint8Array(pxCount);
    const isMatch = (idx) => {
      const i = idx * 4;
      if (data[i + 3] < 8) return false;
      const dr = data[i] - target[0];
      const dg = data[i + 1] - target[1];
      const db = data[i + 2] - target[2];
      return dr * dr + dg * dg + db * db <= maxDist;
    };

    const enqueue = (idx) => {
      if (idx < 0 || idx >= pxCount || visited[idx]) return;
      visited[idx] = 1;
      queue[tail++] = idx;
    };

    enqueue(seedIdx);

    while (head < tail) {
      const idx = queue[head++];
      if (!isMatch(idx)) continue;
      if (mode === 'add') maskBits[idx] = 1; else maskBits[idx] = 0;
      const x = idx % state.artW;
      const y = (idx / state.artW) | 0;
      if (x > 0) enqueue(idx - 1);
      if (x < state.artW - 1) enqueue(idx + 1);
      if (y > 0) enqueue(idx - state.artW);
      if (y < state.artH - 1) enqueue(idx + state.artW);
    }

    writeMaskBits(maskBits);
    autoRigFromMask();
    setStatus(mode === 'add' ? 'Wand selection added' : 'Wand selection erased');
  }

  function applyLasso(points, mode) {
    if (!points || points.length < 3) return;
    const artPts = points.map((p) => screenToArt(p));
    maskCtx.save();
    maskCtx.beginPath();
    const first = artPts[0];
    maskCtx.moveTo(first.x, first.y);
    for (let i = 1; i < artPts.length; i++) maskCtx.lineTo(artPts[i].x, artPts[i].y);
    maskCtx.closePath();
    maskCtx.globalCompositeOperation = mode === 'subtract' ? 'destination-out' : 'source-over';
    maskCtx.fillStyle = 'white';
    maskCtx.fill();
    maskCtx.restore();
    syncMaskBits();
    autoRigFromMask();
    rebuildDerived();
    state.sourceNeedsRedraw = true;
    state.previewNeedsRedraw = true;
  }

  function buildMesh() {
    state.geometry = [];
    state.vertices = [];
    if (!state.artW || !state.artH || !state.maskBits) return;

    const spacing = clamp(Math.round(Math.max(14, Math.min(24, Math.max(state.artW, state.artH) / 44))), 14, 24);
    const cols = Math.ceil(state.artW / spacing);
    const rows = Math.ceil(state.artH / spacing);
    const vMap = new Map();

    const makeKey = (x, y) => `${x}|${y}`;
    const getV = (x, y) => {
      const k = makeKey(x, y);
      if (vMap.has(k)) return vMap.get(k);
      const idx = state.vertices.length;
      const v = { x, y, influences: null };
      state.vertices.push(v);
      vMap.set(k, idx);
      return idx;
    };

    const inside = (x, y) => {
      const ix = clamp(Math.round(x), 0, state.artW - 1);
      const iy = clamp(Math.round(y), 0, state.artH - 1);
      return state.maskBits[iy * state.artW + ix] === 1;
    };

    for (let j = 0; j < rows; j++) {
      const y0 = j * spacing;
      const y1 = j === rows - 1 ? state.artH - 1 : Math.min(state.artH - 1, (j + 1) * spacing);
      for (let i = 0; i < cols; i++) {
        const x0 = i * spacing;
        const x1 = i === cols - 1 ? state.artW - 1 : Math.min(state.artW - 1, (i + 1) * spacing);
        const cx = (x0 + x1) * 0.5;
        const cy = (y0 + y1) * 0.5;
        if (!(inside(x0, y0) || inside(x1, y0) || inside(x0, y1) || inside(x1, y1) || inside(cx, cy))) continue;
        const p00 = getV(x0, y0);
        const p10 = getV(x1, y0);
        const p01 = getV(x0, y1);
        const p11 = getV(x1, y1);
        state.geometry.push([p00, p10, p11]);
        state.geometry.push([p00, p11, p01]);
      }
    }
    computeVertexWeights();
  }

  function computeVertexWeights() {
    if (!state.vertices.length || !state.bones.length) return;
    for (const v of state.vertices) {
      const scores = [];
      for (let i = 0; i < state.bones.length; i++) {
        const b = state.bones[i];
        const d = distancePointToSegment(v, b.restA, b.restB);
        let weight = Math.exp(-(d * d) / (2 * b.sigma * b.sigma));
        const root = state.restJoints.pelvis || { x: 0, y: 0 };
        const chest = state.restJoints.chest || root;
        const neck = state.restJoints.neck || chest;
        if (b.group === 'head' && v.y > chest.y + 8) weight *= 0.15;
        if (b.group === 'torso' && v.y < neck.y - 18) weight *= 0.60;
        if (b.group === 'armL' && v.x > chest.x + 30) weight *= 0.45;
        if (b.group === 'armR' && v.x < chest.x - 30) weight *= 0.45;
        if (b.group === 'legL' && v.y < root.y - 10) weight *= 0.35;
        if (b.group === 'legR' && v.y < root.y - 10) weight *= 0.35;
        scores.push([i, weight]);
      }
      scores.sort((a, b) => b[1] - a[1]);
      const top = scores.slice(0, 4).filter(([, w]) => w > 0.001);
      const total = top.reduce((sum, [, w]) => sum + w, 0) || 1;
      v.influences = top.map(([i, w]) => ({ bone: i, weight: w / total }));
    }
  }

  function distancePointToSegment(p, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = p.x - a.x;
    const wy = p.y - a.y;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
    const t = c1 / c2;
    const px = a.x + t * vx;
    const py = a.y + t * vy;
    return Math.hypot(p.x - px, p.y - py);
  }

  function boneMatrix(restA, restB, poseA, poseB) {
    const ra = Math.atan2(restB.y - restA.y, restB.x - restA.x);
    const pa = Math.atan2(poseB.y - poseA.y, poseB.x - poseA.x);
    const d = pa - ra;
    const s = Math.max(0.0001, Math.hypot(poseB.x - poseA.x, poseB.y - poseA.y) / Math.max(1, Math.hypot(restB.x - restA.x, restB.y - restA.y)));
    const c = Math.cos(d) * s;
    const si = Math.sin(d) * s;
    return {
      a: c,
      b: si,
      c: -si,
      d: c,
      e: poseA.x - c * restA.x + si * restA.y,
      f: poseA.y - si * restA.x - c * restA.y,
    };
  }

  function applyMat(m, x, y) {
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }

  function solveTwoBone(root, target, len1, len2, bendSign) {
    const dx = target.x - root.x;
    const dy = target.y - root.y;
    const dRaw = Math.hypot(dx, dy);
    const d = clamp(dRaw, Math.abs(len1 - len2) + 0.001, len1 + len2 - 0.001);
    const base = Math.atan2(dy, dx);
    const cosA = clamp((len1 * len1 + d * d - len2 * len2) / (2 * len1 * d), -1, 1);
    const a = Math.acos(cosA);
    const angle = base + bendSign * a;
    return {
      joint: point(root.x + Math.cos(angle) * len1, root.y + Math.sin(angle) * len1),
      end: point(root.x + dx * (len1 + len2 > 0 ? (d / (len1 + len2)) : 1), root.y + dy * (len1 + len2 > 0 ? (d / (len1 + len2)) : 1)),
    };
  }

  function updatePose(dt) {
    if (!state.restJoints.pelvis) return;
    const rest = state.restJoints;
    const dir = state.facing;
    const stride = state.stride * state.artW * 0.70;
    const lift = Math.max(8, state.stride * state.artH * 0.22);
    const bounce = state.bounce * state.artH;
    const lean = state.lean * dir * Math.sin(state.phase * TAU);
    const coreX = dir * stride * 0.08 * Math.sin(state.phase * TAU);
    const coreY = bounce * (0.5 - 0.5 * Math.cos(state.phase * TAU * 2));

    const core = { x: coreX, y: coreY };
    const pivot = rest.pelvis;
    const c = Math.cos(lean);
    const s = Math.sin(lean);
    const coreTransform = (p) => ({
      x: pivot.x + core.x + (p.x - pivot.x) * c - (p.y - pivot.y) * s,
      y: pivot.y + core.y + (p.x - pivot.x) * s + (p.y - pivot.y) * c,
    });

    const pelvis = coreTransform(rest.pelvis);
    const chest = coreTransform(rest.chest);
    const neck = coreTransform(rest.neck);
    const head = coreTransform(rest.head);
    const lShoulder = coreTransform(rest.lShoulder);
    const rShoulder = coreTransform(rest.rShoulder);
    const lHip = coreTransform(rest.lHip);
    const rHip = coreTransform(rest.rHip);

    const frontX = pelvis.x + dir * stride * 0.36;
    const backX = pelvis.x - dir * stride * 0.36;
    const groundY = Math.max(rest.lFoot.y, rest.rFoot.y) + core.y * 0.35;

    const leftLegPhase = state.phase % 1;
    const rightLegPhase = (state.phase + 0.5) % 1;
    const leftArmPhase = (state.phase + 0.5) % 1;
    const rightArmPhase = state.phase % 1;

    const footTrack = (phase, stanceX, swingX) => {
      if (phase < 0.5) return point(stanceX, groundY);
      const t = (phase - 0.5) / 0.5;
      return point(lerp(stanceX, swingX, easeInOut(t)), groundY - Math.sin(t * Math.PI) * lift);
    };

    const lFoot = footTrack(leftLegPhase, frontX, backX);
    const rFoot = footTrack(rightLegPhase, backX, frontX);

    const thighLenL = Math.max(1, Math.hypot(rest.lKnee.x - rest.lHip.x, rest.lKnee.y - rest.lHip.y));
    const shinLenL = Math.max(1, Math.hypot(rest.lFoot.x - rest.lKnee.x, rest.lFoot.y - rest.lKnee.y));
    const thighLenR = Math.max(1, Math.hypot(rest.rKnee.x - rest.rHip.x, rest.rKnee.y - rest.rHip.y));
    const shinLenR = Math.max(1, Math.hypot(rest.rFoot.x - rest.rKnee.x, rest.rFoot.y - rest.rKnee.y));

    const legBiasL = dir > 0 ? 1 : -1;
    const legBiasR = -legBiasL;
    const kneeL = solveTwoBone(lHip, lFoot, thighLenL, shinLenL, legBiasL);
    const kneeR = solveTwoBone(rHip, rFoot, thighLenR, shinLenR, legBiasR);

    const armReach = state.armSwing * state.artW * 0.14;
    const armLift = state.artH * 0.05;
    const handTrack = (phase, shoulder, sideSign) => {
      const swing = Math.sin(phase * TAU);
      const liftAmt = Math.max(0, -Math.cos(phase * TAU)) * armLift;
      return point(
        shoulder.x + dir * swing * armReach * sideSign,
        shoulder.y + armLift * 0.3 + liftAmt + Math.cos(phase * TAU) * state.artH * 0.02
      );
    };

    const lHandTarget = handTrack(leftArmPhase, lShoulder, -1);
    const rHandTarget = handTrack(rightArmPhase, rShoulder, 1);

    const upperArmLenL = Math.max(1, Math.hypot(rest.lElbow.x - rest.lShoulder.x, rest.lElbow.y - rest.lShoulder.y));
    const lowerArmLenL = Math.max(1, Math.hypot(rest.lHand.x - rest.lElbow.x, rest.lHand.y - rest.lElbow.y));
    const upperArmLenR = Math.max(1, Math.hypot(rest.rElbow.x - rest.rShoulder.x, rest.rElbow.y - rest.rShoulder.y));
    const lowerArmLenR = Math.max(1, Math.hypot(rest.rHand.x - rest.rElbow.x, rest.rHand.y - rest.rElbow.y));

    const armBiasL = dir > 0 ? -1 : 1;
    const armBiasR = -armBiasL;
    const elbowL = solveTwoBone(lShoulder, lHandTarget, upperArmLenL, lowerArmLenL, armBiasL);
    const elbowR = solveTwoBone(rShoulder, rHandTarget, upperArmLenR, lowerArmLenR, armBiasR);

    state.poseJoints = {
      pelvis, chest, neck, head,
      lShoulder, lElbow: elbowL.joint, lHand: lHandTarget,
      rShoulder, rElbow: elbowR.joint, rHand: rHandTarget,
      lHip, lKnee: kneeL.joint, lFoot,
      rHip, rKnee: kneeR.joint, rFoot,
    };
    state.previewNeedsRedraw = true;
  }

  function drawTriangleFromCutout(ctx, srcA, srcB, srcC, dstA, dstB, dstC) {
    tempCtx.clearRect(0, 0, state.artW, state.artH);
    tempCtx.save();
    tempCtx.beginPath();
    tempCtx.moveTo(srcA.x, srcA.y);
    tempCtx.lineTo(srcB.x, srcB.y);
    tempCtx.lineTo(srcC.x, srcC.y);
    tempCtx.closePath();
    tempCtx.clip();
    tempCtx.drawImage(cutoutCanvas, 0, 0);
    tempCtx.restore();

    const m = triangleMatrix(srcA, srcB, srcC, dstA, dstB, dstC);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dstA.x, dstA.y);
    ctx.lineTo(dstB.x, dstB.y);
    ctx.lineTo(dstC.x, dstC.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
  }

  function triangleMatrix(s1, s2, s3, d1, d2, d3) {
    const den = s1.x * (s2.y - s3.y) + s2.x * (s3.y - s1.y) + s3.x * (s1.y - s2.y);
    if (Math.abs(den) < 1e-8) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const a = (d1.x * (s2.y - s3.y) + d2.x * (s3.y - s1.y) + d3.x * (s1.y - s2.y)) / den;
    const b = (d1.y * (s2.y - s3.y) + d2.y * (s3.y - s1.y) + d3.y * (s1.y - s2.y)) / den;
    const c = (d1.x * (s3.x - s2.x) + d2.x * (s1.x - s3.x) + d3.x * (s2.x - s1.x)) / den;
    const d = (d1.y * (s3.x - s2.x) + d2.y * (s1.x - s3.x) + d3.y * (s2.x - s1.x)) / den;
    const e = (d1.x * (s2.x * s3.y - s3.x * s2.y) + d2.x * (s3.x * s1.y - s1.x * s3.y) + d3.x * (s1.x * s2.y - s2.x * s1.y)) / den;
    const f = (d1.y * (s2.x * s3.y - s3.x * s2.y) + d2.y * (s3.x * s1.y - s1.x * s3.y) + d3.y * (s1.x * s2.y - s2.x * s1.y)) / den;
    return { a, b, c, d, e, f };
  }

  function deformPoint(v, boneMatrices) {
    if (!v.influences || !v.influences.length) return point(v.x, v.y);
    let x = 0;
    let y = 0;
    for (const inf of v.influences) {
      const mat = boneMatrices[inf.bone];
      const p = applyMat(mat, v.x, v.y);
      x += p.x * inf.weight;
      y += p.y * inf.weight;
    }
    return point(x, y);
  }

  function renderPreview() {
    if (!state.imageLoaded || !state.artW || !state.artH) return;
    const lay = previewLayout();
    const fullW = lay.r.width;
    const fullH = lay.r.height;
    pCtx.clearRect(0, 0, fullW, fullH);

    // background and stage
    const grad = pCtx.createLinearGradient(0, 0, 0, fullH);
    grad.addColorStop(0, 'rgba(255,255,255,0.04)');
    grad.addColorStop(1, 'rgba(0,0,0,0.06)');
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, fullW, fullH);

    const groundY = lay.r.height * 0.83;
    pCtx.strokeStyle = 'rgba(255,255,255,0.08)';
    pCtx.lineWidth = 1;
    pCtx.beginPath();
    pCtx.moveTo(0, groundY + 0.5);
    pCtx.lineTo(fullW, groundY + 0.5);
    pCtx.stroke();

    const matScale = lay.scale;
    const ox = lay.x;
    const oy = lay.y;

    const boneMatrices = {};
    for (let i = 0; i < state.bones.length; i++) {
      const bone = state.bones[i];
      const restA = state.restJoints[bone.a];
      const restB = state.restJoints[bone.b];
      const poseA = state.poseJoints[bone.a];
      const poseB = state.poseJoints[bone.b];
      boneMatrices[i] = boneMatrix(restA, restB, poseA, poseB);
    }

    // shadow
    const footMid = {
      x: (state.poseJoints.lFoot.x + state.poseJoints.rFoot.x) * 0.5,
      y: Math.max(state.poseJoints.lFoot.y, state.poseJoints.rFoot.y),
    };
    const shadowX = ox + footMid.x * matScale;
    const shadowY = oy + footMid.y * matScale + 8;
    pCtx.save();
    pCtx.translate(shadowX, shadowY);
    pCtx.scale(1.45, 0.42);
    pCtx.fillStyle = 'rgba(0,0,0,0.26)';
    pCtx.beginPath();
    pCtx.ellipse(0, 0, 52, 22, 0, 0, TAU);
    pCtx.fill();
    pCtx.restore();

    // render mesh triangles
    for (const tri of state.geometry) {
      const v0 = state.vertices[tri[0]];
      const v1 = state.vertices[tri[1]];
      const v2 = state.vertices[tri[2]];
      const s0 = point(v0.x, v0.y);
      const s1 = point(v1.x, v1.y);
      const s2 = point(v2.x, v2.y);
      const d0 = deformPoint(v0, boneMatrices);
      const d1 = deformPoint(v1, boneMatrices);
      const d2 = deformPoint(v2, boneMatrices);
      d0.x = ox + d0.x * matScale; d0.y = oy + d0.y * matScale;
      d1.x = ox + d1.x * matScale; d1.y = oy + d1.y * matScale;
      d2.x = ox + d2.x * matScale; d2.y = oy + d2.y * matScale;
      drawTriangleFromCutout(pCtx, s0, s1, s2, d0, d1, d2);
    }

    if (state.showRig) {
      pCtx.save();
      pCtx.lineWidth = 2;
      pCtx.strokeStyle = 'rgba(124,196,255,0.7)';
      pCtx.fillStyle = 'rgba(124,196,255,0.9)';
      const drawBone = (a, b) => {
        const pa = state.poseJoints[a];
        const pb = state.poseJoints[b];
        pCtx.beginPath();
        pCtx.moveTo(ox + pa.x * matScale, oy + pa.y * matScale);
        pCtx.lineTo(ox + pb.x * matScale, oy + pb.y * matScale);
        pCtx.stroke();
      };
      drawBone('pelvis', 'chest');
      drawBone('chest', 'neck');
      drawBone('neck', 'head');
      drawBone('lShoulder', 'lElbow');
      drawBone('lElbow', 'lHand');
      drawBone('rShoulder', 'rElbow');
      drawBone('rElbow', 'rHand');
      drawBone('lHip', 'lKnee');
      drawBone('lKnee', 'lFoot');
      drawBone('rHip', 'rKnee');
      drawBone('rKnee', 'rFoot');

      for (const name of JOINT_NAMES) {
        const j = state.poseJoints[name];
        const x = ox + j.x * matScale;
        const y = oy + j.y * matScale;
        pCtx.beginPath();
        pCtx.arc(x, y, 4.5, 0, TAU);
        pCtx.fill();
      }
      pCtx.restore();
    }

    previewBadge.textContent = state.playing ? 'Playing' : 'Paused';
  }

  function drawSource() {
    const lay = sourceLayout();
    const w = lay.r.width;
    const h = lay.r.height;
    sCtx.clearRect(0, 0, w, h);

    if (!state.imageLoaded) {
      sCtx.fillStyle = 'rgba(255,255,255,0.06)';
      sCtx.font = '600 16px system-ui, sans-serif';
      sCtx.fillText('Import an image to begin', 20, 32);
      return;
    }

    sCtx.fillStyle = 'rgba(255,255,255,0.02)';
    sCtx.fillRect(0, 0, w, h);
    sCtx.drawImage(artCanvas, lay.x, lay.y, lay.w, lay.h);

    if (state.showMask) {
      sCtx.save();
      sCtx.translate(lay.x, lay.y);
      sCtx.scale(lay.scale, lay.scale);
      sCtx.fillStyle = 'rgba(124,196,255,0.22)';
      sCtx.fillRect(0, 0, state.artW, state.artH);
      sCtx.globalCompositeOperation = 'destination-in';
      sCtx.drawImage(maskCanvas, 0, 0);
      sCtx.restore();
    }

    if (state.showRig && state.restJoints.pelvis) {
      sCtx.save();
      sCtx.lineWidth = 1.5;
      sCtx.strokeStyle = 'rgba(124,196,255,0.6)';
      sCtx.fillStyle = 'rgba(124,196,255,0.95)';
      const drawBone = (a, b) => {
        const pa = state.restJoints[a];
        const pb = state.restJoints[b];
        sCtx.beginPath();
        sCtx.moveTo(lay.x + pa.x * lay.scale, lay.y + pa.y * lay.scale);
        sCtx.lineTo(lay.x + pb.x * lay.scale, lay.y + pb.y * lay.scale);
        sCtx.stroke();
      };
      drawBone('pelvis', 'chest');
      drawBone('chest', 'neck');
      drawBone('neck', 'head');
      drawBone('lShoulder', 'lElbow');
      drawBone('lElbow', 'lHand');
      drawBone('rShoulder', 'rElbow');
      drawBone('rElbow', 'rHand');
      drawBone('lHip', 'lKnee');
      drawBone('lKnee', 'lFoot');
      drawBone('rHip', 'rKnee');
      drawBone('rKnee', 'rFoot');
      for (const name of JOINT_NAMES) {
        const j = state.restJoints[name];
        const x = lay.x + j.x * lay.scale;
        const y = lay.y + j.y * lay.scale;
        sCtx.beginPath();
        sCtx.arc(x, y, 4.5, 0, TAU);
        sCtx.fill();
        sCtx.strokeStyle = 'rgba(0,0,0,0.25)';
        sCtx.lineWidth = 3;
        sCtx.stroke();
        sCtx.strokeStyle = 'rgba(124,196,255,0.95)';
        sCtx.lineWidth = 1.5;
        sCtx.stroke();
      }
      sCtx.restore();
    }

    if (state.tool === 'lasso' && state.lasso.length > 1) {
      sCtx.save();
      sCtx.strokeStyle = 'rgba(103,232,160,0.95)';
      sCtx.lineWidth = 2;
      sCtx.beginPath();
      sCtx.moveTo(state.lasso[0].x, state.lasso[0].y);
      for (let i = 1; i < state.lasso.length; i++) sCtx.lineTo(state.lasso[i].x, state.lasso[i].y);
      sCtx.stroke();
      sCtx.restore();
    }

    sCtx.fillStyle = 'rgba(255,255,255,0.65)';
    sCtx.font = '12px system-ui, sans-serif';
    sCtx.fillText(`Zoom ${(state.sourceZoom * 100).toFixed(0)}%`, 14, h - 14);
  }

  function sourcePointerPosition(evt) {
    const rect = sourceCanvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function hitJoint(screenPt) {
    if (!state.restJoints.pelvis) return null;
    const lay = sourceLayout();
    const limit = 10;
    for (const name of JOINT_NAMES) {
      const j = state.restJoints[name];
      const sx = lay.x + j.x * lay.scale;
      const sy = lay.y + j.y * lay.scale;
      const d = Math.hypot(screenPt.x - sx, screenPt.y - sy);
      if (d <= limit) return name;
    }
    return null;
  }

  function loadImageFromSource(img) {
    const scale = Math.min(1, MAX_IMPORT_DIM / Math.max(img.width, img.height));
    state.artW = Math.max(1, Math.round(img.width * scale));
    state.artH = Math.max(1, Math.round(img.height * scale));

    artCanvas.width = state.artW;
    artCanvas.height = state.artH;
    maskCanvas.width = state.artW;
    maskCanvas.height = state.artH;
    softMaskCanvas.width = state.artW;
    softMaskCanvas.height = state.artH;
    cutoutCanvas.width = state.artW;
    cutoutCanvas.height = state.artH;
    tempCanvas.width = state.artW;
    tempCanvas.height = state.artH;

    artCtx.clearRect(0, 0, state.artW, state.artH);
    artCtx.drawImage(img, 0, 0, state.artW, state.artH);

    // Start with transparent mask if possible, otherwise full mask.
    maskCtx.clearRect(0, 0, state.artW, state.artH);
    const imageData = artCtx.getImageData(0, 0, state.artW, state.artH).data;
    let hasAlpha = false;
    for (let i = 3; i < imageData.length; i += 4) {
      if (imageData[i] < 245) { hasAlpha = true; break; }
    }
    if (hasAlpha) {
      const out = new Uint8Array(state.artW * state.artH);
      for (let i = 0, p = 0; i < imageData.length; i += 4, p++) out[p] = imageData[i + 3] > 18 ? 1 : 0;
      writeMaskBits(out);
      autoRigFromMask();
    } else {
      const out = new Uint8Array(state.artW * state.artH);
      for (let i = 0; i < out.length; i++) out[i] = 1;
      writeMaskBits(out);
      autoRigFromMask();
    }

    state.imageLoaded = true;
    state.playing = true;
    ui.playBtn.textContent = 'Pause';
    state.phase = 0;
    state.lastTS = 0;
    fitSourceToCanvas();
    rebuildDerived();
    setStatus(`Loaded ${state.artW}×${state.artH}`);
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  function demoImage() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="760" height="900" viewBox="0 0 760 900">
        <rect width="100%" height="100%" fill="none"/>
        <defs>
          <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffd7a8"/>
            <stop offset="1" stop-color="#ba7c4c"/>
          </linearGradient>
          <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#5ea7ff"/>
            <stop offset="1" stop-color="#2450b6"/>
          </linearGradient>
        </defs>
        <ellipse cx="410" cy="820" rx="120" ry="28" fill="rgba(0,0,0,0.18)"/>
        <circle cx="380" cy="150" r="72" fill="url(#body)"/>
        <path d="M322 132c14-54 47-79 77-79 41 0 70 29 82 70-17 9-37 14-58 14-23 0-45-7-68-7-10 0-21 1-33 2z" fill="#241a28"/>
        <ellipse cx="355" cy="145" rx="7" ry="9" fill="#1a1a1a"/>
        <ellipse cx="407" cy="145" rx="7" ry="9" fill="#1a1a1a"/>
        <path d="M376 168c14 12 28 12 42 0" fill="none" stroke="#7c4230" stroke-width="6" stroke-linecap="round"/>
        <path d="M310 224c0-44 27-74 70-74 44 0 69 25 69 70v72h-139z" fill="url(#cloth)"/>
        <path d="M312 236c-35 18-61 48-80 100-10 28 2 42 16 49 17 8 28 1 38-22 17-39 33-61 53-77z" fill="url(#body)"/>
        <path d="M448 236c32 18 57 49 78 102 11 28 0 44-14 51-17 8-28 0-40-24-16-36-31-60-50-77z" fill="url(#body)"/>
        <path d="M336 300c-34 14-54 40-60 79-4 23 8 38 30 42 20 3 30-11 38-31 11-31 23-49 41-60z" fill="url(#body)"/>
        <path d="M426 300c36 13 58 39 64 78 4 23-8 39-31 42-20 3-30-11-40-31-12-29-24-48-41-60z" fill="url(#body)"/>
        <path d="M349 425c-20 65-39 133-47 210-2 15 15 31 35 31 22 0 35-16 40-33 16-58 31-124 45-206z" fill="#35415f"/>
        <path d="M430 425c18 65 38 133 46 209 2 15-15 31-35 31-22 0-35-16-40-33-14-59-28-123-42-205z" fill="#35415f"/>
        <path d="M343 644c-13 48-17 77-17 107 0 18 15 31 34 31 21 0 33-15 37-33 7-36 17-78 28-118z" fill="#2d2033"/>
        <path d="M419 644c14 48 18 77 18 107 0 18-15 31-34 31-21 0-33-15-37-33-8-36-18-78-29-118z" fill="#2d2033"/>
        <path d="M292 286l-70 90" stroke="#ba7c4c" stroke-width="36" stroke-linecap="round"/>
        <path d="M468 286l79 84" stroke="#ba7c4c" stroke-width="36" stroke-linecap="round"/>
        <path d="M232 379l-25 118" stroke="#ba7c4c" stroke-width="28" stroke-linecap="round"/>
        <path d="M548 370l24 118" stroke="#ba7c4c" stroke-width="28" stroke-linecap="round"/>
        <path d="M203 499l-22 28" stroke="#ba7c4c" stroke-width="24" stroke-linecap="round"/>
        <path d="M574 490l22 27" stroke="#ba7c4c" stroke-width="24" stroke-linecap="round"/>
      </svg>`;
    const img = new Image();
    img.onload = () => loadImageFromSource(img);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function resetRig() {
    if (!state.artW || !state.artH) return;
    autoRigFromMask();
    rebuildDerived();
    setStatus('Rig reset');
  }

  function updateUIFromState() {
    ui.facingSelect.value = String(state.facing);
    ui.toolSelect.value = state.tool;
    ui.maskModeSelect.value = state.maskMode;
    ui.wandRange.value = String(state.wandTol);
    ui.featherRange.value = String(state.feather);
    ui.zoomRange.value = String(state.sourceZoom);
    ui.speedRange.value = String(state.speed);
    ui.strideRange.value = String(state.stride);
    ui.bounceRange.value = String(state.bounce);
    ui.leanRange.value = String(state.lean);
    ui.armRange.value = String(state.armSwing);
    ui.showMaskToggle.checked = state.showMask;
    ui.showRigToggle.checked = state.showRig;
    ui.playBtn.textContent = state.playing ? 'Pause' : 'Play';
  }

  function pointerCanvasCoords(evt, canvas) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function onSourcePointerDown(evt) {
    if (!state.imageLoaded) return;
    const p = sourcePointerPosition(evt);
    const tool = state.tool;
    const lay = sourceLayout();
    const art = screenToArt(p, lay);

    if (tool === 'joints') {
      const hit = hitJoint(p);
      if (hit) {
        state.dragJoint = hit;
        evt.preventDefault();
        sourceCanvas.setPointerCapture(evt.pointerId);
        return;
      }
      state.isPanning = true;
      state.dragOffset = { x: p.x, y: p.y };
      sourceCanvas.setPointerCapture(evt.pointerId);
      return;
    }

    if (tool === 'wand') {
      floodFillMask(art.x | 0, art.y | 0, state.wandTol, state.maskMode);
      return;
    }

    if (tool === 'lasso') {
      state.lasso = [p];
      state.drawingLasso = true;
      sourceCanvas.setPointerCapture(evt.pointerId);
      return;
    }

    if (tool === 'erase') {
      floodFillMask(art.x | 0, art.y | 0, state.wandTol, 'subtract');
    }
  }

  function onSourcePointerMove(evt) {
    if (!state.imageLoaded) return;
    const p = sourcePointerPosition(evt);
    if (state.dragJoint) {
      const lay = sourceLayout();
      const art = screenToArt(p, lay);
      state.restJoints[state.dragJoint] = point(art.x, art.y);
      state.poseJoints[state.dragJoint] = point(art.x, art.y);
      rebuildBones();
      buildMesh();
      rebuildDerived();
      state.sourceNeedsRedraw = true;
      state.previewNeedsRedraw = true;
      return;
    }
    if (state.isPanning) {
      state.sourcePanX += p.x - state.dragOffset.x;
      state.sourcePanY += p.y - state.dragOffset.y;
      state.dragOffset = p;
      state.sourceNeedsRedraw = true;
      return;
    }
    if (state.drawingLasso) {
      const last = state.lasso[state.lasso.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) state.lasso.push(p);
      state.sourceNeedsRedraw = true;
    }
  }

  function onSourcePointerUp(evt) {
    if (state.dragJoint) {
      state.dragJoint = null;
      sourceCanvas.releasePointerCapture(evt.pointerId);
      return;
    }
    if (state.isPanning) {
      state.isPanning = false;
      sourceCanvas.releasePointerCapture(evt.pointerId);
      return;
    }
    if (state.drawingLasso) {
      state.drawingLasso = false;
      sourceCanvas.releasePointerCapture(evt.pointerId);
      applyLasso(state.lasso.slice(), state.maskMode);
      state.lasso = [];
      return;
    }
  }

  function onSourceWheel(evt) {
    if (!state.imageLoaded) return;
    evt.preventDefault();
    const rect = sourceCanvas.getBoundingClientRect();
    const pt = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    const oldLayout = sourceLayout();
    const art = screenToArt(pt, oldLayout);
    const delta = Math.sign(evt.deltaY) * -0.10;
    state.sourceZoom = clamp(state.sourceZoom * (1 + delta), 0.25, 4);
    ui.zoomRange.value = String(state.sourceZoom);
    const newLayout = sourceLayout();
    const projected = artToScreen(art, newLayout);
    state.sourcePanX += pt.x - projected.x;
    state.sourcePanY += pt.y - projected.y;
    state.sourceNeedsRedraw = true;
  }

  function bindUI() {
    ui.fileInput.addEventListener('change', async () => {
      const file = ui.fileInput.files && ui.fileInput.files[0];
      if (!file) return;
      const img = await fileToImage(file);
      loadImageFromSource(img);
    });

    ui.demoBtn.addEventListener('click', () => demoImage());
    ui.autoMaskBtn.addEventListener('click', () => autoMask());
    ui.autoRigBtn.addEventListener('click', () => autoRigFromMask());
    ui.fitBtn.addEventListener('click', () => fitSourceToCanvas());
    ui.resetBtn.addEventListener('click', () => resetRig());
    ui.playBtn.addEventListener('click', () => {
      state.playing = !state.playing;
      ui.playBtn.textContent = state.playing ? 'Pause' : 'Play';
      state.previewNeedsRedraw = true;
    });

    ui.facingSelect.addEventListener('change', () => {
      state.facing = parseInt(ui.facingSelect.value, 10) || 1;
      autoRigFromMask();
      rebuildDerived();
    });

    ui.toolSelect.addEventListener('change', () => {
      state.tool = ui.toolSelect.value;
      state.sourceNeedsRedraw = true;
    });

    ui.maskModeSelect.addEventListener('change', () => {
      state.maskMode = ui.maskModeSelect.value;
    });

    ui.wandRange.addEventListener('input', () => {
      state.wandTol = parseInt(ui.wandRange.value, 10);
    });
    ui.featherRange.addEventListener('input', () => {
      state.feather = parseFloat(ui.featherRange.value);
      if (state.imageLoaded) rebuildDerived();
    });
    ui.zoomRange.addEventListener('input', () => {
      state.sourceZoom = parseFloat(ui.zoomRange.value);
      state.sourceNeedsRedraw = true;
    });
    ui.speedRange.addEventListener('input', () => state.speed = parseFloat(ui.speedRange.value));
    ui.strideRange.addEventListener('input', () => { state.stride = parseFloat(ui.strideRange.value); });
    ui.bounceRange.addEventListener('input', () => { state.bounce = parseFloat(ui.bounceRange.value); });
    ui.leanRange.addEventListener('input', () => { state.lean = parseFloat(ui.leanRange.value); });
    ui.armRange.addEventListener('input', () => { state.armSwing = parseFloat(ui.armRange.value); });
    ui.showMaskToggle.addEventListener('change', () => { state.showMask = ui.showMaskToggle.checked; state.sourceNeedsRedraw = true; });
    ui.showRigToggle.addEventListener('change', () => { state.showRig = ui.showRigToggle.checked; state.sourceNeedsRedraw = true; state.previewNeedsRedraw = true; });

    sourceCanvas.addEventListener('pointerdown', onSourcePointerDown);
    sourceCanvas.addEventListener('pointermove', onSourcePointerMove);
    sourceCanvas.addEventListener('pointerup', onSourcePointerUp);
    sourceCanvas.addEventListener('pointercancel', onSourcePointerUp);
    sourceCanvas.addEventListener('wheel', onSourceWheel, { passive: false });

    window.addEventListener('resize', () => {
      resizeDisplayCanvas(sourceCanvas, sCtx);
      resizeDisplayCanvas(previewCanvas, pCtx);
      fitSourceToCanvas();
      state.sourceNeedsRedraw = true;
      state.previewNeedsRedraw = true;
    });
  }

  function drawFrame(ts) {
    if (!state.lastTS) state.lastTS = ts;
    const dt = Math.min(0.05, (ts - state.lastTS) / 1000);
    state.lastTS = ts;

    if (state.playing && state.imageLoaded) {
      state.phase = (state.phase + dt * state.speed * 0.55) % 1;
      updatePose(dt);
      state.previewNeedsRedraw = true;
    } else if (state.imageLoaded) {
      // Keep pose in sync when paused or joints move.
      updatePose(0);
    }

    if (state.sourceNeedsRedraw) {
      drawSource();
      state.sourceNeedsRedraw = false;
    }
    if (state.previewNeedsRedraw) {
      renderPreview();
      state.previewNeedsRedraw = false;
    }

    requestAnimationFrame(drawFrame);
  }

  function init() {
    resizeDisplayCanvas(sourceCanvas, sCtx);
    resizeDisplayCanvas(previewCanvas, pCtx);
    bindUI();
    updateUIFromState();
    demoImage();
    requestAnimationFrame(drawFrame);
    setStatus('Ready');
  }

  init();
})();
