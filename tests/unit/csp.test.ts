import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { APP_CSP, BRIEF_CSP } from '../csp';

for (const page of ['index.html', 'review.html']) {
  const source = readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
  describe(`${page} CSP`, () => {
    const csp = source.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1];
    it('is the brief policy, only tightened', () => {
      expect(csp).toBe(APP_CSP);
      expect(csp!.startsWith(BRIEF_CSP)).toBe(true);
    });
  });
}

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('index.html', () => {
  it('uses only relative asset paths', () => {
    const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ref).toMatch(/^\.\//);
  });

  it('loads nothing from other origins', () => {
    expect(html).not.toMatch(/https?:\/\//);
  });
});
