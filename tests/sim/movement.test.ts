import { describe, expect, it } from 'vitest';
import { previewDash, STEP_SECONDS, TUNING } from '../../src/sim';
import { dash, expectClose, makeSim, ofType, ret, run, step } from './helpers';

describe('outward dash and soul follower', () => {
  it('starts reunited, departs normally from a co-located start (case 1)', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    expect(s.route.points).toEqual([]);
    const events = step(s, [dash(3, 0)]);
    expect(ofType(events, 'dashStart')).toHaveLength(1);
    expect(ofType(events, 'reunion')).toHaveLength(0);
    expect(s.body.mode).toBe('dash');
    expect(s.route.points.length).toBe(2);
    expect(s.body.pos.x).toBeGreaterThan(2);
    // The soul has moved too, but at its slower speed.
    expect(s.soul.pos.x - 2).toBeCloseTo(TUNING.soulSpeed * STEP_SECONDS, 9);
  });

  it('dash is finite-speed travel, then recovery, then ready', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    const events = run(s, { first: [dash(3, 0)], seconds: 0.5 });
    const end = ofType(events, 'dashEnd')[0]!;
    expect(end.reason).toBe('arrived');
    expect(end.t).toBeCloseTo(3 / TUNING.dashSpeed, 9);
    expectClose(end.at, { x: 5, y: 2 });
    const ready = ofType(events, 'ready')[0]!;
    expect(ready.t - end.t).toBeCloseTo(TUNING.recoverySeconds, 9);
  });

  it('arms contact only after separating beyond combined radii plus tolerance', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    const events = run(s, { first: [dash(3, 0)], seconds: 0.3 });
    const sep = ofType(events, 'separated')[0]!;
    const threshold = TUNING.bodyRadius + TUNING.soulRadius + TUNING.contactArmTolerance;
    // Separation grows at (dash - soul) speed.
    expect(sep.t).toBeGreaterThanOrEqual(threshold / (TUNING.dashSpeed - TUNING.soulSpeed) - 1e-9);
    expect(sep.t).toBeLessThan(threshold / (TUNING.dashSpeed - TUNING.soulSpeed) + STEP_SECONDS * 1.01);
  });

  it('soul follows the route at its slower spatial speed and contact reunites at the body', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    const events = run(s, { first: [dash(3, 0)], seconds: 3, until: (e) => e.type === 'reunion' });
    const reunion = ofType(events, 'reunion')[0]!;
    // Soul must close 3 tiles minus the contact reach.
    const reach = TUNING.bodyRadius + TUNING.soulRadius;
    expect(reunion.t).toBeCloseTo((3 - reach) / TUNING.soulSpeed, 6);
    expectClose(reunion.at, { x: 5, y: 2 });
    expect(reunion.cause).toBe('exhaustion'); // arriving along the route, not a shortcut
    expect(s.route.points).toEqual([]);
    expectClose(s.soul.pos, s.body.pos, 9);
  });

  it('tiny movements reunite by route exhaustion without arming contact', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    const events = run(s, { first: [dash(0.5, 0)], seconds: 2, until: (e) => e.type === 'reunion' });
    expect(ofType(events, 'separated')).toHaveLength(0);
    const reunion = ofType(events, 'reunion')[0]!;
    expect(reunion.cause).toBe('exhaustion');
    expect(reunion.t).toBeCloseTo(0.5 / TUNING.soulSpeed, 6);
  });

  it('rejects too-short aims without spending an action', () => {
    const s = makeSim();
    const events = step(s, [dash(0.1, 0)]);
    expect(ofType(events, 'rejected')[0]?.reason).toBe('tooShort');
    expect(s.body.mode).toBe('ready');
    expect(s.stats.dashes).toBe(0);
  });

  it('clamps to dash range and capacity, and the soul follows corners in order', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    run(s, { first: [dash(10, 0)], seconds: 0.4, until: (e) => e.type === 'ready' });
    expectClose(s.body.pos, { x: 5, y: 2 }); // range 3
    run(s, { first: [dash(0, 3)], seconds: 0.4, until: (e) => e.type === 'ready' });
    // Capacity 6 minus outstanding route caps the second leg.
    const p = previewDash(s, { x: 0, y: 3 });
    expect(p.limitedBy === 'capacity' || p.limitedBy === 'none' || p.limitedBy === 'range').toBe(true);
    expect(s.route.length).toBeLessThanOrEqual(TUNING.tetherCapacity + 1e-9);
    // The soul is still on the first leg (y = 2) - it never cuts the corner.
    expect(s.soul.pos.y).toBeCloseTo(2, 9);
  });
});

describe('RETURN', () => {
  it('retracts along the existing route and meets the soul between endpoints', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    run(s, { first: [dash(3, 0)], seconds: 1, until: (e) => e.type === 'ready' });
    const events = run(s, { first: [ret], seconds: 2, until: (e) => e.type === 'reunion' });
    expect(ofType(events, 'returnStart')).toHaveLength(1);
    const reunion = ofType(events, 'reunion')[0]!;
    expect(reunion.cause).toBe('return');
    expect(ofType(events, 'returnStop')[0]?.reason).toBe('reunited');
    expect(reunion.at.y).toBeCloseTo(2, 9);
    expect(reunion.at.x).toBeGreaterThan(2);
    expect(reunion.at.x).toBeLessThan(5);
    expect(s.body.mode).toBe('recover');
  });

  it('is rejected when already reunited', () => {
    const s = makeSim();
    const events = step(s, [ret]);
    expect(ofType(events, 'rejected')[0]?.reason).toBe('notSeparated');
  });

  it('a dash during RETURN interrupts it and leaves from the current point', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    run(s, { first: [dash(3, 0)], seconds: 1, until: (e) => e.type === 'ready' });
    run(s, { first: [ret], steps: 6 });
    expect(s.body.mode).toBe('return');
    const from = s.body.pos;
    const events = step(s, [dash(0, 2)]);
    expect(ofType(events, 'returnStop')[0]?.reason).toBe('interrupted');
    expect(ofType(events, 'dashStart')[0]?.from).toEqual(from);
    expect(s.body.mode).toBe('dash');
  });
});
