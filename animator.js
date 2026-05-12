// animator.js — LBS backward-warp, foot-planted walk/run
// Key fixes:
//  • Alpha threshold: only write dest pixels where source alpha > 8
//  • Body-centred layout: centres on torso/hip midpoint, not bbox
//  • Walk/run: proper alternating foot-plant (one foot grounded, one swinging)

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
const ease    = (t,p=2) => t < .5 ? Math.pow(t*2,p)/2 : 1-Math.pow((1-t)*2,p)/2;

// ── Affine 2×3 matrix — SOURCE pixel space ────────────────────────────────────
// [m00, m01, m10, m11, tx, ty]
//   x' = m00*x + m01*y + tx
//   y' = m10*x + m11*y + ty

const matId  = ()         => [1,0,0,1,0,0];
const matTrl = (dx,dy)    => [1,0,0,1,dx,dy];
const matRot = (a,px,py)  => {
  const c=Math.cos(a), s=Math.sin(a);
  return [c,-s,s,c, px*(1-c)+py*s, py*(1-c)-px*s];
};

// B after A  →  B∘A
function matMul(A,B) {
  return [
    B[0]*A[0]+B[1]*A[2],  B[0]*A[1]+B[1]*A[3],
    B[2]*A[0]+B[3]*A[2],  B[2]*A[1]+B[3]*A[3],
    B[0]*A[4]+B[1]*A[5]+B[4],
    B[2]*A[4]+B[3]*A[5]+B[5],
  ];
}
const matApply = (m,x,y) => ({ x: m[0]*x+m[1]*y+m[4], y: m[2]*x+m[3]*y+m[5] });
function matInv(m) {
  const det = m[0]*m[3]-m[1]*m[2];
  if (Math.abs(det)<1e-10) return matId();
  const i=1/det, a=m[3]*i, b=-m[1]*i, c=-m[2]*i, d=m[0]*i;
  return [a,b,c,d, -(a*m[4]+b*m[5]), -(c*m[4]+d*m[5])];
}

const R = (P,name,ang,dx=0,dy=0) => {
  const r = matRot(ang, P[name].x, P[name].y);
  return (dx||dy) ? matMul(r, matTrl(dx,dy)) : r;
};

// ── Pose definitions ──────────────────────────────────────────────────────────
// H = bb.h in source pixels; P = pivots
export function getPoseBonesSource(pose, t, P, H) {
  switch (pose) {

    // ── IDLE ──────────────────────────────────────────────────────────────────
    case 'idle': {
      const bob  = sin1(t) * H * 0.009;
      const sway = sin1(t) * 1.5 * DEG;
      const arm  = (4 + abs1(t)*3) * DEG;
      return [
        R(P,'hair',  sway*2.5,    0, -bob*1.4),
        R(P,'head',  sway*0.5,    0, -bob),
        R(P,'torso', sway*0.2,    0, -bob*0.7),
        R(P,'armL',  arm,          0, -bob*0.5),
        R(P,'armR', -arm,          0, -bob*0.5),
        R(P,'hips', -sway*0.15,   0, -bob*0.3),
        R(P,'legL',  sway,         0, -bob*0.2),
        R(P,'legR', -sway,         0, -bob*0.2),
      ];
    }

    // ── WALK ──────────────────────────────────────────────────────────────────
    // Proper foot-plant walk cycle:
    //   t=0.00: right foot plant, left foot swinging forward
    //   t=0.25: both feet equidistant (mid-stride)
    //   t=0.50: left foot plant, right foot swinging forward
    //   t=0.75: both feet equidistant
    //   t=1.00: = t=0.00
    //
    // The PLANTED foot has near-zero rotation and near-zero translation
    // so it appears to grip the ground. The SWING foot gets full arc.
    case 'walk': {
      // t in 0..1, two steps per full cycle
      const phase  = t;                           // 0..1 full gait cycle
      const half   = (phase % 0.5) / 0.5;        // 0..1 within each half-step
      const isFirstHalf = phase < 0.5;

      // Leg angles: each leg is half a cycle out of phase
      const legLAng =  Math.sin(phase * PI2) * 48 * DEG;  // legL forward when +
      const legRAng = -Math.sin(phase * PI2) * 48 * DEG;  // legR opposite

      // Stride translation: foot moves forward (positive = toward facing dir)
      // Planted foot barely moves; swing foot arcs forward
      const strideL =  Math.sin(phase * PI2) * H * 0.09;
      const strideR = -Math.sin(phase * PI2) * H * 0.09;

      // Foot lift: only the swing foot rises; planted foot stays at ground
      // sin goes + in first half (legL swinging fwd), − in second half
      const liftL = Math.max(0,  Math.sin(phase * PI2)) * H * -0.07; // rises when swinging fwd
      const liftR = Math.max(0, -Math.sin(phase * PI2)) * H * -0.07;

      // Body bob: rises at mid-stance (when leg is straight under body)
      // abs(sin) gives two peaks per cycle = two steps
      const bob  = abs1(t) * H * -0.028;

      // Hip sway: opposite to planted foot
      const hipRot = Math.sin(phase * PI2) * 8 * DEG;

      // Arms counter-swing to legs
      const armLAng = -legLAng * 0.75;
      const armRAng = -legRAng * 0.75;

      // Lean slightly forward
      const lean    = 5 * DEG;
      const hairSwg = sin1(t) * 10 * DEG + lean;

      return [
        R(P,'hair',  hairSwg,       0, bob*0.5),
        R(P,'head',  lean*0.5,      0, bob*0.6),
        R(P,'torso', lean,          0, bob*0.5),
        R(P,'armL',  armLAng,       0, bob*0.35),
        R(P,'armR',  armRAng,       0, bob*0.35),
        R(P,'hips',  hipRot,        0, bob*0.3),
        matMul(R(P,'legL', legLAng), matTrl(strideL, liftL)),
        matMul(R(P,'legR', legRAng), matTrl(strideR, liftR)),
      ];
    }

    // ── RUN ───────────────────────────────────────────────────────────────────
    case 'run': {
      const legLAng =  Math.sin(t * PI2) * 62 * DEG;
      const legRAng = -Math.sin(t * PI2) * 62 * DEG;
      const strideL =  Math.sin(t * PI2) * H * 0.12;
      const strideR = -Math.sin(t * PI2) * H * 0.12;
      const liftL   = Math.max(0,  Math.sin(t * PI2)) * H * -0.11;
      const liftR   = Math.max(0, -Math.sin(t * PI2)) * H * -0.11;
      const bob     = abs1(t) * H * -0.048;
      const hipRot  = sin1(t) * 12 * DEG;
      const lean    = 13 * DEG;
      const armLAng = -Math.sin(t * PI2) * 56 * DEG;
      const armRAng =  Math.sin(t * PI2) * 56 * DEG;
      const hair    = sin1(t) * 16 * DEG + lean;
      return [
        R(P,'hair',  hair,        0, bob*0.5),
        R(P,'head',  lean*0.5,    0, bob*0.6),
        R(P,'torso', lean,        0, bob*0.5),
        R(P,'armL',  armLAng,     0, bob*0.4),
        R(P,'armR',  armRAng,     0, bob*0.4),
        R(P,'hips',  hipRot,      0, bob*0.3),
        matMul(R(P,'legL', legLAng), matTrl(strideL, liftL)),
        matMul(R(P,'legR', legRAng), matTrl(strideR, liftR)),
      ];
    }

    // ── JUMP ──────────────────────────────────────────────────────────────────
    case 'jump': {
      const arc   = -Math.sin(t * Math.PI);
      const tuck  = arc * 38 * DEG;
      const armUp = arc * -65 * DEG;
      const lean  = arc * 10 * DEG;
      const rise  = arc * H * 0.15;
      return [
        R(P,'hair',  lean*-0.7,   0, rise-arc*H*0.05),
        R(P,'head',  lean*-0.3,   0, rise*0.5),
        R(P,'torso', lean,         0, 0),
        matMul(R(P,'armL', armUp),  matTrl(-H*0.012, arc*H*-0.01)),
        matMul(R(P,'armR',-armUp),  matTrl( H*0.012, arc*H*-0.01)),
        matId(),
        matMul(R(P,'legL',  tuck),  matTrl( H*0.016, 0)),
        matMul(R(P,'legR', -tuck),  matTrl(-H*0.016, 0)),
      ];
    }

    // ── ATTACK ────────────────────────────────────────────────────────────────
    case 'attack': {
      const sl  = t < 0.3 ? -(t/0.3) : (t-0.3)/0.7;
      const aR  = (sl*130-65) * DEG;
      const tw  = sl * 22 * DEG;
      const bob = -Math.abs(sl) * H * 0.014;
      return [
        R(P,'hair',  tw*0.6,   0, bob*0.5),
        R(P,'head',  tw*0.3,   0, 0),
        R(P,'torso', tw,        0, bob),
        R(P,'armL', -25*DEG,   0, 0),
        R(P,'armR',  aR,        0, 0),
        R(P,'hips',  tw*0.4,   0, bob*0.5),
        R(P,'legL', -12*DEG,   0, 0),
        R(P,'legR',  18*DEG,   0, 0),
      ];
    }

    // ── HURT ──────────────────────────────────────────────────────────────────
    case 'hurt': {
      const rc  = Math.sin(t * Math.PI) * -28 * DEG;
      const shk = sin2(t) * 4 * DEG;
      const ry  = Math.sin(t * Math.PI) * H * -0.025;
      return [
        R(P,'hair',  rc*-0.7+shk, 0, ry*0.5),
        R(P,'head',  rc*-0.4,     0, ry*0.3),
        R(P,'torso', rc,           0, ry),
        R(P,'armL',  rc+28*DEG,   0, 0),
        R(P,'armR',  rc-28*DEG,   0, 0),
        R(P,'hips',  rc*0.4,      0, ry*0.4),
        R(P,'legL',  rc*0.3,      0, 0),
        R(P,'legR',  rc*0.3,      0, 0),
      ];
    }

    // ── DIE ───────────────────────────────────────────────────────────────────
    case 'die': {
      const f = clamp01(ease(t, 2.5));
      const l = f * 88 * DEG, dr = f * H * 0.08;
      return [
        R(P,'hair',  l*0.9,   0, dr),
        R(P,'head',  l*0.8,   0, dr*0.8),
        R(P,'torso', l*0.85,  0, dr*0.5),
        R(P,'armL',  l*1.1,   0, dr*0.4),
        R(P,'armR', -l*0.45,  0, dr*0.4),
        R(P,'hips',  l*0.8,   0, dr*0.2),
        R(P,'legL',  l*0.62,  0, 0),
        R(P,'legR',  l*0.52,  0, 0),
      ];
    }

    // ── CROUCH ────────────────────────────────────────────────────────────────
    case 'crouch': {
      const dp = clamp01(ease(clamp01(t*2), 2));
      const sp = dp * 28 * DEG, sq = dp * H * 0.075, la = dp * 10 * DEG;
      return [
        R(P,'hair',  0,      0, sq),
        R(P,'head',  la,     0, sq*0.8),
        R(P,'torso', la,     0, sq*0.6),
        R(P,'armL',  36*DEG, 0, sq*0.4),
        R(P,'armR', -36*DEG, 0, sq*0.4),
        matId(),
        matMul(R(P,'legL',  sp), matTrl( H*0.015, 0)),
        matMul(R(P,'legR', -sp), matTrl(-H*0.015, 0)),
      ];
    }

    // ── CAST ──────────────────────────────────────────────────────────────────
    case 'cast': {
      const raise  = Math.abs(cos1(t)) * -72 * DEG;
      const sway   = sin1(t) * 7 * DEG;
      const ripple = sin2(t) * 4 * DEG;
      const hdy    = Math.abs(cos1(t)) * H * -0.006;
      return [
        R(P,'hair',  sway*1.6+ripple, 0, 0),
        R(P,'head',  sway*0.4,         0, hdy),
        R(P,'torso', sway*0.2,         0, 0),
        R(P,'armL',  raise-12*DEG,     0, 0),
        R(P,'armR',  sway,             0, 0),
        R(P,'hips', -sway*0.1,         0, 0),
        R(P,'legL',  sway*0.5,         0, 0),
        R(P,'legR', -sway*0.5,         0, 0),
      ];
    }

    default: return getPoseBonesSource('idle', t, P, H);
  }
}

// ── Main render ───────────────────────────────────────────────────────────────
export function renderFrame(ctx, skelData, pose, t, dir) {
  const { srcData, srcW, srcH, bb, pivots, weights, groundY } = skelData;
  const DW = ctx.canvas.width;
  const DH = ctx.canvas.height;

  // ── Fit character body (not full bbox) into canvas ────────────────────────
  const scale = Math.min((DW * 0.78) / bb.w, (DH * 0.82) / bb.h);

  // Pin character so feet touch a consistent ground line at 92% of canvas height
  const groundLineY = DH * 0.92;
  const ox = (DW - bb.w * scale) / 2 - bb.x * scale;
  const oy = groundLineY - groundY * scale;

  // Build bone matrices and invert
  const fwdMats = getPoseBonesSource(pose, t, pivots, bb.h);
  const invMats = fwdMats.map(matInv);

  // Global alpha for hurt/die
  let gAlpha = 1;
  if (pose === 'hurt') {
    const flash = t < 0.25 ? 1 : clamp01(1-(t-0.25)*5);
    gAlpha = 0.45 + 0.55*(1-flash*0.45);
  }
  if (pose === 'die' && t > 0.65) {
    gAlpha = clamp01(1-(t-0.65)/0.35);
  }

  // Write output pixels
  const outImg = ctx.createImageData(DW, DH);
  const out    = outImg.data;
  const src    = srcData.data;
  const wBuf   = new Float32Array(NUM_BONES);

  for (let dy = 0; dy < DH; dy++) {
    for (let dx = 0; dx < DW; dx++) {

      // dest → rest source
      const rSX = (dx - ox) / scale;
      const rSY = (dy - oy) / scale;
      const iX  = rSX | 0, iY = rSY | 0;
      if (iX < 0 || iY < 0 || iX >= srcW || iY >= srcH) continue;

      // Skip dest pixels that map to transparent source regions
      // (this eliminates the ghost silhouette)
      if (src[(iY * srcW + iX) * 4 + 3] < 8) continue;

      // Bone weights at rest position
      let totalW = 0;
      const wi = iY * srcW + iX;
      for (let b = 0; b < NUM_BONES; b++) {
        wBuf[b] = weights[b][wi];
        totalW += wBuf[b];
      }
      if (totalW < 0.01) continue;

      // Weighted blend of inverse transforms
      let fSX = 0, fSY = 0;
      const invT = 1 / totalW;
      for (let b = 0; b < NUM_BONES; b++) {
        const w = wBuf[b] * invT;
        if (w < 0.0001) continue;
        const sp = matApply(invMats[b], rSX, rSY);
        fSX += sp.x * w;
        fSY += sp.y * w;
      }

      // Bilinear sample from source
      const sx0 = fSX | 0, sy0 = fSY | 0;
      const sx1 = sx0+1,   sy1 = sy0+1;
      if (sx0 < 0 || sy0 < 0 || sx1 >= srcW || sy1 >= srcH) continue;

      // Skip if ALL four sample corners are transparent
      const a00=src[(sy0*srcW+sx0)*4+3], a10=src[(sy0*srcW+sx1)*4+3];
      const a01=src[(sy1*srcW+sx0)*4+3], a11=src[(sy1*srcW+sx1)*4+3];
      if (a00 < 4 && a10 < 4 && a01 < 4 && a11 < 4) continue;

      const fx=fSX-sx0, fy=fSY-sy0;
      const wa=(1-fx)*(1-fy), wb=fx*(1-fy), wc=(1-fx)*fy, wd=fx*fy;

      const i00=(sy0*srcW+sx0)*4, i10=(sy0*srcW+sx1)*4;
      const i01=(sy1*srcW+sx0)*4, i11=(sy1*srcW+sx1)*4;
      const oi =(dy*DW+dx)*4;

      const alpha = (a00*wa+a10*wb+a01*wc+a11*wd) * gAlpha;
      if (alpha < 4) continue;   // skip near-transparent blended pixels

      out[oi]   = src[i00]*wa + src[i10]*wb + src[i01]*wc + src[i11]*wd;
      out[oi+1] = src[i00+1]*wa + src[i10+1]*wb + src[i01+1]*wc + src[i11+1]*wd;
      out[oi+2] = src[i00+2]*wa + src[i10+2]*wb + src[i01+2]*wc + src[i11+2]*wd;
      out[oi+3] = Math.min(255, alpha);
    }
  }

  ctx.putImageData(outImg, 0, 0);

  // Direction flip
  if (dir === 'left') {
    const tmp = document.createElement('canvas');
    tmp.width = DW; tmp.height = DH;
    tmp.getContext('2d').putImageData(outImg, 0, 0);
    ctx.clearRect(0, 0, DW, DH);
    ctx.save(); ctx.translate(DW, 0); ctx.scale(-1, 1);
    ctx.drawImage(tmp, 0, 0); ctx.restore();
  }

  if (pose === 'cast') _castGlow(ctx, DW, DH, t);
  if (pose === 'hurt') _hurtFlash(ctx, DW, DH, t);
}

function _castGlow(ctx, DW, DH, t) {
  const g  = (1+Math.sin(t*Math.PI*4))*0.5;
  const ex = DW*0.62, ey = DH*0.36, r = 20+g*32;
  const gr = ctx.createRadialGradient(ex,ey,0,ex,ey,r);
  gr.addColorStop(0,  `rgba(200,140,255,${0.72*g})`);
  gr.addColorStop(.5, `rgba(130,80,255,${0.3*g})`);
  gr.addColorStop(1,  'rgba(80,40,200,0)');
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(ex,ey,r,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function _hurtFlash(ctx, DW, DH, t) {
  const f = t < 0.25 ? 1 : Math.max(0,1-(t-0.25)*5);
  if (f < 0.01) return;
  ctx.save(); ctx.globalCompositeOperation='source-atop';
  ctx.fillStyle=`rgba(255,50,50,${f*0.5})`;
  ctx.fillRect(0,0,DW,DH); ctx.restore();
}
