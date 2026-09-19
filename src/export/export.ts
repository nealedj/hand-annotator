import { VIEWBOX } from '../data/joints';
import { CALLOUT } from '../layout/callouts';
import { wrapText, type Measure } from '../layout/text';
import { ISSUES } from '../model/issues';
import { sameView, type Session } from '../model/session';
import { handArtwork, viewLabelText } from '../render/artwork';
import { renderScene } from '../render/scene';
import { FONT_STACK, svg } from '../render/svg';
import { VIEWS, type View } from '../views';
import { diagramCells, EXPORT, PANEL_X } from './layout';

const INK = '#1f2328';
const RULE = '#b9bec4';

/** Views with at least one mark or pin, in the fixed export order. */
export function exportedViews(s: Session): View[] {
  return VIEWS.filter((v) => s.marks.some((m) => sameView(m.view, v)) || s.pins.some((p) => sameView(p.view, v)));
}

/** Text measured at `size` px: widths scale linearly from the callout measurer. */
const at = (measure: Measure, size: number): Measure => (t, bold) => (measure(t, bold) * size) / CALLOUT.fontSize;

function text(x: number, y: number, size: number, content: string, bold = false): SVGTextElement {
  return svg('text', { x, y, 'font-family': FONT_STACK, 'font-size': size, 'font-weight': bold ? 700 : 400, fill: INK }, [content]);
}

/** Legend of the issue types used, then the general notes. Returns the panel and its bottom edge. */
function sidePanel(s: Session, measure: Measure): { panel: SVGGElement; bottom: number } {
  const g = svg('g', { class: 'export-panel' });
  const width = EXPORT.panelWidth;
  const x = PANEL_X + 8;
  let y = EXPORT.pad;

  const heading = (label: string) => {
    y += 34;
    g.append(text(x, y, 34, label, true));
    y += 18;
  };

  heading('Issue types');
  const used = ISSUES.filter((i) => s.marks.some((m) => m.types.includes(i.id)));
  const nameSize = 27;
  const nameLine = 34;
  const nameX = x + 104;
  for (const i of used) {
    const lines = wrapText(i.name, width - (nameX - PANEL_X) - 8, at(measure, nameSize));
    const rowH = Math.max(52, lines.length * nameLine + 14);
    const cy = y + 26;
    // A small ring like the marks: colour with dark edges, so yellow shows in print.
    g.append(
      svg('circle', { cx: x + 22, cy, r: 16, fill: 'none', stroke: i.colour, 'stroke-width': 10 }),
      svg('circle', { cx: x + 22, cy, r: 21, fill: 'none', stroke: INK, 'stroke-width': 2 }),
      svg('circle', { cx: x + 22, cy, r: 11, fill: 'none', stroke: INK, 'stroke-width': 2 }),
      text(x + 54, cy + 11, 30, i.code, true),
    );
    lines.forEach((l, k) => g.append(text(nameX, cy + 10 + k * nameLine, nameSize, l)));
    y += rowH;
  }

  const notes = s.generalNotes.trim();
  if (notes) {
    y += 28;
    g.append(svg('line', { x1: x, y1: y, x2: PANEL_X + width, y2: y, stroke: RULE, 'stroke-width': 2 }));
    y += 12;
    heading('General notes');
    const size = 27;
    const line = 36;
    for (const para of notes.split(/\n+/)) {
      const lines = wrapText(para, width - 16, at(measure, size));
      for (const l of lines) {
        y += line;
        g.append(text(x, y, size, l));
      }
      y += 14;
    }
  }
  return { panel: g, bottom: y + 8 };
}

/**
 * The whole export as one SVG: every view with a mark or pin (drawn with the same
 * code as the editor), then the side panel. White background; no date, names or
 * branding. Self-contained, so it can be drawn from a blob: URL onto a canvas.
 */
export function buildExportSvg(s: Session, measure: Measure): { svg: SVGSVGElement; width: number; height: number } {
  const views = exportedViews(s);
  const { cells, height: diagramsHeight } = diagramCells(views.length);
  const { panel, bottom } = sidePanel(s, measure);
  const width = EXPORT.width;
  const height = Math.ceil(Math.max(EXPORT.pad + diagramsHeight, bottom) + EXPORT.pad);

  // XMLSerializer adds the xmlns declaration itself.
  const root = svg('svg', {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
  });
  root.append(svg('rect', { width, height, fill: '#ffffff' }));

  views.forEach((view, i) => {
    const c = cells[i]!;
    const scene = renderScene(s, view, measure);
    root.append(
      svg('svg', { x: c.x, y: c.y, width: c.w, height: c.h, viewBox: `0 0 ${VIEWBOX.width} ${VIEWBOX.height}` }, [
        svg('rect', { width: VIEWBOX.width, height: VIEWBOX.height, fill: '#ffffff' }),
        handArtwork(view),
        viewLabelText(view),
        ...scene.layers,
      ]),
      svg('rect', { x: c.x, y: c.y, width: c.w, height: c.h, fill: 'none', stroke: RULE, 'stroke-width': 2 }),
    );
  });
  root.append(
    svg('line', {
      x1: PANEL_X - EXPORT.gutter / 2,
      y1: EXPORT.pad,
      x2: PANEL_X - EXPORT.gutter / 2,
      y2: height - EXPORT.pad,
      stroke: RULE,
      'stroke-width': 2,
    }),
    panel,
  );
  return { svg: root, width, height };
}

/** Draws the SVG onto a canvas in the browser and encodes a PNG. Nothing leaves the page. */
export async function renderPng(root: SVGSVGElement, width: number, height: number): Promise<Blob> {
  const source = new XMLSerializer().serializeToString(root);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A standard download link. iOS Safari may show a preview instead, which is fine for demos. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before releasing the memory.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
