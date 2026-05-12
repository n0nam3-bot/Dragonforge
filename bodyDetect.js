// bodyDetect.js
// Scans the bg-removed character, finds anatomical landmarks, and
// precomputes Linear Blend Skinning (LBS) weight maps for 8 bone regions.
// The weight maps are stored as Float32Array[srcW * srcH] per bone — each
// foreground pixel gets weights that sum to 1 across all bones.

const ALPHA      = 18;   // min alpha to count as foreground
const SMOOTH_WIN = 9;    // moving-average window for width profile
const BLEND_PX   = 10;   // pixels of smooth cross-fade at region boundaries

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
  if (x0 > x1) return buildFallbackSkeleton(imgData);
  const bb = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  if (bb.w < Math.max(8, W * 0.06) || bb.h < Math.max(8, H * 0.06)) return buildFallbackSkeleton(imgData);

  onProgress(0.12);

  // ── 2. Row profiles (in full-canvas coords) ───────────────────────────────
  const lxArr = new Float32Array(H);  // leftmost fg x per row
  const rxArr = new Float32Array(H);  // rightmost fg x per row
  const mxArr = new Float32Array(H);  // midpoint x per row
  const wdArr = new Float32Array(H);  // visible width per row
  const dnArr = new Float32Array(H);  // fg pixel density per row

  for (let y = y0; y <= y1; y++) {
    let l = -1, r = -1, cnt = 0;
    for (let x = x0; x <= x1; x++) {
      if (d[(y * W + x) * 4 + 3] > ALPHA) {
        if (l < 0) l = x; r = x; cnt++;
      }
    }
    if (l < 0) { l = r = (x0 + x1) >> 1; }
    lxArr[y] = l; rxArr[y] = r; mxArr[y] = (l + r) * 0.5;
    wdArr[y] = r - l + 1; dnArr[y] = cnt;
  }

  // Smoothed width
  const sw = smoothArr(wdArr, y0, y1, SMOOTH_WIN);

  onProgress(0.25);

  // ── 3. Landmark detection ────────────────────────────────────────────────
  const lm = findLandmarks(sw, dnArr, mxArr, wdArr, y0, y1, bb);

  onProgress(0.38);

  // ── 4. Pivot points (in full-canvas pixel coords) ────────────────────────
  const pivots = buildPivots(lm, mxArr, lxArr, rxArr, sw, bb);

  onProgress(0.50);

  // ── 5. Per-pixel weight maps ──────────────────────────────────────────────
  // Allocate 8 float arrays, one per bone, indexed [y*W+x] in full-canvas space
  const weights = Array.from({ length: NUM_BONES }, () => new Float32Array(W * H));

  const tmp = new Float32Array(NUM_BONES);

  for (let y = y0; y <= y1; y++) {
    const lx = lxArr[y], rx = rxArr[y];
    for (let x = lx; x <= rx; x++) {
      if (d[(y * W + x) * 4 + 3] <= ALPHA) continue;
      computeWeights(x, y, lm, pivots, mxArr, wdArr, sw, tmp);
      const pi = y * W + x;
      for (let b = 0; b < NUM_BONES; b++) weights[b][pi] = tmp[b];
    }
    if ((y - y0) % 30 === 0) onProgress(0.50 + 0.45 * (y - y0) / bb.h);
  }

  onProgress(0.97);

  return {
    srcData: imgData,  // Uint8ClampedArray with all pixels
    srcW: W, srcH: H,
    bb, lm, pivots, weights,
    // Convenience: per-row midpoints for hair wave
    mxArr, lxArr, rxArr, sw,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// FALLBACK SKELETON (used when auto-detection cannot find a foreground body)
// ════════════════════════════════════════════════════════════════════════════

function buildFallbackSkeleton(imgData) {
  const W = imgData.width, H = imgData.height;
  const bb = { x: 0, y: 0, w: W, h: H };
  const mxArr = new Float32Array(H);
  const lxArr = new Float32Array(H);
  const rxArr = new Float32Array(H);
  const wdArr = new Float32Array(H);
  const dnArr = new Float32Array(H);
  const midX  = W * 0.5;

  for (let y = 0; y < H; y++) {
    const t = H <= 1 ? 0 : y / (H - 1);
    let width;
    if (t < 0.16) width = lerp(W * 0.20, W * 0.28, t / 0.16);
    else if (t < 0.34) width = lerp(W * 0.30, W * 0.52, (t - 0.16) / 0.18);
    else if (t < 0.56) width = lerp(W * 0.48, W * 0.30, (t - 0.34) / 0.22);
    else if (t < 0.78) width = lerp(W * 0.34, W * 0.42, (t - 0.56) / 0.22);
    else width = lerp(W * 0.24, W * 0.18, (t - 0.78) / 0.22);

    width = clamp(width, W * 0.12, W * 0.72);
    mxArr[y] = midX;
    lxArr[y] = midX - width * 0.5;
    rxArr[y] = midX + width * 0.5;
    wdArr[y] = width;
    dnArr[y] = Math.max(1, Math.round(width * 0.35));
  }

  const sw = smoothArr(wdArr, 0, H - 1, SMOOTH_WIN);
  const lm = findLandmarks(sw, dnArr, mxArr, wdArr, 0, H - 1, bb);
  const pivots = buildPivots(lm, mxArr, lxArr, rxArr, sw, bb);
  const weights = Array.from({ length: NUM_BONES }, () => new Float32Array(W * H));
  const tmp = new Float32Array(NUM_BONES);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      computeWeights(x, y, lm, pivots, mxArr, wdArr, sw, tmp);
      const pi = y * W + x;
      for (let b = 0; b < NUM_BONES; b++) weights[b][pi] = tmp[b];
    }
  }

  return {
    srcData: imgData,
    srcW: W, srcH: H,
    bb, lm, pivots, weights,
    mxArr, lxArr, rxArr, sw,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// LANDMARK DETECTION
// ════════════════════════════════════════════════════════════════════════════

function findLandmarks(sw, dn, mx, wd, y0, y1, bb) {
  const BH = y1 - y0 + 1;
  const rel = r => y0 + Math.floor(r * BH);          // fraction → absolute y
  const findMin = (a, b) => {
    let v = Infinity, row = rel(a);
    for (let y = rel(a); y <= rel(b); y++) if (sw[y] > 0 && sw[y] < v) { v = sw[y]; row = y; }
    return row;
  };
  const findMax = (a, b) => {
    let v = 0, row = rel(a);
    for (let y = rel(a); y <= rel(b); y++) if (sw[y] > v) { v = sw[y]; row = y; }
    return row;
  };

  // Head top = y0 (bounding box top)
  const headTopY = y0;

  // Neck = narrowest in top 40%
  let neckY = findMin(0.15, 0.40);
  const neckW = sw[neckY];

  // Head max width in top 30%
  const headMaxY = findMax(0.00, 0.30);
  const headW = sw[headMaxY];

  // Hair end = roughly between top and 35% of neck
  const hairEndY = Math.round(headTopY + (neckY - headTopY) * 0.35);

  // Shoulder = widest in [15%, 45%]
  const shoulderY = findMax(0.15, 0.45);
  const shoulderW = sw[shoulderY];

  // Waist = narrowest in [35%, 65%]
  const waistY = findMin(0.35, 0.65);
  const waistW = sw[waistY];

  // Hip = widest in [45%, 72%]
  const hipY = findMax(Math.max(0.45, (waistY - y0) / BH), 0.72);
  const hipW = sw[hipY];

  // Crotch = density drop below hip (suggests leg gap)
  let crotchY = rel(0.72);
  for (let y = hipY; y <= rel(0.85); y++) {
    if (dn[y] < dn[hipY] * 0.70 && sw[y] < hipW * 0.65) { crotchY = y; break; }
  }

  // Ankle = 88% of leg zone
  const ankleY = Math.round(crotchY + (y1 - crotchY) * 0.88);

  // Core half-width at shoulder level: use waist as baseline
  const coreHalfShoulder = Math.max(waistW / 2, neckW / 2) * 1.10;
  const coreHalfWaist    = waistW / 2 * 0.95;

  return {
    headTopY, hairEndY, neckY, shoulderY, waistY, hipY, crotchY, ankleY,
    headW, shoulderW, waistW, hipW, neckW,
    coreHalfShoulder, coreHalfWaist,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PIVOT POINTS  (full-canvas pixel space)
// ════════════════════════════════════════════════════════════════════════════

function buildPivots(lm, mx, lx, rx, sw, bb) {
  const mid  = y => mx[clampY(y, bb.y, bb.y + bb.h - 1)];
  const half = y => sw[clampY(y, bb.y, bb.y + bb.h - 1)] * 0.5;

  return {
    hair:  { x: mid(lm.hairEndY),  y: lm.hairEndY  },
    head:  { x: mid(lm.neckY),     y: lm.neckY     },
    torso: { x: mid(lm.waistY),    y: lm.waistY    },
    armL:  { x: mid(lm.shoulderY) - half(lm.shoulderY) * 0.55,
             y: lm.shoulderY },
    armR:  { x: mid(lm.shoulderY) + half(lm.shoulderY) * 0.55,
             y: lm.shoulderY },
    hips:  { x: mid(lm.waistY),    y: lm.waistY    },
    legL:  { x: mid(lm.hipY) - half(lm.hipY) * 0.40, y: lm.hipY },
    legR:  { x: mid(lm.hipY) + half(lm.hipY) * 0.40, y: lm.hipY },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PER-PIXEL WEIGHT COMPUTATION
// ════════════════════════════════════════════════════════════════════════════

function computeWeights(px, py, lm, pivots, mx, wd, sw, out) {
  const {
    headTopY, hairEndY, neckY, shoulderY, waistY, hipY, crotchY,
    coreHalfShoulder, coreHalfWaist,
  } = lm;
  const BP = BLEND_PX;

  for (let i = 0; i < NUM_BONES; i++) out[i] = 0;

  // Per-row mid x and core width interpolated at this y
  const rowMid  = mx[py];
  const distFromMid = px - rowMid;

  // Fraction through torso zone for core width interpolation
  const torsoFrac = clamp01((py - shoulderY) / Math.max(1, waistY - shoulderY));
  const coreHalf  = lerp(coreHalfShoulder, coreHalfWaist, torsoFrac);

  // ── HAIR: above hairEndY, blends into HEAD ─────────────────────────────
  out[B_HAIR] = ss(neckY, hairEndY, py);   // peaks at top, fades toward neck

  // ── HEAD: hairEnd → shoulder zone ─────────────────────────────────────
  out[B_HEAD] = ss(headTopY, hairEndY, py) *    // rises from hairEnd
                ss(shoulderY + BP, neckY - BP, py);  // fades at shoulder

  // ── TORSO: neck → waist, within core width ─────────────────────────────
  {
    const vW  = ss(neckY - BP, neckY + BP, py) * ss(waistY + BP, waistY - BP, py);
    const hW  = ss(coreHalf + BP, coreHalf - BP, Math.abs(distFromMid));
    out[B_TORSO] = vW * hW;
  }

  // ── ARM_L: shoulder → waist, x < core left ────────────────────────────
  {
    const vW  = ss(shoulderY - BP, shoulderY + BP, py) * ss(waistY + BP, waistY - BP, py);
    const distLeft = rowMid - px - coreHalf;   // positive = left of core
    const hW  = ss(-BP, BP, distLeft);
    out[B_ARML] = vW * hW;
  }

  // ── ARM_R: shoulder → waist, x > core right ───────────────────────────
  {
    const vW  = ss(shoulderY - BP, shoulderY + BP, py) * ss(waistY + BP, waistY - BP, py);
    const distRight = px - rowMid - coreHalf;  // positive = right of core
    const hW  = ss(-BP, BP, distRight);
    out[B_ARMR] = vW * hW;
  }

  // ── HIPS: waist → crotch ──────────────────────────────────────────────
  out[B_HIPS] = ss(waistY - BP, waistY + BP, py) * ss(crotchY + BP, crotchY - BP, py);

  // ── LEG_L: crotch → bottom, x left of per-row mid ────────────────────
  {
    const vW  = ss(crotchY - BP, crotchY + BP, py);
    const hW  = ss(rowMid + BP, rowMid - BP, px);   // left of mid
    out[B_LEGL] = vW * hW;
  }

  // ── LEG_R: crotch → bottom, x right of per-row mid ───────────────────
  {
    const vW  = ss(crotchY - BP, crotchY + BP, py);
    const hW  = ss(rowMid - BP, rowMid + BP, px);   // right of mid
    out[B_LEGR] = vW * hW;
  }

  // ── Normalize ──────────────────────────────────────────────────────────
  let sum = 0;
  for (let i = 0; i < NUM_BONES; i++) sum += out[i];
  if (sum > 1e-4) {
    const inv = 1 / sum;
    for (let i = 0; i < NUM_BONES; i++) out[i] *= inv;
  } else {
    // Fallback: assign to nearest vertical region
    out[B_TORSO] = 1;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════════════════

/** Smoothstep: returns 1 at lo, 0 at hi (or reversed if lo > hi). */
function ss(lo, hi, x) {
  const t = clamp01((x - lo) / (hi - lo + 1e-6));
  return t < 0.5 ? 2*t*t : -2*t*t + 4*t - 1;   // smooth Hermite
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function clampY(y, lo, hi) { return y < lo ? lo : y > hi ? hi : y; }
function lerp(a, b, t) { return a + (b - a) * t; }

function smoothArr(arr, y0, y1, win) {
  const out = new Float32Array(arr.length);
  const h   = win >> 1;
  for (let y = y0; y <= y1; y++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(y0, y - h); j <= Math.min(y1, y + h); j++) {
      sum += arr[j]; cnt++;
    }
    out[y] = sum / cnt;
  }
  return out;
}
