# SpriteSmith Studio — Outline Rig Build

This build replaces the old auto-slicing workflow with a manual outline-rig workflow.

## Main workflow
1. Upload a character image.
2. Pick a body part type from the dropdown and add parts as needed.
3. Choose **Lasso** or **Magic Wand** and create a mask for the selected part.
4. Drag joints and set parent links in the part editor.
5. Preview animation using the pose controls.

## Notes
- Parts are optional; nothing is required.
- Masks are editable per part.
- The old `bodyDetect.js`, `skelEditor.js`, and `animator.js` files are kept for repository compatibility, but the new app runs from `app.js` and no longer depends on the old slicer.
