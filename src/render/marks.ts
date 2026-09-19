import { jointsFor } from '../data/joints';
import { issueInfo } from '../model/issues';
import { CODE_FONT_SIZE, CODE_LINE_HEIGHT, displayRadius, RING_WIDTH, type Mark } from '../model/session';
import { viewLabel } from '../views';
import { FONT_STACK, svg } from './svg';

const OUTLINE = '#1f2328';
const OUTLINE_WIDTH = 2.5;

/** "Right index PIP", or "Free mark, RIGHT HAND — PALMAR" when not snapped. */
export function markPlace(m: Mark): string {
  const joint = m.jointId ? jointsFor(m.view).find((j) => j.id === m.jointId) : undefined;
  return joint ? joint.label : `Free mark, ${viewLabel(m.view).toLowerCase()}`;
}

/** Screen-reader label, e.g. "Right index PIP: pain, swelling". */
export function markDescription(m: Mark): string {
  const types = m.types.map((t) => issueInfo(t).spoken).join(', ');
  return `${markPlace(m)}: ${types || 'no issue types yet'}`;
}

/** Point at `angle` radians clockwise from 12 o'clock. */
const polar = (cx: number, cy: number, radius: number, angle: number) =>
  [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)] as const;

function sector(cx: number, cy: number, outer: number, inner: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [ox0, oy0] = polar(cx, cy, outer, a0);
  const [ox1, oy1] = polar(cx, cy, outer, a1);
  const [ix1, iy1] = polar(cx, cy, inner, a1);
  const [ix0, iy0] = polar(cx, cy, inner, a0);
  const f = (n: number) => n.toFixed(2);
  return (
    `M${f(ox0)} ${f(oy0)}A${outer} ${outer} 0 ${large} 1 ${f(ox1)} ${f(oy1)}` +
    `L${f(ix1)} ${f(iy1)}A${inner} ${inner} 0 ${large} 0 ${f(ix0)} ${f(iy0)}Z`
  );
}

/**
 * Draws a mark: a ring in its issue colours (equal arcs, table order, from 12 o'clock)
 * with dark edges so light colours such as yellow stay visible, and the letter codes
 * stacked in the centre with a white halo. Used by the editor and the export alike.
 */
export function renderMark(m: Mark): SVGGElement {
  const r = displayRadius(m);
  const outer = r + RING_WIDTH / 2;
  const inner = r - RING_WIDTH / 2;
  const g = svg('g', { class: 'mark', 'data-mark-id': m.id });

  const n = m.types.length;
  if (n <= 1) {
    const colour = n === 1 ? issueInfo(m.types[0]!).colour : '#ffffff';
    g.append(svg('circle', { cx: m.x, cy: m.y, r, fill: 'none', stroke: colour, 'stroke-width': RING_WIDTH }));
  } else {
    const step = (2 * Math.PI) / n;
    m.types.forEach((t, i) => {
      g.append(svg('path', { d: sector(m.x, m.y, outer, inner, i * step, (i + 1) * step), fill: issueInfo(t).colour }));
    });
    for (let i = 0; i < n; i++) {
      const [x1, y1] = polar(m.x, m.y, inner, i * step);
      const [x2, y2] = polar(m.x, m.y, outer, i * step);
      g.append(svg('line', { x1, y1, x2, y2, stroke: OUTLINE, 'stroke-width': OUTLINE_WIDTH }));
    }
  }
  for (const edge of [outer, inner]) {
    g.append(svg('circle', { cx: m.x, cy: m.y, r: edge, fill: 'none', stroke: OUTLINE, 'stroke-width': OUTLINE_WIDTH }));
  }

  const top = m.y - ((n - 1) * CODE_LINE_HEIGHT) / 2;
  m.types.forEach((t, i) => {
    g.append(
      svg(
        'text',
        {
          x: m.x,
          y: top + i * CODE_LINE_HEIGHT,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': FONT_STACK,
          'font-size': CODE_FONT_SIZE,
          'font-weight': 700,
          fill: OUTLINE,
          stroke: '#ffffff',
          'stroke-width': 7,
          'stroke-linejoin': 'round',
          'paint-order': 'stroke',
        },
        [issueInfo(t).code],
      ),
    );
  });
  return g;
}

/** All marks for one view, largest first so smaller marks sit on top and stay clickable. */
export function renderMarks(marks: readonly Mark[]): SVGGElement {
  const sorted = [...marks].sort((a, b) => displayRadius(b) - displayRadius(a));
  return svg('g', { class: 'marks' }, sorted.map(renderMark));
}
