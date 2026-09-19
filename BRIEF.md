# Hand Annotation Tool — Project Brief

2026-09-19

## Overview and goals

Build a static, browser-only tool for hand specialists (occupational therapists and hand therapists). It lets them mark problem areas on a hand diagram and export the result as a PNG for the patient's case file. Working name: Hand Map (placeholder).

The clinician picks a hand and a view, circles joints or areas, and tags each mark with one or more issue types. They add notes, then download a single PNG. Nothing is saved: closing the tab discards everything.

Success means:

- A clinician can produce a finished diagram for a typical patient (3–6 marks, a few notes) in under two minutes with no training.
- The exported PNG is legible when printed at A4 width, including in greyscale.
- No data entered into the page ever leaves it or survives the tab closing.
- The tool works in current desktop browsers and is usable on a phone for short demonstrations.

When requirements conflict, the priority order is: privacy, then clinical clarity of the output, then ease of use, then everything else.

## Hard constraints

These are non-negotiable. If a design choice would break one, raise it rather than work around it.

**No persistence.** All state lives in memory only. Do not use localStorage, sessionStorage, IndexedDB, cookies, the Cache API or a service worker for anything. Do not put any state in the URL (hash or query string), because browser history keeps URLs.

**No form-data leakage.** Browsers can remember text typed into fields and can restore field contents when a closed tab is reopened or a session is restored. Set `autocomplete="off"` on every input and textarea, and clear all fields on `pagehide`. Verify in each supported browser that reopening a closed tab shows a blank app.

**No network traffic at runtime.** After the app's own static files load, the page makes no requests: no CDNs, third-party fonts, analytics, error reporting or telemetry. Enforce this with a Content Security Policy meta tag. Start from `default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'` and loosen it only with a written reason.

**No patient identifiers.** The app has no fields for name, date of birth, hospital number, clinician or date, and the PNG contains none of these. They are added in the case file. Free-text notes may still contain personal information, which is why the no-persistence rules cover them.

**Static hosting.** Deployed to GitHub Pages, served from a sub-path such as `/repo-name/`. No backend, no server-side code, no build-time secrets. All asset paths are relative.

**Warn before losing work.** If marks or notes have changed since the last export, show the browser's standard "leave site?" prompt on `beforeunload`, where the browser supports it. This is a safety net, not persistence.

## Hand diagrams and joint map

The app offers eight views: left and right hands, each in palmar and dorsal view. Every view includes the wrist and the distal third of the forearm.

**Artwork.** The agent draws the artwork as SVG from scratch.

- Draw two base illustrations of the right hand, one palmar and one dorsal. Derive the left hand by mirroring. Palmar and dorsal must be separate drawings, because a mirrored palmar view looks like the other hand's dorsal view.
- Style: clean line drawing, mid-grey outline, light neutral fill (no specific skin tone), no shading beyond subtle creases.
- The dorsal view shows nails and knuckle creases. The palmar view shows the main palmar creases and the thenar and hypothenar eminences. These cues must make the view obvious at a glance.
- Fingers slightly spread and thumb naturally abducted, so neighbouring joints are clearly separate.
- Anatomically proportioned. Joint positions must match surface anatomy closely enough for a clinician to trust them.
- Leave margin space around each hand for callouts.

**View labels.** Every view carries a clear label such as "RIGHT HAND — PALMAR", in the editor and in the export. Confusing left with right, or palmar with dorsal, is a clinical safety risk, so labels are never omitted or abbreviated.

**Joint map.** Snap points are stored as data (JSON), not hard-coded in drawing code. Each entry holds an id, a readable label, x and y in the artwork's viewBox units, and a default mark radius. Each view has these 19 snap points:

| Region | Snap points |
| --- | --- |
| Index, middle, ring and little fingers | DIP, PIP and MCP on each (12) |
| Thumb | IP, MCP, CMC |
| Wrist | Radiocarpal joint, distal radioulnar joint (DRUJ), radial styloid, ulnar styloid |

Labels follow the pattern "Right index PIP" or "Left thumb CMC". On the palmar view, place snap points over the underlying joint, not the nearest skin crease; the crease at the base of each finger sits well distal to the MCP joint. Anything not in this list (for example the STT joint, the thenar eminence or a scar across the dorsum) is marked with free placement.

**Clinical review gate.** Before building any marking features, produce a review page showing all eight views with every snap point drawn and labelled. Stop and wait for sign-off from the product owner and a hand specialist. After sign-off, snap positions are adjusted by editing the JSON only.

## Marks and issue types

A mark is a circle placed on a view and tagged with one or more issue types.

**Placement.**

- Clicking or tapping within the snap radius of a joint places a mark centred on the nearest joint, at its default radius, and records the joint's id and label.
- Clicking or tapping anywhere else on the hand places a free mark at that point, with no joint label.
- To place a free mark near a joint, hold Alt (desktop) or turn off the snap toggle in the toolbar (mobile).
- Faint snap-point dots appear on hover (desktop) or while the Mark tool is active (mobile). They never appear in the export.

**Editing.** Marks can be selected, dragged, resized with a handle, retagged and deleted. Dragging a snapped mark off its joint turns it into a free mark and drops the joint label; dropping it on another joint snaps it there. A minimum radius keeps letter codes legible.

**Issue types.** Fixed list of eight, each with a colour from the Okabe–Ito colour-blind-safe palette and a letter code:

| Issue type | Code | Colour |
| --- | --- | --- |
| Pain | P | Vermillion #D55E00 |
| Swelling / oedema | O | Blue #0072B2 |
| Stiffness / reduced range of motion | S | Orange #E69F00 |
| Altered sensation (numbness, tingling) | N | Reddish purple #CC79A7 |
| Deformity (e.g. swan neck, boutonnière, ulnar drift) | D | Black #000000 |
| Weakness / reduced grip | W | Sky blue #56B4E9 |
| Wound or scar | Sc | Bluish green #009E73 |
| Triggering / clicking / locking | T | Yellow #F0E442 |

**Rendering.**

- A single-type mark is a ring in that type's colour with its letter code centred inside.
- A multi-type mark is a ring split into equal arc segments, one per type in table order, with the letter codes stacked inside in the same order.
- Every ring has a thin dark outline on both edges so light colours, especially yellow, stay visible against the hand.
- Letter codes use a bold sans-serif with a white halo so they read over the artwork.
- Test the worst case (three or more types on a little-finger DIP joint) at export size and at phone size.

## Notes

There are two kinds of note: pinned notes, which point at a place on a view, and general notes, which cover the whole assessment.

**Pinned notes.**

- A pinned note attaches either to an existing mark or to any point on a view. Attaching to a point drops a small pin marker there.
- Each pinned note appears as a callout box joined to its mark or pin by a leader line, in the editor and in the export.
- When the note belongs to a snapped mark, the callout starts with the joint label in bold (e.g. "Right index PIP"), so the clinician never retypes anatomy.
- Callouts are placed automatically in the margin around the hand, on the nearest free side, without overlapping each other and with leader lines that avoid crossing where possible. The clinician can drag a callout to move it; its leader line follows.
- Pinned notes are limited to 200 characters, with a visible counter. Text wraps inside a fixed maximum callout width.
- Callout style: white fill, thin grey border, dark grey leader line ending in a small dot at the edge of the mark or pin.

**General notes.** One multi-line text area, limited to 2,000 characters, shown beside the diagram in the editor and in the export's side panel.

## PNG export

One Download PNG button produces a single image containing every view that has at least one mark or pin, plus a side panel. Views with nothing on them are left out. The button is disabled until at least one mark or pin exists.

**Layout.**

- Diagrams on the left, in a fixed order: left palmar, left dorsal, right palmar, right dorsal, skipping unmarked views. One view fills the diagram area, two sit side by side, three or four form a 2×2 grid.
- Each diagram shows its view label, marks, pins and callouts exactly as in the editor.
- Side panel on the right: a legend of the issue types used in this export (colour swatch, code, name), then the general notes. With no general notes, the panel shows the legend only.
- White background, not transparent. No date, clinician, patient details or app branding on the image.

**Output.**

- About 2,400 px wide so it stays sharp when printed at A4 width; height follows from the layout. Choose exact dimensions and document them.
- Filename `hand-diagram-YYYYMMDD-HHMM.png` in local time, with nothing else in the name.
- Delivered by a standard download link. On iOS, Safari may open a preview instead of saving straight away; that is acceptable for demonstrations.
- Generated entirely in the browser. Nothing is uploaded anywhere.

**Rendering pitfalls.**

- An SVG drawn onto a canvas through an image element cannot load external resources. Use a system font stack or embed the font as a data URI, and check that exported text matches the editor in every supported browser.
- Avoid `foreignObject` for text: it can taint the canvas in Safari, which blocks export. Wrap callout text in code instead.
- Render the editor and the export from the same state and drawing code so they cannot drift apart.

## Interaction design and layout

The interface is clear and plain. It uses a neutral palette so the issue colours are the only strong colours on screen, with generous spacing and large hit targets. All copy is in British English ("colour", "oedema").

**Desktop layout (primary).**

- Top bar: hand selector (Left | Right), view selector (Palmar | Dorsal), Download PNG and Start new diagram.
- Each hand/view combination shows a count badge when it has marks, so the clinician can see what will be exported.
- Centre: the current view, large, with its callout margins.
- Right: general notes and the legend, mirroring the export's side panel.
- Toolbar: Mark (default tool), Pin note, snap toggle, Undo, Redo.

**Core flow.**

1. Choose the hand and view.
2. With Mark active, click a joint. The mark appears and a small popover opens beside it, showing the eight issue types as toggle chips and an optional note field. The last-used issue type is preselected.
3. Toggle types, optionally type a note, then click away or press Enter to close. A mark with no types selected is removed when the popover closes.
4. Click an existing mark to reopen its popover to change types, edit or remove the note, or delete the mark. Drag to move; drag the handle to resize.
5. With Pin note active, click anywhere on the view to drop a pin and open its note field.
6. Download the PNG.
7. Start new diagram clears everything, including undo history, after a confirmation, ready for the next patient.

**Keyboard.** Delete or Backspace removes the selected item. Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes. Esc closes the popover and Enter confirms it.

**Mobile (demonstration quality).** Usable at 375 px wide. The view fills the width, the toolbar sits at the bottom, the popover becomes a bottom sheet and general notes move below the diagram. Tap places, drag moves. Taps snap to the nearest joint within the snap radius, so small, close-together joints stay easy to hit. Buttons and chips are at least 44 × 44 px. Pinch-zoom on the diagram is a nice-to-have, not a requirement.

## Technical approach

**Stack decision.** The agent chooses the stack and records it before writing app code, in `docs/decisions/0001-stack.md` (context, options considered, decision, consequences). The choice must meet every hard constraint and should be the smallest, most maintainable option that does. Weigh SVG rendering and hit-testing, PNG export, bundle size, testability and ease of maintenance by someone else. All dependencies are bundled and self-hosted.

**State model.** One in-memory state object, changed only through actions, so undo and redo stay simple. Suggested shape:

```ts
type Hand = 'left' | 'right';
type Side = 'palmar' | 'dorsal';
type IssueType = 'pain' | 'oedema' | 'stiffness' | 'sensation'
  | 'deformity' | 'weakness' | 'scar' | 'triggering';

interface Note { text: string; callout: { dx: number; dy: number } } // offset from anchor

interface Mark {
  id: string;
  view: { hand: Hand; side: Side };
  x: number; y: number; r: number; // artwork viewBox units
  jointId?: string;                // present when snapped
  types: IssueType[];              // at least one
  note?: Note;
}

interface Pin {
  id: string;
  view: { hand: Hand; side: Side };
  x: number; y: number;
  note: Note;
}

interface Session { marks: Mark[]; pins: Pin[]; generalNotes: string }
```

Coordinates are stored in artwork units, so the editor and the export stay resolution-independent.

**Suggested repo structure.**

- `src/` for app code
- `src/data/joints.json` for snap points per view
- `src/assets/` for the palmar and dorsal hand SVGs
- `docs/decisions/` for decision records
- `tests/` for unit and end-to-end tests
- `.github/workflows/deploy.yml` to test, build and deploy

**Deployment.** A GitHub Actions workflow runs the tests and deploys to GitHub Pages on every push to `main`. A failing test blocks the deploy. The README covers running locally, testing, building and deploying.

## Accessibility and browser support

The interface meets WCAG 2.2 AA for contrast, labels, focus and target size.

- Every control works by keyboard, with visible focus and a sensible tab order.
- Issue types are never conveyed by colour alone: letter codes on marks, full names in the popover and legend.
- Marks and pins have screen-reader labels, e.g. "Right index PIP: pain, swelling".
- Should-have: with the diagram focused, arrow keys move between snap points and Enter places or selects a mark there.
- Supported browsers: current Chrome, Edge, Firefox and Safari on desktop; Safari on iOS and Chrome on Android for demonstrations.

## Testing and acceptance criteria

The privacy constraints are proved by automated tests, not just asserted.

**Automated tests.**

- Unit tests for the state model: add, edit, move, resize, retag, delete, undo, redo and start new.
- Unit tests for snapping (inside and outside the radius, Alt override) and for callout auto-placement (no overlaps across a set of dense fixtures).
- End-to-end tests (e.g. Playwright) in Chromium, Firefox and WebKit that:
  - run a full flow and check that a PNG downloads with the expected dimensions and filename pattern;
  - record every network request after load and check there are none;
  - check that localStorage, sessionStorage, IndexedDB and cookies are all empty after a full flow;
  - check that the URL never changes during use.
- Visual snapshot tests of the export for fixed fixtures, including the worst-case multi-type mark.

**Manual checks before sign-off.**

- Reopening a closed tab and restoring a browser session both show a blank app, in every supported desktop browser.
- The PNG, printed at A4 width in greyscale, is fully legible: every letter code, callout and view label.
- The mobile flow (place a mark, tag it, add a note, export) works on a real iPhone and a real Android phone.

**Acceptance criteria.**

- [ ] All eight views render with clinician-approved snap points.
- [ ] Marks snap, place freely, move, resize, retag and delete as specified, with undo and redo.
- [ ] Pinned and general notes appear in the editor and export as specified, with no overlapping callouts in normal use.
- [ ] The export includes only marked views, follows the specified layout and passes the greyscale print check.
- [ ] All automated tests pass in CI, including the no-storage, no-network and no-URL-state tests.
- [ ] The app is live on GitHub Pages and the README is complete.

## Milestones and review points

Work in this order, and stop at each review point for sign-off before continuing. At each one, deploy to GitHub Pages and summarise what changed, what was decided and any open questions.

| # | Milestone | Review point |
| --- | --- | --- |
| 1 | Stack decision record, project skeleton, CSP, CI, placeholder page deployed to GitHub Pages | Stack decision approved |
| 2 | Palmar and dorsal artwork, all eight views, joint map JSON, labelled review page | Clinician signs off artwork and snap points |
| 3 | Marks: placement, snapping, editing, issue types, rendering, undo and redo | Demo of the marking flow |
| 4 | Pinned notes, callouts with auto-placement, general notes | Demo with a dense example |
| 5 | PNG export | Greyscale print check |
| 6 | Mobile layout, accessibility, privacy hardening, full test suite | Final acceptance |

## Out of scope

Once the tab closes, only the exported PNG remains; a diagram cannot be reopened for changes. Also out of scope:

- Saving, loading or re-editing diagrams.
- Patient identifiers of any kind, accounts, logins or a backend.
- Freehand drawing, arrows, text placed directly on the hand, or shapes other than circles.
- Measurements (range-of-motion angles, grip strength) and comparing assessments over time.
- Custom or editable issue types.
- Direct printing, PDF export or integration with patient record systems.
- Languages other than British English.
