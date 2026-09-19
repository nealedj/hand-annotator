import { expect, test } from '@playwright/test';
import { clickJoint, marks, popover } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('place, tag and note a mark using only the keyboard', async ({ page }) => {
  await page.locator('svg.diagram').focus();
  await page.keyboard.press('ArrowUp'); // first press lands on the middle MCP
  await expect(page.getByRole('status')).toHaveText(/Right middle MCP/);
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('status')).toHaveText(/Right middle PIP/);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('status')).toHaveText(/Right index PIP/);
  await page.keyboard.press('Enter');

  await expect(popover(page).getByRole('heading')).toHaveText('Right index PIP');
  await expect(page.locator(':focus')).toHaveAccessibleName(/Pain/); // preselected chip
  await page.keyboard.press('Tab'); // Swelling
  await page.keyboard.press('Space');
  await popover(page).getByRole('textbox').focus();
  await page.keyboard.type('Keyboard note');
  await page.keyboard.press('Enter');

  await expect(marks(page)).toHaveCount(1);
  await expect(marks(page).first()).toHaveAttribute('aria-label', 'Right index PIP: pain, swelling. Note: Keyboard note');
  await expect(marks(page).first()).toBeFocused();
});

test('a focused mark moves between joints with arrows, resizes with +/−, and deletes', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'ring-pip');
  await page.keyboard.press('Enter');
  const mark = marks(page).first();
  await expect(mark).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(marks(page).first()).toHaveAttribute('aria-label', /^Right ring DIP/);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(marks(page).first()).toHaveAttribute('aria-label', /^Free mark/);

  const ring = () => marks(page).first().locator('circle').nth(1);
  const r0 = Number(await ring().getAttribute('r'));
  await page.keyboard.press('+');
  expect(Number(await ring().getAttribute('r'))).toBe(r0 + 8);

  await page.keyboard.press('Delete');
  await expect(marks(page)).toHaveCount(0);
});

test('alternatives to dragging: Move then tap, size buttons, reset callout', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'index-mcp');
  await popover(page).getByRole('textbox').fill('Note to move');
  await page.getByRole('button', { name: 'Make mark larger' }).click();
  await page.getByRole('button', { name: /^Move mark/ }).click();
  await expect(popover(page)).toBeHidden();
  await clickJoint(page, 'right-palmar', 'thumb-mcp');
  await expect(marks(page).first()).toHaveAttribute('aria-label', /^Right thumb MCP/);

  // Drag the callout, then put it back with the button.
  const box = page.locator('svg.diagram .callout rect');
  const before = await box.getAttribute('y');
  const b = (await box.boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + 10, b.y + 80, { steps: 5 });
  await page.mouse.up();
  expect(await box.getAttribute('y')).not.toBe(before);
  await marks(page).first().click();
  await page.getByRole('button', { name: 'Reset note position' }).click();
  expect(await box.getAttribute('y')).toBe(before);
});

test('Escape cancels a pending move', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'index-mcp');
  await page.getByRole('button', { name: /^Move mark/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status')).toHaveText('Move cancelled');
  await clickJoint(page, 'right-palmar', 'thumb-mcp');
  await expect(marks(page)).toHaveCount(2);
});

test('every control is reachable with Tab, in a sensible order', async ({ page }) => {
  const names: string[] = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    names.push(await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName;
    }));
  }
  const order = ['Left', 'Right', 'Palmar', 'Dorsal', 'Start new diagram', 'Mark', 'Pin note', 'Snap to joints'];
  let last = -1;
  for (const want of order) {
    const at = names.findIndex((n, i) => i > last && n.startsWith(want));
    expect(at, `${want} in ${names.join(' | ')}`).toBeGreaterThan(last);
    last = at;
  }
  expect(names.some((n) => n.startsWith('RIGHT HAND — PALMAR diagram'))).toBe(true);
  expect(names.some((n) => n.startsWith('LEFT HAND — PALMAR'))).toBe(true);
});
