import type { Joint } from '../data/joints';
import { FREE_MARK_RADIUS } from './session';

/**
 * The nearest joint whose snap radius contains the point. A joint's snap radius is its
 * default mark radius, or `minRadius` if that's larger: on a phone a joint's radius
 * can be only a few pixels, so callers pass a minimum based on finger size.
 */
export function nearestJoint(joints: readonly Joint[], x: number, y: number, minRadius = 0): Joint | null {
  let best: Joint | null = null;
  let bestDist = Infinity;
  for (const j of joints) {
    const d = Math.hypot(j.x - x, j.y - y);
    if (d <= Math.max(j.r, minRadius) && d < bestDist) {
      best = j;
      bestDist = d;
    }
  }
  return best;
}

/** The joint nearest to `from` in an arrow-key direction, or null if there's none that way. */
export function jointInDirection(
  joints: readonly Joint[],
  from: { x: number; y: number },
  dir: 'up' | 'down' | 'left' | 'right',
): Joint | null {
  const [ux, uy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] as [number, number];
  let best: Joint | null = null;
  let bestCost = Infinity;
  for (const j of joints) {
    const dx = j.x - from.x;
    const dy = j.y - from.y;
    const along = dx * ux + dy * uy;
    if (along <= 4) continue;
    const across = Math.abs(dx * uy - dy * ux);
    const cost = along + 2 * across; // prefer joints straight ahead
    if (cost < bestCost) {
      best = j;
      bestCost = cost;
    }
  }
  return best;
}

export interface Placement {
  x: number;
  y: number;
  r: number;
  jointId?: string;
}

/**
 * Where a click places a mark: centred on the nearest joint within its snap radius,
 * or exactly where clicked (a free mark) when no joint is in range or snapping is off
 * (Alt held, or the snap toggle off).
 */
export function placeAt(
  joints: readonly Joint[],
  x: number,
  y: number,
  opts: { snap: boolean; freeRadius?: number; minSnapRadius?: number },
): Placement {
  const joint = opts.snap ? nearestJoint(joints, x, y, opts.minSnapRadius) : null;
  if (joint) return { x: joint.x, y: joint.y, r: joint.r, jointId: joint.id };
  return { x, y, r: opts.freeRadius ?? FREE_MARK_RADIUS };
}
