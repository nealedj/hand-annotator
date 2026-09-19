export type Hand = 'left' | 'right';
export type Side = 'palmar' | 'dorsal';

export interface View {
  hand: Hand;
  side: Side;
}

export type ViewKey = `${Hand}-${Side}`;

/** The four hand/side combinations, in the fixed export order. */
export const VIEWS: readonly View[] = [
  { hand: 'left', side: 'palmar' },
  { hand: 'left', side: 'dorsal' },
  { hand: 'right', side: 'palmar' },
  { hand: 'right', side: 'dorsal' },
];

export const viewKey = (v: View): ViewKey => `${v.hand}-${v.side}`;

/** The clinical safety label for a view, e.g. "RIGHT HAND — PALMAR". Never abbreviate. */
export const viewLabel = (v: View): string => `${v.hand.toUpperCase()} HAND — ${v.side.toUpperCase()}`;

/**
 * Which way the ulnar (little-finger) side points on screen: -1 for left, +1 for right.
 * The artwork is a right hand with the thumb on the right in palmar view; left views mirror it.
 */
export const ulnarDirection = (v: View): -1 | 1 => ((v.hand === 'right') === (v.side === 'palmar') ? -1 : 1);
