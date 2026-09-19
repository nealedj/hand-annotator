# Hand Map

A static, browser-only tool for hand therapists and occupational therapists. You mark
problem areas on a hand diagram, tag each mark with issue types, add notes and download
a single PNG for the patient's case file.

**Privacy by design.** Everything stays in the page's memory. Nothing is saved, sent or
put in the URL, and closing the tab discards it all. A strict Content Security Policy
enforces this, and automated tests in Chromium, Firefox and WebKit check it. See
[BRIEF.md](BRIEF.md) for the full requirements and
[docs/decisions/](docs/decisions/) for design decisions.

> Status: milestone 1 of 6 (project skeleton and placeholder page).

## Requirements

- Node.js 22 or later, and npm

## Run locally

```sh
npm install
npm run dev        # dev server with hot reload at http://localhost:5173
```

The dev server relaxes the CSP to allow its hot-reload WebSocket (`connect-src 'self' ws:`).
Production builds keep the strict policy. To check real behaviour, run the build:

```sh
npm run build
npm run preview    # serves dist/ at http://localhost:4173
```

## Test

```sh
npm run typecheck  # TypeScript, app and Node-side code
npm run test:unit  # Vitest unit tests (tests/unit)
npm run test:e2e   # Playwright against the production build in Chromium, Firefox and WebKit
npm run test:all   # everything, in CI order
```

`test:e2e` needs a build first (`npm run build`). It serves `dist/` from the sub-path
`/hand-map/` to mimic GitHub Pages. First-time setup for the browsers:

```sh
npx playwright install --with-deps chromium firefox webkit
```

The end-to-end privacy tests check that, after load, the page makes no network requests,
leaves localStorage, sessionStorage, IndexedDB, cookies, the Cache API and service
workers empty, never changes its URL, and serves the CSP from the brief unchanged.

## Build

```sh
npm run build      # type-checks, then writes the static site to dist/
```

All asset paths are relative (`base: './'`), so `dist/` works from any sub-path.

## Deploy

`.github/workflows/deploy.yml` runs on every push to `main`: type-check, build, unit
tests, then end-to-end tests in all three browsers. It deploys `dist/` to GitHub Pages
only if everything passes. Pull requests run the tests without deploying.

One-time setup: in the GitHub repository, go to **Settings → Pages → Build and
deployment** and set **Source** to **GitHub Actions**.

## Project layout

```
src/                 app code (TypeScript, no UI framework)
src/data/            joints.json: snap points per view (milestone 2)
src/assets/          palmar and dorsal hand SVGs (milestone 2)
tests/unit/          Vitest unit tests
tests/e2e/           Playwright end-to-end and privacy tests
docs/decisions/      architecture decision records
.github/workflows/   CI and deploy
```
