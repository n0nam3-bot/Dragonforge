// bodyDetect.js — skeleton-aware puppet segmentation
// Replaces raw screen-space Voronoi with a tilt-aware body frame + capsule scoring.
// The goal is to keep side-view / 3⁄4-view sprites segmented by actual anatomy,
// not just by nearest on-screen point.

const ALPHA = 18;
const EPS   = 1e-6;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function dot(ax, ay, bx, by) { return ax * bx + ay * by; }

function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function projectPoint(pt, origin, axis, perp) {
  const dx = pt.x - origin.x;
  const dy = pt.y - origin.y;
  return {
    u: dot(dx, dy, axis.x, axis.y),
    v: dot(dx, dy, perp.x, perp.y),
  };
}

function pointToSegmentScore(px, py, ax, ay, bx, by, radius, endPenalty = 2.0) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;

  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  const clampedT = clamp(t, 0, 1);
  const qx = ax + dx * clampedT;
  const qy = ay + dy * clampedT;

  const dist2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
  let score = dist2 / Math.max(radius * radius, EPS);

  if (t < 0) score += (-t) * (-t) * endPenalty;
  else if (t > 1) score += (t - 1) * (t - 1) * endPenalty;

  return score;
}

function bandPenalty(u, minU, maxU, softness) {
  if (u < minU) return ((minU - u) / Math.max(softness, EPS)) ** 2;
  if (u > maxU) return ((u - maxU) / Math.max(softness, EPS)) ** 2;
  return 0;
}

function alphaStats(charCanvas, bb = null) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, W, H).data;

  let sumX = 0, sumY = 0, sum = 0;
  let minX = W, minY = H, maxX = -1, maxY = -1;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = data[(y * W + x) * 4 + 3];
      if (a <= ALPHA) continue;
      sumX += x * a;
      sumY += y * a;
      sum  += a;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (!sum) {
    const fallback = bb || { x: 0, y: 0, w: W, h: H };
    return {
      cx: fallback.x + fallback.w * 0.5,
      cy: fallback.y + fallback.h * 0.5,
      axisX: 0,
      axisY: 1,
      perpX: 1,
      perpY: 0,
      angle: Math.PI / 2,
      w: fallback.w,
      h: fallback.h,
      hasData: false,
    };
  }

  const cx = sumX / sum;
  const cy = sumY / sum;

  let cxx = 0, cxy = 0, cyy = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = data[(y * W + x) * 4 + 3];
      if (a <= ALPHA) continue;
      const dx = x - cx;
      const dy = y - cy;
      cxx += a * dx * dx;
      cxy += a * dx * dy;
      cyy += a * dy * dy;
    }
  }

  const trace = cxx + cyy;
  const det   = cxx * cyy - cxy * cxy;
  const root  = Math.sqrt(Math.max(0, trace * trace * 0.25 - det));
  const l1    = trace * 0.5 + root;
  let ax = cxy;
  let ay = l1 - cxx;

  if (Math.abs(ax) + Math.abs(ay) < EPS) {
    // Fallback to the tall axis of the bbox.
    ax = 0;
    ay = 1;
  } else {
    const n = normalize(ax, ay);
    ax = n.x;
    ay = n.y;
  }

  // Make the axis point downward for a stable body frame.
  if (ay < 0) {
    ax = -ax;
    ay = -ay;
  }

  const px = -ay;
  const py = ax;

  return {
    cx,
    cy,
    axisX: ax,
    axisY: ay,
    perpX: px,
    perpY: py,
    angle: Math.atan2(ay, ax),
    w: (bb ? bb.w : (maxX >= minX ? (maxX - minX + 1) : W)),
    h: (bb ? bb.h : (maxY >= minY ? (maxY - minY + 1) : H)),
    hasData: true,
  };
}

function deriveBodyFrame(charCanvas, joints = null, bb = null) {
  const stats = alphaStats(charCanvas, bb);

  let origin = { x: stats.cx, y: stats.cy };
  let axis   = { x: stats.axisX, y: stats.axisY };
  let perp   = { x: stats.perpX, y: stats.perpY };

  // If joints are available, they are usually more stable than raw alpha PCA.
  const has = (id) => joints && joints[id] && Number.isFinite(joints[id].x) && Number.isFinite(joints[id].y);
  if (has('head') && has('hips')) {
    const d = normalize(joints.hips.x - joints.head.x, joints.hips.y - joints.head.y);
    axis = d;
    if (axis.y < 0) axis = { x: -axis.x, y: -axis.y };
    perp = { x: -axis.y, y: axis.x };
    origin = { x: joints.torso?.x ?? stats.cx, y: joints.torso?.y ?? stats.cy };
  } else if (has('neck') && has('hips')) {
    const d = normalize(joints.hips.x - joints.neck.x, joints.hips.y - joints.neck.y);
    axis = d;
    if (axis.y < 0) axis = { x: -axis.x, y: -axis.y };
    perp = { x: -axis.y, y: axis.x };
    origin = { x: joints.torso?.x ?? stats.cx, y: joints.torso?.y ?? stats.cy };
  } else if (has('torso') && has('hips')) {
    const d = normalize(joints.hips.x - joints.torso.x, joints.hips.y - joints.torso.y);
    axis = d;
    if (axis.y < 0) axis = { x: -axis.x, y: -axis.y };
    perp = { x: -axis.y, y: axis.x };
    origin = { x: joints.torso.x, y: joints.torso.y };
  }

  return { origin, axis, perp, stats };
}


// Body-part definitions. The core rig stays stable for animation, while the
// optional parts are used as region labels / segmentation targets.
export const CORE_PART_IDS = ['head','hair','neck','torso','hips','armL','armR','legL','legR'];

export const BODY_PART_LIBRARY = [
  { id:'head',      label:'Head',      color:'#60d4f0', parent:'neck',  aliasOf:'head', required:true  },
  { id:'hair',      label:'Hair',      color:'#a78bfa', parent:'head',  aliasOf:'hair', required:false },
  { id:'neck',      label:'Neck',      color:'#f0e060', parent:'torso', aliasOf:'neck', required:true  },
  { id:'torso',     label:'Torso',     color:'#4ade80', parent:'hips',  aliasOf:'torso', required:true  },
  { id:'hips',      label:'Hips',      color:'#60a5fa', parent:null,    aliasOf:'hips',  required:true  },
  { id:'shoulderL', label:'Shoulder L', color:'#34d399', parent:'torso', aliasOf:'armL',  required:false },
  { id:'shoulderR', label:'Shoulder R', color:'#f97316', parent:'torso', aliasOf:'armR',  required:false },
  { id:'armL',      label:'Arm L',     color:'#f59e0b', parent:'torso', aliasOf:'armL',   required:true  },
  { id:'armR',      label:'Arm R',     color:'#fb923c', parent:'torso', aliasOf:'armR',   required:true  },
  { id:'elbowL',    label:'Elbow L',   color:'#fbbf24', parent:'armL',  aliasOf:'armL',   required:false },
  { id:'elbowR',    label:'Elbow R',    color:'#fdba74', parent:'armR',  aliasOf:'armR',   required:false },
  { id:'handL',     label:'Hand L',    color:'#fde68a', parent:'armL',  aliasOf:'armL',   required:false },
  { id:'handR',     label:'Hand R',    color:'#fed7aa', parent:'armR',  aliasOf:'armR',   required:false },
  { id:'legL',      label:'Leg L',     color:'#f87171', parent:'hips',  aliasOf:'legL',   required:true  },
  { id:'legR',      label:'Leg R',     color:'#c084fc', parent:'hips',  aliasOf:'legR',   required:true  },
  { id:'kneeL',     label:'Knee L',    color:'#fb7185', parent:'legL',  aliasOf:'legL',   required:false },
  { id:'kneeR',     label:'Knee R',    color:'#e879f9', parent:'legR',  aliasOf:'legR',   required:false },
  { id:'footL',     label:'Foot L',    color:'#fca5a5', parent:'legL',  aliasOf:'legL',   required:false },
  { id:'footR',     label:'Foot R',    color:'#d8b4fe', parent:'legR',  aliasOf:'legR',   required:false },
  { id:'weapon',    label:'Weapon',    color:'#cbd5e1', parent:'handR', aliasOf:'armR',   required:false },
  { id:'shield',    label:'Shield',    color:'#94a3b8', parent:'handL', aliasOf:'armL',   required:false },
  { id:'cape',      label:'Cape',      color:'#f472b6', parent:'torso', aliasOf:'torso',  required:false },
  { id:'tail',      label:'Tail',      color:'#22c55e', parent:'hips',  aliasOf:'hips',   required:false },
  { id:'accessory', label:'Accessory', color:'#facc15', parent:'head',  aliasOf:'hair',   required:false },
];

export const JOINT_DEFS = BODY_PART_LIBRARY.filter(p => CORE_PART_IDS.includes(p.id));

export function getPartDefs(ids = CORE_PART_IDS) {
  const wanted = new Set(ids);
  const out = BODY_PART_LIBRARY.filter(p => wanted.has(p.id));
  for (const id of CORE_PART_IDS) {
    if (!out.some(p => p.id === id)) out.push(BODY_PART_LIBRARY.find(p => p.id === id));
  }
  return out;
}

function toWorld(origin, axis, perp, along, side) {
  return {
    x: origin.x + axis.x * along + perp.x * side,
    y: origin.y + axis.y * along + perp.y * side,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-place joints given the visible body frame.
// This is tilt-aware, so side-view / 3⁄4 sprites get better defaults.
// Returns { id → {x,y} } in source canvas pixel space.
// ─────────────────────────────────────────────────────────────────────────────
export function autoPlaceJoints(bb, charCanvas = null) {
  const frame = charCanvas ? deriveBodyFrame(charCanvas, null, bb) : null;
  const origin = frame?.origin || { x: bb.x + bb.w * 0.5, y: bb.y + bb.h * 0.48 };
  const axis   = frame?.axis   || { x: 0, y: 1 };
  const perp   = frame?.perp   || { x: 1, y: 0 };

  const H = bb.h;
  const W = bb.w;

  return {
    hair:  toWorld(origin, axis, perp, -H * 0.39, 0),
    head:  toWorld(origin, axis, perp, -H * 0.28, 0),
    neck:  toWorld(origin, axis, perp, -H * 0.15, 0),
    torso: toWorld(origin, axis, perp, -H * 0.01, 0),
    hips:  toWorld(origin, axis, perp,  H * 0.15, 0),
    armL:  toWorld(origin, axis, perp, -H * 0.02, -W * 0.24),
    armR:  toWorld(origin, axis, perp, -H * 0.02,  W * 0.24),
    legL:  toWorld(origin, axis, perp,  H * 0.30, -W * 0.11),
    legR:  toWorld(origin, axis, perp,  H * 0.30,  W * 0.11),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute bounding box of visible pixels
// ─────────────────────────────────────────────────────────────────────────────
export function computeBB(charCanvas) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const d   = ctx.getImageData(0, 0, W, H).data;
  let x0=W, x1=-1, y0=H, y1=-1;
  for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
    if (d[(y*W+x)*4+3] > ALPHA) {
      if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
    }
  }
  if (x0>x1) return null;
  return { x:x0, y:y0, w:x1-x0+1, h:y1-y0+1 };
}

function buildRegionProfiles(joints, frame, bb, partDefs = JOINT_DEFS) {
  const { origin, axis, perp } = frame;
  const projected = (j) => projectPoint(j, origin, axis, perp);
  const H = Math.max(1, bb.h);
  const W = Math.max(1, bb.w);

  const jp = {};
  for (const id of Object.keys(joints)) {
    if (joints[id]) jp[id] = projected(joints[id]);
  }
  const defById = Object.fromEntries(partDefs.map(d => [d.id, d]));

  const profiles = {};
  const make = (id, data) => { profiles[id] = { id, ...data }; };

  make('hair', {
    segA: joints.head || origin,
    segB: joints.hair || joints.head || origin,
    radius: Math.max(6, W * 0.18),
    endPenalty: 2.3,
    bandMin: (jp.head?.u ?? 0) - H * 0.36,
    bandMax: (jp.head?.u ?? 0) + H * 0.08,
    bandSoft: H * 0.10,
    centerBias: 0.25,
    bias: -0.08,
    sideBias: 0,
  });

  make('head', {
    segA: joints.neck || origin,
    segB: joints.head || origin,
    radius: Math.max(6, W * 0.16),
    endPenalty: 2.0,
    bandMin: (jp.neck?.u ?? 0) - H * 0.14,
    bandMax: (jp.head?.u ?? 0) + H * 0.18,
    bandSoft: H * 0.08,
    centerBias: 0.18,
    bias: 0,
    sideBias: 0,
  });

  make('neck', {
    segA: joints.torso || origin,
    segB: joints.neck || origin,
    radius: Math.max(4, W * 0.08),
    endPenalty: 3.2,
    bandMin: (jp.head?.u ?? 0) - H * 0.05,
    bandMax: (jp.torso?.u ?? 0) + H * 0.10,
    bandSoft: H * 0.06,
    centerBias: 0.10,
    bias: 0,
    sideBias: 0,
  });

  make('torso', {
    segA: joints.neck || origin,
    segB: joints.hips || joints.torso || origin,
    radius: Math.max(10, W * 0.22),
    endPenalty: 1.5,
    bandMin: (jp.neck?.u ?? 0) - H * 0.06,
    bandMax: (jp.hips?.u ?? 0) + H * 0.14,
    bandSoft: H * 0.10,
    centerBias: 0.55,
    bias: 0,
    sideBias: 0,
  });

  make('hips', {
    segA: joints.torso || origin,
    segB: joints.hips || origin,
    radius: Math.max(8, W * 0.18),
    endPenalty: 1.9,
    bandMin: (jp.torso?.u ?? 0) - H * 0.02,
    bandMax: (jp.hips?.u ?? 0) + H * 0.18,
    bandSoft: H * 0.09,
    centerBias: 0.30,
    bias: 0,
    sideBias: 0,
  });

  for (const id of ['armL', 'armR']) {
    const joint = joints[id] || origin;
    const jpHere = jp[id] || projected(joint);
    const tp = jp.torso || projected(joints.torso || origin);
    const lo = Math.min(tp.u, jpHere.u) - H * 0.12;
    const hi = Math.max(tp.u, jpHere.u) + H * 0.12;
    make(id, {
      segA: joints.torso || origin,
      segB: joint,
      radius: Math.max(7, W * 0.11),
      endPenalty: 2.8,
      bandMin: lo,
      bandMax: hi,
      bandSoft: H * 0.10,
      centerBias: 0.06,
      bias: 0,
      sideBias: Math.max(1.2, W * 0.10),
      jointSide: Math.sign(jpHere.v),
    });
  }

  for (const id of ['legL', 'legR']) {
    const joint = joints[id] || origin;
    const jpHere = jp[id] || projected(joint);
    const hp = jp.hips || projected(joints.hips || origin);
    const lo = Math.min(hp.u, jpHere.u) - H * 0.10;
    const hi = Math.max(hp.u, jpHere.u) + H * 0.14;
    make(id, {
      segA: joints.hips || origin,
      segB: joint,
      radius: Math.max(7, W * 0.12),
      endPenalty: 2.6,
      bandMin: lo,
      bandMax: hi,
      bandSoft: H * 0.12,
      centerBias: 0.05,
      bias: 0,
      sideBias: Math.max(1.0, W * 0.12),
      jointSide: Math.sign(jpHere.v),
    });
  }

  // Extra semantic regions reuse the nearest core joint profile so the user can
  // label more body parts without breaking the rig.
  for (const part of partDefs) {
    if (profiles[part.id]) continue;
    const alias = defById[part.aliasOf] || defById[part.parent] || defById.torso || defById.hips;
    if (!alias) continue;
    const jId = joints[part.aliasOf] ? part.aliasOf : (joints[part.id] ? part.id : (alias.aliasOf || alias.id));
    const joint = joints[jId] || joints[alias.aliasOf] || joints[alias.id] || origin;
    const parentId = alias.parent || 'torso';
    const parentJoint = joints[parentId] || origin;
    make(part.id, {
      segA: parentJoint,
      segB: joint,
      radius: Math.max(6, W * 0.10),
      endPenalty: 2.2,
      bandMin: -H * 0.5,
      bandMax:  H * 0.5,
      bandSoft: H * 0.2,
      centerBias: 0.03,
      bias: 0,
      sideBias: 0,
    });
  }

  return { profiles, projected };
}

function regionScore(px, py, id, profile, joints, frame, bb) {
  const pv = projectPoint({ x: px, y: py }, frame.origin, frame.axis, frame.perp);
  let score = pointToSegmentScore(
    px, py,
    profile.segA.x, profile.segA.y,
    profile.segB.x, profile.segB.y,
    profile.radius,
    profile.endPenalty,
  );

  score += bandPenalty(pv.u, profile.bandMin, profile.bandMax, profile.bandSoft);
  score += Math.abs(pv.v) / Math.max(bb.w * 0.5, EPS) * (profile.centerBias || 0);

  if (profile.sideBias > 0 && profile.jointSide) {
    const pSide = Math.sign(pv.v);
    if (pSide && pSide !== profile.jointSide) score += profile.sideBias;
  }

  score += profile.bias || 0;
  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build skeleton-aware assignment map.
//   pixelJoint[y*W+x] = joint id string (for fg pixels)
// ─────────────────────────────────────────────────────────────────────────────
export function buildVoronoi(charCanvas, joints, partDefs = JOINT_DEFS) {
  const W   = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, W, H);
  const d   = img.data;
  const map = new Array(W * H).fill(null);
  const bb  = computeBB(charCanvas);
  const frame = deriveBodyFrame(charCanvas, joints, bb);
  const { profiles } = buildRegionProfiles(joints, frame, bb, partDefs);
  const ids = partDefs.map(d => d.id);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] <= ALPHA) continue;

      let best = null;
      let bestScore = Infinity;

      for (const id of ids) {
        const profile = profiles[id];
        if (!profile) continue;
        const score = regionScore(x, y, id, profile, joints, frame, bb);
        if (score < bestScore) {
          bestScore = score;
          best = id;
        }
      }

      map[y * W + x] = best;
    }
  }

  return { map, W, H, srcData: img, frame, bb };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract one joint's pixels into its own canvas + compute anchor
// anchor = the joint position in the part-canvas's local pixel space
// ─────────────────────────────────────────────────────────────────────────────
export function extractParts(voronoi, joints, partDefs = JOINT_DEFS) {
  const { map, W, H, srcData } = voronoi;
  const d = srcData.data;
  const parts = {};

  for (const def of partDefs) {
    const id = def.id;
    // Find bounding box of this region
    let rx0=W, rx1=-1, ry0=H, ry1=-1, cnt=0;
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

    // Anchor = the chosen joint position in local canvas coords
    const sourceId = joints[id] ? id : (def.aliasOf || id);
    const srcJoint = joints[sourceId] || joints[def.parent] || null;
    if (!srcJoint) { parts[id] = null; continue; }
    const ax = srcJoint.x - rx0;
    const ay = srcJoint.y - ry0;

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
export function buildPuppet(charCanvas, joints, partDefs = JOINT_DEFS) {
  const bb      = computeBB(charCanvas);
  if (!bb) return null;
  const voronoi = buildVoronoi(charCanvas, joints, partDefs);
  const parts   = extractParts(voronoi, joints, partDefs);
  const groundY = bb.y + bb.h - 1;
  return { parts, joints, bb, groundY, voronoi };
}
