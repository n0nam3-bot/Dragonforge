# SpriteSmith Studio — Outline Rig Build

This build uses a manual outline-rig workflow with zoom and pan for precise lasso/wand selection.

## Main workflow
1. Upload a character image.
2. Pick a body part type from the dropdown and add parts as needed.
3. Use **Lasso** or **Magic Wand** to create a mask for the selected part.
4. Drag joints and set parent links in the part editor.
5. Use the **Zoom** slider or mouse wheel, and **Alt-drag** to pan when selecting tight outlines.
6. Preview animation using the pose controls.

## Notes
- Parts are optional; nothing is required.
- Masks are editable per part.
- The cutout uses softened edges to reduce hard seams.
- The old `bodyDetect.js`, `skelEditor.js`, and `animator.js` files are kept for repository compatibility, but the main app runs from `app.js`.


Notes:
- Images load directly into the workspace first, so import is immediate.
- Use lasso or wand to define each part, then drag joints to refine the rig.
