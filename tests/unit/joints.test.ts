import { describe, expect, it } from 'vitest';
import data from '../../src/data/joints.json';

type Joint = { id: string; label: string; x: number; y: number; r: number };
const views = data.views as Record<string, Joint[]>;
const { width, height } = data.viewBox;

const FINGERS = ['index', 'middle', 'ring', 'little'];
const EXPECTED: Record<string, string> = {
  ...Object.fromEntries(
    FINGERS.flatMap((f) => ['DIP', 'PIP', 'MCP'].map((j) => [`${f}-${j.toLowerCase()}`, `${f} ${j}`])),
  ),
  'thumb-ip': 'thumb IP',
  'thumb-mcp': 'thumb MCP',
  'thumb-cmc': 'thumb CMC',
  radiocarpal: 'radiocarpal joint',
  druj: 'DRUJ',
  'radial-styloid': 'radial styloid',
  'ulnar-styloid': 'ulnar styloid',
};

describe('joints.json', () => {
  it('has exactly the four hand/side views', () => {
    expect(Object.keys(views).sort()).toEqual(['left-dorsal', 'left-palmar', 'right-dorsal', 'right-palmar']);
  });

  for (const [key, joints] of Object.entries(views)) {
    const hand = key.startsWith('left') ? 'Left' : 'Right';

    describe(key, () => {
      it('has the 19 required snap points, each once', () => {
        expect(joints).toHaveLength(19);
        expect(joints.map((j) => j.id).sort()).toEqual(Object.keys(EXPECTED).sort());
      });

      it('labels follow the "Right index PIP" pattern', () => {
        for (const j of joints) expect(j.label).toBe(`${hand} ${EXPECTED[j.id]}`);
      });

      it('positions and radii are sensible', () => {
        for (const j of joints) {
          expect(Number.isFinite(j.x) && Number.isFinite(j.y)).toBe(true);
          expect(j.x).toBeGreaterThan(0);
          expect(j.x).toBeLessThan(width);
          expect(j.y).toBeGreaterThan(0);
          expect(j.y).toBeLessThan(height);
          expect(j.r).toBeGreaterThanOrEqual(20);
          expect(j.r).toBeLessThanOrEqual(60);
        }
      });
    });
  }

  it.each(['palmar', 'dorsal'])('left %s mirrors right %s (run `npm run joints:mirror` after edits)', (side) => {
    const right = views[`right-${side}`]!;
    const left = views[`left-${side}`]!;
    expect(left).toEqual(
      right.map((j) => ({ ...j, label: j.label.replace('Right', 'Left'), x: width - j.x })),
    );
  });
});
