// spritesheet.js — Bake, export PNG and JSON

import { renderFrame } from './animator.js';

// ── Bake ──────────────────────────────────────────────────────────────────────

/**
 * Render every animation frame and pack them into a sprite sheet.
 * @returns {HTMLCanvasElement} the finished sheet
 */
export function bakeSheet(charCanvas, bodyInfo, pose, direction, frameCount, frameSize, layout) {
  const cols = layout === 'grid' ? Math.ceil(Math.sqrt(frameCount)) : frameCount;
  const rows = layout === 'grid' ? Math.ceil(frameCount / cols)     : 1;

  const sheet = document.createElement('canvas');
  sheet.width  = cols * frameSize;
  sheet.height = rows * frameSize;
  const sCtx = sheet.getContext('2d');
  sCtx.clearRect(0, 0, sheet.width, sheet.height);

  // Temp canvas for each frame
  const tmp  = document.createElement('canvas');
  tmp.width  = frameSize;
  tmp.height = frameSize;
  const tCtx = tmp.getContext('2d');

  for (let f = 0; f < frameCount; f++) {
    const t   = f / frameCount;          // phase 0..1
    const col = f % cols;
    const row = Math.floor(f / cols);

    tCtx.clearRect(0, 0, frameSize, frameSize);
    renderFrame(tCtx, charCanvas, bodyInfo, pose, t, direction);

    sCtx.drawImage(tmp, col * frameSize, row * frameSize, frameSize, frameSize);
  }

  return sheet;
}

// ── Export PNG ────────────────────────────────────────────────────────────────

export function exportPNG(sheetCanvas, pose, direction) {
  sheetCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `spritesmith_${pose}_${direction}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

// ── Export JSON ───────────────────────────────────────────────────────────────

/**
 * Exports Aseprite-compatible JSON (array format) alongside a matching PNG.
 */
export function exportJSON(sheetCanvas, frameCount, frameSize, layout, pose, direction) {
  const cols  = layout === 'grid' ? Math.ceil(Math.sqrt(frameCount)) : frameCount;
  const fname = `spritesmith_${pose}_${direction}`;

  const frames = [];
  for (let f = 0; f < frameCount; f++) {
    const col = f % cols;
    const row = Math.floor(f / cols);
    frames.push({
      filename: `${fname}_${String(f).padStart(3,'0')}`,
      frame:    { x: col * frameSize, y: row * frameSize, w: frameSize, h: frameSize },
      rotated:  false,
      trimmed:  false,
      spriteSourceSize: { x: 0, y: 0, w: frameSize, h: frameSize },
      sourceSize:       { w: frameSize, h: frameSize },
      duration: 100,
    });
  }

  const meta = {
    app:       'SpriteSmith Studio',
    version:   '1.0',
    image:     `${fname}.png`,
    format:    'RGBA8888',
    size:      { w: sheetCanvas.width, h: sheetCanvas.height },
    pose,
    direction,
    frameCount,
    frameSize,
    layout,
    scale:     '1',
    date:      new Date().toISOString(),
  };

  const json = JSON.stringify({ frames, meta }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${fname}.json`;
  a.click();
  URL.revokeObjectURL(url);

  // Also export the matching PNG
  exportPNG(sheetCanvas, pose, direction);
}
