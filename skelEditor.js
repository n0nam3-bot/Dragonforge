// skelEditor.js — Manages skeleton drawing and interaction
export class SkelEditor {
  constructor(canvas, charCanvas, initialJoints, onUpdate) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bgCanvas = charCanvas;
    this.joints = initialJoints || [];
    this.onUpdate = onUpdate;
    
    this.editingIndex = null; // Index of joint currently being moved
    this.offset = { x: 0, y: 0 }; // For drag compensation
    
    this.setupEvents();
    this.draw();
  }

  // --- Drawing Logic ---
  draw() {
    if (!this.bgCanvas) return;

    // 1. Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Draw background image (from charCanvas)
    // Assuming charCanvas matches size of skelCanvas
    this.ctx.drawImage(this.bgCanvas, 0, 0, this.canvas.width, this.canvas.height);

    // 3. Draw Skeleton Lines
    if (this.joints.length >= 2) {
      this.ctx.strokeStyle = '#ff0000';
      this.ctx.lineWidth = 3;
      this.ctx.lineCap = 'round';
      
      this.ctx.beginPath();
      this.ctx.moveTo(this.getJointPos(this.joints[0])) // First joint
      for (let i = 1; i < this.joints.length; i++) {
        this.ctx.lineTo(this.getJointPos(this.joints[i]));
      }
      this.ctx.stroke();

      // Draw Joints (Circles)
      this.joints.forEach((joint, i) => {
        const x = this.getJointPos(joint);
        const y = this.getJointPos(joint);
        
        // Joint Body
        this.ctx.beginPath();
        this.ctx.arc(x, y, 6, 0, Math.PI * 2);
        this.ctx.fillStyle = (i === 0 || i === 1) ? '#ffff00' : '#00ffff'; // Highlight head/shoulders
        this.ctx.fill();

        // Editing Ring
        if (this.editingIndex === i) {
          this.ctx.beginPath();
          this.ctx.arc(x, y, 10, 0, Math.PI * 2);
          this.ctx.strokeStyle = 'white';
          this.ctx.stroke();
          
          // Selection Handle (Cursor)
          this.ctx.beginPath();
          this.ctx.arc(x, y, 3, 0, Math.PI * 2);
          this.ctx.fillStyle = '#000';
          this.ctx.fill();
        }
      });
    }
  }

  // --- Interaction Logic ---
  setupEvents() {
    const canvas = this.canvas;
    
    // Mouse Down (Start Dragging)
    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.findNearestJoint(mouseX, mouseY).then((index) => {
        if (index !== null) {
          this.editingIndex = index;
          this.draw(); // Redraw with editing ring
          this.canvas.style.cursor = 'move';
        } else {
          this.editingIndex = null;
        }
      });
    });

    // Mouse Move (Drag Joint)
    canvas.addEventListener('mousemove', (e) => {
      if (this.editingIndex !== null) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update joint position in array
        this.joints[this.editingIndex].x = x;
        this.joints[this.editingIndex].y = y;

        // Normalize if needed (e.g., keep head at top) - Optional logic here
        this.draw();
      }
    });

    // Mouse Up (Finish Dragging)
    canvas.addEventListener('mouseup', () => {
      if (this.editingIndex !== null) {
        // Commit change to state
        this.updateJoints();
        this.editingIndex = null;
        this.canvas.style.cursor = 'default';
      }
    });
  }

  // Helper: Get coordinate of a joint
  getJointPos(joint) {
    // Convert normalized coordinates (0-1) to pixel coordinates based on canvas size
    // If your `joints` object stores normalized x/y (0 to 1), multiply by canvas width/height
    const x = joint.x * this.canvas.width;
    const y = joint.y * this.canvas.height;
    return { x, y };
  }

  // Helper: Find joint under mouse
  findNearestJoint(mouseX, mouseY) {
    return new Promise((resolve) => {
      if (!this.joints.length) return resolve(null);

      const { width, height } = this.canvas;
      let minDist = Infinity;
      let index = null;

      this.joints.forEach((joint, i) => {
        const jx = joint.x * width;
        const jy = joint.y * height;
        const dist = Math.sqrt((jx - mouseX) ** 2 + (jy - mouseY) ** 2);
        
        if (dist < minDist && dist < 10) { // 10px radius hit box
          minDist = dist;
          index = i;
        }
      });
      resolve(index);
    });
  }

  // Method: Update state and notify parent
  updateJoints() {
    this.onUpdate(this.joints);
  }
}
