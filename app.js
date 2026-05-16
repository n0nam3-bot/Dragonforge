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
  const renderBuffer = document.createElement('canvas');
  const renderCtx = renderBuffer.getContext('2d');

  const JOINTS = [
    'pelvis','chest','neck','head',
    'lShoulder','lElbow','lHand',
    'rShoulder','rElbow','rHand',
    'lHip','lKnee','lFoot',
    'rHip','rKnee','rFoot'
  ];

  const BONES = [
    ['pelvis','chest'],
    ['chest','neck'],
    ['neck','head'],
    ['chest','lShoulder'],
    ['lShoulder','lElbow'],
    ['lElbow','lHand'],
    ['chest','rShoulder'],
    ['rShoulder','rElbow'],
    ['rElbow','rHand'],
    ['pelvis','lHip'],
    ['lHip','lKnee'],
    ['lKnee','lFoot'],
    ['pelvis','rHip'],
    ['rHip','rKnee'],
    ['rKnee','rFoot']
  ].map(([p,c], idx) => ({ id: `${idx}_${p}_${c}`, p, c }));

  const state = {
    image: null,
    artW: 0,
    artH: 0,
    play: true,
    speed: 1,
    facing: 1,
    trimOn: true,
    trimThreshold: 28,
    showMesh: true,
    params: {
      stride: 0.12,
      lift: 0.07,
      bounce: 0.018,
      lean: 0.11,
      armSwing: 0.90,
      sway: 0.02,
      ground: 0.88,
    },
    view: {
      fit: 1,
      zoom: 1,
      panX: 0,
      panY: 0,
    },
    rest: {},
    pose: {},
    bones: [],
    mesh: null,
    drag: null,
    time: 0,
    lastTS: performance.now(),
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

  function fitSource() {
    if (!state.artW || !state.artH) return;
    const rect = sourceCanvas.getBoundingClientRect();
    state.view.fit = Math.min(rect.width / state.artW, rect.height / state.artH) * 0.95;
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
  }

  function toSourceScreen(pt) {
    const rect = sourceCanvas.getBoundingClientRect();
    const scale = state.view.fit * state.view.zoom;
    const drawW = state.artW * scale;
    const drawH = state.artH * scale;
    const x0 = rect.width / 2 - drawW / 2 + state.view.panX;
    const y0 = rect.height / 2 - drawH / 2 + state.view.panY;
    return { x: x0 + pt.x * scale, y: y0 + pt.y * scale };
  }

  function fromSourceScreen(pt) {
    const rect = sourceCanvas.getBoundingClientRect();
    const scale = state.view.fit * state.view.zoom;
    const drawW = state.artW * scale;
    const drawH = state.artH * scale;
    const x0 = rect.width / 2 - drawW / 2 + state.view.panX;
    const y0 = rect.height / 2 - drawH / 2 + state.view.panY;
    return { x: (pt.x - x0) / scale, y: (pt.y - y0) / scale };
  }

  function autoRig() {
    if (!state.artW || !state.artH) return;
    const w = state.artW;
    const h = state.artH;
    const f = state.facing;

    const cx = w * 0.50 + f * w * 0.015;
    const chestX = cx + f * w * 0.016;
    const pelvisX = cx - f * w * 0.012;
    const shoulderSpan = w * 0.18;
    const hipSpan = w * 0.13;
    const shoulderY = h * 0.36;
    const neckY = h * 0.25;
    const headY = h * 0.16;
    const pelvisY = h * 0.58;

    const set = {
      pelvis: { x: pelvisX, y: pelvisY },
      chest: { x: chestX, y: shoulderY + h * 0.00 },
      neck: { x: chestX + f * w * 0.01, y: neckY },
      head: { x: chestX + f * w * 0.02, y: headY },
      lShoulder: { x: cx - shoulderSpan * 0.52 - f * w * 0.02, y: shoulderY },
      lElbow: { x: cx - shoulderSpan * 0.76 - f * w * 0.07, y: h * 0.50 },
      lHand: { x: cx - shoulderSpan * 0.95 - f * w * 0.12, y: h * 0.61 },
      rShoulder: { x: cx + shoulderSpan * 0.48 + f * w * 0.05, y: shoulderY },
      rElbow: { x: cx + shoulderSpan * 0.74 + f * w * 0.10, y: h * 0.50 },
      rHand: { x: cx + shoulderSpan * 0.92 + f * w * 0.16, y: h * 0.60 },
      lHip: { x: cx - hipSpan * 0.48 - f * w * 0.01, y: pelvisY },
      lKnee: { x: cx - hipSpan * 0.58 + f * w * 0.02, y: h * 0.75 },
      lFoot: { x: cx - hipSpan * 0.56 + f * w * 0.02, y: h * 0.92 },
      rHip: { x: cx + hipSpan * 0.48 + f * w * 0.02, y: pelvisY },
      rKnee: { x: cx + hipSpan * 0.58 + f * w * 0.06, y: h * 0.75 },
      rFoot: { x: cx + hipSpan * 0.56 + f * w * 0.07, y: h * 0.92 },
    };

    state.rest = JSON.parse(JSON.stringify(set));
    state.pose = JSON.parse(JSON.stringify(set));
    state.bones = [];
    buildMesh();
    computeWeights();
    fitSource();
    stateDirty();
  }

  function buildMesh() {
    const w = state.artW;
    const h = state.artH;
    if (!w || !h) return;
    const cols = clamp(Math.round(w / 18), 28, 68);
    const rows = clamp(Math.round(h / 18), 34, 88);
    const verts = [];
    const tris = [];
    const idx = (r, c) => r * (cols + 1) + c;

    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        verts.push({
          x: (c / cols) * w,
          y: (r / rows) * h,
          weights: []
        });
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = idx(r, c);
        const b = idx(r, c + 1);
        const c1 = idx(r + 1, c);
        const d = idx(r + 1, c + 1);
        tris.push([a, b, c1], [b, d, c1]);
      }
    }

    state.mesh = { cols, rows, verts, tris };
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

  function computeWeights() {
    if (!state.mesh || !state.rest || !state.artW) return;
    state.bones = BONES.map(({ id, p, c }) => {
      const rp = state.rest[p];
      const rc = state.rest[c];
      return { id, p, c, restP: copy(rp), restC: copy(rc) };
    });

    const torsoSet = new Set([
      '0_pelvis_chest',
      '1_chest_neck',
      '2_neck_head',
      '3_chest_lShoulder',
      '6_chest_rShoulder',
      '9_pelvis_lHip',
      '12_pelvis_rHip'
    ]);

    for (const v of state.mesh.verts) {
      const list = [];
      for (const b of state.bones) {
        const len = Math.max(1, dist(b.restP, b.restC));
        const sigma = len * 0.55 + 34;
        const d = segmentDistance(v.x, v.y, b.restP.x, b.restP.y, b.restC.x, b.restC.y);
        let w = Math.exp(-(d * d) / (2 * sigma * sigma));
        if (torsoSet.has(b.id)) w *= 1.15;
        list.push({ id: b.id, w });
      }
      list.sort((a, b) => b.w - a.w);
      const top = list.slice(0, 4);
      const sum = top.reduce((acc, item) => acc + item.w, 0) || 1;
      v.weights = top.map((item) => ({ id: item.id, w: item.w / sum }));
    }
  }

  function affineFromSegments(p0, p1, q0, q1) {
    const rx = p1.x - p0.x;
    const ry = p1.y - p0.y;
    const rl = Math.hypot(rx, ry) || 1;
    const ux = rx / rl;
    const uy = ry / rl;
    const vx = -uy;
    const vy = ux;

    const sx = q1.x - q0.x;
    const sy = q1.y - q0.y;
    const sl = Math.hypot(sx, sy) || 1;
    const wx = sx / sl;
    const wy = sy / sl;
    const zx = -wy;
    const zy = wx;

    const a00 = wx * ux + zx * vx;
    const a01 = wx * uy + zx * vy;
    const a10 = wy * ux + zy * vx;
    const a11 = wy * uy + zy * vy;

    return {
      a: a00,
      b: a10,
      c: a01,
      d: a11,
      e: q0.x - (a00 * p0.x + a01 * p0.y),
      f: q0.y - (a10 * p0.x + a11 * p0.y),
    };
  }

  function transformPoint(m, x, y) {
    return {
      x: m.a * x + m.c * y + m.e,
      y: m.b * x + m.d * y + m.f
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

    const mid = {
      x: root.x + Math.cos(ang) * len1,
      y: root.y + Math.sin(ang) * len1,
    };
    const end = {
      x: root.x + Math.cos(base) * d,
      y: root.y + Math.sin(base) * d,
    };

    return { mid, end };
  }

  function globalTransform(pt, root, angle) {
    const dx = pt.x - root.x;
    const dy = pt.y - root.y;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
      x: root.x + dx * c - dy * s,
      y: root.y + dx * s + dy * c,
    };
  }

  function poseAt(timeSec) {
    const r = state.rest;
    if (!r.pelvis) return null;
    const f = state.facing;
    const t = (timeSec * state.speed) % 1;
    const cycle = t * Math.PI * 2;

    const root = {
      x: r.pelvis.x + Math.sin(cycle) * state.params.sway * state.artW * f,
      y: r.pelvis.y + Math.max(0, Math.sin(cycle * 2)) * state.params.bounce * state.artH,
    };
    const lean = Math.sin(cycle) * state.params.lean * f;

    const torso = {
      pelvis: copy(root),
      chest: globalTransform(r.chest, r.pelvis, lean),
      neck: globalTransform(r.neck, r.pelvis, lean * 0.55),
      head: globalTransform(r.head, r.pelvis, lean * 0.20),
      lShoulder: globalTransform(r.lShoulder, r.pelvis, lean * 0.70),
      rShoulder: globalTransform(r.rShoulder, r.pelvis, lean * 0.70),
      lHip: globalTransform(r.lHip, r.pelvis, lean * 0.20),
      rHip: globalTransform(r.rHip, r.pelvis, lean * 0.20),
    };

    const frontIsRight = f > 0;
    const frontLeg = frontIsRight ? 'r' : 'l';
    const backLeg = frontIsRight ? 'l' : 'r';
    const frontArm = frontIsRight ? 'l' : 'r';
    const backArm = frontIsRight ? 'r' : 'l';

    const stride = state.params.stride * state.artW;
    const lift = state.params.lift * state.artH;
    const armSwing = state.params.armSwing * stride * 0.72;

    const footTarget = (side, phaseOffset, dir) => {
      const p = (t + phaseOffset) % 1;
      const swing = p >= 0.5;
      const u = swing ? (p - 0.5) / 0.5 : p / 0.5;
      const plantedX = r[`${side}Foot`].x + f * dir * stride * 0.10;
      const plantedY = r[`${side}Foot`].y;
      const movedX = r[`${side}Foot`].x + f * dir * stride * lerp(-0.42, 0.42, u);
      const movedY = r[`${side}Foot`].y - lift * Math.sin(u * Math.PI);
      return swing ? { x: movedX, y: movedY } : { x: plantedX, y: plantedY };
    };

    const handTarget = (side, phaseOffset, dir) => {
      const p = (t + phaseOffset) % 1;
      const s = Math.sin(p * Math.PI * 2);
      const liftY = Math.max(0, Math.sin((p * Math.PI * 2) + Math.PI / 2));
      return {
        x: r[`${side}Hand`].x + f * dir * armSwing * s,
        y: r[`${side}Hand`].y + state.artH * 0.03 * Math.sin((p * Math.PI * 2) + Math.PI * 0.2) - state.artH * 0.02 * liftY
      };
    };

    const legBend = (side) => {
      const front = side === frontLeg ? 1 : -1;
      return f * front;
    };
    const armBend = (side) => {
      const front = side === frontArm ? 1 : -1;
      return -f * front;
    };

    const frontFoot = footTarget(frontLeg, 0, 1);
    const backFoot = footTarget(backLeg, 0.5, -1);

    const frontHand = handTarget(frontArm, 0.5, 1);
    const backHand = handTarget(backArm, 0, -1);

    const leftLeg = solve2Bone(
      torso.lHip,
      backLeg === 'l' ? backFoot : frontFoot,
      dist(r.lHip, r.lKnee),
      dist(r.lKnee, r.lFoot),
      legBend('l')
    );
    const rightLeg = solve2Bone(
      torso.rHip,
      backLeg === 'r' ? backFoot : frontFoot,
      dist(r.rHip, r.rKnee),
      dist(r.rKnee, r.rFoot),
      legBend('r')
    );
    const leftArm = solve2Bone(
      torso.lShoulder,
      frontArm === 'l' ? frontHand : backHand,
      dist(r.lShoulder, r.lElbow),
      dist(r.lElbow, r.lHand),
      armBend('l')
    );
    const rightArm = solve2Bone(
      torso.rShoulder,
      frontArm === 'r' ? frontHand : backHand,
      dist(r.rShoulder, r.rElbow),
      dist(r.rElbow, r.rHand),
      armBend('r')
    );

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

  function meshVerticesForPose(pose) {
    const matrices = new Map();
    for (const bone of state.bones) {
      const restP = bone.restP;
      const restC = bone.restC;
      const posedP = pose[bone.p];
      const posedC = pose[bone.c];
      matrices.set(bone.id, affineFromSegments(restP, restC, posedP, posedC));
    }

    return state.mesh.verts.map((v) => {
      let x = 0;
      let y = 0;
      for (const wt of v.weights) {
        const m = matrices.get(wt.id);
        const p = transformPoint(m, v.x, v.y);
        x += p.x * wt.w;
        y += p.y * wt.w;
      }
      return { x, y };
    });
  }

  function triToCanvas(ctx, srcCanvas, a, b, c, da, db, dc) {
    const det = a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y);
    if (Math.abs(det) < 1e-9) return;
    const i00 = (b.y - c.y) / det;
    const i01 = (c.x - b.x) / det;
    const i02 = (b.x * c.y - c.x * b.y) / det;
    const i10 = (c.y - a.y) / det;
    const i11 = (a.x - c.x) / det;
    const i12 = (c.x * a.y - a.x * c.y) / det;
    const i20 = (a.y - b.y) / det;
    const i21 = (b.x - a.x) / det;
    const i22 = (a.x * b.y - b.x * a.y) / det;

    const A = da.x * i00 + db.x * i10 + dc.x * i20;
    const C = da.x * i01 + db.x * i11 + dc.x * i21;
    const E = da.x * i02 + db.x * i12 + dc.x * i22;
    const B = da.y * i00 + db.y * i10 + dc.y * i20;
    const D = da.y * i01 + db.y * i11 + dc.y * i21;
    const F = da.y * i02 + db.y * i12 + dc.y * i22;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(da.x, da.y);
    ctx.lineTo(db.x, db.y);
    ctx.lineTo(dc.x, dc.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(A, B, C, D, E, F);
    ctx.drawImage(srcCanvas, 0, 0);
    ctx.restore();
  }

  function trimBackground(srcCanvas, threshold) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    const sample = [0, w - 1, (h - 1) * w, h * w - 1];
    const bg = { r: 0, g: 0, b: 0 };
    for (const idx of sample) {
      const i = idx * 4;
      bg.r += d[i];
      bg.g += d[i + 1];
      bg.b += d[i + 2];
    }
    bg.r /= sample.length;
    bg.g /= sample.length;
    bg.b /= sample.length;

    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let qh = 0;
    let qt = 0;

    const push = (idx) => {
      if (!seen[idx]) {
        seen[idx] = 1;
        queue[qt++] = idx;
      }
    };

    for (let x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }

    const colorDistance = (r1, g1, b1, r2, g2, b2) => {
      const dr = r1 - r2;
      const dg = g1 - g2;
      const db = b1 - b2;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    while (qh < qt) {
      const idx = queue[qh++];
      const i = idx * 4;
      if (d[i + 3] === 0) continue;
      if (colorDistance(d[i], d[i + 1], d[i + 2], bg.r, bg.g, bg.b) <= threshold) {
        d[i + 3] = 0;
        const x = idx % w;
        const y = (idx / w) | 0;
        if (x > 0) push(idx - 1);
        if (x < w - 1) push(idx + 1);
        if (y > 0) push(idx - w);
        if (y < h - 1) push(idx + w);
      }
    }

    ctx.putImageData(img, 0, 0);
    return out;
  }

  function loadImage(img) {
    state.image = img;
    state.artW = img.naturalWidth || img.width;
    state.artH = img.naturalHeight || img.height;
    offscreen.width = state.artW;
    offscreen.height = state.artH;

    offCtx.setTransform(1, 0, 0, 1, 0, 0);
    offCtx.clearRect(0, 0, state.artW, state.artH);
    offCtx.drawImage(img, 0, 0);

    let source = offscreen;
    if (state.trimOn) {
      source = trimBackground(offscreen, state.trimThreshold);
    }

    offCtx.setTransform(1, 0, 0, 1, 0, 0);
    offCtx.clearRect(0, 0, state.artW, state.artH);
    offCtx.drawImage(source, 0, 0);

    sourceBadge.textContent = `Loaded ${state.artW}×${state.artH}`;
    previewBadge.textContent = 'Ready';
    autoRig();
  }

  function renderSource() {
    resizeCanvas(sourceCanvas, sCtx);
    sCtx.setTransform(1, 0, 0, 1, 0, 0);
    sCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);

    if (!state.artW || !state.artH) return;

    const rect = sourceCanvas.getBoundingClientRect();
    const scale = state.view.fit * state.view.zoom;
    const drawW = state.artW * scale;
    const drawH = state.artH * scale;
    const x0 = rect.width / 2 - drawW / 2 + state.view.panX;
    const y0 = rect.height / 2 - drawH / 2 + state.view.panY;

    sCtx.imageSmoothingEnabled = true;
    sCtx.drawImage(offscreen, x0, y0, drawW, drawH);

    if (state.showMesh && state.pose) {
      sCtx.save();
      sCtx.lineWidth = 1;
      sCtx.strokeStyle = 'rgba(124,196,255,.62)';
      sCtx.fillStyle = 'rgba(124,196,255,.14)';

      for (const bone of state.bones) {
        const a = state.pose[bone.p];
        const b = state.pose[bone.c];
        if (!a || !b) continue;
        sCtx.beginPath();
        sCtx.moveTo(x0 + a.x * scale, y0 + a.y * scale);
        sCtx.lineTo(x0 + b.x * scale, y0 + b.y * scale);
        sCtx.stroke();
      }

      for (const jointName of JOINTS) {
        const j = state.pose[jointName] || state.rest[jointName];
        if (!j) continue;
        const p = { x: x0 + j.x * scale, y: y0 + j.y * scale };
        sCtx.beginPath();
        sCtx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.strokeStyle = 'rgba(255,255,255,.5)';
        sCtx.stroke();
        sCtx.fillStyle = 'rgba(255,255,255,.95)';
        sCtx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        sCtx.fillText(jointName, p.x + 8, p.y - 7);
        sCtx.fillStyle = 'rgba(124,196,255,.14)';
        sCtx.strokeStyle = 'rgba(124,196,255,.62)';
      }

      sCtx.restore();
    }
  }

  function drawPreview(pose) {
    resizeCanvas(previewCanvas, pCtx);
    pCtx.setTransform(1, 0, 0, 1, 0, 0);
    pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    const rect = previewCanvas.getBoundingClientRect();
    const groundY = rect.height * 0.82;

    pCtx.save();
    pCtx.strokeStyle = 'rgba(255,255,255,.08)';
    pCtx.setLineDash([8, 8]);
    pCtx.beginPath();
    pCtx.moveTo(0, groundY);
    pCtx.lineTo(rect.width, groundY);
    pCtx.stroke();
    pCtx.restore();

    if (!state.artW || !state.artH || !pose || !state.mesh) {
      pCtx.fillStyle = 'rgba(255,255,255,.55)';
      pCtx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      pCtx.fillText('Import a sprite to begin.', 20, 30);
      return;
    }

    if (renderBuffer.width !== state.artW || renderBuffer.height !== state.artH) {
      renderBuffer.width = state.artW;
      renderBuffer.height = state.artH;
    }
    renderCtx.setTransform(1, 0, 0, 1, 0, 0);
    renderCtx.clearRect(0, 0, state.artW, state.artH);

    const posedVerts = meshVerticesForPose(pose);
    const src = offscreen;
    const verts = state.mesh.verts;
    const tris = state.mesh.tris;

    renderCtx.imageSmoothingEnabled = true;
    for (const tri of tris) {
      const a = verts[tri[0]];
      const b = verts[tri[1]];
      const c = verts[tri[2]];
      const da = posedVerts[tri[0]];
      const db = posedVerts[tri[1]];
      const dc = posedVerts[tri[2]];
      const sa = { x: a.x, y: a.y };
      const sb = { x: b.x, y: b.y };
      const sc = { x: c.x, y: c.y };
      const da2 = { x: da.x, y: da.y };
      const db2 = { x: db.x, y: db.y };
      const dc2 = { x: dc.x, y: dc.y };
      triToCanvas(renderCtx, src, sa, sb, sc, da2, db2, dc2);
    }

    pCtx.drawImage(renderBuffer, 0, 0, rect.width, rect.height);

    const feet = [pose.lFoot, pose.rFoot].filter(Boolean);
    if (feet.length) {
      const avgX = feet.reduce((a, b) => a + b.x, 0) / feet.length;
      const maxY = feet.reduce((a, b) => Math.max(a, b.y), -Infinity);
      const sx = (avgX / state.artW) * rect.width;
      const sy = groundY + Math.min(18, Math.max(-18, (maxY / state.artH) * 12 - 6));
      pCtx.save();
      pCtx.globalAlpha = 0.22;
      pCtx.fillStyle = '#000';
      pCtx.beginPath();
      pCtx.ellipse(sx, sy, rect.width * 0.12, rect.height * 0.025, 0, 0, Math.PI * 2);
      pCtx.fill();
      pCtx.restore();
    }

    if (state.showMesh) {
      pCtx.save();
      pCtx.strokeStyle = 'rgba(255,255,255,.10)';
      pCtx.lineWidth = 1;
      const rows = state.mesh.rows;
      const cols = state.mesh.cols;
      const idx = (r, c) => r * (cols + 1) + c;
      for (let r = 0; r <= rows; r++) {
        pCtx.beginPath();
        for (let c = 0; c <= cols; c++) {
          const v = posedVerts[idx(r, c)];
          const x = (v.x / state.artW) * rect.width;
          const y = (v.y / state.artH) * rect.height;
          if (c === 0) pCtx.moveTo(x, y);
          else pCtx.lineTo(x, y);
        }
        pCtx.stroke();
      }
      for (let c = 0; c <= cols; c++) {
        pCtx.beginPath();
        for (let r = 0; r <= rows; r++) {
          const v = posedVerts[idx(r, c)];
          const x = (v.x / state.artW) * rect.width;
          const y = (v.y / state.artH) * rect.height;
          if (r === 0) pCtx.moveTo(x, y);
          else pCtx.lineTo(x, y);
        }
        pCtx.stroke();
      }
      pCtx.restore();
    }
  }

  function redraw() {
    renderSource();
    drawPreview(state.pose);
  }

  function stateDirty() {
    redraw();
  }

  function pointerPos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function jointHitTest(screenPt) {
    if (!state.pose) return null;
    let best = null;
    let bestD = 1e9;
    for (const name of JOINTS) {
      const j = state.pose[name] || state.rest[name];
      if (!j) continue;
      const p = toSourceScreen(j);
      const d = Math.hypot(screenPt.x - p.x, screenPt.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = name;
      }
    }
    return bestD <= 16 ? best : null;
  }

  function updatePoseFromRest() {
    if (!state.rest.pelvis) return;
    state.pose = poseAt(state.time) || JSON.parse(JSON.stringify(state.rest));
  }

  function tick(ts) {
    const dt = Math.min(0.05, (ts - state.lastTS) / 1000);
    state.lastTS = ts;
    if (state.play && state.artW) {
      state.time = (state.time + dt) % 1;
      updatePoseFromRest();
      stateDirty();
      previewBadge.textContent = `Playing ${Math.round(state.time * 100)}%`;
    }
    requestAnimationFrame(tick);
  }

  sourceCanvas.addEventListener('pointerdown', (e) => {
    if (!state.artW) return;
    sourceCanvas.setPointerCapture(e.pointerId);
    const pt = pointerPos(sourceCanvas, e);
    const hit = jointHitTest(pt);
    if (hit) {
      state.drag = { type: 'joint', id: hit, pid: e.pointerId };
      return;
    }
    state.drag = {
      type: 'pan',
      pid: e.pointerId,
      start: pt,
      panX: state.view.panX,
      panY: state.view.panY
    };
  });

  sourceCanvas.addEventListener('pointermove', (e) => {
    if (!state.drag || state.drag.pid !== e.pointerId) return;
    const pt = pointerPos(sourceCanvas, e);
    if (state.drag.type === 'joint') {
      const imgPt = fromSourceScreen(pt);
      const name = state.drag.id;
      state.rest[name] = {
        x: clamp(imgPt.x, 0, state.artW),
        y: clamp(imgPt.y, 0, state.artH),
      };
      state.pose[name] = copy(state.rest[name]);
      buildMesh();
      computeWeights();
      updatePoseFromRest();
      stateDirty();
    } else if (state.drag.type === 'pan') {
      state.view.panX = state.drag.panX + (pt.x - state.drag.start.x);
      state.view.panY = state.drag.panY + (pt.y - state.drag.start.y);
      stateDirty();
    }
  });

  sourceCanvas.addEventListener('pointerup', (e) => {
    if (state.drag && state.drag.pid === e.pointerId) {
      state.drag = null;
      sourceCanvas.releasePointerCapture(e.pointerId);
    }
  });
  sourceCanvas.addEventListener('pointercancel', () => (state.drag = null));

  sourceCanvas.addEventListener('wheel', (e) => {
    if (!state.artW) return;
    e.preventDefault();
    const pt = pointerPos(sourceCanvas, e);
    const before = fromSourceScreen(pt);
    const factor = Math.exp(-e.deltaY * 0.0015);
    state.view.zoom = clamp(state.view.zoom * factor, 0.2, 5.5);
    const after = toSourceScreen(before);
    state.view.panX += pt.x - after.x;
    state.view.panY += pt.y - after.y;
    stateDirty();
  }, { passive: false });

  $('fileInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      loadImage(img);
      updatePoseFromRest();
      stateDirty();
    };
    img.src = url;
  });

  $('autoRigBtn').addEventListener('click', () => {
    if (!state.artW) return;
    autoRig();
    updatePoseFromRest();
    stateDirty();
  });

  $('fitBtn').addEventListener('click', () => {
    fitSource();
    stateDirty();
  });

  $('resetPoseBtn').addEventListener('click', () => {
    if (!state.rest.pelvis) return;
    state.time = 0;
    updatePoseFromRest();
    stateDirty();
  });

  $('playBtn').addEventListener('click', () => {
    state.play = !state.play;
    $('playBtn').textContent = state.play ? 'Pause' : 'Play';
    previewBadge.textContent = state.play ? 'Playing' : 'Paused';
  });

  $('facingSelect').addEventListener('change', (e) => {
    state.facing = Number(e.target.value) || 1;
    if (state.artW) autoRig();
    updatePoseFromRest();
    stateDirty();
  });

  $('speedRange').addEventListener('input', (e) => {
    state.speed = Number(e.target.value);
  });
  $('strideRange').addEventListener('input', (e) => {
    state.params.stride = Number(e.target.value);
  });
  $('liftRange').addEventListener('input', (e) => {
    state.params.lift = Number(e.target.value);
  });
  $('bounceRange').addEventListener('input', (e) => {
    state.params.bounce = Number(e.target.value);
  });
  $('leanRange').addEventListener('input', (e) => {
    state.params.lean = Number(e.target.value);
  });
  $('armRange').addEventListener('input', (e) => {
    state.params.armSwing = Number(e.target.value);
  });

  $('meshToggle').addEventListener('change', (e) => {
    state.showMesh = e.target.checked;
    stateDirty();
  });
  $('trimToggle').addEventListener('change', (e) => {
    state.trimOn = e.target.checked;
    if (state.image) loadImage(state.image);
    updatePoseFromRest();
    stateDirty();
  });
  $('trimRange').addEventListener('input', (e) => {
    state.trimThreshold = Number(e.target.value);
    if (state.image && state.trimOn) {
      loadImage(state.image);
      updatePoseFromRest();
      stateDirty();
    }
  });

  window.addEventListener('resize', () => {
    stateDirty();
  });

  (() => {
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
    state.image = demo;
    state.artW = demo.width;
    state.artH = demo.height;
    offscreen.width = demo.width;
    offscreen.height = demo.height;
    offCtx.drawImage(demo, 0, 0);
    sourceBadge.textContent = 'Demo pose';
    previewBadge.textContent = 'Demo preview';
    autoRig();
    updatePoseFromRest();
    fitSource();
    redraw();
  })();

  requestAnimationFrame(tick);
})();
