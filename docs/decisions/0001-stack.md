# 0001 — Stack

Status: Accepted (approved by product owner, 2026-09-19)
Date: 2026-09-19

## Context

Hand Map is a static, browser-only tool that runs from a GitHub Pages sub-path. The
hard constraints that shape the stack:

- No persistence, no runtime network traffic, no URL state. A strict Content Security
  Policy enforces this: `default-src 'self'; connect-src 'none'; img-src 'self' data: blob:;
  object-src 'none'; base-uri 'none'; form-action 'none'`.
- All asset paths are relative, and every dependency is bundled and self-hosted.
- The editor and the PNG export must use the same state and the same drawing code.
- A PNG export made in the browser by drawing an SVG onto a canvas. No `foreignObject`,
  and no external fonts.
- Privacy guarantees are proved by end-to-end tests in Chromium, Firefox and WebKit.
- Someone other than the author has to be able to maintain it.

The UI is small: one diagram, a toolbar, a popover, a notes panel. Most of the
complexity is in SVG geometry (snapping, ring segments, callout placement) and in the
export, not in UI state or component structure.

## Options considered

1. **Plain HTML, CSS and JS, no build.** Nothing to install and nothing to bundle. But
   there's no type checking on a geometry-heavy state model, and no standard way to
   import `joints.json` or run the unit tests against the same modules. Maintainers lose
   the most safety.
2. **TypeScript + Vite, no UI framework (chosen).** The app renders SVG with a small
   render function that takes state and produces SVG. The editor and the export
   serialiser both call that function. Vite handles TypeScript, JSON imports, relative
   `base: './'` output and a dev server. Vitest shares Vite's config for unit tests.
3. **TypeScript + Vite + Preact or Svelte.** Declarative components would help a larger
   UI, but here they add a runtime and a second rendering model. The export needs a
   plain SVG string, so the drawing code would have to render outside the framework
   anyway, or be written twice.
4. **React + a canvas library (Konva, Fabric).** Fast hit-testing and built-in export,
   but a large bundle (100 kB or more), canvas-first accessibility (screen-reader labels
   on marks get harder), and text rendering that differs from the SVG editor. This
   conflicts with "same drawing code" and adds dependencies to audit.

## Decision

TypeScript, built with Vite, with no UI framework and no runtime dependencies.

- **Rendering:** hand-written SVG. `src/render/` holds pure functions from state to SVG
  elements. The editor mounts them in the DOM. The export serialises the same output
  (with editor-only layers such as snap dots and selection handles removed) to a string,
  loads it into an `Image` from a `blob:` URL and draws it onto a `<canvas>`. Callout
  text is wrapped in code into `<tspan>` lines.
- **Hit-testing:** native SVG events. Pointer coordinates convert to artwork units
  through `getScreenCTM()`. Snapping is a pure function over `joints.json` that can be
  unit-tested.
- **State:** one in-memory `Session` object, changed only through pure action reducers.
  Undo and redo keep snapshot stacks of the immutable state.
- **Fonts:** a system sans-serif stack (`system-ui, -apple-system, "Segoe UI", Roboto,
  Arial, sans-serif`). No font files, no network. Cross-browser text differences are
  caught by snapshot tests. If export text doesn't match the editor in some browser,
  we'll switch to embedding one self-hosted font as a data URI in the export SVG.
- **Tests:** Vitest for unit tests (state, snapping, callout placement). Playwright in
  Chromium, Firefox and WebKit for end-to-end, privacy and visual snapshot tests.
- **Deploy:** GitHub Actions runs type-check, unit tests and e2e tests, then builds and
  deploys `dist/` to GitHub Pages. A failing test blocks the deploy.

## Consequences

- There are no runtime dependencies to audit. The shipped bundle is only our code.
  Dev dependencies: `vite`, `typescript`, `vitest`, `@playwright/test`.
- We write our own small helpers for element creation and event wiring. That's more
  code than a framework would need, but it's plain DOM that any web developer can read.
- CSP notes:
  - The production `index.html` carries the strict policy from the brief unchanged.
  - The Vite dev server needs a WebSocket for hot reload, so in **dev only** a
    Vite plugin adds `ws:` to `connect-src`. Build output never contains that
    exception, and an automated test checks for it.
  - Inline `style="…"` attributes in HTML are blocked by `default-src 'self'`
    (there's no `style-src 'unsafe-inline'`). Styles live in the bundled CSS file.
    Dynamic positioning uses the CSSOM (`el.style.left = …`) or SVG attributes,
    both of which CSP allows.
  - `frame-ancestors` can't be set from a meta tag, and GitHub Pages doesn't allow
    custom headers, so clickjacking protection isn't available. The app holds no
    secrets and has no authenticated actions, so the risk is low.
- The export draws an SVG image onto a canvas, which is constrained by `img-src 'self'
  data: blob:`. The export SVG must be self-contained, with no external references.
