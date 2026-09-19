import { describe, expect, it } from 'vitest';
import data from '../../src/data/joints.json';
import { boxesOverlap, CALLOUT, handOccupancy, layoutCallouts, type CalloutItem, type PlacedCallout } from '../../src/layout/callouts';
import { wrapText, type Measure } from '../../src/layout/text';
import { VIEWS, viewKey, type View } from '../../src/views';

/** Rough stand-in for canvas text measurement: average glyph widths of a sans-serif. */
const measure: Measure = (t, bold) => t.length * CALLOUT.fontSize * (bold ? 0.6 : 0.54);

const LOREM =
  'Tender on palpation with mild fusiform swelling. Worse in the morning, eases after about thirty minutes of use. ' +
  'Reports dropping cups. Night pain wakes patient twice a week, relieved by shaking the hand.';
const note = (n: number) => LOREM.slice(0, n).trim();

function denseItems(view: View, jointIds: string[], lengths: number[]): { items: CalloutItem[]; obstacles: { x: number; y: number; r: number }[] } {
  const joints = data.views[viewKey(view)];
  const items = jointIds.map((id, i) => {
    const j = joints.find((x) => x.id === id)!;
    return { key: `mark:${id}`, anchor: { x: j.x, y: j.y, r: j.r + 6 }, heading: j.label, text: note(lengths[i % lengths.length]!) };
  });
  return { items, obstacles: items.map((it) => ({ ...it.anchor })) };
}

function crossings(placed: PlacedCallout[]): number {
  let n = 0;
  const segs = placed.map((p) => p.leader).filter((l) => l !== null);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i]!;
      const b = segs[j]!;
      const c = (ox: number, oy: number, px: number, py: number, qx: number, qy: number) => (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
      if (c(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1) * c(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2) < 0 &&
          c(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1) * c(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2) < 0) n++;
    }
  }
  return n;
}

function expectClean(view: View, placed: PlacedCallout[]) {
  const occ = handOccupancy(view);
  for (const p of placed) {
    expect(p.crowded, `${p.key} had no free space`).toBe(false);
    expect(occ.overlaps(p.box), `${p.key} overlaps the hand`).toBe(false);
    expect(p.box.x).toBeGreaterThanOrEqual(0);
    expect(p.box.y).toBeGreaterThanOrEqual(0);
    expect(p.box.x + p.box.w).toBeLessThanOrEqual(data.viewBox.width);
    expect(p.box.y + p.box.h).toBeLessThanOrEqual(data.viewBox.height);
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      expect(boxesOverlap(placed[i]!.box, placed[j]!.box), `${placed[i]!.key} overlaps ${placed[j]!.key}`).toBe(false);
    }
  }
}

describe('wrapText', () => {
  it('wraps at word boundaries within the width', () => {
    const lines = wrapText(LOREM, 270, measure);
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(measure(l, false)).toBeLessThanOrEqual(270);
    expect(lines.join(' ')).toBe(LOREM.replace(/\s+/g, ' ').trim());
  });

  it('breaks words longer than a line', () => {
    const lines = wrapText('x'.repeat(80), 270, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('x'.repeat(80));
  });
});

const FIXTURES: { name: string; joints: string[]; lengths: number[] }[] = [
  { name: 'typical: five notes', joints: ['index-pip', 'middle-mcp', 'little-dip', 'thumb-cmc', 'radiocarpal'], lengths: [60, 120, 40, 200, 90] },
  { name: 'dense fingers: every DIP and PIP', joints: ['index-dip', 'index-pip', 'middle-dip', 'middle-pip', 'ring-dip', 'ring-pip', 'little-dip', 'little-pip'], lengths: [50, 90, 30, 70] },
  { name: 'dense wrist and thumb', joints: ['thumb-ip', 'thumb-mcp', 'thumb-cmc', 'radiocarpal', 'druj', 'radial-styloid', 'ulnar-styloid'], lengths: [80, 40, 120, 60] },
  { name: 'ten mixed notes', joints: ['index-dip', 'index-mcp', 'middle-pip', 'ring-pip', 'ring-mcp', 'little-mcp', 'thumb-ip', 'thumb-cmc', 'druj', 'radial-styloid'], lengths: [120, 60, 30, 90] },
  { name: 'five full-length notes', joints: ['index-pip', 'middle-mcp', 'ring-dip', 'little-pip', 'thumb-mcp'], lengths: [200] },
];

describe('layoutCallouts', () => {
  for (const view of VIEWS) {
    for (const f of FIXTURES) {
      it(`${viewKey(view)}, ${f.name}: no overlaps, off the hand, inside the view`, () => {
        const { items, obstacles } = denseItems(view, f.joints, f.lengths);
        const placed = layoutCallouts(view, items, obstacles, measure);
        expect(placed).toHaveLength(items.length);
        expectClean(view, placed);
      });
    }
  }

  it('avoids crossing leader lines in a typical layout', () => {
    for (const view of VIEWS) {
      const { items, obstacles } = denseItems(view, FIXTURES[0]!.joints, FIXTURES[0]!.lengths);
      expect(crossings(layoutCallouts(view, items, obstacles, measure))).toBe(0);
    }
  });

  it('degrades gracefully when there is more text than space', () => {
    const view = VIEWS[2]!;
    const ids = data.views['right-palmar'].map((j) => j.id);
    const { items, obstacles } = denseItems(view, ids, [200]);
    const placed = layoutCallouts(view, items, obstacles, measure);
    expect(placed).toHaveLength(19);
    // Some are flagged crowded, but every callout is still inside the view.
    for (const p of placed) {
      expect(p.box.x).toBeGreaterThanOrEqual(0);
      expect(p.box.x + p.box.w).toBeLessThanOrEqual(data.viewBox.width);
    }
  });

  it('keeps a dragged callout where the clinician put it', () => {
    const view = VIEWS[2]!;
    const { items, obstacles } = denseItems(view, ['index-pip', 'middle-pip'], [60]);
    items[0] = { ...items[0]!, manual: { dx: 300, dy: -50 } };
    const placed = layoutCallouts(view, items, obstacles, measure);
    const p = placed.find((x) => x.key === items[0]!.key)!;
    expect(p.box.x + p.box.w / 2).toBeCloseTo(items[0]!.anchor.x + 300, 0);
    expect(p.box.y + p.box.h / 2).toBeCloseTo(items[0]!.anchor.y - 50, 0);
    expect(boxesOverlap(p.box, placed[1]!.box)).toBe(false);
  });

  it('is deterministic', () => {
    const view = VIEWS[0]!;
    const { items, obstacles } = denseItems(view, FIXTURES[4]!.joints, FIXTURES[4]!.lengths);
    expect(layoutCallouts(view, items, obstacles, measure)).toEqual(layoutCallouts(view, items, obstacles, measure));
  });

  it('is fast enough to run while dragging', () => {
    const view = VIEWS[3]!;
    const { items, obstacles } = denseItems(view, FIXTURES[3]!.joints, FIXTURES[3]!.lengths);
    layoutCallouts(view, items, obstacles, measure); // warm the occupancy cache
    const t0 = performance.now();
    layoutCallouts(view, items, obstacles, measure);
    expect(performance.now() - t0).toBeLessThan(150);
  });
});
