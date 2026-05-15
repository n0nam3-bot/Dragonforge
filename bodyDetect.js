// bodyDetect.js — Voronoi puppet segmentation
// Each foreground pixel is assigned to its nearest joint seed.
// Joints are draggable so the user controls exactly what goes in each limb.

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

// ─────────────────────────────────────────────────────────────────────────────
// Auto-place joints given character bounding box (initial guess)
// Returns { id → {x,y} } in source canvas pixel space
// ─────────────────────────────────────────────────────────────────────────────
export function autoPlaceJoints(bb) {
  const { x, y, w, h } = bb;
  const cx = x + w * 0.5;
  const t  = (frac) => y + h * frac;  // absolute y at fraction of height

  return {
    hair:  { x: cx,           y: t(0.04) },
    head:  { x: cx,           y: t(0.13) },
    neck:  { x: cx,           y: t(0.24) },
    torso: { x: cx,           y: t(0.40) },
    hips:  { x: cx,           y: t(0.56) },
    armL:  { x: cx - w*0.30,  y: t(0.33) },
    armR:  { x: cx + w*0.30,  y: t(0.33) },
    legL:  { x: cx - w*0.18,  y: t(0.76) },
    legR:  { x: cx + w*0.18,  y: t(0.76) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute bounding box of visible pixels
// ─────────────────────────────────────────────────────────────────────────────
export function computeBB(charCanvas) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const d   = ctx.getImageData(0, 0, W, H).data;
  let x0=W, x1=0, y0=H, y1=0;
  for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
    if (d[(y*W+x)*4+3] > ALPHA) {
      if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
    }
  }
  if (x0>x1) return null;
  return { x:x0, y:y0, w:x1-x0+1, h:y1-y0+1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build Voronoi assignment map:
//   pixelJoint[y*W+x] = joint id string  (for fg pixels)
// ─────────────────────────────────────────────────────────────────────────────
export function buildVoronoi(charCanvas, joints) {
  const W   = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const d   = ctx.getImageData(0, 0, W, H).data;
  const ids  = Object.keys(joints);
  const map  = new Array(W * H).fill(null);

  for (let y=0; y<H; y++) {
    for (let x=0; x<W; x++) {
      if (d[(y*W+x)*4+3] <= ALPHA) continue;
      let best=null, bestD=Infinity;
      for (const id of ids) {
        const j  = joints[id];
        const dx = x - j.x, dy = y - j.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < bestD) { bestD=d2; best=id; }
      }
      map[y*W+x] = best;
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
    let rx0=W, rx1=0, ry0=H, ry1=0, cnt=0;
    for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
      if (map[y*W+x] !== id) continue;
      if(x<rx0)rx0=x; if(x>rx1)rx1=x; if(y<ry0)ry0=y; if(y>ry1)ry1=y; cnt++;
    }
    if (cnt < 4 || rx0 > rx1) { parts[id] = null; continue; }

    const pw = rx1-rx0+1, ph = ry1-ry0+1;
    const pc = document.createElement('canvas');
    pc.width = pw; pc.height = ph;
    const pCtx = pc.getContext('2d');
    const pImg = pCtx.createImageData(pw, ph);
    const pd   = pImg.data;

    for (let y=ry0; y<=ry1; y++) for (let x=rx0; x<=rx1; x++) {
      if (map[y*W+x] !== id) continue;
      const si = (y*W+x)*4, di = ((y-ry0)*pw+(x-rx0))*4;
      pd[di]=d[si]; pd[di+1]=d[si+1]; pd[di+2]=d[si+2]; pd[di+3]=d[si+3];
    }
    pCtx.putImageData(pImg, 0, 0);

    // Anchor = joint position in local canvas coords
    const ax = joints[id].x - rx0;
    const ay = joints[id].y - ry0;

    parts[id] = {
      canvas:  pc,
      anchorX: Math.max(0, Math.min(pw-1, ax)),
      anchorY: Math.max(0, Math.min(ph-1, ay)),
      srcX: rx0, srcY: ry0,
      w: pw, h: ph,
    };
  }
  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the final puppet object consumed by animator.js
// ─────────────────────────────────────────────────────────────────────────────
export function buildPuppet(charCanvas, joints) {
  const bb      = computeBB(charCanvas);
  if (!bb) return null;
  const voronoi = buildVoronoi(charCanvas, joints);
  const parts   = extractParts(voronoi, joints);
  const groundY = bb.y + bb.h - 1;
  return { parts, joints, bb, groundY, voronoi };
}
