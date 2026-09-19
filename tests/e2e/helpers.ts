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
      const at = () => new DOMPoint(px, py).matrixTransform(svg.getScreenCTM()!);
      let p = at();
      // Typing in a field can scroll the page; bring the point back into the viewport.
      if (p.y < 0 || p.y > innerHeight) {
        window.scrollBy(0, p.y - innerHeight / 2);
        p = at();
      }
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

export async function mark(page: Page, view: Parameters<typeof clickJoint>[1], id: string, types: RegExp[] = [], note = '') {
  await clickJoint(page, view, id);
  for (const t of types) await chip(page, t).click();
  if (note) await popover(page).getByRole('textbox').fill(note);
  await page.keyboard.press('Enter');
}

export async function showView(page: Page, hand: 'Left' | 'Right', side: 'Palmar' | 'Dorsal') {
  await page.getByRole('button', { name: new RegExp(`^${hand} hand`) }).click();
  await page.getByRole('button', { name: new RegExp(`^${side}`) }).click();
}

/** The worst case from the brief (several types on a little-finger DIP), notes and pins on three views. */
export async function denseFixture(page: Page) {
  await mark(page, 'right-palmar', 'little-dip', [/Swelling/, /Stiffness/, /Triggering/], 'Locks in flexion most mornings');
  await mark(page, 'right-palmar', 'index-pip', [/Pain/, /Swelling/], 'Fusiform swelling, tender on lateral stress');
  await mark(page, 'right-palmar', 'thumb-cmc', [/Pain/, /Deformity/], 'Grind test positive, pain on key pinch');
  await mark(page, 'right-palmar', 'radiocarpal', [/Pain/, /Weakness/]);
  await showView(page, 'Right', 'Dorsal');
  await mark(page, 'right-dorsal', 'middle-mcp', [/Weakness/, /Deformity/], 'Ulnar drift, passively correctable');
  await page.getByRole('button', { name: 'Pin note' }).click();
  await clickArtwork(page, 640, 760);
  await popover(page).getByRole('textbox').fill('Dorsal wrist ganglion, 1 cm, non-tender');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Mark', exact: true }).click();
  await showView(page, 'Left', 'Palmar');
  await mark(page, 'left-palmar', 'ring-pip', [/Wound or scar/, /Altered/], 'Healed laceration, numb along ulnar border');
  await page.getByRole('textbox', { name: 'General notes' }).fill(
    'Right-hand dominant carpenter. Symptoms for 8 months, worse with gripping tools.\nNight pain in the right thumb base.',
  );
}

