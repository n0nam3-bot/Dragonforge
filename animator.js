// animator.js — Pivot-based skeletal animation using detected body parts

export const POSES = [
  { id: 'idle',   label: 'IDLE',   ico: '🧍' },
  { id: 'walk',   label: 'WALK',   ico: '🚶' },
  { id: 'run',    label: 'RUN',    ico: '🏃' },
  { id: 'jump',   label: 'JUMP',   ico: '🦘' },
  { id: 'attack', label: 'ATTACK', ico: '⚔️' },
  { id: 'hurt',   label: 'HURT',   ico: '💢' },
  { id: 'die',    label: 'DIE',    ico: '💀' },
  { id: 'crouch', label: 'CROUCH', ico: '🦆' },
  { id: 'cast',   label: 'CAST',   ico: '✨' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const DEG   = Math.PI / 180;
const sin1  = t => Math.sin(t * Math.PI * 2);
const cos1  = t => Math.cos(t * Math.PI * 2);
const sin2  = t => Math.sin(t * Math.PI * 4);
const abs1  = t => Math.abs(sin1(t));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease  = (t, p = 2) => t < 0.5
  ? Math.pow(t * 2, p) / 2
  : 1 - Math.pow((1 - t) * 2, p) / 2;

// ── POSE TABLE ────────────────────────────────────────────────────────────────
// rot  = radians, clockwise positive, around the part's anchor/joint
// dx   = horizontal shift as fraction of bb.h (character height)
// dy   = vertical shift as fraction of bb.h
// alpha = opacity 0..1

export function getPoseTransforms(pose, t) {
  switch (pose) {

    // ── IDLE ──────────────────────────────────────────────────────────────────
    case 'idle': {
      const breath = sin1(t) * 0.006;
      const sway   = sin1(t) * 0.5;
      return {
        order: ['legL','legR','hips','torso','armL','armR','head','hair'],
        hair:  { rot: sway * DEG,         dx: 0,     dy: -breath * 0.5, alpha: 1 },
        head:  { rot: sway * 0.3 * DEG,   dx: 0,     dy: -breath,       alpha: 1 },
        torso: { rot: sway * 0.2 * DEG,   dx: 0,     dy: -breath * 0.7, alpha: 1 },
        armL:  { rot: (3 + sin1(t)*3)*DEG,dx: 0.002, dy: 0,             alpha: 1 },
        armR:  { rot:-(3 + sin1(t)*3)*DEG,dx:-0.002, dy: 0,             alpha: 1 },
        hips:  { rot: sway*-0.1*DEG,      dx: 0,     dy: breath * 0.4,  alpha: 1 },
        legL:  { rot: sin1(t)*1.5*DEG,    dx: 0,     dy: breath * 0.5,  alpha: 1 },
        legR:  { rot:-sin1(t)*1.5*DEG,    dx: 0,     dy: breath * 0.5,  alpha: 1 },
        globalY: sin1(t) * 0.006,
        globalRot: 0, alpha: 1, effect: null,
      };
    }

    // ── WALK ──────────────────────────────────────────────────────────────────
    case 'walk': {
      const bob    = -abs1(t) * 0.018;
      const legSwg = sin1(t) * 30;
      const armSwg = -sin1(t) * 24;
      const hipRot = sin1(t) * 5;
      const lean   = 4;
      return {
        order: ['legL','legR','hips','torso','armL','armR','head','hair'],
        hair:  { rot: sin1(t)*5*DEG,      dx: 0, dy: bob*0.4,  alpha: 1 },
        head:  { rot: lean*0.4*DEG,       dx: 0, dy: bob*0.5,  alpha: 1 },
        torso: { rot: lean*DEG,           dx: 0, dy: bob*0.4,  alpha: 1 },
        armL:  { rot: armSwg*DEG,         dx: 0, dy: bob*0.3,  alpha: 1 },
        armR:  { rot:-armSwg*DEG,         dx: 0, dy: bob*0.3,  alpha: 1 },
        hips:  { rot: hipRot*DEG,         dx: 0, dy: bob*0.3,  alpha: 1 },
        legL:  { rot: legSwg*DEG,         dx: 0, dy: 0,        alpha: 1 },
        legR:  { rot:-legSwg*DEG,         dx: 0, dy: 0,        alpha: 1 },
        globalY: bob, globalRot: 0, alpha: 1, effect: null,
      };
    }

    // ── RUN ───────────────────────────────────────────────────────────────────
    case 'run': {
      const bob    = -abs1(t) * 0.036;
      const legSwg = sin1(t) * 50;
      const armSwg = -sin1(t) * 44;
      const lean   = 11;
      const hipRot = sin1(t) * 9;
      return {
        order: ['legL','legR','hips','torso','armL','armR','head','hair'],
        hair:  { rot: sin1(t)*14*DEG,     dx: lean*0.001, dy: bob*0.6, alpha: 1 },
        head:  { rot: lean*0.5*DEG,       dx: 0,          dy: bob*0.6, alpha: 1 },
        torso: { rot: lean*DEG,           dx: 0,          dy: bob*0.5, alpha: 1 },
        armL:  { rot: armSwg*DEG,         dx: 0,          dy: bob*0.4, alpha: 1 },
        armR:  { rot:-armSwg*DEG,         dx: 0,          dy: bob*0.4, alpha: 1 },
        hips:  { rot: hipRot*DEG,         dx: 0,          dy: bob*0.3, alpha: 1 },
        legL:  { rot: legSwg*DEG,         dx: 0,          dy: 0,       alpha: 1 },
        legR:  { rot:-legSwg*DEG,         dx: 0,          dy: 0,       alpha: 1 },
        globalY: bob, globalRot: 0, alpha: 1, effect: null,
      };
    }

    // ── JUMP ──────────────────────────────────────────────────────────────────
    case 'jump': {
      const arc   = -Math.sin(t * Math.PI);
      const tuck  = arc * 30;
      const armUp = arc * -55;
      const lean  = arc * 8;
      return {
        order: ['legL','legR','hips','torso','armL','armR','head','hair'],
        hair:  { rot: lean*-0.6*DEG,   dx: 0,     dy: arc*-0.04, alpha: 1 },
        head:  { rot: lean*-0.3*DEG,   dx: 0,     dy: arc*-0.02, alpha: 1 },
        torso: { rot: lean*DEG,        dx: 0,     dy: 0,          alpha: 1 },
        armL:  { rot: armUp*DEG,       dx:-0.01,  dy: arc*-0.01,  alpha: 1 },
        armR:  { rot:-armUp*DEG,       dx: 0.01,  dy: arc*-0.01,  alpha: 1 },
        hips:  { rot: 0,               dx: 0,     dy: 0,          alpha: 1 },
        legL:  { rot: tuck*DEG,        dx: 0.012, dy: 0,          alpha: 1 },
        legR:  { rot:-tuck*DEG,        dx:-0.012, dy: 0,          alpha: 1 },
        globalY: arc*0.13, globalRot: 0, alpha: 1, effect: null,
      };
    }

    // ── ATTACK ────────────────────────────────────────────────────────────────
    case 'attack': {
      const slashT = t < 0.3 ? -(t/0.3) : (t-0.3)/0.7;
      const armRot = slashT * 115;
      const tw     = slashT * 18;
      const bob    = -Math.abs(slashT) * 0.012;
      return {
        order: ['legR','legL','hips','armL','torso','armR','head','hair'],
        hair:  { rot: tw*0.5*DEG,        dx: 0, dy: 0,   alpha: 1 },
        head:  { rot: tw*0.3*DEG,        dx: 0, dy: 0,   alpha: 1 },
        torso: { rot: tw*DEG,            dx: 0, dy: bob,  alpha: 1 },
        armL:  { rot:-20*DEG,            dx: 0, dy: 0,   alpha: 1 },
        armR:  { rot:(armRot-55)*DEG,    dx: 0, dy: 0,   alpha: 1 },
        hips:  { rot: tw*0.4*DEG,        dx: 0, dy: bob*0.5, alpha: 1 },
        legL:  { rot:-10*DEG,            dx: 0, dy: 0,   alpha: 1 },
        legR:  { rot: 16*DEG,            dx: 0, dy: 0,   alpha: 1 },
        globalY: bob*0.5, globalRot: 0, alpha: 1, effect: null,
      };
    }

    // ── HURT ──────────────────────────────────────────────────────────────────
    case 'hurt': {
      const recoil = Math.sin(t * Math.PI) * -20;
      const flash  = t < 0.25 ? 1 : clamp(1-(t-0.25)*5, 0, 1);
      const shake  = sin2(t) * 3;
      return {
        order: ['legL','legR','hips','torso','armL','armR','head','hair'],
        hair:  { rot:(recoil*-0.6+shake)*DEG, dx: 0, dy: 0, alpha: 1 },
        head:  { rot: recoil*-0.4*DEG,        dx: 0, dy: 0, alpha: 1 },
        torso: { rot: recoil*DEG,             dx: 0, dy: 0, alpha: 1 },
        armL:  { rot:(recoil+22)*DEG,         dx: 0, dy: 0, alpha: 1 },
        armR:  { rot:(recoil-22)*DEG,         dx: 0, dy: 0, alpha: 1 },
        hips:  { rot: recoil*0.4*DEG,         dx: 0, dy: 0, alpha: 1 },
        legL:  { rot: recoil*0.3*DEG,         dx: 0, dy: 0, alpha: 1 },
        legR:  { rot: recoil*0.3*DEG,         dx: 0, dy: 0, alpha: 1 },
        globalY: -Math.sin(t*Math.PI)*0.02,
        globalRot: shake*0.3*DEG,
        alpha: 0.45 + 0.55*(1-flash*0.45),
        effect: { type: 'hurt', flash },
      };
    }

    // ── DIE ───────────────────────────────────────────────────────────────────
    case 'die': {
      const fall = clamp(ease(t, 2.5), 0, 1);
      const fade = t > 0.65 ? clamp(1-(t-0.65)/0.35, 0, 1) : 1;
      return {
        order: ['hair','head','armL','armR','torso','hips','legL','legR'],
        hair:  { rot: fall*82*DEG,   dx: 0, dy: fall*0.02, alpha: fade },
        head:  { rot: fall*72*DEG,   dx: 0, dy: fall*0.01, alpha: fade },
        torso: { rot: fall*76*DEG,   dx: 0, dy: fall*0.01, alpha: fade },
        armL:  { rot: fall*105*DEG,  dx: 0, dy: 0,          alpha: fade },
        armR:  { rot: fall*-42*DEG,  dx: 0, dy: 0,          alpha: fade },
        hips:  { rot: fall*80*DEG,   dx: 0, dy: 0,          alpha: fade },
        legL:  { rot: fall*62*DEG,   dx: 0, dy: 0,          alpha: fade },
        legR:  { rot: fall*52*DEG,   dx: 0, dy: 0,          alpha: fade },
        globalY: fall*0.07,
        globalRot: fall*86*DEG,
        alpha: fade, effect: null,
      };
    }

    // ── CROUCH ────────────────────────────────────────────────────────────────
    case 'crouch': {
      const depth  = clamp(ease(clamp(t*2,0,1), 2), 0, 1);
      const spread = depth * 24;
      const squat  = depth * 0.065;
      return {
        order: ['legL','legR','hips','torso','armL','armR','head','hair'],
        hair:  { rot: 0,              dx: 0,     dy: squat,       alpha: 1 },
        head:  { rot: 11*depth*DEG,   dx: 0,     dy: squat*0.8,   alpha: 1 },
        torso: { rot: 9*depth*DEG,    dx: 0,     dy: squat*0.6,   alpha: 1 },
        armL:  { rot: 32*depth*DEG,   dx: 0,     dy: squat*0.4,   alpha: 1 },
        armR:  { rot:-32*depth*DEG,   dx: 0,     dy: squat*0.4,   alpha: 1 },
        hips:  { rot: 0,              dx: 0,     dy: squat*0.2,   alpha: 1 },
        legL:  { rot: spread*DEG,     dx: 0.012, dy: 0,           alpha: 1 },
        legR:  { rot:-spread*DEG,     dx:-0.012, dy: 0,           alpha: 1 },
        globalY: squat*0.85, globalRot: 0, alpha: 1, effect: null,
      };
    }

    // ── CAST ──────────────────────────────────────────────────────────────────
    case 'cast': {
      const raise  = Math.abs(cos1(t)) * -65;
      const sway   = sin1(t) * 6;
      const ripple = sin2(t) * 3;
      const glow   = (1 + sin2(t)) * 0.5;
      return {
        order: ['legL','legR','hips','torso','armR','head','armL','hair'],
        hair:  { rot:(sway*1.5+ripple)*DEG, dx: 0, dy: 0,  alpha: 1 },
        head:  { rot: sway*0.4*DEG,         dx: 0, dy: -0.005*Math.abs(cos1(t)), alpha: 1 },
        torso: { rot: sway*0.2*DEG,         dx: 0, dy: 0,  alpha: 1 },
        armL:  { rot:(raise-10)*DEG,        dx: 0, dy: 0,  alpha: 1 },
        armR:  { rot: sway*DEG,             dx: 0, dy: 0,  alpha: 1 },
        hips:  { rot: sway*-0.1*DEG,        dx: 0, dy: 0,  alpha: 1 },
        legL:  { rot: sway*0.5*DEG,         dx: 0, dy: 0,  alpha: 1 },
        legR:  { rot:-sway*0.5*DEG,         dx: 0, dy: 0,  alpha: 1 },
        globalY: 0, globalRot: 0, alpha: 1,
        effect: { type: 'cast', glow },
      };
    }

    default: return getPoseTransforms('idle', t);
  }
}

// ── Main render ───────────────────────────────────────────────────────────────
/**
 * Render one animation frame onto ctx.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} bodyData — result from detectBodyParts()
 * @param {string} pose
 * @param {number} t   — phase 0..1
 * @param {'left'|'right'} dir
 */
export function renderFrame(ctx, bodyData, pose, t, dir) {
  const { parts, bb } = bodyData;
  const DW = ctx.canvas.width;
  const DH = ctx.canvas.height;

  ctx.clearRect(0, 0, DW, DH);

  const T     = getPoseTransforms(pose, t);
  const scale = Math.min((DW * 0.75) / bb.w, (DH * 0.80) / bb.h);

  // Centre character bounding box
  const baseX = (DW - bb.w * scale) / 2;
  const baseY = (DH - bb.h * scale) / 2 + T.globalY * DH;

  ctx.save();

  // Direction flip
  if (dir === 'left') {
    ctx.translate(DW, 0);
    ctx.scale(-1, 1);
  }

  // Global rotation for die
  if (T.globalRot) {
    ctx.translate(DW / 2, DH * 0.7);
    ctx.rotate(T.globalRot);
    ctx.translate(-DW / 2, -DH * 0.7);
  }

  const order = T.order || Object.keys(parts);

  for (const pid of order) {
    const part = parts[pid];
    const xf   = T[pid];
    if (!part || !xf) continue;

    const { canvas, anchorX, anchorY, originX, originY } = part;

    // World-space position of the pivot point
    const pivotX = baseX + (originX - bb.x + anchorX) * scale;
    const pivotY = baseY + (originY - bb.y + anchorY) * scale;

    ctx.save();
    ctx.globalAlpha = clamp((T.alpha ?? 1) * (xf.alpha ?? 1), 0, 1);

    ctx.translate(
      pivotX + (xf.dx || 0) * DH,
      pivotY + (xf.dy || 0) * DH
    );
    ctx.rotate(xf.rot || 0);

    // Draw part so its anchor aligns with (0,0)
    ctx.drawImage(
      canvas,
      -anchorX  * scale,
      -anchorY  * scale,
      canvas.width  * scale,
      canvas.height * scale
    );

    ctx.restore();
  }

  // Effects overlay
  if (T.effect) {
    if (T.effect.type === 'cast') drawCastGlow(ctx, DW, DH, T.effect.glow, dir);
    if (T.effect.type === 'hurt') drawHurtFlash(ctx, DW, DH, T.effect.flash);
  }

  ctx.restore();
}

// ── Effects ───────────────────────────────────────────────────────────────────
function drawCastGlow(ctx, DW, DH, glow, dir) {
  const ex = dir === 'left' ? DW * 0.35 : DW * 0.65;
  const ey = DH * 0.35;
  const r  = 22 + glow * 28;
  const g  = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
  g.addColorStop(0,   `rgba(200,140,255,${0.7 * glow})`);
  g.addColorStop(0.4, `rgba(130,80,255,${0.35 * glow})`);
  g.addColorStop(1,   'rgba(80,40,200,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHurtFlash(ctx, DW, DH, flash) {
  if (!flash) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(255,50,50,${flash * 0.5})`;
  ctx.fillRect(0, 0, DW, DH);
  ctx.restore();
}
