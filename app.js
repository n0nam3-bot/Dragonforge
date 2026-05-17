// SpriteSmith Pixel Editor v7
// Frame-by-frame pixel art editor with onion skinning, live preview, and sprite sheet export.

// ── Default palette (DB16 + transparent) ─────────────────────────────────────
const DEFAULT_PALETTE = [
  '#ffffff','#000000','#ff0000','#00ff00','#0000ff','#ffff00',
  '#ff00ff','#00ffff','#ff8800','#8800ff','#00ff88','#ff0088',
  '#884400','#004488','#448800','#880044',
  '#aaaaaa','#555555','#ffccaa','#cc8855',
];

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  frames:       [],      // Array of { canvas, ctx } — each frame is a canvas
  current:      0,       // index of active frame
  fw:           64,      // frame width  (sprite pixels)
  fh:           64,      // frame height (sprite pixels)
  tool:         'pencil',
  primary:      '#ffffff',
  secondary:    '#000000',
  brushSize:    1,
  zoom:         8,
  showGrid:     true,
  palette:      [...DEFAULT_PALETTE],
  onion:        false,
  onionPrev:    1,
  onionOpacity: 0.35,
  playing:      false,
  fps:          8,
  sheetLayout:  'horizontal',
  history:      [],      // undo stack per frame: [{frameIdx, imageData}]
  histMax:      40,
  mouse:        { down:false, lastX:-1, lastY:-1 },
  rectStart:    null,
  lineStart:    null,
  selectRect:   null,
  selection:    null,    // copied pixels for paste
  moveStart:    null,
  clipboard:    null,
};

let animTimer = null;
let animFrame = 0;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const editorCanvas  = $('editorCanvas');
const editorCtx     = editorCanvas.getContext('2d');
const previewCanvas = $('previewCanvas');
const previewCtx    = previewCanvas.getContext('2d');
const sheetThumb    = $('sheetThumb');
const sheetThumbCtx = sheetThumb.getContext('2d');
const frameList     = $('frameList');
const primarySwatch = $('primarySwatch');
const secondarySwatch=$('secondarySwatch');
const colorPicker   = $('colorPicker');
const colorPicker2  = $('colorPicker2');
const paletteGrid   = $('paletteGrid');
const zoomLabel     = $('zoomLabel');
const frameInfo     = $('frameInfo');
const cursorInfo    = $('cursorInfo');
const onionToggle   = $('onionToggle');
const onionPrevEl   = $('onionPrev');
const onionOpacityEl= $('onionOpacity');
const playBtn       = $('playBtn');
const fpsInput      = $('fpsInput');
const showGridCb    = $('showGrid');
const brushSizeEl   = $('brushSize');
const toastEl       = $('toast');

// ── Initialise ────────────────────────────────────────────────────────────────
function init() {
  createNewSprite(64, 64, 1);
  buildPaletteUI();
  bindEvents();
  updateSwatches();
  renderAll();
}

// ── Create new sprite ─────────────────────────────────────────────────────────
function createNewSprite(w, h, frameCount) {
  S.fw = w; S.fh = h;
  S.frames = [];
  S.current = 0;
  S.history = [];
  for (let i = 0; i < frameCount; i++) S.frames.push(makeFrame());
  resizeEditorCanvas();
  renderAll();
}

function makeFrame() {
  const c = document.createElement('canvas');
  c.width = S.fw; c.height = S.fh;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S.fw, S.fh);
  return { canvas: c, ctx };
}

// ── Editor canvas sizing ──────────────────────────────────────────────────────
function resizeEditorCanvas() {
  editorCanvas.width  = S.fw * S.zoom;
  editorCanvas.height = S.fh * S.zoom;
  editorCanvas.style.width  = editorCanvas.width  + 'px';
  editorCanvas.style.height = editorCanvas.height + 'px';
}

// ── Render editor ─────────────────────────────────────────────────────────────
function renderEditor() {
  const ctx = editorCtx;
  const z   = S.zoom;
  ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);

  // Onion skin (previous frames)
  if (S.onion && S.onionPrev > 0) {
    for (let i = 1; i <= S.onionPrev; i++) {
      const fi = S.current - i;
      if (fi < 0) continue;
      const alpha = S.onionOpacity * (1 - (i - 1) * 0.3);
      ctx.save();
      ctx.globalAlpha = Math.max(0.05, alpha);
      // Tint red for previous frames
      ctx.drawImage(S.frames[fi].canvas, 0, 0, S.fw * z, S.fh * z);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(255,80,80,0.4)';
      ctx.fillRect(0, 0, S.fw * z, S.fh * z);
      ctx.restore();
    }
    // Next frame: tint blue
    if (S.current + 1 < S.frames.length) {
      ctx.save();
      ctx.globalAlpha = S.onionOpacity * 0.5;
      ctx.drawImage(S.frames[S.current + 1].canvas, 0, 0, S.fw * z, S.fh * z);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(80,80,255,0.4)';
      ctx.fillRect(0, 0, S.fw * z, S.fh * z);
      ctx.restore();
    }
  }

  // Current frame — pixel-perfect upscale
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(S.frames[S.current].canvas, 0, 0, S.fw * z, S.fh * z);
  ctx.restore();

  // Grid
  if (S.showGrid && z >= 4) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 1;
    for (let x = 0; x <= S.fw; x++) {
      ctx.beginPath(); ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, S.fh * z); ctx.stroke();
    }
    for (let y = 0; y <= S.fh; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * z + 0.5); ctx.lineTo(S.fw * z, y * z + 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  // Selection rect
  if (S.selectRect) {
    const { x, y, w, h } = S.selectRect;
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x * z, y * z, w * z, h * z);
    ctx.restore();
  }

  // Rectangle preview during drag
  if ((S.tool === 'rect' || S.tool === 'line') && S.rectStart && S.mouse.down) {
    // drawn separately when mouse moves
  }
}

// ── Frame thumbnails ──────────────────────────────────────────────────────────
function renderFrameStrip() {
  frameList.innerHTML = '';
  S.frames.forEach((fr, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'frame-thumb' + (i === S.current ? ' active' : '');
    wrap.title     = `Frame ${i + 1}`;

    const tc = document.createElement('canvas');
    const THUMB = 60;
    const scale = Math.min(THUMB / S.fw, THUMB / S.fh);
    tc.width  = Math.round(S.fw * scale);
    tc.height = Math.round(S.fh * scale);
    const tctx = tc.getContext('2d');
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(fr.canvas, 0, 0, tc.width, tc.height);
    wrap.appendChild(tc);

    const num = document.createElement('span');
    num.className   = 'frame-num';
    num.textContent = i + 1;
    wrap.appendChild(num);

    wrap.addEventListener('click', () => { S.current = i; renderAll(); });
    frameList.appendChild(wrap);
  });
  frameInfo.textContent = `Frame ${S.current + 1} / ${S.frames.length}`;
}

// ── Preview ───────────────────────────────────────────────────────────────────
function renderPreview(frameIdx) {
  const fr  = S.frames[frameIdx ?? S.current];
  const DW  = previewCanvas.width, DH = previewCanvas.height;
  const sc  = Math.min(DW / S.fw, DH / S.fh);
  const dw  = S.fw * sc, dh = S.fh * sc;
  previewCtx.clearRect(0, 0, DW, DH);
  previewCtx.imageSmoothingEnabled = false;
  previewCtx.drawImage(fr.canvas, (DW-dw)/2, (DH-dh)/2, dw, dh);
}

// ── Sheet thumbnail ───────────────────────────────────────────────────────────
function renderSheetThumb() {
  const n    = S.frames.length;
  const cols = S.sheetLayout === 'grid' ? Math.ceil(Math.sqrt(n)) : n;
  const rows = Math.ceil(n / cols);
  const SCALE = Math.min(4, Math.floor(160 / (cols * S.fw)));
  const sw = S.fw * cols * SCALE;
  const sh = S.fh * rows * SCALE;
  sheetThumb.width  = sw;
  sheetThumb.height = sh;
  sheetThumbCtx.clearRect(0, 0, sw, sh);
  sheetThumbCtx.imageSmoothingEnabled = false;
  S.frames.forEach((fr, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    sheetThumbCtx.drawImage(fr.canvas, col*S.fw*SCALE, row*S.fh*SCALE, S.fw*SCALE, S.fh*SCALE);
  });
}

function renderAll() {
  renderEditor();
  renderFrameStrip();
  renderPreview();
  renderSheetThumb();
}

// ── History (undo) ────────────────────────────────────────────────────────────
function pushHistory() {
  const id = S.frames[S.current].ctx.getImageData(0, 0, S.fw, S.fh);
  S.history.push({ fi: S.current, data: id });
  if (S.history.length > S.histMax) S.history.shift();
}

function undo() {
  // Find last history entry for current frame
  for (let i = S.history.length - 1; i >= 0; i--) {
    if (S.history[i].fi === S.current) {
      S.frames[S.current].ctx.putImageData(S.history[i].data, 0, 0);
      S.history.splice(i, 1);
      renderAll();
      return;
    }
  }
  showToast('Nothing to undo.', 'warn');
}

// ── Pixel helpers ─────────────────────────────────────────────────────────────
function canvasPos(e) {
  const rect = editorCanvas.getBoundingClientRect();
  const raw  = e.touches ? e.touches[0] : e;
  const cx   = (raw.clientX - rect.left) * (editorCanvas.width  / rect.width);
  const cy   = (raw.clientY - rect.top)  * (editorCanvas.height / rect.height);
  return { px: Math.floor(cx / S.zoom), py: Math.floor(cy / S.zoom) };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function inBounds(x, y)    { return x >= 0 && x < S.fw && y >= 0 && y < S.fh; }

function setPixel(ctx, px, py, color) {
  if (!inBounds(px, py)) return;
  if (color === null || color === 'transparent' || color === 'erase') {
    ctx.clearRect(px, py, 1, 1);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(px, py, 1, 1);
  }
}

function getPixel(ctx, px, py) {
  if (!inBounds(px, py)) return 'transparent';
  const d = ctx.getImageData(px, py, 1, 1).data;
  if (d[3] === 0) return 'transparent';
  return `rgba(${d[0]},${d[1]},${d[2]},${(d[3]/255).toFixed(3)})`;
}

function hexToRgba(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r, g, b, 255];
}

function colorMatch(d1, d2, tol=0) {
  return Math.abs(d1[0]-d2[0])<=tol && Math.abs(d1[1]-d2[1])<=tol &&
         Math.abs(d1[2]-d2[2])<=tol && Math.abs(d1[3]-d2[3])<=tol;
}

// ── Draw tools ────────────────────────────────────────────────────────────────
function paintPixels(px, py, color, size) {
  const ctx  = S.frames[S.current].ctx;
  const half = Math.floor(size / 2);
  for (let dy = -half; dy < size - half; dy++) {
    for (let dx = -half; dx < size - half; dx++) {
      setPixel(ctx, px + dx, py + dy, color);
    }
  }
}

function drawLine(ctx, x0, y0, x1, y1, color, size) {
  const dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    const half = Math.floor(size/2);
    for (let dy2=-half;dy2<size-half;dy2++) for (let dx2=-half;dx2<size-half;dx2++)
      setPixel(ctx, x0+dx2, y0+dy2, color);
    if (x0===x1 && y0===y1) break;
    const e2 = 2*err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 <  dx) { err += dx; y0 += sy; }
  }
}

function floodFill(ctx, px, py, fillColor) {
  if (!inBounds(px, py)) return;
  const imgData = ctx.getImageData(0, 0, S.fw, S.fh);
  const d = imgData.data;
  const idx = (y, x) => (y * S.fw + x) * 4;
  const target = [d[idx(py,px)],d[idx(py,px)+1],d[idx(py,px)+2],d[idx(py,px)+3]];
  const [fr, fg, fb, fa] = hexToRgba(fillColor);

  if (colorMatch(target, [fr,fg,fb,fa])) return;

  const stack = [[px, py]];
  const visited = new Uint8Array(S.fw * S.fh);

  while (stack.length) {
    const [x, y] = stack.pop();
    if (!inBounds(x,y) || visited[y*S.fw+x]) continue;
    const i = idx(y, x);
    if (!colorMatch([d[i],d[i+1],d[i+2],d[i+3]], target, 30)) continue;
    visited[y*S.fw+x] = 1;
    d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=fa;
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
  ctx.putImageData(imgData, 0, 0);
}

function drawRect(ctx, x0, y0, x1, y1, color, size, fill=false) {
  const lx=Math.min(x0,x1),rx=Math.max(x0,x1);
  const ly=Math.min(y0,y1),ry=Math.max(y0,y1);
  if (fill) {
    for (let y=ly;y<=ry;y++) for (let x=lx;x<=rx;x++) setPixel(ctx,x,y,color);
  } else {
    for (let x=lx;x<=rx;x++) { setPixel(ctx,x,ly,color); setPixel(ctx,x,ry,color); }
    for (let y=ly;y<=ry;y++) { setPixel(ctx,lx,y,color); setPixel(ctx,rx,y,color); }
  }
}

// ── Mouse / touch events ──────────────────────────────────────────────────────
function bindCanvasEvents() {
  editorCanvas.addEventListener('mousedown',  onDown);
  editorCanvas.addEventListener('mousemove',  onMove);
  editorCanvas.addEventListener('mouseup',    onUp);
  editorCanvas.addEventListener('mouseleave', onUp);
  editorCanvas.addEventListener('contextmenu', e => { e.preventDefault(); });
  editorCanvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(e); }, {passive:false});
  editorCanvas.addEventListener('touchmove',  e => { e.preventDefault(); onMove(e); }, {passive:false});
  editorCanvas.addEventListener('touchend',   e => { e.preventDefault(); onUp(e);   }, {passive:false});
}

function onDown(e) {
  e.preventDefault();
  const { px, py } = canvasPos(e);
  const right      = e.button === 2;
  const color      = right ? S.secondary : S.primary;
  const erase      = S.tool === 'eraser' || right && S.tool !== 'picker';
  const ctx        = S.frames[S.current].ctx;

  S.mouse.down  = true;
  S.mouse.lastX = px;
  S.mouse.lastY = py;

  pushHistory();

  switch (S.tool) {
    case 'pencil':
    case 'eraser':
      paintPixels(px, py, erase || S.tool==='eraser' ? 'erase' : color, S.brushSize);
      break;
    case 'fill':
      if (!erase) floodFill(ctx, px, py, color);
      break;
    case 'picker': {
      const picked = getPixel(ctx, px, py);
      if (picked !== 'transparent') {
        if (right) S.secondary = picked; else S.primary = picked;
        updateSwatches();
        addToPalette(picked);
      }
      S.mouse.down = false;
      return;
    }
    case 'rect':
    case 'line':
      S.rectStart = { px, py };
      break;
    case 'select':
      S.rectStart  = { px, py };
      S.selectRect = null;
      break;
    case 'move':
      S.moveStart = { px, py,
        data: ctx.getImageData(0, 0, S.fw, S.fh) };
      break;
  }

  renderAll();
}

function onMove(e) {
  const { px, py } = canvasPos(e);
  cursorInfo.textContent = `${px}, ${py}`;
  if (!S.mouse.down) return;

  const right = e.buttons === 2;
  const color = right ? S.secondary : S.primary;
  const ctx   = S.frames[S.current].ctx;
  const erase = S.tool === 'eraser';

  switch (S.tool) {
    case 'pencil':
    case 'eraser':
      // Interpolate between last and current pixel for smooth lines
      drawLine(ctx, S.mouse.lastX, S.mouse.lastY, px, py,
        erase ? 'erase' : color, S.brushSize);
      break;
    case 'rect':
    case 'line': {
      // Show preview on editor canvas only (don't commit to frame)
      renderEditor();
      const ex = editorCtx;
      ex.save();
      ex.imageSmoothingEnabled = false;
      if (S.rectStart) {
        const z = S.zoom;
        ex.strokeStyle = color;
        ex.lineWidth   = 1;
        if (S.tool === 'rect') {
          ex.strokeRect(
            S.rectStart.px * z, S.rectStart.py * z,
            (px - S.rectStart.px) * z, (py - S.rectStart.py) * z
          );
        } else {
          ex.beginPath();
          ex.moveTo(S.rectStart.px*z + z/2, S.rectStart.py*z + z/2);
          ex.lineTo(px*z + z/2, py*z + z/2);
          ex.stroke();
        }
      }
      ex.restore();
      S.mouse.lastX = px; S.mouse.lastY = py;
      return;
    }
    case 'select':
      if (S.rectStart) {
        S.selectRect = {
          x: Math.min(px, S.rectStart.px),
          y: Math.min(py, S.rectStart.py),
          w: Math.abs(px - S.rectStart.px) + 1,
          h: Math.abs(py - S.rectStart.py) + 1,
        };
      }
      break;
    case 'move':
      if (S.moveStart) {
        ctx.putImageData(S.moveStart.data, 0, 0);
        const dx = px - S.moveStart.px;
        const dy = py - S.moveStart.py;
        ctx.clearRect(0, 0, S.fw, S.fh);
        ctx.drawImage(
          createOffscreenFromData(S.moveStart.data, S.fw, S.fh),
          dx, dy
        );
      }
      break;
  }

  S.mouse.lastX = px; S.mouse.lastY = py;
  renderAll();
}

function onUp(e) {
  if (!S.mouse.down) return;
  const { px, py } = canvasPos(e || { touches:[], clientX:0, clientY:0 });
  const right = (e?.button === 2) || (e?.buttons === 2);
  const color = right ? S.secondary : S.primary;
  const ctx   = S.frames[S.current].ctx;

  switch (S.tool) {
    case 'rect':
      if (S.rectStart) {
        drawRect(ctx, S.rectStart.px, S.rectStart.py, px, py, color, S.brushSize, e?.shiftKey);
        S.rectStart = null;
      }
      break;
    case 'line':
      if (S.rectStart) {
        drawLine(ctx, S.rectStart.px, S.rectStart.py, px, py, color, S.brushSize);
        S.rectStart = null;
      }
      break;
    case 'select':
      S.rectStart = null;
      break;
  }

  S.mouse.down  = false;
  S.mouse.lastX = -1;
  S.mouse.lastY = -1;
  renderAll();
}

function createOffscreenFromData(imgData, w, h) {
  const c = document.createElement('canvas');
  c.width=w; c.height=h;
  c.getContext('2d').putImageData(imgData, 0, 0);
  return c;
}

// ── Frame operations ──────────────────────────────────────────────────────────
function addFrame()  { S.frames.splice(S.current+1, 0, makeFrame()); S.current++; renderAll(); }
function dupFrame()  {
  const nf = makeFrame();
  nf.ctx.drawImage(S.frames[S.current].canvas, 0, 0);
  S.frames.splice(S.current+1, 0, nf);
  S.current++;
  renderAll();
}
function delFrame()  {
  if (S.frames.length === 1) { showToast('At least one frame required.','warn'); return; }
  S.frames.splice(S.current, 1);
  S.current = Math.min(S.current, S.frames.length-1);
  renderAll();
}
function moveFrameLeft() {
  if (S.current===0) return;
  [S.frames[S.current-1],S.frames[S.current]] = [S.frames[S.current],S.frames[S.current-1]];
  S.current--;
  renderAll();
}
function moveFrameRight() {
  if (S.current===S.frames.length-1) return;
  [S.frames[S.current+1],S.frames[S.current]] = [S.frames[S.current],S.frames[S.current+1]];
  S.current++;
  renderAll();
}

// ── Zoom ──────────────────────────────────────────────────────────────────────
function setZoom(z) {
  S.zoom = Math.max(1, Math.min(32, z));
  zoomLabel.textContent = S.zoom+'×';
  resizeEditorCanvas();
  renderAll();
}

// ── Import image ──────────────────────────────────────────────────────────────
async function importImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=url; });
  URL.revokeObjectURL(url);

  // If image is wider than tall, assume it may be a sprite sheet strip
  const isStrip = img.naturalWidth > img.naturalHeight * 1.5;
  if (isStrip) {
    // Ask how many frames
    const n = parseInt(prompt(`Detected a wide image (${img.naturalWidth}×${img.naturalHeight}).\nHow many frames are in this sprite sheet strip?`, '8') || '1');
    if (!n || n < 1) return;
    const fw = Math.floor(img.naturalWidth / n);
    const fh = img.naturalHeight;
    S.fw = fw; S.fh = fh;
    S.frames = [];
    for (let i = 0; i < n; i++) {
      const fr = makeFrame();
      fr.ctx.drawImage(img, i*fw, 0, fw, fh, 0, 0, fw, fh);
      S.frames.push(fr);
    }
    S.current = 0;
    S.history  = [];
    resizeEditorCanvas();
    renderAll();
    showToast(`Imported ${n} frames ✓`, 'ok');
    return;
  }

  // Single frame — resize sprite to match image or keep current size
  const use = confirm(`Import as new ${img.naturalWidth}×${img.naturalHeight} sprite?\nCancel = scale to current ${S.fw}×${S.fh}.`);
  if (use) {
    S.fw = img.naturalWidth;
    S.fh = img.naturalHeight;
    S.frames = [makeFrame()];
    S.frames[0].ctx.drawImage(img, 0, 0);
  } else {
    S.frames[S.current].ctx.clearRect(0, 0, S.fw, S.fh);
    S.frames[S.current].ctx.drawImage(img, 0, 0, S.fw, S.fh);
  }
  S.current = 0;
  S.history = [];
  resizeEditorCanvas();
  renderAll();
  showToast('Image imported ✓', 'ok');
}

// ── Animation playback ────────────────────────────────────────────────────────
function startPlay() {
  if (S.playing) return;
  S.playing  = true;
  playBtn.textContent = '⏹ Stop';
  animFrame  = S.current;
  animTimer  = setInterval(() => {
    animFrame = (animFrame+1) % S.frames.length;
    renderPreview(animFrame);
  }, 1000 / S.fps);
}

function stopPlay() {
  S.playing = false;
  playBtn.textContent = '▶ Play';
  clearInterval(animTimer);
  renderPreview();
}

// ── Export sprite sheet ───────────────────────────────────────────────────────
function exportSheet(format='png') {
  const n    = S.frames.length;
  const cols = S.sheetLayout === 'grid' ? Math.ceil(Math.sqrt(n)) : n;
  const rows = Math.ceil(n / cols);
  const sheet = document.createElement('canvas');
  sheet.width  = S.fw * cols;
  sheet.height = S.fh * rows;
  const sCtx   = sheet.getContext('2d');
  sCtx.imageSmoothingEnabled = false;
  sCtx.clearRect(0, 0, sheet.width, sheet.height);
  S.frames.forEach((fr, i) => {
    const col = i%cols, row=Math.floor(i/cols);
    sCtx.drawImage(fr.canvas, col*S.fw, row*S.fh);
  });

  if (format === 'png') {
    sheet.toBlob(blob => {
      Object.assign(document.createElement('a'),{
        href: URL.createObjectURL(blob),
        download: `sprite_sheet_${S.fw}x${S.fh}_${n}frames.png`,
      }).click();
    }, 'image/png');
    showToast('PNG exported ✓','ok');
  } else {
    const frames = Array.from({length:n},(_,i)=>({
      filename: `frame_${String(i+1).padStart(3,'0')}`,
      frame: { x:(i%cols)*S.fw, y:Math.floor(i/cols)*S.fh, w:S.fw, h:S.fh },
      rotated:false, trimmed:false,
      spriteSourceSize:{x:0,y:0,w:S.fw,h:S.fh},
      sourceSize:{w:S.fw,h:S.fh},
      duration:Math.round(1000/S.fps),
    }));
    const json = JSON.stringify({frames,meta:{
      app:'SpriteSmith Pixel Editor',version:'7.0',
      image:`sprite_sheet_${S.fw}x${S.fh}_${n}frames.png`,
      format:'RGBA8888',
      size:{w:sheet.width,h:sheet.height},
      frameWidth:S.fw,frameHeight:S.fh,frameCount:n,
      fps:S.fps,layout:S.sheetLayout,
      date:new Date().toISOString(),
    }},null,2);
    Object.assign(document.createElement('a'),{
      href: URL.createObjectURL(new Blob([json],{type:'application/json'})),
      download: `sprite_sheet_${S.fw}x${S.fh}_${n}frames.json`,
    }).click();
    // Also export the PNG
    sheet.toBlob(blob=>{
      Object.assign(document.createElement('a'),{
        href:URL.createObjectURL(blob),
        download:`sprite_sheet_${S.fw}x${S.fh}_${n}frames.png`,
      }).click();
    },'image/png');
    showToast('JSON + PNG exported ✓','ok');
  }
}

// ── Save / Load project ───────────────────────────────────────────────────────
function saveProject() {
  const frames = S.frames.map(fr => fr.canvas.toDataURL('image/png'));
  const payload = JSON.stringify({
    v:7, fw:S.fw, fh:S.fh, fps:S.fps,
    palette:S.palette, primary:S.primary, secondary:S.secondary,
    sheetLayout:S.sheetLayout, frames,
  });
  const blob = new Blob([payload],{type:'application/json'});
  Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(blob),
    download:`spritesmith_project.sss`,
  }).click();
  showToast('Project saved ✓','ok');
}

async function loadProject(file) {
  const text = await file.text();
  const p    = JSON.parse(text);
  S.fw = p.fw; S.fh = p.fh; S.fps = p.fps||8;
  S.palette = p.palette || [...DEFAULT_PALETTE];
  S.primary = p.primary || '#ffffff';
  S.secondary = p.secondary || '#000000';
  S.sheetLayout = p.sheetLayout || 'horizontal';
  S.frames  = [];
  S.current = 0;
  S.history = [];

  for (const dataURL of p.frames) {
    const img = new Image();
    await new Promise(res=>{ img.onload=res; img.src=dataURL; });
    const fr = makeFrame();
    fr.ctx.drawImage(img, 0, 0);
    S.frames.push(fr);
  }
  resizeEditorCanvas();
  buildPaletteUI();
  updateSwatches();
  fpsInput.value = S.fps;
  renderAll();
  showToast('Project loaded ✓','ok');
}

// ── Palette ───────────────────────────────────────────────────────────────────
function buildPaletteUI() {
  paletteGrid.innerHTML = '';
  S.palette.forEach((color, i) => {
    const sw = document.createElement('div');
    sw.className   = 'palette-swatch';
    sw.style.background = color;
    sw.title       = color;
    sw.addEventListener('click',      () => { S.primary   = color; updateSwatches(); });
    sw.addEventListener('contextmenu',e  => { e.preventDefault(); S.secondary = color; updateSwatches(); });
    paletteGrid.appendChild(sw);
  });
}

function addToPalette(color) {
  // Normalise to hex
  const hex = rgbaToHex(color);
  if (!hex || S.palette.includes(hex)) return;
  S.palette.push(hex);
  buildPaletteUI();
}

function rgbaToHex(str) {
  if (str.startsWith('#')) return str;
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return '#'+[m[1],m[2],m[3]].map(v=>parseInt(v).toString(16).padStart(2,'0')).join('');
}

function updateSwatches() {
  primarySwatch.style.background   = S.primary;
  secondarySwatch.style.background = S.secondary;
  colorPicker.value  = S.primary.startsWith('#') ? S.primary : '#ffffff';
  colorPicker2.value = S.secondary.startsWith('#') ? S.secondary : '#000000';
}

// ── Event bindings ────────────────────────────────────────────────────────────
function bindEvents() {
  bindCanvasEvents();

  // Tool buttons
  $('toolGrid').querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      S.tool = btn.dataset.tool;
      $('toolGrid').querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Colour pickers
  primarySwatch.addEventListener('click',   () => colorPicker.click());
  secondarySwatch.addEventListener('click', () => colorPicker2.click());
  colorPicker.addEventListener('input',  () => { S.primary   = colorPicker.value;  updateSwatches(); });
  colorPicker2.addEventListener('input', () => { S.secondary = colorPicker2.value; updateSwatches(); });

  $('swapColors').addEventListener('click', () => {
    [S.primary, S.secondary] = [S.secondary, S.primary]; updateSwatches();
  });

  $('addPaletteColor').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type='color'; inp.value=S.primary;
    inp.addEventListener('change', () => { addToPalette(inp.value); });
    inp.click();
  });
  $('clearPalette').addEventListener('click', () => { S.palette=[...DEFAULT_PALETTE]; buildPaletteUI(); });

  // Zoom
  $('zoomIn').addEventListener('click',  () => setZoom(S.zoom * 2));
  $('zoomOut').addEventListener('click', () => setZoom(Math.floor(S.zoom / 2)));

  // Grid
  showGridCb.addEventListener('change', () => { S.showGrid = showGridCb.checked; renderEditor(); });

  // Brush
  brushSizeEl.addEventListener('change', () => { S.brushSize = parseInt(brushSizeEl.value); });

  // Frames
  $('addFrame').addEventListener('click',   addFrame);
  $('dupFrame').addEventListener('click',   dupFrame);
  $('delFrame').addEventListener('click',   delFrame);
  $('moveLeft').addEventListener('click',   moveFrameLeft);
  $('moveRight').addEventListener('click',  moveFrameRight);

  // Onion skin
  onionToggle.addEventListener('change',    () => { S.onion = onionToggle.checked; renderEditor(); });
  onionPrevEl.addEventListener('input',     () => {
    S.onionPrev = parseInt(onionPrevEl.value);
    $('onionPrevVal').textContent = S.onionPrev;
    renderEditor();
  });
  onionOpacityEl.addEventListener('input',  () => {
    S.onionOpacity = parseInt(onionOpacityEl.value) / 100;
    $('onionOpacityVal').textContent = onionOpacityEl.value+'%';
    renderEditor();
  });

  // Preview
  playBtn.addEventListener('click', () => S.playing ? stopPlay() : startPlay());
  fpsInput.addEventListener('change', () => {
    S.fps = Math.max(1,Math.min(60,parseInt(fpsInput.value)||8));
    if (S.playing) { stopPlay(); startPlay(); }
  });

  // Sheet layout
  $('sheetLayout').addEventListener('change', () => {
    S.sheetLayout = $('sheetLayout').value; renderSheetThumb();
  });

  // Import
  $('importFile').addEventListener('change', e => {
    if (e.target.files[0]) importImage(e.target.files[0]);
    e.target.value = '';
  });

  // Save project
  $('saveProjectBtn').addEventListener('click', saveProject);
  $('loadFile').addEventListener('change', e => {
    if (e.target.files[0]) loadProject(e.target.files[0]);
    e.target.value = '';
  });

  // Export
  $('exportBtn').addEventListener('click',     () => exportSheet('png'));
  $('exportJsonBtn').addEventListener('click', () => exportSheet('json'));

  // New sprite
  $('newBtn').addEventListener('click', () => $('modal').classList.remove('hidden'));
  $('modalCancel').addEventListener('click', () => $('modal').classList.add('hidden'));
  $('modalOk').addEventListener('click', () => {
    const w = Math.min(512, Math.max(8, parseInt($('mW').value)||64));
    const h = Math.min(512, Math.max(8, parseInt($('mH').value)||64));
    const f = Math.min(64,  Math.max(1, parseInt($('mF').value)||1));
    createNewSprite(w, h, f);
    $('modal').classList.add('hidden');
    showToast(`New ${w}×${h} sprite, ${f} frame(s) ✓`,'ok');
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const key = e.key.toLowerCase();
    const tool = { b:'pencil',e:'eraser',f:'fill',i:'picker',r:'rect',l:'line',m:'move',s:'select' }[key];
    if (tool) {
      S.tool = tool;
      $('toolGrid').querySelectorAll('.tool-btn').forEach(b=>b.classList.toggle('active', b.dataset.tool===tool));
    }
    if (key === 'x') { [S.primary,S.secondary]=[S.secondary,S.primary]; updateSwatches(); }
    if (key === 'z' && e.ctrlKey) { e.preventDefault(); undo(); }
    if (key === '[') setZoom(Math.floor(S.zoom/2));
    if (key === ']') setZoom(S.zoom*2);
    if (key === 'arrowleft'  && e.altKey) { moveFrameLeft();  }
    if (key === 'arrowright' && e.altKey) { moveFrameRight(); }
    if (key === 'arrowleft'  && !e.altKey) { S.current=Math.max(0,S.current-1); renderAll(); }
    if (key === 'arrowright' && !e.altKey) { S.current=Math.min(S.frames.length-1,S.current+1); renderAll(); }
    if (e.ctrlKey && key==='d') { e.preventDefault(); dupFrame(); }
  });

  // Canvas mouse wheel zoom
  $('canvasWrap').addEventListener('wheel', e => {
    e.preventDefault();
    if (e.deltaY < 0) setZoom(S.zoom + 1); else setZoom(S.zoom - 1);
  }, { passive:false });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer=null;
function showToast(msg, type='ok') {
  toastEl.textContent = msg;
  toastEl.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toastEl.classList.remove('show'), 3000);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
