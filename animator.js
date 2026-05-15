// animator.js — Puppet/paper-doll renderer
// Each body part is drawn with ctx.save / translate-to-pivot / rotate / drawImage / ctx.restore
// No warp, no backward sampling, no ghost silhouettes.
// The character's actual pixel art stays intact — only joint rotations move parts.

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
const PI2   = Math.PI * 2;
const DEG   = Math.PI / 180;
const sin1  = t => Math.sin(t * PI2);
const cos1  = t => Math.cos(t * PI2);
const sin2  = t => Math.sin(t * PI2 * 2);
const abs1  = t => Math.abs(sin1(t));
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const clamp01 = v => v<0?0:v>1?1:v;
const ease  = (t,p=2) => t<.5?Math.pow(t*2,p)/2:1-Math.pow((1-t)*2,p)/2;
const lerp  = (a,b,t) => a+(b-a)*t;

// ── Pose definitions ──────────────────────────────────────────────────────────
// Returns per-part transform objects.
// rot   = rotation in radians (clockwise positive) around the part's anchor
// dx/dy = offset in SCALED pixels applied AFTER rotation (shake, stride, etc.)
// Each value is a fraction of character height H unless noted as DEG.
//
// Draw order matters: back limbs drawn first, then torso, then front limbs on top.

export function getPoseTransforms(pose, t, H) {
  // H = character pixel height in destination canvas after scaling
  switch (pose) {

    // ── IDLE ─────────────────────────────────────────────────────────────────
    // Subtle breathing bob + gentle arm/hair sway
    case 'idle': {
      const bob   = Math.sin(t * PI2) * H * 0.008;
      const sway  = Math.sin(t * PI2) * 1.5 * DEG;
      const armSw = Math.sin(t * PI2) * 3 * DEG;
      return {
        order: ['legA','legB','hips','torso','armA','armB','head','hair'],
        hair:  { rot: sway * 2,   dx: 0, dy: -bob },
        head:  { rot: sway * 0.4, dx: 0, dy: -bob },
        torso: { rot: sway * 0.2, dx: 0, dy: -bob * 0.6 },
        armA:  { rot: armSw + 5 * DEG,  dx: 0, dy: -bob * 0.5 },
        armB:  { rot: -armSw - 5 * DEG, dx: 0, dy: -bob * 0.5 },
        hips:  { rot: -sway * 0.1, dx: 0, dy: bob * 0.3 },
        legA:  { rot: sway,  dx: 0, dy: bob * 0.2 },
        legB:  { rot: -sway, dx: 0, dy: bob * 0.2 },
        globalDY: bob * 0.3,
      };
    }

    // ── WALK ─────────────────────────────────────────────────────────────────
    // Classic alternating foot-plant gait.
    // legA = back leg, legB = front leg (for right-facing sprite)
    // At t=0: front leg forward, back leg planted
    // At t=0.5: front leg planted, back leg swings through
    case 'walk': {
      const legFwd  =  Math.sin(t * PI2) * 40 * DEG;  // front leg angle
      const legBck  = -Math.sin(t * PI2) * 40 * DEG;  // back leg angle (opposite)
      const armFwd  = -Math.sin(t * PI2) * 32 * DEG;  // arms counter-swing to legs
      const armBck  =  Math.sin(t * PI2) * 32 * DEG;
      const bob     = abs1(t) * H * -0.030;            // body rises at mid-stance
      const hipRock = Math.sin(t * PI2) * 5 * DEG;    // hip sway
      const lean    = 4 * DEG;
      const hair    = Math.sin(t * PI2) * 10 * DEG;
      // Foot lift: swing leg rises in first half of its arc
      const liftA   = Math.max(0,  Math.sin(t * PI2)) * H * -0.06;
      const liftB   = Math.max(0, -Math.sin(t * PI2)) * H * -0.06;
      // Stride: foot moves forward on swing, back on plant
      const strideA =  Math.sin(t * PI2) * H * 0.05;
      const strideB = -Math.sin(t * PI2) * H * 0.05;
      return {
        order: ['legA','legB','hips','torso','armA','armB','head','hair'],
        hair:  { rot: lean + hair,    dx: 0,       dy: bob * 0.4 },
        head:  { rot: lean * 0.5,     dx: 0,       dy: bob * 0.5 },
        torso: { rot: lean,           dx: 0,       dy: bob * 0.5 },
        armA:  { rot: armFwd,         dx: 0,       dy: bob * 0.3 },
        armB:  { rot: armBck,         dx: 0,       dy: bob * 0.3 },
        hips:  { rot: hipRock,        dx: 0,       dy: bob * 0.3 },
        legA:  { rot: legFwd,         dx: strideA, dy: liftA },
        legB:  { rot: legBck,         dx: strideB, dy: liftB },
        globalDY: bob,
      };
    }

    // ── RUN ──────────────────────────────────────────────────────────────────
    case 'run': {
      const legFwd  =  Math.sin(t * PI2) * 58 * DEG;
      const legBck  = -Math.sin(t * PI2) * 58 * DEG;
      const armFwd  = -Math.sin(t * PI2) * 52 * DEG;
      const armBck  =  Math.sin(t * PI2) * 52 * DEG;
      const bob     = abs1(t) * H * -0.045;
      const hipRock = Math.sin(t * PI2) * 8 * DEG;
      const lean    = 12 * DEG;
      const hair    = Math.sin(t * PI2) * 16 * DEG + lean;
      const liftA   = Math.max(0,  Math.sin(t * PI2)) * H * -0.10;
      const liftB   = Math.max(0, -Math.sin(t * PI2)) * H * -0.10;
      const strideA =  Math.sin(t * PI2) * H * 0.07;
      const strideB = -Math.sin(t * PI2) * H * 0.07;
      return {
        order: ['legA','legB','hips','torso','armA','armB','head','hair'],
        hair:  { rot: hair,        dx: 0,       dy: bob * 0.5 },
        head:  { rot: lean * 0.5,  dx: 0,       dy: bob * 0.6 },
        torso: { rot: lean,        dx: 0,       dy: bob * 0.5 },
        armA:  { rot: armFwd,      dx: 0,       dy: bob * 0.4 },
        armB:  { rot: armBck,      dx: 0,       dy: bob * 0.4 },
        hips:  { rot: hipRock,     dx: 0,       dy: bob * 0.3 },
        legA:  { rot: legFwd,      dx: strideA, dy: liftA },
        legB:  { rot: legBck,      dx: strideB, dy: liftB },
        globalDY: bob,
      };
    }

    // ── JUMP ─────────────────────────────────────────────────────────────────
    case 'jump': {
      const arc    = -Math.sin(t * Math.PI);    // 0 → peak → 0
      const tuck   =  arc * 35 * DEG;
      const armUp  = -arc * 55 * DEG;
      const lean   =  arc * 8  * DEG;
      const rise   =  arc * H  * 0.18;
      return {
        order: ['legA','legB','hips','torso','armA','armB','head','hair'],
        hair:  { rot: lean * -0.6,  dx: 0,  dy: -arc * H * 0.04 },
        head:  { rot: lean * -0.3,  dx: 0,  dy: 0 },
        torso: { rot: lean,         dx: 0,  dy: 0 },
        armA:  { rot: armUp - 10 * DEG, dx: -H * 0.01, dy: 0 },
        armB:  { rot: -armUp + 10 * DEG, dx: H * 0.01, dy: 0 },
        hips:  { rot: 0,            dx: 0,  dy: 0 },
        legA:  { rot: tuck + 10 * DEG,  dx:  H * 0.01, dy: 0 },
        legB:  { rot: -tuck - 10 * DEG, dx: -H * 0.01, dy: 0 },
        globalDY: rise,
      };
    }

    // ── ATTACK ───────────────────────────────────────────────────────────────
    // Wind-up then fast sword slash
    case 'attack': {
      const sl     = t < 0.3 ? -(t / 0.3) : (t - 0.3) / 0.7;   // -1 to +1
      const armRot = (sl * 110 - 45) * DEG;
      const twist  = sl * 18 * DEG;
      const bob    = -Math.abs(sl) * H * 0.01;
      return {
        order: ['legA','legB','hips','armA','torso','armB','head','hair'],
        hair:  { rot: twist * 0.5,  dx: 0, dy: bob * 0.5 },
        head:  { rot: twist * 0.3,  dx: 0, dy: 0 },
        torso: { rot: twist,        dx: 0, dy: bob },
        armA:  { rot: -18 * DEG,    dx: 0, dy: 0 },
        armB:  { rot: armRot,       dx: 0, dy: 0 },
        hips:  { rot: twist * 0.4,  dx: 0, dy: bob * 0.5 },
        legA:  { rot: -8 * DEG,     dx: 0, dy: 0 },
        legB:  { rot: 14 * DEG,     dx: 0, dy: 0 },
        globalDY: bob,
      };
    }

    // ── HURT ─────────────────────────────────────────────────────────────────
    case 'hurt': {
      const recoil = Math.sin(t * Math.PI) * -22 * DEG;
      const shake  = Math.sin(t * PI2 * 4) * 3 * DEG;
      const rise   = Math.sin(t * Math.PI) * H * -0.025;
      return {
        order: ['legA','legB','hips','torso','armA','armB','head','hair'],
        hair:  { rot: recoil * -0.7 + shake, dx: 0, dy: rise * 0.4 },
        head:  { rot: recoil * -0.4,         dx: 0, dy: rise * 0.3 },
        torso: { rot: recoil,                dx: 0, dy: rise },
        armA:  { rot: recoil + 25 * DEG,     dx: 0, dy: 0 },
        armB:  { rot: recoil - 25 * DEG,     dx: 0, dy: 0 },
        hips:  { rot: recoil * 0.4,          dx: 0, dy: rise * 0.4 },
        legA:  { rot: recoil * 0.3,          dx: 0, dy: 0 },
        legB:  { rot: recoil * 0.3,          dx: 0, dy: 0 },
        globalDY: rise,
        alpha: 0.45 + 0.55 * clamp01(1 - Math.sin(t * PI2 * 6) * 0.5),
      };
    }

    // ── DIE ──────────────────────────────────────────────────────────────────
    case 'die': {
      const f    = clamp01(ease(t, 2.5));
      const lean = f * 88 * DEG;
      const drop = f * H * 0.08;
      const fade = t > 0.65 ? clamp01(1 - (t - 0.65) / 0.35) : 1;
      return {
        order: ['hair','head','armA','armB','torso','hips','legA','legB'],
        hair:  { rot: lean * 0.9,  dx: 0, dy: drop },
        head:  { rot: lean * 0.8,  dx: 0, dy: drop * 0.8 },
        torso: { rot: lean * 0.85, dx: 0, dy: drop * 0.5 },
        armA:  { rot: lean * 1.1,  dx: 0, dy: drop * 0.4 },
        armB:  { rot: -lean * 0.4, dx: 0, dy: drop * 0.4 },
        hips:  { rot: lean * 0.8,  dx: 0, dy: drop * 0.2 },
        legA:  { rot: lean * 0.6,  dx: 0, dy: 0 },
        legB:  { rot: lean * 0.5,  dx: 0, dy: 0 },
        globalDY: drop * 0.5,
        alpha: fade,
      };
    }

    // ── CROUCH ───────────────────────────────────────────────────────────────
    case 'crouch': {
      const d    = clamp01(ease(clamp01(t * 2), 2));
      const sp   = d * 26 * DEG;
      const squat= d * H * 0.07;
      const la   = d * 9 * DEG;
      return {
        order: ['legA','legB','hips','torso','armA','armB','head','hair'],
        hair:  { rot: 0,          dx: 0,            dy: squat },
        head:  { rot: la,         dx: 0,            dy: squat * 0.8 },
        torso: { rot: la,         dx: 0,            dy: squat * 0.6 },
        armA:  { rot: 30 * DEG,   dx: 0,            dy: squat * 0.4 },
        armB:  { rot: -30 * DEG,  dx: 0,            dy: squat * 0.4 },
        hips:  { rot: 0,          dx: 0,            dy: squat * 0.2 },
        legA:  { rot: sp,         dx:  H * 0.01,    dy: 0 },
        legB:  { rot: -sp,        dx: -H * 0.01,    dy: 0 },
        globalDY: squat * 0.8,
      };
    }

    // ── CAST ─────────────────────────────────────────────────────────────────
    case 'cast': {
      const raise  = Math.abs(cos1(t)) * -68 * DEG;
      const sway   = sin1(t) * 6 * DEG;
      const ripple = sin2(t) * 3 * DEG;
      return {
        order: ['legA','legB','hips','torso','armA','head','armB','hair'],
        hair:  { rot: sway * 1.6 + ripple, dx: 0, dy: 0 },
        head:  { rot: sway * 0.4,          dx: 0, dy: Math.abs(cos1(t)) * H * -0.005 },
        torso: { rot: sway * 0.2,          dx: 0, dy: 0 },
        armA:  { rot: raise - 12 * DEG,    dx: 0, dy: 0 },
        armB:  { rot: sway,                dx: 0, dy: 0 },
        hips:  { rot: -sway * 0.1,         dx: 0, dy: 0 },
        legA:  { rot: sway * 0.5,          dx: 0, dy: 0 },
        legB:  { rot: -sway * 0.5,         dx: 0, dy: 0 },
        globalDY: 0,
        effect: 'cast',
      };
    }

    default: return getPoseTransforms('idle', t, H);
  }
}

// ── Main render function ──────────────────────────────────────────────────────
/**
 * Draw one puppet frame onto ctx.
 * @param {CanvasRenderingContext2D} ctx  — destination context
 * @param {object} puppet  — result from detectPuppet()
 * @param {string} pose
 * @param {number} t       — animation phase 0..1
 * @param {'left'|'right'} dir
 */
export function renderFrame(ctx, puppet, pose, t, dir) {
  const { parts, joints, bb, groundY } = puppet;
  const DW = ctx.canvas.width;
  const DH = ctx.canvas.height;

  ctx.clearRect(0, 0, DW, DH);

  // Scale to fit 80% of canvas, pin feet to 92% of canvas height
  const scale     = Math.min((DW * 0.80) / bb.w, (DH * 0.82) / bb.h);
  const groundDY  = DH * 0.92;    // where ground contact sits in canvas
  const H         = bb.h * scale; // character height in dest pixels

  const T = getPoseTransforms(pose, t, H);
  const gAlpha = T.alpha ?? 1;
  const gDY    = (T.globalDY ?? 0);

  // Origin: map source (bb.x, groundY) → dest (centre-x, groundDY)
  const originX = DW / 2 - (joints.shoulder.x - bb.x) * scale;  // torso-centred
  const originY = groundDY - (groundY - bb.y) * scale + gDY;

  ctx.save();

  // Direction flip
  if (dir === 'left') {
    ctx.translate(DW, 0);
    ctx.scale(-1, 1);
  }

  ctx.globalAlpha = gAlpha;

  const order = T.order || ['legA','legB','hips','torso','armA','armB','head','hair'];

  for (const partId of order) {
    const part = parts[partId];
    const xf   = T[partId];
    if (!part || !xf || !part.canvas) continue;

    const { canvas, anchorX, anchorY, srcX, srcY } = part;

    // World position of this part's anchor in dest canvas
    const wx = originX + (srcX + anchorX - bb.x) * scale + (xf.dx || 0);
    const wy = originY + (srcY + anchorY - bb.y) * scale + (xf.dy || 0);

    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(xf.rot || 0);

    // Draw part so its anchor aligns with (0,0)
    ctx.drawImage(
      canvas,
      -anchorX * scale,
      -anchorY * scale,
      canvas.width  * scale,
      canvas.height * scale
    );

    ctx.restore();
  }

  ctx.restore();

  // Effects
  if (T.effect === 'cast') _castGlow(ctx, DW, DH, t);
  if (pose === 'hurt')     _hurtFlash(ctx, DW, DH, t);
}

// ── Effects ───────────────────────────────────────────────────────────────────
function _castGlow(ctx, DW, DH, t) {
  const g  = (1 + Math.sin(t * Math.PI * 4)) * 0.5;
  const ex = DW * 0.62, ey = DH * 0.36, r = 18 + g * 28;
  const gr = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
  gr.addColorStop(0,   `rgba(200,140,255,${0.7 * g})`);
  gr.addColorStop(0.5, `rgba(130,80,255,${0.28 * g})`);
  gr.addColorStop(1,   'rgba(80,40,200,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function _hurtFlash(ctx, DW, DH, t) {
  const f = t < 0.2 ? 1 : Math.max(0, 1 - (t - 0.2) * 5);
  if (f < 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(255,50,50,${f * 0.48})`;
  ctx.fillRect(0, 0, DW, DH);
  ctx.restore();
}
