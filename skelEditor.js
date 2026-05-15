// skelEditor.js — Interactive skeleton editor
// Renders the character with a region overlay + draggable joint handles.
// Supports optional manual mask painting for exact part selection.

import { JOINT_DEFS, buildVoronoi } from './bodyDetect.js';

const JOINT_RADIUS = 9;    // px hit radius for dragging
const HANDLE_R     = 7;    // drawn handle radius

export class SkelEditor {
  /**
   * @param {HTMLCanvasElement} canvas  — the editor canvas element
   * @param {HTMLCanvasElement} charCanvas — bg-removed character
   * @param {object} joints  — { id: {x,y} } in SOURCE (charCanvas) pixel space
   * @param {function} onJointsChanged
   * @param {Array} partDefs
   * @param {object} partMasks
   * @param {function} onMasksChanged
   */
  constructor(canvas, charCanvas, joints, onJointsChanged, partDefs = JOINT_DEFS, partMasks = {}, onMasksChanged = null) {
    this.canvas          = canvas;
    this.charCanvas      = charCanvas;
    this.joints          = JSON.parse(JSON.stringify(joints)); // deep copy
    this.onJointsChanged = onJointsChanged;
    this.onMasksChanged  = onMasksChanged || (() => {});
    this.partDefs        = partDefs;
    this.partMasks       = partMasks || {};
    this.showRegions     = true;
    this.showSkeleton    = true;

    // Paint mode state
    this.paintMode   = false;
    this.paintPartId = null;
    this.paintErase  = false;
    this.brushSize   = 20;
    this._painting   = false;

    // Derived from charCanvas
    this.srcW = charCanvas.width;
    this.srcH = charCanvas.height;

    // Cached region overlay (ImageData at source resolution)
    this._voronoiOverlay = null;
    this._buildOverlay();

    // Drag state
    this._drag    = null;   // { id, offsetX, offsetY }
    this._hoverId = null;

    // Event listeners
    this._onDown = this._pointerDown.bind(this);
    this._onMove = this._pointerMove.bind(this);
    this._onUp   = this._pointerUp.bind(this);

    canvas.addEventListener('mousedown',  this._onDown);
    canvas.addEventListener('touchstart', this._onDown, { passive: false });
    window.addEventListener('mousemove',  this._onMove);
    window.addEventListener('touchmove',   this._onMove, { passive: false });
    window.addEventListener('mouseup',    this._onUp);
    window.addEventListener('touchend',   this._onUp);

    this.draw();
  }

  destroy() {
    this.canvas.removeEventListener('mousedown',  this._onDown);
    this.canvas.removeEventListener('touchstart', this._onDown);
    window.removeEventListener('mousemove',  this._onMove);
    window.removeEventListener('touchmove',   this._onMove);
    window.removeEventListener('mouseup',    this._onUp);
    window.removeEventListener('touchend',   this._onUp);
  }

  setShowRegions(v)  { this.showRegions = v; this.draw(); }
  setShowSkeleton(v) { this.showSkeleton = v; this.draw(); }

  setPaintOptions({ enabled = false, partId = null, erase = false, brushSize = 20 } = {}) {
    this.paintMode   = !!enabled;
    this.paintPartId = partId || null;
    this.paintErase  = !!erase;
    this.brushSize   = brushSize;
    this.canvas.style.cursor = this.paintMode && this.paintPartId ? 'crosshair' : 'grab';
  }

  setMasks(partMasks) {
    this.partMasks = partMasks || {};
    this._buildOverlay();
    this.draw();
  }

  // Rebuild the region overlay at source resolution
  _buildOverlay() {
    const W = this.srcW, H = this.srcH;
    const colorMap = {};
    for (const def of this.partDefs) colorMap[def.id] = _hexToRgb(def.color);

    const voro = buildVoronoi(this.charCanvas, this.joints, this.partDefs, this.partMasks);
    const { map } = voro;
    const charData = this.charCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H);

    const ol = new ImageData(W, H);
    const od = ol.data;
    const cd = charData.data;

    for (let i = 0; i < W * H; i++) {
      const a = cd[i * 4 + 3];
      if (a < 18) continue;
      const id = map[i];
      const color = id ? colorMap[id] : { r: 128, g: 128, b: 128 };
      od[i * 4]     = color.r;
      od[i * 4 + 1] = color.g;
      od[i * 4 + 2] = color.b;
      od[i * 4 + 3] = 160;
    }

    const oc = document.createElement('canvas');
    oc.width = W; oc.height = H;
    oc.getContext('2d').putImageData(ol, 0, 0);
    this._voronoiOverlay = oc;
  }

  _fitTransform() {
    const dw = this.canvas.width, dh = this.canvas.height;
    const scale = Math.min(dw / this.srcW, dh / this.srcH) * 0.96;
    const ox = (dw - this.srcW * scale) / 2;
    const oy = (dh - this.srcH * scale) / 2;
    return { scale, ox, oy };
  }

  // Map canvas (display) coords → source image coords
  _toSrc(cx, cy) {
    const fit = this._fitTransform();
    return {
      x: (cx - fit.ox) / fit.scale,
      y: (cy - fit.oy) / fit.scale,
    };
  }

  _getPointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    const raw  = e.touches ? e.touches[0] : e;
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (raw.clientX - rect.left) * scaleX,
      y: (raw.clientY - rect.top)  * scaleY,
    };
  }

  _hitTest(cx, cy) {
    const fit = this._fitTransform();
    let bestId = null, bestD = Infinity;
    for (const [id, j] of Object.entries(this.joints)) {
      const dx = cx - (j.x * fit.scale + fit.ox);
      const dy = cy - (j.y * fit.scale + fit.oy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < JOINT_RADIUS * 1.6 && d < bestD) { bestD = d; bestId = id; }
    }
    return bestId;
  }

  _ensureMaskCanvas(id) {
    if (!this.partMasks[id]) {
      const c = document.createElement('canvas');
      c.width = this.srcW;
      c.height = this.srcH;
      this.partMasks[id] = c;
    }
    return this.partMasks[id];
  }

  _paintAt(cx, cy) {
    if (!this.paintPartId) return;
    const src = this._toSrc(cx, cy);
    const mask = this._ensureMaskCanvas(this.paintPartId);
    const mctx = mask.getContext('2d');
    mctx.save();
    mctx.globalCompositeOperation = this.paintErase ? 'destination-out' : 'source-over';
    mctx.fillStyle = '#fff';
    mctx.beginPath();
    mctx.arc(src.x, src.y, this.brushSize, 0, Math.PI * 2);
    mctx.fill();
    mctx.restore();
    this._buildOverlay();
    this.draw();
    this.onMasksChanged(this.partMasks);
  }

  _pointerDown(e) {
    e.preventDefault();
    const p = this._getPointer(e);

    if (this.paintMode && this.paintPartId) {
      this._painting = true;
      this._paintAt(p.x, p.y);
      return;
    }

    const id = this._hitTest(p.x, p.y);
    if (!id) return;
    const fit = this._fitTransform();
    this._drag = {
      id,
      offX: p.x - (this.joints[id].x * fit.scale + fit.ox),
      offY: p.y - (this.joints[id].y * fit.scale + fit.oy),
    };
    this.canvas.style.cursor = 'grabbing';
  }

  _pointerMove(e) {
    if (e.touches) e.preventDefault();
    const p = this._getPointer(e);

    if (this._painting) {
      this._paintAt(p.x, p.y);
      return;
    }

    if (this._drag) {
      const fit = this._fitTransform();
      const newX = (p.x - this._drag.offX - fit.ox) / fit.scale;
      const newY = (p.y - this._drag.offY - fit.oy) / fit.scale;
      this.joints[this._drag.id].x = Math.max(0, Math.min(this.srcW - 1, newX));
      this.joints[this._drag.id].y = Math.max(0, Math.min(this.srcH - 1, newY));
      this._buildOverlay();
      this.draw();
      this.onJointsChanged(this.joints);
    } else {
      const id = this._hitTest(p.x, p.y);
      if (id !== this._hoverId) {
        this._hoverId = id;
        this.canvas.style.cursor = this.paintMode && this.paintPartId ? 'crosshair' : (id ? 'grab' : 'crosshair');
        this.draw();
      }
    }
  }

  _pointerUp() {
    this._drag = null;
    this._painting = false;
    this.canvas.style.cursor = this.paintMode && this.paintPartId ? 'crosshair' : (this._hoverId ? 'grab' : 'crosshair');
  }

  draw() {
    const c = this.canvas;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    const fit = this._fitTransform();
    const { scale, ox, oy } = fit;

    ctx.clearRect(0, 0, W, H);

    // 1. Character image
    ctx.save();
    ctx.globalAlpha = this.showRegions ? 0.55 : 1.0;
    ctx.drawImage(this.charCanvas, ox, oy, this.srcW * scale, this.srcH * scale);
    ctx.restore();

    // 2. Region overlay
    if (this.showRegions && this._voronoiOverlay) {
      ctx.save();
      ctx.globalAlpha = 0.58;
      ctx.drawImage(this._voronoiOverlay, ox, oy, this.srcW * scale, this.srcH * scale);
      ctx.restore();
    }

    // 3. Mask preview overlay (manual painted regions)
    const painted = Object.entries(this.partMasks).filter(([, mask]) => mask && mask.width && mask.height);
    if (painted.length) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      for (const [id, mask] of painted) {
        const def = this.partDefs.find(d => d.id === id);
        if (!def) continue;
        ctx.fillStyle = def.color;
        ctx.drawImage(mask, ox, oy, this.srcW * scale, this.srcH * scale);
      }
      ctx.restore();
    }

    if (!this.showSkeleton) return;

    // 4. Skeleton bones
    for (const def of JOINT_DEFS) {
      if (!def.parent) continue;
      const a = this.joints[def.id];
      const b = this.joints[def.parent];
      if (!a || !b) continue;
      const ax = a.x * scale + ox, ay = a.y * scale + oy;
      const bx = b.x * scale + ox, by = b.y * scale + oy;

      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth   = 4;
      ctx.lineCap     = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.restore();
    }

    // 5. Joint handles
    for (const def of this.partDefs) {
      const j = this.joints[def.id] || this.joints[def.aliasOf] || this.joints[def.parent];
      if (!j) continue;
      const jx = j.x * scale + ox;
      const jy = j.y * scale + oy;
      const isHover = def.id === this._hoverId;
      const isDrag  = this._drag?.id === def.id;

      ctx.save();
      ctx.beginPath();
      ctx.arc(jx, jy, HANDLE_R + (isDrag ? 3 : isHover ? 2 : 0), 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(jx, jy, HANDLE_R - 1 + (isDrag ? 2 : 0), 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();
      if (isHover || isDrag) {
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 3;
        ctx.fillText(def.label, jx, jy - HANDLE_R - 4);
      }
      ctx.restore();
    }
  }

  getJoints() { return JSON.parse(JSON.stringify(this.joints)); }

  resetJoints(defaultJoints) {
    this.joints = JSON.parse(JSON.stringify(defaultJoints));
    this._buildOverlay();
    this.draw();
    this.onJointsChanged(this.joints);
  }
}

function _hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}
