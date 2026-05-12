// app.js — SpriteSmith Studio v4
// Uses Pollinations.ai (free, no API key) to generate each animation frame
// as a real AI image. Frames are cropped, bg-removed, then baked into a sheet.

import { removeBackground } from './bgremove.js';

// ── Pose catalogue ────────────────────────────────────────────────────────────
const POSES = [
  { id: 'idle',   label: 'IDLE',   ico: '🧍' },
  { id: 'walk',   label: 'WALK',   ico: '🚶' },
  { id: 'run',    label: 'RUN',    ico: '🏃' },
  { id: 'jump',   label: 'JUMP',   ico: '🦘' },
  { id: 'attack', label: 'ATTACK', ico: '⚔️'  },
  { id: 'hurt',   label: 'HURT',   ico: '💢' },
  { id: 'die',    label: 'DIE',    ico: '💀' },
  { id: 'crouch', label: 'CROUCH', ico: '🦆' },
  { id: 'cast',   label: 'CAST',   ico: '✨' },
];

// Per-pose prompt injection — specific body poses for each frame in the cycle
const POSE_FRAMES = {
  idle: [
    'standing upright, relaxed posture, weight on right foot',
    'standing, slight lean left, relaxed arms at sides',
    'standing, breathing in, chest raised slightly',
    'standing upright, relaxed posture, weight on left foot',
    'standing, slight lean right, arms hanging naturally',
    'standing, breathing out, neutral pose',
    'standing, head tilted slightly right',
    'standing upright, neutral idle stance',
    'standing, weight shifted, natural idle pose',
    'standing, slight body sway left',
    'standing, slight body sway right',
    'standing perfectly still, composed pose',
  ],
  walk: [
    'walking, right leg forward extended, left leg back, arms swinging, mid-stride',
    'walking, right leg planted flat on ground, left leg swinging forward, arms mid-swing',
    'walking, left leg forward extended, right leg back, arms counter-swing',
    'walking, left leg planted flat on ground, right leg swinging through, arms swinging',
    'walking, right foot just touching ground in front, left foot pushing off behind',
    'walking, both feet near ground, transitioning between steps',
    'walking, weight fully on right foot, left knee raised, natural stride',
    'walking, weight fully on left foot, right knee raised mid-swing',
    'walking, heel strike right foot, arms fully counter-swung',
    'walking, toe-off left foot, propelling forward, arm fully back',
    'walking, mid-stride between steps, weight evenly distributed',
    'walking, slight forward lean, arms bent at elbow, natural gait',
  ],
  run: [
    'running fast, right leg forward fully extended, left leg behind, arms pumping, airborne',
    'running, right foot landing, left knee driving forward and up, powerful stride',
    'running, left leg fully extended forward, right leg trailing, both feet off ground briefly',
    'running, left foot landing hard, right knee driving up, arms counter-pumping',
    'running, airborne between steps, knees bent, full sprint posture',
    'running, aggressive forward lean, arms bent 90 degrees, high knee drive',
    'running, toe-off right foot, explosive push-off, body low and fast',
    'running, toe-off left foot, explosive push off, maximum forward lean',
    'running, right knee at peak height, arms fully swung, dynamic sprint',
    'running, left knee at peak height, arms at opposite extreme, full sprint',
    'running, floating between strides, arms tight, body streamlined',
    'running, heel-to-toe transition, smooth fast stride',
  ],
  jump: [
    'crouching down preparing to jump, knees bent deep, arms pulled back',
    'launching upward, legs pushing off, arms swinging forward and up',
    'ascending, legs straightening, arms raised overhead',
    'at peak of jump, body fully extended upward, arms high',
    'at apex, knees tucking slightly, looking forward',
    'beginning descent, body starting to fall, arms spread for balance',
    'falling downward, legs beginning to extend toward ground',
    'approaching ground, knees bending to absorb landing',
    'landing, knees bent absorbing impact, arms out for balance',
    'landing impact, crouched low, dust implied, stable',
    'recovering from landing, body rising back upright',
    'fully recovered, standing upright after jump, composed',
  ],
  attack: [
    'raising weapon back in wind-up, coiling for strike, feet planted wide',
    'weapon pulled fully back, body twisted away, maximum tension',
    'beginning forward swing, body uncoiling, weapon starting arc',
    'mid-swing, body fully rotated, weapon slashing through the air',
    'weapon at furthest forward point of slash, full follow-through',
    'follow-through complete, weapon swung past, body extended',
    'recovering, pulling weapon back to guard position',
    'back in defensive guard stance, weapon raised and ready',
    'lunging forward with weapon outstretched, full lunge pose',
    'weapon raised overhead for downward strike, fully cocked',
    'downward strike in progress, weapon angled down, full power',
    'post-strike, standing firm, weapon lowered, ready for next',
  ],
  hurt: [
    'flinching backward, head snapping back, arms raising defensively',
    'recoiling in pain, body bent backward, face showing pain',
    'staggering back, off-balance, arms out for stability',
    'doubled over in pain, one arm clutching wound area',
    'stumbling sideways, legs unsteady, upper body lurching',
    'recovering balance, straightening up, wincing expression',
    'shaking off hit, body steadying, hands up defensively',
    'back in stance, shaken but recovering, guarded posture',
  ],
  die: [
    'taking fatal blow, body jerking back sharply',
    'beginning to fall backward, arms flung wide',
    'falling backward, body at 45 degrees tilting back',
    'collapsing, legs giving way, body dropping',
    'hitting the ground, body crumpling on impact',
    'lying on ground, one arm outstretched, still',
    'completely fallen, motionless on ground, fully prone',
    'lying flat, perfectly still, defeated',
  ],
  crouch: [
    'beginning to crouch, knees bending slightly',
    'crouching halfway down, knees at 90 degrees, low profile',
    'fully crouched low, knees bent fully, body compact',
    'holding full crouch, completely low to ground, still',
    'crouching and peering forward, head raised slightly',
    'shifting weight in crouch, staying low',
    'beginning to rise from crouch, knees starting to extend',
    'rising back to full standing from crouch, completing movement',
  ],
  cast: [
    'raising one hand slowly, beginning to gather magical energy',
    'hand raised high, magical energy visibly gathering around hand',
    'both hands raised, magical energy swirling around them',
    'casting pose, one arm thrust forward releasing spell, energy burst',
    'energy flowing out from hands, spell in progress, glowing',
    'holding sustained cast, magic streaming forward continuously',
    'spell reaching peak intensity, maximum magical output',
    'finishing cast, hands lowering, magical energy dissipating',
    'completing spell, returning to guard stance, satisfied',
    'secondary cast, raising opposite hand with fresh energy',
    'dual-hand cast, both arms forward, double energy release',
    'final pose, magic fully released, standing tall, composed',
  ],
};

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  referenceDataURL: null,
  charDesc:   '',
  artStyle:   'pixel art game sprite, 16-bit style',
  direction:  'right',
  pose:       'walk',
  frameCount: 8,
  frameSize:  128,
  layout:     'horizontal',
  generatedFrames: [],   // Array of { dataURL, canvas }
  sheetCanvas: null,
  animFrameIndex: 0,
  animTimer: null,
};
let cancelRequested = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $           = id => document.getElementById(id);
const uploadZone    = $('uploadZone');
const uploadTrigger = $('uploadTrigger');
const uploadPreview = $('uploadPreview');
const uploadThumb   = $('uploadThumb');
const fileInput     = $('fileInput');
const clearBtn      = $('clearBtn');
const charDesc      = $('charDesc');
const artStyle      = $('artStyle');
const dirGroup      = $('dirGroup');
const poseGrid      = $('poseGrid');
const frameCountGrp = $('frameCountGroup');
const generateBtn   = $('generateBtn');
const genProgress   = $('genProgress');
const genProgFill   = $('genProgFill');
const genProgLabel  = $('genProgLabel');
const cancelBtn     = $('cancelBtn');
const frameStrip    = $('frameStrip');
const sizeSelect    = $('sizeSelect');
const layoutSelect  = $('layoutSelect');
const bakeBtn       = $('bakeBtn');
const exportPNGBtn  = $('exportPNG');
const exportJSONBtn = $('exportJSON');
const previewCanvas = $('previewCanvas');
const previewPlhdr  = $('previewPlaceholder');
const sheetCanvas   = $('sheetCanvas');
const sheetPlhdr    = $('sheetPlaceholder');
const poseBadge     = $('poseBadge');
const sheetBadge    = $('sheetBadge');
const saveBtn       = $('saveBtn');
const loadBtn       = $('loadBtn');
const saveStatus    = $('saveStatus');
const toastEl       = $('toast');
const previewCtx    = previewCanvas.getContext('2d');

// ── Pose grid ─────────────────────────────────────────────────────────────────
POSES.forEach(p => {
  const btn = document.createElement('button');
  btn.className  = 'pose-btn' + (p.id === state.pose ? ' active' : '');
  btn.dataset.id = p.id;
  btn.innerHTML  = `<span class="pose-ico">${p.ico}</span><span class="pose-lbl">${p.label}</span>`;
  btn.addEventListener('click', () => {
    state.pose = p.id;
    poseGrid.querySelectorAll('.pose-btn').forEach(b => b.classList.toggle('active', b.dataset.id === p.id));
  });
  poseGrid.appendChild(btn);
});

// ── Direction toggle ──────────────────────────────────────────────────────────
dirGroup.querySelectorAll('.tog').forEach(btn =>
  btn.addEventListener('click', () => {
    dirGroup.querySelectorAll('.tog').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.direction = btn.dataset.val;
  })
);

// ── Frame count toggle ────────────────────────────────────────────────────────
frameCountGrp.querySelectorAll('.tog').forEach(btn =>
  btn.addEventListener('click', () => {
    frameCountGrp.querySelectorAll('.tog').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.frameCount = parseInt(btn.dataset.val);
  })
);

// ── Upload ────────────────────────────────────────────────────────────────────
uploadTrigger.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleUpload(fileInput.files[0]); });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) handleUpload(f);
});
clearBtn.addEventListener('click', () => {
  state.referenceDataURL = null;
  uploadTrigger.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
});

async function handleUpload(file) {
  const url = URL.createObjectURL(file);
  uploadThumb.src = url;
  uploadTrigger.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
  state.referenceDataURL = url;
  showToast('Reference image loaded ✓', 'ok');
  checkReady();
}

// ── Inputs → state ────────────────────────────────────────────────────────────
charDesc.addEventListener('input', () => { state.charDesc = charDesc.value.trim(); checkReady(); });
artStyle.addEventListener('change', () => { state.artStyle = artStyle.value; });
sizeSelect.addEventListener('change',   () => { state.frameSize = parseInt(sizeSelect.value); });
layoutSelect.addEventListener('change', () => { state.layout = layoutSelect.value; });

function checkReady() {
  generateBtn.disabled = state.charDesc.length < 10;
}

// ── Generate ──────────────────────────────────────────────────────────────────
generateBtn.addEventListener('click', startGeneration);
cancelBtn.addEventListener('click', () => { cancelRequested = true; });

async function startGeneration() {
  const desc  = state.charDesc;
  const total = state.frameCount;
  const pose  = state.pose;
  const dir   = state.direction;
  const style = state.artStyle;

  cancelRequested = false;
  state.generatedFrames = [];
  stopPreviewAnim();

  // UI into generating state
  generateBtn.disabled = true;
  genProgress.classList.remove('hidden');
  frameStrip.classList.remove('hidden');
  frameStrip.innerHTML = '';
  bakeBtn.disabled = true;
  exportPNGBtn.disabled = true;
  exportJSONBtn.disabled = true;
  previewPlhdr.classList.remove('hidden');
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  // Build frame thumbnail placeholders
  const thumbEls = [];
  for (let i = 0; i < total; i++) {
    const div = document.createElement('div');
    div.className = 'frame-thumb loading';
    div.innerHTML = `<span class="frame-num">${i+1}</span>`;
    frameStrip.appendChild(div);
    thumbEls.push(div);
  }

  const poseFramePrompts = POSE_FRAMES[pose] || POSE_FRAMES.idle;

  // Generate frames one at a time to keep consistent seed per character
  for (let i = 0; i < total; i++) {
    if (cancelRequested) break;

    genProgFill.style.width  = `${(i / total) * 100}%`;
    genProgLabel.textContent = `Generating frame ${i+1} of ${total}…`;

    const framePrompt = poseFramePrompts[i % poseFramePrompts.length];
    const dirText     = dir === 'right' ? 'facing right, side view' : 'facing left, side view';
    const negPrompt   = 'blurry, multiple characters, background, watermark, text, logo, duplicate, merged characters, morphed, distorted face, extra limbs, bad anatomy, cropped, frame, border, photo, realistic photo';

    // Build the full prompt
    const prompt = [
      desc,
      framePrompt,
      dirText,
      style,
      'full body character, transparent background, isolated character, game sprite sheet frame, clean sprite',
      'single character only, no background, white or transparent background',
    ].join(', ');

    const imgCanvas = await generateFrame(prompt, negPrompt, i, total);

    if (!imgCanvas) {
      thumbEls[i].classList.add('error');
      thumbEls[i].classList.remove('loading');
      continue;
    }

    // Remove background from generated frame
    let cleaned;
    try {
      cleaned = await removeBackground(canvasToImage(imgCanvas));
    } catch (e) {
      cleaned = imgCanvas;
    }

    const dataURL = cleaned.toDataURL('image/png');
    state.generatedFrames.push({ dataURL, canvas: cleaned });

    // Update thumbnail
    thumbEls[i].classList.remove('loading');
    const img = document.createElement('img');
    img.src = dataURL;
    thumbEls[i].appendChild(img);
  }

  genProgFill.style.width  = '100%';
  genProgLabel.textContent = cancelRequested
    ? `Cancelled — ${state.generatedFrames.length} frames generated`
    : `All ${total} frames generated ✓`;

  generateBtn.disabled = false;
  cancelRequested = false;

  if (state.generatedFrames.length > 0) {
    bakeBtn.disabled = false;
    previewPlhdr.classList.add('hidden');
    poseBadge.textContent = `${pose.toUpperCase()} · ${dir.toUpperCase()} · ${state.generatedFrames.length} FRAMES`;
    startPreviewAnim();
    showToast(`${state.generatedFrames.length} frames ready ✓`, 'ok');
  }
}

// ── Pollinations.ai image generation ─────────────────────────────────────────
async function generateFrame(prompt, negPrompt, frameIndex, totalFrames) {
  // Pollinations.ai flux model — free, no API key, CORS-safe
  // Seed is derived from frame index so adjacent frames share structure
  const seed   = 42000 + frameIndex * 7;
  const width  = 512;
  const height = 512;

  const encodedPrompt = encodeURIComponent(prompt);
  const encodedNeg    = encodeURIComponent(negPrompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux&negative_prompt=${encodedNeg}`;

  try {
    const img = await loadImageFromURL(url);
    const c   = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  } catch (e) {
    console.error('Frame generation failed:', e);
    return null;
  }
}

function loadImageFromURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('timeout')), 45000);
    img.onload  = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('load failed')); };
    img.src = url;
  });
}

function canvasToImage(canvas) {
  const img = new Image();
  img.src = canvas.toDataURL();
  return img;
}

// ── Live preview animation ────────────────────────────────────────────────────
function startPreviewAnim() {
  stopPreviewAnim();
  state.animFrameIndex = 0;
  drawPreviewFrame();
  state.animTimer = setInterval(() => {
    state.animFrameIndex = (state.animFrameIndex + 1) % state.generatedFrames.length;
    drawPreviewFrame();
  }, 120);
}

function stopPreviewAnim() {
  if (state.animTimer) { clearInterval(state.animTimer); state.animTimer = null; }
}

function drawPreviewFrame() {
  if (!state.generatedFrames.length) return;
  const frame = state.generatedFrames[state.animFrameIndex];
  if (!frame) return;

  const DW = previewCanvas.width, DH = previewCanvas.height;
  const c  = frame.canvas;
  previewCtx.clearRect(0, 0, DW, DH);

  // Fit frame into canvas
  const scale = Math.min(DW / c.width, DH / c.height) * 0.9;
  const dx    = (DW - c.width  * scale) / 2;
  const dy    = (DH - c.height * scale) / 2;
  previewCtx.drawImage(c, dx, dy, c.width * scale, c.height * scale);
}

// Resize preview canvas to its container
const resizePreview = () => {
  const wrap = previewCanvas.parentElement;
  const sz   = Math.min(wrap.clientWidth || 400, 480);
  previewCanvas.width = previewCanvas.height = sz;
  drawPreviewFrame();
};
window.addEventListener('resize', resizePreview);
resizePreview();

// ── Bake ──────────────────────────────────────────────────────────────────────
bakeBtn.addEventListener('click', () => {
  if (!state.generatedFrames.length) return;
  bakeBtn.textContent = '⏳ Baking…';
  bakeBtn.disabled = true;

  setTimeout(() => {
    try {
      const frames = state.generatedFrames;
      const fs     = state.frameSize;
      const count  = frames.length;
      const cols   = state.layout === 'grid' ? Math.ceil(Math.sqrt(count)) : count;
      const rows   = state.layout === 'grid' ? Math.ceil(count / cols) : 1;

      const sheet  = document.createElement('canvas');
      sheet.width  = cols * fs;
      sheet.height = rows * fs;
      const sCtx   = sheet.getContext('2d');
      sCtx.clearRect(0, 0, sheet.width, sheet.height);

      const tmp     = document.createElement('canvas');
      tmp.width     = fs; tmp.height = fs;
      const tCtx    = tmp.getContext('2d');

      frames.forEach(({ canvas }, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        tCtx.clearRect(0, 0, fs, fs);
        const scale = Math.min(fs / canvas.width, fs / canvas.height) * 0.92;
        const dx    = (fs - canvas.width  * scale) / 2;
        const dy    = (fs - canvas.height * scale) / 2;
        tCtx.drawImage(canvas, dx, dy, canvas.width * scale, canvas.height * scale);
        sCtx.drawImage(tmp, col * fs, row * fs);
      });

      state.sheetCanvas = sheet;

      sheetCanvas.width  = sheet.width;
      sheetCanvas.height = sheet.height;
      sheetCanvas.getContext('2d').drawImage(sheet, 0, 0);
      sheetPlhdr.classList.add('hidden');
      sheetBadge.textContent = `${count} frames · ${sheet.width}×${sheet.height}px`;
      exportPNGBtn.disabled  = false;
      exportJSONBtn.disabled = false;
      showToast(`Sprite sheet baked (${count} frames) ✓`, 'ok');
    } catch (e) {
      console.error(e);
      showToast('Bake failed.', 'err');
    } finally {
      bakeBtn.textContent = '⚡ BAKE SPRITE SHEET';
      bakeBtn.disabled    = false;
    }
  }, 30);
});

// ── Export ────────────────────────────────────────────────────────────────────
exportPNGBtn.addEventListener('click', () => {
  if (!state.sheetCanvas) return;
  state.sheetCanvas.toBlob(blob => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `spritesmith_${state.pose}_${state.direction}.png`,
    });
    a.click();
  }, 'image/png');
  showToast('PNG exported ↓', 'ok');
});

exportJSONBtn.addEventListener('click', () => {
  if (!state.sheetCanvas) return;
  const fs    = state.frameSize;
  const count = state.generatedFrames.length;
  const cols  = state.layout === 'grid' ? Math.ceil(Math.sqrt(count)) : count;
  const fname = `spritesmith_${state.pose}_${state.direction}`;

  const frames = Array.from({ length: count }, (_, i) => ({
    filename: `${fname}_${String(i).padStart(3,'0')}`,
    frame: { x: (i%cols)*fs, y: Math.floor(i/cols)*fs, w: fs, h: fs },
    rotated: false, trimmed: false,
    spriteSourceSize: { x:0, y:0, w:fs, h:fs },
    sourceSize: { w:fs, h:fs },
    duration: 120,
  }));

  const json = JSON.stringify({
    frames,
    meta: {
      app: 'SpriteSmith Studio', version: '4.0',
      image: `${fname}.png`, format: 'RGBA8888',
      size: { w: state.sheetCanvas.width, h: state.sheetCanvas.height },
      pose: state.pose, direction: state.direction,
      frameCount: count, frameSize: fs, layout: state.layout,
      date: new Date().toISOString(),
    },
  }, null, 2);

  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([json], { type: 'application/json' })),
    download: `${fname}.json`,
  });
  a.click();

  // also export PNG
  exportPNGBtn.click();
  showToast('JSON + PNG exported ↓', 'ok');
});

// ── Save / Load ───────────────────────────────────────────────────────────────
const STORAGE_KEY = 'spritesmithStudio_v4';

saveBtn.addEventListener('click', () => {
  if (!state.generatedFrames.length) { showToast('Generate some frames first.', 'warn'); return; }
  try {
    const payload = {
      charDesc:   state.charDesc,
      artStyle:   state.artStyle,
      direction:  state.direction,
      pose:       state.pose,
      frameCount: state.frameCount,
      frameSize:  state.frameSize,
      layout:     state.layout,
      frames:     state.generatedFrames.map(f => f.dataURL),
      savedAt:    new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    saveStatus.textContent = 'Saved ✓';
    saveStatus.classList.add('visible');
    setTimeout(() => saveStatus.classList.remove('visible'), 2500);
    showToast('Project saved ✓', 'ok');
  } catch (e) {
    showToast('Save failed (storage full?)', 'err');
  }
});

loadBtn.addEventListener('click', async () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { showToast('No saved project found.', 'warn'); return; }
  try {
    const p = JSON.parse(raw);
    state.charDesc   = p.charDesc   || '';
    state.artStyle   = p.artStyle   || state.artStyle;
    state.direction  = p.direction  || 'right';
    state.pose       = p.pose       || 'walk';
    state.frameCount = p.frameCount || 8;
    state.frameSize  = p.frameSize  || 128;
    state.layout     = p.layout     || 'horizontal';

    charDesc.value = state.charDesc;
    artStyle.value = state.artStyle;
    sizeSelect.value   = state.frameSize;
    layoutSelect.value = state.layout;

    dirGroup.querySelectorAll('.tog').forEach(b => b.classList.toggle('active', b.dataset.val === state.direction));
    poseGrid.querySelectorAll('.pose-btn').forEach(b => b.classList.toggle('active', b.dataset.id === state.pose));
    frameCountGrp.querySelectorAll('.tog').forEach(b => b.classList.toggle('active', b.dataset.val === String(state.frameCount)));

    // Restore frames from dataURLs
    showToast('Loading saved frames…', 'ok');
    state.generatedFrames = [];
    stopPreviewAnim();
    frameStrip.classList.remove('hidden');
    frameStrip.innerHTML = '';

    for (const dataURL of (p.frames || [])) {
      const img = await loadImageFromURL(dataURL);
      const c   = document.createElement('canvas');
      c.width   = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      state.generatedFrames.push({ dataURL, canvas: c });

      const div = document.createElement('div');
      div.className = 'frame-thumb';
      const thumb = document.createElement('img');
      thumb.src = dataURL;
      div.appendChild(thumb);
      frameStrip.appendChild(div);
    }

    if (state.generatedFrames.length > 0) {
      bakeBtn.disabled = false;
      previewPlhdr.classList.add('hidden');
      poseBadge.textContent = `${state.pose.toUpperCase()} · ${state.direction.toUpperCase()}`;
      startPreviewAnim();
      checkReady();
      showToast(`Loaded (saved ${timeAgo(p.savedAt)}) ✓`, 'ok');
    }
  } catch (e) {
    console.error(e);
    showToast('Load failed.', 'err');
  }
});

// ── Utilities ─────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type='ok') {
  toastEl.textContent = msg;
  toastEl.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3500);
}

function timeAgo(iso) {
  const m = Math.floor((Date.now()-new Date(iso))/60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`;
}
