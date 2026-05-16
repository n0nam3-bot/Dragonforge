# SpriteSmith Studio

A browser-based 2D puppet rig tool for side-scroller sprites.

## What this build does
- Side-by-side source and preview panes
- Lasso masking
- Magic-wand style flood selection
- Optional body parts
- Anchor and tip handles for each part
- Mask replace / add / subtract modes
- Feathered mask edges for softer motion
- Walk / idle preview with simple IK-based limbs
- Export project JSON and preview PNG

## How to use
1. Import a sprite image.
2. Add a part from the dropdown.
3. Choose the part in the list.
4. Use lasso or wand on the source image to build the part mask.
5. Drag the A and T handles to line up the pivot and tip.
6. Adjust parent, visibility, and preview settings.

## Notes
- No body part is required.
- The preview uses a procedural walk pose, so exact results depend on the quality of the masks and joint placement.
