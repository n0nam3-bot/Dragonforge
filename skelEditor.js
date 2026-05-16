// skelEditor.js — image + mask editor + draggable joints + lasso/wand selection

import { JOINT_DEFS, polygonMaskFromPoints, floodFillMask } from './bodyDetect.js';

const HANDLE_R = 7;
const HIT_R = 12;

export class SkelEditor {
  constructor(canvas, sourceCanvas, joints, parts, onJointsChanged, onPartsChanged) {
    this.canvas = canvas;
    this.sourceCanvas = sourceCanvas;
    this.joints = JSON.parse(JSON.stringify(joints));
    this.parts = parts;
    this.onJointsChanged = onJointsChanged;
    this.onPartsChanged = onPartsChanged;
    this.selectedPartId = parts.find(p => p.enabled !== false)?.id ?? null;
    this.mode = 'joint';
    this.showRegions = true;
    this.showSkeleton = true;
    this._dragJoint = null;
    this._hoverJoint = null;
    this._lasso = null;
    this._wandSeed = null;

    this._onDown = this._pointerDown.bind(this);
    this._onMove = this._pointerMove.bind(this);
    this._onUp = this._pointerUp.bind(this);

    canvas.addEventListener('mousedown', this._onDown);
    canvas.addEventListener('touchstart', this._onDown, { passive: false });
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('touchmove', this._onMove, { passive: false });
    window.addEventListener('mouseup', this._onUp);
    window.addEventListener('touchend', this._onUp);

    this.draw();
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this._onDown);
    this.canvas.removeEventListener('touchstart', this._onDown);
    window.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('touchmove', this._onMove);
    window.removeEventListener('mouseup', this._onUp);
    window.removeEventListener('touchend', this._onUp);
  }

  setMode(mode) { this.mode = mode; this._lasso = null; this._wandSeed = null; this.draw(); }
  setSelectedPart(id) { this.selectedPartId = id; this.draw(); }
  setShowRegions(v) { this.showRegions = v; this.draw(); }
  setShowSkeleton(v) { this.showSkeleton = v; this.draw(); }
  setParts(parts) { this.parts = parts; this.draw(); }
  getParts() { return this.parts; }
  getJoints() { return JSON.parse(JSON.stringify(this.joints)); }
  resetJoints(defaultJoints) { this.joints = JSON.parse(JSON.stringify(defaultJoints)); this.onJointsChanged(this.getJoints()); this.draw(); }

  _fitTransform() {
    const W = this.canvas.width, H = this.canvas.height;
    const srcW = this.sourceCanvas.width, srcH = this.sourceCanvas.height;
    const scale = Math.min(W / srcW, H / srcH) * 0.96;
    const ox = (W - srcW * scale) * 0.5;
    const oy = (H - srcH * scale) * 0.5;
    return { scale, ox, oy };
  }

  _toSrc(evt) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (evt.clientY - rect.top) * (this.canvas.height / rect.height);
    const { scale, ox, oy } = this._fitTransform();
    return { x: (x - ox) / scale, y: (y - oy) / scale };
  }

  _hitJoint(x, y) {
    const keys = Object.keys(this.joints);
    for (let i = keys.length - 1; i >= 0; i--) {
      const id = keys[i];
      const j = this.joints[id];
      const dx = x - j.x, dy = y - j.y;
      if (dx * dx + dy * dy <= HIT_R * HIT_R) return id;
    }
    return null;
  }

  _pointerDown(e) {
    e.preventDefault();
    const p = this._toSrc(e.touches ? e.touches[0] : e);
    if (this.mode === 'lasso') {
      this._lasso = { points: [p], active: true };
      this.draw();
      return;
    }
    if (this.mode === 'wand') {
      this._wandSeed = p;
      this.draw();
      return;
    }
    const id = this._hitJoint(p.x, p.y);
    if (id) {
      const j = this.joints[id];
      this._dragJoint = { id, offX: j.x - p.x, offY: j.y - p.y };
      this.draw();
    }
  }

  _pointerMove(e) {
    const p = this._toSrc(e.touches ? e.touches[0] : e);
    if (this._dragJoint) {
      const j = this.joints[this._dragJoint.id];
      j.x = p.x + this._dragJoint.offX;
      j.y = p.y + this._dragJoint.offY;
      this.onJointsChanged(this.getJoints());
      this.draw();
      return;
    }
    if (this._lasso?.active) {
      const pts = this._lasso.points;
      const last = pts[pts.length - 1];
      const dx = p.x - last.x, dy = p.y - last.y;
      if (dx * dx + dy * dy > 6) pts.push(p);
      this.draw();
      return;
    }
    const id = this._hitJoint(p.x, p.y);
    if (id !== this._hoverJoint) {
      this._hoverJoint = id;
      this.canvas.style.cursor = id ? 'grab' : (this.mode === 'lasso' ? 'crosshair' : 'default');
      this.draw();
    }
  }

  _pointerUp(e) {
    if (this._dragJoint) {
      this._dragJoint = null;
      this.draw();
      return;
    }
    if (this._lass?.active) {
      const pts = this._lass.points;
      this._lass.active = false;
      if (pts.length >= 3 && this.selectedPartId) {
        const part = this.parts.find(p => p.id === this.selectedPartId);
        if (part) {
          part.maskCanvas = polygonMaskFromPoints(this.sourceCanvas, pts);
          part.enabled = true;
          if (!part.anchorPoint) part.anchorPoint = { x: part.maskCanvas.width * 0.5, y: part.maskCanvas.height * 0.5 };
          this.onPartsChanged(this.parts);
        }
      }
      this._lass = null;
      this.draw();
      return;
    }
    if (this._wandSeed && this.selectedPartId) {
      const part = this.parts.find(p => p.id === this.selectedPartId);
      if (part) {
        part.maskCanvas = floodFillMask(this.sourceCanvas, Math.round(this._wandSeed.x), Math.round(this._wandSeed.y), 42);
        part.enabled = true;
        if (!part.anchorPoint) part.anchorPoint = { x: part.maskCanvas.width * 0.5, y: part.maskCanvas.height * 0.5 };
        this.onPartsChanged(this.parts);
      }
      this._wandSeed = null;
      this.draw();
    }
  }

  draw() {
    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;
    const { scale, ox, oy } = this._fitTransform();
    ctx.clearRect(0, 0, W, H);

    // Background checker
    ctx.save();
    ctx.fillStyle = '#131722';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Source image
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.sourceCanvas, ox, oy, this.sourceCanvas.width * scale, this.sourceCanvas.height * scale);
    ctx.restore();

    // Mask overlays
    if (this.showRegions) {
      for (const part of this.parts) {
        if (!part.maskCanvas) continue;
        ctx.save();
        ctx.globalAlpha = part.id === this.selectedPartId ? 0.42 : 0.22;
        ctx.drawImage(part.maskCanvas, ox, oy, part.maskCanvas.width * scale, part.maskCanvas.height * scale);
        ctx.restore();
      }
    }

    // Lasso preview
    if (this._lass?.points?.length) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const pts = this._lass.points;
      const p0 = pts[0];
      ctx.moveTo(p0.x * scale + ox, p0.y * scale + oy);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * scale + ox, pts[i].y * scale + oy);
      ctx.stroke();
      ctx.restore();
    }

    if (this._wandSeed) {
      ctx.save();
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(this._wandSeed.x * scale + ox, this._wandSeed.y * scale + oy, 10, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    if (!this.showSkeleton) return;

    // Bones
    for (const def of JOINT_DEFS) {
      if (!def.parent) continue;
      const a = this.joints[def.id];
      const b = this.joints[def.parent];
      if (!a || !b) continue;
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x * scale + ox, a.y * scale + oy); ctx.lineTo(b.x * scale + ox, b.y * scale + oy); ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x * scale + ox, a.y * scale + oy); ctx.lineTo(b.x * scale + ox, b.y * scale + oy); ctx.stroke();
      ctx.restore();
    }

    // Joint handles
    for (const def of JOINT_DEFS) {
      const j = this.joints[def.id];
      if (!j) continue;
      const x = j.x * scale + ox;
      const y = j.y * scale + oy;
      const isHover = this._hoverJoint === def.id;
      const isDrag = this._dragJoint?.id === def.id;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, HANDLE_R + (isHover || isDrag ? 2 : 0), 0, Math.PI * 2);
      ctx.fillStyle = '#000'; ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, HANDLE_R - 1, 0, Math.PI * 2);
      ctx.fillStyle = def.color; ctx.fill();
      if (isHover || isDrag) {
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillText(def.label, x, y - 11);
      }
      ctx.restore();
    }

    // Selected part label
    if (this.selectedPartId) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(12, 12, 240, 34);
      ctx.fillStyle = '#fff';
      ctx.font = '600 14px sans-serif';
      ctx.fillText(`Editing: ${this.selectedPartId} · ${this.mode.toUpperCase()}`, 22, 34);
      ctx.restore();
    }
  }
}
