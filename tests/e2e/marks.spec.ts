import { expect, test } from '@playwright/test';
import { minRadius } from '../../src/model/session';
import { chip, clickArtwork, clickJoint, dragArtwork, joint, marks, popover } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('svg.diagram text.view-label')).toHaveText('RIGHT HAND — PALMAR');
});

test('clicking near a joint snaps a mark to it, preselecting pain', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'index-pip', [12, -10]);
  await expect(popover(page)).toBeVisible();
  await expect(popover(page).getByRole('heading')).toHaveText('Right index PIP');
  await expect(chip(page, /Pain/)).toHaveAttribute('aria-pressed', 'true');
  await expect(marks(page)).toHaveCount(1);
  await expect(marks(page).first()).toHaveAttribute('aria-label', 'Right index PIP: pain');

  const pip = joint('right-palmar', 'index-pip');
  const ring = marks(page).first().locator('circle').nth(1);
  await expect(ring).toHaveAttribute('cx', String(pip.x));
  await expect(ring).toHaveAttribute('cy', String(pip.y));
});

test('tagging several types renders a segmented ring with stacked codes in table order', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'little-dip');
  await chip(page, /Triggering/).click();
  await chip(page, /Swelling/).click();
  await page.keyboard.press('Enter');
  await expect(popover(page)).toBeHidden();

  const mark = marks(page).first();
  await expect(mark).toHaveAttribute('aria-label', 'Right little DIP: pain, swelling, triggering');
  await expect(mark.locator('text')).toHaveText(['P', 'O', 'T']);
  await expect(mark.locator('path')).toHaveCount(3);
});

test('clicking elsewhere on the hand places a free mark; Alt forces a free mark near a joint', async ({ page }) => {
  // Middle of the palm, away from joints.
  await clickArtwork(page, 560, 720);
  await expect(popover(page).getByRole('heading')).toHaveText('Free mark, right hand — palmar');
  await page.keyboard.press('Enter');

  const pip = joint('right-palmar', 'middle-pip');
  await clickArtwork(page, pip.x + 5, pip.y + 5, { alt: true });
  await expect(popover(page).getByRole('heading')).toHaveText('Free mark, right hand — palmar');
  await page.keyboard.press('Escape');
  await expect(marks(page)).toHaveCount(2);
});

test('the snap toggle turns snapping off', async ({ page }) => {
  await page.getByRole('button', { name: 'Snap to joints' }).click();
  await expect(page.getByRole('button', { name: 'Snap to joints' })).toHaveAttribute('aria-pressed', 'false');
  await clickJoint(page, 'right-palmar', 'ring-pip');
  await expect(popover(page).getByRole('heading')).toHaveText('Free mark, right hand — palmar');
});

test('clicking off the hand places nothing', async ({ page }) => {
  await clickArtwork(page, 100, 1300);
  await expect(popover(page)).toBeHidden();
  await expect(marks(page)).toHaveCount(0);
});

test('a mark left with no issue types is removed when the popover closes', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'thumb-ip');
  await chip(page, /Pain/).click();
  await popover(page).getByRole('button', { name: 'Done' }).click();
  await expect(marks(page)).toHaveCount(0);
  // Nothing to undo: placing and removing an empty mark is not a change.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('the last-used issue type is preselected on the next mark', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'index-mcp');
  await chip(page, /Pain/).click();
  await chip(page, /Stiffness/).click();
  await page.keyboard.press('Enter');
  await clickJoint(page, 'right-palmar', 'ring-mcp');
  await expect(chip(page, /Stiffness/)).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, /Pain/)).toHaveAttribute('aria-pressed', 'false');
});

test('dragging a snapped mark off its joint frees it; dropping on another joint snaps it there', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'middle-mcp');
  await page.keyboard.press('Enter');
  const mcp = joint('right-palmar', 'middle-mcp');
  const target = joint('right-palmar', 'ring-pip');

  await dragArtwork(page, [mcp.x, mcp.y], [mcp.x + 10, mcp.y + 120]);
  await expect(marks(page).first()).toHaveAttribute('aria-label', 'Free mark, right hand — palmar: pain');

  await dragArtwork(page, [mcp.x + 10, mcp.y + 120], [target.x + 8, target.y - 6]);
  await expect(marks(page).first()).toHaveAttribute('aria-label', 'Right ring PIP: pain');
  await expect(popover(page)).toBeHidden();
});

test('the resize handle changes the radius, down to a legible minimum', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'middle-mcp');
  await page.keyboard.press('Enter');
  const m = joint('right-palmar', 'middle-mcp');
  const handle = page.locator('.resize-handle .handle-dot');
  const cx = Number(await handle.getAttribute('cx'));
  const cy = Number(await handle.getAttribute('cy'));

  await dragArtwork(page, [cx, cy], [cx + 60, cy + 60]);
  const ring = marks(page).first().locator('circle').nth(1);
  expect(Number(await ring.getAttribute('r'))).toBeGreaterThan(m.r + 60);

  const cx2 = Number(await handle.getAttribute('cx'));
  const cy2 = Number(await handle.getAttribute('cy'));
  await dragArtwork(page, [cx2, cy2], [m.x + 1, m.y + 1]);
  expect(Number(await ring.getAttribute('r'))).toBe(minRadius(1));
});

test('retag and delete through the popover; Delete key removes the selected mark', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'index-dip');
  await page.keyboard.press('Enter');
  await marks(page).first().click();
  await chip(page, /Weakness/).click();
  await page.keyboard.press('Enter');
  await expect(marks(page).first()).toHaveAttribute('aria-label', 'Right index DIP: pain, weakness');

  await marks(page).first().click();
  await popover(page).getByRole('button', { name: 'Delete mark' }).click();
  await expect(marks(page)).toHaveCount(0);

  await clickJoint(page, 'right-palmar', 'index-dip');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Delete');
  await expect(marks(page)).toHaveCount(0);
});

test('undo and redo, by button and keyboard', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'index-dip');
  await chip(page, /Swelling/).click();
  await page.keyboard.press('Enter');
  await clickJoint(page, 'right-palmar', 'middle-dip');
  await page.keyboard.press('Enter');
  await expect(marks(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(marks(page)).toHaveCount(1);
  // Placing and tagging was one step.
  await expect(marks(page).first()).toHaveAttribute('aria-label', 'Right index DIP: pain, swelling');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(marks(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(marks(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(marks(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

test('marks belong to their view; badges count them', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'index-dip');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^Left hand/ }).click();
  await page.getByRole('button', { name: /^Dorsal/ }).click();
  await expect(page.locator('svg.diagram text.view-label')).toHaveText('LEFT HAND — DORSAL');
  await expect(marks(page)).toHaveCount(0);
  await clickJoint(page, 'left-dorsal', 'thumb-cmc');
  await page.keyboard.press('Enter');
  await clickJoint(page, 'left-dorsal', 'radiocarpal');
  await page.keyboard.press('Enter');
  await expect(marks(page).first()).toHaveAttribute('aria-label', /^Left /);

  const list = page.locator('.view-list');
  await expect(list.getByRole('button', { name: /LEFT HAND — DORSAL/ })).toContainText('2');
  await expect(list.getByRole('button', { name: /RIGHT HAND — PALMAR/ })).toContainText('1');
  await expect(page.getByRole('button', { name: 'Right hand, 1 marks' })).toBeVisible();
});

test('start new diagram asks first, then clears everything including undo history', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'index-dip');
  await page.keyboard.press('Enter');

  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Start new diagram' }).click();
  await expect(marks(page)).toHaveCount(1);

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Start new diagram' }).click();
  await expect(marks(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

test('warns before leaving with unexported marks', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'index-dip');
  await page.keyboard.press('Enter');
  const prevented = await page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);
});
