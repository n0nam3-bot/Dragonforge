// animator.js — LBS backward-warp renderer
// ALL bone transforms operate in SOURCE pixel space.
// renderFrame converts dest→source once, warps in source space, samples source image.
// No coordinate-space mixing. No seams. No cutting.

import { NUM_BONES, B_HAIR, B_HEAD, B_TORSO,
         B_ARML, B_ARMR, B_HIPS, B_LEGL, B_LEGR } from './bodyDetect.js';

export const POSES = [
  { id: 'idle',   label: 'IDLE',   ico: '🧍' },
  { id: 'walk',   label: 'WALK',   ico: '🚶' },
  { id: 'run',    label: 'RUN',    ico: '🏃' },
  { id: 'jump',   label: 'JUMP',   ico: '🦘' },
  { id: 'attack', label: 'ATTACK', ico: '⚔️'  },
  { id: 'hurt',   label: 'HURT',   ico: '💢' },
  { id: 'die',    label: 'DIE',    ico: '💀' },
  { id: 'crouch', label: 'CROUCH', ico: '🦆' },
  { id: 'cast',   label: 'CAST',   ico: '✨' },
];

// ── Math ──────────────────────────────────────────────────────────────────────
const DEG    = Math.PI / 180;
const sin1   = t => Math.sin(t * Math.PI * 2);
const cos1   = t => Math.cos(t * Math.PI * 2);
const sin2   = t => Math.sin(t * Math.PI * 4);
const abs1   = t => Math.abs(sin1(t));
const clamp  = (v,a,b) => v<a?a:v>b?b:v;
const clamp01= v => v<0?0:v>1?1:v;
const ease   = (t,p=2) => t<.5 ? Math.pow(t*2,p)/2 : 1-Math.pow((1-t)*2,p)/2;

// ── Affine matrix helpers — all in SOURCE pixel space ─────────────────────────
// Matrix layout: [a, b, c, d, tx, ty]
//   x' = a*x + b*y + tx
//   y' = c*x + d*y + ty

const matId = () => [1,0,0,1,0,0];
const matTrl = (dx,dy) => [1,0,0,1,dx,dy];

// Rotation by `ang` radians around source-pixel point (px, py)
const matRot = (ang, px, py) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [c, -s, s, c,  px - c*px + s*py,  py - s*px - c*py];
};

// Correct matrix composition: result maps x → B(A(x))  i.e. A first, then B
function matMul(A, B) {
  return [
    B[0]*A[0] + B[1]*A[2],   B[0]*A[1] + B[1]*A[3],
    B[2]*A[0] + B[3]*A[2],   B[2]*A[1] + B[3]*A[3],
    B[0]*A[4] + B[1]*A[5] + B[4],
    B[2]*A[4] + B[3]*A[5] + B[5],
  ];
}

// Apply matrix to point
const matApply = (m, x, y) => ({
  x: m[0]*x + m[1]*y + m[4],
  y: m[2]*x + m[3]*y + m[5],
});

// Invert a 2×3 affine matrix
function matInv(m) {
  const det = m[0]*m[3] - m[1]*m[2];
  if (Math.abs(det) < 1e-10) return matId();
  const i = 1 / det;
  const a =  m[3]*i, b = -m[1]*i, c = -m[2]*i, d = m[0]*i;
  return [a, b, c, d, -(a*m[4] + b*m[5]), -(c*m[4] + d*m[5])];
}

// Rotation around pivot + global SOURCE-pixel translation
const rotAt = (ang, px, py, dx=0, dy=0) => {
  const r = matRot(ang, px, py);
  return [r[0], r[1], r[2], r[3], r[4]+dx, r[5]+dy];
};

// ── Pose bone matrices — SOURCE PIXEL SPACE ───────────────────────────────────
// pivots: { hair,head,torso,armL,armR,hips,legL,legR } — x/y in source pixels
// bbH  : character bounding-box height in source pixels (for offset scaling)
// Returns Array(NUM_BONES) of forward 2×3 matrices.
// Forward = "where does this rest-pose pixel END UP after deformation?"
// We invert these for backward warp sampling.

export function getPoseBonesSource(pose, t, pivots, bbH) {
  const P = pivots;                            // shorthand
  const H = bbH;                               // source pixels for offset scale

  // Convenience: rotate bone around its own pivot
  const R  = (name, ang, dx=0, dy=0) => rotAt(ang, P[name].x, P[name].y, dx, dy);
  const ID = () => matId();

  switch (pose) {

    // ── IDLE ────────────────────────────────────────────────────────────────
    case 'idle': {
      const bob  = sin1(t) * H * 0.008;   // gentle vertical breathing
      const sway = sin1(t) * 1.2 * DEG;   // whole-body sway
      const arm  = (3 + abs1(t)*3) * DEG; // small arm hang
      return [
        /* B_HAIR  */ R('hair',  sway*2.0, 0, -bob*1.2),
        /* B_HEAD  */ R('head',  sway*0.4, 0, -bob),
        /* B_TORSO */ R('torso', sway*0.2, 0, -bob*0.6),
        /* B_ARML  */ R('armL',  arm,       0, -bob*0.5),
        /* B_ARMR  */ R('armR', -arm,       0, -bob*0.5),
        /* B_HIPS  */ R('hips', -sway*0.1, 0, -bob*0.3),
        /* B_LEGL  */ R('legL',  sway,      0, -bob*0.2),
        /* B_LEGR  */ R('legR', -sway,      0, -bob*0.2),
      ];
    }

    // ── WALK ────────────────────────────────────────────────────────────────
    case 'walk': {
      const bob  = abs1(t) * H * -0.016;        // step bounce (up on contact)
      const legS = sin1(t) * 30 * DEG;          // leg swing angle
      const armS = -sin1(t) * 22 * DEG;         // opposing arm swing
      const hip  = sin1(t) * 5  * DEG;          // hip sway
      const lean = 4 * DEG;                     // forward lean
      const hair = sin1(t) * 7  * DEG + lean;
      return [
        /* B_HAIR  */ R('hair',  hair,  0, bob*0.4),
        /* B_HEAD  */ R('head',  lean*0.5, 0, bob*0.5),
        /* B_TORSO */ R('torso', lean,  0, bob*0.4),
        /* B_ARML  */ R('armL',  armS,  0, bob*0.3),
        /* B_ARMR  */ R('armR', -armS,  0, bob*0.3),
        /* B_HIPS  */ R('hips',  hip,   0, bob*0.3),
        /* B_LEGL  */ R('legL',  legS,  0, 0),
        /* B_LEGR  */ R('legR', -legS,  0, 0),
      ];
    }

    // ── RUN ─────────────────────────────────────────────────────────────────
    case 'run': {
      const bob  = abs1(t) * H * -0.030;
      const legS = sin1(t) * 50 * DEG;
      const armS = -sin1(t) * 44 * DEG;
      const hip  = sin1(t) * 9  * DEG;
      const lean = 11 * DEG;
      const hair = sin1(t) * 15 * DEG + lean;
      return [
        /* B_HAIR  */ R('hair',  hair,     0, bob*0.5),
        /* B_HEAD  */ R('head',  lean*0.5, 0, bob*0.6),
        /* B_TORSO */ R('torso', lean,     0, bob*0.5),
        /* B_ARML  */ R('armL',  armS,     0, bob*0.4),
        /* B_ARMR  */ R('armR', -armS,     0, bob*0.4),
        /* B_HIPS  */ R('hips',  hip,      0, bob*0.3),
        /* B_LEGL  */ R('legL',  legS,     0, 0),
        /* B_LEGR  */ R('legR', -legS,     0, 0),
      ];
    }

    // ── JUMP ────────────────────────────────────────────────────────────────
    case 'jump': {
      const arc  = -Math.sin(t * Math.PI);        // 0→−1→0 (rise then fall)
      const tuck = arc * 30 * DEG;                // legs tuck at peak
      const armU = arc * -55 * DEG;               // arms raise at peak
      const lean = arc * 8  * DEG;
      const rise = arc * H * 0.12;               // whole-body vertical rise
      return [
        /* B_HAIR  */ R('hair',  lean*-0.6, 0, rise - arc*H*0.04),
        /* B_HEAD  */ R('head',  lean*-0.3, 0, rise*0.5),
        /* B_TORSO */ R('torso', lean,      0, 0),
        /* B_ARML  */ R('armL',  armU,  -H*0.012, arc*H*-0.01),
        /* B_ARMR  */ R('armR', -armU,   H*0.012, arc*H*-0.01),
        /* B_HIPS  */ ID(),
        /* B_LEGL  */ R('legL',  tuck,   H*0.012, 0),
        /* B_LEGR  */ R('legR', -tuck,  -H*0.012, 0),
      ];
    }

    // ── ATTACK ──────────────────────────────────────────────────────────────
    case 'attack': {
      // t: 0→0.3 wind-up (negative = pull back), 0.3→1 slash (positive = thrust)
      const slash = t < 0.3 ? -(t/0.3) : (t-0.3)/0.7;
      const armR  = (slash*115 - 55) * DEG;
      const twist = slash * 18 * DEG;
      const bob   = -Math.abs(slash) * H * 0.012;
      return [
        /* B_HAIR  */ R('hair',  twist*0.5, 0, bob*0.5),
        /* B_HEAD  */ R('head',  twist*0.3, 0, 0),
        /* B_TORSO */ R('torso', twist,     0, bob),
        /* B_ARML  */ R('armL', -20*DEG,   0, 0),
        /* B_ARMR  */ R('armR',  armR,     0, 0),
        /* B_HIPS  */ R('hips',  twist*0.4, 0, bob*0.5),
        /* B_LEGL  */ R('legL', -10*DEG,   0, 0),
        /* B_LEGR  */ R('legR',  16*DEG,   0, 0),
      ];
    }

    // ── HURT ────────────────────────────────────────────────────────────────
    case 'hurt': {
      const recoil = Math.sin(t * Math.PI) * -22 * DEG;
      const shake  = sin2(t) * 3 * DEG;
      const rise   = Math.sin(t * Math.PI) * H * -0.02;
      return [
        /* B_HAIR  */ R('hair',  recoil*-0.6+shake, 0, rise*0.5),
        /* B_HEAD  */ R('head',  recoil*-0.4,       0, rise*0.3),
        /* B_TORSO */ R('torso', recoil,             0, rise),
        /* B_ARML  */ R('armL',  recoil+22*DEG,     0, 0),
        /* B_ARMR  */ R('armR',  recoil-22*DEG,     0, 0),
        /* B_HIPS  */ R('hips',  recoil*0.4,        0, rise*0.4),
        /* B_LEGL  */ R('legL',  recoil*0.3,        0, 0),
        /* B_LEGR  */ R('legR',  recoil*0.3,        0, 0),
      ];
    }

    // ── DIE ─────────────────────────────────────────────────────────────────
    case 'die': {
      const fall = clamp01(ease(t, 2.5));
      const lean = fall * 85 * DEG;
      const drop = fall * H * 0.07;
      return [
        /* B_HAIR  */ R('hair',  lean*0.9,  0, drop),
        /* B_HEAD  */ R('head',  lean*0.8,  0, drop*0.8),
        /* B_TORSO */ R('torso', lean*0.85, 0, drop*0.5),
        /* B_ARML  */ R('armL',  lean*1.1,  0, drop*0.4),
        /* B_ARMR  */ R('armR', -lean*0.4,  0, drop*0.4),
        /* B_HIPS  */ R('hips',  lean*0.8,  0, drop*0.2),
        /* B_LEGL  */ R('legL',  lean*0.6,  0, 0),
        /* B_LEGR  */ R('legR',  lean*0.5,  0, 0),
      ];
    }

    // ── CROUCH ──────────────────────────────────────────────────────────────
    case 'crouch': {
      const d = clamp01(ease(clamp01(t*2), 2));   // 0→1 settle in
      const spread = d * 24 * DEG;
      const squat  = d * H * 0.065;
      const lean   = d * 9 * DEG;
      return [
        /* B_HAIR  */ R('hair',  0,       0, squat),
        /* B_HEAD  */ R('head',  lean,    0, squat*0.8),
        /* B_TORSO */ R('torso', lean,    0, squat*0.6),
        /* B_ARML  */ R('armL',  32*DEG, 0, squat*0.4),
        /* B_ARMR  */ R('armR', -32*DEG, 0, squat*0.4),
        /* B_HIPS  */ ID(),
        /* B_LEGL  */ R('legL',  spread, H*0.012, 0),
        /* B_LEGR  */ R('legR', -spread,-H*0.012, 0),
      ];
    }

    // ── CAST ────────────────────────────────────────────────────────────────
    case 'cast': {
      const raise  = Math.abs(cos1(t)) * -65 * DEG;
      const sway   = sin1(t) * 6  * DEG;
      const ripple = sin2(t) * 3  * DEG;
      const headDy = Math.abs(cos1(t)) * H * -0.005;
      return [
        /* B_HAIR  */ R('hair',  sway*1.5+ripple, 0, 0),
        /* B_HEAD  */ R('head',  sway*0.4,         0, headDy),
        /* B_TORSO */ R('torso', sway*0.2,         0, 0),
        /* B_ARML  */ R('armL',  raise-10*DEG,     0, 0),
        /* B_ARMR  */ R('armR',  sway,             0, 0),
        /* B_HIPS  */ R('hips', -sway*0.1,         0, 0),
        /* B_LEGL  */ R('legL',  sway*0.5,         0, 0),
        /* B_LEGR  */ R('legR', -sway*0.5,         0, 0),
      ];
    }

    default: return getPoseBonesSource('idle', t, pivots, bbH);
  }
}

// ── Main render ───────────────────────────────────────────────────────────────
/**
 * Render one animation frame onto ctx via LBS backward warp.
 * Everything runs in SOURCE pixel space — no coordinate confusion.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} skelData  — from detectSkeleton()
 * @param {string} pose
 * @param {number} t         — phase 0..1
 * @param {'left'|'right'} dir
 */
export function renderFrame(ctx, skelData, pose, t, dir) {
  const { srcData, srcW, srcH, bb, pivots, weights } = skelData;
  const DW = ctx.canvas.width;
  const DH = ctx.canvas.height;

  // Scale + offset: maps source pixel → dest canvas
  //   dest_x = src_x * scale + ox
  //   src_x  = (dest_x - ox) / scale   ← we use this to go dest→source
  const scale = Math.min((DW * 0.80) / bb.w, (DH * 0.82) / bb.h);
  const ox    = (DW - bb.w * scale) / 2 - bb.x * scale;
  const oy    = (DH - bb.h * scale) / 2 - bb.y * scale;

  // Build forward bone matrices (source space) and invert them
  const fwdMats = getPoseBonesSource(pose, t, pivots, bb.h);
  const invMats = fwdMats.map(matInv);

  // Global opacity for hurt/die
  let gAlpha = 1;
  if (pose === 'hurt') {
    const flash = t < 0.25 ? 1 : clamp01(1-(t-0.25)*5);
    gAlpha = 0.45 + 0.55*(1-flash*0.45);
  }
  if (pose === 'die' && t > 0.65) {
    gAlpha = clamp01(1-(t-0.65)/0.35);
  }

  // Output image buffer
  const outImg = ctx.createImageData(DW, DH);
  const out    = outImg.data;
  const src    = srcData.data;
  const wBuf   = new Float32Array(NUM_BONES);

  for (let dy = 0; dy < DH; dy++) {
    for (let dx = 0; dx < DW; dx++) {

      // ── Step 1: dest pixel → approximate SOURCE (rest) position ───────────
      // This is the "rest" source pixel that would normally appear at (dx,dy).
      let rSX = (dx - ox) / scale;
      let rSY = (dy - oy) / scale;

      // ── Step 2: look up bone weights at the rest source position ──────────
      const iX = Math.round(rSX) | 0;
      const iY = Math.round(rSY) | 0;
      if (iX < 0 || iY < 0 || iX >= srcW || iY >= srcH) continue;

      let totalW = 0;
      const wi = iY * srcW + iX;
      for (let b = 0; b < NUM_BONES; b++) {
        wBuf[b] = weights[b][wi];
        totalW += wBuf[b];
      }
      if (totalW < 0.01) continue;   // outside the character silhouette

      // ── Step 3: weighted blend of inverse-transformed SOURCE positions ─────
      // invMats[b] maps "animated source pos" → "rest source pos"
      // We use the INVERSE INVERSE: given rest source pos, where to sample?
      // i.e. fwdMats[b](rSX, rSY) gives where this rest pixel moves TO.
      // For backward sampling we actually need: given WHERE we are (rSX,rSY
      // in the animated frame), WHERE in the rest source was it?
      // That IS: invMats[b](rSX, rSY) — applying the inverse forward transform
      // to the query position.
      let fSX = 0, fSY = 0;
      const invTotal = 1 / totalW;
      for (let b = 0; b < NUM_BONES; b++) {
        const w = wBuf[b] * invTotal;
        if (w < 0.0001) continue;
        const sp = matApply(invMats[b], rSX, rSY);
        fSX += sp.x * w;
        fSY += sp.y * w;
      }

      // ── Step 4: bilinear sample from source image ─────────────────────────
      const sx0 = fSX | 0, sy0 = fSY | 0;
      const sx1 = sx0 + 1, sy1 = sy0 + 1;
      if (sx0 < 0 || sy0 < 0 || sx1 >= srcW || sy1 >= srcH) continue;

      const fx = fSX - sx0, fy = fSY - sy0;
      const wa = (1-fx)*(1-fy), wb = fx*(1-fy),
            wc = (1-fx)*fy,     wd = fx*fy;

      const i00 = (sy0*srcW + sx0)*4,  i10 = (sy0*srcW + sx1)*4;
      const i01 = (sy1*srcW + sx0)*4,  i11 = (sy1*srcW + sx1)*4;
      const oi  = (dy*DW + dx)*4;

      out[oi]   = src[i00]  *wa + src[i10]  *wb + src[i01]  *wc + src[i11]  *wd;
      out[oi+1] = src[i00+1]*wa + src[i10+1]*wb + src[i01+1]*wc + src[i11+1]*wd;
      out[oi+2] = src[i00+2]*wa + src[i10+2]*wb + src[i01+2]*wc + src[i11+2]*wd;
      out[oi+3] = Math.min(255,
                    src[i00+3]*wa + src[i10+3]*wb + src[i01+3]*wc + src[i11+3]*wd
                  ) * gAlpha;
    }
  }

  ctx.putImageData(outImg, 0, 0);

  // ── Direction flip: mirror the completed frame in-canvas ──────────────────
  if (dir === 'left') {
    const tmp = document.createElement('canvas');
    tmp.width = DW; tmp.height = DH;
    tmp.getContext('2d').putImageData(outImg, 0, 0);
    ctx.clearRect(0, 0, DW, DH);
    ctx.save();
    ctx.translate(DW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  // ── Effects overlay ───────────────────────────────────────────────────────
  if (pose === 'cast')  _drawCastGlow(ctx, DW, DH, t);
  if (pose === 'hurt')  _drawHurtFlash(ctx, DW, DH, t);
}

// ── Effects ───────────────────────────────────────────────────────────────────
function _drawCastGlow(ctx, DW, DH, t) {
  const glow = (1 + Math.sin(t * Math.PI * 4)) * 0.5;
  const ex = DW * 0.62, ey = DH * 0.38;
  const r  = 22 + glow * 28;
  const g  = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
  g.addColorStop(0,   `rgba(200,140,255,${0.7*glow})`);
  g.addColorStop(0.5, `rgba(130,80,255,${0.3*glow})`);
  g.addColorStop(1,   'rgba(80,40,200,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function _drawHurtFlash(ctx, DW, DH, t) {
  const flash = t < 0.25 ? 1 : Math.max(0, 1-(t-0.25)*5);
  if (flash < 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(255,50,50,${flash*0.48})`;
  ctx.fillRect(0, 0, DW, DH);
  ctx.restore();
}
