import { describe, expect, it } from 'vitest';
import { codeOffsets, minRadius } from '../../src/model/session';

describe('letter code placement', () => {
  it('stacks one or two codes', () => {
    expect(codeOffsets(1)).toEqual([[0, 0]]);
    expect(codeOffsets(2).map(([dx]) => dx)).toEqual([0, 0]);
  });

  it('puts three or more in two columns, reading order, last odd one centred', () => {
    const three = codeOffsets(3);
    expect(three[0]![0]).toBeLessThan(0);
    expect(three[1]![0]).toBeGreaterThan(0);
    expect(three[0]![1]).toBe(three[1]![1]);
    expect(three[2]).toEqual([0, expect.any(Number)]);
    expect(three[2]![1]).toBeGreaterThan(three[0]![1]);
  });

  it('keeps the worst case compact: four types need far less than four stacked codes', () => {
    expect(minRadius(4)).toBeLessThanOrEqual(52);
    expect(minRadius(1)).toBeLessThanOrEqual(26); // fits the little-finger DIP default
  });

  it('never shrinks as codes are added', () => {
    for (let n = 1; n < 8; n++) expect(minRadius(n + 1)).toBeGreaterThanOrEqual(minRadius(n));
  });
});
