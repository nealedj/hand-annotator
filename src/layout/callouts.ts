import shape from '../data/hand-shape.json';
import { VIEWBOX } from '../data/joints';
import { isMirrored, type View } from '../views';
import { wrapText, type Measure } from './text';

/** Callout metrics in artwork units. The font size keeps text legible on an A4 print. */
export const CALLOUT = {
  fontSize: 22,
  lineHeight: 28,
  padding: 12,
  maxWidth: 240,
  minWidth: 90,
} as const;

/** Space kept between callouts, and between callouts and the hand outline. */
const GAP = 12;
const HAND_CLEARANCE = 14;
const EDGE = 8;
const STEP = 8;
/** The view label's corner, kept clear. */
const LABEL_BOX: Box = { x: 0, y: 0, w: 700, h: 112 };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CalloutItem {
  /** Stable key, e.g. "mark:m3". */
  key: string;
  /** Anchor centre, and the radius at which the leader line ends (the mark or pin edge). */
  anchor: { x: number; y: number; r: number };
  /** Bold first line(s): the joint label for a snapped mark. */
  heading?: string;
  text: string;
  /** Centre offset from the anchor when the clinician has dragged the callout. */
  manual?: { dx: number; dy: number };
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface PlacedCallout {
  key: string;
  box: Box;
  headingLines: string[];
  bodyLines: string[];
  /** Leader from the callout's edge (x1, y1) to the mark or pin edge (x2, y2); null if they touch. */
  leader: { x1: number; y1: number; x2: number; y2: number } | null;
  /** True if there was no free space and the callout had to overlap something. */
  crowded: boolean;
}

// ---- Hand occupancy -----------------------------------------------------------------

const CELL = 10;

/** Which grid cells the hand (plus clearance) covers, as a summed-area table for O(1) box queries. */
class Occupancy {
  readonly cols = Math.ceil(VIEWBOX.width / CELL);
  readonly rows = Math.ceil(VIEWBOX.height / CELL);
  private readonly sum: Int32Array;
  /** Per row: the hand's leftmost and rightmost occupied x (including clearance), or null. */
  private readonly extents: ([number, number] | null)[];

  constructor(polygons: [number, number][][]) {
    const { cols, rows } = this;
    const occupied = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * CELL;
        const y = (r + 0.5) * CELL;
        const reach = HAND_CLEARANCE + CELL * 0.71;
        if (polygons.some((poly) => inPolygon(poly, x, y) || distToPolygon(poly, x, y) < reach)) {
          occupied[r * cols + c] = 1;
        }
      }
    }
    this.extents = [];
    for (let r = 0; r < rows; r++) {
      let lo = -1;
      let hi = -1;
      for (let c = 0; c < cols; c++) {
        if (!occupied[r * cols + c]) continue;
        if (lo < 0) lo = c;
        hi = c;
      }
      this.extents.push(lo < 0 ? null : [lo * CELL, (hi + 1) * CELL]);
    }
    this.sum = new Int32Array((cols + 1) * (rows + 1));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r + 1) * (cols + 1) + (c + 1);
        this.sum[i] = occupied[r * cols + c]! + this.sum[i - 1]! + this.sum[i - (cols + 1)]! - this.sum[i - (cols + 1) - 1]!;
      }
    }
  }

  /** The hand's horizontal extent across rows y0..y1, or the whole hand's if none there. */
  span(y0: number, y1: number): [number, number] {
    let lo = Infinity;
    let hi = -Infinity;
    const r0 = Math.max(0, Math.floor(y0 / CELL));
    const r1 = Math.min(this.rows - 1, Math.floor(y1 / CELL));
    for (let r = r0; r <= r1; r++) {
      const e = this.extents[r];
      if (e) {
        lo = Math.min(lo, e[0]);
        hi = Math.max(hi, e[1]);
      }
    }
    return lo === Infinity ? this.span(0, VIEWBOX.height) : [lo, hi];
  }

  /** Whether a box touches the hand. */
  overlaps(b: Box): boolean {
    const c0 = Math.max(0, Math.floor(b.x / CELL));
    const r0 = Math.max(0, Math.floor(b.y / CELL));
    const c1 = Math.min(this.cols, Math.ceil((b.x + b.w) / CELL));
    const r1 = Math.min(this.rows, Math.ceil((b.y + b.h) / CELL));
    if (c1 <= c0 || r1 <= r0) return false;
    const w = this.cols + 1;
    const total = this.sum[r1 * w + c1]! - this.sum[r0 * w + c1]! - this.sum[r1 * w + c0]! + this.sum[r0 * w + c0]!;
    return total > 0;
  }
}

function inPolygon(poly: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distToPolygon(poly: [number, number][], x: number, y: number): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    d = Math.min(d, distToSegment(x, y, poly[j]![0], poly[j]![1], poly[i]![0], poly[i]![1]));
  }
  return d;
}

const occupancyCache = new Map<boolean, Occupancy>();

/** The hand's occupancy for a view. The shape is the right palmar hand; some views mirror it. */
export function handOccupancy(view: View): Occupancy {
  const mirrored = isMirrored(view);
  let occ = occupancyCache.get(mirrored);
  if (!occ) {
    const polys = (shape.polygons as [number, number][][]).map((poly) =>
      poly.map(([x, y]) => [mirrored ? VIEWBOX.width - x : x, y] as [number, number]),
    );
    occ = new Occupancy(polys);
    occupancyCache.set(mirrored, occ);
  }
  return occ;
}

// ---- Geometry helpers -----------------------------------------------------------------

export const boxesOverlap = (a: Box, b: Box, gap = 0): boolean =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

const circleHitsBox = (c: Circle, b: Box): boolean => {
  const nx = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
  return Math.hypot(c.x - nx, c.y - ny) < c.r;
};

function leaderFor(anchor: CalloutItem['anchor'], box: Box): PlacedCallout['leader'] {
  const bx = Math.max(box.x, Math.min(anchor.x, box.x + box.w));
  const by = Math.max(box.y, Math.min(anchor.y, box.y + box.h));
  const d = Math.hypot(bx - anchor.x, by - anchor.y);
  if (d <= anchor.r + 4) return null;
  const ux = (bx - anchor.x) / d;
  const uy = (by - anchor.y) / d;
  return { x1: bx, y1: by, x2: anchor.x + ux * anchor.r, y2: anchor.y + uy * anchor.r };
}

// ---- Sizing -------------------------------------------------------------------------------

export function calloutText(item: Pick<CalloutItem, 'heading' | 'text'>, measure: Measure) {
  const inner = CALLOUT.maxWidth - 2 * CALLOUT.padding;
  const headingLines = item.heading ? wrapText(item.heading, inner, measure, true) : [];
  const bodyLines = wrapText(item.text, inner, measure);
  const widest = Math.max(
    0,
    ...headingLines.map((l) => measure(l, true)),
    ...bodyLines.map((l) => measure(l, false)),
  );
  const lines = headingLines.length + bodyLines.length;
  return {
    headingLines,
    bodyLines,
    w: Math.ceil(Math.max(CALLOUT.minWidth, Math.min(CALLOUT.maxWidth, widest + 2 * CALLOUT.padding))),
    h: Math.ceil(lines * CALLOUT.lineHeight + 2 * CALLOUT.padding - (CALLOUT.lineHeight - CALLOUT.fontSize)),
  };
}

// ---- Placement ------------------------------------------------------------------------------

type Side = 'left' | 'right';

interface Entry {
  item: CalloutItem;
  headingLines: string[];
  bodyLines: string[];
  w: number;
  h: number;
  side: Side;
}

/** The box's x on a side: as close to the hand as its rows allow, or null if it doesn't fit. */
function hugX(occ: Occupancy, side: Side, y: number, w: number, h: number): number | null {
  const [lo, hi] = occ.span(y, y + h);
  if (side === 'left') {
    const x = lo - w;
    return x >= EDGE ? x : null;
  }
  return hi + w <= VIEWBOX.width - EDGE ? hi : null;
}

/**
 * Stacks boxes in one margin in their anchors' vertical order, so leaders don't cross.
 * Overlapping neighbours merge into a cluster centred on its anchors (classic
 * boundary labelling), clamped to the column's extent.
 */
function stackColumn(entries: Entry[], minY: number, maxY: number): number[] {
  type Cluster = { first: number; last: number; top: number; height: number };
  const clusters: Cluster[] = [];
  const desired = entries.map((e) => e.item.anchor.y - e.h / 2);
  const bestTop = (c: Cluster) => {
    let offset = 0;
    let sum = 0;
    for (let i = c.first; i <= c.last; i++) {
      sum += desired[i]! - offset;
      offset += entries[i]!.h + GAP;
    }
    const top = sum / (c.last - c.first + 1);
    return Math.max(minY, Math.min(top, maxY - c.height));
  };
  entries.forEach((e, i) => {
    let c: Cluster = { first: i, last: i, top: 0, height: e.h };
    c.top = bestTop(c);
    while (clusters.length) {
      const prev = clusters[clusters.length - 1]!;
      if (prev.top + prev.height + GAP <= c.top) break;
      clusters.pop();
      c = { first: prev.first, last: c.last, top: 0, height: prev.height + GAP + c.height };
      c.top = bestTop(c);
    }
    clusters.push(c);
  });
  const tops: number[] = [];
  for (const c of clusters) {
    let y = c.top;
    for (let i = c.first; i <= c.last; i++) {
      tops.push(Math.round(y));
      y += entries[i]!.h + GAP;
    }
  }
  return tops;
}

/**
 * Places callouts in the margins beside the hand. Each goes to the side whose hand
 * edge is nearer its anchor (rebalanced if one side is full), stacked in anchor order
 * and pushed against the hand's outline. Dragged callouts stay where the clinician put
 * them and the rest avoid them. Deterministic, so the editor and the export agree.
 */
export function layoutCallouts(
  view: View,
  items: readonly CalloutItem[],
  obstacles: readonly Circle[],
  measure: Measure,
): PlacedCallout[] {
  const occ = handOccupancy(view);
  const H = VIEWBOX.height;
  const placed: PlacedCallout[] = [];
  const top: Record<Side, number> = { left: EDGE, right: EDGE };
  // The view label sits top left (top right is never used by it).
  top.left = LABEL_BOX.h + GAP;

  const entries: Entry[] = items.map((item) => {
    const [lo, hi] = occ.span(item.anchor.y - 20, item.anchor.y + 20);
    const side: Side = item.anchor.x - lo <= hi - item.anchor.x ? 'left' : 'right';
    return { item, ...calloutText(item, measure), side };
  });

  for (const e of entries.filter((e) => e.item.manual)) {
    const { dx, dy } = e.item.manual!;
    const box = { x: Math.round(e.item.anchor.x + dx - e.w / 2), y: Math.round(e.item.anchor.y + dy - e.h / 2), w: e.w, h: e.h };
    placed.push({ key: e.item.key, box, headingLines: e.headingLines, bodyLines: e.bodyLines, leader: leaderFor(e.item.anchor, box), crowded: false });
  }
  const fixed = placed.map((p) => p.box);

  const auto = entries.filter((e) => !e.item.manual);
  // Rebalance: move the most central callouts off a side that can't hold them all.
  const load = (side: Side) => auto.filter((e) => e.side === side).reduce((n, e) => n + e.h + GAP, 0);
  const capacity = (side: Side) => H - EDGE - top[side];
  for (const side of ['left', 'right'] as const) {
    const other: Side = side === 'left' ? 'right' : 'left';
    while (load(side) > capacity(side)) {
      const [lo, hi] = occ.span(0, H);
      const mid = (lo + hi) / 2;
      const movable = auto
        .filter((e) => e.side === side)
        .sort((a, b) => Math.abs(a.item.anchor.x - mid) - Math.abs(b.item.anchor.x - mid))[0];
      if (!movable || load(other) + movable.h + GAP > capacity(other)) break;
      movable.side = other;
    }
  }

  for (const side of ['left', 'right'] as const) {
    const column = auto
      .filter((e) => e.side === side)
      .sort((a, b) => a.item.anchor.y - b.item.anchor.y || a.item.anchor.x - b.item.anchor.x);
    const tops = stackColumn(column, top[side], H - EDGE);
    const columnBoxes: Box[] = [];

    column.forEach((e, i) => {
      const valid = (y: number): Box | null => {
        if (y < top[side] || y + e.h > H - EDGE) return null;
        const x = hugX(occ, side, y, e.w, e.h);
        if (x === null) return null;
        const box = { x, y, w: e.w, h: e.h };
        if (boxesOverlap(box, LABEL_BOX)) return null;
        if ([...fixed, ...columnBoxes, ...placed.map((p) => p.box)].some((b) => boxesOverlap(box, b, GAP))) return null;
        if (obstacles.some((c) => circleHitsBox({ ...c, r: c.r + GAP }, box))) return null;
        return box;
      };
      // Use the stacked position if it's free, else the nearest free height.
      let box = valid(tops[i]!);
      for (let d = STEP; !box && d < H; d += STEP) box = valid(tops[i]! + d) ?? valid(tops[i]! - d);
      const crowded = !box;
      if (!box) {
        const x = side === 'left' ? EDGE : VIEWBOX.width - EDGE - e.w;
        box = { x, y: Math.max(EDGE, Math.min(tops[i]!, H - EDGE - e.h)), w: e.w, h: e.h };
      }
      columnBoxes.push(box);
      placed.push({ key: e.item.key, box, headingLines: e.headingLines, bodyLines: e.bodyLines, leader: leaderFor(e.item.anchor, box), crowded });
    });
  }

  // Keep the caller's order for rendering.
  const order = new Map(items.map((it, i) => [it.key, i]));
  return placed.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
}
