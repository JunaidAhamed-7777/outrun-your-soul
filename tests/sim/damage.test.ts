import { describe, expect, it } from 'vitest';
import { createSim, TUNING } from '../../src/sim';
import type { EnemyState, LaneDef, SimState } from '../../src/sim/types';
import { dash, makeRoom, makeSim, ofType, ret, run, separatedFixture, spawnBolt, step } from './helpers';

const healthLost = (s: SimState): number => s.maxHealth - s.health;

describe('shared health and attack-ID dedup (case 5)', () => {
  it('a bolt hitting the body costs one shared health', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    spawnBolt(s, { x: 4, y: 2 }, { x: -6, y: 0 });
    const events = run(s, { seconds: 1 });
    expect(ofType(events, 'hit')).toHaveLength(1);
    expect(ofType(events, 'hit')[0]!.endpoint).toBe('body');
    expect(healthLost(s)).toBe(1);
    expect(ofType(events, 'projectileGone')[0]!.reason).toBe('endpoint');
  });

  it('a bolt hitting the separated soul costs the same shared health', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 5, y: 2 },
    ], { soulSpeed: 0.01 });
    spawnBolt(s, { x: 2, y: 5 }, { x: 0, y: -6 });
    const events = run(s, { seconds: 1 });
    const hits = ofType(events, 'hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.endpoint).toBe('soul');
    expect(s.health).toBe(s.maxHealth - 1);
  });

  it('touching both reunited endpoints at once deals one damage', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    spawnBolt(s, { x: 2, y: 4 }, { x: 0, y: -6 });
    const events = run(s, { seconds: 1 });
    expect(ofType(events, 'hit')).toHaveLength(1);
    expect(healthLost(s)).toBe(1);
  });

  it('one lane activation touching both endpoints in the same step damages once', () => {
    const lane: LaneDef = { id: 'L', rect: { x: 0, y: 1, w: 12, h: 2 }, period: 4, activeFrom: 1, activeTo: 2, warnLead: 0.5 };
    const s = separatedFixture({ lanes: [lane] }, [
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 6, y: 4 },
      { x: 6, y: 2 },
    ], { tetherCapacity: 10, soulSpeed: 0.01 });
    const events = run(s, { seconds: 1.2 });
    expect(ofType(events, 'hit')).toHaveLength(1);
    expect(healthLost(s)).toBe(1);
  });

  it('one lane activation touching the endpoints in adjacent steps damages once', () => {
    // Body stands in the lane; the soul walks into the same activation shortly after.
    const lane: LaneDef = { id: 'L', rect: { x: 4, y: 0, w: 2, h: 12 }, period: 10, activeFrom: 0.5, activeTo: 5, warnLead: 0 };
    const s = separatedFixture({ lanes: [lane] }, [
      { x: 2, y: 2 },
      { x: 5, y: 2 },
    ]);
    const events = run(s, { seconds: 1.4 });
    expect(ofType(events, 'hit')).toHaveLength(1);
    expect(healthLost(s)).toBe(1);
  });

  it('a second distinct attack inside global grace is shielded, not dealt', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    spawnBolt(s, { x: 4, y: 2 }, { x: -6, y: 0 });
    spawnBolt(s, { x: 2, y: 4.2 }, { x: 0, y: -6 });
    const events = run(s, { seconds: 1 });
    expect(ofType(events, 'hit')).toHaveLength(1);
    expect(ofType(events, 'shielded').map((e) => e.reason)).toEqual(['grace']);
    expect(healthLost(s)).toBe(1);
  });

  it('health reaching zero is defeat and ends the room', () => {
    const s = createSim(makeRoom({ spawn: { x: 2, y: 2 } }), { seed: 1, health: 1 });
    spawnBolt(s, { x: 4, y: 2 }, { x: -6, y: 0 });
    const events = run(s, { seconds: 1 });
    expect(ofType(events, 'defeat')).toHaveLength(1);
    expect(s.outcome).toBe('defeat');
    expect(s.body.mode).toBe('dead');
    const after = step(s, [dash(1, 0)]);
    expect(ofType(after, 'rejected')[0]?.reason).toBe('ended');
  });
});

describe('dash protection (case 6)', () => {
  it('protects the body during dash travel by cutting bolts on its path', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    spawnBolt(s, { x: 4, y: 2 }, { x: 0, y: 0 });
    const events = run(s, { first: [dash(3, 0)], seconds: 0.5 });
    expect(ofType(events, 'cut')).toHaveLength(1);
    expect(ofType(events, 'hit')).toHaveLength(0);
    expect(s.stats.cuts).toBe(1);
  });

  it('ends at arrival: a bolt arriving during recovery hits', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 } });
    step(s, [dash(3, 0)]);
    // Bolt reaches x=5 shortly after the body arrives there at t=0.2.
    spawnBolt(s, { x: 5, y: 3.5 }, { x: 0, y: -4 });
    const events = run(s, { seconds: 1 });
    expect(ofType(events, 'cut')).toHaveLength(0);
    const hit = ofType(events, 'hit')[0]!;
    expect(hit.endpoint).toBe('body');
    expect(hit.t).toBeGreaterThan(0.2);
  });

  it('the soul never inherits protection, even while the body dashes', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 5, y: 2 },
    ]);
    spawnBolt(s, { x: 2.1, y: 3 }, { x: 0, y: -6 });
    const events = run(s, { first: [dash(0, 3)], seconds: 0.6 });
    expect(ofType(events, 'hit')[0]?.endpoint).toBe('soul');
  });

  it('RETURN never cuts bolts, never kills and grants no protection', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 8, y: 2 },
    ]);
    // A sentry placed on the route after it was laid, and a bolt sitting on the route.
    const sentry: EnemyState = {
      id: s.nextId++,
      key: 'late',
      role: 'needler',
      pos: { x: 6, y: 2 },
      radius: 0.42,
      phase: 'dormant',
      phaseTime: 0,
      phaseDuration: Infinity,
      aim: { x: 0, y: -1 },
      target: 'body',
      attackId: null,
      facing: { x: 0, y: -1 },
    };
    s.enemies.push(sentry);
    s.gate = 'sealed';
    spawnBolt(s, { x: 7, y: 2 }, { x: 0, y: 0 });
    const events = run(s, { first: [ret], seconds: 2, until: (e) => e.type === 'reunion' });
    expect(ofType(events, 'cut')).toHaveLength(0);
    expect(ofType(events, 'kill')).toHaveLength(0);
    expect(ofType(events, 'hit')[0]?.endpoint).toBe('body');
    expect(sentry.phase).toBe('dormant');
  });

  it('a dashing body crossing an active lane is shielded; standing in it after arrival is hit', () => {
    const lane: LaneDef = { id: 'L', rect: { x: 3, y: 0, w: 1, h: 12 }, period: 10, activeFrom: 0, activeTo: 9, warnLead: 0 };
    const s = makeSim({ spawn: { x: 1.5, y: 2 }, lanes: [lane] });
    const pass = run(s, { first: [dash(3, 0)], seconds: 0.25 });
    expect(ofType(pass, 'shielded').map((e) => e.reason)).toEqual(['dash']);
    expect(ofType(pass, 'hit')).toHaveLength(0);
    // The soul, following, is not protected by anything.
    const later = run(s, { seconds: 2 });
    expect(ofType(later, 'hit')[0]?.endpoint).toBe('soul');

    const s2 = makeSim({ spawn: { x: 1.5, y: 2 }, lanes: [lane] });
    const stop = run(s2, { first: [dash(2, 0)], seconds: 0.3 });
    expect(ofType(stop, 'hit')[0]?.endpoint).toBe('body');
    expect(ofType(stop, 'hit')[0]!.t).toBeGreaterThanOrEqual(2 / TUNING.dashSpeed - 1e-9);
  });
});

describe('event-time ordering of cuts and soul hits (case 7)', () => {
  it('an earlier cut prevents a later soul hit', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 4, y: 3.5 },
    ], { soulSpeed: 0.01 });
    // Bolt heading for the soul from the right; the downward dash crosses its path first.
    spawnBolt(s, { x: 4.5, y: 2 }, { x: -4, y: 0 });
    const events = run(s, { first: [dash(0, -3)], seconds: 1.5 });
    expect(ofType(events, 'cut')).toHaveLength(1);
    expect(ofType(events, 'hit')).toHaveLength(0);
  });

  it('an earlier soul hit is not erased by a later cut', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 4, y: 2 },
    ], { soulSpeed: 0.01 });
    // The bolt reaches the soul (t ~ 0.04) before the dash could reach the bolt (t ~ 0.09).
    spawnBolt(s, { x: 2.6, y: 2 }, { x: -4, y: 0 });
    const events = run(s, { first: [dash(-3, 0)], seconds: 1 });
    const hit = ofType(events, 'hit')[0]!;
    expect(hit.endpoint).toBe('soul');
    expect(hit.t).toBeCloseTo(0.15 / (4 + 0.01), 9); // bolt and slow soul close on each other
    expect(ofType(events, 'cut')).toHaveLength(0);
    expect(ofType(events, 'reunion')[0]?.cause).toBe('contact');
  });

  it('exact tie: a bolt touching the dashing body and the soul at the same instant is cut', () => {
    const s = separatedFixture({}, [
      { x: 2, y: 2 },
      { x: 5, y: 2 },
    ]);
    step(s, [dash(-3, 0)]);
    // Advance until the closing gap is between contact reach and twice the bolt reach.
    let guard = 0;
    while (s.body.pos.x - s.soul.pos.x > 0.85 && guard++ < 100) step(s);
    const gap = s.body.pos.x - s.soul.pos.x;
    expect(gap).toBeGreaterThan(TUNING.bodyRadius + TUNING.soulRadius);
    expect(gap).toBeLessThan(0.9);
    expect(s.body.mode).toBe('dash');
    // Midpoint bolt overlaps both endpoints at the start of the next step: tau = 0 for both.
    spawnBolt(s, { x: (s.body.pos.x + s.soul.pos.x) / 2, y: 2 }, { x: 0, y: 0 });
    const events = step(s);
    expect(ofType(events, 'cut')).toHaveLength(1);
    expect(ofType(events, 'hit')).toHaveLength(0);
  });
});

describe('persistent lanes (case 8)', () => {
  const lane: LaneDef = { id: 'L', rect: { x: 0, y: 1, w: 12, h: 2 }, period: 2, activeFrom: 1, activeTo: 1.5, warnLead: 0.5 };

  it('cycles warning -> active -> idle with a fresh attack ID per activation', () => {
    const s = makeSim({ spawn: { x: 6, y: 6 }, lanes: [lane] });
    const events = run(s, { seconds: 4.2 });
    expect(ofType(events, 'lane').map((e) => [Number(e.t.toFixed(6)), e.status])).toEqual([
      [0.5, 'warning'],
      [1, 'active'],
      [1.5, 'idle'],
      [2.5, 'warning'],
      [3, 'active'],
      [3.5, 'idle'],
    ]);
  });

  it('a later activation damages again; its first hit grants no lasting immunity', () => {
    const s = makeSim({ spawn: { x: 6, y: 2 }, lanes: [lane] });
    const events = run(s, { seconds: 3.4 });
    const hits = ofType(events, 'hit');
    expect(hits.map((h) => Number(h.t.toFixed(6)))).toEqual([1, 3]);
    expect(hits[0]!.attackId).not.toBe(hits[1]!.attackId);
    expect(s.health).toBe(s.maxHealth - 2);
  });

  it('a long activation does not re-damage when grace ends while still inside', () => {
    const long: LaneDef = { ...lane, period: 10, activeFrom: 0.5, activeTo: 4 };
    const s = makeSim({ spawn: { x: 6, y: 2 }, lanes: [long] });
    const events = run(s, { seconds: 3 });
    expect(ofType(events, 'hit')).toHaveLength(1);
  });

  it('entering an activation during grace is shielded, then dealt when grace ends inside it', () => {
    const long: LaneDef = { id: 'L', rect: { x: 4, y: 0, w: 2, h: 12 }, period: 10, activeFrom: 0, activeTo: 9, warnLead: 0 };
    const s = makeSim({ spawn: { x: 2, y: 2 }, lanes: [long] });
    spawnBolt(s, { x: 2, y: 3 }, { x: 0, y: -6 });
    step(s);
    const first = run(s, { seconds: 0.1 });
    expect(ofType(first, 'hit')).toHaveLength(1);
    const events = run(s, { first: [dash(2.5, 0)], seconds: 1.5 });
    expect(ofType(events, 'shielded').some((e) => e.reason === 'dash')).toBe(true);
    const hits = ofType(events, 'hit');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]!.source).toBe('lane');
  });
});
