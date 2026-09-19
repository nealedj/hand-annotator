import { jointsFor } from '../data/joints';
import { layoutCallouts, type CalloutItem, type Circle, type PlacedCallout } from '../layout/callouts';
import type { Measure } from '../layout/text';
import { displayRadius, RING_WIDTH, sameView, type Session } from '../model/session';
import type { View } from '../views';
import { renderMarks } from './marks';
import { PIN_RADIUS, renderCallouts, renderLeaderDots, renderLeaders, renderPin } from './notes';
import { svg } from './svg';

/** The callouts to lay out for one view: notes on marks (headed by the joint label) and pins. */
export function calloutInputs(session: Session, view: View): { items: CalloutItem[]; obstacles: Circle[] } {
  const marks = session.marks.filter((m) => sameView(m.view, view));
  const pins = session.pins.filter((p) => sameView(p.view, view));
  const joints = jointsFor(view);
  const items: CalloutItem[] = [];
  for (const m of marks) {
    if (!m.note?.text.trim()) continue;
    const joint = m.jointId ? joints.find((j) => j.id === m.jointId) : undefined;
    items.push({
      key: `mark:${m.id}`,
      anchor: { x: m.x, y: m.y, r: displayRadius(m) + RING_WIDTH / 2 },
      heading: joint?.label,
      text: m.note.text,
      manual: m.note.callout,
    });
  }
  for (const p of pins) {
    if (!p.note.text.trim()) continue;
    items.push({ key: `pin:${p.id}`, anchor: { x: p.x, y: p.y, r: PIN_RADIUS + 1.5 }, text: p.note.text, manual: p.note.callout });
  }
  const obstacles = [
    ...marks.map((m) => ({ x: m.x, y: m.y, r: displayRadius(m) + RING_WIDTH / 2 })),
    ...pins.map((p) => ({ x: p.x, y: p.y, r: PIN_RADIUS + 2 })),
  ];
  return { items, obstacles };
}

export interface Scene {
  /** Layers in paint order: leaders under the marks, then marks, pins, dots and callouts. */
  layers: SVGGElement[];
  marks: SVGGElement;
  pins: SVGGElement;
  placed: PlacedCallout[];
}

/**
 * Everything drawn on top of the hand for one view. The editor and the PNG export both
 * call this, so they can't drift apart.
 */
export function renderScene(session: Session, view: View, measure: Measure): Scene {
  const { items, obstacles } = calloutInputs(session, view);
  const placed = layoutCallouts(view, items, obstacles, measure);
  const marks = renderMarks(session.marks.filter((m) => sameView(m.view, view)));
  const pins = svg('g', { class: 'pins' }, session.pins.filter((p) => sameView(p.view, view)).map(renderPin));
  const layers = [renderLeaders(placed), marks, pins, renderLeaderDots(placed), renderCallouts(placed)];
  return { layers, marks, pins, placed };
}
