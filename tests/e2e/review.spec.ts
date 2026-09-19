import { expect, test } from '@playwright/test';
import data from '../../src/data/joints.json' with { type: 'json' };

const LABELS = ['LEFT HAND — PALMAR', 'LEFT HAND — DORSAL', 'RIGHT HAND — PALMAR', 'RIGHT HAND — DORSAL'];

test.beforeEach(async ({ page }) => {
  await page.goto('./review.html');
});

test('shows all four hand/side views, labelled in full, with 19 snap points each', async ({ page }) => {
  const sections = page.locator('section.review-view');
  await expect(sections).toHaveCount(4);
  for (const [i, label] of LABELS.entries()) {
    const section = sections.nth(i);
    await expect(section.getByRole('heading', { level: 2 })).toHaveText(label);
    await expect(section.locator('svg text.view-label')).toHaveText(label);
    await expect(section.locator('svg .joint')).toHaveCount(19);
    await expect(section.locator('tbody tr')).toHaveCount(19);
  }
});

test('every snap point lies on the hand drawing', async ({ page }) => {
  const outside = await page.evaluate(
    ({ views, width }) => {
      const misses: string[] = [];
      for (const [key, joints] of Object.entries(views)) {
        const svg = document.querySelector<SVGSVGElement>(`#${key} svg`)!;
        const fills = Array.from(svg.querySelectorAll<SVGPathElement>('.hand-fill path'));
        for (const j of joints) {
          // Fill paths are in right-hand artwork coordinates; left views mirror them.
          const p = svg.createSVGPoint();
          p.x = key.startsWith('left') ? width - j.x : j.x;
          p.y = j.y;
          if (!fills.some((f) => f.isPointInFill(p))) misses.push(`${key} ${j.id}`);
        }
      }
      return misses;
    },
    { views: data.views, width: data.viewBox.width },
  );
  expect(outside).toEqual([]);
});

test('makes no network requests after load and never changes the URL', async ({ page }) => {
  const late: string[] = [];
  page.on('request', (r) => late.push(r.url()));
  const url = page.url();
  await page.locator('.joint-row').first().hover();
  await page.getByRole('button', { name: 'RIGHT HAND — DORSAL' }).click();
  await expect(page.locator('#right-dorsal')).toBeInViewport();
  expect(late).toEqual([]);
  expect(page.url()).toBe(url);
});
