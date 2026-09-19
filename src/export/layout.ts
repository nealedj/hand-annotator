import { VIEWBOX } from '../data/joints';

/**
 * Export geometry, in output pixels. The image is 2,400 px wide so it stays sharp
 * printed at A4 width (about 290 px per inch); its height follows from the layout.
 *
 *   | pad | diagram area (1,792) | gutter | side panel (520) | pad |
 *
 * One view fills the diagram area (1,792 × 2,091). Two sit side by side and three or
 * four form a 2×2 grid, each cell 884 × 1,031. The side panel holds the legend and
 * the general notes; if it's taller than the diagrams, the image grows to fit it.
 */
export const EXPORT = {
  width: 2400,
  pad: 32,
  gutter: 24,
  panelWidth: 520,
} as const;

export const DIAGRAM_AREA_WIDTH = EXPORT.width - 2 * EXPORT.pad - EXPORT.gutter - EXPORT.panelWidth;
export const PANEL_X = EXPORT.pad + DIAGRAM_AREA_WIDTH + EXPORT.gutter;

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

const aspect = VIEWBOX.height / VIEWBOX.width;

/** Cells for n views (1 to 4), in export order, and the diagram area's height. */
export function diagramCells(n: number): { cells: Cell[]; height: number } {
  const { pad, gutter } = EXPORT;
  if (n <= 1) {
    const w = DIAGRAM_AREA_WIDTH;
    const h = Math.round(w * aspect);
    return { cells: [{ x: pad, y: pad, w, h }], height: h };
  }
  const w = (DIAGRAM_AREA_WIDTH - gutter) / 2;
  const h = Math.round(w * aspect);
  const cells: Cell[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    cells.push({ x: pad + col * (w + gutter), y: pad + row * (h + gutter), w, h });
  }
  const rows = Math.ceil(n / 2);
  return { cells, height: rows * h + (rows - 1) * gutter };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** hand-diagram-YYYYMMDD-HHMM.png, in local time, with nothing else in the name. */
export function exportFilename(d: Date = new Date()): string {
  const date = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  return `hand-diagram-${date}-${pad2(d.getHours())}${pad2(d.getMinutes())}.png`;
}
