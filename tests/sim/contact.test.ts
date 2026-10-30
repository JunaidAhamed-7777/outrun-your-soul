import { describe, expect, it } from 'vitest';
import { createSim, previewDash, previewReturn, TUNING } from '../../src/sim';
import { corridorClear } from '../../src/sim/geom';
import { dash, expectClose, makeRoom, ofType, ret, run, separatedFixture, step } from './helpers';

const REACH = TUNING.bodyRadius + TUNING.soulRadius;

describe('genuine contact reunion (COMBAT_SPEC case 2)', () => {
  it('an offensive dash at the moving soul stops exactly at the previewed contact point', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 5, y: 2 },
    ]);
    const aim = { x: -3, y: 0 };
    const preview = previewDash(s, aim);
    expect(preview.valid).toBe(true);
    expect(preview.limitedBy).toBe('contact');
    expect(preview.contact).not.toBeNull();

    const events = run(s, { first: [dash(aim.x, aim.y)], seconds: 1, until: (e) => e.type === 'dashEnd' });
    const end = ofType(events, 'dashEnd')[0]!;
    expect(end.reason).toBe('contact');
    expectClose(end.at, preview.contact!.at, 12);
    expectClose(preview.end, preview.contact!.at, 12);
    const reunion = ofType(events, 'reunion');
    expect(reunion).toHaveLength(1);
    expect(reunion[0]!.cause).toBe('contact');
    expect(s.body.mode).toBe('recover');
    expect(s.body.recoverLeft).toBeGreaterThan(0);
    expect(s.route.points).toEqual([]);
    // The soul moved only the bounded remaining gap (<= combined radii) to the anchor.
    expect(Math.hypot(preview.contact!.at.x - preview.contact!.soulAt.x, preview.contact!.at.y - preview.contact!.soulAt.y))
      .toBeLessThanOrEqual(REACH + 1e-9);
  });

  it('collapses a looped route once, then normal recovery applies', () => {
    const room = makeRoom({ spawn: { x: 2, y: 2 } });
    const s = createSim(room, { seed: 3, params: { tetherCapacity: 12 } });
    run(s, { first: [dash(3, 0)], seconds: 1, until: (e) => e.type === 'ready' });
    run(s, { first: [dash(0, 2)], seconds: 1, until: (e) => e.type === 'ready' });
    const aim = { x: s.soul.pos.x - s.body.pos.x, y: s.soul.pos.y - s.body.pos.y };
    const preview = previewDash(s, aim);
    expect(preview.contact).not.toBeNull();
    const before = s.route.points.length;
    expect(before).toBeGreaterThanOrEqual(3);
    const events = run(s, { first: [dash(aim.x, aim.y)], seconds: 1, until: (e) => e.type === 'ready' });
    expect(ofType(events, 'reunion')).toHaveLength(1);
    expect(ofType(events, 'dashEnd')[0]?.reason).toBe('contact');
    expectClose(ofType(events, 'dashEnd')[0]!.at, preview.contact!.at, 12);
    expect(s.route.points).toEqual([]);
    expect(s.stats.contactReunions).toBe(1);
  });
});

describe('ribbon is not a contact surface (case 3)', () => {
  it('crossing the old ribbon far from the soul does not reunite or rewire the path', () => {
    const room = makeRoom({ spawn: { x: 1, y: 1 } });
    const s = createSim(room, { seed: 1, params: { tetherCapacity: 14 } });
    run(s, { first: [dash(3, 0)], seconds: 1, until: (e) => e.type === 'ready' });
    run(s, { first: [dash(0, 3)], seconds: 1, until: (e) => e.type === 'ready' });
    // Cross the first leg (y = 1) near x = 3.6, well ahead of the soul.
    const target = { x: 3.4, y: 0.5 };
    const aim = { x: target.x - s.body.pos.x, y: target.y - s.body.pos.y };
    const preview = previewDash(s, aim);
    expect(preview.contact).toBeNull();
    let minGap = Infinity;
    const events = run(s, {
      first: [dash(aim.x, aim.y)],
      seconds: 1,
      until: (e, st) => {
        minGap = Math.min(minGap, Math.hypot(st.body.pos.x - st.soul.pos.x, st.body.pos.y - st.soul.pos.y));
        return e.type === 'dashEnd';
      },
    });
    expect(ofType(events, 'reunion')).toHaveLength(0);
    expect(minGap).toBeGreaterThan(REACH);
    expect(s.route.points.length).toBe(4); // soul, two corners, body: the crossing added nothing
  });

  it('backward offensive movement spends normal capacity until genuine contact', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 7, y: 2 },
    ]);
    const lengthBefore = s.route.length;
    const p = previewDash(s, { x: -0.8, y: 0 }); // short backward dash: no contact
    expect(p.contact).toBeNull();
    run(s, { first: [dash(-0.8, 0)], seconds: 1, until: (e) => e.type === 'dashEnd' });
    // The reversal appended a corner and real length: it was not a free reel.
    expect(s.route.points.length).toBe(3);
    // The soul consumed its own speed times elapsed time; nothing else was removed.
    expect(s.route.length).toBeCloseTo(lengthBefore + 0.8 - TUNING.soulSpeed * s.time, 6);
  });
});

describe('the three paper states (case 4)', () => {
  it('straight two-tile gap with four free: contact dash reaches the moving soul', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 4, y: 2 },
    ]);
    expect(TUNING.tetherCapacity - s.route.length).toBeCloseTo(4);
    const p = previewDash(s, { x: -3, y: 0 });
    expect(p.valid).toBe(true);
    expect(p.contact).not.toBeNull();
    const r = previewReturn(s);
    expect(r.valid).toBe(true);
  });

  it('five-tile gap with one free: dash cannot reach, RETURN retracts the whole path', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 7, y: 2 },
    ]);
    const p = previewDash(s, { x: -5, y: 0 });
    expect(p.valid).toBe(true);
    expect(p.limitedBy).toBe('capacity');
    expect(p.contact).toBeNull();
    const r = previewReturn(s);
    expect(r.valid).toBe(true);
    const events = run(s, { first: [ret], seconds: 2, until: (e) => e.type === 'reunion' });
    const reunion = ofType(events, 'reunion')[0]!;
    expect(reunion.cause).toBe('return');
    expectClose(reunion.at, r.meetAt!, 12);
    expect(reunion.t - 0).toBeCloseTo(r.seconds, 9);
  });

  it('six-tile U around a wall, endpoints two tiles apart: no shortcut, RETURN follows corners', () => {
    const wall = { x: 3, y: 2, w: 1, h: 4 };
    const s = separatedFixture(
      { walls: [wall] },
      [
        { x: 2.5, y: 4.5 },
        { x: 2.5, y: 6.5 },
        { x: 4.5, y: 6.5 },
        { x: 4.5, y: 4.5 },
      ],
      { tetherCapacity: 8 },
    );
    expect(s.route.length).toBeCloseTo(6);
    const direct = previewDash(s, { x: -2, y: 0 });
    expect(direct.valid).toBe(false);
    expect(direct.reason).toBe('blocked');

    const path: { x: number; y: number }[] = [];
    let reunion: ReturnType<typeof ofType<'reunion'>>[number] | undefined;
    for (let i = 0; i < 360 && !reunion; i++) {
      reunion = ofType(step(s, i === 0 ? [ret] : []), 'reunion')[0];
      path.push(s.body.pos);
    }
    expect(reunion?.cause).toBe('return');
    // Met on the soul's leg, on the far side of the wall from where the body started.
    expect(reunion!.at.x).toBeCloseTo(2.5, 9);
    // The body went over the top of the wall rather than through it.
    expect(Math.max(...path.map((p) => p.y))).toBeGreaterThan(6.2);
  });

  it('contact whose snap would clip a wall corner is refused until the corridor is clear', () => {
    // Endpoints on either side of the convex corner (5, 4): within reach, but the
    // straight soul sweep to the anchor cuts the corner.
    const wall = { x: 3, y: 2, w: 2, h: 2 };
    const s = separatedFixture(
      { walls: [wall] },
      [
        { x: 5, y: 4.32 },
        { x: 5.45, y: 4.45 },
        { x: 5.32, y: 4.0 },
      ],
    );
    s.contactArmed = true; // as if they had separated and come back together
    const gap = Math.hypot(s.body.pos.x - s.soul.pos.x, s.body.pos.y - s.soul.pos.y);
    expect(gap).toBeLessThan(REACH);
    expect(corridorClear(s.room, s.soul.pos, s.body.pos, TUNING.soulRadius)).toBe(false);
    const first = step(s);
    expect(ofType(first, 'reunion')).toHaveLength(0);
    expect(s.soul.pos.x).toBeGreaterThan(5); // still following the legal route
    const events = run(s, { seconds: 1, until: (e) => e.type === 'reunion' });
    const reunion = ofType(events, 'reunion')[0]!;
    expect(reunion).toBeDefined();
    expect(reunion.t).toBeGreaterThan(1 / 120);
  });
});
