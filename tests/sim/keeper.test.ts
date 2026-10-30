import { describe, expect, it } from 'vitest';
import { cloneState, ENEMY_TUNING, STEP_SECONDS } from '../../src/sim';
import type { Command, SimEvent, SimState } from '../../src/sim/types';
import { fromAngle, type Vec2 } from '../../src/sim/vec';
import { makeSim, ofType, run, separatedFixture, step } from './helpers';

const NOVICE_DELAY = 0.4;
const K = ENEMY_TUNING.keeper;

/** A long straight route up the left side; a keeper to the right, about to start tracking. */
function walkingSoul(): SimState {
  return separatedFixture(
    { enemies: [{ id: 'k', role: 'keeper', at: { x: 7, y: 5 }, phase: K.cooldown - 0.01 }] },
    [
      { x: 2, y: 1 },
      { x: 2, y: 10 },
    ],
    { tetherCapacity: 10 },
  );
}

function distanceToPolyline(p: Vec2, pts: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const l2 = ab.x * ab.x + ab.y * ab.y;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2)) : 0;
    best = Math.min(best, Math.hypot(a.x + ab.x * t - p.x, a.y + ab.y * t - p.y));
  }
  return best;
}

/** Run to the keeper's lock, wait a novice aim delay, then issue `respond` (or nothing). */
function respondAfterLock(s: SimState, respond: ((s: SimState) => Command | null) | null): SimEvent[] {
  const events = run(s, { seconds: 4, until: (e) => e.type === 'telegraph' && e.phase === 'locked' });
  events.push(...run(s, { seconds: NOVICE_DELAY }));
  const cmd = respond ? respond(s) : null;
  events.push(...run(s, { first: cmd ? [cmd] : [], seconds: 4 }));
  return events;
}

describe('keeper forecast aim', () => {
  it('locks onto the soul’s forecast position on its route, ahead of the soul', () => {
    const s = walkingSoul();
    run(s, { seconds: 3, until: (e) => e.type === 'telegraph' && e.phase === 'locked' });
    const keeper = s.enemies[0]!;
    expect(keeper.phase).toBe('locked');
    const target = keeper.lockTarget!;
    expect(target).not.toBeNull();
    expect(distanceToPolyline(target, s.route.points)).toBeLessThan(1e-9);
    // Ahead of the soul by roughly soul speed x (lock + flight).
    expect(target.y - s.soul.pos.y).toBeGreaterThan(K.locked * 2);
    const aimed = Math.atan2(target.y - keeper.pos.y, target.x - keeper.pos.x);
    expect(Math.atan2(keeper.aim.y, keeper.aim.x)).toBeCloseTo(aimed, 12);
  });

  it('tracking exposes a live aim target that follows the forecast', () => {
    const s = walkingSoul();
    run(s, { seconds: 1, until: (e) => e.type === 'telegraph' && e.phase === 'tracking' });
    const first = s.enemies[0]!.aimTarget!;
    run(s, { seconds: 0.3 });
    const later = s.enemies[0]!.aimTarget!;
    expect(s.enemies[0]!.phase).toBe('tracking');
    expect(later).not.toEqual(first);
    expect(distanceToPolyline(later, s.route.points)).toBeLessThan(1e-9);
  });

  it('with no response, the led shot lands on the walking soul', () => {
    const s = walkingSoul();
    const events = respondAfterLock(s, null);
    const fire = ofType(events, 'fire')[0]!;
    const hit = ofType(events, 'hit')[0]!;
    expect(hit.endpoint).toBe('soul');
    expect(hit.attackId).toBe(fire.attackId);
  });

  it('counterplay: a novice-timed RETURN stops the soul short of the reticle', () => {
    const s = walkingSoul();
    const events = respondAfterLock(s, () => ({ kind: 'return' }));
    expect(ofType(events, 'reunion')[0]?.cause).toBe('return');
    expect(ofType(events, 'hit')).toHaveLength(0);
  });

  it('counterplay: a novice-timed contact dash at the soul pulls it off the route', () => {
    const s = separatedFixture(
      { enemies: [{ id: 'k', role: 'keeper', at: { x: 7, y: 5 }, phase: K.cooldown - 0.01 }] },
      [
        { x: 2, y: 1 },
        { x: 2, y: 6.5 },
      ],
    );
    const events = respondAfterLock(s, (st) => ({
      kind: 'dash',
      aim: { x: st.soul.pos.x - st.body.pos.x, y: st.soul.pos.y - st.body.pos.y },
    }));
    expect(ofType(events, 'reunion')[0]?.cause).toBe('contact');
    expect(ofType(events, 'hit')).toHaveLength(0);
  });

  it('counterplay: an outward dash released at least a novice delay after the shot can cut the bolt', () => {
    const s = walkingSoul();
    run(s, { seconds: 4, until: (e) => e.type === 'fire' });
    // Search release time x direction on copies (the player times a dash across the line).
    let plan: { wait: number; cmd: Command } | null = null;
    for (let wait = NOVICE_DELAY; wait <= 1.2 && !plan; wait += 0.05) {
      for (let i = 0; i < 48 && !plan; i++) {
        const cmd: Command = { kind: 'dash', aim: fromAngle((i / 48) * Math.PI * 2, 3) };
        const probe = cloneState(s);
        run(probe, { seconds: wait });
        const evs = run(probe, { first: [cmd], seconds: 1 });
        if (ofType(evs, 'cut').length > 0 && ofType(evs, 'hit').length === 0) plan = { wait, cmd };
      }
    }
    expect(plan).not.toBeNull();
    run(s, { seconds: plan!.wait });
    const events = run(s, { first: [plan!.cmd], seconds: 3 });
    expect(ofType(events, 'cut')).toHaveLength(1);
    expect(ofType(events, 'hit').filter((h) => h.endpoint === 'soul')).toHaveLength(0);
  });

  it('a reunited, stationary soul is aimed at directly', () => {
    const s = makeSim({ spawn: { x: 3, y: 3 }, enemies: [{ id: 'k', role: 'keeper', at: { x: 8, y: 8 }, phase: K.cooldown - 0.01 }] });
    run(s, { seconds: 3, until: (e) => e.type === 'telegraph' && e.phase === 'locked' });
    expect(s.enemies[0]!.lockTarget).toEqual(s.soul.pos);
  });

  it('needlers keep current-position aim at the body', () => {
    const s = separatedFixture(
      { enemies: [{ id: 'n', role: 'needler', at: { x: 7, y: 5 }, phase: 1.69 }] },
      [
        { x: 2, y: 1 },
        { x: 2, y: 6 },
      ],
    );
    run(s, { seconds: 3, until: (e) => e.type === 'telegraph' && e.phase === 'locked' });
    expect(s.enemies[0]!.lockTarget).toEqual(s.body.pos);
  });

  it('a forecast target is where the soul would really be: passive play confirms it', () => {
    const s = walkingSoul();
    run(s, { seconds: 3, until: (e) => e.type === 'telegraph' && e.phase === 'locked' });
    const keeper = s.enemies[0]!;
    const target = keeper.lockTarget!;
    // Flight time to the target plus the lock remaining.
    const flight = (Math.hypot(target.x - keeper.pos.x, target.y - keeper.pos.y) - keeper.radius) / K.boltSpeed;
    const arrival = K.locked + flight;
    const future = cloneState(s);
    for (let i = 0; i < Math.round(arrival / STEP_SECONDS); i++) step(future);
    expect(Math.hypot(future.soul.pos.x - target.x, future.soul.pos.y - target.y)).toBeLessThan(0.05);
  });

  it('warning plus flight leaves well over two seconds before a keeper shot lands', () => {
    const s = walkingSoul();
    const events = respondAfterLock(s, null);
    const track = ofType(events, 'telegraph')[0]!;
    const hit = ofType(events, 'hit')[0]!;
    expect(hit.t - track.t).toBeGreaterThan(2.5);
  });
});

