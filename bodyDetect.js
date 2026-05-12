// bodyDetect.js
// Row-profile skeletal analysis + Linear Blend Skinning weight maps.
// Uses 10%-trimmed width for landmark detection so swords/weapons/long
// hair that extend far from the body do not skew shoulder/hip detection.

const ALPHA      = 18;
const SMOOTH_WIN = 9;
const BLEND_PX   = 12;   // px of smooth cross-fade at region boundaries

// Bone indices — keep in sync with animator.js
export const B_HAIR  = 0;
export const B_HEAD  = 1;
export const B_TORSO = 2;
export const B_ARML  = 3;
export const B_ARMR  = 4;
export const B_HIPS  = 5;
export const B_LEGL  = 6;
export const B_LEGR  = 7;
export const NUM_BONES = 8;

export const BONE_IDS = ['hair','head','torso','armL','armR','hips','legL','legR'];

// ── Entry point ───────────────────────────────────────────────────────────────
export async function detectSkeleton(charCanvas, onProgress = () => {}) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;

  onProgress(0.05);

  // ── 1. Bounding box ──────────────────────────────────────────────────────
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > ALPHA) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x0 > x1) return null;
  const bb = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };

  onProgress(0.10);

  // ── 2. Row profiles ───────────────────────────────────────────────────────
  const lxArr = new Float32Array(H);   // leftmost fg pixel per row
  const rxArr = new Float32Array(H);   // rightmost fg pixel per row
  const mxArr = new Float32Array(H);   // alpha-weighted centroid x per row
  const wdArr = new Float32Array(H);   // raw pixel span per row
  const dnArr = new Float32Array(H);   // fg pixel count per row
  const twArr = new Float32Array(H);   // 10%-trimmed width per row

  for (let y = y0; y <= y1; y++) {
    let l = -1, r = -1, cnt = 0;
    let sumX = 0, sumA = 0;
    for (let x = x0; x <= x1; x++) {
      const a = d[(y * W + x) * 4 + 3];
      if (a > ALPHA) {
        if (l < 0) l = x; r = x; cnt++;
        sumX += x * a; sumA += a;
      }
    }
    if (l < 0) { l = r = (x0 + x1) >> 1; }
    lxArr[y] = l; rxArr[y] = r;
    mxArr[y] = sumA > 0 ? sumX / sumA : (l + r) * 0.5;
    wdArr[y] = r - l + 1;
    dnArr[y]  = cnt;

    // Trimmed width: skip outermost 10% of opaque pixels each side
    const trim = Math.ceil(cnt * 0.10);
    let tl = l, tr = r;
    let cl = 0;
    for (let x = l; x <= r; x++) {
      if (d[(y * W + x) * 4 + 3] > ALPHA) { cl++; if (cl >= trim) { tl = x; break; } }
    }
    let cr = 0;
    for (let x = r; x >= l; x--) {
      if (d[(y * W + x) * 4 + 3] > ALPHA) { cr++; if (cr >= trim) { tr = x; break; } }
    }
    twArr[y] = Math.max(1, tr - tl + 1);
  }

  // Smoothed raw width (for weight map generation — needs full extent for arms)
  const sw  = smoothArr(wdArr, y0, y1, SMOOTH_WIN);
  // Smoothed TRIMMED width (for landmark detection — ignores weapon outliers)
  const stw = smoothArr(twArr, y0, y1, SMOOTH_WIN);

  onProgress(0.25);

  // ── 3. Landmark detection (uses stw — trimmed, weapon-robust) ────────────
  const lm = findLandmarks(stw, dnArr, mxArr, wdArr, y0, y1, bb);

  onProgress(0.38);

  // ── 4. Pivot points ───────────────────────────────────────────────────────
  const pivots = buildPivots(lm, mxArr, lxArr, rxArr, sw, bb);

  onProgress(0.50);

  // ── 5. Per-pixel LBS weight maps ─────────────────────────────────────────
  const weights = Array.from({ length: NUM_BONES }, () => new Float32Array(W * H));
  const tmp = new Float32Array(NUM_BONES);

  for (let y = y0; y <= y1; y++) {
    const lx = lxArr[y] | 0, rx = rxArr[y] | 0;
    for (let x = lx; x <= rx; x++) {
      if (d[(y * W + x) * 4 + 3] <= ALPHA) continue;
      computeWeights(x, y, lm, pivots, mxArr, wdArr, sw, tmp);
      const pi = y * W + x;
      for (let b = 0; b < NUM_BONES; b++) weights[b][pi] = tmp[b];
    }
    if ((y - y0) % 25 === 0) onProgress(0.50 + 0.46 * (y - y0) / bb.h);
  }

  onProgress(0.98);

  return { srcData: imgData, srcW: W, srcH: H, bb, lm, pivots, weights, mxArr, lxArr, rxArr, sw };
}

// ════════════════════════════════════════════════════════════════════════════
// LANDMARK DETECTION  (uses trimmed width stw)
// ════════════════════════════════════════════════════════════════════════════

function findLandmarks(stw, dn, mx, wd, y0, y1, bb) {
  const BH  = y1 - y0 + 1;
  const rel = f => y0 + Math.floor(clamp01(f) * (BH - 1));

  const findMin = (fa, fb) => {
    let v = Infinity, row = rel(fa);
    for (let y = rel(fa); y <= rel(fb); y++) if (stw[y] > 1 && stw[y] < v) { v = stw[y]; row = y; }
    return row;
  };
  const findMax = (fa, fb) => {
    let v = 0, row = rel(fa);
    for (let y = rel(fa); y <= rel(fb); y++) if (stw[y] > v) { v = stw[y]; row = y; }
    return row;
  };

  const headTopY   = y0;

  // Neck: narrowest in top 40%
  let neckY = findMin(0.12, 0.38);
  const neckW = stw[neckY];

  // Hair end: 35% of the way from top to neck
  const hairEndY = Math.round(headTopY + (neckY - headTopY) * 0.35);

  // Shoulder: widest in [15%, 46%]
  const shoulderY = findMax(0.14, 0.46);
  const shoulderW = stw[shoulderY];

  // Waist: narrowest in [36%, 66%]
  const waistY = findMin(0.36, 0.66);
  const waistW = stw[waistY];

  // Hip: widest in [46%, 74%]
  const hipY = findMax(Math.max(0.46, (waistY - y0) / BH + 0.02), 0.74);
  const hipW = stw[hipY];

  // Crotch: first density drop below hip that suggests leg separation
  let crotchY = rel(0.72);
  const hipDn = dn[hipY];
  for (let y = hipY + 1; y <= rel(0.86); y++) {
    if (dn[y] < hipDn * 0.68 && stw[y] < hipW * 0.68) { crotchY = y; break; }
  }

  // Ankle: 88% into leg zone
  const ankleY = Math.round(crotchY + (y1 - crotchY) * 0.88);

  // Core half-widths: based on trimmed (weapon-free) widths
  const coreHalfShoulder = Math.max(waistW / 2, neckW / 2) * 1.12;
  const coreHalfWaist    = waistW / 2 * 0.96;

  return {
    headTopY, hairEndY, neckY, shoulderY, waistY, hipY, crotchY, ankleY,
    headW: stw[findMax(0,0.28)], shoulderW, waistW, hipW, neckW,
    coreHalfShoulder, coreHalfWaist,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PIVOT POINTS  (full-canvas pixel space)
// ════════════════════════════════════════════════════════════════════════════

function buildPivots(lm, mx, lx, rx, sw, bb) {
  const mid  = y => mx[clampI(y, bb.y, bb.y + bb.h - 1)];
  const half = y => sw[clampI(y, bb.y, bb.y + bb.h - 1)] * 0.5;

  return {
    hair:  { x: mid(lm.hairEndY),  y: lm.hairEndY  },
    head:  { x: mid(lm.neckY),     y: lm.neckY     },
    torso: { x: mid(lm.waistY),    y: lm.waistY    },
    armL:  { x: mid(lm.shoulderY) - half(lm.shoulderY) * 0.52, y: lm.shoulderY },
    armR:  { x: mid(lm.shoulderY) + half(lm.shoulderY) * 0.52, y: lm.shoulderY },
    hips:  { x: mid(lm.waistY),    y: lm.waistY    },
    legL:  { x: mid(lm.hipY) - half(lm.hipY) * 0.38, y: lm.hipY },
    legR:  { x: mid(lm.hipY) + half(lm.hipY) * 0.38, y: lm.hipY },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PER-PIXEL WEIGHT COMPUTATION
// ════════════════════════════════════════════════════════════════════════════

function computeWeights(px, py, lm, pivots, mx, wd, sw, out) {
  const { headTopY, hairEndY, neckY, shoulderY, waistY, hipY, crotchY,
          coreHalfShoulder, coreHalfWaist } = lm;
  const BP = BLEND_PX;

  for (let i = 0; i < NUM_BONES; i++) out[i] = 0;

  const rowMid  = mx[py];
  const rowHalf = sw[py] * 0.5;
  const dist    = px - rowMid;   // +ve = right of centre

  // Core half-width interpolated through torso zone
  const tFrac   = clamp01((py - shoulderY) / Math.max(1, waistY - shoulderY));
  const coreH   = lerp(coreHalfShoulder, coreHalfWaist, tFrac);

  // ── HAIR  (top → hairEnd) ─────────────────────────────────────────────
  out[B_HAIR]  = ss(neckY,    hairEndY, py);

  // ── HEAD  (hairEnd → shoulder zone) ──────────────────────────────────
  out[B_HEAD]  = ss(headTopY, hairEndY, py)
               * ss(shoulderY + BP, neckY - BP, py);

  // ── TORSO (neck → waist, within core width) ───────────────────────────
  {
    const vW = ss(neckY - BP, neckY + BP, py) * ss(waistY + BP, waistY - BP, py);
    const hW = ss(coreH + BP, coreH - BP, Math.abs(dist));
    out[B_TORSO] = vW * hW;
  }

  // ── ARM_L (shoulder → waist, left of core) ────────────────────────────
  {
    const vW = ss(shoulderY - BP, shoulderY + BP, py) * ss(waistY + BP, waistY - BP, py);
    const dL = rowMid - px - coreH;   // +ve means pixel is left of core
    out[B_ARML] = vW * ss(-BP, BP, dL);
  }

  // ── ARM_R (shoulder → waist, right of core) ───────────────────────────
  {
    const vW = ss(shoulderY - BP, shoulderY + BP, py) * ss(waistY + BP, waistY - BP, py);
    const dR = px - rowMid - coreH;   // +ve means pixel is right of core
    out[B_ARMR] = vW * ss(-BP, BP, dR);
  }

  // ── HIPS  (waist → crotch) ────────────────────────────────────────────
  out[B_HIPS]  = ss(waistY - BP, waistY + BP, py)
               * ss(crotchY + BP, crotchY - BP, py);

  // ── LEGS  (crotch → bottom, split at row centroid) ───────────────────
  {
    const vW  = ss(crotchY - BP, crotchY + BP, py);
    out[B_LEGL] = vW * ss(rowMid + BP, rowMid - BP, px);  // left of mid
    out[B_LEGR] = vW * ss(rowMid - BP, rowMid + BP, px);  // right of mid
  }

  // ── Normalise ─────────────────────────────────────────────────────────
  let sum = 0;
  for (let i = 0; i < NUM_BONES; i++) sum += out[i];
  if (sum > 1e-4) {
    const inv = 1 / sum;
    for (let i = 0; i < NUM_BONES; i++) out[i] *= inv;
  } else {
    out[B_TORSO] = 1;   // fallback
  }
}

// ════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════════════════

/** Smooth-step: 1 at lo, 0 at hi (swapped if lo > hi). */
function ss(lo, hi, x) {
  const t = clamp01((x - lo) / (hi - lo + 1e-6));
  return 3*t*t - 2*t*t*t;   // cubic Hermite
}

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const clampI  = (v,a,b) => v < a ? a : v > b ? b : v;
const lerp    = (a, b, t) => a + (b - a) * t;

function smoothArr(arr, y0, y1, win) {
  const out = new Float32Array(arr.length);
  const h   = win >> 1;
  for (let y = y0; y <= y1; y++) {
    let s = 0, n = 0;
    for (let j = Math.max(y0, y-h); j <= Math.min(y1, y+h); j++) { s += arr[j]; n++; }
    out[y] = s / n;
  }
  return out;
}
