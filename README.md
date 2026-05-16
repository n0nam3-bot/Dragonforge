# SideScroller Mesh Rig Animator

A browser-based side-scroller character animator that uses a **soft mesh over the whole silhouette** instead of slicing the sprite into boxes.

## What it does
- Import a character image directly in the browser.
- Auto-remove the background when possible.
- Refine the silhouette with **Lasso** or **Magic wand**.
- Drag joints to fit the character.
- Preview a planted-foot walk cycle with smooth mesh deformation.
- Keep the source image and the preview side by side.
- Zoom and pan the source canvas while editing.

## Controls
- **Auto mask**: attempts a background removal pass.
- **Auto rig**: places the joint rig around the current mask.
- **Move joints**: drag joints to fit the pose.
- **Lasso / Magic wand**: add or erase mask areas.
- **Zoom**: source editor zoom.
- **Facing**: flip the rig direction.
- **Speed / Stride / Bounce / Lean / Arm swing**: walk-cycle tuning.

## Notes
- The app downscales very large imports for smoother browser performance.
- A transparent PNG usually gives the cleanest results.
- For busy backgrounds, use the wand or lasso to isolate the character before rigging.

## Run
Open `index.html` in a modern browser or publish the folder to GitHub Pages.
