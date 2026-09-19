import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { chip, clickArtwork, clickJoint, popover } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

test('the empty editor meets WCAG 2.2 AA (automated checks)', async ({ page }) => {
  await page.goto('./');
  expect(await audit(page)).toEqual([]);
});

test('the editor with marks, notes and an open popover meets WCAG 2.2 AA', async ({ page }) => {
  await page.goto('./');
  await clickJoint(page, 'right-palmar', 'index-pip');
  await chip(page, /Swelling/).click();
  await popover(page).getByRole('textbox').fill('Tender');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Pin note' }).click();
  await clickArtwork(page, 150, 900);
  await popover(page).getByRole('textbox').fill('Pin');
  await page.keyboard.press('Enter');
  await clickJoint(page, 'right-palmar', 'index-pip');
  await expect(popover(page)).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test('the review page meets WCAG 2.2 AA', async ({ page }) => {
  await page.goto('./review.html');
  expect(await audit(page)).toEqual([]);
});
