// bodyDetect.js — Voronoi puppet segmentation
// This version is tuned for side-scroller characters that are slightly tilted.
// It keeps the drag-and-drop workflow, but biases the region assignment so the
// skeleton follows the character's spine instead of assuming a perfectly frontal pose.

const ALPHA = 18;

// Joint definitions — id, label, colour, parent (for skeleton bones)
export const JOINT_DEFS = [
  { id:'head',     label:'Head',    color:'#60d4f0', parent:'neck'     },
  { id:'hair',     label:'Hair',    color:'#a78bfa', parent:'head'     },
  { id:'neck',     label:'Neck',    color:'#f0e060', parent:'torso'    },
  { id:'torso',    label:'Torso',   color:'#4ade80', parent:'hips'     },
  { id:'hips',     label:'Hips',    color:'#60a5fa', parent:null       },
  { id:'armL',     label:'Arm L',   color:'#f59e0b', parent:'torso'    },
  { id:'armR',     label:'Arm R',   color:'#fb923c', parent:'torso'    },
  { id:'legL',     label:'Leg L',   color:'#f87171', parent:'hips'     },
  { id:'legR',     label:'Leg R',   color:'#c084fc', parent:'hips'     },
];

const BODY_WEIGHTS = {
  head:  { u: 0.85, v: 2.35 },
  hair:  { u: 0.70, v: 2.75 },
  neck:  { u: 0.95, v: 2.10 },
  torso: { u: 1.15, v: 1.85 },
  hips:  { u: 1.10, v: 1.70 },
  armL:  { u: 1.55, v: 0.95 },
  armR:  { u: 1.55, v: 0.95 },
  legL:  { u: 1.45, v: 0.90 },
  legR:  { u: 1.45, v: 0.90 },
};

function _sign(v) {
  return v < 0 ? -1 : 1;
}

function _cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function _norm(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len, len };
}

function _jointGroup(id) {
  if (id === 'armL' || id === 'armR') return 'arm';
  if (id === 'legL' || id === 'legR') return 'leg';
  return 'center';
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-place joints given character bounding box (initial guess)
// Returns { id → {x,y} } in source canvas pixel space.
// options:
//   facing: 'left' | 'right'  (used to bias the pose for side-scrollers)
//   tilt:   number            (0.0..0.2-ish, spine lean amount)
// ─────────────────────────────────────────────────────────────────────────────
export function autoPlaceJoints(bb, options = {}) {
  const { x, y, w, h } = bb;
  const facing = options.facing === 'left' ? 'left' : 'right';
  const tilt   = typeof options.tilt === 'number' ? options.tilt : 0.08;
  const dir    = facing === 'left' ? -1 : 1;

  const cx = x + w * 0.5;

  // Slight diagonal spine to better match side-scroller / tilted characters.
  const spineX = (frac) => cx + dir * w * tilt * (frac - 0.5);
  const sy     = (frac) => y + h * frac;

  const headY  = 0.12;
  const hairY  = 0.04;
  const neckY  = 0.23;
  const torsoY = 0.41;
  const hipsY  = 0.57;
  const armY   = 0.34;
  const legY   = 0.78;

  // Mirror-friendly offsets: the leading side is pushed slightly farther out.
  const leadX  = w * (0.26 + tilt * 0.12);
  const trailX = w * (0.17 + tilt * 0.06);
  const leadLeg= w * (0.19 + tilt * 0.10);
  const trailLeg=w * (0.12 + tilt * 0.05);

  return {
    hair:  { x: spineX(hairY), y: sy(hairY) },
    head:  { x: spineX(headY),  y: sy(headY)  },
    neck:  { x: spineX(neckY),  y: sy(neckY)  },
    torso: { x: spineX(torsoY), y: sy(torsoY) },
    hips:  { x: spineX(hipsY),  y: sy(hipsY)  },

    // Screen-left vs screen-right labels. The side facing the camera is nudged
    // a little farther away from the body axis so the regions separate cleanly.
    armL:  { x: spineX(armY) - trailX * dir, y: sy(armY) },
    armR:  { x: spineX(armY) + leadX  * dir, y: sy(armY) },
    legL:  { x: spineX(legY) - trailLeg * dir, y: sy(legY) },
    legR:  { x: spineX(legY) + leadLeg  * dir, y: sy(legY) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute bounding box of visible pixels
// ─────────────────────────────────────────────────────────────────────────────
export function computeBB(charCanvas) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const d   = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > ALPHA) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x0 > x1) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Body frame helpers for tilted / side-facing sprites
// ─────────────────────────────────────────────────────────────────────────────
function buildBodyFrame(joints) {
  const neck = joints.neck || joints.torso || joints.head;
  const hips = joints.hips || joints.torso || joints.neck;
  if (!neck || !hips) return null;

  const axis = _norm(hips.x - neck.x, hips.y - neck.y);
  const perp = { x: -axis.y, y: axis.x };
  const len2  = axis.len * axis.len;

  const jointFrame = {};
  for (const [id, j] of Object.entries(joints)) {
    const dx = j.x - neck.x;
    const dy = j.y - neck.y;
    jointFrame[id] = {
      u: (dx * axis.x + dy * axis.y) / axis.len,
      v: (dx * perp.x + dy * perp.y) / axis.len,
      side: _sign(_cross(axis.x, axis.y, dx, dy)),
    };
  }

  return { neck, hips, axis, perp, len: axis.len, len2, jointFrame };
}

function framePoint(frame, x, y) {
  const dx = x - frame.neck.x;
  const dy = y - frame.neck.y;
  return {
    u: (dx * frame.axis.x + dy * frame.axis.y) / frame.len,
    v: (dx * frame.perp.x + dy * frame.perp.y) / frame.len,
    side: _sign(_cross(frame.axis.x, frame.axis.y, dx, dy)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build Voronoi assignment map:
//   pixelJoint[y*W+x] = joint id string  (for fg pixels)
// The score is still nearest-neighbour, but with an anatomy-aware bias so a
// tilted character does not get split like a front-facing mannequin.
// ─────────────────────────────────────────────────────────────────────────────
export function buildVoronoi(charCanvas, joints) {
  const W   = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const d   = ctx.getImageData(0, 0, W, H).data;
  const ids = Object.keys(joints);
  const map  = new Array(W * H).fill(null);

  const frame = buildBodyFrame(joints);
  const jointFrame = frame ? frame.jointFrame : null;
  const limbPenalty = frame ? frame.len2 * 0.18 : 0;
  const centerPenalty = frame ? frame.len2 * 0.05 : 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] <= ALPHA) continue;

      const p = frame ? framePoint(frame, x, y) : null;
      let best = null;
      let bestScore = Infinity;

      for (const id of ids) {
        const j = joints[id];
        const dx = x - j.x;
        const dy = y - j.y;
        let score = dx * dx + dy * dy;

        if (frame && jointFrame[id]) {
          const jf = jointFrame[id];
          const w  = BODY_WEIGHTS[id] || BODY_WEIGHTS.torso;
          const du = p.u - jf.u;
          const dv = p.v - jf.v;

          // Tilt-aware bias in the body's local coordinate system.
          score += (du * du * w.u + dv * dv * w.v) * frame.len2;

          // Keep center joints close to the body axis; keep limbs on their own side.
          const group = _jointGroup(id);
          if (group === 'center') {
            score += Math.abs(p.v - jf.v) * centerPenalty;
          } else {
            const sideMatch = p.side === jf.side;
            if (!sideMatch) score += limbPenalty;
          }
        }

        if (score < bestScore) {
          bestScore = score;
          best = id;
        }
      }

      map[y * W + x] = best;
    }
  }

  return { map, W, H, srcData: ctx.getImageData(0, 0, W, H) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract one joint's pixels into its own canvas + compute anchor
// anchor = the joint position in the part-canvas's local pixel space
// ─────────────────────────────────────────────────────────────────────────────
export function extractParts(voronoi, joints) {
  const { map, W, H, srcData } = voronoi;
  const d = srcData.data;
  const parts = {};

  for (const def of JOINT_DEFS) {
    const id = def.id;
    // Find bounding box of this region
    let rx0 = W, rx1 = 0, ry0 = H, ry1 = 0, cnt = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (map[y * W + x] !== id) continue;
      if (x < rx0) rx0 = x;
      if (x > rx1) rx1 = x;
      if (y < ry0) ry0 = y;
      if (y > ry1) ry1 = y;
      cnt++;
    }
    if (cnt < 4 || rx0 > rx1) {
      parts[id] = null;
      continue;
    }

    const pw = rx1 - rx0 + 1, ph = ry1 - ry0 + 1;
    const pc = document.createElement('canvas');
    pc.width = pw;
    pc.height = ph;
    const pCtx = pc.getContext('2d');
    const pImg = pCtx.createImageData(pw, ph);
    const pd = pImg.data;

    for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
      if (map[y * W + x] !== id) continue;
      const si = (y * W + x) * 4;
      const di = ((y - ry0) * pw + (x - rx0)) * 4;
      pd[di]     = d[si];
      pd[di + 1] = d[si + 1];
      pd[di + 2] = d[si + 2];
      pd[di + 3] = d[si + 3];
    }
    pCtx.putImageData(pImg, 0, 0);

    // Anchor = joint position in local canvas coords
    const ax = joints[id].x - rx0;
    const ay = joints[id].y - ry0;

    parts[id] = {
      canvas:  pc,
      anchorX: Math.max(0, Math.min(pw - 1, ax)),
      anchorY: Math.max(0, Math.min(ph - 1, ay)),
      srcX: rx0,
      srcY: ry0,
      w: pw,
      h: ph,
    };
  }
  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the final puppet object consumed by animator.js
// ─────────────────────────────────────────────────────────────────────────────
export function buildPuppet(charCanvas, joints) {
  const bb = computeBB(charCanvas);
  if (!bb) return null;
  const voronoi = buildVoronoi(charCanvas, joints);
  const parts   = extractParts(voronoi, joints);
  const groundY = bb.y + bb.h - 1;
  return { parts, joints, bb, groundY, voronoi };
}
