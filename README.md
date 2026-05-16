# SideScroller Rig Animator

A browser-based 2D sprite animator for side-scroller characters.

## What this build does
- Keeps the source image and animated preview side by side.
- Uses manual body-part masks instead of box slicing.
- Supports lasso and magic-wand masking on each part.
- Uses a planted-foot walk cycle with draggable rig joints.
- Supports zoom and pan in the source editor.

## How to use
1. Open `index.html` in a browser or host the folder on GitHub Pages.
2. Import a sprite.
3. Click **Smart split** to create initial part masks.
4. Pick a part and refine it with **Lasso** or **Magic wand**.
5. Drag joints in **Move joints** mode.
6. Tweak walk sliders and preview the result.

## Notes
- Best results come from a transparent-background full-body sprite.
- The smart split is a starting point; manual mask refinement is still expected.
- The app is static and does not require any build step.
