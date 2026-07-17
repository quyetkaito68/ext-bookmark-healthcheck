# AGENTS.md

## Project

Chrome Extension (Manifest V3) for scanning bookmarks, detecting broken URLs by HTTP status, and bulk-deleting them. Vietnamese UI.

## Architecture

- `popup/` — Extension popup with bookmark search (`popup.js` uses ES module imports)
- `results/` — Full-page scan UI opened from popup (`results.js`)
- `services/` — Core logic: `bookmarks.js` (Chrome bookmarks API), `urlChecker.js` (HEAD/GET fetch with fallback)
- `utils/` — `badge.js` (status code labels), `dom.js` (HTML helpers)
- `manifest.json` — MV3 manifest, entry point is `popup/popup.html`

## Build & Run

No build step. Pure vanilla JS with ES modules. To test:
1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked" and select this directory

No `package.json`, no bundler, no npm scripts.

## Conventions

- All JS uses `'use strict'` and ES module `import`/`export` (no CommonJS)
- No transpilation — write modern browser JS directly
- UI strings are in Vietnamese
- `urlChecker.js` tries `HEAD` first, falls back to `GET` on 405 or network error; concurrency set to 50 in `results.js:152`

## Caveats

- No tests, no linter, no formatter configured — verify changes manually via extension reload
- `host_permissions: ["<all_urls>"]` required for URL checking to work
- Bookmark removal is permanent (no undo beyond Chrome's own history)
