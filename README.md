# SideScroller Puppet Studio

A free, static, GitHub Pages-friendly 2D puppet rig editor for side-scroller characters.

## What it does
- Imports a character image directly in the browser
- Keeps the source image and animation preview side by side
- Lets you use **Lasso** or **Magic Wand** to build part masks
- Uses draggable joints and cutout layers instead of mesh warping
- Plays a layered walk cycle with planted-foot motion
- Exports the preview as **PNG** or **WebM**

## Recommended workflow
1. Import your character image.
2. Click **Add Standard Rig**.
3. Pick a part such as torso, head, arm, thigh, or shin.
4. Use **Lasso** or **Wand** to select the visible pixels for that part.
5. Click **Assign to Part**.
6. Click **Pivot** on the part, then click the source image where that part should rotate.
7. Adjust facing, stride, bounce, travel, and arm swing.

## Notes
- This is a single-page static app. It does not need a backend.
- It runs on GitHub Pages because it uses only browser Canvas APIs.
- For the cleanest results, use a character image with a simple background and clear limb separation.
