// app.js — SpriteSmith Studio v6.1

import { removeBackground }                              from './bgremove.js';
import { JOINT_DEFS, computeBB, autoPlaceJoints,
         buildPuppet }                                   from './bodyDetect.js';
import { SkelEditor }                                    from './skelEditor.js';
import { POSES, renderFrame }                            from './animator.js';

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  cleanCanvas:   null,
  bb:            null,
  defaultJoints: null,
  joints:        null,
  puppet:        null,
  editor:        null,
  pose:          'idle',
  direction:     'right',
  speed:         1.0,
  frameCount:    8,
  frameSize:     128,
  layout:        'horizontal',
  sheetCanvas:   null,
};
let animPhase=0, lastTime=null, rafId=null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $             = id => document.getElementById(id);
const uploadZone    = $('uploadZone');
const uploadTrigger = $('uploadTrigger');
const uploadPreview = $('uploadPreview');
const uploadThumb   = $('uploadThumb');
const fileInput     = $('fileInput');
const clearBtn      = $('clearBtn');
const bgBar         = $('bgBar');
const progFill      = $('progFill');
const progLabel     = $('progLabel');
const skelNote      = $('skelNote');
const skelControls  = $('skelControls');
const showRegionsCb = $('showRegions');
const showSkelCb    = $('showSkeleton');
const regionLegend  = $('regionLegend');
const resetJoinsBtn = $('resetJointsBtn');
const applyBtn      = $('applyBtn');
const poseGrid      = $('poseGrid');
const dirGroup      = $('dirGroup');
const speedSlider   = $('speedSlider');
const speedVal      = $('speedVal');
const framesSlider  = $('framesSlider');
const framesVal     = $('framesVal');
const sizeSelect    = $('sizeSelect');
const layoutSelect  = $('layoutSelect');
const bakeBtn       = $('bakeBtn');
const exportPNGBtn  = $('exportPNG');
const exportJSONBtn = $('exportJSON');
const skelCanvas    = $('skelCanvas');
const skelPlhdr     = $('skelPlaceholder');
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

const previewCtx = previewCanvas.getContext('2d');
const sheetCtx   = sheetCanvas.getContext('2d');

// ── Region legend ─────────────────────────────────────────────────────────────
JOINT_DEFS.forEach(def => {
  const chip = document.createElement('div');
  chip.className = 'legend-chip';
  chip.innerHTML = `<span class="legend-dot" style="background:${def.color}"></span>${def.label}`;
  regionLegend.appendChild(chip);
});

// ── Pose grid ─────────────────────────────────────────────────────────────────
POSES.forEach(p => {
  const btn = document.createElement('button');
  btn.className  = 'pose-btn'+(p.id===S.pose?' active':'');
  btn.dataset.id = p.id;
  btn.innerHTML  = `<span class="pose-ico">${p.ico}</span><span class="pose-lbl">${p.label}</span>`;
  btn.addEventListener('click', () => {
    S.pose = p.id; animPhase = 0;
    poseGrid.querySelectorAll('.pose-btn').forEach(b=>b.classList.toggle('active',b.dataset.id===p.id));
  });
  poseGrid.appendChild(btn);
});

// ── Controls ──────────────────────────────────────────────────────────────────
dirGroup.querySelectorAll('.tog').forEach(btn =>
  btn.addEventListener('click', () => {
    dirGroup.querySelectorAll('.tog').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); S.direction = btn.dataset.val;
  })
);
speedSlider.addEventListener('input', () => {
  S.speed = parseFloat(speedSlider.value);
  speedVal.textContent = S.speed.toFixed(2)+'×';
});
framesSlider.addEventListener('input', () => {
  S.frameCount = parseInt(framesSlider.value);
  framesVal.textContent = S.frameCount;
});
sizeSelect.addEventListener('change',   () => { S.frameSize = parseInt(sizeSelect.value); });
layoutSelect.addEventListener('change', () => { S.layout = layoutSelect.value; });

// ── Skeleton editor toggles ───────────────────────────────────────────────────
showRegionsCb.addEventListener('change', () => S.editor?.setShowRegions(showRegionsCb.checked));
showSkelCb.addEventListener('change',   () => S.editor?.setShowSkeleton(showSkelCb.checked));
resetJoinsBtn.addEventListener('click', () => {
  if (S.editor && S.defaultJoints) S.editor.resetJoints(S.defaultJoints);
});
applyBtn.addEventListener('click', applyJoints);

// ── Upload ────────────────────────────────────────────────────────────────────
uploadTrigger.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if(fileInput.files[0]) handleFile(fileInput.files[0]); });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) handleFile(f);
});
clearBtn.addEventListener('click', resetAll);

function resetAll() {
  S.cleanCanvas=S.bb=S.defaultJoints=S.joints=S.puppet=null;
  if (S.editor) { S.editor.destroy(); S.editor=null; }
  stopAnimation();
  uploadTrigger.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  bgBar.classList.add('hidden');
  skelPlhdr.classList.remove('hidden');
  previewPlhdr.classList.remove('hidden');
  sheetPlhdr.classList.remove('hidden');
  skelNote.textContent = 'Upload a character to begin skeleton setup.';
  skelControls.classList.add('hidden');
  bakeBtn.disabled = exportPNGBtn.disabled = exportJSONBtn.disabled = applyBtn.disabled = true;
  previewCtx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
  sheetCtx.clearRect(0,0,sheetCanvas.width,sheetCanvas.height);
}

async function handleFile(file) {
  const objURL = URL.createObjectURL(file);
  const img    = new Image();
  await new Promise((res,rej) => { img.onload=res; img.onerror=rej; img.src=objURL; });

  uploadThumb.src = objURL;
  uploadTrigger.classList.add('hidden');
  uploadPreview.classList.remove('hidden');
  bgBar.classList.remove('hidden');
  setProgress(0,'Removing background…');

  let cleaned;
  try {
    cleaned = await removeBackground(img, p => setProgress(p*0.80, bgLabel(p)));
    URL.revokeObjectURL(objURL);
    uploadThumb.src = cleaned.toDataURL();
  } catch(e) {
    console.error(e); showToast('Background removal failed.','err');
    bgBar.classList.add('hidden'); return;
  }

  setProgress(0.85,'Analysing character…'); await tick();
  const bb = computeBB(cleaned);
  if (!bb) { showToast('No character detected.','warn'); bgBar.classList.add('hidden'); return; }

  S.cleanCanvas   = cleaned;
  S.bb            = bb;
  S.defaultJoints = autoPlaceJoints(cleaned, bb);
  S.joints        = JSON.parse(JSON.stringify(S.defaultJoints));

  setProgress(1,'Done!'); await tick();
  bgBar.classList.add('hidden');

  initSkelEditor();
  skelNote.textContent = 'Drag joints onto your character, then click Apply.';
  skelControls.classList.remove('hidden');
  applyBtn.disabled = false;
  showToast('Character loaded — adjust skeleton then click Apply ✓','ok');
}

// ── Skeleton editor ───────────────────────────────────────────────────────────
function initSkelEditor() {
  if (S.editor) { S.editor.destroy(); S.editor=null; }
  skelPlhdr.classList.add('hidden');
  fitSkelCanvas();
  S.editor = new SkelEditor(
    skelCanvas, S.cleanCanvas, S.joints,
    updatedJoints => { S.joints = updatedJoints; }
  );
  S.editor.setShowRegions(showRegionsCb.checked);
  S.editor.setShowSkeleton(showSkelCb.checked);
}

function fitSkelCanvas() {
  const wrap = skelCanvas.parentElement;
  skelCanvas.width  = Math.max(200, wrap.clientWidth  || 500);
  skelCanvas.height = Math.max(200, wrap.clientHeight || 500);
}

// ── Apply joints → build puppet → start animation ────────────────────────────
function applyJoints() {
  if (!S.cleanCanvas || !S.joints) return;
  applyBtn.textContent = '⏳ Building…';
  applyBtn.disabled    = true;

  setTimeout(() => {
    try {
      const puppet = buildPuppet(S.cleanCanvas, S.editor ? S.editor.getJoints() : S.joints);
      if (!puppet) { showToast('Puppet build failed.','err'); return; }
      S.puppet = puppet;
      previewPlhdr.classList.add('hidden');
      bakeBtn.disabled = false;
      startAnimation();
      const partCount = Object.values(puppet.parts).filter(Boolean).length;
      showToast(`Puppet built — ${partCount} regions ✓`,'ok');
    } catch(e) {
      console.error(e); showToast('Error building puppet.','err');
    } finally {
      applyBtn.textContent = '✓ Apply';
      applyBtn.disabled    = false;
    }
  }, 30);
}

// ── Animation loop ────────────────────────────────────────────────────────────
function startAnimation() {
  stopAnimation(); lastTime=null; animPhase=0;
  rafId = requestAnimationFrame(loop);
}
function stopAnimation() { if(rafId){cancelAnimationFrame(rafId);rafId=null;} }

function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (!S.puppet) return;
  const dt  = lastTime ? (now-lastTime)/1000 : 0;
  lastTime  = now;
  const oneShot = ['die','crouch'];
  if (oneShot.includes(S.pose)) animPhase = Math.min(animPhase+dt*S.speed*0.55, 0.999);
  else                          animPhase = (animPhase+dt*S.speed*0.72) % 1;

  const wrap = previewCanvas.parentElement;
  const sz   = Math.min(wrap.clientWidth||320, wrap.clientHeight||320, 480);
  if (previewCanvas.width!==sz||previewCanvas.height!==sz)
    previewCanvas.width = previewCanvas.height = sz;

  renderFrame(previewCtx, S.puppet, S.pose, animPhase, S.direction);
  poseBadge.textContent = `${S.pose.toUpperCase()} · ${S.direction.toUpperCase()}`;
}

// ── Bake ──────────────────────────────────────────────────────────────────────
bakeBtn.addEventListener('click', () => {
  if (!S.puppet) return;
  bakeBtn.textContent='⏳ Baking…'; bakeBtn.disabled=true;
  setTimeout(() => {
    try {
      const fs=S.frameSize, count=S.frameCount;
      const cols=S.layout==='grid'?Math.ceil(Math.sqrt(count)):count;
      const rows=S.layout==='grid'?Math.ceil(count/cols):1;
      const sheet=document.createElement('canvas');
      sheet.width=cols*fs; sheet.height=rows*fs;
      const sCtx=sheet.getContext('2d');
      sCtx.clearRect(0,0,sheet.width,sheet.height);
      const tmp=document.createElement('canvas');
      tmp.width=tmp.height=fs;
      const tCtx=tmp.getContext('2d');
      for(let f=0;f<count;f++){
        tCtx.clearRect(0,0,fs,fs);
        renderFrame(tCtx,S.puppet,S.pose,f/count,S.direction);
        sCtx.drawImage(tmp,(f%cols)*fs,Math.floor(f/cols)*fs);
      }
      S.sheetCanvas=sheet;
      sheetCanvas.width=sheet.width; sheetCanvas.height=sheet.height;
      sheetCtx.clearRect(0,0,sheetCanvas.width,sheetCanvas.height);
      sheetCtx.drawImage(sheet,0,0);
      sheetPlhdr.classList.add('hidden');
      sheetBadge.textContent=`${count} frames · ${sheet.width}×${sheet.height}px`;
      exportPNGBtn.disabled=exportJSONBtn.disabled=false;
      showToast(`Sprite sheet baked (${count} frames) ✓`,'ok');
    } catch(e){ console.error(e); showToast('Bake failed.','err'); }
    finally{ bakeBtn.textContent='⚡ BAKE SPRITE SHEET'; bakeBtn.disabled=false; }
  }, 30);
});

// ── Export ────────────────────────────────────────────────────────────────────
exportPNGBtn.addEventListener('click', () => {
  if (!S.sheetCanvas) return;
  S.sheetCanvas.toBlob(blob => {
    Object.assign(document.createElement('a'),{
      href:URL.createObjectURL(blob),
      download:`spritesmith_${S.pose}_${S.direction}.png`,
    }).click();
  },'image/png');
  showToast('PNG exported ↓','ok');
});

exportJSONBtn.addEventListener('click', () => {
  if (!S.sheetCanvas) return;
  const fs=S.frameSize, count=S.frameCount;
  const cols=S.layout==='grid'?Math.ceil(Math.sqrt(count)):count;
  const fname=`spritesmith_${S.pose}_${S.direction}`;
  const frames=Array.from({length:count},(_,i)=>({
    filename:`${fname}_${String(i).padStart(3,'0')}`,
    frame:{x:(i%cols)*fs,y:Math.floor(i/cols)*fs,w:fs,h:fs},
    rotated:false,trimmed:false,
    spriteSourceSize:{x:0,y:0,w:fs,h:fs},
    sourceSize:{w:fs,h:fs},duration:100,
  }));
  const json=JSON.stringify({frames,meta:{
    app:'SpriteSmith Studio',version:'6.1',image:`${fname}.png`,
    format:'RGBA8888',size:{w:S.sheetCanvas.width,h:S.sheetCanvas.height},
    pose:S.pose,direction:S.direction,frameCount:count,frameSize:fs,
    layout:S.layout,date:new Date().toISOString(),
  }},null,2);
  Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([json],{type:'application/json'})),
    download:`${fname}.json`,
  }).click();
  exportPNGBtn.click();
  showToast('JSON + PNG exported ↓','ok');
});

// ── Save / Load ───────────────────────────────────────────────────────────────
const KEY='spritesmithStudio_v6';
saveBtn.addEventListener('click', () => {
  if (!S.cleanCanvas) { showToast('Upload a character first.','warn'); return; }
  try {
    const j = S.editor ? S.editor.getJoints() : S.joints;
    localStorage.setItem(KEY, JSON.stringify({
      charDataURL: S.cleanCanvas.toDataURL('image/png'),
      joints: j,
      pose:S.pose, direction:S.direction, speed:S.speed,
      frameCount:S.frameCount, frameSize:S.frameSize, layout:S.layout,
      savedAt:new Date().toISOString(),
    }));
    saveStatus.textContent='Saved ✓'; saveStatus.classList.add('visible');
    setTimeout(()=>saveStatus.classList.remove('visible'),2500);
    showToast('Project saved ✓','ok');
  } catch(e){ showToast('Save failed (storage full?)','err'); }
});

loadBtn.addEventListener('click', async () => {
  const raw=localStorage.getItem(KEY);
  if (!raw) { showToast('No saved project found.','warn'); return; }
  try {
    const p=JSON.parse(raw);
    // restore settings
    S.pose=p.pose||'idle'; S.direction=p.direction||'right';
    S.speed=p.speed||1; S.frameCount=p.frameCount||8;
    S.frameSize=p.frameSize||128; S.layout=p.layout||'horizontal';
    S.joints=p.joints;

    speedSlider.value=S.speed; speedVal.textContent=S.speed.toFixed(2)+'×';
    framesSlider.value=S.frameCount; framesVal.textContent=S.frameCount;
    sizeSelect.value=S.frameSize; layoutSelect.value=S.layout;
    poseGrid.querySelectorAll('.pose-btn').forEach(b=>b.classList.toggle('active',b.dataset.id===S.pose));
    dirGroup.querySelectorAll('.tog').forEach(b=>b.classList.toggle('active',b.dataset.val===S.direction));

    showToast('Loading…','ok');
    const img=new Image();
    await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=p.charDataURL;});
    const c=document.createElement('canvas');
    c.width=img.naturalWidth; c.height=img.naturalHeight;
    c.getContext('2d').drawImage(img,0,0);

    uploadThumb.src=p.charDataURL;
    uploadTrigger.classList.add('hidden'); uploadPreview.classList.remove('hidden');

    S.cleanCanvas=c;
    S.bb=computeBB(c);
    S.defaultJoints=autoPlaceJoints(c, S.bb);

    initSkelEditor();
    if (S.editor && S.joints) S.editor.resetJoints(S.joints);

    skelNote.textContent='Skeleton loaded. Adjust then click Apply.';
    skelControls.classList.remove('hidden');
    applyBtn.disabled=false;
    showToast(`Loaded (saved ${timeAgo(p.savedAt)}) ✓`,'ok');
  } catch(e){ console.error(e); showToast('Load failed.','err'); }
});

// ── Resize observers ──────────────────────────────────────────────────────────
new ResizeObserver(() => { fitSkelCanvas(); S.editor?.draw(); })
  .observe(skelCanvas.parentElement);

new ResizeObserver(() => {
  const wrap=previewCanvas.parentElement;
  const sz=Math.min(wrap.clientWidth||320,480);
  previewCanvas.width=previewCanvas.height=sz;
  if(S.puppet) renderFrame(previewCtx,S.puppet,S.pose,animPhase,S.direction);
}).observe(previewCanvas.parentElement);

// ── Utilities ─────────────────────────────────────────────────────────────────
function setProgress(pct,label) {
  progFill.style.width=(Math.min(pct,1)*100)+'%';
  if(label) progLabel.textContent=label;
}
const bgLabel=p=>p<0.15?'Sampling edges…':p<0.55?'Removing background…':p<0.85?'Smoothing edges…':'Done!';
let toastTimer=null;
function showToast(msg,type='ok') {
  toastEl.textContent=msg; toastEl.className=`toast ${type} show`;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastEl.classList.remove('show'),3500);
}
function timeAgo(iso) {
  const m=Math.floor((Date.now()-new Date(iso))/60000);
  if(m<1)return'just now';if(m<60)return`${m}m ago`;
  const h=Math.floor(m/60);return h<24?`${h}h ago`:`${Math.floor(h/24)}d ago`;
}
function tick(){return new Promise(r=>setTimeout(r,0));}
