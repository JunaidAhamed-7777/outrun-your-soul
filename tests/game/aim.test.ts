import { describe, expect, it } from 'vitest';
import { AimTracker } from '../../src/game/aim';
import { AIM_GAIN } from '../../src/input/aim';

// 1 CSS px = 0.01 tiles, screen y grows downward while ground y grows upward.
const toGround = (x: number, y: number) => ({ x: x / 100, y: -y / 100 });

describe('AimTracker', () => {
  it('turns a drag release into a dash command scaled by the aim gain', () => {
    const t = new AimTracker();
    expect(t.apply({ kind: 'aim', startX: 0, startY: 0, x: 100, y: 0 }, toGround)).toBeNull();
    expect(t.view.aim?.x).toBeCloseTo(AIM_GAIN);
    const cmd = t.apply({ kind: 'dash', startX: 0, startY: 0, x: 0, y: -100 }, toGround);
    expect(cmd).toEqual({ kind: 'dash', aim: { x: 0, y: AIM_GAIN } });
    expect(t.view.aim).toBeNull();
  });

  it('maps a short tap to return and a cancel to nothing', () => {
    const t = new AimTracker();
    expect(t.apply({ kind: 'return' }, toGround)).toEqual({ kind: 'return' });
    t.apply({ kind: 'aim', startX: 0, startY: 0, x: 50, y: 0 }, toGround);
    expect(t.apply({ kind: 'cancel', reason: 'deadZone' }, toGround)).toBeNull();
    expect(t.view).toEqual({ aim: null, cancelZone: false });
  });

  it('shows a cancel state in the dead zone and resumes aim when leaving it', () => {
    const t = new AimTracker();
    t.apply({ kind: 'aim', startX: 0, startY: 0, x: 60, y: 0 }, toGround);
    t.apply({ kind: 'aimCancelZone', startX: 0, startY: 0, x: 2, y: 0 }, toGround);
    expect(t.view).toEqual({ aim: null, cancelZone: true });
    t.apply({ kind: 'aim', startX: 0, startY: 0, x: 0, y: 80 }, toGround);
    expect(t.view.cancelZone).toBe(false);
    expect(t.view.aim?.y).toBeCloseTo(-0.8 * AIM_GAIN);
  });

  it('drops a release whose points miss the ground instead of guessing', () => {
    const t = new AimTracker();
    const miss = () => null;
    expect(t.apply({ kind: 'dash', startX: 0, startY: 0, x: 10, y: 10 }, miss)).toBeNull();
  });
});
