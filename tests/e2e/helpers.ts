import type { Page } from '@playwright/test';
import data from '../../src/data/joints.json' with { type: 'json' };

export type ViewKey = 'left-palmar' | 'left-dorsal' | 'right-palmar' | 'right-dorsal';

export function joint(view: ViewKey, id: string) {
  const j = (data.views[view] as { id: string; label: string; x: number; y: number; r: number }[]).find((x) => x.id === id);
  if (!j) throw new Error(`No joint ${id} in ${view}`);
  return j;
}

/** Converts artwork units to page coordinates for the editor's diagram. */
export async function toScreen(page: Page, x: number, y: number) {
  return page.locator('svg.diagram').evaluate(
    (svg: SVGSVGElement, [px, py]) => {
      const p = new DOMPoint(px, py).matrixTransform(svg.getScreenCTM()!);
      return { x: p.x, y: p.y };
    },
    [x, y] as const,
  );
}

export async function clickArtwork(page: Page, x: number, y: number, { alt = false } = {}) {
  const p = await toScreen(page, x, y);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.click(p.x, p.y);
  if (alt) await page.keyboard.up('Alt');
}

export async function clickJoint(page: Page, view: ViewKey, id: string, offset: [number, number] = [0, 0]) {
  const j = joint(view, id);
  await clickArtwork(page, j.x + offset[0], j.y + offset[1]);
}

export async function dragArtwork(page: Page, from: [number, number], to: [number, number]) {
  const a = await toScreen(page, ...from);
  const b = await toScreen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

export const marks = (page: Page) => page.locator('svg.diagram [data-mark-id]');
export const popover = (page: Page) => page.getByRole('dialog');
export const chip = (page: Page, name: RegExp | string) => popover(page).getByRole('button', { name });
