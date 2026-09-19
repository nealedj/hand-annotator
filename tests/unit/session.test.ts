import { describe, expect, it } from 'vitest';
import { History } from '../../src/model/history';
import {
  displayRadius,
  emptySession,
  MAX_RADIUS,
  minRadius,
  reduce,
  type Mark,
  type Session,
} from '../../src/model/session';

const view = { hand: 'right', side: 'palmar' } as const;
const mark = (over: Partial<Mark> = {}): Mark => ({ id: 'm1', view, x: 100, y: 200, r: 30, types: ['pain'], ...over });
const withMark = (m = mark()): Session => reduce(emptySession(), { type: 'addMark', mark: m });

describe('reduce', () => {
  it('adds a mark, storing types in table order', () => {
    const s = withMark(mark({ types: ['triggering', 'pain', 'oedema'] }));
    expect(s.marks).toHaveLength(1);
    expect(s.marks[0]!.types).toEqual(['pain', 'oedema', 'triggering']);
  });

  it('retags a mark, in table order', () => {
    const s = reduce(withMark(), { type: 'setMarkTypes', id: 'm1', types: ['scar', 'stiffness'] });
    expect(s.marks[0]!.types).toEqual(['stiffness', 'scar']);
  });

  it('moves a mark onto a joint, recording the joint', () => {
    const s = reduce(withMark(), { type: 'moveMark', id: 'm1', x: 5, y: 6, r: 40, jointId: 'index-pip' });
    expect(s.marks[0]).toMatchObject({ x: 5, y: 6, r: 40, jointId: 'index-pip' });
  });

  it('moving without a joint makes a snapped mark free and keeps its radius', () => {
    const s = reduce(withMark(mark({ jointId: 'index-pip' })), { type: 'moveMark', id: 'm1', x: 7, y: 8 });
    expect(s.marks[0]).toEqual({ ...mark(), x: 7, y: 8 });
    expect('jointId' in s.marks[0]!).toBe(false);
  });

  it('resizes within the legible minimum and a maximum', () => {
    const s = withMark(mark({ types: ['pain', 'oedema', 'stiffness'] }));
    expect(reduce(s, { type: 'resizeMark', id: 'm1', r: 80 }).marks[0]!.r).toBe(80);
    expect(reduce(s, { type: 'resizeMark', id: 'm1', r: 1 }).marks[0]!.r).toBe(minRadius(3));
    expect(reduce(s, { type: 'resizeMark', id: 'm1', r: 9999 }).marks[0]!.r).toBe(MAX_RADIUS);
  });

  it('deletes a mark', () => {
    expect(reduce(withMark(), { type: 'deleteMark', id: 'm1' }).marks).toEqual([]);
  });

  it('returns the same state for actions on unknown marks', () => {
    const s = withMark();
    expect(reduce(s, { type: 'deleteMark', id: 'nope' })).toBe(s);
    expect(reduce(s, { type: 'resizeMark', id: 'nope', r: 50 })).toBe(s);
  });

  it('never mutates the previous state', () => {
    const s = withMark();
    const frozen = JSON.stringify(s);
    reduce(s, { type: 'moveMark', id: 'm1', x: 1, y: 1 });
    reduce(s, { type: 'setMarkTypes', id: 'm1', types: ['weakness'] });
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe('radius rules', () => {
  it('grows the minimum radius with the number of stacked codes', () => {
    expect(minRadius(2)).toBeGreaterThan(minRadius(1));
    expect(minRadius(3)).toBeGreaterThan(minRadius(2));
  });

  it('draws a small multi-type mark at least at the minimum for its codes', () => {
    // Worst case from the brief: three types on a little-finger DIP (default radius 26).
    const m = mark({ r: 26, types: ['pain', 'oedema', 'stiffness'] });
    expect(displayRadius(m)).toBe(minRadius(3));
    expect(displayRadius(mark({ r: 60 }))).toBe(60);
  });
});

describe('History', () => {
  it('undoes and redoes committed states', () => {
    const h = new History(0);
    h.commit(1);
    h.commit(2);
    h.undo();
    expect(h.present).toBe(1);
    h.undo();
    expect(h.present).toBe(0);
    expect(h.canUndo).toBe(false);
    h.redo();
    h.redo();
    expect(h.present).toBe(2);
    expect(h.canRedo).toBe(false);
  });

  it('clears redo after a new change', () => {
    const h = new History(0);
    h.commit(1);
    h.undo();
    h.commit(5);
    expect(h.canRedo).toBe(false);
  });

  it('collapses a gesture into one undo step', () => {
    const h = new History(emptySession());
    h.begin();
    h.commit(withMark());
    h.commit(reduce(h.present, { type: 'moveMark', id: 'm1', x: 1, y: 1 }));
    h.commit(reduce(h.present, { type: 'moveMark', id: 'm1', x: 2, y: 2 }));
    h.end();
    expect(h.present.marks[0]).toMatchObject({ x: 2, y: 2 });
    h.undo();
    expect(h.present.marks).toEqual([]);
  });

  it('adds no step for a gesture that ends where it started', () => {
    const h = new History(emptySession());
    h.begin();
    h.commit(withMark());
    h.commit(reduce(h.present, { type: 'deleteMark', id: 'm1' }));
    h.end();
    expect(h.canUndo).toBe(false);
  });

  it('reset clears the undo and redo history (start new diagram)', () => {
    const h = new History(emptySession());
    h.commit(withMark());
    h.commit(emptySession());
    h.undo();
    h.reset(emptySession());
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.present.marks).toEqual([]);
  });
});
