// animator.js — skeletal pose interpolation and rendering

import { normalizeKind } from './bodyDetect.js';

export const POSES = [
  { id: 'idle',   ico: '🫥', label: 'Idle' },
  { id: 'walk',   ico: '🚶', label: 'Walk' },
  { id: 'run',    ico: '🏃', label: 'Run' },
  { id: 'jump',   ico: '⬆',  label: 'Jump' },
  { id: 'attack', ico: '⚔',  label: 'Attack' },
  { id: 'hurt',   ico: '💥',  label: 'Hurt' },
  { id: 'crouch', ico: '🧎',  label: 'Crouch' },
  { id: 'cast',   ico: '✨',  label: 'Cast' },
  { id: 'die',    ico: '✖',  label: 'Die' },
];

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

function sin1(t) { return Math.sin(t * TAU); }
function cos1(t) { return Math.cos(t * TAU); }
function abs1(t) { return Math.abs(Math.sin(t * TAU)); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function ease(t, power = 2) { return Math.pow(clamp(t, 0, 1), power); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rot(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return { x: x * c - y * s, y: x * s + y * c }; }

function kindOf(part) {
  return normalizeKind(part.kind || part.label);
}

function sideOf(part) {
  const k = `${part.kind || ''} ${part.label || ''}`.toLowerCase();
  if (k.includes('left') || k.includes(' l') || /l$/.test(k)) return -1;
  if (k.includes('right') || k.includes(' r') || /r$/.test(k)) return 1;
  if (k.endsWith('l')) return -1;
  if (k.endsWith('r')) return 1;
  return 0;
}

function motionFor(part, pose, phase, scale, depth = 0) {
  const kind = kindOf(part);
  const side = sideOf(part) || 1;
  const wave = sin1(phase);
  const sway = sin1(phase + 0.25);
  const bob = abs1(phase) * 3;

  const base = { rot: 0, dx: 0, dy: 0 };

  const subtle = {
    rot: sway * DEG * 2.0 * (1 / (depth + 1)),
    dx: 0,
    dy: -bob * 0.2,
  };

  switch (pose) {
    case 'idle':
      if (kind === 'head') return { rot: sway * DEG * -2.0, dx: 0, dy: -bob * 0.35 };
      if (kind === 'neck') return { rot: sway * DEG * -1.1, dx: 0, dy: -bob * 0.18 };
      if (kind === 'torso' || kind === 'hips' || kind === 'pelvis') return { rot: sway * DEG * 1.6, dx: 0, dy: bob * 0.12 };
      if (kind === 'hair') return { rot: sway * DEG * -3.0, dx: 0, dy: -bob * 0.25 };
      return subtle;

    case 'walk': {
      const step = wave;
      const leg = step * DEG * 34 * side;
      const arm = -step * DEG * 26 * side;
      const lowerLeg = Math.max(0, -step) * DEG * 14 * side;
      const foot = Math.max(0, step) * DEG * 10 * side;
      if (kind === 'torso' || kind === 'hips' || kind === 'pelvis') return { rot: Math.sin(phase * TAU) * DEG * 4, dx: 0, dy: -bob * 0.15 };
      if (kind === 'head') return { rot: -Math.sin(phase * TAU) * DEG * 3, dx: 0, dy: -bob * 0.45 };
      if (kind === 'neck') return { rot: -Math.sin(phase * TAU) * DEG * 2, dx: 0, dy: -bob * 0.25 };
      if (kind === 'upperLegL' || kind === 'upperLegR') return { rot: leg, dx: 0, dy: 0 };
      if (kind === 'lowerLegL' || kind === 'lowerLegR') return { rot: leg * 0.35 + lowerLeg, dx: 0, dy: 0 };
      if (kind === 'footL' || kind === 'footR') return { rot: foot, dx: 0, dy: 0 };
      if (kind === 'upperArmL' || kind === 'upperArmR') return { rot: arm, dx: 0, dy: 0 };
      if (kind === 'lowerArmL' || kind === 'lowerArmR') return { rot: arm * 0.42, dx: 0, dy: 0 };
      if (kind === 'handL' || kind === 'handR') return { rot: arm * 0.15, dx: 0, dy: 0 };
      if (kind === 'hair') return { rot: Math.sin(phase * TAU) * DEG * 8, dx: 0, dy: -bob * 0.25 };
      return subtle;
    }

    case 'run': {
      const step = wave;
      const leg = step * DEG * 55 * side;
      const arm = -step * DEG * 48 * side;
      const lowerLeg = Math.max(0, -step) * DEG * 24 * side;
      const foot = Math.max(0, step) * DEG * 14 * side;
      if (kind === 'torso' || kind === 'hips' || kind === 'pelvis') return { rot: DEG * 10, dx: 0, dy: -bob * 0.3 };
      if (kind === 'head') return { rot: DEG * 3, dx: 0, dy: -bob * 0.35 };
      if (kind === 'neck') return { rot: DEG * 2, dx: 0, dy: -bob * 0.2 };
      if (kind === 'upperLegL' || kind === 'upperLegR') return { rot: leg, dx: 0, dy: 0 };
      if (kind === 'lowerLegL' || kind === 'lowerLegR') return { rot: leg * 0.25 + lowerLeg, dx: 0, dy: 0 };
      if (kind === 'footL' || kind === 'footR') return { rot: foot, dx: 0, dy: 0 };
      if (kind === 'upperArmL' || kind === 'upperArmR') return { rot: arm, dx: 0, dy: 0 };
      if (kind === 'lowerArmL' || kind === 'lowerArmR') return { rot: arm * 0.35, dx: 0, dy: 0 };
      if (kind === 'handL' || kind === 'handR') return { rot: arm * 0.15, dx: 0, dy: 0 };
      if (kind === 'hair') return { rot: step * DEG * 14 * side, dx: 0, dy: -bob * 0.3 };
      return subtle;
    }

    case 'jump': {
      const arc = Math.sin(phase * Math.PI);
      const tuck = arc * DEG * 38;
      const armsUp = arc * DEG * -56;
      if (kind === 'torso' || kind === 'hips' || kind === 'pelvis') return { rot: -arc * DEG * 10, dx: 0, dy: -5 };
      if (kind === 'head') return { rot: -arc * DEG * 6, dx: 0, dy: -7 };
      if (kind === 'neck') return { rot: -arc * DEG * 4, dx: 0, dy: -5 };
      if (kind === 'upperArmL' || kind === 'upperArmR') return { rot: armsUp, dx: 0, dy: 0 };
      if (kind === 'lowerArmL' || kind === 'lowerArmR') return { rot: armsUp * 0.5, dx: 0, dy: 0 };
      if (kind === 'handL' || kind === 'handR') return { rot: armsUp * 0.15, dx: 0, dy: 0 };
      if (kind === 'upperLegL' || kind === 'upperLegR') return { rot: tuck * (kind.endsWith('L') ? 1 : -1), dx: 0, dy: 0 };
      if (kind === 'lowerLegL' || kind === 'lowerLegR') return { rot: tuck * 0.35 * (kind.endsWith('L') ? 1 : -1), dx: 0, dy: 0 };
      if (kind === 'footL' || kind === 'footR') return { rot: tuck * 0.1, dx: 0, dy: 0 };
      return { rot: 0, dx: 0, dy: -arc * 12 };
    }

    case 'attack': {
      const wind = phase < 0.34 ? phase / 0.34 : (1 - (phase - 0.34) / 0.66);
      const swing = Math.sin(clamp(wind, 0, 1) * Math.PI);
      const power = swing * DEG * 92;
      if (kind === 'torso' || kind === 'hips' || kind === 'pelvis') return { rot: DEG * 14 * clamp(wind, 0, 1), dx: 0, dy: -2 };
      if (kind === 'head') return { rot: DEG * 8 * clamp(wind, 0, 1), dx: 0, dy: 0 };
      if (kind === 'neck') return { rot: DEG * 6 * clamp(wind, 0, 1), dx: 0, dy: 0 };
      if (kind === 'upperArmR' || kind === 'upperArmL') return { rot: power * (kind.endsWith('R') ? 1 : -0.35), dx: 0, dy: 0 };
      if (kind === 'lowerArmR' || kind === 'lowerArmL') return { rot: power * 0.45 * (kind.endsWith('R') ? 1 : -0.2), dx: 0, dy: 0 };
      if (kind === 'handR' || kind === 'handL') return { rot: power * 0.12, dx: 0, dy: 0 };
      if (kind === 'upperLegL' || kind === 'upperLegR') return { rot: DEG * -6, dx: 0, dy: 0 };
      if (kind === 'lowerLegL' || kind === 'lowerLegR') return { rot: DEG * 10, dx: 0, dy: 0 };
      return subtle;
    }

    case 'hurt': {
      const shake = Math.sin(phase * TAU * 12) * DEG * 2.5;
      if (kind === 'torso' || kind === 'hips' || kind === 'pelvis') return { rot: -DEG * 10, dx: 0, dy: 0 };
      if (kind === 'head') return { rot: -DEG * 5 + shake, dx: 0, dy: -3 };
      if (kind === 'neck') return { rot: -DEG * 4 + shake * 0.6, dx: 0, dy: 0 };
      if (kind === 'hair') return { rot: shake * 1.2, dx: 0, dy: 0 };
      if (kind === 'upperArmL' || kind === 'upperArmR') return { rot: DEG * 28 * (kind.endsWith('L') ? -1 : 1), dx: 0, dy: 0 };
      if (kind === 'lowerArmL' || kind === 'lowerArmR') return { rot: DEG * 16 * (kind.endsWith('L') ? -1 : 1), dx: 0, dy: 0 };
      if (kind === 'upperLegL' || kind === 'upperLegR') return { rot: DEG * 4, dx: 0, dy: 0 };
      return { rot: shake * 0.5, dx: 0, dy: 0 };
    }

    case 'crouch': {
      const d = ease(clamp(phase * 1.7, 0, 1), 2);
      if (kind === 'torso' || kind === 'hips' || kind === 'pelvis') return { rot: DEG * 18 * d, dx: 0, dy: 2 * d };
      if (kind === 'head') return { rot: DEG * 8 * d, dx: 0, dy: 2 * d };
      if (kind === 'neck') return { rot: DEG * 6 * d, dx: 0, dy: 0 };
      if (kind === 'upperArmL' || kind === 'upperArmR') return { rot: DEG * 26 * (kind.endsWith('L') ? 1 : -1), dx: 0, dy: 0 };
      if (kind === 'lowerArmL' || kind === 'lowerArmR') return { rot: DEG * 14 * (kind.endsWith('L') ? 1 : -1), dx: 0, dy: 0 };
      if (kind === 'upperLegL' || kind === 'upperLegR') return { rot: DEG * 26 * (kind.endsWith('L') ? -1 : 1), dx: 0, dy: 0 };
      if (kind === 'lowerLegL' || kind === 'lowerLegR') return { rot: DEG * 18 * (kind.endsWith('L') ? 1 : -1), dx: 0, dy: 0 };
      return subtle;
    }

    case 'cast': {
      const sway2 = sin1(phase * 0.8);
      if (kind === 'torso' || kind === 'hips' || kind === 'pelvis') return { rot: DEG * 4 * sway2, dx: 0, dy: 0 };
      if (kind === 'head') return { rot: DEG * 3 * sway2, dx: 0, dy: 0 };
      if (kind === 'neck') return { rot: DEG * 2 * sway2, dx: 0, dy: 0 };
      if (kind === 'upperArmR' || kind === 'upperArmL') return { rot: DEG * -68 + DEG * 10 * sway2, dx: 0, dy: 0 };
      if (kind === 'lowerArmR' || kind === 'lowerArmL') return { rot: DEG * -18 + DEG * 8 * sway2, dx: 0, dy: 0 };
      if (kind === 'handR' || kind === 'handL') return { rot: DEG * 5 * sway2, dx: 0, dy: 0 };
      if (kind === 'hair') return { rot: DEG * 8 * sway2, dx: 0, dy: 0 };
      return subtle;
    }

    case 'die': {
      const d = ease(phase, 2.6);
      const lean = d * DEG * 92;
      const fade = phase > 0.6 ? clamp(1 - (phase - 0.6) / 0.4, 0, 1) : 1;
      if (kind === 'torso' || kind === 'hips' || kind === 'pelvis') return { rot: lean * 0.85, dx: 0, dy: 3 * d };
      if (kind === 'head') return { rot: lean * 0.9, dx: 0, dy: 3 * d };
      if (kind === 'neck') return { rot: lean * 0.85, dx: 0, dy: 3 * d };
      if (kind === 'upperArmL' || kind === 'upperArmR') return { rot: lean * 0.7 * (kind.endsWith('L') ? 1 : -1), dx: 0, dy: 0 };
      if (kind === 'lowerArmL' || kind === 'lowerArmR') return { rot: lean * 0.4 * (kind.endsWith('L') ? 1 : -1), dx: 0, dy: 0 };
      if (kind === 'upperLegL' || kind === 'upperLegR') return { rot: lean * 0.45, dx: 0, dy: 0 };
      if (kind === 'lowerLegL' || kind === 'lowerLegR') return { rot: lean * 0.3, dx: 0, dy: 0 };
      return { rot: lean * 0.2, dx: 0, dy: 0, alpha: fade };
    }

    default:
      return base;
  }
}

function drawShadow(ctx, centerX, centerY, scale, phase, dir) {
  const wobble = 0.5 + 0.5 * Math.sin(phase * TAU * 2);
  const rx = scale * lerp(0.18, 0.26, wobble);
  const ry = scale * 0.045;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function renderPart(ctx, part, pose, phase, dir, scale, worldX, worldY, worldAngle, depth = 0) {
  const m = motionFor(part, pose, phase, scale, depth);
  const kind = kindOf(part);
  const pivot = part.pivotLocal || { x: part.canvas.width * 0.5, y: part.canvas.height * 0.5 };
  const local = part.localOffset || { x: 0, y: 0 };
  const offset = rot((local.x + (m.dx || 0)) * scale, (local.y + (m.dy || 0)) * scale, worldAngle);
  const px = worldX + offset.x;
  const py = worldY + offset.y;
  const ang = worldAngle + (m.rot || 0);
  const alpha = m.alpha == null ? 1 : m.alpha;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  ctx.globalAlpha = alpha;
  if (part.visible !== false && part.canvas) {
    ctx.drawImage(
      part.canvas,
      -pivot.x * scale,
      -pivot.y * scale,
      part.canvas.width * scale,
      part.canvas.height * scale,
    );
  }
  ctx.restore();

  return { x: px, y: py, angle: ang, kind, alpha };
}

export function renderFrame(ctx, rig, pose, phase, dir = 'right', options = {}) {
  const canvas = ctx.canvas;
  const DW = canvas.width;
  const DH = canvas.height;
  ctx.clearRect(0, 0, DW, DH);
  if (!rig?.parts?.length) return;

  const bb = rig.bb || { x: 0, y: 0, w: 100, h: 100 };
  const scale = Math.min((DW * 0.78) / Math.max(1, bb.w), (DH * 0.78) / Math.max(1, bb.h));
  const originX = DW * 0.5 - (rig.anchor?.x ?? bb.x + bb.w * 0.5) * scale;
  const originY = DH * 0.88 - (rig.anchor?.y ?? bb.y + bb.h * 0.5) * scale;

  // background shadow / ground touch point
  drawShadow(ctx, DW * 0.5, DH * 0.90, DW, phase, dir);

  ctx.save();
  if (dir === 'left') {
    ctx.translate(DW, 0);
    ctx.scale(-1, 1);
  }

  const byId = rig.byId || new Map(rig.parts.map(p => [p.id, p]));
  const children = new Map();
  for (const p of rig.parts) {
    const parentId = p.parentId && byId.has(p.parentId) ? p.parentId : null;
    if (parentId) {
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(p);
    }
  }
  for (const arr of children.values()) arr.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const roots = rig.roots?.length ? rig.roots : rig.parts.filter(p => !p.parentId || !byId.has(p.parentId));
  roots.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  const recurse = (part, parentWorld, parentAngle, depth = 0) => {
    const drawn = renderPart(ctx, part, pose, phase, dir, scale, parentWorld.x, parentWorld.y, parentAngle, depth);
    const kids = children.get(part.id) || [];
    for (const child of kids) recurse(child, { x: drawn.x, y: drawn.y }, drawn.angle, depth + 1);
  };

  for (const root of roots) {
    // draw roots at the rig origin; root localOffset is ignored for the first layer
    const rootPose = motionFor(root, pose, phase, scale, 0);
    const pivot = root.pivotLocal || { x: root.canvas.width * 0.5, y: root.canvas.height * 0.5 };
    const rootX = originX + (rootPose.dx || 0) * scale;
    const rootY = originY + (rootPose.dy || 0) * scale;
    const rootAngle = (rootPose.rot || 0);
    ctx.save();
    ctx.translate(rootX, rootY);
    ctx.rotate(rootAngle);
    ctx.globalAlpha = rootPose.alpha == null ? 1 : rootPose.alpha;
    if (root.visible !== false && root.canvas) {
      ctx.drawImage(root.canvas, -pivot.x * scale, -pivot.y * scale, root.canvas.width * scale, root.canvas.height * scale);
    }
    ctx.restore();
    const drawn = { x: rootX, y: rootY, angle: rootAngle };
    const kids = children.get(root.id) || [];
    for (const child of kids) recurse(child, drawn, drawn.angle, 1);
  }

  ctx.restore();

  if (options.showBounds && bb) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.strokeRect(originX + bb.x * scale, originY + bb.y * scale, bb.w * scale, bb.h * scale);
    ctx.restore();
  }
}

export function bakeSpriteSheet(rig, pose, frameCount, size, layout = 'horizontal', dir = 'right') {
  const cols = layout === 'grid' ? Math.ceil(Math.sqrt(frameCount)) : frameCount;
  const rows = layout === 'grid' ? Math.ceil(frameCount / cols) : 1;
  const sheet = document.createElement('canvas');
  sheet.width = cols * size;
  sheet.height = rows * size;
  const sctx = sheet.getContext('2d');
  for (let i = 0; i < frameCount; i++) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    renderFrame(ctx, rig, pose, i / frameCount, dir);
    const x = (i % cols) * size;
    const y = Math.floor(i / cols) * size;
    sctx.drawImage(c, x, y);
  }
  return sheet;
}
