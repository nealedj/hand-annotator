import { defineConfig, devices } from '@playwright/test';

// Served from a sub-path, as on GitHub Pages, to prove relative asset paths work.
const SUB_PATH = '/hand-map/';
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${SUB_PATH}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  // Tests run against the production build, never the dev server (whose CSP is relaxed for HMR).
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --base ${SUB_PATH}`,
    url: `http://localhost:${PORT}${SUB_PATH}`,
    reuseExistingServer: !process.env.CI,
  },
});
