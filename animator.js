// animator.js — pose definitions and canvas rendering

import { JOINT_DEFS } from './bodyDetect.js';

const DEG = Math.PI / 180;
const PI2 = Math.PI * 2;
const sin = t => Math.sin(t * PI2);
const cos = t => Math.cos(t * PI2);
const abs = t => Math.abs(sin(t));
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = (t, p = 2.0) => t < 0.5 ? Math.pow(t * 2, p) / 2 : 1 - Math.pow((1 - t) * 2, p) / 2;

export const POSES = [
  { id: 'idle',   label: 'Idle',    ico: '🫧' },
  { id: 'walk',   label: 'Walk',    ico: '🚶' },
  { id: 'run',    label: 'Run',     ico: '🏃' },
  { id: 'jump',   label: 'Jump',    ico: '⬆' },
  { id: 'attack', label: 'Attack',  ico: '⚔' },
  { id: 'hurt',   label: 'Hurt',    ico: '💥' },
  { id: 'crouch', label: 'Crouch',  ico: '🧎' },
  { id: 'die',    label: 'Die',     ico: '☠' },
];

export function getPoseState(pose, t, H) {
  switch (pose) {
    case 'idle': {
      const bob = sin(t) * H * 0.012;
      const sway = sin(t) * 1.5 * DEG;
      return {
        globalDY: bob,
        torso: { rot: sway * 0.25, dx: 0, dy: bob * 0.3 },
        chest: { rot: sway * 0.2, dx: 0, dy: bob * 0.2 },
        pelvis: { rot: -sway * 0.15, dx: 0, dy: -bob * 0.2 },
        head: { rot: sway * 0.2, dx: 0, dy: -bob * 0.1 },
        hair: { rot: -sway * 0.35, dx: 0, dy: -bob * 0.05 },
        upperArmL: { rot: 4 * DEG + sin(t) * 4 * DEG, dx: 0, dy: 0 },
        lowerArmL: { rot: 1 * DEG + sin(t + 0.1) * 3 * DEG, dx: 0, dy: 0 },
        handL: { rot: 1 * DEG, dx: 0, dy: 0 },
        upperArmR: { rot: -4 * DEG - sin(t) * 4 * DEG, dx: 0, dy: 0 },
        lowerArmR: { rot: -1 * DEG - sin(t + 0.1) * 3 * DEG, dx: 0, dy: 0 },
        handR: { rot: -1 * DEG, dx: 0, dy: 0 },
        thighL: { rot: sin(t) * 3 * DEG, dx: 0, dy: 0 },
        shinL: { rot: -sin(t + 0.1) * 2 * DEG, dx: 0, dy: 0 },
        footL: { rot: 0, dx: 0, dy: 0 },
        thighR: { rot: -sin(t) * 3 * DEG, dx: 0, dy: 0 },
        shinR: { rot: sin(t + 0.1) * 2 * DEG, dx: 0, dy: 0 },
        footR: { rot: 0, dx: 0, dy: 0 },
      };
    }
    case 'walk': {
      const step = sin(t);
      const swing = sin(t);
      const bob = abs(t) * H * -0.030;
      const lean = 6 * DEG;
      return {
        globalDY: bob,
        torso: { rot: lean + step * 2 * DEG, dx: 0, dy: bob * 0.25 },
        chest: { rot: lean * 0.7 + step * 1.5 * DEG, dx: 0, dy: bob * 0.15 },
        pelvis: { rot: -step * 4 * DEG, dx: 0, dy: bob * 0.30 },
        head: { rot: -lean * 0.5 - step * 1.0 * DEG, dx: 0, dy: bob * 0.10 },
        hair: { rot: -lean * 1.0 - step * 1.8 * DEG, dx: 0, dy: bob * 0.05 },
        upperArmL: { rot: -swing * 34 * DEG - 8 * DEG, dx: 0, dy: 0 },
        lowerArmL: { rot: -swing * 12 * DEG - 4 * DEG, dx: 0, dy: 0 },
        handL: { rot: -swing * 4 * DEG, dx: 0, dy: 0 },
        upperArmR: { rot: swing * 34 * DEG + 8 * DEG, dx: 0, dy: 0 },
        lowerArmR: { rot: swing * 12 * DEG + 4 * DEG, dx: 0, dy: 0 },
        handR: { rot: swing * 4 * DEG, dx: 0, dy: 0 },
        thighL: { rot: swing * 42 * DEG + 6 * DEG, dx: 0, dy: -Math.max(0, swing) * H * 0.06 },
        shinL: { rot: -swing * 14 * DEG, dx: 0, dy: 0 },
        footL: { rot: -Math.max(0, swing) * 7 * DEG, dx: 0, dy: 0 },
        thighR: { rot: -swing * 42 * DEG - 6 * DEG, dx: 0, dy: -Math.max(0, -swing) * H * 0.06 },
        shinR: { rot: swing * 14 * DEG, dx: 0, dy: 0 },
        footR: { rot: Math.max(0, -swing) * 7 * DEG, dx: 0, dy: 0 },
      };
    }
    case 'run': {
      const step = sin(t);
      const bob = abs(t) * H * -0.052;
      const lean = 16 * DEG;
      return {
        globalDY: bob,
        torso: { rot: lean + step * 3 * DEG, dx: 0, dy: bob * 0.35 },
        chest: { rot: lean * 0.8 + step * 2 * DEG, dx: 0, dy: bob * 0.2 },
        pelvis: { rot: -step * 7 * DEG, dx: 0, dy: bob * 0.25 },
        head: { rot: -lean * 0.35 - step * 1.2 * DEG, dx: 0, dy: bob * 0.12 },
        hair: { rot: -lean * 0.8 - step * 2.2 * DEG, dx: 0, dy: bob * 0.06 },
        upperArmL: { rot: -step * 58 * DEG - 18 * DEG, dx: 0, dy: 0 },
        lowerArmL: { rot: -step * 24 * DEG - 12 * DEG, dx: 0, dy: 0 },
        handL: { rot: -step * 8 * DEG, dx: 0, dy: 0 },
        upperArmR: { rot: step * 58 * DEG + 18 * DEG, dx: 0, dy: 0 },
        lowerArmR: { rot: step * 24 * DEG + 12 * DEG, dx: 0, dy: 0 },
        handR: { rot: step * 8 * DEG, dx: 0, dy: 0 },
        thighL: { rot: step * 64 * DEG + 18 * DEG, dx: 0, dy: -Math.max(0, step) * H * 0.10 },
        shinL: { rot: -step * 28 * DEG, dx: 0, dy: 0 },
        footL: { rot: -Math.max(0, step) * 12 * DEG, dx: 0, dy: 0 },
        thighR: { rot: -step * 64 * DEG - 18 * DEG, dx: 0, dy: -Math.max(0, -step) * H * 0.10 },
        shinR: { rot: step * 28 * DEG, dx: 0, dy: 0 },
        footR: { rot: Math.max(0, -step) * 12 * DEG, dx: 0, dy: 0 },
      };
    }
    case 'jump': {
      const arc = Math.sin(t * Math.PI);
      const tuck = arc * 30 * DEG;
      const rise = arc * H * 0.20;
      return {
        globalDY: -rise,
        torso: { rot: arc * 10 * DEG, dx: 0, dy: 0 },
        chest: { rot: arc * 7 * DEG, dx: 0, dy: 0 },
        pelvis: { rot: -arc * 2 * DEG, dx: 0, dy: 0 },
        head: { rot: -arc * 4 * DEG, dx: 0, dy: 0 },
        hair: { rot: -arc * 8 * DEG, dx: 0, dy: 0 },
        upperArmL: { rot: -arc * 55 * DEG - 10 * DEG, dx: 0, dy: 0 },
        lowerArmL: { rot: -arc * 18 * DEG, dx: 0, dy: 0 },
        handL: { rot: 0, dx: 0, dy: 0 },
        upperArmR: { rot: arc * 55 * DEG + 10 * DEG, dx: 0, dy: 0 },
        lowerArmR: { rot: arc * 18 * DEG, dx: 0, dy: 0 },
        handR: { rot: 0, dx: 0, dy: 0 },
        thighL: { rot: tuck + 20 * DEG, dx: 0, dy: 0 },
        shinL: { rot: -tuck, dx: 0, dy: 0 },
        footL: { rot: 0, dx: 0, dy: 0 },
        thighR: { rot: -tuck - 20 * DEG, dx: 0, dy: 0 },
        shinR: { rot: tuck, dx: 0, dy: 0 },
        footR: { rot: 0, dx: 0, dy: 0 },
      };
    }
    case 'attack': {
      const s = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
      const swing = ease(clamp01(s), 2.6);
      return {
        torso: { rot: swing * 12 * DEG, dx: 0, dy: 0 },
        chest: { rot: swing * 8 * DEG, dx: 0, dy: 0 },
        pelvis: { rot: swing * 3 * DEG, dx: 0, dy: 0 },
        head: { rot: swing * 4 * DEG, dx: 0, dy: 0 },
        hair: { rot: swing * 6 * DEG, dx: 0, dy: 0 },
        upperArmL: { rot: -10 * DEG, dx: 0, dy: 0 },
        lowerArmL: { rot: -12 * DEG, dx: 0, dy: 0 },
        handL: { rot: -5 * DEG, dx: 0, dy: 0 },
        upperArmR: { rot: -60 * DEG + swing * 110 * DEG, dx: 0, dy: 0 },
        lowerArmR: { rot: 12 * DEG + swing * 45 * DEG, dx: 0, dy: 0 },
        handR: { rot: swing * 16 * DEG, dx: 0, dy: 0 },
        thighL: { rot: -4 * DEG, dx: 0, dy: 0 },
        shinL: { rot: 4 * DEG, dx: 0, dy: 0 },
        thighR: { rot: 8 * DEG, dx: 0, dy: 0 },
        shinR: { rot: -8 * DEG, dx: 0, dy: 0 },
      };
    }
    case 'hurt': {
      const flash = 0.5 + 0.5 * Math.sin(t * PI2 * 8);
      return {
        globalDY: -H * 0.01,
        torso: { rot: -10 * DEG, dx: 0, dy: 0 },
        chest: { rot: -8 * DEG, dx: 0, dy: 0 },
        pelvis: { rot: -4 * DEG, dx: 0, dy: 0 },
        head: { rot: 12 * DEG * flash, dx: 0, dy: 0 },
        hair: { rot: 14 * DEG * flash, dx: 0, dy: 0 },
        upperArmL: { rot: 22 * DEG, dx: 0, dy: 0 },
        lowerArmL: { rot: -12 * DEG, dx: 0, dy: 0 },
        upperArmR: { rot: -22 * DEG, dx: 0, dy: 0 },
        lowerArmR: { rot: 12 * DEG, dx: 0, dy: 0 },
        thighL: { rot: 4 * DEG, dx: 0, dy: 0 },
        thighR: { rot: -4 * DEG, dx: 0, dy: 0 },
      };
    }
    case 'crouch': {
      const d = ease(clamp01(t < 0.5 ? t * 2 : 1), 2.2);
      return {
        globalDY: H * 0.05 * d,
        torso: { rot: 18 * DEG * d, dx: 0, dy: 0 },
        chest: { rot: 14 * DEG * d, dx: 0, dy: 0 },
        pelvis: { rot: 5 * DEG * d, dx: 0, dy: 0 },
        head: { rot: 8 * DEG * d, dx: 0, dy: 0 },
        hair: { rot: 6 * DEG * d, dx: 0, dy: 0 },
        upperArmL: { rot: 28 * DEG * d, dx: 0, dy: 0 },
        upperArmR: { rot: -28 * DEG * d, dx: 0, dy: 0 },
        thighL: { rot: 24 * DEG * d, dx: 0, dy: 0 },
        thighR: { rot: -24 * DEG * d, dx: 0, dy: 0 },
        shinL: { rot: -18 * DEG * d, dx: 0, dy: 0 },
        shinR: { rot: 18 * DEG * d, dx: 0, dy: 0 },
      };
    }
    case 'die': {
      const d = ease(clamp01(t), 2.8);
      return {
        globalDY: H * 0.08 * d,
        torso: { rot: 92 * DEG * d, dx: 0, dy: 0 },
        chest: { rot: 88 * DEG * d, dx: 0, dy: 0 },
        pelvis: { rot: 84 * DEG * d, dx: 0, dy: 0 },
        head: { rot: 68 * DEG * d, dx: 0, dy: 0 },
        hair: { rot: 70 * DEG * d, dx: 0, dy: 0 },
        upperArmL: { rot: 116 * DEG * d, dx: 0, dy: 0 },
        upperArmR: { rot: -90 * DEG * d, dx: 0, dy: 0 },
        thighL: { rot: 64 * DEG * d, dx: 0, dy: 0 },
        thighR: { rot: 56 * DEG * d, dx: 0, dy: 0 },
      };
    }
    default:
      return getPoseState('idle', t, H);
  }
}

function jointDef(id) {
  return JOINT_DEFS.find(j => j.id === id) || null;
}

function restAngle(joints, id) {
  const def = jointDef(id);
  if (!def || !def.parent || !joints[def.parent] || !joints[id]) return -Math.PI / 2;
  const a = joints[def.parent], b = joints[id];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function sortParts(parts, dir) {
  const ids = Object.keys(parts);
  const rank = (typeId = '') => {
    const t = typeId.toLowerCase();
    const back = dir === 'right' ? ['handl', 'lowerarml', 'upperarml', 'footl', 'shinl', 'thighl'] : ['handr', 'lowerarmr', 'upperarmr', 'footr', 'shinr', 'thighr'];
    const front = dir === 'right' ? ['thighr', 'shinr', 'footr', 'upperarmr', 'lowerarmr', 'handr'] : ['thighl', 'shinl', 'footl', 'upperarml', 'lowerarml', 'handl'];
    if (back.includes(t)) return 10;
    if (['pelvis'].includes(t)) return 20;
    if (['torso', 'chest', 'neck'].includes(t)) return 30;
    if (front.includes(t)) return 40;
    if (['head', 'hair'].includes(t)) return 50;
    return 60;
  };
  return ids.sort((a, b) => rank(parts[a].typeId) - rank(parts[b].typeId));
}

export function renderFrame(ctx, puppet, pose, t, dir = 'right') {
  if (!puppet) return;
  const { parts, joints, bb } = puppet;
  const DW = ctx.canvas.width, DH = ctx.canvas.height;
  ctx.clearRect(0, 0, DW, DH);

  const scale = Math.min((DW * 0.86) / bb.w, (DH * 0.86) / bb.h);
  const H = bb.h * scale;
  const groundY = DH * 0.90;
  const baseX = DW * 0.5 - (bb.x + bb.w * 0.5) * scale;
  const baseY = groundY - (bb.y + bb.h) * scale;
  const poseState = getPoseState(pose, t, H);
  const gDY = poseState.globalDY || 0;

  const baseWorld = {};
  for (const id of Object.keys(joints)) {
    baseWorld[id] = {
      x: baseX + joints[id].x * scale,
      y: baseY + joints[id].y * scale + gDY,
    };
  }

  ctx.save();
  if (dir === 'left') {
    ctx.translate(DW, 0);
    ctx.scale(-1, 1);
  }

  const order = sortParts(parts, dir);
  for (const id of order) {
    const p = parts[id];
    if (!p?.canvas) continue;
    const def = jointDef(p.anchorJoint) || jointDef(p.typeId) || jointDef(id);
    const baseRot = def ? restAngle(joints, p.anchorJoint || def.id) : -Math.PI / 2;
    const st = poseState[id] || { rot: 0, dx: 0, dy: 0 };
    const j = baseWorld[p.anchorJoint] || baseWorld.pelvis || { x: DW * 0.5, y: DH * 0.5 };
    const wx = j.x + (st.dx || 0);
    const wy = j.y + (st.dy || 0);
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(baseRot + (st.rot || 0));
    ctx.drawImage(p.canvas, -p.anchorX * scale, -p.anchorY * scale, p.canvas.width * scale, p.canvas.height * scale);
    ctx.restore();
  }

  ctx.restore();

  if (pose === 'hurt') _hurtFlash(ctx, DW, DH, t);
  if (pose === 'attack') _attackTrail(ctx, DW, DH, t);
}

function _hurtFlash(ctx, DW, DH, t) {
  const a = 0.14 + 0.18 * Math.sin(t * PI2 * 10);
  ctx.save();
  ctx.fillStyle = `rgba(255, 60, 60, ${Math.max(0, a)})`;
  ctx.fillRect(0, 0, DW, DH);
  ctx.restore();
}

function _attackTrail(ctx, DW, DH, t) {
  const f = Math.max(0, Math.sin(t * Math.PI));
  const gx = DW * 0.65, gy = DH * 0.42, r = 20 + 30 * f;
  const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
  grad.addColorStop(0, `rgba(255, 220, 120, ${0.20 * f})`);
  grad.addColorStop(1, 'rgba(255, 220, 120, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(gx, gy, r, 0, PI2); ctx.fill();
  ctx.restore();
}
