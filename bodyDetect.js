// bodyDetect.js
// Uses BONE-SEGMENT Voronoi: every foreground pixel is assigned to the
// nearest *bone line segment* rather than the nearest joint point.
// This correctly handles limbs, weapons, and hair that extend away from
// the body — a sword tip is always nearest to the arm segment, not hips.

const ALPHA = 18;

// ── Joint catalogue ───────────────────────────────────────────────────────────
export const JOINT_DEFS = [
  { id:'hair',  label:'Hair',    color:'#a78bfa', parent: null    },
  { id:'head',  label:'Head',    color:'#60d4f0', parent:'hair'   },
  { id:'neck',  label:'Neck',    color:'#f0e060', parent:'head'   },
  { id:'torso', label:'Torso',   color:'#4ade80', parent:'neck'   },
  { id:'hips',  label:'Hips',    color:'#60a5fa', parent:'torso'  },
  { id:'armL',  label:'Arm L',   color:'#f59e0b', parent:'torso'  },
  { id:'armR',  label:'Arm R',   color:'#fb923c', parent:'torso'  },
  { id:'legL',  label:'Leg L',   color:'#f87171', parent:'hips'   },
  { id:'legR',  label:'Leg R',   color:'#c084fc', parent:'hips'   },
];

// ── Bone segments for Voronoi ─────────────────────────────────────────────────
// Each entry says "pixels closest to the segment from→to belong to region".
// Order matters for tiebreaking; more specific bones come first.
export const BONE_SEGS = [
  { region:'hair',  from:'hair',  to:'head'  },
  { region:'head',  from:'head',  to:'neck'  },
  { region:'armL',  from:'torso', to:'armL'  },
  { region:'armR',  from:'torso', to:'armR'  },
  { region:'legL',  from:'hips',  to:'legL'  },
  { region:'legR',  from:'hips',  to:'legR'  },
  { region:'torso', from:'neck',  to:'torso' },
  { region:'hips',  from:'torso', to:'hips'  },
];

// ── Squared distance from point (px,py) to segment (ax,ay)→(bx,by) ──────────
function ptSegDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx*dx + dy*dy;
  if (len2 < 0.01) {
    const ex = px-ax, ey = py-ay;
    return ex*ex + ey*ey;
  }
  const t  = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / len2));
  const nx = px - (ax + t*dx);
  const ny = py - (ay + t*dy);
  return nx*nx + ny*ny;
}

// ── Compute bounding box ──────────────────────────────────────────────────────
export function computeBB(charCanvas) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const d   = ctx.getImageData(0, 0, W, H).data;
  let x0=W,x1=0,y0=H,y1=0;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
    if (d[(y*W+x)*4+3]>ALPHA){
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
    }
  }
  if (x0>x1) return null;
  return {x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
}

// ── Auto-place joints for a side-scrolling (slightly turned) character ────────
// Uses alpha-weighted column centroids to detect which side has more mass
// (front arm side) vs less mass (back arm side).
export function autoPlaceJoints(charCanvas, bb) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const d   = ctx.getImageData(0, 0, W, H).data;

  const { x:bx, y:by, w:bw, h:bh } = bb;
  const cx = bx + bw * 0.5;  // geometric centre X

  // Row profiles: alpha-weighted centroid X per row
  const cxRow = new Float32Array(H);
  const wRow  = new Float32Array(H);
  for (let y=by;y<by+bh;y++){
    let sumX=0,sumA=0;
    for (let x=bx;x<bx+bw;x++){
      const a=d[(y*W+x)*4+3];
      if(a>ALPHA){sumX+=x*a;sumA+=a;}
    }
    if(sumA>0){cxRow[y]=sumX/sumA;wRow[y]=sumA;}
  }

  // Smooth centroid
  const smCx = new Float32Array(H);
  const WIN=7;
  for (let y=by;y<by+bh;y++){
    let s=0,n=0;
    for(let j=Math.max(by,y-WIN);j<=Math.min(by+bh-1,y+WIN);j++){if(wRow[j]>0){s+=cxRow[j];n++;}}
    smCx[y]=n>0?s/n:cx;
  }

  // Helper: row fraction → absolute Y
  const ry = f => Math.round(by + bh * f);
  // Centroid X at a given row
  const rcx = y => smCx[clamp(y,by,by+bh-1)] || cx;

  // Detect which horizontal side has more mass in the arm zone (rows 25–55%)
  const armZoneTop = ry(0.25), armZoneBot = ry(0.55);
  let leftMass=0, rightMass=0;
  for(let y=armZoneTop;y<=armZoneBot;y++){
    for(let x=bx;x<bx+bw;x++){
      const a=d[(y*W+x)*4+3];
      if(a>ALPHA){if(x<rcx(y))leftMass+=a;else rightMass+=a;}
    }
  }
  // "front" side (more mass = sword arm) is the dominant side
  const frontIsRight = rightMass >= leftMass;

  // Shoulder width estimate: trimmed width at shoulder row
  const shoulderY = ry(0.30);
  let tl=bx+bw,tr=bx,tcnt=0;
  for(let x=bx;x<bx+bw;x++){
    const a=d[(shoulderY*W+x)*4+3];
    if(a>ALPHA){if(x<tl)tl=x;if(x>tr)tr=x;tcnt++;}
  }
  const sw = tr-tl+1;
  const shCX = rcx(shoulderY);

  // Hip width estimate
  const hipY = ry(0.60);
  let hl=bx+bw,hr=bx;
  for(let x=bx;x<bx+bw;x++){
    if(d[(hipY*W+x)*4+3]>ALPHA){if(x<hl)hl=x;if(x>hr)hr=x;}
  }
  const hw = hr-hl+1;
  const hCX = rcx(hipY);

  // Leg split Y: first significant density drop below hips
  let legSplitY = ry(0.70);
  for(let y=ry(0.62);y<ry(0.82);y++){
    let cnt=0;
    for(let x=bx;x<bx+bw;x++) if(d[(y*W+x)*4+3]>ALPHA) cnt++;
    if(cnt < bw*0.35){legSplitY=y;break;}
  }

  // Front/back arm X offsets
  const frontArmX = frontIsRight ? shCX + sw*0.36 : shCX - sw*0.36;
  const backArmX  = frontIsRight ? shCX - sw*0.28 : shCX + sw*0.28;

  // Front arm sits lower (holding weapon at ~45% height)
  const frontArmY = ry(0.52);
  const backArmY  = ry(0.42);

  // Legs: front leg extends further in facing direction
  const frontLegX = frontIsRight ? hCX + hw*0.18 : hCX - hw*0.18;
  const backLegX  = frontIsRight ? hCX - hw*0.14 : hCX + hw*0.14;

  return {
    hair:  { x: rcx(ry(0.04)),  y: ry(0.03) },
    head:  { x: rcx(ry(0.13)),  y: ry(0.13) },
    neck:  { x: rcx(ry(0.24)),  y: ry(0.24) },
    torso: { x: rcx(ry(0.38)),  y: ry(0.38) },
    hips:  { x: hCX,            y: ry(0.57) },
    armL:  { x: frontIsRight ? backArmX : frontArmX,
             y: frontIsRight ? backArmY : frontArmY },
    armR:  { x: frontIsRight ? frontArmX : backArmX,
             y: frontIsRight ? frontArmY : backArmY },
    legL:  { x: frontIsRight ? backLegX : frontLegX,  y: ry(0.80) },
    legR:  { x: frontIsRight ? frontLegX : backLegX,  y: ry(0.80) },
  };
}

// ── Build Voronoi map using bone-segment distance ─────────────────────────────
export function buildVoronoi(charCanvas, joints) {
  const W = charCanvas.width, H = charCanvas.height;
  const ctx = charCanvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, W, H);
  const d   = imgData.data;
  const map = new Array(W * H).fill(null);

  for (let y=0;y<H;y++) {
    for (let x=0;x<W;x++) {
      if (d[(y*W+x)*4+3]<=ALPHA) continue;
      let best=null, bestD=Infinity;
      for (const seg of BONE_SEGS) {
        const a = joints[seg.from], b = joints[seg.to];
        if (!a||!b) continue;
        const d2 = ptSegDist2(x, y, a.x, a.y, b.x, b.y);
        if (d2 < bestD) { bestD=d2; best=seg.region; }
      }
      map[y*W+x] = best;
    }
  }
  return { map, W, H, srcData: imgData };
}

// ── Extract each region into its own canvas ───────────────────────────────────
export function extractParts(voronoi, joints) {
  const { map, W, H, srcData } = voronoi;
  const d = srcData.data;
  const parts = {};

  for (const def of JOINT_DEFS) {
    const id = def.id;
    let rx0=W,rx1=0,ry0=H,ry1=0,cnt=0;
    for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
      if (map[y*W+x]!==id) continue;
      if(x<rx0)rx0=x;if(x>rx1)rx1=x;if(y<ry0)ry0=y;if(y>ry1)ry1=y;cnt++;
    }
    if (cnt<2||rx0>rx1) { parts[id]=null; continue; }

    const pw=rx1-rx0+1, ph=ry1-ry0+1;
    const pc=document.createElement('canvas');
    pc.width=pw; pc.height=ph;
    const pCtx=pc.getContext('2d');
    const pImg=pCtx.createImageData(pw,ph);
    const pd=pImg.data;

    for (let y=ry0;y<=ry1;y++) for (let x=rx0;x<=rx1;x++) {
      if (map[y*W+x]!==id) continue;
      const si=(y*W+x)*4, di=((y-ry0)*pw+(x-rx0))*4;
      pd[di]=d[si];pd[di+1]=d[si+1];pd[di+2]=d[si+2];pd[di+3]=d[si+3];
    }
    pCtx.putImageData(pImg,0,0);

    // Anchor = joint position in local canvas coords
    const j  = joints[id];
    const ax = j ? j.x-rx0 : pw*0.5;
    const ay = j ? j.y-ry0 : ph*0.5;

    parts[id] = {
      canvas:  pc,
      anchorX: Math.max(0,Math.min(pw-1,Math.round(ax))),
      anchorY: Math.max(0,Math.min(ph-1,Math.round(ay))),
      srcX: rx0, srcY: ry0, w: pw, h: ph,
    };
  }
  return parts;
}

// ── Build final puppet ────────────────────────────────────────────────────────
export function buildPuppet(charCanvas, joints) {
  const bb = computeBB(charCanvas);
  if (!bb) return null;
  const voronoi = buildVoronoi(charCanvas, joints);
  const parts   = extractParts(voronoi, joints);
  return { parts, joints, bb, groundY: bb.y+bb.h-1, voronoi };
}

const clamp = (v,lo,hi)=>v<lo?lo:v>hi?hi:v;
