import { expect, test, type Page, type Request } from '@playwright/test';
import { chip, clickJoint, dragArtwork, joint } from './helpers';

import { APP_CSP, BRIEF_CSP } from '../csp';

/** Loads the app and returns every request made after the load event. */
async function loadAndRecord(page: Page): Promise<Request[]> {
  const afterLoad: Request[] = [];
  let loaded = false;
  page.on('request', (req) => {
    if (loaded) afterLoad.push(req);
  });
  await page.goto('./', { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  loaded = true;
  return afterLoad;
}

async function storageSnapshot(page: Page) {
  return page.evaluate(async () => ({
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
    indexedDB: 'databases' in indexedDB ? (await indexedDB.databases()).length : 0,
    documentCookie: document.cookie,
    cacheStorage: 'caches' in self ? (await caches.keys()).length : 0,
    serviceWorkers:
      'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  }));
}

test('production build serves the brief CSP, only tightened', async ({ page }) => {
  for (const path of ['./', './review.html']) {
    await page.goto(path);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toBe(APP_CSP);
    expect(csp!.startsWith(BRIEF_CSP)).toBe(true);
  }
});

test('all app files load from the sub-path, same origin', async ({ page, baseURL }) => {
  const urls: string[] = [];
  page.on('request', (req) => urls.push(req.url()));
  await page.goto('./', { waitUntil: 'networkidle' });
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) expect(url.startsWith(baseURL!)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Hand Map' })).toBeVisible();
});

test('makes no network requests after load, leaves no storage and never changes the URL', async ({
  page,
  context,
}) => {
  const requests = await loadAndRecord(page);
  const startUrl = page.url();

  // A full flow across two views: place, tag, drag, undo, redo, delete, notes, pins, export.
  await clickJoint(page, 'right-palmar', 'index-pip');
  await chip(page, /Swelling/).click();
  await page.keyboard.press('Enter');
  const pip = joint('right-palmar', 'index-pip');
  await dragArtwork(page, [pip.x, pip.y], [pip.x + 20, pip.y + 90]);
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await page.getByRole('button', { name: /^Left hand/ }).click();
  await page.getByRole('button', { name: /^Dorsal/ }).click();
  await clickJoint(page, 'left-dorsal', 'thumb-cmc');
  await chip(page, /Wound/).click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Delete');
  await page.getByRole('button', { name: 'Snap to joints' }).click();
  await clickJoint(page, 'left-dorsal', 'radiocarpal');
  await page.getByRole('dialog').getByRole('textbox').fill('Pinned note text typed by the clinician');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Pin note' }).click();
  await clickJoint(page, 'left-dorsal', 'index-mcp', [0, 200]);
  await page.keyboard.type('A pin with its own note');
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'General notes' }).fill('General notes for the whole assessment.');
  await page.getByRole('button', { name: 'Mark', exact: true }).click();
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG' }).click()]);
  await page.waitForTimeout(250);

  // blob: and data: URLs (the export's in-memory image and download) never leave the page.
  const network = requests.map((r) => r.url()).filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'));
  expect(network).toEqual([]);
  expect(page.url()).toBe(startUrl);
  expect(await storageSnapshot(page)).toEqual({
    localStorage: 0,
    sessionStorage: 0,
    indexedDB: 0,
    documentCookie: '',
    cacheStorage: 0,
    serviceWorkers: 0,
  });
  expect(await context.cookies()).toEqual([]);
});

test('CSP blocks outbound connections from page scripts', async ({ page }) => {
  await page.goto('./');
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
});

test('coming back to the page by Back or reload shows a blank app', async ({ page }) => {
  await page.goto('./');
  await clickJoint(page, 'right-palmar', 'index-pip');
  await page.getByRole('dialog').getByRole('textbox').fill('Private pinned note');
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'General notes' }).fill('Private general notes');

  // Away and back: the page may come from the back-forward cache, which must reset it.
  await page.goto('about:blank');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Hand Map' })).toBeVisible();
  await expect(page.locator('svg.diagram [data-mark-id]')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'General notes' })).toHaveValue('');

  // Reload: nothing is restored into the fields.
  await page.getByRole('textbox', { name: 'General notes' }).fill('Typed before reload');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'General notes' })).toHaveValue('');
  await expect(page.locator('svg.diagram [data-mark-id]')).toHaveCount(0);
});

test('leaves no trace in window.name or the session history', async ({ page }) => {
  await page.goto('./');
  const before = await page.evaluate(() => history.length);
  await clickJoint(page, 'right-palmar', 'index-dip');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^Left hand/ }).click();
  await page.getByRole('button', { name: 'Start new diagram' }).click();
  expect(await page.evaluate(() => ({ name: window.name, length: history.length, state: history.state }))).toEqual({
    name: '',
    length: before,
    state: null,
  });
});
