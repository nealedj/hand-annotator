# 0004 — PNG export

Status: Accepted, pending the greyscale print check
Date: 2026-09-19

## Decision

- **Same drawing code.** `buildExportSvg()` draws each exported view with the functions
  the editor uses: `handArtwork`, `viewLabelText` and `renderScene` (marks, pins,
  callouts and leaders, laid out by the same deterministic callout layout). Editor-only
  layers (snap dots, selection, resize handle) aren't part of the scene, so they never
  reach the export.
- **Rendering.** The SVG is serialised, loaded into an `Image` from a `blob:` URL, drawn
  onto a canvas over a white fill, and encoded with `canvas.toBlob('image/png')`. There's
  no `foreignObject` and no external resource, and text uses the system font stack. A
  test checks in Chromium, Firefox and WebKit that text drawn this way has the same
  width as the page's own font.
- **Dimensions** (`src/export/layout.ts`), in pixels:

  | Views | Cell size | Image size |
  | --- | --- | --- |
  | 1 | 1,792 × 2,091 | 2,400 × 2,155 |
  | 2 (side by side) | 884 × 1,031 | 2,400 × 1,095 |
  | 3 or 4 (2×2) | 884 × 1,031 | 2,400 × 2,150 |

  There's a 32 px outer margin, a 24 px gutter and a 520 px side panel on the right. The
  image grows taller if the general notes need more room than the diagrams. At A4
  width that's about 290 px per inch.
- **Side panel:** the legend lists only the issue types used (ring swatch, code, name),
  followed by the general notes. There's no date, clinician, patient detail or branding.
- **Filename:** `hand-diagram-YYYYMMDD-HHMM.png` in local time, delivered through a
  standard download link.

## Letter codes on marks with three or more types

The brief asks for codes stacked inside the ring. With four types on a little-finger
DIP, a stack needs about 110 units of height, but the DIP and PIP are only 80 apart.
The ring grew over the neighbouring joint and one code was hidden. Clinical clarity
comes before layout conventions in the brief's priorities, so:

- One or two codes are stacked, as specified.
- Three or more sit in two columns, still in table order and read left to right, top
  to bottom (for example `P O / S T`). That keeps a four-type mark at radius 51
  instead of 65.
- All codes are drawn above all rings, so an overlapping ring never hides a letter.

This deviates from "stacked" and needs product-owner approval. It's confined to
`codeOffsets()` in `src/model/session.ts`.

## Print size, the open question for the print check

At A4 width, one exported pixel is about 0.0875 mm. In the 2-view and 2×2 layouts each
view is drawn at 0.74 px per artwork unit, so:

| Element | Artwork units | Printed height of the font (em) |
| --- | --- | --- |
| View label | 46 | about 3.0 mm (8.5 pt) |
| Letter codes | 26 | about 1.7 mm (4.8 pt) |
| Callout text | 22 | about 1.4 mm (4.1 pt) |
| Side panel text | 27 px | about 2.4 mm (6.7 pt) |

A single-view export is twice that size. Larger callout text is a one-line change
(`CALLOUT` in `src/layout/callouts.ts`), but it costs space: at 25 units the dense
fixtures of 7–10 notes per view no longer fit without crowding.
