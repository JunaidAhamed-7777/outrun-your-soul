import { describe, expect, it } from 'vitest';
import { AIM_GAIN, aimFromGesture, aimVectorFromScreen } from '../../src/input/aim';

describe('aim helpers', () => {
  it('scales the ground displacement by the gain', () => {
    expect(aimVectorFromScreen({ x: 1, y: 2 }, { x: 2, y: 4 }, 2)).toEqual({ x: 2, y: 4 });
  });

  it('defaults to the provisional AIM_GAIN', () => {
    expect(AIM_GAIN).toBe(1.6);
    const aim = aimVectorFromScreen({ x: 0, y: 0 }, { x: 1, y: -1 });
    expect(aim.x).toBeCloseTo(1.6);
    expect(aim.y).toBeCloseTo(-1.6);
  });

  it('a zero drag is a zero aim (no direction invented)', () => {
    expect(aimVectorFromScreen({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ x: 0, y: 0 });
  });

  it('does not clamp: range is the simulation’s job', () => {
    const aim = aimVectorFromScreen({ x: 0, y: 0 }, { x: 100, y: 0 }, 1);
    expect(aim).toEqual({ x: 100, y: 0 });
  });

  it('projects a gesture through screenToGround', () => {
    // Fake projection: 50 CSS px per tile, screen y down maps to ground y up.
    const toGround = (cx: number, cy: number) => ({ x: cx / 50, y: -cy / 50 });
    const aim = aimFromGesture({ startX: 100, startY: 400, x: 150, y: 300 }, toGround, 1);
    expect(aim).not.toBeNull();
    expect(aim!.x).toBeCloseTo(1);
    expect(aim!.y).toBeCloseTo(2);
  });

  it('returns null when either point misses the ground', () => {
    const miss = (cx: number) => (cx > 500 ? null : { x: cx, y: 0 });
    expect(aimFromGesture({ startX: 0, startY: 0, x: 600, y: 0 }, miss)).toBeNull();
    expect(aimFromGesture({ startX: 600, startY: 0, x: 0, y: 0 }, miss)).toBeNull();
  });
});
