// spritesheet.js — Bake, export PNG and JSON

import { renderFrame } from './animator.js';

/**
 * Bake all animation frames into a sprite sheet canvas.
 * @param {object} skelData   — from detectSkeleton()
 * @param {string} pose
 * @param {string} direction  — 'left'|'right'
 * @param {number} frameCount
 * @param {number} frameSize  — px per square frame
 * @param {string} layout     — 'horizontal'|'grid'
 * @returns {HTMLCanvasElement}
 */
export function bakeSheet(skelData, pose, direction, frameCount, frameSize, layout) {
  const cols = layout === 'grid' ? Math.ceil(Math.sqrt(frameCount)) : frameCount;
  const rows = layout === 'grid' ? Math.ceil(frameCount / cols)     : 1;

  const sheet = document.createElement('canvas');
  sheet.width  = cols * frameSize;
  sheet.height = rows * frameSize;
  const sCtx   = sheet.getContext('2d');
  sCtx.clearRect(0, 0, sheet.width, sheet.height);

  const tmp     = document.createElement('canvas');
  tmp.width     = frameSize;
  tmp.height    = frameSize;
  const tCtx    = tmp.getContext('2d');

  for (let f = 0; f < frameCount; f++) {
    const t   = f / frameCount;
    const col = f % cols;
    const row = Math.floor(f / cols);

    tCtx.clearRect(0, 0, frameSize, frameSize);
    renderFrame(tCtx, skelData, pose, t, direction);

    sCtx.drawImage(tmp, col * frameSize, row * frameSize, frameSize, frameSize);
  }

  return sheet;
}

/** Export sheet as a transparent PNG download. */
export function exportPNG(sheetCanvas, pose, direction) {
  sheetCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), {
      href: url,
      download: `spritesmith_${pose}_${direction}.png`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/** Export Aseprite-compatible JSON manifest + matching PNG. */
export function exportJSON(sheetCanvas, frameCount, frameSize, layout, pose, direction) {
  const cols  = layout === 'grid' ? Math.ceil(Math.sqrt(frameCount)) : frameCount;
  const fname = `spritesmith_${pose}_${direction}`;

  const frames = Array.from({ length: frameCount }, (_, f) => ({
    filename: `${fname}_${String(f).padStart(3, '0')}`,
    frame: {
      x: (f % cols) * frameSize,
      y: Math.floor(f / cols) * frameSize,
      w: frameSize, h: frameSize,
    },
    rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: frameSize, h: frameSize },
    sourceSize: { w: frameSize, h: frameSize },
    duration: 100,
  }));

  const meta = {
    app: 'SpriteSmith Studio', version: '2.1',
    image: `${fname}.png`, format: 'RGBA8888',
    size: { w: sheetCanvas.width, h: sheetCanvas.height },
    pose, direction, frameCount, frameSize, layout, scale: '1',
    date: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify({ frames, meta }, null, 2)],
    { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), {
    href: url, download: `${fname}.json`,
  }).click();
  URL.revokeObjectURL(url);

  exportPNG(sheetCanvas, pose, direction);
}
