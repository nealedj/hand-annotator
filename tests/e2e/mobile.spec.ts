import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { joint, marks, popover, toScreen } from './helpers';

async function tapArtwork(page: Page, x: number, y: number) {
  const p = await toScreen(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('fits a 375 px phone: no sideways scroll, toolbar at the bottom, notes below the diagram', async ({ page }) => {
  expect(page.viewportSize()!.width).toBeLessThanOrEqual(430);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const toolbar = (await page.getByRole('group', { name: 'Tools' }).boundingBox())!;
  expect(toolbar.y + toolbar.height).toBeGreaterThan(page.viewportSize()!.height - 2);
  const diagram = (await page.locator('svg.diagram').boundingBox())!;
  const notes = (await page.getByRole('textbox', { name: 'General notes' }).boundingBox())!;
  expect(notes.y).toBeGreaterThan(diagram.y + diagram.height);
  expect(diagram.width).toBeGreaterThan(page.viewportSize()!.width - 40);

  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('tap near a small joint snaps to it; the popover is a bottom sheet with 44 px chips', async ({ page }) => {
  const dip = joint('right-palmar', 'little-dip');
  // 30 units off: outside the joint's own radius, but within a finger's reach on a phone.
  await tapArtwork(page, dip.x + 30, dip.y + 10);
  await expect(popover(page).getByRole('heading')).toHaveText('Right little DIP');

  const sheet = (await popover(page).boundingBox())!;
  expect(sheet.y + sheet.height).toBeGreaterThan(page.viewportSize()!.height - 2);
  expect(sheet.width).toBeGreaterThan(page.viewportSize()!.width - 2);
  for (const c of await popover(page).locator('.chip').all()) {
    const b = (await c.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  for (const b of await page.locator('button:visible').all()) {
    const box = (await b.boundingBox())!;
    expect(Math.min(box.width, box.height), await b.textContent() ?? '').toBeGreaterThanOrEqual(44);
  }
});

test('mobile flow: place a mark, tag it, add a note, export', async ({ page }) => {
  const pip = joint('right-palmar', 'index-pip');
  await tapArtwork(page, pip.x, pip.y);
  await popover(page).getByRole('button', { name: /Swelling/ }).tap();
  await popover(page).getByRole('textbox').fill('Swollen after work');
  await popover(page).getByRole('button', { name: 'Done' }).tap();
  await expect(marks(page)).toHaveCount(1);
  await expect(page.locator('svg.diagram .callout')).toContainText('Right index PIP');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG' }).tap()]);
  expect(dl.suggestedFilename()).toMatch(/^hand-diagram-\d{8}-\d{4}\.png$/);
  const png = readFileSync(await dl.path());
  expect(png.readUInt32BE(16)).toBe(2400);
});

test('a mark can be moved to another joint by tapping Move, then the new place', async ({ page }) => {
  const pip = joint('right-palmar', 'middle-pip');
  const target = joint('right-palmar', 'middle-dip');
  await tapArtwork(page, pip.x, pip.y);
  await popover(page).getByRole('button', { name: /^Move mark/ }).tap();
  await expect(popover(page)).toBeHidden();
  await tapArtwork(page, target.x + 20, target.y);
  await expect(marks(page).first()).toHaveAttribute('aria-label', /^Right middle DIP/);
});

test('the tap that opens the bottom sheet does not also press the chip under the finger', async ({ page }) => {
  // Every joint on the view: whatever chip ends up under the finger must stay as it was.
  for (const id of ['index-dip', 'middle-pip', 'ring-mcp', 'thumb-cmc', 'radiocarpal']) {
    const j = joint('right-palmar', id);
    await tapArtwork(page, j.x, j.y);
    await expect(popover(page).getByRole('button', { name: /Pain/ })).toHaveAttribute('aria-pressed', 'true');
    await popover(page).getByRole('button', { name: 'Done' }).tap();
  }
  await expect(marks(page)).toHaveCount(5);
});
