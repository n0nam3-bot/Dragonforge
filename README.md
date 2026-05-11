# 🎮 SpriteSmith Studio

A free, browser-based sprite animation tool — no backend, no installs, no API keys.  
Runs entirely from static files, perfect for [GitHub Pages](https://pages.github.com/).

**Live demo:** https://n0nam3-bot.github.io/SpriteSmithStudio

---

## ✨ Features

| Feature | Details |
|---|---|
| **Background removal** | Edge flood-fill algorithm — no external API needed |
| **9 animation poses** | Idle · Walk · Run · Jump · Attack · Hurt · Die · Crouch · Cast |
| **Live canvas preview** | 60 fps animation loop with direction flip (left / right) |
| **Speed control** | 0.25× – 3× playback speed |
| **Sprite sheet baker** | Horizontal strip or grid layout |
| **Frame & size options** | 4–24 frames, 64–256 px per frame |
| **PNG export** | Transparent sprite sheet ready for game engines |
| **JSON export** | Aseprite-compatible metadata + PNG |
| **Browser save / load** | localStorage — work survives tab closes |
| **Mobile friendly** | Responsive layout works on phones and tablets |

---

## 🚀 Deploying to GitHub Pages

1. **Clone / fork** this repo
2. Copy all four files to the repo root:
   ```
   index.html
   style.css
   app.js
   bgremove.js
   animator.js
   spritesheet.js
   ```
3. In repo **Settings → Pages**, set source to `main` branch `/` (root)
4. Visit `https://<your-username>.github.io/<repo-name>`

> **Local testing:** because `app.js` uses ES modules (`import/export`),  
> you need a local HTTP server — not `file://` directly.
> ```bash
> # Python 3
> python -m http.server 8080
> # Node (npx)
> npx serve .
> ```

---

## 🕹 Usage

1. **Upload** — drag-and-drop or browse for a PNG/JPG/WebP character image
2. Background is **automatically removed** (progress bar shown)
3. Pick a **pose** from the grid and watch the live preview
4. Adjust **direction**, **speed**
5. Set **frame count**, **frame size**, **layout** then press **⚡ Bake**
6. **Export PNG** or **Export JSON** (JSON also exports the matching PNG)
7. Press **Save** to keep your work in the browser — **Load** to restore it

---

## 🎨 Tips for best results

- Use images with a **solid, uniform background** (white, green, sky blue)
- Characters on **transparent PNG** backgrounds work instantly
- Aim for a character that **faces right** (the direction toggle will flip it)
- Larger source images (256–512 px tall) produce crisper sprite sheets
- The animation engine splits the character into body regions — clean silhouettes look best

---

## 🛠 How it works (no backend)

| Module | Responsibility |
|---|---|
| `bgremove.js` | BFS edge flood-fill on the raw canvas ImageData |
| `animator.js` | Body region detection + per-pose scanline warp |
| `spritesheet.js` | Bake frames to a single canvas; `toBlob` for PNG; JSON manifest |
| `app.js` | UI, animation loop (`requestAnimationFrame`), localStorage |

All processing happens **in the browser** using the native Canvas 2D API.  
No WebAssembly, no workers, no third-party libraries.

---

## 📦 Export format

The JSON export follows the **Aseprite array format**, compatible with:
- Phaser 3 (`scene.load.atlas`)
- Unity Sprite Editor (with adapter)
- Godot (SpriteFrames via `AtlasTexture`)
- Any engine that reads Aseprite JSON

```json
{
  "frames": [
    {
      "filename": "spritesmith_walk_right_000",
      "frame": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "duration": 100
    }
  ],
  "meta": {
    "pose": "walk",
    "direction": "right",
    "frameCount": 8,
    "frameSize": 128
  }
}
```

---

## 📄 License

MIT — free for personal and commercial use.
