import { describe, expect, it } from 'vitest';
import { createSim, previewDash, TUNING } from '../../src/sim';
import { dash, expectClose, makeRoom, makeSim, ofType, ret, run, separatedFixture, step } from './helpers';

describe('route geometry under stress (case 9)', () => {
  it('tiny zigzags keep legal geometry and hit the vertex cap with a clear rejection', () => {
    const room = makeRoom({ width: 12, height: 12, spawn: { x: 6, y: 1 } });
    const s = createSim(room, { seed: 1, params: { tetherCapacity: 200, soulSpeed: 0.001 } });
    let rejected: string | undefined;
    let aim = { x: 0, y: 0 };
    for (let i = 0; i < 80 && !rejected; i++) {
      // Alternate up-left / up-right short hops: every hop is a real corner.
      aim = { x: i % 2 === 0 ? -0.4 : 0.4, y: 0.1 };
      const events = run(s, { first: [dash(aim.x, aim.y)], seconds: 0.5, until: (e) => e.type === 'ready' || e.type === 'rejected' });
      rejected = ofType(events, 'rejected')[0]?.reason;
    }
    expect(rejected).toBe('vertexLimit');
    expect(s.route.points.length).toBe(TUNING.maxRouteVertices);
    const p = previewDash(s, aim);
    expect(p.valid).toBe(false);
    expect(p.reason).toBe('vertexLimit');
    // Forward-collinear extension needs no new vertex and stays legal at the cap.
    const last = s.route.points[s.route.points.length - 1]!;
    const prev = s.route.points[s.route.points.length - 2]!;
    const along = { x: (last.x - prev.x) * 2, y: (last.y - prev.y) * 2 };
    expect(previewDash(s, along).valid).toBe(true);
  });

  it('both endpoints consume the final segment and meet without negative length', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 4 },
    ]);
    const events = run(s, { first: [ret], seconds: 2, until: (e) => e.type === 'reunion' });
    expect(ofType(events, 'reunion')).toHaveLength(1);
    expect(s.route.length).toBe(0);
  });

  it('self-crossing loops are followed in order, never shortcut', () => {
    const room = makeRoom({ spawn: { x: 2, y: 2 } });
    // Slow soul so the crossing happens far ahead of it (a ribbon crossing, not contact).
    const s = createSim(room, { seed: 1, params: { tetherCapacity: 20, soulSpeed: 0.5 } });
    for (const aim of [dash(3, 0), dash(0, 2), dash(-1.5, 0), dash(0, -3)]) {
      run(s, { first: [aim], seconds: 1, until: (e) => e.type === 'ready' });
    }
    const corners = s.route.points.length;
    expect(corners).toBeGreaterThanOrEqual(4);
    // Soul only ever moves along the stored polyline (invariants), dropping corners in order.
    let lastCount = s.route.points.length;
    let reunited = false;
    for (let i = 0; i < 30 * 120 && !reunited; i++) {
      reunited = ofType(step(s), 'reunion').length > 0;
      if (!reunited) {
        expect(s.route.points.length).toBeLessThanOrEqual(lastCount);
        lastCount = s.route.points.length;
      }
    }
    expect(reunited).toBe(true);
    expect(s.stats.contactReunions).toBe(0);
  });
});

describe('walls truncate preview and execution identically (case 10)', () => {
  it('a dash into a wall stops at the previewed point with clearance', () => {
    const wall = { x: 4, y: 0, w: 1, h: 12 };
    const s = makeSim({ spawn: { x: 2, y: 2 }, walls: [wall] });
    const aim = { x: 3, y: 0.7 };
    const p = previewDash(s, aim);
    expect(p.valid).toBe(true);
    expect(p.limitedBy).toBe('wall');
    const events = run(s, { first: [dash(aim.x, aim.y)], seconds: 0.5, until: (e) => e.type === 'dashEnd' });
    const end = ofType(events, 'dashEnd')[0]!;
    expectClose(end.at, p.end, 12);
    expect(4 - end.at.x).toBeGreaterThanOrEqual(TUNING.bodyRadius + TUNING.wallSkin - 1e-9);
  });

  it('pressing into a wall from contact is rejected as blocked, sliding along it is not', () => {
    const wall = { x: 4, y: 0, w: 1, h: 12 };
    const s = makeSim({ spawn: { x: 2, y: 2 }, walls: [wall] });
    run(s, { first: [dash(3, 0)], seconds: 0.6, until: (e) => e.type === 'ready' });
    expect(previewDash(s, { x: 1, y: 0 }).reason).toBe('blocked');
    expect(previewDash(s, { x: 0, y: 2 }).valid).toBe(true);
    expect(previewDash(s, { x: -2, y: 0 }).valid).toBe(true);
  });

  it('the room boundary truncates like a wall', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    const p = previewDash(s, { x: -3, y: 0 });
    expect(p.limitedBy).toBe('wall');
    expect(p.end.x).toBeCloseTo(TUNING.bodyRadius + TUNING.wallSkin, 9);
  });
});

describe('preview freshness and the input buffer (case 11)', () => {
  it('the preview refreshes as the soul frees capacity', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 7, y: 2 },
    ]);
    const aim = { x: 0, y: 3 };
    const before = previewDash(s, aim);
    expect(before.limitedBy).toBe('capacity');
    run(s, { seconds: 0.5 });
    const after = previewDash(s, aim);
    expect(after.end.y).toBeGreaterThan(before.end.y);
  });

  it('a release just before recovery ends is queued visibly, then executes as previewed', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    run(s, { first: [dash(3, 0)], seconds: 0.21, until: (e) => e.type === 'dashEnd' });
    expect(s.body.mode).toBe('recover');
    const aim = { x: 0, y: 3 };
    const preview = previewDash(s, aim);
    expect(preview.queued).toBe(true);
    expect(preview.valid).toBe(true);
    const events = run(s, { first: [dash(aim.x, aim.y)], seconds: 0.5, until: (e) => e.type === 'dashEnd' });
    expect(ofType(events, 'queued')).toHaveLength(1);
    const start = ofType(events, 'dashStart')[0]!;
    expect(ofType(events, 'ready')[0]!.t).toBeCloseTo(start.t, 12);
    expectClose(ofType(events, 'dashEnd')[0]!.at, preview.end, 12);
  });

  it('a release too early is rejected as busy, not silently chained', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    const events = step(s, [dash(3, 0)]);
    expect(ofType(events, 'dashStart')).toHaveLength(1);
    const early = step(s, [dash(0, 3)]);
    expect(ofType(early, 'rejected')[0]?.reason).toBe('busy');
    expect(s.buffered).toBeNull();
  });

  it('a queued intent is revalidated and dropped when it became invalid', () => {
    const wall = { x: 5, y: 0, w: 1, h: 12 };
    const s = makeSim({ spawn: { x: 2, y: 2 }, walls: [wall] });
    run(s, { first: [dash(3, 0)], seconds: 0.25, until: (e) => e.type === 'dashEnd' });
    const events = run(s, { first: [dash(2, 0)], seconds: 0.4 });
    expect(ofType(events, 'queued')).toHaveLength(1);
    expect(ofType(events, 'queueExpired')).toHaveLength(1);
    expect(ofType(events, 'dashStart')).toHaveLength(0);
  });

  it('a queued RETURN expires if a contact dash already reunited the pair', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 3.2, y: 2 },
    ]);
    const events1 = run(s, { first: [dash(-2, 0)], seconds: 0.3, until: (e) => e.type === 'reunion' });
    expect(ofType(events1, 'reunion')[0]?.cause).toBe('contact');
    const events = run(s, { first: [ret], seconds: 0.3 });
    expect(ofType(events, 'rejected')[0]?.reason).toBe('notSeparated');
  });

  it('only one action is honoured per step', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    const events = step(s, [dash(3, 0), dash(0, 3)]);
    expect(ofType(events, 'dashStart')).toHaveLength(1);
    expect(ofType(events, 'rejected')[0]?.reason).toBe('busy');
  });
});
