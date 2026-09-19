import type { Joint } from '../data/joints';
import { FREE_MARK_RADIUS } from './session';

/** The nearest joint whose snap radius (its default mark radius) contains the point. */
export function nearestJoint(joints: readonly Joint[], x: number, y: number): Joint | null {
  let best: Joint | null = null;
  let bestDist = Infinity;
  for (const j of joints) {
    const d = Math.hypot(j.x - x, j.y - y);
    if (d <= j.r && d < bestDist) {
      best = j;
      bestDist = d;
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
  opts: { snap: boolean; freeRadius?: number },
): Placement {
  const joint = opts.snap ? nearestJoint(joints, x, y) : null;
  if (joint) return { x: joint.x, y: joint.y, r: joint.r, jointId: joint.id };
  return { x, y, r: opts.freeRadius ?? FREE_MARK_RADIUS };
}
