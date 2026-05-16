// skelEditor.js — Interactive skeleton editor with bone-segment Voronoi
// Shows character + coloured region overlay + draggable joint handles.
// Regions are computed from bone segments, not joint points, so weapons
// and extended limbs always fall into the correct region.

import { JOINT_DEFS, BONE_SEGS, buildVoronoi } from './bodyDetect.js';

const HANDLE_R  = 8;   // drawn radius of joint handle
const HIT_R     = 14;  // click/touch hit radius

export class SkelEditor {
  constructor(canvas, charCanvas, joints, onJointsChanged) {
    this.canvas          = canvas;
    this.charCanvas      = charCanvas;
    this.joints          = deepCopy(joints);
    this.onJointsChanged = onJointsChanged;
    this.showRegions     = true;
    this.showSkeleton    = true;
    this.srcW            = charCanvas.width;
    this.srcH            = charCanvas.height;
    this._overlay        = null;
    this._drag           = null;
    this._hoverId        = null;
    this._colorMap       = {};
    for (const d of JOINT_DEFS) this._colorMap[d.id] = _hexToRgb(d.color);

    this._rebuildOverlay();

    // Bind events
    this._onDown  = this._pointerDown.bind(this);
    this._onMove  = this._pointerMove.bind(this);
    this._onUp    = this._pointerUp.bind(this);
    canvas.addEventListener('mousedown',  this._onDown);
    canvas.addEventListener('touchstart', this._onDown, { passive: false });
    window.addEventListener('mousemove',  this._onMove);
    window.addEventListener('touchmove',  this._onMove, { passive: false });
    window.addEventListener('mouseup',    this._onUp);
    window.addEventListener('touchend',   this._onUp);

    this.draw();
  }

  destroy() {
    this.canvas.removeEventListener('mousedown',  this._onDown);
    this.canvas.removeEventListener('touchstart', this._onDown);
    window.removeEventListener('mousemove',  this._onMove);
    window.removeEventListener('touchmove',  this._onMove);
    window.removeEventListener('mouseup',    this._onUp);
    window.removeEventListener('touchend',   this._onUp);
  }

  setShowRegions(v)  { this.showRegions  = v; this.draw(); }
  setShowSkeleton(v) { this.showSkeleton = v; this.draw(); }
  getJoints()        { return deepCopy(this.joints); }

  resetJoints(defaultJoints) {
    this.joints = deepCopy(defaultJoints);
    this._rebuildOverlay();
    this.draw();
    this.onJointsChanged(this.joints);
  }

  // ── Build the Voronoi colour overlay at source resolution ──────────────────
  _rebuildOverlay() {
    const W = this.srcW, H = this.srcH;
    const voro = buildVoronoi(this.charCanvas, this.joints);
    const { map } = voro;
    const cd   = this.charCanvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data;
    const ol   = new ImageData(W, H);
    const od   = ol.data;

    for (let i=0;i<W*H;i++) {
      if (cd[i*4+3] < 18) continue;
      const id    = map[i];
      const color = id ? this._colorMap[id] : {r:100,g:100,b:100};
      od[i*4]   = color.r;
      od[i*4+1] = color.g;
      od[i*4+2] = color.b;
      od[i*4+3] = 155;
    }

    const oc = document.createElement('canvas');
    oc.width = W; oc.height = H;
    oc.getContext('2d').putImageData(ol, 0, 0);
    this._overlay = oc;
  }

  // ── Coordinate transforms ──────────────────────────────────────────────────
  _fit() {
    const dw = this.canvas.width, dh = this.canvas.height;
    const scale = Math.min(dw/this.srcW, dh/this.srcH) * 0.96;
    return { scale, ox:(dw-this.srcW*scale)/2, oy:(dh-this.srcH*scale)/2 };
  }

  _ptr(e) {
    const r  = this.canvas.getBoundingClientRect();
    const raw= e.touches ? e.touches[0] : e;
    const sx = this.canvas.width  / r.width;
    const sy = this.canvas.height / r.height;
    return { x:(raw.clientX-r.left)*sx, y:(raw.clientY-r.top)*sy };
  }

  _hit(cx,cy) {
    const { scale, ox, oy } = this._fit();
    let bestId=null, bestD=Infinity;
    for (const [id,j] of Object.entries(this.joints)) {
      const dx=cx-(j.x*scale+ox), dy=cy-(j.y*scale+oy);
      const d=Math.sqrt(dx*dx+dy*dy);
      if (d<HIT_R && d<bestD) { bestD=d; bestId=id; }
    }
    return bestId;
  }

  // ── Pointer events ─────────────────────────────────────────────────────────
  _pointerDown(e) {
    e.preventDefault();
    const p  = this._ptr(e);
    const id = this._hit(p.x, p.y);
    if (!id) return;
    const { scale, ox, oy } = this._fit();
    this._drag = { id,
      offX: p.x-(this.joints[id].x*scale+ox),
      offY: p.y-(this.joints[id].y*scale+oy) };
    this.canvas.style.cursor = 'grabbing';
  }

  _pointerMove(e) {
    if (e.touches) e.preventDefault();
    const p = this._ptr(e);
    if (this._drag) {
      const { scale, ox, oy } = this._fit();
      const nx = (p.x - this._drag.offX - ox) / scale;
      const ny = (p.y - this._drag.offY - oy) / scale;
      this.joints[this._drag.id].x = Math.max(0,Math.min(this.srcW-1,nx));
      this.joints[this._drag.id].y = Math.max(0,Math.min(this.srcH-1,ny));
      this._rebuildOverlay();
      this.draw();
      this.onJointsChanged(this.joints);
    } else {
      const id = this._hit(p.x, p.y);
      if (id !== this._hoverId) {
        this._hoverId = id;
        this.canvas.style.cursor = id ? 'grab' : 'crosshair';
        this.draw();
      }
    }
  }

  _pointerUp() {
    this._drag = null;
    this.canvas.style.cursor = this._hoverId ? 'grab' : 'crosshair';
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  draw() {
    const c   = this.canvas;
    const ctx = c.getContext('2d');
    const { scale, ox, oy } = this._fit();
    const sw = this.srcW * scale, sh = this.srcH * scale;

    ctx.clearRect(0, 0, c.width, c.height);

    // 1. Character (dimmed when regions visible)
    ctx.save();
    ctx.globalAlpha = this.showRegions ? 0.50 : 1.0;
    ctx.drawImage(this.charCanvas, ox, oy, sw, sh);
    ctx.restore();

    // 2. Voronoi region overlay
    if (this.showRegions && this._overlay) {
      ctx.save();
      ctx.globalAlpha = 0.60;
      ctx.drawImage(this._overlay, ox, oy, sw, sh);
      ctx.restore();
    }

    if (!this.showSkeleton) return;

    // 3. Bone segments
    for (const seg of BONE_SEGS) {
      const a = this.joints[seg.from], b = this.joints[seg.to];
      if (!a||!b) continue;
      const ax=a.x*scale+ox, ay=a.y*scale+oy;
      const bx=b.x*scale+ox, by=b.y*scale+oy;
      // thick black outline
      ctx.save();
      ctx.strokeStyle='rgba(0,0,0,0.7)'; ctx.lineWidth=5; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
      // white centre line
      ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
      ctx.restore();
    }

    // 4. Joint handles
    for (const def of JOINT_DEFS) {
      const j = this.joints[def.id];
      if (!j) continue;
      const jx=j.x*scale+ox, jy=j.y*scale+oy;
      const isHov = def.id===this._hoverId;
      const isDrg = this._drag?.id===def.id;
      const r     = HANDLE_R + (isDrg?3:isHov?2:0);

      ctx.save();
      // drop shadow
      ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=4;
      // outer black ring
      ctx.beginPath(); ctx.arc(jx,jy,r+2,0,Math.PI*2);
      ctx.fillStyle='#111'; ctx.fill();
      // coloured fill
      ctx.shadowBlur=0;
      ctx.beginPath(); ctx.arc(jx,jy,r,0,Math.PI*2);
      ctx.fillStyle=def.color; ctx.fill();
      // white dot centre
      ctx.beginPath(); ctx.arc(jx,jy,r*0.35,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.fill();

      // floating label
      if (isHov || isDrg) {
        ctx.font      = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(def.label, jx+1, jy-r-5);
        ctx.fillStyle = '#fff';
        ctx.fillText(def.label, jx,   jy-r-6);
      }
      ctx.restore();
    }
  }
}

function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }
function _hexToRgb(hex) {
  return {
    r:parseInt(hex.slice(1,3),16),
    g:parseInt(hex.slice(3,5),16),
    b:parseInt(hex.slice(5,7),16),
  };
}
