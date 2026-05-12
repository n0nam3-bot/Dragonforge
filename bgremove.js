// bgremove.js — Canvas-based background removal via edge flood-fill

const MAX_SIDE    = 1200;  // resize before processing if larger
const BG_THOLD    = 34;    // colour-distance threshold for bg detection
const SEMI_THOLD  = 62;    // wider pass for fringe cleanup

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Remove background from an HTMLImageElement.
 * Returns a Promise<HTMLCanvasElement> with transparent background.
 * onProgress(0–1) is called at key stages.
 */
export async function removeBackground(imgEl, onProgress = () => {}) {
  // ---- 1. Draw to working canvas (capped at MAX_SIDE) ----
  const orig = document.createElement('canvas');
  const scale = Math.min(1, MAX_SIDE / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
  orig.width  = Math.round(imgEl.naturalWidth  * scale);
  orig.height = Math.round(imgEl.naturalHeight * scale);
  const octx = orig.getContext('2d', { willReadFrequently: true });
  octx.drawImage(imgEl, 0, 0, orig.width, orig.height);

  onProgress(0.05);
  await tick();

  const W = orig.width, H = orig.height;
  const idata = octx.getImageData(0, 0, W, H);
  const d = idata.data;

  // ---- 2. Sample edges to find background colour ----
  const bgColour = sampleEdgeBg(d, W, H);
  onProgress(0.15);
  await tick();

  // ---- 3. Flood-fill from all edge pixels ----
  const mask = new Uint8Array(W * H); // 1 = background, 2 = fringe
  floodFillEdges(d, mask, W, H, bgColour, BG_THOLD);
  onProgress(0.60);
  await tick();

  // ---- 4. Widen pass: pixels close to background colour with mostly-bg neighbours ----
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      if (mask[idx]) continue;
      const px = px4(d, idx);
      const dist = colourDist(px, bgColour);
      if (dist >= SEMI_THOLD) continue;
      let bgNeighbours = 0;
      for (let yy = -1; yy <= 1; yy++) {
        for (let xx = -1; xx <= 1; xx++) {
          if (xx === 0 && yy === 0) continue;
          if (mask[(y + yy) * W + (x + xx)] || colourDist(px4(d, (y + yy) * W + (x + xx)), bgColour) < BG_THOLD) {
            bgNeighbours++;
          }
        }
      }
      if (bgNeighbours >= 6) mask[idx] = 2;
    }
  }
  onProgress(0.72);
  await tick();

  // ---- 5. Write alpha: bg → 0, fringe → partial ----
  for (let i = 0; i < W * H; i++) {
    if (mask[i] === 1) {
      d[i * 4 + 3] = 0;
    } else if (mask[i] === 2) {
      d[i * 4 + 3] = Math.round(d[i * 4 + 3] * 0.18);
    }
  }
  onProgress(0.82);
  await tick();

  // ---- 6. Smooth alpha edges ----
  smoothAlpha(d, W, H);
  onProgress(0.93);
  await tick();

  // ---- 7. Small safety cleanup near outer border ----
  edgeCleanup(d, W, H, bgColour);

  octx.putImageData(idata, 0, 0);

  // ---- 8. Scale back to original dimensions ----
  const out = document.createElement('canvas');
  out.width  = imgEl.naturalWidth;
  out.height = imgEl.naturalHeight;
  const outCtx = out.getContext('2d');
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(orig, 0, 0, out.width, out.height);

  onProgress(1);
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tick() { return new Promise(r => setTimeout(r, 0)); }

/** Sample colours from all four edges and return the median. */
function sampleEdgeBg(d, W, H) {
  const samples = [];
  const addPx = (x, y) => {
    const i = (y * W + x);
    samples.push({ r: d[i * 4], g: d[i * 4 + 1], b: d[i * 4 + 2] });
  };
  const step = Math.max(2, Math.floor(Math.min(W, H) / 140));
  for (let x = 0; x < W; x += step) { addPx(x, 0); addPx(x, H - 1); }
  for (let y = 0; y < H; y += step) { addPx(0, y); addPx(W - 1, y); }
  const med = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  return {
    r: med(samples.map(s => s.r)),
    g: med(samples.map(s => s.g)),
    b: med(samples.map(s => s.b)),
  };
}

/** BFS flood-fill from every edge pixel within threshold. */
function floodFillEdges(d, mask, W, H, bgCol, thold) {
  const Q = new Int32Array(W * H);
  let head = 0, tail = 0;

  const enqueue = (idx) => {
    if (mask[idx]) return;
    const px = px4(d, idx);
    if (colourDist(px, bgCol) <= thold) {
      mask[idx] = 1;
      Q[tail++ % Q.length] = idx;
    }
  };

  for (let x = 0; x < W; x++) { enqueue(x); enqueue((H - 1) * W + x); }
  for (let y = 1; y < H - 1; y++) { enqueue(y * W); enqueue(y * W + W - 1); }

  while (head !== tail) {
    const idx = Q[head++ % Q.length];
    const x = idx % W, y = Math.floor(idx / W);
    if (x > 0)   enqueue(idx - 1);
    if (x < W-1)  enqueue(idx + 1);
    if (y > 0)   enqueue(idx - W);
    if (y < H-1)  enqueue(idx + W);
  }
}

/** Simple box-blur on alpha channel only (1-pass, lightweight). */
function smoothAlpha(d, W, H) {
  const alpha = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = d[i * 4 + 3];

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const avg = (alpha[i - W - 1] + alpha[i - W] + alpha[i - W + 1] +
                   alpha[i - 1] + alpha[i] + alpha[i + 1] +
                   alpha[i + W - 1] + alpha[i + W] + alpha[i + W + 1]) / 9;
      d[i * 4 + 3] = Math.round(avg);
    }
  }
}

/** Extra cleanup: remove tiny semi-transparent edge leftovers that match the background. */
function edgeCleanup(d, W, H, bgCol) {
  const border = Math.max(2, Math.floor(Math.min(W, H) * 0.01));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x > border && x < W - border && y > border && y < H - border) continue;
      const i = (y * W + x) * 4;
      const alpha = d[i + 3];
      if (alpha === 0) continue;
      const dist = colourDist({ r: d[i], g: d[i + 1], b: d[i + 2] }, bgCol);
      if (dist < SEMI_THOLD) d[i + 3] = 0;
    }
  }
}

/** Read RGBA from flat pixel array at linear index. */
function px4(d, i) {
  return { r: d[i * 4], g: d[i * 4 + 1], b: d[i * 4 + 2] };
}

/** Euclidean distance in RGB space. */
function colourDist(a, b) {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
