import { CALLOUT, type PlacedCallout } from '../layout/callouts';
import type { Pin } from '../model/session';
import { viewLabel } from '../views';
import { FONT_STACK, svg } from './svg';

export const PIN_RADIUS = 11;

const INK = '#1f2328';
const LEADER = '#4a5058';

export function pinDescription(p: Pin): string {
  return `Pin note, ${viewLabel(p.view).toLowerCase()}: ${p.note.text || 'empty'}`;
}

/** A small pin marker: a dark disc with a white rim and centre. */
export function renderPin(p: Pin): SVGGElement {
  return svg('g', { class: 'pin', 'data-pin-id': p.id }, [
    svg('circle', { cx: p.x, cy: p.y, r: PIN_RADIUS, fill: LEADER, stroke: '#ffffff', 'stroke-width': 3 }),
    svg('circle', { cx: p.x, cy: p.y, r: 3.5, fill: '#ffffff' }),
  ]);
}

/** Leader lines: dark grey, ending in a small dot at the edge of the mark or pin. */
export function renderLeaders(placed: readonly PlacedCallout[]): SVGGElement {
  const g = svg('g', { class: 'leaders' });
  for (const p of placed) {
    if (!p.leader) continue;
    const { x1, y1, x2, y2 } = p.leader;
    g.append(
      svg('line', { x1, y1, x2, y2, stroke: LEADER, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'data-callout': p.key }),
    );
  }
  return g;
}

export function renderLeaderDots(placed: readonly PlacedCallout[]): SVGGElement {
  return svg(
    'g',
    { class: 'leader-dots' },
    placed.filter((p) => p.leader).map((p) => svg('circle', { cx: p.leader!.x2, cy: p.leader!.y2, r: 5, fill: LEADER })),
  );
}

/** Callout boxes: white fill, thin grey border, text wrapped in code into tspans. */
export function renderCallouts(placed: readonly PlacedCallout[]): SVGGElement {
  const g = svg('g', { class: 'callouts' });
  for (const p of placed) {
    const { x, y, w, h } = p.box;
    const text = svg('text', {
      'font-family': FONT_STACK,
      'font-size': CALLOUT.fontSize,
      fill: INK,
    });
    const lines = [
      ...p.headingLines.map((t) => ({ t, bold: true })),
      ...p.bodyLines.map((t) => ({ t, bold: false })),
    ];
    lines.forEach((line, i) => {
      const attrs: Record<string, string | number> = {
        x: x + CALLOUT.padding,
        y: y + CALLOUT.padding + CALLOUT.fontSize * 0.8 + i * CALLOUT.lineHeight,
      };
      if (line.bold) attrs['font-weight'] = 700;
      text.append(svg('tspan', attrs, [line.t]));
    });
    g.append(
      svg('g', { class: 'callout', 'data-callout': p.key }, [
        svg('rect', { x, y, width: w, height: h, rx: 6, fill: '#ffffff', stroke: '#8c939a', 'stroke-width': 2 }),
        text,
      ]),
    );
  }
  return g;
}
