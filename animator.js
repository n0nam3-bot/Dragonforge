// animator.js — Linear Blend Skinning backward-warp renderer
// Every destination pixel samples the source image via weighted bone transforms.
// No seams. No cutting. The character stays whole.

import { NUM_BONES, B_HAIR, B_HEAD, B_TORSO, B_ARML, B_ARMR,
         B_HIPS, B_LEGL, B_LEGR, BONE_IDS } from './bodyDetect.js';

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

// ── Math helpers ──────────────────────────────────────────────────────────────
const PI2    = Math.PI * 2;
const sin1   = t => Math.sin(t * PI2);
const cos1   = t => Math.cos(t * PI2);
const sin2   = t => Math.sin(t * PI2 * 2);
const abs1   = t => Math.abs(sin1(t));
const clamp  = (v,lo,hi) => v<lo?lo:v>hi?hi:v;
const clamp01= v => v<0?0:v>1?1:v;
const lerp   = (a,b,t) => a+(b-a)*t;
const ease   = (t,p=2) => t<.5 ? Math.pow(t*2,p)/2 : 1-Math.pow((1-t)*2,p)/2;
const DEG    = Math.PI/180;

// ── 2×3 affine matrix helpers ─────────────────────────────────────────────────
// Matrix stored as [a,b,c,d,tx,ty]  (row-major, last row implicit [0,0,1])
// maps (x,y) → (a·x + b·y + tx,  c·x + d·y + ty)

function matIdentity()              { return [1,0,0,1,0,0]; }
function matTranslate(tx,ty)        { return [1,0,0,1,tx,ty]; }
function matRotateAround(ang,px,py) {
  const c=Math.cos(ang), s=Math.sin(ang);
  return [c,-s,s,c, px-c*px+s*py, py-s*px-c*py];
}
// Compose: apply M1 then M2
function matMul(a,b) {
  return [
    b[0]*a[0]+b[2]*a[1],  b[1]*a[0]+b[3]*a[1],
    b[0]*a[2]+b[2]*a[3],  b[1]*a[2]+b[3]*a[3],
    b[0]*a[4]+b[2]*a[5]+b[4],  b[1]*a[4]+b[3]*a[5]+b[5],
  ];
}
function matApply(m,x,y) {
  return { x: m[0]*x + m[1]*y + m[4],
           y: m[2]*x + m[3]*y + m[5] };
}
// Invert a 2×3 affine matrix
function matInvert(m) {
  const det = m[0]*m[3] - m[1]*m[2];
  if (Math.abs(det) < 1e-10) return matIdentity();
  const inv = 1/det;
  const a= m[3]*inv, b=-m[1]*inv, c=-m[2]*inv, d= m[0]*inv;
  return [a,b,c,d, -(a*m[4]+b*m[5]), -(c*m[4]+d*m[5])];
}

// ── Pose definition ───────────────────────────────────────────────────────────
// getPoseBones(pose, t, pivots, scale) returns an array of 8 forward matrices,
// one per bone, in destination-canvas space.
// pivots: { hair,head,torso,armL,armR,hips,legL,legR } in SOURCE pixel coords.
// scale/ox/oy: mapping from source → dest canvas.

export function getPoseBones(pose, t, pivots, scale, ox, oy) {
  // Convert a source pivot to dest canvas coords
  const dp = name => ({
    x: pivots[name].x * scale + ox,
    y: pivots[name].y * scale + oy,
  });

  // Rotation around a dest-space pivot
  const rot  = (name, ang) => matRotateAround(ang, dp(name).x, dp(name).y);
  // Translation in dest-canvas pixels
  const trl  = (dx,dy)     => matTranslate(dx,dy);
  // Rotation + translation composed
  const rt   = (name,ang,dx,dy) => matMul(trl(dx,dy), rot(name,ang));

  // --- Idle ---
  if (pose === 'idle') {
    const breath = sin1(t) * scale * 0.008;
    const sway   = sin1(t) * 1.2 * DEG;
    const legRock= sin1(t) * 0.8 * DEG;
    const ady    = -breath; // all bones rise slightly on inhale
    return [
      /* hair  */ rt('hair',  sway * 2,   0, ady*1.4),
      /* head  */ rt('head',  sway * 0.4, 0, ady),
      /* torso */ rt('torso', sway * 0.2, 0, ady*0.6),
      /* armL  */ rt('armL',  sway + 3*DEG,  0, ady*0.5),
      /* armR  */ rt('armR', -sway - 3*DEG,  0, ady*0.5),
      /* hips  */ rt('hips', -sway * 0.1, 0, ady*0.3),
      /* legL  */ rt('legL',  legRock,    0, ady*0.2),
      /* legR  */ rt('legR', -legRock,    0, ady*0.2),
    ];
  }

  // --- Walk ---
  if (pose === 'walk') {
    const bob    = abs1(t) * scale * -0.018;
    const legSwg = sin1(t) * 28 * DEG;
    const armSwg = -sin1(t) * 22 * DEG;
    const hipRot = sin1(t) * 5 * DEG;
    const lean   = 4 * DEG;
    const hairSwg= sin1(t) * 6 * DEG;
    return [
      /* hair  */ rt('hair',  lean + hairSwg, 0, bob*0.5),
      /* head  */ rt('head',  lean * 0.4,     0, bob*0.6),
      /* torso */ rt('torso', lean,            0, bob*0.5),
      /* armL  */ rt('armL',  armSwg,          0, bob*0.4),
      /* armR  */ rt('armR', -armSwg,          0, bob*0.4),
      /* hips  */ rt('hips',  hipRot,          0, bob*0.3),
      /* legL  */ rt('legL',  legSwg,          0, 0),
      /* legR  */ rt('legR', -legSwg,          0, 0),
    ];
  }

  // --- Run ---
  if (pose === 'run') {
    const bob    = abs1(t) * scale * -0.034;
    const legSwg = sin1(t) * 50 * DEG;
    const armSwg = -sin1(t) * 44 * DEG;
    const hipRot = sin1(t) * 9 * DEG;
    const lean   = 11 * DEG;
    const hairSwg= sin1(t) * 14 * DEG + lean;
    return [
      /* hair  */ rt('hair',  hairSwg,         0, bob*0.6),
      /* head  */ rt('head',  lean * 0.5,      0, bob*0.7),
      /* torso */ rt('torso', lean,             0, bob*0.5),
      /* armL  */ rt('armL',  armSwg,           0, bob*0.4),
      /* armR  */ rt('armR', -armSwg,           0, bob*0.4),
      /* hips  */ rt('hips',  hipRot,           0, bob*0.3),
      /* legL  */ rt('legL',  legSwg,           0, 0),
      /* legR  */ rt('legR', -legSwg,           0, 0),
    ];
  }

  // --- Jump ---
  if (pose === 'jump') {
    const arc    = -Math.sin(t * Math.PI);   // 0→peak→0
    const tuck   = arc * 28 * DEG;
    const armUp  = arc * -55 * DEG;
    const lean   = arc * 8 * DEG;
    const rise   = arc * scale * 0.13;
    return [
      /* hair  */ rt('hair', lean * -0.6,     0, rise - arc*scale*0.05),
      /* head  */ rt('head', lean * -0.3,     0, rise * 0.6),
      /* torso */ rt('torso', lean,            0, 0),
      /* armL  */ matMul(trl(-scale*0.012, arc*scale*-0.01), rot('armL', armUp)),
      /* armR  */ matMul(trl( scale*0.012, arc*scale*-0.01), rot('armR',-armUp)),
      /* hips  */ matIdentity(),
      /* legL  */ matMul(trl( scale*0.012, 0), rot('legL', tuck)),
      /* legR  */ matMul(trl(-scale*0.012, 0), rot('legR',-tuck)),
    ];
  }

  // --- Attack ---
  if (pose === 'attack') {
    const slashT = t < 0.3 ? -(t/0.3) : (t-0.3)/0.7;
    const armRot = (slashT * 115 - 55) * DEG;
    const tw     = slashT * 18 * DEG;
    const bob    = -Math.abs(slashT) * scale * 0.012;
    return [
      /* hair  */ rt('hair',  tw*0.5,  0, bob*0.5),
      /* head  */ rt('head',  tw*0.3,  0, 0),
      /* torso */ rt('torso', tw,      0, bob),
      /* armL  */ rt('armL', -20*DEG,  0, 0),
      /* armR  */ rt('armR',  armRot,  0, 0),
      /* hips  */ rt('hips',  tw*0.4,  0, bob*0.5),
      /* legL  */ rt('legL', -10*DEG,  0, 0),
      /* legR  */ rt('legR',  16*DEG,  0, 0),
    ];
  }

  // --- Hurt ---
  if (pose === 'hurt') {
    const recoil = Math.sin(t * Math.PI) * -22 * DEG;
    const shake  = sin2(t) * 3 * DEG;
    const rise   = -Math.sin(t * Math.PI) * scale * 0.02;
    return [
      /* hair  */ rt('hair',  recoil*-0.6+shake, 0, rise*0.5),
      /* head  */ rt('head',  recoil*-0.4,       0, rise*0.3),
      /* torso */ rt('torso', recoil,             0, rise),
      /* armL  */ rt('armL',  recoil+22*DEG,     0, 0),
      /* armR  */ rt('armR',  recoil-22*DEG,     0, 0),
      /* hips  */ rt('hips',  recoil*0.4,        0, rise*0.4),
      /* legL  */ rt('legL',  recoil*0.3,        0, 0),
      /* legR  */ rt('legR',  recoil*0.3,        0, 0),
    ];
  }

  // --- Die ---
  if (pose === 'die') {
    const fall = clamp01(ease(t, 2.5));
    const lean = fall * 85 * DEG;
    const drop = fall * scale * 0.07;
    return [
      /* hair  */ rt('hair',  lean*0.9,  0, drop*1.0),
      /* head  */ rt('head',  lean*0.8,  0, drop*0.8),
      /* torso */ rt('torso', lean*0.85, 0, drop*0.5),
      /* armL  */ rt('armL',  lean*1.1,  0, drop*0.4),
      /* armR  */ rt('armR', -lean*0.4,  0, drop*0.4),
      /* hips  */ rt('hips',  lean*0.8,  0, drop*0.2),
      /* legL  */ rt('legL',  lean*0.6,  0, 0),
      /* legR  */ rt('legR',  lean*0.5,  0, 0),
    ];
  }

  // --- Crouch ---
  if (pose === 'crouch') {
    const depth  = clamp01(ease(clamp01(t*2), 2));
    const spread = depth * 24 * DEG;
    const squat  = depth * scale * 0.065;
    const lean   = depth * 8 * DEG;
    return [
      /* hair  */ rt('hair',  0,        0, squat),
      /* head  */ rt('head',  lean,     0, squat*0.8),
      /* torso */ rt('torso', lean,     0, squat*0.6),
      /* armL  */ rt('armL',  32*DEG,   0, squat*0.4),
      /* armR  */ rt('armR', -32*DEG,   0, squat*0.4),
      /* hips  */ matIdentity(),
      /* legL  */ matMul(trl( scale*0.012, 0), rot('legL',  spread)),
      /* legR  */ matMul(trl(-scale*0.012, 0), rot('legR', -spread)),
    ];
  }

  // --- Cast ---
  if (pose === 'cast') {
    const raise  = Math.abs(cos1(t)) * -62 * DEG;
    const sway   = sin1(t) * 6 * DEG;
    const ripple = sin2(t) * 3 * DEG;
    const headY  = -Math.abs(cos1(t)) * scale * 0.005;
    return [
      /* hair  */ rt('hair',  sway*1.5 + ripple, 0, 0),
      /* head  */ rt('head',  sway*0.4,           0, headY),
      /* torso */ rt('torso', sway*0.2,           0, 0),
      /* armL  */ rt('armL',  raise - 10*DEG,     0, 0),
      /* armR  */ rt('armR',  sway,               0, 0),
      /* hips  */ rt('hips', -sway*0.1,           0, 0),
      /* legL  */ rt('legL',  sway*0.5,           0, 0),
      /* legR  */ rt('legR', -sway*0.5,           0, 0),
    ];
  }

  // Fallback → identity
  return Array.from({ length: NUM_BONES }, () => matIdentity());
}

// ── Main render ───────────────────────────────────────────────────────────────
/**
 * Warp-renders one animation frame via LBS backward sampling.
 *
 * @param {CanvasRenderingContext2D} ctx   destination
 * @param {object} skelData                result from detectSkeleton()
 * @param {string} pose
 * @param {number} t                       phase 0..1
 * @param {'left'|'right'} dir
 */
export function renderFrame(ctx, skelData, pose, t, dir) {
  const { srcData, srcW, srcH, bb, pivots, weights } = skelData;
  const DW = ctx.canvas.width;
  const DH = ctx.canvas.height;

  // Scale + offset to centre character in dest canvas
  const scale = Math.min((DW * 0.78) / bb.w, (DH * 0.82) / bb.h);
  const ox    = (DW - bb.w * scale) / 2 - bb.x * scale;
  const oy    = (DH - bb.h * scale) / 2 - bb.y * scale;

  // Hurt / die global alpha
  let globalAlpha = 1;
  if (pose === 'hurt') {
    const flash = t < 0.25 ? 1 : clamp01(1 - (t - 0.25) * 5);
    globalAlpha = 0.45 + 0.55 * (1 - flash * 0.45);
  }
  if (pose === 'die') {
    const fall = clamp01(ease(t, 2.5));
    if (t > 0.65) globalAlpha = clamp01(1 - (t - 0.65) / 0.35);
  }

  // Build forward bone matrices (source → dest)
  const fwdMats = getPoseBones(pose, t, pivots, scale, ox, oy);

  // Invert each bone matrix (dest → source) for backward warp
  const invMats = fwdMats.map(matInvert);

  // Allocate output image
  const outImg = ctx.createImageData(DW, DH);
  const out    = outImg.data;
  const src    = srcData.data;

  // Precompute bone weights scratch
  const wScratch = new Float32Array(NUM_BONES);

  for (let dy = 0; dy < DH; dy++) {
    for (let dx = 0; dx < DW; dx++) {

      // Step 1: map dest pixel → source pixel via each bone's inverse matrix
      // then blend by that bone's weight at the (approximate) source location.
      // We use a single-pass approximation: compute the unweighted source
      // position first (using the identity mapping), look up weights there,
      // then compute the weighted blend of all bone inverse transforms.

      // Approximate source pixel (before animation) via inverse scale/offset
      const approxSX = (dx - ox) / scale;
      const approxSY = (dy - oy) / scale;

      // Get bone weights at this approximate source position
      const asx = Math.round(approxSX), asy = Math.round(approxSY);
      let totalW = 0;
      for (let b = 0; b < NUM_BONES; b++) {
        if (asx >= 0 && asx < srcW && asy >= 0 && asy < srcH) {
          wScratch[b] = weights[b][asy * srcW + asx];
        } else {
          wScratch[b] = 0;
        }
        totalW += wScratch[b];
      }

      if (totalW < 0.01) continue;  // outside character entirely

      // Step 2: weighted blend of inverse-mapped source positions
      let blendSX = 0, blendSY = 0;
      for (let b = 0; b < NUM_BONES; b++) {
        if (wScratch[b] < 0.0001) continue;
        const w   = wScratch[b] / totalW;
        const sp  = matApply(invMats[b], dx, dy);
        blendSX  += sp.x * w;
        blendSY  += sp.y * w;
      }

      // Dir flip: mirror source x around character centre
      let finalSX = blendSX, finalSY = blendSY;
      if (dir === 'left') {
        const charCentreX = bb.x + bb.w * 0.5;
        finalSX = 2 * charCentreX - blendSX;
      }

      // Step 3: bilinear sample from source image
      const sx0 = Math.floor(finalSX), sy0 = Math.floor(finalSY);
      const sx1 = sx0 + 1,             sy1 = sy0 + 1;
      const fx  = finalSX - sx0,       fy  = finalSY - sy0;

      if (sx0 < 0 || sy0 < 0 || sx1 >= srcW || sy1 >= srcH) continue;

      const i00 = (sy0 * srcW + sx0) * 4;
      const i10 = (sy0 * srcW + sx1) * 4;
      const i01 = (sy1 * srcW + sx0) * 4;
      const i11 = (sy1 * srcW + sx1) * 4;

      const wa = (1-fx)*(1-fy), wb = fx*(1-fy),
            wc = (1-fx)*fy,     wd = fx*fy;

      const oi = (dy * DW + dx) * 4;
      out[oi]   = src[i00]  *wa + src[i10]  *wb + src[i01]  *wc + src[i11]  *wd;
      out[oi+1] = src[i00+1]*wa + src[i10+1]*wb + src[i01+1]*wc + src[i11+1]*wd;
      out[oi+2] = src[i00+2]*wa + src[i10+2]*wb + src[i01+2]*wc + src[i11+2]*wd;
      out[oi+3] = Math.min(255,
                    (src[i00+3]*wa + src[i10+3]*wb + src[i01+3]*wc + src[i11+3]*wd)
                  ) * globalAlpha;
    }
  }

  ctx.putImageData(outImg, 0, 0);

  // Effects overlay
  if (pose === 'cast')  drawCastGlow(ctx, DW, DH, t, dir);
  if (pose === 'hurt')  drawHurtFlash(ctx, DW, DH, t);
}

// ── Effects ───────────────────────────────────────────────────────────────────
function drawCastGlow(ctx, DW, DH, t, dir) {
  const glow = (1 + Math.sin(t * Math.PI * 4)) * 0.5;
  const ex   = dir === 'left' ? DW * 0.35 : DW * 0.65;
  const ey   = DH * 0.38;
  const r    = 22 + glow * 28;
  const g    = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
  g.addColorStop(0,   `rgba(200,140,255,${0.7 * glow})`);
  g.addColorStop(0.5, `rgba(130,80,255,${0.3 * glow})`);
  g.addColorStop(1,   'rgba(80,40,200,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHurtFlash(ctx, DW, DH, t) {
  const flash = t < 0.25 ? 1 : clamp01(1 - (t - 0.25) * 5);
  if (flash < 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(255,50,50,${flash * 0.48})`;
  ctx.fillRect(0, 0, DW, DH);
  ctx.restore();
}
