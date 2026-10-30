import { describe, expect, it } from 'vitest';
import { DEFAULT_GESTURE, GestureMachine, type GestureConfig } from '../../src/input/gesture';

const CFG: GestureConfig = { armDistancePx: 14, deadZonePx: 16, tapMaxMs: 230, longPressMs: 420 };

function machine(config: GestureConfig = CFG): GestureMachine {
  return new GestureMachine(config);
}

describe('GestureMachine: tap and RETURN', () => {
  it('a short stationary tap is RETURN', () => {
    const g = machine();
    expect(g.down(1, 100, 100, 0)).toEqual([]);
    expect(g.phase).toBe('pending');
    expect(g.up(1, 100, 100, 120)).toEqual([{ kind: 'return' }]);
    expect(g.phase).toBe('idle');
    expect(g.activePointerId).toBeNull();
  });

  it('a tap exactly at tapMaxMs is still RETURN', () => {
    const g = machine();
    g.down(1, 0, 0, 1000);
    expect(g.up(1, 0, 0, 1230)).toEqual([{ kind: 'return' }]);
  });

  it('jitter below the arm distance keeps a tap eligible', () => {
    const g = machine();
    g.down(1, 50, 50, 0);
    expect(g.move(1, 58, 55, 40)).toEqual([]);
    expect(g.move(1, 52, 49, 80)).toEqual([]);
    expect(g.phase).toBe('pending');
    expect(g.up(1, 55, 52, 150)).toEqual([{ kind: 'return' }]);
  });

  it('a long stationary press does nothing on release', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    expect(g.up(1, 2, 1, 900)).toEqual([{ kind: 'cancel', reason: 'longPress' }]);
    expect(g.phase).toBe('idle');
  });

  it('a press exactly at longPressMs counts as a long press', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    expect(g.up(1, 0, 0, 420)).toEqual([{ kind: 'cancel', reason: 'longPress' }]);
  });

  it('a medium press between tap and long press does nothing (never guesses)', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    expect(g.up(1, 0, 0, 231)).toEqual([{ kind: 'cancel', reason: 'ambiguous' }]);
    g.down(1, 0, 0, 1000);
    expect(g.up(1, 0, 0, 1419)).toEqual([{ kind: 'cancel', reason: 'ambiguous' }]);
  });

  it('non-monotonic timestamps never produce a negative hold time', () => {
    const g = machine();
    g.down(1, 0, 0, 500);
    expect(g.up(1, 0, 0, 400)).toEqual([{ kind: 'return' }]);
  });
});

describe('GestureMachine: aiming and dash', () => {
  it('crossing the arm distance starts aiming and reports positions', () => {
    const g = machine();
    g.down(7, 100, 300, 0);
    expect(g.move(7, 110, 300, 16)).toEqual([]);
    expect(g.move(7, 130, 300, 32)).toEqual([{ kind: 'aim', startX: 100, startY: 300, x: 130, y: 300 }]);
    expect(g.phase).toBe('aiming');
    expect(g.move(7, 160, 260, 48)).toEqual([{ kind: 'aim', startX: 100, startY: 300, x: 160, y: 260 }]);
    expect(g.up(7, 170, 250, 64)).toEqual([{ kind: 'dash', startX: 100, startY: 300, x: 170, y: 250 }]);
    expect(g.phase).toBe('idle');
  });

  it('arming at exactly the arm distance aims', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    expect(g.move(1, 14, 0, 10)).toEqual([{ kind: 'aim', startX: 0, startY: 0, x: 14, y: 0 }]);
  });

  it('a slow drag after a long hold still aims (long press only matters for stationary release)', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.move(1, 3, 0, 600);
    expect(g.move(1, 40, 0, 900)).toEqual([{ kind: 'aim', startX: 0, startY: 0, x: 40, y: 0 }]);
    expect(g.up(1, 40, 0, 1000)).toEqual([{ kind: 'dash', startX: 0, startY: 0, x: 40, y: 0 }]);
  });

  it('a fast flick with no intermediate move still dashes from the release position', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    expect(g.up(1, 0, -80, 60)).toEqual([{ kind: 'dash', startX: 0, startY: 0, x: 0, y: -80 }]);
  });

  it('a just-armed aim that never left the dead zone is still an aim, not a cancel', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    expect(g.move(1, 15, 0, 20)).toEqual([{ kind: 'aim', startX: 0, startY: 0, x: 15, y: 0 }]);
    expect(g.phase).toBe('aiming');
    expect(g.up(1, 15, 0, 40)).toEqual([{ kind: 'dash', startX: 0, startY: 0, x: 15, y: 0 }]);
  });

  it('an armed drag never becomes RETURN, even when released quickly at the origin', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.move(1, 50, 0, 30);
    expect(g.up(1, 0, 0, 60)).toEqual([{ kind: 'cancel', reason: 'deadZone' }]);
  });
});

describe('GestureMachine: dead-zone cancel', () => {
  it('pulling back into the dead zone shows cancel; releasing there cancels', () => {
    const g = machine();
    g.down(1, 200, 200, 0);
    g.move(1, 260, 200, 20);
    expect(g.move(1, 205, 203, 60)).toEqual([{ kind: 'aimCancelZone', startX: 200, startY: 200, x: 205, y: 203 }]);
    expect(g.phase).toBe('cancelZone');
    expect(g.up(1, 205, 203, 80)).toEqual([{ kind: 'cancel', reason: 'deadZone' }]);
    expect(g.phase).toBe('idle');
  });

  it('leaving the dead zone again re-arms the aim', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.move(1, 40, 0, 10);
    g.move(1, 2, 0, 20);
    expect(g.phase).toBe('cancelZone');
    expect(g.move(1, 0, 40, 30)).toEqual([{ kind: 'aim', startX: 0, startY: 0, x: 0, y: 40 }]);
    expect(g.phase).toBe('aiming');
    expect(g.up(1, 0, 45, 40)).toEqual([{ kind: 'dash', startX: 0, startY: 0, x: 0, y: 45 }]);
  });

  it('the dead-zone boundary itself counts as outside (aim)', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.move(1, 50, 0, 10);
    expect(g.move(1, 16, 0, 20)).toEqual([{ kind: 'aim', startX: 0, startY: 0, x: 16, y: 0 }]);
  });

  it('a cancel-zone release is never RETURN regardless of duration', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.move(1, 30, 0, 5);
    g.move(1, 0, 0, 10);
    expect(g.up(1, 0, 0, 20)).toEqual([{ kind: 'cancel', reason: 'deadZone' }]);
  });
});

describe('GestureMachine: pointer ownership', () => {
  it('a second finger during pending is ignored entirely', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    expect(g.down(2, 300, 300, 10)).toEqual([]);
    expect(g.move(2, 400, 400, 20)).toEqual([]);
    expect(g.up(2, 400, 400, 30)).toEqual([]);
    expect(g.activePointerId).toBe(1);
    expect(g.phase).toBe('pending');
    expect(g.up(1, 0, 0, 100)).toEqual([{ kind: 'return' }]);
  });

  it('a second finger during aim neither duplicates nor disturbs the dash', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.move(1, 50, 0, 10);
    expect(g.down(2, 10, 10, 20)).toEqual([]);
    expect(g.up(2, 10, 10, 30)).toEqual([]);
    expect(g.phase).toBe('aiming');
    expect(g.up(1, 60, 0, 40)).toEqual([{ kind: 'dash', startX: 0, startY: 0, x: 60, y: 0 }]);
  });

  it('a second finger tap while the first aims does not trigger RETURN', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.move(1, 50, 0, 10);
    const outs = [...g.down(2, 100, 100, 20), ...g.up(2, 100, 100, 60)];
    expect(outs).toEqual([]);
  });

  it('an up from a non-owner pointer is ignored', () => {
    const g = machine();
    g.down(3, 0, 0, 0);
    expect(g.up(4, 0, 0, 50)).toEqual([]);
    expect(g.activePointerId).toBe(3);
  });

  it('fingers still held from an ignored gesture stay ignored after the owner lifts', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.down(2, 100, 100, 5);
    g.up(1, 0, 0, 50);
    expect(g.move(2, 200, 100, 60)).toEqual([]);
    expect(g.up(2, 200, 100, 70)).toEqual([]);
    expect(g.phase).toBe('idle');
  });

  it('after the owner lifts, a new pointer can own the next gesture', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.up(1, 0, 0, 50);
    g.down(9, 10, 10, 100);
    expect(g.activePointerId).toBe(9);
    expect(g.up(9, 10, 10, 150)).toEqual([{ kind: 'return' }]);
  });

  it('a duplicate down from the owner is ignored', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.move(1, 40, 0, 10);
    expect(g.down(1, 999, 999, 20)).toEqual([]);
    expect(g.up(1, 45, 0, 30)).toEqual([{ kind: 'dash', startX: 0, startY: 0, x: 45, y: 0 }]);
  });
});

describe('GestureMachine: interruption', () => {
  it('cancel mid-aim emits an interrupted cancel and discards the aim', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.move(1, 50, 0, 10);
    expect(g.cancel('interrupted')).toEqual([{ kind: 'cancel', reason: 'interrupted' }]);
    expect(g.phase).toBe('idle');
    // A stale release after interruption does nothing.
    expect(g.up(1, 60, 0, 30)).toEqual([]);
  });

  it('cancel during pending never becomes RETURN', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    expect(g.cancel()).toEqual([{ kind: 'cancel', reason: 'interrupted' }]);
    expect(g.up(1, 0, 0, 50)).toEqual([]);
  });

  it('cancel while idle emits nothing', () => {
    expect(machine().cancel()).toEqual([]);
  });

  it('cancel from the cancel zone is an interruption, not a dead-zone cancel', () => {
    const g = machine();
    g.down(1, 0, 0, 0);
    g.move(1, 40, 0, 10);
    g.move(1, 1, 0, 20);
    expect(g.cancel()).toEqual([{ kind: 'cancel', reason: 'interrupted' }]);
  });
});

describe('GestureMachine: configuration', () => {
  it('ships the documented provisional defaults', () => {
    expect(DEFAULT_GESTURE).toEqual({ armDistancePx: 14, deadZonePx: 16, tapMaxMs: 230, longPressMs: 420 });
    expect(Object.isFrozen(DEFAULT_GESTURE)).toBe(true);
    expect(new GestureMachine().config).toEqual(DEFAULT_GESTURE);
  });

  it('rejects invalid thresholds', () => {
    expect(() => new GestureMachine({ ...CFG, tapMaxMs: 500 })).toThrow();
    expect(() => new GestureMachine({ ...CFG, armDistancePx: 0 })).toThrow();
    expect(() => new GestureMachine({ ...CFG, deadZonePx: Number.NaN })).toThrow();
  });

  it('works when the dead zone is smaller than the arm distance', () => {
    const g = new GestureMachine({ ...CFG, armDistancePx: 20, deadZonePx: 10 });
    g.down(1, 0, 0, 0);
    expect(g.move(1, 20, 0, 10)).toEqual([{ kind: 'aim', startX: 0, startY: 0, x: 20, y: 0 }]);
    expect(g.move(1, 5, 0, 20)).toEqual([{ kind: 'aimCancelZone', startX: 0, startY: 0, x: 5, y: 0 }]);
  });

  it('snapshot exposes the in-progress gesture for presentation', () => {
    const g = machine();
    g.down(5, 10, 20, 100);
    g.move(5, 40, 20, 120);
    expect(g.snapshot()).toEqual({ phase: 'aiming', pointerId: 5, startX: 10, startY: 20, x: 40, y: 20, startTimeMs: 100 });
  });
});
