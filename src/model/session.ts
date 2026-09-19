import { inTableOrder, type IssueType } from './issues';
import type { View } from '../views';

export interface Note {
  text: string;
  /**
   * Where the clinician dragged the callout: its centre's offset from the anchor, in
   * artwork units. Absent means placed automatically (see layout/callouts.ts).
   */
  callout?: { dx: number; dy: number };
}

/** Pinned-note and general-note length limits. */
export const NOTE_MAX = 200;
export const GENERAL_NOTES_MAX = 2000;

/** Something a pinned note can belong to. */
export interface Target {
  kind: 'mark' | 'pin';
  id: string;
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
  | { type: 'deleteMark'; id: string }
  | { type: 'addPin'; pin: Pin }
  | { type: 'movePin'; id: string; x: number; y: number }
  | { type: 'deletePin'; id: string }
  /** Sets a mark's or pin's note text. Empty text removes a mark's note. */
  | { type: 'setNote'; target: Target; text: string }
  | { type: 'moveCallout'; target: Target; dx: number; dy: number }
  | { type: 'setGeneralNotes'; text: string };

function updateMark(s: Session, id: string, f: (m: Mark) => Mark): Session {
  if (!s.marks.some((m) => m.id === id)) return s;
  return { ...s, marks: s.marks.map((m) => (m.id === id ? f(m) : m)) };
}

function updatePin(s: Session, id: string, f: (p: Pin) => Pin): Session {
  if (!s.pins.some((p) => p.id === id)) return s;
  return { ...s, pins: s.pins.map((p) => (p.id === id ? f(p) : p)) };
}

/** Single-paragraph note text, within the limit. */
export const cleanNote = (text: string): string => text.replace(/\s*\n+\s*/g, ' ').slice(0, NOTE_MAX);

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
    case 'addPin':
      return { ...s, pins: [...s.pins, { ...a.pin, note: { ...a.pin.note, text: cleanNote(a.pin.note.text) } }] };
    case 'movePin':
      return updatePin(s, a.id, (p) => ({ ...p, x: a.x, y: a.y }));
    case 'deletePin':
      return s.pins.some((p) => p.id === a.id) ? { ...s, pins: s.pins.filter((p) => p.id !== a.id) } : s;
    case 'setNote': {
      const text = cleanNote(a.text);
      if (a.target.kind === 'pin') return updatePin(s, a.target.id, (p) => ({ ...p, note: { ...p.note, text } }));
      return updateMark(s, a.target.id, (m) => {
        if (text.trim() === '') {
          const { note: _gone, ...rest } = m;
          return rest;
        }
        return { ...m, note: { ...m.note, text } };
      });
    }
    case 'moveCallout': {
      const callout = { dx: a.dx, dy: a.dy };
      if (a.target.kind === 'pin') return updatePin(s, a.target.id, (p) => ({ ...p, note: { ...p.note, callout } }));
      return updateMark(s, a.target.id, (m) => (m.note ? { ...m, note: { ...m.note, callout } } : m));
    }
    case 'setGeneralNotes':
      return { ...s, generalNotes: a.text.slice(0, GENERAL_NOTES_MAX) };
  }
}

let counter = 0;
/** In-memory ids; never persisted, so a counter is enough. */
export const nextId = (prefix: string): string => `${prefix}${++counter}`;
