// animator.js — Skeletal-region warp animation engine

// ── Pose catalogue ───────────────────────────────────────────────────────────

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

// Region boundaries as [start, end] fractions of bounding-box height
const RB = {
  hair:  [0.00, 0.12],
  head:  [0.12, 0.26],
  torso: [0.26, 0.56],
  hips:  [0.56, 0.68],
  legs:  [0.68, 1.00],
};

// ── Body detection ───────────────────────────────────────────────────────────

/**
 * Scan the character canvas (already bg-removed) and return structural info.
 * Returns null if no visible pixels found.
 */
export function detectBodyInfo(charCanvas) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, W, H).data;

  let minX = W, maxX = 0, minY = H, maxY = 0;
  let alphaX = 0, alphaTotal = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = d[(y*W+x)*4+3];
      if (a > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        alphaX     += x * a;
        alphaTotal += a;
      }
    }
  }

  if (minX > maxX || minY > maxY) return null;

  const bb = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  const centerX = alphaTotal > 0 ? alphaX / alphaTotal : (minX + maxX) / 2;

  return { bb, centerX, regionBounds: RB };
}

// ── Frame renderer ───────────────────────────────────────────────────────────

/**
 * Render one animation frame onto ctx.
 * @param {CanvasRenderingContext2D} ctx   - destination
 * @param {HTMLCanvasElement}        src   - bg-removed character
 * @param {object}                   info  - result of detectBodyInfo()
 * @param {string}                   pose  - one of POSES[*].id
 * @param {number}                   t     - phase 0..1 (looping)
 * @param {'left'|'right'}           dir   - facing direction
 */
export function renderFrame(ctx, src, info, pose, t, dir) {
  const { bb, centerX, regionBounds: rb } = info;
  const T = getPoseTransforms(pose, t);

  const DW = ctx.canvas.width;
  const DH = ctx.canvas.height;

  const scale = Math.min((DW * 0.70) / bb.w, (DH * 0.70) / bb.h, 3);
  const baseX = (DW - bb.w * scale) / 2;
  const baseY = (DH - bb.h * scale) / 2 + T.globalY * scale;

  ctx.clearRect(0, 0, DW, DH);
  ctx.save();

  // Horizontal flip for left-facing
  if (dir === 'left') {
    ctx.translate(DW, 0);
    ctx.scale(-1, 1);
  }

  const alpha = T.alpha ?? 1;
  const cxD   = baseX + (centerX - bb.x) * scale; // dest x of character centre

  // Draw each named region with its own left/right horizontal offsets
  const regions = [
    { rb0: rb.hair[0],  rb1: rb.hair[1],  xL: T.hairXOff,  xR: T.hairXOff,  yOff: T.headYOff  },
    { rb0: rb.head[0],  rb1: rb.head[1],  xL: T.headXOff,  xR: T.headXOff,  yOff: T.headYOff  },
    { rb0: rb.head[1],  rb1: rb.torso[1], xL: T.torsoXL,   xR: T.torsoXR,   yOff: T.bodyYOff  },
    { rb0: rb.torso[1], rb1: rb.hips[1],  xL: T.hipsXL,    xR: T.hipsXR,    yOff: T.bodyYOff  },
    { rb0: rb.hips[1],  rb1: 1.00,        xL: T.legsXL,    xR: T.legsXR,    yOff: T.legsYOff  },
  ];

  for (const { rb0, rb1, xL, xR, yOff } of regions) {
    const srcY = bb.y + rb0 * bb.h | 0;
    const srcH = Math.max(1, ((rb1 - rb0) * bb.h) | 0);
    const dy   = baseY + rb0 * bb.h * scale + yOff * scale;
    const dh   = srcH * scale;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Left half (clipped to left of centreline)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, dy - 1, cxD, dh + 2);
    ctx.clip();
    ctx.drawImage(src, bb.x, srcY, bb.w, srcH,
      baseX + xL * scale, dy, bb.w * scale, dh);
    ctx.restore();

    // Right half (clipped to right of centreline)
    ctx.save();
    ctx.beginPath();
    ctx.rect(cxD, dy - 1, DW - cxD, dh + 2);
    ctx.clip();
    ctx.drawImage(src, bb.x, srcY, bb.w, srcH,
      baseX + xR * scale, dy, bb.w * scale, dh);
    ctx.restore();

    ctx.restore();
  }

  // ── Special effects overlay ───────────────────────────────────────────────
  if (pose === 'cast') drawCastGlow(ctx, DW, DH, t, dir);
  if (pose === 'hurt') drawHurtFlash(ctx, DW, DH, T.flashAlpha ?? 0);

  ctx.restore();
}

// ── Pose transform library ───────────────────────────────────────────────────
// All offsets are in source-image pixels (scaled at render time).
// Positive xL/xR = move that half rightward.

function getPoseTransforms(pose, t) {
  const s1 = Math.sin(t * Math.PI * 2);   // −1..+1 one cycle
  const c1 = Math.cos(t * Math.PI * 2);
  const s2 = Math.sin(t * Math.PI * 4);   // two cycles
  const as1 = Math.abs(s1);

  switch (pose) {

    case 'idle': {
      const breath = s1 * 1.2;
      const sway   = s1 * 0.8;
      return {
        globalY: breath, alpha: 1,
        hairXOff: sway * 2,
        headXOff: sway,
        torsoXL: 0,       torsoXR: 0,
        hipsXL:  0,        hipsXR: 0,
        legsXL:  0,        legsXR: 0,
        headYOff: breath,  bodyYOff: 0, legsYOff: 0,
      };
    }

    case 'walk': {
      const bob    = -as1 * 3.5;
      const arm    = s1 * 15;
      const leg    = -s1 * 17;
      const lean   = s1 * 0.6;
      return {
        globalY: as1 * 1.5, alpha: 1,
        hairXOff: s1 * 2.5 + lean,
        headXOff: lean,
        torsoXL:  -arm,     torsoXR: arm,
        hipsXL:   arm * 0.12, hipsXR: -arm * 0.12,
        legsXL:   leg,      legsXR: -leg,
        headYOff: bob,      bodyYOff: bob * 0.4, legsYOff: 0,
      };
    }

    case 'run': {
      const bob  = -as1 * 6;
      const arm  = s1 * 24;
      const leg  = -s1 * 28;
      const lean = 4;
      return {
        globalY: as1 * 3, alpha: 1,
        hairXOff: s1 * 6 + lean,
        headXOff: lean,
        torsoXL:  -arm,       torsoXR: arm,
        hipsXL:   arm * 0.18, hipsXR: -arm * 0.18,
        legsXL:   leg,        legsXR: -leg,
        headYOff: bob,        bodyYOff: bob * 0.5, legsYOff: 0,
      };
    }

    case 'jump': {
      const arc    = -Math.sin(t * Math.PI) * 42; // rise then fall
      const tuck   = Math.sin(t * Math.PI) * 12;  // legs tuck at peak
      const armUp  = -Math.sin(t * Math.PI) * 14;
      return {
        globalY: arc, alpha: 1,
        hairXOff: -arc * 0.08,
        headXOff: 0,
        torsoXL:  armUp,   torsoXR: armUp,
        hipsXL:   0,        hipsXR: 0,
        legsXL:   tuck,     legsXR: -tuck,
        headYOff: 0,        bodyYOff: 0, legsYOff: tuck,
      };
    }

    case 'attack': {
      // Sword-swing: right arm/half thrusts forward, body twists
      const fwd    = Math.max(0, s1) * Math.max(0, s1);
      const recoil = Math.max(0, -s1) * 0.4;
      return {
        globalY: 0, alpha: 1,
        hairXOff: fwd * 5,
        headXOff: fwd * 2,
        torsoXL:  -fwd * 10,   torsoXR: fwd * 30,
        hipsXL:   -recoil * 6, hipsXR: recoil * 6,
        legsXL:   -recoil * 9, legsXR: recoil * 9,
        headYOff: 0,           bodyYOff: 0, legsYOff: 0,
      };
    }

    case 'hurt': {
      const recoil    = Math.sin(t * Math.PI) * -18;
      const flashA    = t < 0.3 ? 1 : 0.55 + Math.sin(t * Math.PI * 12) * 0.45;
      return {
        globalY: -Math.sin(t * Math.PI) * 6, alpha: flashA,
        flashAlpha: 1 - flashA,
        hairXOff: recoil * 0.5,
        headXOff: recoil * 0.35,
        torsoXL:  recoil,    torsoXR: recoil,
        hipsXL:   recoil * 0.55, hipsXR: recoil * 0.55,
        legsXL:   recoil * 0.2,  legsXR: recoil * 0.2,
        headYOff: 0,         bodyYOff: 0, legsYOff: 0,
      };
    }

    case 'die': {
      const fall  = clamp01(t * 1.4);
      const lean  = fall * 22;
      const grav  = fall * fall * 38;
      const fade  = t > 0.75 ? 1 - (t - 0.75) * 4 : 1;
      return {
        globalY: grav, alpha: fade,
        hairXOff: lean * 0.7,
        headXOff: lean * 0.5,
        torsoXL:  lean,       torsoXR: lean * 2.2,
        hipsXL:   lean * 1.6, hipsXR: lean * 1.6,
        legsXL:   lean * 2.0, legsXR: lean * 2.8,
        headYOff: -fall * 4,  bodyYOff: grav * 0.25, legsYOff: -fall * 2,
      };
    }

    case 'crouch': {
      const depth  = 0.5 - 0.5 * Math.cos(clamp01(t * 2) * Math.PI); // ease in
      const spread = depth * 14;
      return {
        globalY: depth * 28, alpha: 1,
        hairXOff: 0,
        headXOff: 0,
        torsoXL:  -spread * 0.3, torsoXR: spread * 0.3,
        hipsXL:   -spread * 0.6, hipsXR: spread * 0.6,
        legsXL:   -spread,       legsXR: spread,
        headYOff: depth * 12,    bodyYOff: depth * 18, legsYOff: depth * 6,
      };
    }

    case 'cast': {
      const raise  = -Math.abs(Math.sin(t * Math.PI)) * 20;
      const sway   = s1 * 5;
      const ripple = s2 * 2;
      return {
        globalY: 0, alpha: 1,
        hairXOff: sway * 1.8 + ripple,
        headXOff: sway,
        torsoXL:  raise + sway, torsoXR: raise + sway,
        hipsXL:   -sway * 0.4,  hipsXR: sway * 0.4,
        legsXL:   0,             legsXR: 0,
        headYOff: -as1 * 3,     bodyYOff: 0, legsYOff: 0,
      };
    }

    default: return zeroT();
  }
}

function zeroT() {
  return {
    globalY: 0, alpha: 1,
    hairXOff: 0, headXOff: 0,
    torsoXL: 0, torsoXR: 0,
    hipsXL: 0,  hipsXR: 0,
    legsXL: 0,  legsXR: 0,
    headYOff: 0, bodyYOff: 0, legsYOff: 0,
  };
}

// ── Visual effects ────────────────────────────────────────────────────────────

function drawCastGlow(ctx, DW, DH, t, dir) {
  const glow   = Math.abs(Math.sin(t * Math.PI * 2));
  const ex     = dir === 'left' ? DW * 0.3 : DW * 0.7;
  const ey     = DH * 0.38;
  const radius = 20 + glow * 30;
  const grad   = ctx.createRadialGradient(ex, ey, 0, ex, ey, radius);
  grad.addColorStop(0,   `rgba(180,120,255,${0.55 * glow})`);
  grad.addColorStop(0.4, `rgba(120,80,255,${0.25 * glow})`);
  grad.addColorStop(1,   'rgba(80,40,255,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ex, ey, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHurtFlash(ctx, DW, DH, flash) {
  if (flash <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(255,60,60,${flash * 0.45})`;
  ctx.fillRect(0, 0, DW, DH);
  ctx.restore();
}

// ── Utilities ────────────────────────────────────────────────────────────────
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
