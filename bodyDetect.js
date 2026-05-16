// bodyDetect.js — geometry, mask extraction, and puppet building

const ALPHA_THOLD = 18;

export const JOINT_DEFS = [
  { id: 'head',     label: 'Head',     color: '#7dd3fc', parent: 'neck' },
  { id: 'neck',     label: 'Neck',     color: '#fde68a', parent: 'chest' },
  { id: 'chest',    label: 'Chest',    color: '#86efac', parent: 'pelvis' },
  { id: 'pelvis',   label: 'Pelvis',   color: '#93c5fd', parent: null },
  { id: 'shoulderL',label: 'Shoulder L',color: '#f59e0b', parent: 'chest' },
  { id: 'elbowL',   label: 'Elbow L',  color: '#fb923c', parent: 'shoulderL' },
  { id: 'handL',    label: 'Hand L',   color: '#fdba74', parent: 'elbowL' },
  { id: 'shoulderR',label: 'Shoulder R',color: '#f59e0b', parent: 'chest' },
  { id: 'elbowR',   label: 'Elbow R',  color: '#fb923c', parent: 'shoulderR' },
  { id: 'handR',    label: 'Hand R',   color: '#fdba74', parent: 'elbowR' },
  { id: 'hipL',     label: 'Hip L',    color: '#f87171', parent: 'pelvis' },
  { id: 'kneeL',    label: 'Knee L',   color: '#fca5a5', parent: 'hipL' },
  { id: 'footL',    label: 'Foot L',   color: '#fecaca', parent: 'kneeL' },
  { id: 'hipR',     label: 'Hip R',    color: '#c084fc', parent: 'pelvis' },
  { id: 'kneeR',    label: 'Knee R',   color: '#d8b4fe', parent: 'hipR' },
  { id: 'footR',    label: 'Foot R',   color: '#e9d5ff', parent: 'kneeR' },
  { id: 'hair',     label: 'Hair',     color: '#a78bfa', parent: 'head' },
];

export const PART_LIBRARY = [
  { id: 'head',      label: 'Head',          anchorJoint: 'neck' },
  { id: 'hair',      label: 'Hair',          anchorJoint: 'head' },
  { id: 'neck',      label: 'Neck',          anchorJoint: 'neck' },
  { id: 'chest',     label: 'Chest',         anchorJoint: 'chest' },
  { id: 'torso',     label: 'Torso',         anchorJoint: 'pelvis' },
  { id: 'pelvis',    label: 'Pelvis',        anchorJoint: 'pelvis' },
  { id: 'upperArmL', label: 'Upper Arm L',   anchorJoint: 'shoulderL' },
  { id: 'lowerArmL', label: 'Forearm L',     anchorJoint: 'elbowL' },
  { id: 'handL',     label: 'Hand L',        anchorJoint: 'handL' },
  { id: 'upperArmR', label: 'Upper Arm R',   anchorJoint: 'shoulderR' },
  { id: 'lowerArmR', label: 'Forearm R',     anchorJoint: 'elbowR' },
  { id: 'handR',     label: 'Hand R',        anchorJoint: 'handR' },
  { id: 'thighL',    label: 'Thigh L',       anchorJoint: 'hipL' },
  { id: 'shinL',     label: 'Shin L',        anchorJoint: 'kneeL' },
  { id: 'footL',     label: 'Foot L',        anchorJoint: 'footL' },
  { id: 'thighR',    label: 'Thigh R',       anchorJoint: 'hipR' },
  { id: 'shinR',     label: 'Shin R',        anchorJoint: 'kneeR' },
  { id: 'footR',     label: 'Foot R',        anchorJoint: 'footR' },
  { id: 'weapon',    label: 'Weapon',        anchorJoint: 'handR' },
  { id: 'shield',    label: 'Shield',        anchorJoint: 'handL' },
  { id: 'cape',      label: 'Cape',          anchorJoint: 'chest' },
];

export function computeBB(charCanvas) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > ALPHA_THOLD) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function computePrincipalAxis(charCanvas) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, W, H).data;
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = d[(y * W + x) * 4 + 3];
      if (a > ALPHA_THOLD) {
        n++;
        sx += x;
        sy += y;
      }
    }
  }
  if (!n) return { cx: W / 2, cy: H / 2, angle: Math.PI / 2, ux: 0, uy: 1, vx: -1, vy: 0 };
  const cx = sx / n, cy = sy / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = d[(y * W + x) * 4 + 3];
      if (a > ALPHA_THOLD) {
        const dx = x - cx, dy = y - cy;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
      }
    }
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy;
  const vy = ux;
  return { cx, cy, angle, ux, uy, vx, vy };
}

export function autoPlaceJoints(bb, axisInfo = null) {
  const cx = axisInfo?.cx ?? (bb.x + bb.w * 0.5);
  const cy = axisInfo?.cy ?? (bb.y + bb.h * 0.52);
  const ux = axisInfo?.ux ?? 0;
  const uy = axisInfo?.uy ?? 1;
  const vx = axisInfo?.vx ?? -1;
  const vy = axisInfo?.vy ?? 0;
  const H = Math.max(bb.h, bb.w);
  const along = (t) => [cx + ux * H * t, cy + uy * H * t];
  const across = (t) => [cx + vx * H * t, cy + vy * H * t];

  const j = {};
  const p = (id, x, y) => (j[id] = { x, y });

  const [hx, hy] = along(-0.34);
  const [nx, ny] = along(-0.20);
  const [chx, chy] = along(-0.05);
  const [px, py] = along(0.16);
  const shoulderSpan = H * 0.11;
  const hipSpan = H * 0.08;
  const armOut = H * 0.18;
  const legOut = H * 0.10;

  p('hair', hx, hy - H * 0.03);
  p('head', hx, hy);
  p('neck', nx, ny);
  p('chest', chx, chy);
  p('pelvis', px, py);

  const [slx, sly] = across(-shoulderSpan);
  const [srx, sry] = across(shoulderSpan);
  const [hlx, hly] = across(-hipSpan);
  const [hrx, hry] = across(hipSpan);

  p('shoulderL', slx, sly);
  p('shoulderR', srx, sry);
  p('elbowL', slx - vx * armOut + ux * H * 0.04, sly - vy * armOut + uy * H * 0.04);
  p('elbowR', srx + vx * armOut + ux * H * 0.04, sry + vy * armOut + uy * H * 0.04);
  p('handL', j.elbowL.x - vx * armOut * 0.9 + ux * H * 0.02, j.elbowL.y - vy * armOut * 0.9 + uy * H * 0.02);
  p('handR', j.elbowR.x + vx * armOut * 0.9 + ux * H * 0.02, j.elbowR.y + vy * armOut * 0.9 + uy * H * 0.02);

  p('hipL', hlx, hly);
  p('hipR', hrx, hry);
  p('kneeL', hlx - vx * legOut + ux * H * 0.14, hly - vy * legOut + uy * H * 0.14);
  p('kneeR', hrx + vx * legOut + ux * H * 0.14, hry + vy * legOut + uy * H * 0.14);
  p('footL', j.kneeL.x - vx * legOut * 0.65 + ux * H * 0.18, j.kneeL.y - vy * legOut * 0.65 + uy * H * 0.18);
  p('footR', j.kneeR.x + vx * legOut * 0.65 + ux * H * 0.18, j.kneeR.y + vy * legOut * 0.65 + uy * H * 0.18);

  return j;
}

export function createMaskCanvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  return c;
}

export function polygonMaskFromPoints(srcCanvas, points) {
  const mask = createMaskCanvas(srcCanvas.width, srcCanvas.height);
  const ctx = mask.getContext('2d');
  if (!points || points.length < 3) return mask;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(srcCanvas, 0, 0);
  ctx.restore();
  mask._bbox = boundsOfMask(mask);
  return mask;
}

export function floodFillMask(srcCanvas, seedX, seedY, tolerance = 38, alphaThold = ALPHA_THOLD) {
  const W = srcCanvas.width, H = srcCanvas.height;
  const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  const src = ctx.getImageData(0, 0, W, H);
  const d = src.data;
  const mask = createMaskCanvas(W, H);
  const mctx = mask.getContext('2d');
  const out = mctx.createImageData(W, H);
  const od = out.data;
  const seedIdx = (Math.max(0, Math.min(H - 1, seedY)) * W + Math.max(0, Math.min(W - 1, seedX))) * 4;
  const sr = d[seedIdx], sg = d[seedIdx + 1], sb = d[seedIdx + 2], sa = d[seedIdx + 3];
  if (sa < alphaThold) return mask;

  const visited = new Uint8Array(W * H);
  const qx = new Int32Array(W * H);
  const qy = new Int32Array(W * H);
  let head = 0, tail = 0;
  qx[tail] = seedX; qy[tail] = seedY; tail++;

  const dist = (i) => {
    const dr = d[i] - sr, dg = d[i + 1] - sg, db = d[i + 2] - sb, da = d[i + 3] - sa;
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da * 0.15);
  };

  while (head < tail) {
    const x = qx[head], y = qy[head]; head++;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const idx = y * W + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const i = idx * 4;
    if (d[i + 3] < alphaThold) continue;
    if (dist(i) > tolerance) continue;
    od[i] = d[i]; od[i + 1] = d[i + 1]; od[i + 2] = d[i + 2]; od[i + 3] = d[i + 3];
    if (x > 0) qx[tail] = x - 1, qy[tail++] = y;
    if (x < W - 1) qx[tail] = x + 1, qy[tail++] = y;
    if (y > 0) qx[tail] = x, qy[tail++] = y - 1;
    if (y < H - 1) qx[tail] = x, qy[tail++] = y + 1;
  }
  mctx.putImageData(out, 0, 0);
  mask._bbox = boundsOfMask(mask);
  return mask;
}

export function trimOpaque(maskCanvas) {
  const W = maskCanvas.width, H = maskCanvas.height;
  const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) {
    const empty = createMaskCanvas(1, 1);
    return empty;
  }
  const out = createMaskCanvas(x1 - x0 + 1, y1 - y0 + 1);
  const octx = out.getContext('2d');
  octx.drawImage(maskCanvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  out._bbox = { x: x0, y: y0, w: out.width, h: out.height };
  return out;
}

function boundsOfMask(maskCanvas) {
  const W = maskCanvas.width, H = maskCanvas.height;
  const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function buildPuppet(sourceCanvas, joints, parts) {
  const bb = computeBB(sourceCanvas);
  if (!bb) return null;
  const axis = computePrincipalAxis(sourceCanvas);
  const partObjects = {};
  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const src = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const sdata = src.data;

  for (const part of parts) {
    if (!part || !part.enabled || !part.maskCanvas) continue;
    const mask = part.maskCanvas;
    const b = mask._bbox || boundsOfMask(mask);
    if (!b || b.w < 1 || b.h < 1) continue;
    const mctx = mask.getContext('2d', { willReadFrequently: true });
    const md = mctx.getImageData(0, 0, mask.width, mask.height).data;
    const out = document.createElement('canvas');
    out.width = b.w; out.height = b.h;
    const octx = out.getContext('2d');
    const img = octx.createImageData(b.w, b.h);
    const od = img.data;
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const mx = x + b.x, my = y + b.y;
        const mi = (my * mask.width + mx) * 4;
        const a = md[mi + 3];
        if (!a) continue;
        const si = mi;
        const di = (y * b.w + x) * 4;
        od[di] = sdata[si];
        od[di + 1] = sdata[si + 1];
        od[di + 2] = sdata[si + 2];
        od[di + 3] = Math.min(255, Math.round((sdata[si + 3] * a) / 255));
      }
    }
    octx.putImageData(img, 0, 0);
    const anchor = getAnchorForPart(part, joints, sourceCanvas);
    partObjects[part.id] = {
      id: part.id,
      typeId: part.typeId || part.id,
      label: part.label,
      parent: part.parent || null,
      anchorJoint: part.anchorJoint || null,
      anchorSrc: anchor,
      canvas: out,
      srcX: b.x,
      srcY: b.y,
      anchorX: anchor.x - b.x,
      anchorY: anchor.y - b.y,
      w: out.width,
      h: out.height,
      depth: part.depth ?? 0,
    };
  }

  return { parts: partObjects, joints, bb, axis, groundY: bb.y + bb.h - 1 };
}

function getAnchorForPart(part, joints, sourceCanvas) {
  if (part.anchorJoint && joints[part.anchorJoint]) return { ...joints[part.anchorJoint] };
  if (part.anchorSrc) return { ...part.anchorSrc };
  return { x: sourceCanvas.width * 0.5, y: sourceCanvas.height * 0.5 };
}
