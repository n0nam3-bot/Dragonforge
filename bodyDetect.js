// bodyDetect.js — Width-profile body segmentation + per-part canvas extraction
// Works on any humanoid sprite, auto-detects proportions and facing direction.

const ALPHA = 20;          // minimum alpha to count as foreground
const SMOOTH_WIN = 7;      // moving-average window for width profile
const ARM_SLACK = 0.18;    // fraction of core width added as margin before calling pixels "arm"

// ── Public types ──────────────────────────────────────────────────────────────
// parts:  { hair, head, torso, armL, armR, hips, legL, legR }  (any may be missing)
// Each part: { canvas, anchorX, anchorY }
//   anchorX/Y = the joint pivot point IN this canvas's local pixel coords
// joints: { neck, shoulderL, shoulderR, waist, hipL, hipR, kneeL, kneeR, ankleL, ankleR }
//   All in the original charCanvas pixel coordinate space

// ── Entry point ───────────────────────────────────────────────────────────────
export async function detectBodyParts(charCanvas, onProgress = () => {}) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const d   = ctx.getImageData(0, 0, W, H).data;

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
  const BH = bb.h;

  onProgress(0.15);

  // ── 2. Row profiles ───────────────────────────────────────────────────────
  const lx = new Float32Array(BH);   // leftmost pixel per row
  const rx = new Float32Array(BH);   // rightmost pixel per row
  const mx = new Float32Array(BH);   // midpoint per row
  const wd = new Float32Array(BH);   // pixel count per row
  const density = new Float32Array(BH); // non-transparent pixels per row

  for (let r = 0; r < BH; r++) {
    const y = bb.y + r;
    let l = -1, ri = -1, cnt = 0;
    for (let x = bb.x; x <= x1; x++) {
      if (d[(y * W + x) * 4 + 3] > ALPHA) {
        if (l < 0) l = x;
        ri = x;
        cnt++;
      }
    }
    if (l < 0) { l = ri = (bb.x + x1) >> 1; }
    lx[r] = l; rx[r] = ri; mx[r] = (l + ri) / 2; wd[r] = ri - l + 1;
    density[r] = cnt;
  }

  // Smoothed width for landmark detection
  const sw = smooth(wd, SMOOTH_WIN);

  onProgress(0.30);

  // ── 3. Anatomical landmarks ───────────────────────────────────────────────
  const lm = findLandmarks(sw, density, BH, bb);

  onProgress(0.45);

  // ── 4. Symmetry / facing detection ────────────────────────────────────────
  const isFront = isSymmetric(lx, rx, mx, BH, lm);

  // ── 5. Pixel-to-part assignment ───────────────────────────────────────────
  onProgress(0.55);
  const MASK_HAIR  = 1, MASK_HEAD  = 2, MASK_TORSO = 3,
        MASK_ARML  = 4, MASK_ARMR  = 5, MASK_HIPS  = 6,
        MASK_LEGL  = 7, MASK_LEGR  = 8;

  const mask = new Uint8Array(W * H);
  buildMask(d, mask, W, bb, lm, lx, rx, mx, sw, isFront,
    MASK_HAIR, MASK_HEAD, MASK_TORSO, MASK_ARML, MASK_ARMR, MASK_HIPS, MASK_LEGL, MASK_LEGR);

  onProgress(0.70);

  // ── 6. Extract parts to separate canvases ────────────────────────────────
  const PAD = 6; // pixel padding around each extracted part
  const extractMap = {
    hair:  MASK_HAIR,
    head:  MASK_HEAD,
    torso: MASK_TORSO,
    armL:  MASK_ARML,
    armR:  MASK_ARMR,
    hips:  MASK_HIPS,
    legL:  MASK_LEGL,
    legR:  MASK_LEGR,
  };
  const parts = {};
  for (const [pid, mv] of Object.entries(extractMap)) {
    const p = extractPart(d, mask, W, H, mv, PAD);
    if (p) parts[pid] = p;
  }

  onProgress(0.88);

  // ── 7. World-space joint positions ────────────────────────────────────────
  const joints = buildJoints(lm, bb, mx, lx, rx, sw);

  // ── 8. Attach anchor points to each part ─────────────────────────────────
  attachAnchors(parts, joints, PAD);

  onProgress(1.0);
  return { parts, joints, bb, isFront, landmarks: lm };
}

// ════════════════════════════════════════════════════════════════════════════
// LANDMARK DETECTION
// ════════════════════════════════════════════════════════════════════════════

function findLandmarks(sw, density, BH, bb) {
  const maxW = Math.max(...sw);

  // Helper: find local minimum in sw within [a%,b%] of BH
  const findMin = (a, b) => {
    let minV = Infinity, minR = Math.floor(a * BH);
    for (let r = Math.floor(a * BH); r < Math.floor(b * BH); r++) {
      if (sw[r] < minV && sw[r] > 0) { minV = sw[r]; minR = r; }
    }
    return minR;
  };

  // Helper: find local maximum in sw within [a%,b%] of BH
  const findMax = (a, b) => {
    let maxV = 0, maxR = Math.floor(a * BH);
    for (let r = Math.floor(a * BH); r < Math.floor(b * BH); r++) {
      if (sw[r] > maxV) { maxV = sw[r]; maxR = r; }
    }
    return maxR;
  };

  // --- Head: widest region in top 30%
  const headMaxRow  = findMax(0.00, 0.30);
  const headWidth   = sw[headMaxRow];

  // --- Neck: narrowest in [15%, 40%], must be at least 15% narrower than head
  let neckRow = findMin(0.15, 0.40);
  if (sw[neckRow] > headWidth * 0.85) neckRow = Math.floor(0.22 * BH); // fallback

  // --- Shoulders: widest in [15%, 42%] BELOW neck
  const shoulderRow = findMax(Math.max(0.15, neckRow / BH), 0.45);

  // --- Waist: narrowest in [35%, 65%]
  const waistRow = findMin(0.35, 0.65);

  // --- Hips: widest in [45%, 72%] BELOW waist
  const hipRow = findMax(Math.max(0.45, waistRow / BH), 0.72);

  // --- Crotch: find where the silhouette splits into two legs
  //     Look for a density drop in [65%, 80%] that suggests a gap
  let crotchRow = Math.floor(0.70 * BH);
  for (let r = Math.floor(0.62 * BH); r < Math.floor(0.80 * BH); r++) {
    const prev = density[r - 1] || density[r];
    if (density[r] < prev * 0.75 && density[r] < maxW * 0.55) {
      crotchRow = r;
      break;
    }
  }
  // Also try actual gap detection: any row with two separate filled segments
  const legSplitRow = detectLegGap(density, BH, crotchRow);
  if (legSplitRow) crotchRow = legSplitRow;

  // --- Knee: midpoint of leg zone
  const kneeRow = Math.floor((crotchRow + BH) / 2);

  // --- Ankle: 90% of leg zone
  const ankleRow = Math.floor(crotchRow + (BH - crotchRow) * 0.85);

  // --- Hair/head split: top 35% of head region
  const hairEndRow = Math.floor(neckRow * 0.38);

  return {
    hairEndRow, neckRow, shoulderRow, waistRow, hipRow, crotchRow, kneeRow, ankleRow,
    headWidth, maxWidth: maxW, shoulderWidth: sw[shoulderRow], waistWidth: sw[waistRow],
    hipWidth: sw[hipRow],
  };
}

// Look for a row where the silhouette has a genuine horizontal gap (two separate legs)
function detectLegGap(density, BH, fallback) {
  // We'd need leftEdge data; use a simplified density-drop heuristic
  return null; // Handled above with density drop
}

// ════════════════════════════════════════════════════════════════════════════
// SYMMETRY / FACING
// ════════════════════════════════════════════════════════════════════════════

function isSymmetric(lx, rx, mx, BH, lm) {
  const start = lm.neckRow;
  const end   = Math.min(BH - 1, lm.waistRow);
  let asym = 0, count = 0;
  for (let r = start; r <= end; r++) {
    const leftD  = mx[r] - lx[r];
    const rightD = rx[r] - mx[r];
    const total  = leftD + rightD;
    if (total > 4) { asym += Math.abs(leftD - rightD) / total; count++; }
  }
  return count > 0 && (asym / count) < 0.22; // <22% average asymmetry → front-facing
}

// ════════════════════════════════════════════════════════════════════════════
// PIXEL MASK BUILDER
// ════════════════════════════════════════════════════════════════════════════

function buildMask(d, mask, W, bb, lm, lx, rx, mx, sw, isFront,
  MH, MHD, MT, MAL, MAR, MHP, MLL, MLR) {

  const { hairEndRow, neckRow, shoulderRow, waistRow, crotchRow } = lm;

  for (let r = 0; r < bb.h; r++) {
    const y   = bb.y + r;
    const rl  = lx[r] | 0;
    const rr  = rx[r] | 0;
    const rMid = mx[r];

    for (let x = rl; x <= rr; x++) {
      if (d[(y * W + x) * 4 + 3] <= ALPHA) continue;
      const idx = y * W + x;

      // ── Hair / Head ──
      if (r < hairEndRow) { mask[idx] = MH;  continue; }
      if (r < neckRow)    { mask[idx] = MHD; continue; }

      // ── Torso + Arms ──
      if (r < waistRow) {
        // Estimate "core torso" width via linear interpolation neck→waist
        const t        = (r - neckRow) / Math.max(1, waistRow - neckRow);
        // At neck, core is roughly neck-width; at waist, roughly waist-width
        const coreW    = lm.waistWidth + (lm.shoulderWidth - lm.waistWidth) * (1 - t);
        const coreHalf = (coreW / 2) * (1 + ARM_SLACK);
        const coreL    = rMid - coreHalf;
        const coreR    = rMid + coreHalf;

        if (x < coreL)      mask[idx] = MAL;
        else if (x > coreR) mask[idx] = MAR;
        else                mask[idx] = MT;
        continue;
      }

      // ── Hips ──
      if (r < crotchRow) { mask[idx] = MHP; continue; }

      // ── Legs ── split at the per-row midpoint
      mask[idx] = (x < rMid) ? MLL : MLR;
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PART EXTRACTION
// ════════════════════════════════════════════════════════════════════════════

function extractPart(d, mask, W, H, maskVal, pad) {
  // Find bounding box of this mask value
  let x0 = W, x1 = 0, y0 = H, y1 = 0, count = 0;
  for (let i = 0; i < W * H; i++) {
    if (mask[i] === maskVal) {
      const x = i % W, y = i / W | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      count++;
    }
  }
  if (count < 4 || x0 > x1) return null;

  const pw = x1 - x0 + 1 + pad * 2;
  const ph = y1 - y0 + 1 + pad * 2;
  const pc = document.createElement('canvas');
  pc.width = pw; pc.height = ph;
  const pd = pc.getContext('2d').createImageData(pw, ph);

  for (let i = 0; i < W * H; i++) {
    if (mask[i] !== maskVal) continue;
    const sx = i % W, sy = i / W | 0;
    const dx = sx - x0 + pad, dy = sy - y0 + pad;
    const si = i * 4, di = (dy * pw + dx) * 4;
    pd.data[di]     = d[si];
    pd.data[di + 1] = d[si + 1];
    pd.data[di + 2] = d[si + 2];
    pd.data[di + 3] = d[si + 3];
  }
  pc.getContext('2d').putImageData(pd, 0, 0);

  return {
    canvas: pc,
    // canvas-local coordinates of origin pixel (x0,y0) = (pad, pad)
    originX: x0, originY: y0,   // world coords of top-left of this part
    pad,
    // anchorX/Y will be set by attachAnchors() below
    anchorX: pw / 2, anchorY: ph / 2,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// JOINT POSITIONS  (world / original-canvas coordinates)
// ════════════════════════════════════════════════════════════════════════════

function buildJoints(lm, bb, mx, lx, rx, sw) {
  const mid    = (r) => mx[Math.min(r, bb.h - 1)];
  const worldY = (r) => bb.y + Math.min(r, bb.h - 1);
  const halfW  = (r) => sw[Math.min(r, bb.h - 1)] / 2;

  const neckW = sw[Math.min(lm.neckRow, bb.h - 1)];

  return {
    neck:       { x: mid(lm.neckRow),    y: worldY(lm.neckRow)    },
    shoulderL:  { x: mid(lm.shoulderRow) - halfW(lm.shoulderRow) * 0.6,
                  y: worldY(lm.shoulderRow) },
    shoulderR:  { x: mid(lm.shoulderRow) + halfW(lm.shoulderRow) * 0.6,
                  y: worldY(lm.shoulderRow) },
    waist:      { x: mid(lm.waistRow),   y: worldY(lm.waistRow)   },
    hipL:       { x: mid(lm.hipRow) - halfW(lm.hipRow) * 0.45,
                  y: worldY(lm.hipRow) },
    hipR:       { x: mid(lm.hipRow) + halfW(lm.hipRow) * 0.45,
                  y: worldY(lm.hipRow) },
    crotch:     { x: mid(lm.crotchRow),  y: worldY(lm.crotchRow)  },
    kneeL:      { x: lx[Math.min(lm.kneeRow, bb.h - 1)] +
                      sw[Math.min(lm.kneeRow, bb.h - 1)] * 0.25,
                  y: worldY(lm.kneeRow) },
    kneeR:      { x: rx[Math.min(lm.kneeRow, bb.h - 1)] -
                      sw[Math.min(lm.kneeRow, bb.h - 1)] * 0.25,
                  y: worldY(lm.kneeRow) },
    ankleL:     { x: lx[Math.min(lm.ankleRow, bb.h - 1)] +
                      sw[Math.min(lm.ankleRow, bb.h - 1)] * 0.2,
                  y: worldY(lm.ankleRow) },
    ankleR:     { x: rx[Math.min(lm.ankleRow, bb.h - 1)] -
                      sw[Math.min(lm.ankleRow, bb.h - 1)] * 0.2,
                  y: worldY(lm.ankleRow) },
    elbowL:     { x: mid(lm.shoulderRow) - halfW(lm.shoulderRow) * 0.6,
                  y: worldY(Math.floor((lm.shoulderRow + lm.waistRow) / 2)) },
    elbowR:     { x: mid(lm.shoulderRow) + halfW(lm.shoulderRow) * 0.6,
                  y: worldY(Math.floor((lm.shoulderRow + lm.waistRow) / 2)) },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ANCHOR ATTACHMENT — sets anchorX/Y on each extracted part
// The anchor is the joint pivot WITHIN that part's local canvas coords.
// ════════════════════════════════════════════════════════════════════════════

function attachAnchors(parts, joints, pad) {
  const toLocal = (part, wx, wy) => ({
    x: wx - part.originX + pad,
    y: wy - part.originY + pad,
  });

  if (parts.hair) {
    // Hair pivots from its bottom-center (= top of head)
    const p = parts.hair;
    p.anchorX = p.canvas.width / 2;
    p.anchorY = p.canvas.height - pad;
  }

  if (parts.head) {
    // Head pivots from neck (bottom-center of head region)
    const p = parts.head;
    const a = toLocal(p, joints.neck.x, joints.neck.y);
    p.anchorX = clamp(a.x, pad, p.canvas.width  - pad);
    p.anchorY = clamp(a.y, pad, p.canvas.height - pad);
  }

  if (parts.torso) {
    // Torso pivots from waist (its bottom)
    const p = parts.torso;
    const a = toLocal(p, joints.waist.x, joints.waist.y);
    p.anchorX = clamp(a.x, pad, p.canvas.width  - pad);
    p.anchorY = clamp(a.y, pad, p.canvas.height - pad);
  }

  if (parts.armL) {
    // Left arm pivots from shoulder
    const p = parts.armL;
    const a = toLocal(p, joints.shoulderL.x, joints.shoulderL.y);
    p.anchorX = clamp(a.x, 0, p.canvas.width  - 1);
    p.anchorY = clamp(a.y, 0, p.canvas.height - 1);
  }

  if (parts.armR) {
    const p = parts.armR;
    const a = toLocal(p, joints.shoulderR.x, joints.shoulderR.y);
    p.anchorX = clamp(a.x, 0, p.canvas.width  - 1);
    p.anchorY = clamp(a.y, 0, p.canvas.height - 1);
  }

  if (parts.hips) {
    // Hips pivot from waist (top of hips)
    const p = parts.hips;
    const a = toLocal(p, joints.waist.x, joints.waist.y);
    p.anchorX = clamp(a.x, pad, p.canvas.width  - pad);
    p.anchorY = clamp(a.y, pad, p.canvas.height - pad);
  }

  if (parts.legL) {
    const p = parts.legL;
    const a = toLocal(p, joints.hipL.x, joints.hipL.y);
    p.anchorX = clamp(a.x, 0, p.canvas.width  - 1);
    p.anchorY = clamp(a.y, 0, p.canvas.height - 1);
  }

  if (parts.legR) {
    const p = parts.legR;
    const a = toLocal(p, joints.hipR.x, joints.hipR.y);
    p.anchorX = clamp(a.x, 0, p.canvas.width  - 1);
    p.anchorY = clamp(a.y, 0, p.canvas.height - 1);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════════════════

function smooth(arr, win) {
  const out = new Float32Array(arr.length);
  const h   = win >> 1;
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(arr.length - 1, i + h); j++) {
      sum += arr[j]; cnt++;
    }
    out[i] = sum / cnt;
  }
  return out;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
