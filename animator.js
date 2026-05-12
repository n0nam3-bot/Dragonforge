// animator.js — LBS backward-warp renderer
// ALL bone transforms in SOURCE pixel space.
// Walk/run use rotation + explicit stride translation for convincing footfall.

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
const DEG     = Math.PI / 180;
const PI2     = Math.PI * 2;
const sin1    = t => Math.sin(t * PI2);
const cos1    = t => Math.cos(t * PI2);
const sin2    = t => Math.sin(t * PI2 * 2);
const abs1    = t => Math.abs(sin1(t));
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const clamp   = (v,a,b) => v < a ? a : v > b ? b : v;
const ease    = (t,p=2) => t<.5 ? Math.pow(t*2,p)/2 : 1-Math.pow((1-t)*2,p)/2;
const lerp    = (a,b,t) => a + (b-a)*t;

// ── Affine 2×3 matrix helpers (source pixel space) ───────────────────────────
// Layout: [m00, m01, m10, m11, tx, ty]
//   x' = m00*x + m01*y + tx
//   y' = m10*x + m11*y + ty

const matId  = () => [1, 0, 0, 1, 0, 0];
const matTrl = (dx, dy) => [1, 0, 0, 1, dx, dy];

// Rotation `ang` around source pivot (px, py)
const matRot = (ang, px, py) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [c, -s, s, c,  px*(1-c) + py*s,  py*(1-c) - px*s];
};

// Apply A first, then B  →  B∘A
function matMul(A, B) {
  return [
    B[0]*A[0] + B[1]*A[2],   B[0]*A[1] + B[1]*A[3],
    B[2]*A[0] + B[3]*A[2],   B[2]*A[1] + B[3]*A[3],
    B[0]*A[4] + B[1]*A[5] + B[4],
    B[2]*A[4] + B[3]*A[5] + B[5],
  ];
}

// Apply matrix m to point (x, y)
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

// Shorthand: rotate around named pivot, then optionally translate
const rotAt = (P, name, ang, dx=0, dy=0) => {
  const r = matRot(ang, P[name].x, P[name].y);
  if (dx === 0 && dy === 0) return r;
  return matMul(r, matTrl(dx, dy));
};

// ── Pose bone matrices ────────────────────────────────────────────────────────
// Returns NUM_BONES forward matrices in SOURCE pixel space.
// Each matrix describes where rest-pose pixels move TO in the animated frame.

export function getPoseBonesSource(pose, t, pivots, bbH) {
  const P = pivots;
  const R = (name, ang, dx=0, dy=0) => rotAt(P, name, ang, dx, dy);
  const ID = () => matId();
  const H  = bbH;   // character height in source pixels — scales all offsets

  switch (pose) {

    // ── IDLE ────────────────────────────────────────────────────────────────
    case 'idle': {
      const bob   = sin1(t) * H * 0.010;  // breathing rise/fall
      const sway  = sin1(t) * 1.5 * DEG;
      const arm   = (4 + abs1(t) * 3) * DEG;
      return [
        R('hair',  sway * 2.5,   0, -bob * 1.4),
        R('head',  sway * 0.5,   0, -bob),
        R('torso', sway * 0.2,   0, -bob * 0.7),
        R('armL',  arm,           0, -bob * 0.5),
        R('armR', -arm,           0, -bob * 0.5),
        R('hips', -sway * 0.15,  0, -bob * 0.3),
        R('legL',  sway,          0, -bob * 0.2),
        R('legR', -sway,          0, -bob * 0.2),
      ];
    }

    // ── WALK ────────────────────────────────────────────────────────────────
    // Two full steps per animation cycle.
    // Legs: rotate + translate (stride).  Arms: strong opposing swing.
    // Body bobs twice per cycle (once per step).
    case 'walk': {
      const bob     = abs1(t) * H * -0.040;        // strong vertical bob on each step
      const legAng  = sin1(t) * 55 * DEG;          // big leg swing ±55°
      const armAng  = -sin1(t) * 40 * DEG;         // opposing arm swing ±40°
      const hipRot  = sin1(t) * 9  * DEG;          // hip sway
      const lean    = 7 * DEG;                     // forward lean
      const hair    = sin1(t) * 12 * DEG + lean;   // hair trails behind, then whips

      // Stride: foot moves forward then back horizontally (simulates stepping)
      const strideX = sin1(t) * H * 0.10;          // ±10% of char height
      // Foot lift: front foot rises slightly off ground during swing
      const liftL   = Math.max(0, -sin1(t)) * H * -0.05;  // legL lifts when swinging back
      const liftR   = Math.max(0,  sin1(t)) * H * -0.05;  // legR lifts when swinging back

      return [
        /* hair  */ R('hair',  hair,       0, bob * 0.5),
        /* head  */ R('head',  lean * 0.5, 0, bob * 0.6),
        /* torso */ R('torso', lean,       0, bob * 0.5),
        /* armL  */ R('armL',  armAng,     0, bob * 0.35),
        /* armR  */ R('armR', -armAng,     0, bob * 0.35),
        /* hips  */ R('hips',  hipRot,     0, bob * 0.3),
        /* legL  */ matMul(R('legL', legAng), matTrl( strideX, liftL)),
        /* legR  */ matMul(R('legR',-legAng), matTrl(-strideX, liftR)),
      ];
    }

    // ── RUN ─────────────────────────────────────────────────────────────────
    case 'run': {
      const bob     = abs1(t) * H * -0.060;
      const legAng  = sin1(t) * 68 * DEG;
      const armAng  = -sin1(t) * 58 * DEG;
      const hipRot  = sin1(t) * 12 * DEG;
      const lean    = 13 * DEG;
      const hair    = sin1(t) * 18 * DEG + lean;
      const strideX = sin1(t) * H * 0.14;
      const liftL   = Math.max(0, -sin1(t)) * H * -0.08;
      const liftR   = Math.max(0,  sin1(t)) * H * -0.08;

      return [
        /* hair  */ R('hair',  hair,       0, bob * 0.5),
        /* head  */ R('head',  lean * 0.5, 0, bob * 0.6),
        /* torso */ R('torso', lean,       0, bob * 0.5),
        /* armL  */ R('armL',  armAng,     0, bob * 0.4),
        /* armR  */ R('armR', -armAng,     0, bob * 0.4),
        /* hips  */ R('hips',  hipRot,     0, bob * 0.3),
        /* legL  */ matMul(R('legL', legAng), matTrl( strideX, liftL)),
        /* legR  */ matMul(R('legR',-legAng), matTrl(-strideX, liftR)),
      ];
    }

    // ── JUMP ────────────────────────────────────────────────────────────────
    case 'jump': {
      const arc   = -Math.sin(t * Math.PI);   // 0 → −1 (peak) → 0
      const tuck  = arc * 36 * DEG;           // legs tuck at peak
      const armUp = arc * -62 * DEG;          // arms throw up at launch
      const lean  = arc * 10 * DEG;
      const rise  = arc * H * 0.14;
      return [
        /* hair  */ R('hair',  lean * -0.7,  0, rise - arc * H * 0.05),
        /* head  */ R('head',  lean * -0.3,  0, rise * 0.5),
        /* torso */ R('torso', lean,          0, 0),
        /* armL  */ matMul(R('armL', armUp),  matTrl(-H * 0.012, arc * H * -0.01)),
        /* armR  */ matMul(R('armR',-armUp),  matTrl( H * 0.012, arc * H * -0.01)),
        /* hips  */ ID(),
        /* legL  */ matMul(R('legL',  tuck),  matTrl( H * 0.014, 0)),
        /* legR  */ matMul(R('legR', -tuck),  matTrl(-H * 0.014, 0)),
      ];
    }

    // ── ATTACK ──────────────────────────────────────────────────────────────
    // t 0→0.3: wind-up (pull arm back), t 0.3→1: slash through
    case 'attack': {
      const sl  = t < 0.3 ? -(t / 0.3) : (t - 0.3) / 0.7;
      const aR  = (sl * 130 - 65) * DEG;    // sword arm sweeps 130°
      const tw  = sl * 22 * DEG;            // torso twist follows slash
      const bob = -Math.abs(sl) * H * 0.014;
      return [
        /* hair  */ R('hair',  tw * 0.6,  0, bob * 0.5),
        /* head  */ R('head',  tw * 0.3,  0, 0),
        /* torso */ R('torso', tw,         0, bob),
        /* armL  */ R('armL', -25 * DEG,  0, 0),
        /* armR  */ R('armR',  aR,         0, 0),
        /* hips  */ R('hips',  tw * 0.4,  0, bob * 0.5),
        /* legL  */ R('legL', -12 * DEG,  0, 0),
        /* legR  */ R('legR',  18 * DEG,  0, 0),
      ];
    }

    // ── HURT ────────────────────────────────────────────────────────────────
    case 'hurt': {
      const rc  = Math.sin(t * Math.PI) * -26 * DEG;  // recoil backward
      const shk = sin2(t) * 4 * DEG;
      const rise= Math.sin(t * Math.PI) * H * -0.025;
      return [
        /* hair  */ R('hair',  rc * -0.7 + shk, 0, rise * 0.5),
        /* head  */ R('head',  rc * -0.4,        0, rise * 0.3),
        /* torso */ R('torso', rc,                0, rise),
        /* armL  */ R('armL',  rc + 28 * DEG,   0, 0),
        /* armR  */ R('armR',  rc - 28 * DEG,   0, 0),
        /* hips  */ R('hips',  rc * 0.4,         0, rise * 0.4),
        /* legL  */ R('legL',  rc * 0.3,         0, 0),
        /* legR  */ R('legR',  rc * 0.3,         0, 0),
      ];
    }

    // ── DIE ─────────────────────────────────────────────────────────────────
    case 'die': {
      const fall = clamp01(ease(t, 2.5));
      const lean = fall * 88 * DEG;
      const drop = fall * H * 0.08;
      return [
        /* hair  */ R('hair',  lean * 0.9,  0, drop),
        /* head  */ R('head',  lean * 0.8,  0, drop * 0.8),
        /* torso */ R('torso', lean * 0.85, 0, drop * 0.5),
        /* armL  */ R('armL',  lean * 1.1,  0, drop * 0.4),
        /* armR  */ R('armR', -lean * 0.45, 0, drop * 0.4),
        /* hips  */ R('hips',  lean * 0.8,  0, drop * 0.2),
        /* legL  */ R('legL',  lean * 0.62, 0, 0),
        /* legR  */ R('legR',  lean * 0.52, 0, 0),
      ];
    }

    // ── CROUCH ──────────────────────────────────────────────────────────────
    case 'crouch': {
      const d  = clamp01(ease(clamp01(t * 2), 2));
      const sp = d * 28 * DEG;          // leg spread
      const sq = d * H * 0.075;         // squat down
      const leanA = d * 10 * DEG;
      return [
        /* hair  */ R('hair',  0,       0, sq),
        /* head  */ R('head',  leanA,   0, sq * 0.8),
        /* torso */ R('torso', leanA,   0, sq * 0.6),
        /* armL  */ R('armL',  36*DEG, 0, sq * 0.4),
        /* armR  */ R('armR', -36*DEG, 0, sq * 0.4),
        /* hips  */ ID(),
        /* legL  */ matMul(R('legL',  sp), matTrl( H * 0.014, 0)),
        /* legR  */ matMul(R('legR', -sp), matTrl(-H * 0.014, 0)),
      ];
    }

    // ── CAST ────────────────────────────────────────────────────────────────
    case 'cast': {
      const raise  = Math.abs(cos1(t)) * -72 * DEG;  // casting arm sweeps high
      const sway   = sin1(t) * 7  * DEG;
      const ripple = sin2(t) * 4  * DEG;
      const headDy = Math.abs(cos1(t)) * H * -0.006;
      return [
        /* hair  */ R('hair',  sway * 1.6 + ripple, 0, 0),
        /* head  */ R('head',  sway * 0.4,           0, headDy),
        /* torso */ R('torso', sway * 0.2,           0, 0),
        /* armL  */ R('armL',  raise - 12 * DEG,     0, 0),
        /* armR  */ R('armR',  sway,                 0, 0),
        /* hips  */ R('hips', -sway * 0.1,           0, 0),
        /* legL  */ R('legL',  sway * 0.5,           0, 0),
        /* legR  */ R('legR', -sway * 0.5,           0, 0),
      ];
    }

    default: return getPoseBonesSource('idle', t, pivots, bbH);
  }
}

// ── Main render function ──────────────────────────────────────────────────────
export function renderFrame(ctx, skelData, pose, t, dir) {
  const { srcData, srcW, srcH, bb, pivots, weights } = skelData;
  const DW = ctx.canvas.width;
  const DH = ctx.canvas.height;

  // Scale + offset that maps source pixel → dest canvas
  const scale = Math.min((DW * 0.80) / bb.w, (DH * 0.82) / bb.h);
  const ox    = (DW - bb.w * scale) / 2 - bb.x * scale;
  const oy    = (DH - bb.h * scale) / 2 - bb.y * scale;

  // Build forward bone matrices and invert for backward warp
  const fwdMats = getPoseBonesSource(pose, t, pivots, bb.h);
  const invMats = fwdMats.map(matInv);

  // Global alpha for fade effects
  let gAlpha = 1;
  if (pose === 'hurt') {
    const flash = t < 0.25 ? 1 : clamp01(1 - (t - 0.25) * 5);
    gAlpha = 0.45 + 0.55 * (1 - flash * 0.45);
  }
  if (pose === 'die' && t > 0.65) {
    gAlpha = clamp01(1 - (t - 0.65) / 0.35);
  }

  // Output image buffer
  const outImg = ctx.createImageData(DW, DH);
  const out    = outImg.data;
  const src    = srcData.data;
  const wBuf   = new Float32Array(NUM_BONES);

  for (let dy = 0; dy < DH; dy++) {
    for (let dx = 0; dx < DW; dx++) {

      // Dest pixel → rest source position (before any animation)
      const rSX = (dx - ox) / scale;
      const rSY = (dy - oy) / scale;

      // Look up bone weights at rest source position
      const iX = rSX | 0, iY = rSY | 0;
      if (iX < 0 || iY < 0 || iX >= srcW || iY >= srcH) continue;

      let totalW = 0;
      const wi = iY * srcW + iX;
      for (let b = 0; b < NUM_BONES; b++) {
        wBuf[b] = weights[b][wi];
        totalW += wBuf[b];
      }
      if (totalW < 0.01) continue;

      // Weighted blend of each bone's inverse transform applied to rest pos
      // invMat[b](rSX, rSY) answers: "which rest pixel maps to this position?"
      let fSX = 0, fSY = 0;
      const invT = 1 / totalW;
      for (let b = 0; b < NUM_BONES; b++) {
        const w = wBuf[b] * invT;
        if (w < 0.0001) continue;
        const sp = matApply(invMats[b], rSX, rSY);
        fSX += sp.x * w;
        fSY += sp.y * w;
      }

      // Bilinear sample from source image at (fSX, fSY)
      const sx0 = fSX | 0, sy0 = fSY | 0;
      const sx1 = sx0 + 1, sy1 = sy0 + 1;
      if (sx0 < 0 || sy0 < 0 || sx1 >= srcW || sy1 >= srcH) continue;

      const fx = fSX - sx0, fy = fSY - sy0;
      const wa = (1-fx)*(1-fy), wb = fx*(1-fy),
            wc = (1-fx)*fy,     wd = fx*fy;

      const i00=(sy0*srcW+sx0)*4, i10=(sy0*srcW+sx1)*4;
      const i01=(sy1*srcW+sx0)*4, i11=(sy1*srcW+sx1)*4;
      const oi =(dy*DW+dx)*4;

      out[oi]   = src[i00]*wa + src[i10]*wb + src[i01]*wc + src[i11]*wd;
      out[oi+1] = src[i00+1]*wa + src[i10+1]*wb + src[i01+1]*wc + src[i11+1]*wd;
      out[oi+2] = src[i00+2]*wa + src[i10+2]*wb + src[i01+2]*wc + src[i11+2]*wd;
      out[oi+3] = Math.min(255,
        src[i00+3]*wa + src[i10+3]*wb + src[i01+3]*wc + src[i11+3]*wd
      ) * gAlpha;
    }
  }

  ctx.putImageData(outImg, 0, 0);

  // Direction flip: mirror the completed frame
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

  // Particle / glow effects
  if (pose === 'cast')  _castGlow(ctx, DW, DH, t);
  if (pose === 'hurt')  _hurtFlash(ctx, DW, DH, t);
}

// ── Effects ───────────────────────────────────────────────────────────────────
function _castGlow(ctx, DW, DH, t) {
  const g = (1 + Math.sin(t * Math.PI * 4)) * 0.5;
  const ex = DW * 0.62, ey = DH * 0.36;
  const r  = 20 + g * 32;
  const gr = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
  gr.addColorStop(0,   `rgba(200,140,255,${0.72*g})`);
  gr.addColorStop(0.5, `rgba(130,80,255,${0.3*g})`);
  gr.addColorStop(1,   'rgba(80,40,200,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function _hurtFlash(ctx, DW, DH, t) {
  const flash = t < 0.25 ? 1 : Math.max(0, 1-(t-0.25)*5);
  if (flash < 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(255,50,50,${flash*0.5})`;
  ctx.fillRect(0, 0, DW, DH);
  ctx.restore();
}
