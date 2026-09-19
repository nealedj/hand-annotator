import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { clickArtwork, denseFixture, mark, popover, showView } from './helpers';

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buf: Buffer) {
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG' }).click()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), png: readFileSync(path) };
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('Download PNG is disabled until there is a mark or pin', async ({ page }) => {
  const button = page.getByRole('button', { name: 'Download PNG' });
  await expect(button).toBeDisabled();
  await page.getByRole('textbox', { name: 'General notes' }).fill('Notes alone are not exportable');
  await expect(button).toBeDisabled();
  await mark(page, 'right-palmar', 'index-dip');
  await expect(button).toBeEnabled();
});

test('one view: a 2400 px wide PNG named hand-diagram-YYYYMMDD-HHMM.png', async ({ page }) => {
  await mark(page, 'right-palmar', 'index-dip', [], 'Mallet finger');
  const { name, png } = await download(page);
  expect(name).toMatch(/^hand-diagram-\d{8}-\d{4}\.png$/);
  expect(pngSize(png)).toEqual({ width: 2400, height: 2091 + 64 });
});

test('two views side by side; unmarked views are left out', async ({ page }) => {
  await mark(page, 'right-palmar', 'index-dip');
  await showView(page, 'Left', 'Dorsal');
  await page.getByRole('button', { name: 'Pin note' }).click();
  await clickArtwork(page, 150, 900);
  await popover(page).getByRole('textbox').fill('A pin alone counts');
  await page.keyboard.press('Enter');
  const { png } = await download(page);
  expect(pngSize(png)).toEqual({ width: 2400, height: 1031 + 64 });
});

test('three views make a 2×2 grid, and exporting clears the leave-site warning', async ({ page }) => {
  test.setTimeout(90_000); // building the fixture is slow in WebKit
  await denseFixture(page);
  const warns = () =>
    page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
  expect(await warns()).toBe(true);
  const { png } = await download(page);
  expect(pngSize(png)).toEqual({ width: 2400, height: 2 * 1031 + 24 + 64 });
  expect(await warns()).toBe(false);
});
