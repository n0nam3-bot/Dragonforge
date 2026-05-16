// app.js — Application logic for character animation tool
import { SkelEditor } from './skelEditor.js';

// --- Configuration & DOM Elements ---
const els = {
  fileInput: document.querySelector('#fileInput'),
  skelCanvas: document.querySelector('#skelCanvas'),
  previewCanvas: document.querySelector('#previewCanvas'),
  sheetCanvas: document.querySelector('#sheetCanvas'),
  framesSlider: document.querySelector('#framesSlider'),
  sizeSelect: document.querySelector('#sizeSelect'),
  layoutSelect: document.querySelector('#layoutSelect'),
  bakeBtn: document.querySelector('#bakeBtn'),
  exportPNG: document.querySelector('#exportPNG'),
  exportJSON: document.querySelector('#exportJSON'),
  skelBadge: document.querySelector('#skelBadge'),
  poseBadge: document.querySelector('#poseBadge'),
  sheetBadge: document.querySelector('#sheetBadge'),
  toast: document.querySelector('#toast'),
  previewWrap: document.querySelector('#previewWrap'),
  sheetWrap: document.querySelector('#sheetWrap'),
  skelWrap: document.querySelector('#skelWrap'),
};

// State
let editor = null;       // SkelEditor instance
let currentJoints = null; // Stores the JSON of joints
let animationData = [];  // Array of poses if animation support is added later

// --- Initialization ---

// 1. File Upload Logic
els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      // Setup Canvases
      els.skelCanvas.width = els.skelCanvas.width; // reset size if needed
      els.previewCanvas.width = els.previewCanvas.width;
      
      // Draw original image to a temp canvas for background removal (if not already handled in bodyDetect)
      // For this example, we assume `bodyDetect.js` handles the removal and provides a clean `charCanvas` 
      // or we just use the uploaded image.
      
      // NOTE: If bodyDetect exports a function to process, call it here.
      // Assuming `bodyDetect` provides `cleanImage` or similar.
      // If we are just uploading, we load `img` to `els.charCanvas`.
      const charCtx = els.previewWrap.getContext('2d');
      charCtx.drawImage(img, 0, 0);

      // Detect pose
      const joints = detectPose(img); // Placeholder for bodyDetect.js logic
      
      // Initialize Editor
      editor = new SkelEditor(
        els.skelCanvas, 
        els.previewCanvas, // Passing charCanvas as the background context
        joints, 
        (newJoints) => {
          // Callback: Joints changed
          currentJoints = newJoints;
          updateUI();
        }
      );

      // Enable UI
      els.bakeBtn.disabled = false;
      els.exportPNG.disabled = false;
      els.exportJSON.disabled = false;
      els.skelBadge.innerText = "✅ Skeleton Detected";
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// 2. UI Interaction Logic
els.framesSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  // Update preview badge
  els.skelBadge.innerText = val;
  // Trigger a "preview" update (draw current frame N times)
  bakeSheet();
});

els.sizeSelect.addEventListener('change', bakeSheet);
els.layoutSelect.addEventListener('change', bakeSheet);

// 3. Main "Bake" Functionality
// Renders the current skeleton frame into the Sprite Sheet grid
function bakeSheet() {
  if (!editor) return;

  const frames = parseInt(els.framesSlider.value);
  const size = parseInt(els.sizeSelect.value);
  const layout = els.layoutSelect.value;

  // Resize sheet canvas
  const cols = layout === 'grid' ? Math.sqrt(frames) : frames;
  // For horizontal strip: width = frame * size, height = size
  // For grid: height = size * sqrt(frames)
  
  let finalW = size * cols;
  let finalH = size;
  if (layout === 'grid') finalH = size * cols;

  els.sheetCanvas.width = finalW;
  els.sheetCanvas.height = finalH;

  const ctx = els.sheetCanvas.getContext('2d');
  ctx.clearRect(0, 0, finalW, finalH);

  // Draw background grid if needed
  // ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0,0,finalW, finalH);

  // Draw each frame
  for (let i = 0; i < frames; i++) {
    const frameX = i % cols;
    const frameY = Math.floor(i / cols);

    ctx.save();
    
    // Draw the current frame
    ctx.drawImage(els.skelCanvas, frameX * size, frameY * size, size, size);
    
    // Draw frame number
    ctx.font = "12px Arial";
    ctx.fillStyle = "white";
    ctx.fillText(`${i+1}`, frameX * size + size/2 - 10, frameY * size + size - 15);
    
    ctx.restore();
  }

  // Update Badge
  els.sheetBadge.innerText = `⚡ ${frames} frames × ${size}px`;
}

// 4. Update UI Helpers
function updateUI() {
  // If joints change, we might want to trigger a bake on the preview
  // (Though strictly speaking, skelEditor draws its own canvas)
  // The prompt implies `skelEditor` draws to `previewWrap` via charCanvas
  // But let's ensure the skeleton drawing is visible on the main preview
  // (handled by SkelEditor class)
}

// 5. Export Handlers
els.exportPNG.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'character-sheet.png';
  link.href = els.sheetCanvas.toDataURL();
  link.click();
  showToast("PNG Exported!", "success");
});

els.exportJSON.addEventListener('click', () => {
  const data = {
    joints: currentJoints,
    frameCount: parseInt(els.framesSlider.value)
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = 'joints.json';
  link.href = URL.createObjectURL(blob);
  link.click();
  showToast("JSON Exported!", "success");
});

// Toast Helper
function showToast(msg, type = 'info') {
  els.toast.innerText = msg;
  els.toast.className = `toast toast-${type}`;
  setTimeout(() => { els.toast.innerText = ''; }, 3000);
}

// Cleanup on destroy (Optional)
window.addEventListener('beforeunload', () => {
  if (editor) editor.destroy();
});
