// animator.js — layer-based pose renderer for SpriteSmith Studio
//
// The skeleton detector supplies per-bone weights and source pivots.
// This renderer converts the uploaded image into per-bone image layers
// and animates them with simple affine transforms. The result is stable
// on mobile browsers, respects left/right facing, and bakes correctly.

import {
  NUM_BONES,
  B_HAIR,
  B_HEAD,
  B_TORSO,
  B_ARML,
  B_ARMR,
  B_HIPS,
  B_LEGL,
  B_LEGR,
} from './bodyDetect.js';

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
const PI2     = Math.PI * 2;
const sin1    = t => Math.sin(t * PI2);
const cos1    = t => Math.cos(t * PI2);
const sin2    = t => Math.sin(t * PI2 * 2);
const abs1    = t => Math.abs(sin1(t));
const clamp   = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp    = (a, b, t) => a + (b - a) * t;
const ease    = (t, p = 2) => t < .5 ? Math.pow(t * 2, p) / 2 : 1 - Math.pow((1 - t) * 2, p) / 2;
const DEG     = Math.PI / 180;

// ── 2×3 affine matrix helpers ─────────────────────────────────────────────────
// Stored as [a,b,c,d,tx,ty] mapping (x,y) → (a·x + b·y + tx, c·x + d·y + ty).

function matIdentity() { return [1, 0, 0, 1, 0, 0]; }
function matTranslate(tx, ty) { return [1, 0, 0, 1, tx, ty]; }
function matRotateAround(ang, px, py) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [c, -s, s, c, px - c * px + s * py, py - s * px - c * py];
}
// Compose transforms: apply M1 then M2.
function matMul(a, b) {
  return [
    b[0] * a[0] + b[2] * a[1],
    b[1] * a[0] + b[3] * a[1],
    b[0] * a[2] + b[2] * a[3],
    b[1] * a[2] + b[3] * a[3],
    b[0] * a[4] + b[2] * a[5] + b[4],
    b[1] * a[4] + b[3] * a[5] + b[5],
  ];
}
function matApply(m, x, y) {
  return {
    x: m[0] * x + m[1] * y + m[4],
    y: m[2] * x + m[3] * y + m[5],
  };
}
function matInvert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-10) return matIdentity();
  const inv = 1 / det;
  const a = m[3] * inv, b = -m[1] * inv, c = -m[2] * inv, d = m[0] * inv;
  return [a, b, c, d, -(a * m[4] + b * m[5]), -(c * m[4] + d * m[5])];
}

// ── Pose definition ───────────────────────────────────────────────────────────
// getPoseBones(pose, t, pivots, scale, ox, oy) returns 8 forward matrices,
// one per bone, in destination-canvas space.

export function getPoseBones(pose, t, pivots, scale, ox, oy) {
  const dp = name => ({
    x: pivots[name].x * scale + ox,
    y: pivots[name].y * scale + oy,
  });

  const rot = (name, ang) => matRotateAround(ang, dp(name).x, dp(name).y);
  const trl = (dx, dy) => matTranslate(dx, dy);
  const rt = (name, ang, dx, dy) => matMul(trl(dx, dy), rot(name, ang));

  if (pose === 'idle') {
    const breath = sin1(t) * scale * 0.008;
    const sway = sin1(t) * 1.2 * DEG;
    const legRock = sin1(t) * 0.8 * DEG;
    const ady = -breath;
    return [
      rt('hair', sway * 2, 0, ady * 1.4),
      rt('head', sway * 0.4, 0, ady),
      rt('torso', sway * 0.2, 0, ady * 0.6),
      rt('armL', sway + 3 * DEG, 0, ady * 0.5),
      rt('armR', -sway - 3 * DEG, 0, ady * 0.5),
      rt('hips', -sway * 0.1, 0, ady * 0.3),
      rt('legL', legRock, 0, ady * 0.2),
      rt('legR', -legRock, 0, ady * 0.2),
    ];
  }

  if (pose === 'walk') {
    const bob = abs1(t) * scale * -0.018;
    const legSwg = sin1(t) * 28 * DEG;
    const armSwg = -sin1(t) * 22 * DEG;
    const hipRot = sin1(t) * 5 * DEG;
    const lean = 4 * DEG;
    const hairSwg = sin1(t) * 6 * DEG;
    return [
      rt('hair', lean + hairSwg, 0, bob * 0.5),
      rt('head', lean * 0.4, 0, bob * 0.6),
      rt('torso', lean, 0, bob * 0.5),
      rt('armL', armSwg, 0, bob * 0.4),
      rt('armR', -armSwg, 0, bob * 0.4),
      rt('hips', hipRot, 0, bob * 0.3),
      rt('legL', legSwg, 0, 0),
      rt('legR', -legSwg, 0, 0),
    ];
  }

  if (pose === 'run') {
    const bob = abs1(t) * scale * -0.034;
    const legSwg = sin1(t) * 50 * DEG;
    const armSwg = -sin1(t) * 44 * DEG;
    const hipRot = sin1(t) * 9 * DEG;
    const lean = 11 * DEG;
    const hairSwg = sin1(t) * 14 * DEG + lean;
    return [
      rt('hair', hairSwg, 0, bob * 0.6),
      rt('head', lean * 0.5, 0, bob * 0.7),
      rt('torso', lean, 0, bob * 0.5),
      rt('armL', armSwg, 0, bob * 0.4),
      rt('armR', -armSwg, 0, bob * 0.4),
      rt('hips', hipRot, 0, bob * 0.3),
      rt('legL', legSwg, 0, 0),
      rt('legR', -legSwg, 0, 0),
    ];
  }

  if (pose === 'jump') {
    const arc = -Math.sin(t * Math.PI);
    const tuck = arc * 28 * DEG;
    const armUp = arc * -55 * DEG;
    const lean = arc * 8 * DEG;
    const rise = arc * scale * 0.13;
    return [
      rt('hair', lean * -0.6, 0, rise - arc * scale * 0.05),
      rt('head', lean * -0.3, 0, rise * 0.6),
      rt('torso', lean, 0, 0),
      matMul(trl(-scale * 0.012, arc * scale * -0.01), rot('armL', armUp)),
      matMul(trl(scale * 0.012, arc * scale * -0.01), rot('armR', -armUp)),
      matIdentity(),
      matMul(trl(scale * 0.012, 0), rot('legL', tuck)),
      matMul(trl(-scale * 0.012, 0), rot('legR', -tuck)),
    ];
  }

  if (pose === 'attack') {
    const slashT = t < 0.3 ? -(t / 0.3) : (t - 0.3) / 0.7;
    const armRot = (slashT * 115 - 55) * DEG;
    const tw = slashT * 18 * DEG;
    const bob = -Math.abs(slashT) * scale * 0.012;
    return [
      rt('hair', tw * 0.5, 0, bob * 0.5),
      rt('head', tw * 0.3, 0, 0),
      rt('torso', tw, 0, bob),
      rt('armL', -20 * DEG, 0, 0),
      rt('armR', armRot, 0, 0),
      rt('hips', tw * 0.4, 0, bob * 0.5),
      rt('legL', -10 * DEG, 0, 0),
      rt('legR', 16 * DEG, 0, 0),
    ];
  }

  if (pose === 'hurt') {
    const recoil = Math.sin(t * Math.PI) * -22 * DEG;
    const shake = sin2(t) * 3 * DEG;
    const rise = -Math.sin(t * Math.PI) * scale * 0.02;
    return [
      rt('hair', recoil * -0.6 + shake, 0, rise * 0.5),
      rt('head', recoil * -0.4, 0, rise * 0.3),
      rt('torso', recoil, 0, rise),
      rt('armL', recoil + 22 * DEG, 0, 0),
      rt('armR', recoil - 22 * DEG, 0, 0),
      rt('hips', recoil * 0.4, 0, rise * 0.4),
      rt('legL', recoil * 0.3, 0, 0),
      rt('legR', recoil * 0.3, 0, 0),
    ];
  }

  if (pose === 'die') {
    const fall = clamp01(ease(t, 2.5));
    const lean = fall * 85 * DEG;
    const drop = fall * scale * 0.07;
    return [
      rt('hair', lean * 0.9, 0, drop * 1.0),
      rt('head', lean * 0.8, 0, drop * 0.8),
      rt('torso', lean * 0.85, 0, drop * 0.5),
      rt('armL', lean * 1.1, 0, drop * 0.4),
      rt('armR', -lean * 0.4, 0, drop * 0.4),
      rt('hips', lean * 0.8, 0, drop * 0.2),
      rt('legL', lean * 0.6, 0, 0),
      rt('legR', lean * 0.5, 0, 0),
    ];
  }

  if (pose === 'crouch') {
    const depth = clamp01(ease(clamp01(t * 2), 2));
    const spread = depth * 24 * DEG;
    const squat = depth * scale * 0.065;
    const lean = depth * 8 * DEG;
    return [
      rt('hair', 0, 0, squat),
      rt('head', lean, 0, squat * 0.8),
      rt('torso', lean, 0, squat * 0.6),
      rt('armL', 32 * DEG, 0, squat * 0.4),
      rt('armR', -32 * DEG, 0, squat * 0.4),
      matIdentity(),
      matMul(trl(scale * 0.012, 0), rot('legL', spread)),
      matMul(trl(-scale * 0.012, 0), rot('legR', -spread)),
    ];
  }

  if (pose === 'cast') {
    const raise = Math.abs(cos1(t)) * -62 * DEG;
    const sway = sin1(t) * 6 * DEG;
    const ripple = sin2(t) * 3 * DEG;
    const headY = -Math.abs(cos1(t)) * scale * 0.005;
    return [
      rt('hair', sway * 1.5 + ripple, 0, 0),
      rt('head', sway * 0.4, 0, headY),
      rt('torso', sway * 0.2, 0, 0),
      rt('armL', raise - 10 * DEG, 0, 0),
      rt('armR', sway, 0, 0),
      rt('hips', -sway * 0.1, 0, 0),
      rt('legL', sway * 0.5, 0, 0),
      rt('legR', -sway * 0.5, 0, 0),
    ];
  }

  return Array.from({ length: NUM_BONES }, () => matIdentity());
}

// ── Layer cache ───────────────────────────────────────────────────────────────
const BONE_ORDER = [B_HAIR, B_HEAD, B_TORSO, B_ARML, B_ARMR, B_HIPS, B_LEGL, B_LEGR];
const BONE_NAME_BY_INDEX = {
  [B_HAIR]: 'hair',
  [B_HEAD]: 'head',
  [B_TORSO]: 'torso',
  [B_ARML]: 'armL',
  [B_ARMR]: 'armR',
  [B_HIPS]: 'hips',
  [B_LEGL]: 'legL',
  [B_LEGR]: 'legR',
};

function ensureBoneLayers(skelData) {
  if (skelData._boneLayers && skelData._boneLayersW === skelData.srcW && skelData._boneLayersH === skelData.srcH) {
    return skelData._boneLayers;
  }

  const { srcData, srcW, srcH, weights, pivots } = skelData;
  const src = srcData.data;
  const total = srcW * srcH;

  const layerBuffers = Array.from({ length: NUM_BONES }, () => new ImageData(srcW, srcH));
  const layerData = layerBuffers.map(img => img.data);
  const order = [B_HAIR, B_HEAD, B_TORSO, B_ARML, B_ARMR, B_HIPS, B_LEGL, B_LEGR];

  for (let i = 0; i < total; i++) {
    const si = i * 4;
    const alpha = src[si + 3];
    if (alpha <= 0) continue;

    let bestBone = -1;
    let bestW = -1;
    for (let b = 0; b < NUM_BONES; b++) {
      const w = weights[b][i];
      if (w > bestW) {
        bestW = w;
        bestBone = b;
      }
    }

    if (bestBone < 0) continue;

    // Keep enough edge alpha so the assembled character does not fragment.
    const edgeAlpha = clamp(bestW * 1.12, 0.18, 1.0);
    const outA = Math.round(alpha * edgeAlpha);
    if (outA <= 0) continue;

    const dst = layerData[bestBone];
    dst[si] = src[si];
    dst[si + 1] = src[si + 1];
    dst[si + 2] = src[si + 2];
    dst[si + 3] = outA;
  }

  const canvases = layerBuffers.map(img => {
    const c = document.createElement('canvas');
    c.width = srcW;
    c.height = srcH;
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  });

  skelData._boneLayers = order.map(bone => ({
    bone,
    name: BONE_NAME_BY_INDEX[bone],
    canvas: canvases[bone],
    pivot: { x: pivots[BONE_NAME_BY_INDEX[bone]].x, y: pivots[BONE_NAME_BY_INDEX[bone]].y },
  }));
  skelData._boneLayersW = srcW;
  skelData._boneLayersH = srcH;
  return skelData._boneLayers;
}

function poseAlpha(pose, t) {
  if (pose === 'hurt') {
    const flash = t < 0.25 ? 1 : clamp01(1 - (t - 0.25) * 5);
    return 0.45 + 0.55 * (1 - flash * 0.45);
  }
  if (pose === 'die') {
    if (t > 0.65) return clamp01(1 - (t - 0.65) / 0.35);
  }
  return 1;
}

function drawOverlayEffects(ctx, DW, DH, pose, t) {
  if (pose === 'cast') {
    const glow = (1 + Math.sin(t * Math.PI * 4)) * 0.5;
    const ex = DW * 0.50;
    const ey = DH * 0.38;
    const r = 24 + glow * 30;
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
    g.addColorStop(0, `rgba(200,140,255,${0.7 * glow})`);
    g.addColorStop(0.5, `rgba(130,80,255,${0.3 * glow})`);
    g.addColorStop(1, 'rgba(80,40,200,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (pose === 'hurt') {
    const flash = t < 0.25 ? 1 : clamp01(1 - (t - 0.25) * 5);
    if (flash > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(255,50,50,${flash * 0.28})`;
      ctx.fillRect(0, 0, DW, DH);
      ctx.restore();
    }
  }
}

// ── Main render ───────────────────────────────────────────────────────────────
/**
 * Render one animation frame by drawing each bone layer with an affine transform.
 * The layer cache keeps the uploaded image intact while the pose deforms.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} skelData  result from detectSkeleton()
 * @param {string} pose
 * @param {number} t         phase 0..1
 * @param {'left'|'right'} dir
 */
export function renderFrame(ctx, skelData, pose, t, dir) {
  const { bb, pivots } = skelData;
  const DW = ctx.canvas.width;
  const DH = ctx.canvas.height;

  const layers = ensureBoneLayers(skelData);
  const scale = Math.min((DW * 0.78) / bb.w, (DH * 0.84) / bb.h);
  const ox = (DW - bb.w * scale) / 2 - bb.x * scale;
  const oy = (DH - bb.h * scale) / 2 - bb.y * scale;

  const alpha = poseAlpha(pose, t);
  const bones = getPoseBones(pose, t, pivots, scale, ox, oy);
  const mirror = dir === 'left' ? [ -1, 0, 0, 1, DW, 0 ] : null;

  ctx.clearRect(0, 0, DW, DH);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = alpha;

  // Draw back-to-front: legs, hips, torso, arms, head, hair.
  const drawList = [B_LEGL, B_LEGR, B_HIPS, B_TORSO, B_ARML, B_ARMR, B_HEAD, B_HAIR];

  for (const boneIndex of drawList) {
    const layer = layers.find(l => l.bone === boneIndex);
    const m = bones[boneIndex];
    if (!layer || !m) continue;

    const xform = mirror ? matMul(m, mirror) : m;
    ctx.save();
    ctx.setTransform(xform[0], xform[1], xform[2], xform[3], xform[4], xform[5]);
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
  }

  drawOverlayEffects(ctx, DW, DH, pose, t);
  ctx.restore();
}
