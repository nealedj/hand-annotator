import { expect, test, type Page } from '@playwright/test';
import { clickArtwork, clickJoint, dragArtwork, joint, popover } from './helpers';

const callouts = (page: Page) => page.locator('svg.diagram .callout');
const noteField = (page: Page) => popover(page).getByRole('textbox');

async function boxes(page: Page) {
  return callouts(page).locator('rect').evaluateAll((rects) =>
    rects.map((r) => ({
      x: Number(r.getAttribute('x')),
      y: Number(r.getAttribute('y')),
      w: Number(r.getAttribute('width')),
      h: Number(r.getAttribute('height')),
    })),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('a note on a snapped mark appears as a callout headed by the joint label', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'index-pip');
  await noteField(page).fill('Tender, worse in the morning');
  await expect(popover(page).getByText('28 / 200')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(popover(page)).toBeHidden();

  const callout = callouts(page).first();
  await expect(callout.locator('tspan').first()).toHaveText('Right index PIP');
  await expect(callout.locator('tspan').first()).toHaveAttribute('font-weight', '700');
  const lines = await callout.locator('tspan').allTextContents();
  expect(lines.slice(1).join(' ')).toBe('Tender, worse in the morning');
  await expect(page.locator('svg.diagram .leaders line')).toHaveCount(1);
  await expect(page.locator('svg.diagram .leader-dots circle')).toHaveCount(1);
});

test('pinned notes are limited to 200 characters, one paragraph', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'ring-mcp');
  await noteField(page).fill('x'.repeat(250));
  await expect(noteField(page)).toHaveValue('x'.repeat(200));
  await expect(popover(page).getByText('200 / 200')).toBeVisible();
});

test('the Pin note tool drops a pin anywhere and opens its note', async ({ page }) => {
  await page.getByRole('button', { name: 'Pin note' }).click();
  await expect(page.getByRole('button', { name: 'Pin note' })).toHaveAttribute('aria-pressed', 'true');
  await clickArtwork(page, 560, 700); // on the palm
  await expect(noteField(page)).toBeFocused();
  await page.keyboard.type('Scar from carpal tunnel release');
  await page.keyboard.press('Enter');

  await expect(page.locator('svg.diagram [data-pin-id]')).toHaveCount(1);
  await expect(page.locator('svg.diagram [data-pin-id]')).toHaveAttribute('aria-label', /Scar from carpal tunnel release/);
  await expect(callouts(page)).toHaveCount(1);
  await expect(callouts(page).locator('tspan[font-weight]')).toHaveCount(0); // no joint heading
});

test('a pin left without a note is removed', async ({ page }) => {
  await page.getByRole('button', { name: 'Pin note' }).click();
  await clickArtwork(page, 150, 900);
  await page.keyboard.press('Escape');
  await expect(page.locator('svg.diagram [data-pin-id]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('callouts can be dragged; the leader follows; clicking one opens its note', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'little-pip');
  await noteField(page).fill('Swan neck deformity');
  await page.keyboard.press('Enter');

  const [before] = await boxes(page);
  const leader = page.locator('svg.diagram .leaders line');
  await dragArtwork(page, [before!.x + 20, before!.y + 20], [before!.x + 20, before!.y + 260]);
  const [after] = await boxes(page);
  expect(after!.y).toBeGreaterThan(before!.y + 200);
  // The leader now starts on the moved callout's edge.
  const y1 = Number(await leader.getAttribute('y1'));
  expect(y1).toBeGreaterThanOrEqual(after!.y);
  expect(y1).toBeLessThanOrEqual(after!.y + after!.h);

  await page.keyboard.press('ControlOrMeta+z');
  expect((await boxes(page))[0]).toEqual(before);

  await callouts(page).first().click();
  await expect(popover(page).getByRole('heading')).toHaveText('Right little PIP');
  await expect(noteField(page)).toHaveValue('Swan neck deformity');
});

test('the leader follows a mark with a dragged callout when the mark moves', async ({ page }) => {
  await clickJoint(page, 'right-palmar', 'middle-mcp');
  await noteField(page).fill('Ulnar drift');
  await page.keyboard.press('Enter');
  const [box] = await boxes(page);
  await dragArtwork(page, [box!.x + 10, box!.y + 10], [box!.x + 10, box!.y + 90]);
  const [moved] = await boxes(page);

  const m = joint('right-palmar', 'middle-mcp');
  await dragArtwork(page, [m.x, m.y], [m.x, m.y + 150]); // free mark, off the joint
  const [followed] = await boxes(page);
  // Off its joint the callout loses its heading and shrinks, so compare centres.
  expect(followed!.y + followed!.h / 2 - (moved!.y + moved!.h / 2)).toBeCloseTo(150, -1);
});

test('dense example: callouts never overlap each other', async ({ page }) => {
  const notes: [string, string][] = [
    ['index-dip', 'Mallet finger, 20 degree extensor lag'],
    ['index-pip', 'Fusiform swelling, tender on lateral stress'],
    ['middle-pip', 'Boutonnière posture, passively correctable'],
    ['ring-dip', 'Heberden node'],
    ['little-mcp', 'Triggering at A1 pulley, worse in the morning'],
    ['thumb-cmc', 'Grind test positive, pain on key pinch'],
    ['radiocarpal', 'Reduced extension, painful end range'],
    ['ulnar-styloid', 'Tender over ECU groove'],
  ];
  for (const [id, text] of notes) {
    await clickJoint(page, 'right-palmar', id);
    await noteField(page).fill(text);
    await page.keyboard.press('Enter');
  }
  await page.getByRole('button', { name: 'Pin note' }).click();
  await clickArtwork(page, 520, 760);
  await noteField(page).fill('Old laceration scar across the palm, adherent');
  await page.keyboard.press('Enter');

  const bs = await boxes(page);
  expect(bs).toHaveLength(9);
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i]!;
      const b = bs[j]!;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `callouts ${i} and ${j} overlap`).toBe(false);
    }
  }
});

test('general notes: counter, limit, and one undo step per edit', async ({ page }) => {
  const notes = page.getByRole('textbox', { name: 'General notes' });
  await notes.fill('Right-hand dominant. Works as a carpenter.');
  await expect(page.getByText('42 / 2000')).toBeVisible();
  await notes.blur();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(notes).toHaveValue('');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(notes).toHaveValue('Right-hand dominant. Works as a carpenter.');

  await notes.fill('y'.repeat(2100));
  await expect(notes).toHaveValue('y'.repeat(2000));
});

test('note fields opt out of autofill and spellcheck, and are cleared on pagehide', async ({ page }) => {
  const general = page.getByRole('textbox', { name: 'General notes' });
  await expect(general).toHaveAttribute('autocomplete', 'off');
  await expect(general).toHaveAttribute('spellcheck', 'false');
  await clickJoint(page, 'right-palmar', 'index-dip');
  await expect(noteField(page)).toHaveAttribute('autocomplete', 'off');
  await expect(noteField(page)).toHaveAttribute('spellcheck', 'false');
  await noteField(page).fill('Private text');
  await general.fill('More private text');

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  const values = await page.locator('input, textarea').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  expect(values.every((v) => v === '')).toBe(true);
});

test('Delete removes a selected pin; marks with notes keep them through undo', async ({ page }) => {
  await page.getByRole('button', { name: 'Pin note' }).click();
  await clickArtwork(page, 150, 900);
  await page.keyboard.type('Pin to delete');
  await page.keyboard.press('Enter');
  await page.locator('svg.diagram [data-pin-id]').focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('svg.diagram [data-pin-id]')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('svg.diagram [data-pin-id]')).toHaveCount(1);
  await expect(callouts(page)).toContainText('Pin to delete');
});
