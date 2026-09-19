/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';

/**
 * The dev server's hot reload needs a WebSocket, which `connect-src 'none'` blocks.
 * In dev only, allow `ws:` so HMR works. Production output keeps the policy from
 * index.html unchanged; tests/e2e/privacy.spec.ts asserts that.
 */
function devCspRelaxation(): Plugin {
  return {
    name: 'dev-csp-relaxation',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("connect-src 'none'", "connect-src 'self' ws:");
    },
  };
}

export default defineConfig({
  // Relative asset paths so the app works from any GitHub Pages sub-path.
  base: './',
  plugins: [devCspRelaxation()],
  build: {
    target: 'es2022',
    // Never inline assets as data URIs we didn't intend; keeps the output auditable.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
