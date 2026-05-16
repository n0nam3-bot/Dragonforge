// skelEditor.js — manual source crop / pivot editor

import { clampRect, normalizeKind, partColor } from './bodyDetect.js';

const HANDLE_SIZE = 9;
const PIVOT_R = 7;

function fitContain(srcW, srcH, dstW, dstH) {
  const s = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { scale: s, x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

function cloneParts(parts) {
  return parts.map(p => ({
    ...structuredClone(p),
    srcRect: structuredClone(p.srcRect),
    pivotLocal: structuredClone(p.pivotLocal),
  }));
}

export class SkelEditor {
  constructor(canvas, sourceCanvas, parts = [], onChange = () => {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sourceCanvas = sourceCanvas;
    this.parts = cloneParts(parts);
    this.onChange = onChange;
    this.selectedId = parts[0]?.id ?? null;
    this.showSource = true;
    this.showGuides = true;
    this.drag = null;
    this.view = { scale: 1, x: 0, y: 0, w: 1, h: 1 };
    this._raf = 0;
    this._needsRender = true;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerLeave = this._onPointerUp.bind(this);
    this._onContextMenu = e => e.preventDefault();

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointerleave', this._onPointerLeave);
    canvas.addEventListener('contextmenu', this._onContextMenu);
    this.render();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
  }

  setSourceCanvas(sourceCanvas) {
    this.sourceCanvas = sourceCanvas;
    this.requestRender();
  }

  setParts(parts) {
    this.parts = cloneParts(parts);
    if (!this.parts.some(p => p.id === this.selectedId)) this.selectedId = this.parts[0]?.id ?? null;
    this.requestRender();
  }

  getParts() {
    return cloneParts(this.parts);
  }

  setSelectedPart(id) {
    this.selectedId = id;
    this.requestRender();
  }

  setShowSource(v) {
    this.showSource = !!v;
    this.requestRender();
  }

  setShowGuides(v) {
    this.showGuides = !!v;
    this.requestRender();
  }

  addPart(part) {
    this.parts.push(structuredClone(part));
    this.selectedId = part.id;
    this._commit();
  }

  deleteSelected() {
    if (!this.selectedId) return;
    const id = this.selectedId;
    const childIds = new Set(this.parts.filter(p => p.parentId === id).map(p => p.id));
    this.parts = this.parts.filter(p => p.id !== id && !childIds.has(p.id));
    this.selectedId = this.parts[0]?.id ?? null;
    this._commit();
  }

  duplicateSelected() {
    const src = this.parts.find(p => p.id === this.selectedId);
    if (!src) return;
    const copy = structuredClone(src);
    copy.id = crypto.randomUUID();
    copy.label = `${src.label} Copy`;
    copy.srcRect = { ...copy.srcRect, x: copy.srcRect.x + 12, y: copy.srcRect.y + 12 };
    this.parts.push(copy);
    this.selectedId = copy.id;
    this._commit();
  }

  moveLayer(delta) {
    if (!this.selectedId) return;
    const idx = this.parts.findIndex(p => p.id === this.selectedId);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= this.parts.length) return;
    const [item] = this.parts.splice(idx, 1);
    this.parts.splice(next, 0, item);
    this._commit();
  }

  updateSelected(patch) {
    const p = this.parts.find(x => x.id === this.selectedId);
    if (!p) return;
    Object.assign(p, patch);
    this._commit(false);
  }

  updatePart(id, patch) {
    const p = this.parts.find(x => x.id === id);
    if (!p) return;
    Object.assign(p, patch);
    this._commit(false);
  }

  resetParts(parts) {
    this.parts = cloneParts(parts);
    this.selectedId = this.parts[0]?.id ?? null;
    this._commit();
  }

  requestRender() {
    if (this._needsRender) return;
    this._needsRender = true;
    this._raf = requestAnimationFrame(() => this.render());
  }

  render() {
    this._needsRender = false;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    this._drawChecker(ctx, W, H);

    if (!this.sourceCanvas) return;

    this.view = fitContain(this.sourceCanvas.width, this.sourceCanvas.height, W, H);
    const { scale, x, y, w, h } = this.view;

    if (this.showSource) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.sourceCanvas, 0, 0, this.sourceCanvas.width, this.sourceCanvas.height, x, y, w, h);
      ctx.restore();
    }

    // guide outline around source image area
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();

    const ordered = [...this.parts].map((p, i) => ({ p, i })).sort((a, b) => a.i - b.i);
    const selected = this.parts.find(p => p.id === this.selectedId) || null;
    const selectedParent = selected?.parentId ? this.parts.find(p => p.id === selected.parentId) : null;

    if (this.showGuides) {
      for (const { p } of ordered) {
        const rect = p.srcRect;
        const rx = x + rect.x * scale;
        const ry = y + rect.y * scale;
        const rw = rect.w * scale;
        const rh = rect.h * scale;
        const isSel = p.id === this.selectedId;

        // draw parent link line
        if (p.parentId) {
          const parent = this.parts.find(x => x.id === p.parentId);
          if (parent) {
            const px = x + (parent.srcRect.x + parent.pivotLocal.x) * scale;
            const py = y + (parent.srcRect.y + parent.pivotLocal.y) * scale;
            const cx = x + (rect.x + p.pivotLocal.x) * scale;
            const cy = y + (rect.y + p.pivotLocal.y) * scale;
            ctx.save();
            ctx.strokeStyle = isSel ? 'rgba(97,213,255,.9)' : 'rgba(255,255,255,.18)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(cx, cy);
            ctx.stroke();
            ctx.restore();
          }
        }

        // overlay box
        ctx.save();
        ctx.fillStyle = isSel ? 'rgba(138,109,255,.14)' : 'rgba(97,213,255,.06)';
        ctx.strokeStyle = isSel ? 'rgba(138,109,255,.95)' : 'rgba(97,213,255,.5)';
        ctx.lineWidth = isSel ? 2 : 1;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);

        // pivot
        const px = x + (rect.x + p.pivotLocal.x) * scale;
        const py = y + (rect.y + p.pivotLocal.y) * scale;
        ctx.fillStyle = isSel ? 'rgba(255,191,82,.95)' : 'rgba(255,255,255,.85)';
        ctx.beginPath();
        ctx.arc(px, py, PIVOT_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.5)';
        ctx.stroke();

        // label
        ctx.fillStyle = 'rgba(10,14,25,.9)';
        const label = p.label || normalizeKind(p.kind);
        ctx.font = '12px var(--mono)';
        const tw = ctx.measureText(label).width + 10;
        ctx.fillRect(rx + 4, ry + 4, tw, 18);
        ctx.fillStyle = '#e7ebff';
        ctx.fillText(label, rx + 9, ry + 17);

        // handles only for selected
        if (isSel) this._drawHandles(ctx, rect, x, y, scale);
        ctx.restore();
      }
    } else if (selected) {
      const rect = selected.srcRect;
      const rx = x + rect.x * scale;
      const ry = y + rect.y * scale;
      const rw = rect.w * scale;
      const rh = rect.h * scale;
      ctx.save();
      ctx.strokeStyle = 'rgba(138,109,255,.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);
      const px = x + (rect.x + selected.pivotLocal.x) * scale;
      const py = y + (rect.y + selected.pivotLocal.y) * scale;
      ctx.fillStyle = 'rgba(255,191,82,.95)';
      ctx.beginPath(); ctx.arc(px, py, PIVOT_R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  _drawChecker(ctx, W, H) {
    const s = 18;
    for (let y = 0; y < H; y += s) {
      for (let x = 0; x < W; x += s) {
        ctx.fillStyle = ((x / s + y / s) & 1) ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.045)';
        ctx.fillRect(x, y, s, s);
      }
    }
  }

  _drawHandles(ctx, rect, ox, oy, scale) {
    const pts = this._handlePoints(rect, ox, oy, scale);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,.8)';
    for (const h of pts) {
      ctx.beginPath(); ctx.rect(h.x - 4, h.y - 4, 8, 8); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  _handlePoints(rect, ox, oy, scale) {
    const x = ox + rect.x * scale;
    const y = oy + rect.y * scale;
    const w = rect.w * scale;
    const h = rect.h * scale;
    return {
      nw: { x, y },
      ne: { x: x + w, y },
      sw: { x, y: y + h },
      se: { x: x + w, y: y + h },
      n: { x: x + w * 0.5, y },
      s: { x: x + w * 0.5, y: y + h },
      w: { x, y: y + h * 0.5 },
      e: { x: x + w, y: y + h * 0.5 },
    };
  }

  _commit(sync = true) {
    if (sync) this.onChange(cloneParts(this.parts));
    else this.onChange(cloneParts(this.parts));
    this.requestRender();
  }

  _viewToSource(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const sx = (clientX - r.left) * (this.canvas.width / r.width);
    const sy = (clientY - r.top) * (this.canvas.height / r.height);
    const srcX = (sx - this.view.x) / this.view.scale;
    const srcY = (sy - this.view.y) / this.view.scale;
    return { sx, sy, srcX, srcY };
  }

  _hitPart(srcX, srcY) {
    const ordered = [...this.parts].map((p, i) => ({ p, i })).sort((a, b) => b.i - a.i);
    for (const { p } of ordered) {
      const r = p.srcRect;
      if (srcX >= r.x && srcX <= r.x + r.w && srcY >= r.y && srcY <= r.y + r.h) return p;
    }
    return null;
  }

  _hitHandle(part, srcX, srcY) {
    const r = part.srcRect;
    const hit = (x, y, pad = 7) => Math.abs(srcX - x) <= pad && Math.abs(srcY - y) <= pad;
    const handles = {
      nw: [r.x, r.y], ne: [r.x + r.w, r.y], sw: [r.x, r.y + r.h], se: [r.x + r.w, r.y + r.h],
      n: [r.x + r.w * 0.5, r.y], s: [r.x + r.w * 0.5, r.y + r.h],
      w: [r.x, r.y + r.h * 0.5], e: [r.x + r.w, r.y + r.h * 0.5],
    };
    for (const [name, [x, y]] of Object.entries(handles)) if (hit(x, y)) return name;
    const px = r.x + part.pivotLocal.x;
    const py = r.y + part.pivotLocal.y;
    if (Math.hypot(srcX - px, srcY - py) <= 10) return 'pivot';
    return null;
  }

  _onPointerDown(e) {
    if (!this.sourceCanvas) return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    const { srcX, srcY } = this._viewToSource(e.clientX, e.clientY);
    let part = this._hitPart(srcX, srcY);
    if (part) this.selectedId = part.id;
    part = this.parts.find(p => p.id === this.selectedId) || part;
    if (!part) {
      this.requestRender();
      return;
    }
    const handle = this._hitHandle(part, srcX, srcY);
    const rect = structuredClone(part.srcRect);
    const pivotLocal = structuredClone(part.pivotLocal);
    this.drag = {
      id: part.id,
      mode: handle || (this.selectedId === part.id ? 'move' : 'none'),
      startX: srcX,
      startY: srcY,
      rect,
      pivotLocal,
      origin: structuredClone(rect),
    };
    this.requestRender();
  }

  _onPointerMove(e) {
    if (!this.drag) return;
    e.preventDefault();
    const { srcX, srcY } = this._viewToSource(e.clientX, e.clientY);
    const part = this.parts.find(p => p.id === this.drag.id);
    if (!part) return;
    const dx = srcX - this.drag.startX;
    const dy = srcY - this.drag.startY;
    let r = structuredClone(this.drag.rect);
    const p = structuredClone(this.drag.pivotLocal);

    if (this.drag.mode === 'move') {
      r.x = Math.round(this.drag.origin.x + dx);
      r.y = Math.round(this.drag.origin.y + dy);
    } else if (this.drag.mode === 'pivot') {
      p.x = Math.round(srcX - r.x);
      p.y = Math.round(srcY - r.y);
    } else if (['nw','ne','sw','se','n','s','w','e'].includes(this.drag.mode)) {
      const ox = this.drag.origin.x;
      const oy = this.drag.origin.y;
      const ow = this.drag.origin.w;
      const oh = this.drag.origin.h;
      if (this.drag.mode === 'nw') { r.x = Math.round(srcX); r.y = Math.round(srcY); r.w = Math.round((ox + ow) - r.x); r.h = Math.round((oy + oh) - r.y); }
      if (this.drag.mode === 'ne') { r.y = Math.round(srcY); r.w = Math.round(srcX - ox); r.h = Math.round((oy + oh) - r.y); }
      if (this.drag.mode === 'sw') { r.x = Math.round(srcX); r.w = Math.round((ox + ow) - r.x); r.h = Math.round(srcY - oy); }
      if (this.drag.mode === 'se') { r.w = Math.round(srcX - ox); r.h = Math.round(srcY - oy); }
      if (this.drag.mode === 'n')  { r.y = Math.round(srcY); r.h = Math.round((oy + oh) - r.y); }
      if (this.drag.mode === 's')  { r.h = Math.round(srcY - oy); }
      if (this.drag.mode === 'w')  { r.x = Math.round(srcX); r.w = Math.round((ox + ow) - r.x); }
      if (this.drag.mode === 'e')  { r.w = Math.round(srcX - ox); }
      if (r.w < 8) { r.w = 8; r.x = this.drag.origin.x + this.drag.origin.w - r.w; }
      if (r.h < 8) { r.h = 8; r.y = this.drag.origin.y + this.drag.origin.h - r.h; }
      // keep pivot inside the rectangle when resizing
      p.x = Math.max(0, Math.min(r.w, p.x));
      p.y = Math.max(0, Math.min(r.h, p.y));
    }

    r = clampRect(r, this.sourceCanvas.width, this.sourceCanvas.height);
    part.srcRect = r;
    part.pivotLocal = { x: Math.max(0, Math.min(r.w, p.x)), y: Math.max(0, Math.min(r.h, p.y)) };
    this._commit(false);
  }

  _onPointerUp() {
    this.drag = null;
  }
}
