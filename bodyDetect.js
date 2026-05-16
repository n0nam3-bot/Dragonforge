// bodyDetect.js — rig helpers for a manual puppet workflow

export const PART_LIBRARY = [
  { kind: 'torso',      label: 'Torso' },
  { kind: 'hips',       label: 'Hips' },
  { kind: 'pelvis',     label: 'Pelvis' },
  { kind: 'head',       label: 'Head' },
  { kind: 'neck',       label: 'Neck' },
  { kind: 'hair',       label: 'Hair' },
  { kind: 'upperArmL',  label: 'Upper Arm L' },
  { kind: 'lowerArmL',  label: 'Forearm L' },
  { kind: 'handL',      label: 'Hand L' },
  { kind: 'upperArmR',  label: 'Upper Arm R' },
  { kind: 'lowerArmR',  label: 'Forearm R' },
  { kind: 'handR',      label: 'Hand R' },
  { kind: 'upperLegL',  label: 'Thigh L' },
  { kind: 'lowerLegL',  label: 'Shin L' },
  { kind: 'footL',      label: 'Foot L' },
  { kind: 'upperLegR',  label: 'Thigh R' },
  { kind: 'lowerLegR',  label: 'Shin R' },
  { kind: 'footR',      label: 'Foot R' },
  { kind: 'weapon',     label: 'Weapon' },
  { kind: 'shield',     label: 'Shield' },
  { kind: 'cape',       label: 'Cape' },
  { kind: 'accessory',  label: 'Accessory' },
];

export const PART_COLORS = {
  torso: '#8a6dff', hips: '#61d5ff', pelvis: '#61d5ff', head: '#ffbf52', neck: '#ffd86b', hair: '#ff7ab8',
  upperArmL: '#5de38d', lowerArmL: '#7adf9b', handL: '#9eeab8', upperArmR: '#5de38d', lowerArmR: '#7adf9b', handR: '#9eeab8',
  upperLegL: '#ff8f6b', lowerLegL: '#ffb08f', footL: '#ffd0bb', upperLegR: '#ff8f6b', lowerLegR: '#ffb08f', footR: '#ffd0bb',
  weapon: '#d9d9ff', shield: '#d9d9ff', cape: '#b28cff', accessory: '#c1c7db',
};

export function normalizeKind(kind = '') {
  const k = String(kind).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (k === 'upperarml' || k === 'armupperl' || k === 'bicepl') return 'upperArmL';
  if (k === 'lowerarml' || k === 'forearml' || k === 'armlowerl' || k === 'elbowl') return 'lowerArmL';
  if (k === 'handl' || k === 'palml') return 'handL';
  if (k === 'upperarmr' || k === 'armupperr' || k === 'bicepr') return 'upperArmR';
  if (k === 'lowerarmr' || k === 'forearmr' || k === 'armlowerr' || k === 'elbowr') return 'lowerArmR';
  if (k === 'handr' || k === 'palmr') return 'handR';
  if (k === 'upperlegl' || k === 'thighl' || k === 'legupperl') return 'upperLegL';
  if (k === 'lowerlegl' || k === 'shinl' || k === 'calfl' || k === 'leglowerl') return 'lowerLegL';
  if (k === 'footl' || k === 'bootl' || k === 'shoel') return 'footL';
  if (k === 'upperlegr' || k === 'thighr' || k === 'legupperr') return 'upperLegR';
  if (k === 'lowerlegr' || k === 'shinr' || k === 'calfr' || k === 'leglowerr') return 'lowerLegR';
  if (k === 'footr' || k === 'bootr' || k === 'shoer') return 'footR';
  if (k === 'torso' || k === 'chest' || k === 'body' || k === 'spine' || k === 'core') return 'torso';
  if (k === 'hips' || k === 'hip') return 'hips';
  if (k === 'pelvis') return 'pelvis';
  if (k === 'neck') return 'neck';
  if (k === 'head') return 'head';
  if (k === 'hair') return 'hair';
  if (k === 'weapon') return 'weapon';
  if (k === 'shield') return 'shield';
  if (k === 'cape') return 'cape';
  return 'accessory';
}

export function partColor(kind) {
  return PART_COLORS[normalizeKind(kind)] || PART_COLORS.accessory;
}

export function humanLabel(kind) {
  const k = normalizeKind(kind);
  const found = PART_LIBRARY.find(p => p.kind === k);
  return found ? found.label : kind || 'Part';
}

export function computeBB(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = canvas;
  if (!W || !H) return null;
  const img = ctx.getImageData(0, 0, W, H).data;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = img[(y * W + x) * 4 + 3];
      if (a > 20) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function clampRect(rect, W, H) {
  const out = { ...rect };
  const minSize = 8;
  out.w = Math.max(minSize, Math.min(out.w, W));
  out.h = Math.max(minSize, Math.min(out.h, H));
  out.x = Math.max(0, Math.min(out.x, W - out.w));
  out.y = Math.max(0, Math.min(out.y, H - out.h));
  return out;
}

export function createBlankPart(kind, sourceW, sourceH) {
  const k = normalizeKind(kind);
  const cx = sourceW * 0.5;
  const cy = sourceH * 0.5;
  const w = Math.max(28, Math.round(sourceW * 0.22));
  const h = Math.max(28, Math.round(sourceH * 0.22));
  return {
    id: crypto.randomUUID(),
    kind: k,
    label: humanLabel(k),
    color: partColor(k),
    parentId: null,
    z: 0,
    visible: true,
    srcRect: { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h },
    pivotLocal: { x: Math.round(w * 0.5), y: Math.round(h * 0.5) },
  };
}

export function createStarterRig(bb, sourceW, sourceH) {
  if (!bb) return [];
  const cx = bb.x + bb.w * 0.5;
  const top = bb.y;
  const bottom = bb.y + bb.h;
  const left = bb.x;
  const right = bb.x + bb.w;
  const midY = bb.y + bb.h * 0.46;
  const shoulderY = bb.y + bb.h * 0.30;
  const hipY = bb.y + bb.h * 0.58;
  const headH = Math.max(18, bb.h * 0.22);
  const torsoW = Math.max(30, bb.w * 0.42);
  const torsoH = Math.max(38, bb.h * 0.30);
  const armW = Math.max(14, bb.w * 0.16);
  const armH = Math.max(24, bb.h * 0.24);
  const legW = Math.max(16, bb.w * 0.18);
  const legH = Math.max(34, bb.h * 0.30);
  const footW = Math.max(16, bb.w * 0.15);
  const footH = Math.max(12, bb.h * 0.10);

  const make = (kind, x, y, w, h, pivotX = w * 0.5, pivotY = h * 0.5) => ({
    id: crypto.randomUUID(),
    kind,
    label: humanLabel(kind),
    color: partColor(kind),
    parentId: null,
    z: 0,
    visible: true,
    srcRect: clampRect({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }, sourceW, sourceH),
    pivotLocal: { x: Math.round(pivotX), y: Math.round(pivotY) },
  });

  const torso = make('torso', cx - torsoW / 2, midY - torsoH * 0.2, torsoW, torsoH, torsoW * 0.5, torsoH * 0.35);
  const hips = make('hips', cx - torsoW * 0.25, hipY, torsoW * 0.5, Math.max(18, torsoH * 0.35), torsoW * 0.5, torsoH * 0.2);
  const head = make('head', cx - torsoW * 0.32, top - headH * 0.45, torsoW * 0.64, headH, torsoW * 0.5, headH * 0.55);
  const neck = make('neck', cx - torsoW * 0.10, top + headH * 0.45, torsoW * 0.20, Math.max(12, bb.h * 0.05), torsoW * 0.5, 2);
  const upperArmL = make('upperArmL', left - armW * 0.2, shoulderY, armW, armH, armW * 0.5, armW * 0.15);
  const lowerArmL = make('lowerArmL', left - armW * 0.15, shoulderY + armH * 0.80, armW, armH, armW * 0.5, 2);
  const handL = make('handL', left - armW * 0.10, shoulderY + armH * 1.55, armW * 0.9, Math.max(10, armH * 0.30), armW * 0.45, 2);
  const upperArmR = make('upperArmR', right - armW * 0.8, shoulderY, armW, armH, armW * 0.5, armW * 0.15);
  const lowerArmR = make('lowerArmR', right - armW * 0.85, shoulderY + armH * 0.80, armW, armH, armW * 0.5, 2);
  const handR = make('handR', right - armW * 0.80, shoulderY + armH * 1.55, armW * 0.9, Math.max(10, armH * 0.30), armW * 0.45, 2);
  const upperLegL = make('upperLegL', cx - legW * 1.05, hipY + 3, legW, legH, legW * 0.5, 4);
  const lowerLegL = make('lowerLegL', cx - legW * 1.08, hipY + legH * 0.84, legW, legH, legW * 0.5, 4);
  const footL = make('footL', cx - legW * 1.08, bottom - footH * 1.2, footW, footH, footW * 0.20, footH * 0.5);
  const upperLegR = make('upperLegR', cx + legW * 0.10, hipY + 3, legW, legH, legW * 0.5, 4);
  const lowerLegR = make('lowerLegR', cx + legW * 0.08, hipY + legH * 0.84, legW, legH, legW * 0.5, 4);
  const footR = make('footR', cx + legW * 0.06, bottom - footH * 1.2, footW, footH, footW * 0.75, footH * 0.5);
  const hair = make('hair', cx - torsoW * 0.25, top - headH * 0.7, torsoW * 0.52, headH * 0.9, torsoW * 0.50, headH * 0.45);

  torso.parentId = null;
  hips.parentId = torso.id;
  neck.parentId = torso.id;
  head.parentId = neck.id;
  hair.parentId = head.id;
  upperArmL.parentId = torso.id;
  lowerArmL.parentId = upperArmL.id;
  handL.parentId = lowerArmL.id;
  upperArmR.parentId = torso.id;
  lowerArmR.parentId = upperArmR.id;
  handR.parentId = lowerArmR.id;
  upperLegL.parentId = hips.id;
  lowerLegL.parentId = upperLegL.id;
  footL.parentId = lowerLegL.id;
  upperLegR.parentId = hips.id;
  lowerLegR.parentId = upperLegR.id;
  footR.parentId = lowerLegR.id;

  const parts = [torso, hips, neck, head, hair, upperArmL, lowerArmL, handL, upperArmR, lowerArmR, handR, upperLegL, lowerLegL, footL, upperLegR, lowerLegR, footR];
  parts.forEach((p, i) => (p.z = i));
  return parts;
}

export function duplicatePart(part) {
  return {
    ...structuredClone(part),
    id: crypto.randomUUID(),
    label: `${part.label} Copy`,
    srcRect: structuredClone(part.srcRect),
    pivotLocal: structuredClone(part.pivotLocal),
  };
}

export function capturePartCanvas(sourceCanvas, part) {
  const out = document.createElement('canvas');
  const rect = clampRect(part.srcRect, sourceCanvas.width, sourceCanvas.height);
  out.width = Math.max(1, Math.round(rect.w));
  out.height = Math.max(1, Math.round(rect.h));
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sourceCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, out.width, out.height);
  return out;
}

export function enrichParts(sourceCanvas, parts) {
  const byId = new Map();
  const out = parts.map(p => {
    const rect = clampRect(p.srcRect, sourceCanvas.width, sourceCanvas.height);
    const pivotLocal = {
      x: Math.max(0, Math.min(rect.w, p.pivotLocal?.x ?? rect.w * 0.5)),
      y: Math.max(0, Math.min(rect.h, p.pivotLocal?.y ?? rect.h * 0.5)),
    };
    const item = {
      ...structuredClone(p),
      kind: normalizeKind(p.kind || p.label),
      label: p.label || humanLabel(p.kind),
      color: p.color || partColor(p.kind || p.label),
      srcRect: rect,
      pivotLocal,
      canvas: capturePartCanvas(sourceCanvas, { ...p, srcRect: rect }),
    };
    item.pivotAbs = { x: rect.x + pivotLocal.x, y: rect.y + pivotLocal.y };
    byId.set(item.id, item);
    return item;
  });

  const roots = out.filter(p => !p.parentId || !byId.has(p.parentId));
  out.forEach(p => {
    const parent = p.parentId ? byId.get(p.parentId) : null;
    p.localOffset = parent ? { x: p.pivotAbs.x - parent.pivotAbs.x, y: p.pivotAbs.y - parent.pivotAbs.y } : { x: 0, y: 0 };
  });

  return { parts: out, byId, roots };
}

export function computeRigAnchor(parts) {
  if (!parts?.length) return { x: 0, y: 0 };
  const torso = parts.find(p => normalizeKind(p.kind) === 'torso') || parts.find(p => normalizeKind(p.kind) === 'hips') || parts.find(p => !p.parentId) || parts[0];
  return torso ? torso.pivotAbs || { x: torso.srcRect.x + torso.pivotLocal.x, y: torso.srcRect.y + torso.pivotLocal.y } : { x: 0, y: 0 };
}

export function buildRig(sourceCanvas, parts) {
  if (!sourceCanvas) return null;
  const bb = computeBB(sourceCanvas);
  const enriched = enrichParts(sourceCanvas, parts || []);
  const anchor = computeRigAnchor(enriched.parts);
  return {
    sourceCanvas,
    bb,
    parts: enriched.parts,
    byId: enriched.byId,
    roots: enriched.roots,
    anchor,
  };
}
