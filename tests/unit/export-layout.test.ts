import { describe, expect, it } from 'vitest';
import { diagramCells, EXPORT, exportFilename, PANEL_X } from '../../src/export/layout';

describe('exportFilename', () => {
  it('uses local date and time, zero-padded, with nothing else in the name', () => {
    expect(exportFilename(new Date(2026, 0, 5, 9, 7))).toBe('hand-diagram-20260105-0907.png');
    expect(exportFilename(new Date(2026, 11, 31, 23, 59))).toBe('hand-diagram-20261231-2359.png');
  });
});

describe('diagramCells', () => {
  it('one view fills the diagram area', () => {
    const { cells, height } = diagramCells(1);
    expect(cells).toEqual([{ x: 32, y: 32, w: 1792, h: 2091 }]);
    expect(height).toBe(2091);
  });

  it('two views sit side by side', () => {
    const { cells, height } = diagramCells(2);
    expect(cells.map((c) => [c.x, c.y])).toEqual([[32, 32], [940, 32]]);
    expect(height).toBe(cells[0]!.h);
  });

  it('three or four views form a 2×2 grid', () => {
    for (const n of [3, 4]) {
      const { cells, height } = diagramCells(n);
      expect(cells).toHaveLength(n);
      expect(cells[2]).toMatchObject({ x: 32, y: 32 + cells[0]!.h + EXPORT.gutter });
      expect(height).toBe(2 * cells[0]!.h + EXPORT.gutter);
    }
  });

  it('diagrams stay left of the side panel', () => {
    for (const n of [1, 2, 3, 4]) {
      for (const c of diagramCells(n).cells) expect(c.x + c.w).toBeLessThanOrEqual(PANEL_X - EXPORT.gutter + 1);
    }
  });
});
