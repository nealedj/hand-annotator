# 0003 — Callout layout

Status: Accepted
Date: 2026-09-19

## Context

Pinned notes show as callouts in the margin around the hand, joined to their mark or
pin by a leader line. The brief asks for automatic placement on the nearest free side,
with no overlapping callouts and with leader lines that avoid crossing where possible.
The clinician can drag a callout, and its leader follows. The editor and the PNG
export must produce the same layout.

## Decision

`src/layout/callouts.ts` is a pure function of the view, the notes, the marks and pins
it must avoid, and a text-measuring function. That makes it deterministic, and the
unit tests can run it on dense fixtures.

1. **Hand occupancy.** The artwork generator also writes `src/data/hand-shape.json`:
   the palm/forearm and each digit as polygons. These are rasterised once per
   orientation into a 10-unit grid with 14 units of clearance, then turned into a
   summed-area table. The grid gives the hand's width at any height and answers "does
   this box touch the hand?" in constant time.
2. **Side.** Each callout goes on the side (left or right) whose hand edge is nearer
   its anchor at that height. If one side can't hold all its callouts, the ones
   anchored nearest the middle move to the other side.
3. **Stacking.** Within a side, callouts keep the vertical order of their anchors,
   which is what keeps leaders from crossing. Overlapping neighbours merge into
   clusters centred on their anchors (the classic boundary-labelling method), clamped
   below the view label. Each box is then pushed against the hand's outline at its
   height.
4. **Dragged callouts** store their centre's offset from the anchor
   (`note.callout = { dx, dy }`), so they move with the mark. Automatic callouts avoid
   them. With no `callout` set, placement is automatic. This is a small change from
   the brief's suggested type, where `callout` was required.
5. **Text** is wrapped in code into `<tspan>` lines, measured with a canvas in the same
   system font the SVG uses. Callouts are at most 240 units wide, so one always fits
   beside the hand.
6. **Overflow.** If there isn't room, a callout is still drawn inside the view but is
   flagged `crowded`. That happens only with far more text than a typical assessment:
   about 1,000 characters of pinned notes per view fit comfortably.

## Consequences

- Callouts sit close to the hand, not at the page edge, which keeps leaders short.
- Adding a note can move other automatic callouts, because the layout is recomputed
  from scratch each time. A dragged callout never moves on its own.
- Leaders are drawn under the marks and the dots on top, so a leader never hides a
  letter code.
