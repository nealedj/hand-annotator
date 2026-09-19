import { describe, expect, it } from 'vitest';
import data from '../../src/data/joints.json';
import { FREE_MARK_RADIUS } from '../../src/model/session';
import { nearestJoint, placeAt } from '../../src/model/snap';

const joints = data.views['right-palmar'];
const pip = joints.find((j) => j.id === 'index-pip')!;
const dip = joints.find((j) => j.id === 'index-dip')!;

describe('snapping', () => {
  it('snaps to a joint when inside its radius, using its position and default radius', () => {
    expect(placeAt(joints, pip.x + 10, pip.y - 12, { snap: true })).toEqual({ x: pip.x, y: pip.y, r: pip.r, jointId: 'index-pip' });
  });

  it('places a free mark just outside the radius', () => {
    const x = pip.x + pip.r + 1;
    expect(placeAt(joints, x, pip.y, { snap: true })).toEqual({ x, y: pip.y, r: FREE_MARK_RADIUS });
  });

  it('snaps exactly on the radius boundary', () => {
    expect(nearestJoint(joints, pip.x + pip.r, pip.y)?.id).toBe('index-pip');
  });

  it('places a free mark when snapping is off (Alt held or toggle off)', () => {
    expect(placeAt(joints, pip.x, pip.y, { snap: false })).toEqual({ x: pip.x, y: pip.y, r: FREE_MARK_RADIUS });
  });

  it('picks the nearest joint when radii overlap', () => {
    const druj = joints.find((j) => j.id === 'druj')!;
    const us = joints.find((j) => j.id === 'ulnar-styloid')!;
    const nearerUs = { x: us.x + (druj.x - us.x) * 0.4, y: us.y + (druj.y - us.y) * 0.4 };
    expect(nearestJoint(joints, nearerUs.x, nearerUs.y)?.id).toBe('ulnar-styloid');
    const nearerDruj = { x: us.x + (druj.x - us.x) * 0.6, y: us.y + (druj.y - us.y) * 0.6 };
    expect(nearestJoint(joints, nearerDruj.x, nearerDruj.y)?.id).toBe('druj');
  });

  it('keeps neighbouring finger joints apart: the midpoint of DIP and PIP snaps to neither', () => {
    expect(nearestJoint(joints, (pip.x + dip.x) / 2, (pip.y + dip.y) / 2)).toBeNull();
  });
});
