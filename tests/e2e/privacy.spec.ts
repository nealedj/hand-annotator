import { expect, test, type Page, type Request } from '@playwright/test';

const BRIEF_CSP =
  "default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'";

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

test('production build serves the brief CSP unchanged', async ({ page }) => {
  await page.goto('./');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toBe(BRIEF_CSP);
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

  // Placeholder flow: interact with the page. Extended with the full flow in later milestones.
  await page.mouse.click(200, 200);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(250);

  expect(requests.map((r) => r.url())).toEqual([]);
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
