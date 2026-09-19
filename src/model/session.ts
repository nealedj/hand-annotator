import { inTableOrder, type IssueType } from './issues';
import type { View } from '../views';

export interface Note {
  text: string;
  /** Callout offset from the anchor, in artwork units. */
  callout: { dx: number; dy: number };
}

export interface Mark {
  id: string;
  view: View;
  /** Centre and radius in artwork viewBox units. */
  x: number;
  y: number;
  r: number;
  /** Present when snapped to a joint. */
  jointId?: string;
  /** At least one, in table order. */
  types: IssueType[];
  note?: Note;
}

export interface Pin {
  id: string;
  view: View;
  x: number;
  y: number;
  note: Note;
}

export interface Session {
  marks: Mark[];
  pins: Pin[];
  generalNotes: string;
}

export const emptySession = (): Session => ({ marks: [], pins: [], generalNotes: '' });

/** Ring thickness and letter metrics, in artwork units. Shared with the renderer. */
export const RING_WIDTH = 12;
export const CODE_FONT_SIZE = 26;
export const CODE_LINE_HEIGHT = 27;
export const MIN_RADIUS = 24;
export const MAX_RADIUS = 220;
/** Radius for a free mark placed away from any joint. */
export const FREE_MARK_RADIUS = 36;

/** The smallest radius at which `count` stacked letter codes fit inside the ring. */
export const minRadius = (count: number): number =>
  Math.max(MIN_RADIUS, Math.ceil((CODE_LINE_HEIGHT * Math.max(1, count) + 10) / 2 + RING_WIDTH / 2));

/** The radius a mark is drawn at: never so small that its codes don't fit. */
export const displayRadius = (m: Pick<Mark, 'r' | 'types'>): number => Math.max(m.r, minRadius(m.types.length));

export const sameView = (a: View, b: View): boolean => a.hand === b.hand && a.side === b.side;

export type Action =
  | { type: 'addMark'; mark: Mark }
  | { type: 'setMarkTypes'; id: string; types: IssueType[] }
  /** Moves a mark. With jointId it's snapped there; without, it becomes a free mark. */
  | { type: 'moveMark'; id: string; x: number; y: number; r?: number; jointId?: string }
  | { type: 'resizeMark'; id: string; r: number }
  | { type: 'deleteMark'; id: string };

function updateMark(s: Session, id: string, f: (m: Mark) => Mark): Session {
  if (!s.marks.some((m) => m.id === id)) return s;
  return { ...s, marks: s.marks.map((m) => (m.id === id ? f(m) : m)) };
}

/** Pure state transition. Returns the same object when nothing changes. */
export function reduce(s: Session, a: Action): Session {
  switch (a.type) {
    case 'addMark':
      return { ...s, marks: [...s.marks, { ...a.mark, types: inTableOrder(a.mark.types) }] };
    case 'setMarkTypes':
      return updateMark(s, a.id, (m) => ({ ...m, types: inTableOrder(a.types) }));
    case 'moveMark':
      return updateMark(s, a.id, (m) => {
        const { jointId: _old, ...rest } = m;
        const moved: Mark = { ...rest, x: a.x, y: a.y, r: a.r ?? m.r };
        return a.jointId ? { ...moved, jointId: a.jointId } : moved;
      });
    case 'resizeMark':
      return updateMark(s, a.id, (m) => ({
        ...m,
        r: Math.min(MAX_RADIUS, Math.max(minRadius(m.types.length), a.r)),
      }));
    case 'deleteMark':
      return s.marks.some((m) => m.id === a.id) ? { ...s, marks: s.marks.filter((m) => m.id !== a.id) } : s;
  }
}

let counter = 0;
/** In-memory ids; never persisted, so a counter is enough. */
export const nextId = (prefix: string): string => `${prefix}${++counter}`;
