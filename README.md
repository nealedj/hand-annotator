# Hand Map

A static, browser-only tool for hand therapists and occupational therapists. You mark
problem areas on a hand diagram, tag each mark with issue types, add notes and download
a single PNG for the patient's case file.

**Privacy by design.** Everything stays in the page's memory. Nothing is saved, sent or
put in the URL, and closing the tab discards it all. A strict Content Security Policy
enforces this, and automated tests in Chromium, Firefox and WebKit check it.

Live: https://nealedj.github.io/hand-annotator/ · Snap point review page:
https://nealedj.github.io/hand-annotator/review.html

Requirements: [BRIEF.md](BRIEF.md). Decisions: [docs/decisions/](docs/decisions/).

## Using it

1. Choose the hand (**Left** | **Right**) and view (**Palmar** | **Dorsal**). Badges
   count the marks and pins on each; the side panel lists all four views.
2. With **Mark** active, click a joint: a mark snaps to it and a popover opens with the
   eight issue types, the last one you used already selected. Click the hand away from
   a joint for a free mark. Hold **Alt** (or turn off **Snap to joints**) to place a
   free mark near a joint.
3. Toggle issue types and optionally type a note (up to 200 characters). Press
   **Enter**, click **Done** or click away to finish. A mark with no types is removed.
4. Click a mark to retag it, change its note, resize it (−/+), **Move** it or delete it.
   Drag a mark to move it (it snaps if dropped on a joint), and drag its round handle to
   resize it.
5. With **Pin note**, click anywhere on the view to drop a pin and type its note.
6. Notes appear as callouts beside the hand, headed by the joint name for snapped
   marks, and are placed automatically. Drag a callout to move it; **Reset note
   position** in the popover puts it back.
7. **General notes** (up to 2,000 characters) cover the whole assessment.
8. **Download PNG** saves `hand-diagram-YYYYMMDD-HHMM.png`: every view with a mark or
   pin, a legend of the issue types used, and the general notes. It's made entirely
   in the browser.
9. **Start new diagram** clears everything, including undo history, after confirming.

### Keyboard

| Where | Keys |
| --- | --- |
| Anywhere | **Ctrl/Cmd+Z** undo, **Ctrl/Cmd+Shift+Z** (or **Ctrl+Y**) redo, **Tab** to move between controls |
| Diagram focused | **Arrow keys** move between joints; **Enter** places a mark (or opens the one there) |
| Mark focused | **Enter** opens it; **arrows** move it to the next joint; **Alt+arrows** nudge it; **+/−** resize; **Delete** removes |
| Pin focused | **Enter** opens it; **arrows** nudge it (**Shift** for bigger steps); **Delete** removes |
| Popover | **Space** toggles a type; **Enter** finishes; **Esc** closes |
| After **Move** | click or tap the new place; **Esc** cancels |

### Phones

At phone width the diagram fills the screen, the tools sit at the bottom, the popover
becomes a bottom sheet and the general notes move below the diagram. Taps snap to the
nearest joint within reach of a finger. Use **Move** in the popover to move a mark
without dragging.

## Privacy

- No localStorage, sessionStorage, IndexedDB, cookies, Cache API or service worker.
  Nothing goes in the URL.
- No requests after load. The CSP is the brief's policy plus tightening only:
  `default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; object-src 'none';
  base-uri 'none'; form-action 'none'; worker-src 'none'; frame-src 'none'; font-src
  'none'; media-src 'none'; manifest-src 'none'`.
- Fields have autocomplete and spellcheck off (cloud spellcheck can send text away)
  and are cleared when the page is hidden. A page restored from the back-forward cache
  starts blank.
- No patient identifiers: there are no fields for them, and the PNG carries no date,
  names or branding.

## Run locally

Requires Node.js 22 or later.

```sh
npm install
npm run dev        # http://localhost:5173 (the dev server allows its hot-reload WebSocket)
npm run build      # type-check, then write the static site to dist/
npm run preview    # serve dist/ at http://localhost:4173 with the production CSP
```

## Test

```sh
npm run typecheck
npm run test:unit  # Vitest: state, undo/redo, snapping, callout layout, export layout
npm run test:e2e   # Playwright against the production build (run `npm run build` first)
npm run test:all   # everything, in CI order
```

First-time browser setup: `npx playwright install --with-deps chromium firefox webkit`.

End-to-end projects:
- **Desktop Chromium, Firefox and WebKit:** marking, notes, export, keyboard, the
  review page, axe accessibility checks, and privacy. Privacy covers no network, no
  storage, no URL or history change, and Back and reload both giving a blank app.
- **Phone emulation** (Pixel 7 and iPhone 13): layout at 375 px and 320 px, touch
  snapping, the bottom sheet and the full mobile flow through to export.
- **Export pixel snapshots:** Chromium on Linux only, because they depend on the
  installed fonts. After an intentional visual change, run
  `npx playwright test export-visual --project=chromium --update-snapshots=all`.

The e2e server serves `dist/` from `/hand-map/`, to prove the relative paths work
under a GitHub Pages sub-path.

## Deploy

`.github/workflows/deploy.yml` runs on every push to `main`: type-check, build, unit
tests, then all end-to-end projects. It deploys `dist/` to GitHub Pages only if they
pass. Pull requests run the tests without deploying. One-time setup: set
**Settings → Pages → Source** to **GitHub Actions**.

## Artwork and snap points

- `src/assets/hand-palmar.svg`, `hand-dorsal.svg` and `src/data/hand-shape.json` are
  generated by `npm run artwork` from the skeleton in `scripts/generate-artwork.ts`.
  Don't edit them by hand.
- `src/data/joints.json` holds the clinically approved snap points: `{ id, label, x, y,
  r }` per view, in viewBox units (1200 × 1400, about 4 units per mm).
- **To move a snap point**, edit it in `right-palmar` or `right-dorsal`, then run
  `npm run joints:mirror`. The tests check that left mirrors right and that every point
  lies on the drawn hand. The review page shows the result.

## Manual checks before sign-off

These can't be automated and are listed in the brief:

- [ ] Reopening a closed tab, and restoring a browser session, show a blank app in
      current Chrome, Edge, Firefox and Safari.
- [ ] A PNG printed at A4 width in greyscale is fully legible: every letter code,
      callout and view label (see the print sizes in ADR 0004).
- [ ] On a real iPhone and a real Android phone: place a mark, tag it, add a note and
      export.

## Project layout

```
src/views.ts         views, export order and view labels
src/model/           session state, actions, undo/redo history, snapping, issue types
src/layout/          callout placement and text wrapping (pure, unit-tested)
src/render/          SVG drawing shared by the editor, review page and export
src/editor/          the editor UI: layout, pointer and keyboard input, popover
src/export/          PNG export: layout, SVG assembly, canvas encoding, download
src/data/            joints.json (snap points), hand-shape.json (for callout layout)
src/assets/          palmar and dorsal right-hand SVGs (generated)
scripts/             artwork generator and joint mirroring
review.html          clinical review page for the artwork and snap points
tests/unit/          Vitest unit tests
tests/e2e/           Playwright end-to-end, privacy, accessibility and visual tests
docs/decisions/      architecture decision records
```
