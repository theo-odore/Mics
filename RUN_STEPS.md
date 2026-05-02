# Run & Test — Premium Ambient Player UI

This document explains how to run, test, and tweak the new premium glass/ambient UI added to this project.

Prerequisites
- Node.js (14+) and npm installed
- The repository already contains the updated files: `src/App.jsx` and `src/index.css`.

Quick start (development)
1. Install dependencies (if you haven't already):

```bash
npm install
```

2. Start the dev server (Vite):

```bash
npm run dev
```

3. Open the app in your browser. Vite usually serves at `http://localhost:5173`.

What to check (manual testing)
- Play a track from the Home view or click a trending card. The ambient background should update to a soft gradient derived from the track's cover art.
- Observe the bottom player card and track cards — they use subtle glass blur, softened borders, and elevated shadows.
- Resize to mobile — the ambient blobs and blur should gracefully scale down.

Production build
1. Build the app:

```bash
npm run build
```

2. Preview the production build (optional):

```bash
npm run preview
```

Files changed (where to look)
- `src/App.jsx` — color extraction logic, ambient RGB state, and updated glass/card classNames.
- `src/index.css` — ambient blobs, gradients, noise layer, and CSS variables (including `--ambient-rgb`).

How the dynamic ambient color works
- When a track becomes active the app extracts a representative RGB from the cover image using a small canvas sample.
- The color is normalized to produce a soft, premium palette (avoids neon extremes).
- The color is exposed to CSS via the `--ambient-rgb` variable and used for radial gradients and blurred blobs.

Quick tweaks
- Change intensity (soft ↔ vibrant):
  - Edit `src/index.css` and reduce or increase the alpha value(s) in the `.ambient-shell` and `.ambient-blob` rules. Lower alpha → softer.

- Force a specific ambient color:
  - Temporary: open DevTools and run:

```js
document.documentElement.style.setProperty('--ambient-rgb','200,150,110')
```

  - Permanent: edit the default at the top of `src/index.css`:

```css
:root { --ambient-rgb: 29, 185, 84; }
```

- Adjust color extraction algorithm:
  - Edit `normalizeRgb` in `src/App.jsx` to change the blend between sampled color and the soft offset.

Revert changes
- Revert the visual edits if you want to go back to the previous UI state:

```bash
git checkout -- src/App.jsx src/index.css
```

Commit tips
- Stage and commit the UI changes when you're ready:

```bash
git add src/App.jsx src/index.css RUN_STEPS.md
git commit -m "Add premium ambient player UI (glass, blur, dynamic ambient background)"
```

If anything breaks
- Open the browser console for runtime errors.
- If color extraction fails because of cross-origin images, the code falls back to a soft default color. You can host thumbnails with permissive CORS or proxy them through your API.

Next improvements (optional)
1. Add a small UI toggle to adjust ambient intensity (soft / medium / vibrant).
2. Animate buttons and micro-interactions to match the ambient material.
3. Use a small shader or CSS filters for more advanced blur/shine effects on larger hero cards.

Enjoy the new premium feel. If you want, I can add the intensity toggle and wire it into the UI next.
