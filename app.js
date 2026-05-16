(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const sourceCanvas = $('sourceCanvas');
  const previewCanvas = $('previewCanvas');
  const sourceWrap = $('sourceWrap');
  const sourceMeta = $('sourceMeta');
  const previewMeta = $('previewMeta');

  const fileInput = $('fileInput');
  const facingSelect = $('facingSelect');
  const autoRigBtn = $('autoRigBtn');
  const fitBtn = $('fitBtn');
  const resetBtn = $('resetBtn');
  const speedRange = $('speedRange');
  const trimRange = $('trimRange');
  const playBtn = $('playBtn');
  const showRigChk = $('showRigChk');
  const trimChk = $('trimChk');

  const sctx = sourceCanvas.getContext('2d');
  const pctx = previewCanvas.getContext('2d');

  const JOINTS = [
    'pelvis','chest','neck','head',
    'lShoulder','lElbow','lHand',
    'rShoulder','rElbow','rHand',
    'lHip','lKnee','lFoot',
    'rHip','rKnee','rFoot',
  ];

  const BONES = [
    ['pelvis', 'chest'], ['chest', 'neck'], ['neck', 'head'],
    ['chest', 'lShoulder'], ['lShoulder', 'lElbow'], ['lElbow', 'lHand'],
    ['chest', 'rShoulder'], ['rShoulder', 'rElbow'], ['rElbow', 'rHand'],
    ['pelvis', 'lHip'], ['lHip', 'lKnee'], ['lKnee', 'lFoot'],
    ['pelvis', 'rHip'], ['rHip', 'rKnee'], ['rKnee', 'rFoot'],
  ].map(([p, c], i) => ({ id: `${i}:${p}_${c}`, p, c }));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const TAU = Math.PI * 2;

  const state = {
    image: null,
    sourceArt: document.createElement('canvas'),
    sourceCtx: null,
    w: 0,
    h: 0,
    play: true,
    speed: 1,
    facing: 1,
    trimEnabled: true,
    trimThreshold: 28,
    showRig: true,
    phase: 0,
    lastTs: performance.now(),
    rig: {},
    baseRig: {},
    mesh: null,
    weightsDirty: true,
    view: { zoom: 1, panX: 0, panY: 0, fit: 1 },
    drag: null,
    demoMode: true,
    alphaMask: null,
  };
  state.sourceCtx = state.sourceArt.getContext('2d');

  function resizeCanvas(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearCanvas(ctx, canvas) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function nonTransparentBounds(canvas) {
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    const img = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4 + 3;
        if (img[idx] > 10) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;
    return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function floodTrim(inputCanvas, threshold) {
    const w = inputCanvas.width;
    const h = inputCanvas.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(inputCanvas, 0, 0);
    const image = ctx.getImageData(0, 0, w, h);
    const d = image.data;

    // Estimate border color from all four edges.
    let br = 0, bg = 0, bb = 0, n = 0;
    const sample = (x, y) => {
      const i = (y * w + x) * 4;
      br += d[i]; bg += d[i + 1]; bb += d[i + 2]; n++;
    };
    for (let x = 0; x < w; x++) { sample(x, 0); sample(x, h - 1); }
    for (let y = 1; y < h - 1; y++) { sample(0, y); sample(w - 1, y); }
    br /= n; bg /= n; bb /= n;

    const visited = new Uint8Array(w * h);
    const q = new Int32Array(w * h);
    let qs = 0, qe = 0;
    const push = (i) => { if (!visited[i]) { visited[i] = 1; q[qe++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + (w - 1)); }

    const colorDist = (i) => {
      const dr = d[i] - br;
      const dg = d[i + 1] - bg;
      const db = d[i + 2] - bb;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    while (qs < qe) {
      const idx = q[qs++];
      const i = idx * 4;
      if (d[i + 3] === 0) continue;
      if (colorDist(i) <= threshold) {
        d[i + 3] = 0;
        const x = idx % w;
        const y = (idx / w) | 0;
        if (x > 0) push(idx - 1);
        if (x < w - 1) push(idx + 1);
        if (y > 0) push(idx - w);
        if (y < h - 1) push(idx + w);
      }
    }

    ctx.putImageData(image, 0, 0);
    return out;
  }

  function buildMesh() {
    const cell = clamp(Math.round(Math.max(state.w, state.h) / 22), 18, 34);
    const cols = clamp(Math.ceil(state.w / cell), 16, 56);
    const rows = clamp(Math.ceil(state.h / cell), 16, 56);
    const vertices = [];
    const index = (r, c) => r * (cols + 1) + c;
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        vertices.push({ x: (c / cols) * state.w, y: (r / rows) * state.h, w: [] });
      }
    }
    const triangles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = index(r, c);
        const b = index(r, c + 1);
        const c1 = index(r + 1, c);
        const d = index(r + 1, c + 1);
        triangles.push([a, b, c1], [b, d, c1]);
      }
    }
    state.mesh = { vertices, triangles };
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

  function rebuildWeights() {
    if (!state.mesh) return;
    const transforms = BONES.map((bone) => ({
      id: bone.id,
      p0: { ...state.baseRig[bone.p] },
      p1: { ...state.baseRig[bone.c] },
    }));

    for (const v of state.mesh.vertices) {
      const candidates = [];
      for (const bone of transforms) {
        const d = segmentDistance(v.x, v.y, bone.p0.x, bone.p0.y, bone.p1.x, bone.p1.y);
        const w = 1 / (d * d + 220);
        candidates.push({ id: bone.id, w });
      }
      candidates.sort((a, b) => b.w - a.w);
      const top = candidates.slice(0, 4);
      const sum = top.reduce((acc, item) => acc + item.w, 0) || 1;
      v.w = top.map((item) => ({ id: item.id, w: item.w / sum }));
    }
    state.weightsDirty = false;
  }

  function solveTwoBone(root, target, l1, l2, bendDir) {
    let dx = target.x - root.x;
    let dy = target.y - root.y;
    let d = Math.hypot(dx, dy);
    const minD = Math.max(Math.abs(l1 - l2) + 0.001, 0.001);
    const maxD = Math.max(l1 + l2 - 0.001, 0.002);
    d = clamp(d, minD, maxD);
    const base = Math.atan2(dy, dx);
    const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    const angA = Math.acos(cosA);
    const ang = base + bendDir * angA;
    return {
      mid: { x: root.x + Math.cos(ang) * l1, y: root.y + Math.sin(ang) * l1 },
      end: { x: root.x + Math.cos(base) * d, y: root.y + Math.sin(base) * d },
    };
  }

  function rotatePoint(origin, vector, angle, toOrigin) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
      x: toOrigin.x + (vector.x * c - vector.y * s),
      y: toOrigin.y + (vector.x * s + vector.y * c),
    };
  }

  function boneTransform(fromA, fromB, toA, toB) {
    const a0 = Math.atan2(fromB.y - fromA.y, fromB.x - fromA.x);
    const a1 = Math.atan2(toB.y - toA.y, toB.x - toA.x);
    const d = a1 - a0;
    const c = Math.cos(d);
    const s = Math.sin(d);
    return {
      a: c,
      b: s,
      c: -s,
      d: c,
      e: toA.x - c * fromA.x + s * fromA.y,
      f: toA.y - s * fromA.x - c * fromA.y,
    };
  }

  function applyTransform(m, x, y) {
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }

  function footMotion(hip, phase, stride, lift, groundY, facing, sideBias) {
    const p = (phase + sideBias) % 1;
    const back = stride * 0.48;
    const front = stride * 0.22;
    if (p < 0.5) {
      const t = p / 0.5;
      return {
        x: hip.x + facing * lerp(-back, front, smooth(t)),
        y: groundY - Math.sin(t * Math.PI) * lift * 0.12,
      };
    }
    const t = (p - 0.5) / 0.5;
    return {
      x: hip.x + facing * lerp(front, -back, smooth(t)),
      y: groundY - Math.sin(t * Math.PI) * lift,
    };
  }

  function handMotion(shoulder, phase, reach, drop, lift, facing, sideBias) {
    const p = (phase + sideBias) % 1;
    const t = p * TAU;
    return {
      x: shoulder.x + facing * Math.sin(t) * reach,
      y: shoulder.y + drop + Math.sin(t + Math.PI * 0.15) * lift,
    };
  }

  function poseAt(t) {
    const base = state.baseRig;
    const facing = state.facing;
    const phase = (t * 1.04) % 1;
    const cycle = phase * TAU;
    const bob = (Math.max(0, Math.sin(cycle * 2)) * 0.022 + 0.006) * state.h;
    const sway = Math.sin(cycle) * 0.018 * state.w * facing;
    const lean = Math.sin(cycle + Math.PI) * 0.08 * facing;

    const pelvis = {
      x: base.pelvis.x + sway,
      y: base.pelvis.y + bob,
    };

    const chest = rotatePoint(base.pelvis, { x: base.chest.x - base.pelvis.x, y: base.chest.y - base.pelvis.y }, lean * 0.45, pelvis);
    const neck = rotatePoint(base.chest, { x: base.neck.x - base.chest.x, y: base.neck.y - base.chest.y }, lean * 0.2, chest);
    const head = rotatePoint(base.neck, { x: base.head.x - base.neck.x, y: base.head.y - base.neck.y }, lean * 0.08, neck);

    const spine = { x: chest.x - pelvis.x, y: chest.y - pelvis.y };
    const spineLen = Math.hypot(spine.x, spine.y) || 1;
    const side = { x: -spine.y / spineLen, y: spine.x / spineLen };

    const shoulderSpan = dist(base.lShoulder, base.rShoulder);
    const hipSpan = dist(base.lHip, base.rHip);

    const lShoulder = {
      x: chest.x + side.x * (-shoulderSpan * 0.5),
      y: chest.y + side.y * (-shoulderSpan * 0.5),
    };
    const rShoulder = {
      x: chest.x + side.x * (shoulderSpan * 0.5),
      y: chest.y + side.y * (shoulderSpan * 0.5),
    };

    const lHip = {
      x: pelvis.x + side.x * (-hipSpan * 0.5),
      y: pelvis.y + side.y * (-hipSpan * 0.5),
    };
    const rHip = {
      x: pelvis.x + side.x * (hipSpan * 0.5),
      y: pelvis.y + side.y * (hipSpan * 0.5),
    };

    const groundY = Math.max(base.lFoot.y, base.rFoot.y) + state.h * 0.006;
    const stride = state.w * 0.11;
    const legLift = state.h * 0.07;
    const armReach = state.w * 0.09;

    const leftFootTarget = footMotion(lHip, phase, stride, legLift, groundY, facing, 0.0);
    const rightFootTarget = footMotion(rHip, (phase + 0.5) % 1, stride, legLift, groundY, facing, 0.0);

    const leftHandTarget = handMotion(lShoulder, (phase + 0.5) % 1, armReach, state.h * 0.20, state.h * 0.06, facing, 0.0);
    const rightHandTarget = handMotion(rShoulder, phase, armReach, state.h * 0.20, state.h * 0.06, facing, 0.0);

    const lArm = solveTwoBone(lShoulder, leftHandTarget, dist(base.lShoulder, base.lElbow), dist(base.lElbow, base.lHand), facing * 1);
    const rArm = solveTwoBone(rShoulder, rightHandTarget, dist(base.rShoulder, base.rElbow), dist(base.rElbow, base.rHand), facing * -1);
    const lLeg = solveTwoBone(lHip, leftFootTarget, dist(base.lHip, base.lKnee), dist(base.lKnee, base.lFoot), facing * -1);
    const rLeg = solveTwoBone(rHip, rightFootTarget, dist(base.rHip, base.rKnee), dist(base.rKnee, base.rFoot), facing * 1);

    return {
      pelvis,
      chest,
      neck,
      head,
      lShoulder,
      rShoulder,
      lHip,
      rHip,
      lElbow: lArm.mid,
      lHand: lArm.end,
      rElbow: rArm.mid,
      rHand: rArm.end,
      lKnee: lLeg.mid,
      lFoot: lLeg.end,
      rKnee: rLeg.mid,
      rFoot: rLeg.end,
    };
  }

  function deformVertices(pose) {
    const transforms = {};
    for (const bone of BONES) {
      transforms[bone.id] = boneTransform(
        state.baseRig[bone.p],
        state.baseRig[bone.c],
        pose[bone.p],
        pose[bone.c]
      );
    }

    return state.mesh.vertices.map((v) => {
      let x = 0;
      let y = 0;
      for (const w of v.w) {
        const m = transforms[w.id];
        const p = applyTransform(m, v.x, v.y);
        x += p.x * w.w;
        y += p.y * w.w;
      }
      return { x, y };
    });
  }

  function drawTexturedTriangle(ctx, src, a, b, c, da, db, dc) {
    const det = a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y);
    if (Math.abs(det) < 1e-8) return;

    const ia = (b.y - c.y) / det;
    const ib = (c.x - b.x) / det;
    const ic = (b.x * c.y - c.x * b.y) / det;
    const id = (c.y - a.y) / det;
    const ie = (a.x - c.x) / det;
    const iff = (c.x * a.y - a.x * c.y) / det;
    const ig = (a.y - b.y) / det;
    const ih = (b.x - a.x) / det;
    const ii = (a.x * b.y - b.x * a.y) / det;

    const A = da.x * ia + db.x * id + dc.x * ig;
    const B = da.x * ib + db.x * ie + dc.x * ih;
    const C = da.x * ic + db.x * iff + dc.x * ii;
    const D = da.y * ia + db.y * id + dc.y * ig;
    const E = da.y * ib + db.y * ie + dc.y * ih;
    const F = da.y * ic + db.y * iff + dc.y * ii;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(da.x, da.y);
    ctx.lineTo(db.x, db.y);
    ctx.lineTo(dc.x, dc.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(A, D, B, E, C, F);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  }

  function makePlaceholder() {
    state.demoMode = true;
    state.w = 800;
    state.h = 900;
    state.sourceArt.width = state.w;
    state.sourceArt.height = state.h;
    const ctx = state.sourceCtx;
    ctx.clearRect(0, 0, state.w, state.h);
    const g = ctx.createLinearGradient(220, 40, 620, 860);
    g.addColorStop(0, '#67e8a0');
    g.addColorStop(1, '#7cc4ff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(400, 160, 70, 0, TAU);
    ctx.fill();
    ctx.fillRect(338, 220, 124, 280);
    ctx.fillRect(300, 260, 40, 210);
    ctx.fillRect(460, 260, 40, 210);
    ctx.fillRect(336, 488, 52, 220);
    ctx.fillRect(412, 488, 52, 220);
    ctx.fillRect(320, 700, 74, 120);
    ctx.fillRect(406, 700, 74, 120);
    state.alphaMask = null;
    autoRigFromImageBounds(null);
    syncViewToFit();
    state.weightsDirty = true;
    sourceMeta.textContent = 'Demo pose shown. Import your own image to start.';
    previewMeta.textContent = 'Demo preview.';
  }

  function syncViewToFit() {
    const rect = sourceCanvas.getBoundingClientRect();
    state.view.fit = Math.min(rect.width / state.w, rect.height / state.h) * 0.96;
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
  }

  function autoRigFromImageBounds(bounds) {
    const w = state.w;
    const h = state.h;
    const b = bounds || { minX: w * 0.28, minY: h * 0.06, maxX: w * 0.72, maxY: h * 0.95, w: w * 0.44, h: h * 0.89 };
    const cx = (b.minX + b.maxX) * 0.5;
    const top = b.minY;
    const bottom = b.maxY;
    const bodyH = Math.max(1, bottom - top);
    const bodyW = Math.max(1, b.w);
    const sideShift = state.facing * bodyW * 0.04;

    state.rig = {
      pelvis: { x: cx + sideShift * 0.10, y: top + bodyH * 0.58 },
      chest: { x: cx + sideShift * 0.16, y: top + bodyH * 0.38 },
      neck: { x: cx + sideShift * 0.18, y: top + bodyH * 0.25 },
      head: { x: cx + sideShift * 0.20, y: top + bodyH * 0.14 },
      lShoulder: { x: cx - bodyW * 0.18 + sideShift * 0.10, y: top + bodyH * 0.39 },
      lElbow: { x: cx - bodyW * 0.29 + sideShift * 0.04, y: top + bodyH * 0.50 },
      lHand: { x: cx - bodyW * 0.36 + sideShift * 0.02, y: top + bodyH * 0.62 },
      rShoulder: { x: cx + bodyW * 0.18 + sideShift * 0.10, y: top + bodyH * 0.39 },
      rElbow: { x: cx + bodyW * 0.29 + sideShift * 0.04, y: top + bodyH * 0.50 },
      rHand: { x: cx + bodyW * 0.36 + sideShift * 0.02, y: top + bodyH * 0.62 },
      lHip: { x: cx - bodyW * 0.10, y: top + bodyH * 0.59 },
      lKnee: { x: cx - bodyW * 0.12 + state.facing * bodyW * 0.04, y: top + bodyH * 0.78 },
      lFoot: { x: cx - bodyW * 0.10 + state.facing * bodyW * 0.04, y: bottom },
      rHip: { x: cx + bodyW * 0.10, y: top + bodyH * 0.59 },
      rKnee: { x: cx + bodyW * 0.12 + state.facing * bodyW * 0.04, y: top + bodyH * 0.78 },
      rFoot: { x: cx + bodyW * 0.10 + state.facing * bodyW * 0.04, y: bottom },
    };
    state.baseRig = JSON.parse(JSON.stringify(state.rig));
    buildMesh();
    state.weightsDirty = true;
  }

  function autoRigFromCurrentImage() {
    const bounds = nonTransparentBounds(state.sourceArt);
    autoRigFromImageBounds(bounds);
    syncViewToFit();
    state.weightsDirty = true;
    sourceMeta.textContent = `Rig created from image bounds${bounds ? ` • ${bounds.w}×${bounds.h}` : ''}`;
  }

  function importImageFromFile(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.image = img;
      state.demoMode = false;
      state.w = img.naturalWidth || img.width;
      state.h = img.naturalHeight || img.height;
      state.sourceArt.width = state.w;
      state.sourceArt.height = state.h;
      const ctx = state.sourceCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, state.w, state.h);
      ctx.drawImage(img, 0, 0);
      if (state.trimEnabled) {
        const trimmed = floodTrim(state.sourceArt, state.trimThreshold);
        state.sourceArt.width = state.w;
        state.sourceArt.height = state.h;
        state.sourceCtx.clearRect(0, 0, state.w, state.h);
        state.sourceCtx.drawImage(trimmed, 0, 0);
      }
      autoRigFromCurrentImage();
      sourceMeta.textContent = `Loaded ${state.w}×${state.h}`;
      previewMeta.textContent = 'Ready.';
    };
    img.src = url;
  }

  function screenToImage(canvas, x, y) {
    const rect = canvas.getBoundingClientRect();
    const fit = state.view.fit * state.view.zoom;
    const drawW = state.w * fit;
    const drawH = state.h * fit;
    const left = rect.width / 2 - drawW / 2 + state.view.panX;
    const top = rect.height / 2 - drawH / 2 + state.view.panY;
    return { x: (x - left) / fit, y: (y - top) / fit };
  }

  function imageToScreen(canvas, x, y) {
    const rect = canvas.getBoundingClientRect();
    const fit = state.view.fit * state.view.zoom;
    const drawW = state.w * fit;
    const drawH = state.h * fit;
    const left = rect.width / 2 - drawW / 2 + state.view.panX;
    const top = rect.height / 2 - drawH / 2 + state.view.panY;
    return { x: left + x * fit, y: top + y * fit };
  }

  function nearestJoint(screenX, screenY) {
    let best = null;
    let bestD = 1e9;
    for (const name of JOINTS) {
      const p = imageToScreen(sourceCanvas, state.rig[name].x, state.rig[name].y);
      const d = Math.hypot(screenX - p.x, screenY - p.y);
      if (d < bestD) {
        bestD = d;
        best = name;
      }
    }
    return bestD <= 16 ? best : null;
  }

  function renderSource() {
    resizeCanvas(sourceCanvas, sctx);
    const rect = sourceCanvas.getBoundingClientRect();
    sctx.clearRect(0, 0, rect.width, rect.height);
    if (!state.w || !state.h) return;

    const fit = state.view.fit * state.view.zoom;
    const drawW = state.w * fit;
    const drawH = state.h * fit;
    const x0 = rect.width / 2 - drawW / 2 + state.view.panX;
    const y0 = rect.height / 2 - drawH / 2 + state.view.panY;

    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(state.sourceArt, x0, y0, drawW, drawH);

    if (state.showRig) {
      sctx.save();
      sctx.lineCap = 'round';
      sctx.lineJoin = 'round';
      sctx.strokeStyle = 'rgba(124,196,255,.72)';
      sctx.fillStyle = 'rgba(124,196,255,.18)';
      sctx.lineWidth = 1.7;

      for (const b of BONES) {
        const a = state.rig[b.p];
        const c = state.rig[b.c];
        if (!a || !c) continue;
        const pa = imageToScreen(sourceCanvas, a.x, a.y);
        const pb = imageToScreen(sourceCanvas, c.x, c.y);
        sctx.beginPath();
        sctx.moveTo(pa.x, pa.y);
        sctx.lineTo(pb.x, pb.y);
        sctx.stroke();
      }

      for (const name of JOINTS) {
        const p = imageToScreen(sourceCanvas, state.rig[name].x, state.rig[name].y);
        sctx.beginPath();
        sctx.arc(p.x, p.y, 6.3, 0, TAU);
        sctx.fill();
        sctx.strokeStyle = 'rgba(255,255,255,.42)';
        sctx.stroke();
        sctx.fillStyle = 'rgba(255,255,255,.92)';
        sctx.font = '12px system-ui, sans-serif';
        sctx.fillText(name, p.x + 9, p.y - 8);
        sctx.fillStyle = 'rgba(124,196,255,.18)';
        sctx.strokeStyle = 'rgba(124,196,255,.72)';
      }
      sctx.restore();
    }
  }

  function renderPreview() {
    resizeCanvas(previewCanvas, pctx);
    const rect = previewCanvas.getBoundingClientRect();
    pctx.clearRect(0, 0, rect.width, rect.height);
    if (!state.w || !state.h || !state.mesh) return;
    if (state.weightsDirty) rebuildWeights();

    const pose = poseAt(state.phase);
    const deformed = deformVertices(pose);
    const verts = state.mesh.vertices;

    pctx.save();
    pctx.imageSmoothingEnabled = true;
    for (const tri of state.mesh.triangles) {
      const a = verts[tri[0]], b = verts[tri[1]], c = verts[tri[2]];
      const da = deformed[tri[0]], db = deformed[tri[1]], dc = deformed[tri[2]];
      drawTexturedTriangle(pctx, state.sourceArt, a, b, c, da, db, dc);
    }
    pctx.restore();
  }

  function tick(ts) {
    const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
    state.lastTs = ts;
    if (state.play && state.w) {
      state.phase = (state.phase + dt * state.speed * 0.24) % 1;
    }
    renderSource();
    renderPreview();
    requestAnimationFrame(tick);
  }

  sourceCanvas.addEventListener('pointerdown', (e) => {
    if (!state.w) return;
    sourceCanvas.setPointerCapture(e.pointerId);
    const rect = sourceCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = nearestJoint(x, y);
    if (hit) {
      state.drag = { type: 'joint', name: hit, pid: e.pointerId };
      return;
    }
    state.drag = { type: 'pan', sx: x, sy: y, px: state.view.panX, py: state.view.panY, pid: e.pointerId };
  });

  sourceCanvas.addEventListener('pointermove', (e) => {
    if (!state.drag || state.drag.pid !== e.pointerId) return;
    const rect = sourceCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (state.drag.type === 'joint') {
      state.rig[state.drag.name] = screenToImage(sourceCanvas, x, y);
      state.baseRig = JSON.parse(JSON.stringify(state.rig));
      state.weightsDirty = true;
    } else if (state.drag.type === 'pan') {
      state.view.panX = state.drag.px + (x - state.drag.sx);
      state.view.panY = state.drag.py + (y - state.drag.sy);
    }
  });

  sourceCanvas.addEventListener('pointerup', (e) => {
    if (state.drag && state.drag.pid === e.pointerId) {
      state.drag = null;
      try { sourceCanvas.releasePointerCapture(e.pointerId); } catch {}
    }
  });
  sourceCanvas.addEventListener('pointercancel', () => { state.drag = null; });

  sourceCanvas.addEventListener('wheel', (e) => {
    if (!state.w) return;
    e.preventDefault();
    const rect = sourceCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = screenToImage(sourceCanvas, mx, my);
    const factor = Math.exp(-e.deltaY * 0.0015);
    state.view.zoom = clamp(state.view.zoom * factor, 0.2, 5.5);
    const fit = state.view.fit * state.view.zoom;
    const drawW = state.w * fit;
    const drawH = state.h * fit;
    const left = rect.width / 2 - drawW / 2 + state.view.panX;
    const top = rect.height / 2 - drawH / 2 + state.view.panY;
    const afterX = left + before.x * fit;
    const afterY = top + before.y * fit;
    state.view.panX += mx - afterX;
    state.view.panY += my - afterY;
  }, { passive: false });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) loadFileImage(file);
  });

  facingSelect.addEventListener('change', () => {
    state.facing = Number(facingSelect.value) || 1;
    if (state.w) {
      autoRigFromCurrentImage();
    }
  });

  autoRigBtn.addEventListener('click', () => {
    if (state.w) autoRigFromCurrentImage();
  });
  fitBtn.addEventListener('click', () => {
    if (state.w) syncViewToFit();
  });
  resetBtn.addEventListener('click', () => {
    if (!state.w) return;
    autoRigFromCurrentImage();
    state.phase = 0;
  });
  speedRange.addEventListener('input', () => { state.speed = Number(speedRange.value); });
  trimRange.addEventListener('input', () => {
    state.trimThreshold = Number(trimRange.value);
    if (state.image && state.trimEnabled && state.imageFile) loadFileImage(state.imageFile);
  });
  playBtn.addEventListener('click', () => {
    state.play = !state.play;
    playBtn.textContent = state.play ? 'Pause' : 'Play';
  });
  showRigChk.addEventListener('change', () => { state.showRig = showRigChk.checked; });
  trimChk.addEventListener('change', () => {
    state.trimEnabled = trimChk.checked;
    if (state.image && state.imageFile) {
      loadFileImage(state.imageFile);
    }
  });

  window.addEventListener('resize', () => {
    if (state.w) syncViewToFit();
  });

  // Keep a reference to the current file so threshold changes can re-run the trim pass.
  state.imageFile = null;
  function loadFileImage(file) {
    state.imageFile = file;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.image = img;
      state.demoMode = false;
      state.w = img.naturalWidth || img.width;
      state.h = img.naturalHeight || img.height;
      state.sourceArt.width = state.w;
      state.sourceArt.height = state.h;
      const ctx = state.sourceCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, state.w, state.h);
      ctx.drawImage(img, 0, 0);
      if (state.trimEnabled) {
        const trimmed = floodTrim(state.sourceArt, state.trimThreshold);
        state.sourceArt.width = state.w;
        state.sourceArt.height = state.h;
        state.sourceCtx.clearRect(0, 0, state.w, state.h);
        state.sourceCtx.drawImage(trimmed, 0, 0);
      }
      autoRigFromCurrentImage();
      sourceMeta.textContent = `Loaded ${state.w}×${state.h}`;
      previewMeta.textContent = 'Ready.';
    };
    img.src = url;
  }

  makePlaceholder();
  requestAnimationFrame(tick);
})();
