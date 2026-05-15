// animator.js — Puppet renderer
// Uses ctx.save/translate/rotate/drawImage per part.
// Draw order respects z-layering (back limbs behind torso, front limbs on top).

export const POSES = [
  { id:'idle',   label:'IDLE',   ico:'🧍' },
  { id:'walk',   label:'WALK',   ico:'🚶' },
  { id:'run',    label:'RUN',    ico:'🏃' },
  { id:'jump',   label:'JUMP',   ico:'🦘' },
  { id:'attack', label:'ATTACK', ico:'⚔️'  },
  { id:'hurt',   label:'HURT',   ico:'💢' },
  { id:'die',    label:'DIE',    ico:'💀' },
  { id:'crouch', label:'CROUCH', ico:'🦆' },
  { id:'cast',   label:'CAST',   ico:'✨' },
];

const PI2     = Math.PI * 2;
const DEG     = Math.PI / 180;
const sin1    = t => Math.sin(t * PI2);
const cos1    = t => Math.cos(t * PI2);
const sin2    = t => Math.sin(t * PI2 * 2);
const abs1    = t => Math.abs(sin1(t));
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ease    = (t,p=2) => t<.5?Math.pow(t*2,p)/2:1-Math.pow((1-t)*2,p)/2;

// ── Pose definitions ──────────────────────────────────────────────────────────
// H = character pixel height in dest canvas (after scaling)
// Returns { order[], per-part: { rot, dx, dy }, globalDY, alpha? }
export function getPoseTransforms(pose, t, H) {
  switch (pose) {

    case 'idle': {
      const bob  = sin1(t) * H * 0.008;
      const sway = sin1(t) * 1.5 * DEG;
      const arm  = sin1(t) * 3 * DEG;
      return {
        order: ['legL','legR','hips','torso','armL','armR','neck','head','hair'],
        hair:  { rot: sway*2.2,    dx:0, dy:-bob },
        head:  { rot: sway*0.5,    dx:0, dy:-bob },
        neck:  { rot: sway*0.3,    dx:0, dy:-bob*0.8 },
        torso: { rot: sway*0.2,    dx:0, dy:-bob*0.6 },
        armL:  { rot: arm+5*DEG,   dx:0, dy:-bob*0.5 },
        armR:  { rot:-arm-5*DEG,   dx:0, dy:-bob*0.5 },
        hips:  { rot:-sway*0.1,    dx:0, dy: bob*0.3 },
        legL:  { rot: sway*0.8,    dx:0, dy: bob*0.2 },
        legR:  { rot:-sway*0.8,    dx:0, dy: bob*0.2 },
        globalDY: bob * 0.3,
      };
    }

    case 'walk': {
      // Proper alternating gait — legs 180° out of phase
      // legL forward when sin>0, legR forward when sin<0
      const legFwd  =  sin1(t) * 42 * DEG;
      const legBck  = -sin1(t) * 42 * DEG;
      const armFwd  = -sin1(t) * 34 * DEG;
      const armBck  =  sin1(t) * 34 * DEG;
      const bob     = abs1(t) * H * -0.028;
      const hipRock = sin1(t) * 6 * DEG;
      const lean    = 5 * DEG;
      const hair    = sin1(t) * 10 * DEG;
      // Lift only the swinging leg
      const liftL   = Math.max(0,  sin1(t)) * H * -0.055;
      const liftR   = Math.max(0, -sin1(t)) * H * -0.055;
      const strdL   =  sin1(t) * H * 0.04;
      const strdR   = -sin1(t) * H * 0.04;
      return {
        order: ['legL','legR','hips','torso','armL','armR','neck','head','hair'],
        hair:  { rot: lean+hair,   dx:0,     dy: bob*0.4 },
        head:  { rot: lean*0.5,    dx:0,     dy: bob*0.5 },
        neck:  { rot: lean*0.4,    dx:0,     dy: bob*0.5 },
        torso: { rot: lean,        dx:0,     dy: bob*0.5 },
        armL:  { rot: armFwd,      dx:0,     dy: bob*0.3 },
        armR:  { rot: armBck,      dx:0,     dy: bob*0.3 },
        hips:  { rot: hipRock,     dx:0,     dy: bob*0.3 },
        legL:  { rot: legFwd,      dx:strdL, dy: liftL   },
        legR:  { rot: legBck,      dx:strdR, dy: liftR   },
        globalDY: bob,
      };
    }

    case 'run': {
      const legFwd  =  sin1(t) * 60 * DEG;
      const legBck  = -sin1(t) * 60 * DEG;
      const armFwd  = -sin1(t) * 54 * DEG;
      const armBck  =  sin1(t) * 54 * DEG;
      const bob     = abs1(t) * H * -0.044;
      const hipRock = sin1(t) * 10 * DEG;
      const lean    = 13 * DEG;
      const hair    = sin1(t) * 18 * DEG + lean;
      const liftL   = Math.max(0,  sin1(t)) * H * -0.10;
      const liftR   = Math.max(0, -sin1(t)) * H * -0.10;
      const strdL   =  sin1(t) * H * 0.07;
      const strdR   = -sin1(t) * H * 0.07;
      return {
        order: ['legL','legR','hips','torso','armL','armR','neck','head','hair'],
        hair:  { rot: hair,        dx:0,     dy: bob*0.5 },
        head:  { rot: lean*0.5,    dx:0,     dy: bob*0.6 },
        neck:  { rot: lean*0.5,    dx:0,     dy: bob*0.5 },
        torso: { rot: lean,        dx:0,     dy: bob*0.5 },
        armL:  { rot: armFwd,      dx:0,     dy: bob*0.4 },
        armR:  { rot: armBck,      dx:0,     dy: bob*0.4 },
        hips:  { rot: hipRock,     dx:0,     dy: bob*0.3 },
        legL:  { rot: legFwd,      dx:strdL, dy: liftL   },
        legR:  { rot: legBck,      dx:strdR, dy: liftR   },
        globalDY: bob,
      };
    }

    case 'jump': {
      const arc    = -Math.sin(t * Math.PI);
      const tuck   =  arc * 36 * DEG;
      const armUp  = -arc * 58 * DEG;
      const lean   =  arc * 9 * DEG;
      const rise   =  arc * H * 0.18;
      return {
        order: ['legL','legR','hips','torso','armL','armR','neck','head','hair'],
        hair:  { rot: lean*-0.7,       dx:0,         dy:-arc*H*0.05 },
        head:  { rot: lean*-0.3,       dx:0,         dy:0 },
        neck:  { rot: lean*-0.2,       dx:0,         dy:0 },
        torso: { rot: lean,            dx:0,         dy:0 },
        armL:  { rot: armUp-10*DEG,    dx:-H*0.01,   dy:0 },
        armR:  { rot:-armUp+10*DEG,    dx: H*0.01,   dy:0 },
        hips:  { rot:0,                dx:0,         dy:0 },
        legL:  { rot: tuck+10*DEG,     dx: H*0.01,   dy:0 },
        legR:  { rot:-tuck-10*DEG,     dx:-H*0.01,   dy:0 },
        globalDY: rise,
      };
    }

    case 'attack': {
      const sl    = t < 0.3 ? -(t/0.3) : (t-0.3)/0.7;
      const aR    = (sl*115-50) * DEG;
      const twist = sl * 20 * DEG;
      const bob   = -Math.abs(sl) * H * 0.01;
      return {
        order: ['legL','legR','hips','armL','torso','armR','neck','head','hair'],
        hair:  { rot: twist*0.55,  dx:0, dy:bob*0.5 },
        head:  { rot: twist*0.3,   dx:0, dy:0 },
        neck:  { rot: twist*0.25,  dx:0, dy:0 },
        torso: { rot: twist,       dx:0, dy:bob },
        armL:  { rot:-20*DEG,      dx:0, dy:0 },
        armR:  { rot: aR,          dx:0, dy:0 },
        hips:  { rot: twist*0.4,   dx:0, dy:bob*0.5 },
        legL:  { rot:-10*DEG,      dx:0, dy:0 },
        legR:  { rot: 14*DEG,      dx:0, dy:0 },
        globalDY: bob,
      };
    }

    case 'hurt': {
      const rc  = Math.sin(t*Math.PI) * -24 * DEG;
      const shk = sin2(t) * 4 * DEG;
      const ry  = Math.sin(t*Math.PI) * H * -0.024;
      return {
        order: ['legL','legR','hips','torso','armL','armR','neck','head','hair'],
        hair:  { rot: rc*-0.7+shk,  dx:0, dy:ry*0.4 },
        head:  { rot: rc*-0.4,      dx:0, dy:ry*0.3 },
        neck:  { rot: rc*-0.3,      dx:0, dy:ry*0.3 },
        torso: { rot: rc,           dx:0, dy:ry },
        armL:  { rot: rc+26*DEG,    dx:0, dy:0 },
        armR:  { rot: rc-26*DEG,    dx:0, dy:0 },
        hips:  { rot: rc*0.4,       dx:0, dy:ry*0.4 },
        legL:  { rot: rc*0.3,       dx:0, dy:0 },
        legR:  { rot: rc*0.3,       dx:0, dy:0 },
        globalDY: ry,
        alpha: 0.5 + 0.5 * clamp01(1 - Math.sin(t*PI2*6)*0.5),
      };
    }

    case 'die': {
      const f    = clamp01(ease(t, 2.5));
      const lean = f * 90 * DEG;
      const drop = f * H * 0.08;
      const fade = t > 0.65 ? clamp01(1-(t-0.65)/0.35) : 1;
      return {
        order: ['hair','head','neck','armL','armR','torso','hips','legL','legR'],
        hair:  { rot: lean*0.9,   dx:0, dy:drop },
        head:  { rot: lean*0.8,   dx:0, dy:drop*0.8 },
        neck:  { rot: lean*0.85,  dx:0, dy:drop*0.7 },
        torso: { rot: lean*0.85,  dx:0, dy:drop*0.5 },
        armL:  { rot: lean*1.1,   dx:0, dy:drop*0.4 },
        armR:  { rot:-lean*0.4,   dx:0, dy:drop*0.4 },
        hips:  { rot: lean*0.8,   dx:0, dy:drop*0.2 },
        legL:  { rot: lean*0.6,   dx:0, dy:0 },
        legR:  { rot: lean*0.5,   dx:0, dy:0 },
        globalDY: drop*0.5, alpha: fade,
      };
    }

    case 'crouch': {
      const d   = clamp01(ease(clamp01(t*2), 2));
      const sp  = d * 27 * DEG;
      const sq  = d * H * 0.072;
      const la  = d * 9 * DEG;
      return {
        order: ['legL','legR','hips','torso','armL','armR','neck','head','hair'],
        hair:  { rot:0,          dx:0,         dy:sq },
        head:  { rot:la,         dx:0,         dy:sq*0.8 },
        neck:  { rot:la,         dx:0,         dy:sq*0.7 },
        torso: { rot:la,         dx:0,         dy:sq*0.6 },
        armL:  { rot:32*DEG,     dx:0,         dy:sq*0.4 },
        armR:  { rot:-32*DEG,    dx:0,         dy:sq*0.4 },
        hips:  { rot:0,          dx:0,         dy:sq*0.2 },
        legL:  { rot:sp,         dx: H*0.012,  dy:0 },
        legR:  { rot:-sp,        dx:-H*0.012,  dy:0 },
        globalDY: sq*0.8,
      };
    }

    case 'cast': {
      const raise  = Math.abs(cos1(t)) * -70 * DEG;
      const sway   = sin1(t) * 6 * DEG;
      const ripple = sin2(t) * 3 * DEG;
      return {
        order: ['legL','legR','hips','torso','armR','neck','head','armL','hair'],
        hair:  { rot: sway*1.7+ripple, dx:0, dy:0 },
        head:  { rot: sway*0.4,        dx:0, dy:Math.abs(cos1(t))*H*-0.005 },
        neck:  { rot: sway*0.3,        dx:0, dy:0 },
        torso: { rot: sway*0.2,        dx:0, dy:0 },
        armL:  { rot: raise-12*DEG,    dx:0, dy:0 },
        armR:  { rot: sway,            dx:0, dy:0 },
        hips:  { rot:-sway*0.1,        dx:0, dy:0 },
        legL:  { rot: sway*0.5,        dx:0, dy:0 },
        legR:  { rot:-sway*0.5,        dx:0, dy:0 },
        globalDY: 0,
        effect: 'cast',
      };
    }

    default: return getPoseTransforms('idle', t, H);
  }
}

// ── Main render ───────────────────────────────────────────────────────────────
export function renderFrame(ctx, puppet, pose, t, dir) {
  const { parts, joints, bb, groundY } = puppet;
  const DW = ctx.canvas.width, DH = ctx.canvas.height;
  ctx.clearRect(0, 0, DW, DH);

  // Scale so character body fills ~80% of canvas height, feet at 92% DH
  const scale    = Math.min((DW*0.80)/bb.w, (DH*0.82)/bb.h);
  const groundDH = DH * 0.92;
  const H        = bb.h * scale;

  const T       = getPoseTransforms(pose, t, H);
  const gAlpha  = T.alpha ?? 1;
  const gDY     = T.globalDY ?? 0;

  // originX centres on the torso joint (not the bbox edge)
  // This keeps the body centred even when weapons extend to one side
  const torsoPivotX = joints.torso ? joints.torso.x : bb.x + bb.w * 0.5;
  const originX     = DW * 0.5 - torsoPivotX * scale;
  const originY     = groundDH - groundY * scale + gDY;

  ctx.save();
  if (dir === 'left') { ctx.translate(DW,0); ctx.scale(-1,1); }
  ctx.globalAlpha = gAlpha;

  const order = T.order || Object.keys(parts);
  for (const pid of order) {
    const part = parts[pid];
    const xf   = T[pid];
    if (!part || !part.canvas || !xf) continue;

    // World position of this part's joint/anchor in dest canvas
    const wx = originX + part.srcX * scale + part.anchorX * scale + (xf.dx||0);
    const wy = originY + part.srcY * scale + part.anchorY * scale + (xf.dy||0);

    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(xf.rot || 0);
    ctx.drawImage(
      part.canvas,
      -part.anchorX * scale,
      -part.anchorY * scale,
      part.canvas.width  * scale,
      part.canvas.height * scale,
    );
    ctx.restore();
  }

  ctx.restore();

  if (T.effect === 'cast') _castGlow(ctx, DW, DH, t);
  if (pose === 'hurt')     _hurtFlash(ctx, DW, DH, t);
}

function _castGlow(ctx, DW, DH, t) {
  const g  = (1+Math.sin(t*Math.PI*4))*0.5;
  const ex = DW*0.62, ey = DH*0.35, r = 18+g*28;
  const gr = ctx.createRadialGradient(ex,ey,0,ex,ey,r);
  gr.addColorStop(0,  `rgba(200,140,255,${0.7*g})`);
  gr.addColorStop(.5, `rgba(130,80,255,${0.28*g})`);
  gr.addColorStop(1,  'rgba(80,40,200,0)');
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(ex,ey,r,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function _hurtFlash(ctx, DW, DH, t) {
  const f = t<0.2?1:Math.max(0,1-(t-0.2)*5);
  if(f<0.01)return;
  ctx.save(); ctx.globalCompositeOperation='source-atop';
  ctx.fillStyle=`rgba(255,50,50,${f*0.48})`; ctx.fillRect(0,0,DW,DH); ctx.restore();
}
