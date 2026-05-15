// bodyDetect.js — cuts a bg-removed character into puppet limb canvases
// Each part has a local anchor (the joint pivot in part-canvas pixels)
// and a world position (where that anchor sits on the source character).
// No warp math. Pure canvas regions. Overlapping edges hide seams.

const ALPHA    = 18;
const SMOOTH   = 7;
const OVERLAP  = 8;   // px each part extends past its anatomical boundary to hide seams
const TRIM_PCT = 0.10; // trim 10% each side for landmark detection (ignores weapons)

// ─────────────────────────────────────────────────────────────────────────────
// Main entry
// adjustments = { neck, shoulder, waist, hips } — user slider offsets in px
// ─────────────────────────────────────────────────────────────────────────────
export async function detectPuppet(charCanvas, adjustments = {}, onProgress = () => {}) {
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

  onProgress(0.15);

  // ── 2. Row profiles ───────────────────────────────────────────────────────
  const lxArr = new Float32Array(H);
  const rxArr = new Float32Array(H);
  const cxArr = new Float32Array(H);  // alpha-weighted centroid x
  const wdArr = new Float32Array(H);  // raw span
  const twArr = new Float32Array(H);  // trimmed span

  for (let y = y0; y <= y1; y++) {
    let l = -1, r = -1, cnt = 0, sumX = 0, sumA = 0;
    for (let x = x0; x <= x1; x++) {
      const a = d[(y * W + x) * 4 + 3];
      if (a > ALPHA) {
        if (l < 0) l = x; r = x; cnt++;
        sumX += x * a; sumA += a;
      }
    }
    if (l < 0) { l = r = (x0 + x1) >> 1; }
    lxArr[y] = l; rxArr[y] = r;
    cxArr[y] = sumA > 0 ? sumX / sumA : (l + r) * 0.5;
    wdArr[y] = r - l + 1;

    // trimmed width
    const trim = Math.max(1, Math.ceil(cnt * TRIM_PCT));
    let tl = l, tr = r, cl = 0, cr = 0;
    for (let x = l; x <= r; x++) { if (d[(y*W+x)*4+3] > ALPHA && ++cl >= trim) { tl = x; break; } }
    for (let x = r; x >= l; x--) { if (d[(y*W+x)*4+3] > ALPHA && ++cr >= trim) { tr = x; break; } }
    twArr[y] = Math.max(1, tr - tl + 1);
  }

  const sw  = smoothArr(wdArr, y0, y1, SMOOTH);  // full
  const stw = smoothArr(twArr, y0, y1, SMOOTH);  // trimmed, for landmarks

  onProgress(0.30);

  // ── 3. Landmark detection (on trimmed width) ──────────────────────────────
  const BH  = y1 - y0 + 1;
  const rel = f => y0 + Math.min(BH - 1, Math.floor(Math.max(0, f) * BH));

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

  // Apply user adjustments (slider offsets)
  const adj = { neck: 0, shoulder: 0, waist: 0, hips: 0, ...adjustments };

  const neckY     = clamp(findMin(0.10, 0.38) + adj.neck,     y0, y1);
  const shoulderY = clamp(findMax(0.12, 0.44) + adj.shoulder, y0, y1);
  const waistY    = clamp(findMin(0.38, 0.64) + adj.waist,    y0, y1);
  const hipY      = clamp(findMax(Math.max(0.44, (waistY - y0) / BH + 0.02), 0.72) + adj.hips, y0, y1);

  // Crotch: density drop below hip
  let crotchY = rel(0.72);
  for (let y = hipY + 1; y <= rel(0.84); y++) {
    if (stw[y] < stw[hipY] * 0.65) { crotchY = y; break; }
  }

  // Hair end (35% of the way from top to neck)
  const hairEndY = Math.round(y0 + (neckY - y0) * 0.38);

  onProgress(0.45);

  // ── 4. Body centre X at key rows ─────────────────────────────────────────
  const cx = y => cxArr[clamp(y, y0, y1)];

  // For side-view sprites, detect which side has the "front" arm/leg.
  // We look at where the mass is concentrated relative to the torso centroid.
  const torsoCX   = cx(Math.round((shoulderY + waistY) / 2));
  const hipCX     = cx(Math.round((hipY + crotchY) / 2));

  // Leg pivots: split left/right at hip centroid
  const legSplit  = hipCX;
  const legACX    = cx(y1) < legSplit
                  ? cx(y1 - Math.floor((y1 - crotchY) * 0.4))  // left leg centre
                  : legSplit - stw[crotchY] * 0.25;
  const legBCX    = legSplit + stw[crotchY] * 0.25;

  // Arm pivots (left/right of torso at shoulder height)
  const armACX    = torsoCX - stw[shoulderY] * 0.38;  // "back" arm (further from camera for right-facing)
  const armBCX    = torsoCX + stw[shoulderY] * 0.38;  // "front" arm

  onProgress(0.55);

  // ── 5. Extract parts ──────────────────────────────────────────────────────
  // Each part: full-width slice of the character at its height band.
  // We use OVERLAP px above/below the anatomical cut to hide seams.

  const parts = {};

  // hair — top to hairEnd + overlap below
  parts.hair = extractRegion(d, W, H,
    x0, y0,
    x1, Math.min(y1, hairEndY + OVERLAP),
    { ax: torsoCX - x0, ay: hairEndY - y0 }   // anchor at hair-end (connects to head)
  );

  // head — hairEnd to shoulderY + overlap
  parts.head = extractRegion(d, W, H,
    x0, Math.max(y0, hairEndY - OVERLAP),
    x1, Math.min(y1, shoulderY + OVERLAP),
    { ax: torsoCX - x0, ay: neckY - (hairEndY - OVERLAP) }  // anchor at neck
  );

  // torso — shoulderY to waistY + overlap both sides
  parts.torso = extractRegion(d, W, H,
    x0, Math.max(y0, shoulderY - OVERLAP),
    x1, Math.min(y1, waistY + OVERLAP),
    { ax: torsoCX - x0, ay: 0 + OVERLAP }   // anchor at shoulder top
  );

  // hips — waistY to crotchY + overlap
  parts.hips = extractRegion(d, W, H,
    x0, Math.max(y0, waistY - OVERLAP),
    x1, Math.min(y1, crotchY + OVERLAP),
    { ax: hipCX - x0, ay: 0 + OVERLAP }   // anchor at waist
  );

  // legA (left/back leg) — crotchY downward, left side
  parts.legA = extractRegion(d, W, H,
    x0, Math.max(y0, crotchY - OVERLAP),
    Math.round(legSplit + OVERLAP), y1,
    { ax: legACX - x0, ay: 0 + OVERLAP }  // anchor at hip joint
  );

  // legB (right/front leg)
  parts.legB = extractRegion(d, W, H,
    Math.max(x0, Math.round(legSplit - OVERLAP)), Math.max(y0, crotchY - OVERLAP),
    x1, y1,
    { ax: legBCX - Math.max(x0, Math.round(legSplit - OVERLAP)), ay: 0 + OVERLAP }
  );

  // armA (back arm) — shoulder to waist height, left side
  parts.armA = extractRegion(d, W, H,
    x0, Math.max(y0, shoulderY - OVERLAP),
    Math.round(torsoCX + OVERLAP), Math.min(y1, waistY + OVERLAP * 2),
    { ax: armACX - x0, ay: 0 + OVERLAP }
  );

  // armB (front arm) — right side
  parts.armB = extractRegion(d, W, H,
    Math.max(x0, Math.round(torsoCX - OVERLAP)), Math.max(y0, shoulderY - OVERLAP),
    x1, Math.min(y1, waistY + OVERLAP * 2),
    { ax: armBCX - Math.max(x0, Math.round(torsoCX - OVERLAP)), ay: 0 + OVERLAP }
  );

  onProgress(0.85);

  // ── 6. World joint positions (in source-canvas px) ────────────────────────
  const joints = {
    hairEnd:   { x: torsoCX, y: hairEndY },
    neck:      { x: torsoCX, y: neckY    },
    shoulder:  { x: torsoCX, y: shoulderY },
    waist:     { x: hipCX,   y: waistY   },
    hipA:      { x: legACX,  y: crotchY  },
    hipB:      { x: legBCX,  y: crotchY  },
    shoulderA: { x: armACX,  y: shoulderY },
    shoulderB: { x: armBCX,  y: shoulderY },
  };

  onProgress(1.0);

  return {
    parts,
    joints,
    bb,
    groundY: y1,   // lowest visible pixel = foot contact line
    landmarks: { neckY, shoulderY, waistY, hipY, crotchY, hairEndY },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract a rectangular region from source pixel data into its own canvas.
// ax/ay = anchor/pivot point in the new canvas's local coordinates.
// ─────────────────────────────────────────────────────────────────────────────
function extractRegion(d, srcW, srcH, sx0, sy0, sx1, sy1, anchor) {
  sx0 = Math.max(0, sx0 | 0);
  sy0 = Math.max(0, sy0 | 0);
  sx1 = Math.min(srcW - 1, sx1 | 0);
  sy1 = Math.min(srcH - 1, sy1 | 0);
  if (sx0 >= sx1 || sy0 >= sy1) return null;

  const pw = sx1 - sx0 + 1;
  const ph = sy1 - sy0 + 1;
  const pc = document.createElement('canvas');
  pc.width  = pw;
  pc.height = ph;
  const pCtx = pc.getContext('2d');
  const pImg = pCtx.createImageData(pw, ph);
  const pd   = pImg.data;

  for (let y = sy0; y <= sy1; y++) {
    for (let x = sx0; x <= sx1; x++) {
      const si = (y * srcW + x) * 4;
      const di = ((y - sy0) * pw + (x - sx0)) * 4;
      pd[di]   = d[si];
      pd[di+1] = d[si+1];
      pd[di+2] = d[si+2];
      pd[di+3] = d[si+3];
    }
  }
  pCtx.putImageData(pImg, 0, 0);

  // clamp anchor into canvas bounds
  const ax = Math.max(0, Math.min(pw - 1, Math.round(anchor.ax)));
  const ay = Math.max(0, Math.min(ph - 1, Math.round(anchor.ay)));

  return { canvas: pc, anchorX: ax, anchorY: ay, srcX: sx0, srcY: sy0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────
function smoothArr(arr, y0, y1, win) {
  const out = new Float32Array(arr.length), h = win >> 1;
  for (let y = y0; y <= y1; y++) {
    let s = 0, n = 0;
    for (let j = Math.max(y0, y-h); j <= Math.min(y1, y+h); j++) { s += arr[j]; n++; }
    out[y] = s / n;
  }
  return out;
}

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
