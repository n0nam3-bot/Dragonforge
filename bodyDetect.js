// bodyDetect.js — skeleton detection + LBS weight maps
// Uses alpha-weighted centroid and trimmed widths so weapons/hair
// don't distort landmark positions. Produces a TORSO-CENTRED bb
// so every frame is padded around the body core, not the sword tip.

const ALPHA      = 18;
const SMOOTH_WIN = 9;
const BLEND_PX   = 14;

export const B_HAIR  = 0;
export const B_HEAD  = 1;
export const B_TORSO = 2;
export const B_ARML  = 3;
export const B_ARMR  = 4;
export const B_HIPS  = 5;
export const B_LEGL  = 6;
export const B_LEGR  = 7;
export const NUM_BONES = 8;
export const BONE_IDS  = ['hair','head','torso','armL','armR','hips','legL','legR'];

// ── Entry point ───────────────────────────────────────────────────────────────
export async function detectSkeleton(charCanvas, onProgress = () => {}) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;

  onProgress(0.05);

  // ── 1. Full bounding box ─────────────────────────────────────────────────
  let fx0 = W, fx1 = 0, fy0 = H, fy1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > ALPHA) {
        if (x < fx0) fx0 = x; if (x > fx1) fx1 = x;
        if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
      }
    }
  }
  if (fx0 > fx1) return null;

  onProgress(0.10);

  // ── 2. Row profiles ───────────────────────────────────────────────────────
  const lxArr = new Float32Array(H);
  const rxArr = new Float32Array(H);
  const mxArr = new Float32Array(H);   // alpha-weighted centroid x
  const wdArr = new Float32Array(H);   // raw span
  const dnArr = new Float32Array(H);   // fg pixel count
  const twArr = new Float32Array(H);   // 12%-trimmed span

  for (let y = fy0; y <= fy1; y++) {
    let l = -1, r = -1, cnt = 0, sumX = 0, sumA = 0;
    for (let x = fx0; x <= fx1; x++) {
      const a = d[(y * W + x) * 4 + 3];
      if (a > ALPHA) {
        if (l < 0) l = x; r = x; cnt++;
        sumX += x * a; sumA += a;
      }
    }
    if (l < 0) { l = r = (fx0 + fx1) >> 1; }
    lxArr[y] = l; rxArr[y] = r;
    mxArr[y] = sumA > 0 ? sumX / sumA : (l + r) * 0.5;
    wdArr[y] = r - l + 1;
    dnArr[y] = cnt;

    // trimmed width — strip outermost 12% each side
    const trim = Math.max(1, Math.ceil(cnt * 0.12));
    let tl = l, tr = r, cl = 0, cr = 0;
    for (let x = l; x <= r; x++) {
      if (d[(y * W + x) * 4 + 3] > ALPHA && ++cl >= trim) { tl = x; break; }
    }
    for (let x = r; x >= l; x--) {
      if (d[(y * W + x) * 4 + 3] > ALPHA && ++cr >= trim) { tr = x; break; }
    }
    twArr[y] = Math.max(1, tr - tl + 1);
  }

  const sw  = smoothArr(wdArr, fy0, fy1, SMOOTH_WIN);   // full width (for weight maps)
  const stw = smoothArr(twArr, fy0, fy1, SMOOTH_WIN);   // trimmed (for landmarks)

  onProgress(0.25);

  // ── 3. Landmark detection ────────────────────────────────────────────────
  const lm = findLandmarks(stw, dnArr, mxArr, fy0, fy1);

  onProgress(0.38);

  // ── 4. Body-centred bounding box ─────────────────────────────────────────
  // Pad around the torso centre rather than the full silhouette.
  // This prevents the sword from shifting the character off-centre in frames.
  const bodyHalfW = Math.max(lm.shoulderW, lm.hipW) * 0.75;
  const bodyCX    = mxArr[lm.shoulderY];
  const bbX0 = Math.max(0,   Math.floor(bodyCX - bodyHalfW * 2.2));
  const bbX1 = Math.min(W-1, Math.ceil (bodyCX + bodyHalfW * 2.2));
  const bb   = {
    x: bbX0,
    y: fy0,
    w: bbX1 - bbX0 + 1,
    h: fy1  - fy0  + 1,
    // keep the full image extent so weight-map lookups are still valid
    fullX0: fx0, fullX1: fx1,
  };

  onProgress(0.44);

  // ── 5. Pivot points ───────────────────────────────────────────────────────
  const pivots = buildPivots(lm, mxArr, sw);

  onProgress(0.50);

  // ── 6. Per-pixel LBS weight maps ─────────────────────────────────────────
  const weights = Array.from({ length: NUM_BONES }, () => new Float32Array(W * H));
  const tmp     = new Float32Array(NUM_BONES);

  for (let y = fy0; y <= fy1; y++) {
    const lx = lxArr[y] | 0, rx = rxArr[y] | 0;
    for (let x = lx; x <= rx; x++) {
      if (d[(y * W + x) * 4 + 3] <= ALPHA) continue;
      computeWeights(x, y, lm, mxArr, wdArr, sw, tmp);
      const pi = y * W + x;
      for (let b = 0; b < NUM_BONES; b++) weights[b][pi] = tmp[b];
    }
    if ((y - fy0) % 25 === 0) onProgress(0.50 + 0.46 * (y - fy0) / bb.h);
  }

  onProgress(0.98);

  return {
    srcData: imgData, srcW: W, srcH: H,
    bb, lm, pivots, weights,
    mxArr, lxArr, rxArr, sw,
    // ankle Y in source pixels — used by animator for ground constraint
    ankleY: lm.ankleY,
    groundY: fy1,       // lowest visible pixel (actual foot/ground contact)
  };
}

// ════════════════════════════════════════════════════════════════════════════
// LANDMARK DETECTION
// ════════════════════════════════════════════════════════════════════════════
function findLandmarks(stw, dn, mx, y0, y1) {
  const BH  = y1 - y0 + 1;
  const rel = f => y0 + Math.min(BH - 1, Math.floor(clamp01(f) * BH));

  const findMin = (fa, fb) => {
    let v = Infinity, row = rel(fa);
    for (let y = rel(fa); y <= rel(fb); y++) {
      if (stw[y] > 1 && stw[y] < v) { v = stw[y]; row = y; }
    }
    return row;
  };
  const findMax = (fa, fb) => {
    let v = 0, row = rel(fa);
    for (let y = rel(fa); y <= rel(fb); y++) {
      if (stw[y] > v) { v = stw[y]; row = y; }
    }
    return row;
  };

  const headTopY   = y0;
  const neckY      = findMin(0.12, 0.38);
  const hairEndY   = Math.round(headTopY + (neckY - headTopY) * 0.32);
  const shoulderY  = findMax(0.14, 0.44);
  const waistY     = findMin(0.38, 0.64);
  const hipY       = findMax(Math.max(0.44, (waistY - y0) / BH + 0.02), 0.72);
  const shoulderW  = stw[shoulderY];
  const waistW     = stw[waistY];
  const hipW       = stw[hipY];
  const neckW      = stw[neckY];

  // Crotch: density drop below hip
  let crotchY = rel(0.72);
  for (let y = hipY + 1; y <= rel(0.84); y++) {
    if (dn[y] < dn[hipY] * 0.65 && stw[y] < hipW * 0.65) { crotchY = y; break; }
  }

  const ankleY   = Math.round(crotchY + (y1 - crotchY) * 0.86);
  const coreHalfShoulder = Math.max(waistW, neckW) / 2 * 1.10;
  const coreHalfWaist    = waistW / 2 * 0.95;

  return {
    headTopY, hairEndY, neckY, shoulderY, waistY, hipY, crotchY, ankleY,
    shoulderW, waistW, hipW, neckW, coreHalfShoulder, coreHalfWaist,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PIVOTS
// ════════════════════════════════════════════════════════════════════════════
function buildPivots(lm, mx, sw) {
  const mid  = y => mx[y] || 0;
  const half = y => (sw[y] || 0) * 0.5;
  return {
    hair:  { x: mid(lm.hairEndY),  y: lm.hairEndY  },
    head:  { x: mid(lm.neckY),     y: lm.neckY     },
    torso: { x: mid(lm.waistY),    y: lm.waistY    },
    armL:  { x: mid(lm.shoulderY) - half(lm.shoulderY) * 0.50, y: lm.shoulderY },
    armR:  { x: mid(lm.shoulderY) + half(lm.shoulderY) * 0.50, y: lm.shoulderY },
    hips:  { x: mid(lm.waistY),    y: lm.waistY    },
    legL:  { x: mid(lm.hipY) - half(lm.hipY) * 0.36, y: lm.hipY },
    legR:  { x: mid(lm.hipY) + half(lm.hipY) * 0.36, y: lm.hipY },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PER-PIXEL WEIGHTS
// ════════════════════════════════════════════════════════════════════════════
function computeWeights(px, py, lm, mx, wd, sw, out) {
  const { headTopY, hairEndY, neckY, shoulderY, waistY, hipY, crotchY,
          coreHalfShoulder, coreHalfWaist } = lm;
  const BP = BLEND_PX;

  for (let i = 0; i < NUM_BONES; i++) out[i] = 0;

  const rowMid = mx[py] || 0;
  const dist   = px - rowMid;
  const tFrac  = clamp01((py - shoulderY) / Math.max(1, waistY - shoulderY));
  const coreH  = lerp(coreHalfShoulder, coreHalfWaist, tFrac);

  out[B_HAIR]  = ss(neckY,    hairEndY, py);
  out[B_HEAD]  = ss(headTopY, hairEndY, py) * ss(shoulderY + BP, neckY - BP, py);
  out[B_TORSO] = ss(neckY - BP, neckY + BP, py)
               * ss(waistY + BP, waistY - BP, py)
               * ss(coreH + BP, coreH - BP, Math.abs(dist));
  out[B_ARML]  = ss(shoulderY - BP, shoulderY + BP, py)
               * ss(waistY + BP, waistY - BP, py)
               * ss(-BP, BP, rowMid - px - coreH);
  out[B_ARMR]  = ss(shoulderY - BP, shoulderY + BP, py)
               * ss(waistY + BP, waistY - BP, py)
               * ss(-BP, BP, px - rowMid - coreH);
  out[B_HIPS]  = ss(waistY - BP, waistY + BP, py)
               * ss(crotchY + BP, crotchY - BP, py);
  const legV   = ss(crotchY - BP, crotchY + BP, py);
  out[B_LEGL]  = legV * ss(rowMid + BP, rowMid - BP, px);
  out[B_LEGR]  = legV * ss(rowMid - BP, rowMid + BP, px);

  // normalise
  let sum = 0;
  for (let i = 0; i < NUM_BONES; i++) sum += out[i];
  if (sum > 1e-4) { const inv = 1/sum; for (let i = 0; i < NUM_BONES; i++) out[i] *= inv; }
  else out[B_TORSO] = 1;
}

// ════════════════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════════════════
function ss(lo, hi, x) {
  const t = clamp01((x - lo) / (hi - lo + 1e-6));
  return 3*t*t - 2*t*t*t;
}
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp    = (a, b, t) => a + (b - a) * t;
function smoothArr(arr, y0, y1, win) {
  const out = new Float32Array(arr.length), h = win >> 1;
  for (let y = y0; y <= y1; y++) {
    let s = 0, n = 0;
    for (let j = Math.max(y0, y-h); j <= Math.min(y1, y+h); j++) { s += arr[j]; n++; }
    out[y] = s / n;
  }
  return out;
}
