import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BRIEF_CSP =
  "default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'";

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('index.html', () => {
  it('carries the Content Security Policy from the brief, unchanged', () => {
    const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
    expect(match?.[1]).toBe(BRIEF_CSP);
  });

  it('uses only relative asset paths', () => {
    const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ref).toMatch(/^\.\//);
  });

  it('loads nothing from other origins', () => {
    expect(html).not.toMatch(/https?:\/\//);
  });
});
