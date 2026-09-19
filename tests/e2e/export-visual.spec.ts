import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FONT_STACK } from '../../src/render/svg';
import { denseFixture, mark } from './helpers';

async function downloadPng(page: Page): Promise<Buffer> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG' }).click()]);
  return readFileSync(await dl.path());
}

test.describe('export snapshots', () => {
  // Pixel snapshots depend on the platform's fonts, so they're kept for Chromium on Linux (CI).
  test.skip(({ browserName }) => browserName !== 'chromium' || process.platform !== 'linux', 'Chromium on Linux only');

  test('worst case: four types on a little-finger DIP, single view', async ({ page }) => {
    await page.goto('./');
    await mark(page, 'right-palmar', 'little-dip', [/Swelling/, /Stiffness/, /Triggering/], 'Locks in flexion most mornings');
    await mark(page, 'right-palmar', 'little-pip', [/Weakness/], 'Weak grip');
    expect(await downloadPng(page)).toMatchSnapshot('export-worst-case.png', { maxDiffPixelRatio: 0.001 });
  });

  test('dense example across three views', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('./');
    await denseFixture(page);
    expect(await downloadPng(page)).toMatchSnapshot('export-dense.png', { maxDiffPixelRatio: 0.001 });
  });
});

test('text in the exported image uses the same font as the editor', async ({ page }) => {
  await page.goto('./');
  const widths = await page.evaluate(async (font) => {
    const sample = 'Right index PIP: Tender, worse in the morning';
    const size = 40;
    const W = 1400;
    const H = 80;
    /** Width of the inked area of a canvas. */
    const ink = (c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let lo = c.width;
      let hi = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (d[(y * c.width + x) * 4]! < 128) {
            lo = Math.min(lo, x);
            hi = Math.max(hi, x);
          }
        }
      }
      return hi - lo;
    };
    const blank = () => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      return c;
    };
    // The page's font, as the editor measures and draws it.
    const direct = blank();
    const dctx = direct.getContext('2d')!;
    dctx.font = `400 ${size}px ${font}`;
    dctx.fillStyle = '#000';
    dctx.fillText(sample, 10, 55);
    // The export path: SVG text drawn from a blob: URL onto a canvas.
    const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="10" y="55" font-family="${font.replace(/"/g, "'")}" font-size="${size}" fill="#000">${sample}</text></svg>`;
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    const img = new Image();
    img.src = url;
    await img.decode();
    const viaSvg = blank();
    viaSvg.getContext('2d')!.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    return { direct: ink(direct), viaSvg: ink(viaSvg) };
  }, FONT_STACK);
  expect(widths.direct).toBeGreaterThan(400);
  expect(Math.abs(widths.viaSvg - widths.direct) / widths.direct).toBeLessThan(0.02);
});
