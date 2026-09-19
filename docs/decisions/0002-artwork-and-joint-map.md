# 0002 — Hand artwork and joint map

Status: Proposed (awaiting clinical sign-off at milestone 2)
Date: 2026-09-19

## Context

The brief asks for two drawings of the right hand, one palmar and one dorsal. The left
hand is made by mirroring them. Every view also needs 19 snap points, stored as JSON.
The joint positions must match the drawing closely enough for a clinician to trust
them, and after sign-off they're adjusted by editing the JSON only.

## Decision

**One skeleton, generated artwork.** `scripts/generate-artwork.ts` holds a
millimetre-scale skeleton of an adult right hand, about 190 mm from the distal wrist
crease to the middle fingertip. It records joint centres, segment lengths, finger
spread and a width profile for each digit. From that it draws both SVGs and the initial
`joints.json`, so the outline, the creases and the snap points all come from the same
numbers. The script is only for redrawing; nothing runs it at build time.

- **Coordinates:** viewBox `0 0 1200 1400`, 4 units per mm. The hand is centred, with
  margins of roughly 250–300 units on each side and 150 above and below for callouts.
  The view label sits top left.
- **Orientation:** fingers point up. In the right palmar view the thumb is on the
  right of the image; in the right dorsal view it's on the left. The dorsal drawing
  uses the same skeleton, mirrored. Left views are the right-hand drawings mirrored
  (`translate(1200 0) scale(-1 1)`).
- **Cues that identify the view:** the palmar view shows the distal and proximal palmar
  creases, the thenar crease, the wrist creases, digital creases, and faint
  thenar/hypothenar contours. The dorsal view shows nails, wrinkles over the PIP and
  DIP knuckles, caps over the MCP heads and the ulnar head.
- **Drawing technique:** the digits and the palm/forearm are separate shapes. Every
  outline is stroked first, then every fill is painted on top, so only the outer edge
  of the combined shape shows. The forearm's cut end isn't stroked. The SVGs use
  presentation attributes only, because the CSP blocks inline styles and the export
  must not depend on CSS. They also avoid `id`s, so several views can share a page.
- **Palmar snap points:** placed over the joint, not the skin crease. The MCP points
  sit about 15–20 mm proximal to the proximal digital creases. The ring and little
  MCPs fall under the distal palmar crease, the index MCP under the proximal palmar
  crease.

**Joint map format.** `src/data/joints.json` holds `{ viewBox, views }`, where `views` has
the keys `left-palmar`, `left-dorsal`, `right-palmar` and `right-dorsal`. Each is a
list of `{ id, label, x, y, r }` in viewBox units, with `r` the default mark radius.
The ids (`index-pip`, `thumb-cmc`, `druj`, …) are the same in every view.

**Left mirrors right.** The left artwork is an exact mirror of the right, so the left
snap points must be too. To adjust a point, clinicians or developers edit the right-hand
views and run `npm run joints:mirror`. A unit test fails if left and right disagree,
and an end-to-end test fails if any snap point falls outside the drawn hand.

## Consequences

- Moving a snap point after sign-off means editing one line of JSON. Re-running the
  generator with `--joints` would overwrite those edits, so the script warns about it.
- Redrawing the art means changing the skeleton or the shape code, then checking the
  review page. The joints in the JSON don't follow automatically.
- Palmar and dorsal positions for the same joint currently match exactly (mirrored),
  because both drawings share one skeleton. They can be separated later by editing
  `right-dorsal` independently.
