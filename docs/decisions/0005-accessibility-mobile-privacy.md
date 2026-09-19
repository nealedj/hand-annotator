# 0005 — Accessibility, mobile and privacy hardening

Status: Accepted
Date: 2026-09-19

## Accessibility (WCAG 2.2 AA)

- **Keyboard.** With the diagram focused, the arrow keys move a cursor between the snap
  points, choosing the nearest joint in that direction, and a live region names each
  joint. Enter places a mark there, or opens the existing mark. On a focused mark,
  arrows move it to the next joint, Alt+arrow nudges it freely, +/− resize it and
  Delete removes it. Arrows nudge a focused pin.
- **Dragging alternatives (2.5.7).** The popover has Size −/+ buttons, **Move** (then
  tap or click the new place; Escape cancels) and **Reset note position** for a
  dragged callout.
- **Target size (2.5.8).** Buttons and chips are at least 44 × 44 px. Marks and pins get
  a grab area of at least 22 px radius on screen, whatever the diagram's size.
- **Contrast (1.4.3, 1.4.11).** Control outlines use `#7d848c` (3.9:1 on white).
  Pressed states use a dark fill or a 2 px dark border.
- **Semantics.** The tools are a labelled group, not an ARIA `toolbar`, which would
  promise arrow-key navigation between buttons. Marks and pins are focusable buttons
  with labels such as "Right index PIP: pain, swelling. Note: …". The popover is a
  labelled dialog. Status changes are announced through `role="status"`.
- **Focus not obscured (2.4.11).** On phones, `scroll-padding-bottom` keeps focused
  controls clear of the fixed bottom toolbar.
- **Automated checks.** axe-core runs with the WCAG 2.0/2.1/2.2 A and AA rules on the
  editor, with and without an open popover, and on the review page, in all three
  desktop engines.

## Mobile

- A tap snaps to the nearest joint within the joint's own radius or 24 px on screen,
  whichever is larger (12 px for a mouse). Small, close-together joints stay easy to
  hit, and the nearest joint still wins.
- **Ghost clicks.** After a tap, the browser sends a click to whatever is under the
  finger by then. When the tap has just opened the bottom sheet, that's an issue-type
  chip, which would untick the preselected type and so delete the new mark. Clicks
  inside the popover within 700 ms of a touch on the diagram are ignored. Found by the
  phone-emulation tests.
- The toolbar is one row at the bottom. The popover is a bottom sheet whose title
  stays visible while its contents scroll. Hover styles apply only on devices that
  can hover. The layout reflows down to 320 px.

## Privacy hardening

- **CSP.** The brief's policy is kept unchanged, with tightening directives added:
  `worker-src 'none'` (no service worker can ever be registered), `frame-src 'none'`,
  `font-src 'none'`, `media-src 'none'` and `manifest-src 'none'`. Nothing was loosened.
- **Fields.** Every field is created by script, so the browser has nothing to restore
  on reload. Fields have autocomplete, spellcheck and autocorrect off (browser cloud
  spellcheck can send text away), opt out of Grammarly-style extensions, and are
  cleared on `pagehide`. A page restored from the back-forward cache resets to blank.
- **Tests** prove, in Chromium, Firefox and WebKit, that after a full flow including
  export:
  - there are no network requests;
  - localStorage, sessionStorage, IndexedDB, the Cache API, service workers and
    cookies are all empty;
  - the URL, `window.name`, `history.length` and `history.state` are unchanged;
  - Back and reload both give a blank app.
