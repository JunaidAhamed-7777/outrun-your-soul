import { describe, expect, it } from 'vitest';
import { ENEMY_TUNING } from '../../src/sim';
import type { EnemySpawn } from '../../src/sim/types';
import { dash, makeSim, ofType, run, separatedFixture, step } from './helpers';

const needlerAt = (x: number, y: number, extra: Partial<EnemySpawn> = {}): EnemySpawn => ({
  id: extra.id ?? 'n',
  role: 'needler',
  at: { x, y },
  ...extra,
});

describe('sentry attack cycle', () => {
  it('announces, locks, then fires along the locked line', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 }, enemies: [needlerAt(8, 2)] });
    const t = ENEMY_TUNING.needler;
    const events = run(s, { seconds: 4, until: (e) => e.type === 'fire' });
    const [track, lock] = ofType(events, 'telegraph');
    expect(track!.phase).toBe('tracking');
    expect(track!.t).toBeCloseTo(t.cooldown, 9);
    expect(lock!.phase).toBe('locked');
    expect(lock!.t).toBeCloseTo(t.cooldown + t.tracking, 9);
    const fire = ofType(events, 'fire')[0]!;
    expect(fire.t).toBeCloseTo(t.cooldown + t.tracking + t.locked, 9);
    const bolt = s.projectiles.find((p) => p.id === fire.projectileId)!;
    expect(bolt.attackId).toBe(fire.attackId);
    expect(bolt.vel.x).toBeCloseTo(-t.boltSpeed, 9);
  });

  it('a locked warning never retargets, even if the target moves', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 }, enemies: [needlerAt(8, 2)] });
    const enemy = s.enemies[0]!;
    run(s, { seconds: 3, until: (e) => e.type === 'telegraph' && e.phase === 'locked' });
    const lockedAim = enemy.aim;
    // Body leaves the line while the warning is locked.
    const events = run(s, { first: [dash(0, 3)], seconds: 1, until: (e) => e.type === 'fire' });
    expect(enemy.aim).toEqual(lockedAim);
    const fire = ofType(events, 'fire')[0]!;
    const bolt = s.projectiles.find((p) => p.id === fire.projectileId)!;
    const speed = Math.hypot(bolt.vel.x, bolt.vel.y);
    expect(bolt.vel.x / speed).toBeCloseTo(lockedAim.x, 12);
    expect(bolt.vel.y / speed).toBeCloseTo(lockedAim.y, 12);
    // It flies down the old line and misses the body that left it.
    const later = run(s, { seconds: 2 });
    expect(ofType(later, 'hit')).toHaveLength(0);
  });

  it('tracking follows the target until the lock', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 }, enemies: [needlerAt(8, 6)] });
    const enemy = s.enemies[0]!;
    run(s, { seconds: 3, until: (e) => e.type === 'telegraph' && e.phase === 'tracking' });
    const before = enemy.aim;
    run(s, { first: [dash(0, 3)], seconds: 0.3 });
    expect(enemy.phase).toBe('tracking');
    expect(enemy.aim).not.toEqual(before);
  });

  it('killing the source after firing leaves its bolt alive (case 13)', () => {
    // A keeper fires at the slow soul; the body then kills the keeper from the side.
    const s = separatedFixture(
      { enemies: [{ id: 'k', role: 'keeper', at: { x: 10, y: 2 } }] },
      [
        { x: 2, y: 2 },
        { x: 10, y: 5 },
      ],
      { soulSpeed: 0.01, tetherCapacity: 12 },
    );
    const fire = ofType(run(s, { seconds: 5, until: (e) => e.type === 'fire' }), 'fire')[0]!;
    const killStep = run(s, { first: [dash(0, -3)], seconds: 0.3, until: (e) => e.type === 'kill' });
    expect(ofType(killStep, 'kill')).toHaveLength(1);
    expect(ofType(killStep, 'cut')).toHaveLength(0);
    expect(s.projectiles.some((p) => p.id === fire.projectileId)).toBe(true);
    // The orphaned bolt keeps flying and still lands on the soul.
    const later = run(s, { seconds: 3, until: (e) => e.type === 'hit' });
    const hit = ofType(later, 'hit')[0]!;
    expect(hit.endpoint).toBe('soul');
    expect(hit.attackId).toBe(fire.attackId);
    expect(ofType(later, 'fire')).toHaveLength(0);
  });

  it('killing a locked source cancels its unlaunched attack', () => {
    const s = makeSim({ spawn: { x: 5, y: 2 }, enemies: [needlerAt(7.5, 2)] });
    run(s, { seconds: 3, until: (e) => e.type === 'telegraph' && e.phase === 'locked' });
    const events = run(s, { first: [dash(2.5, 0)], seconds: 1.5 });
    expect(ofType(events, 'kill')).toHaveLength(1);
    expect(ofType(events, 'fire')).toHaveLength(0);
    expect(s.enemies[0]!.attackId).toBeNull();
  });

  it('keepers aim at the soul, needlers at the body', () => {
    const s = makeSim({
      spawn: { x: 2, y: 2 },
      enemies: [needlerAt(10, 10, { id: 'n' }), { id: 'k', role: 'keeper', at: { x: 10, y: 2 } }],
    });
    run(s, { first: [dash(0, 3)], seconds: 0.5 });
    run(s, { seconds: 2.4, until: (e) => e.type === 'telegraph' && e.phase === 'locked' });
    const keeper = s.enemies.find((e) => e.key === 'k')!;
    expect(keeper.target).toBe('soul');
    const towardSoul = { x: s.soul.pos.x - keeper.pos.x, y: s.soul.pos.y - keeper.pos.y };
    const n = Math.hypot(towardSoul.x, towardSoul.y);
    // While tracking/locked shortly after, the keeper aim points near the soul, not the body.
    expect(keeper.aim.x * (towardSoul.x / n) + keeper.aim.y * (towardSoul.y / n)).toBeGreaterThan(0.95);
  });

  it('dashing through a sentry kills it and the dash continues', () => {
    const s = makeSim({ spawn: { x: 2, y: 2 }, enemies: [needlerAt(3.5, 2)] });
    const events = run(s, { first: [dash(3, 0)], seconds: 0.4 });
    expect(ofType(events, 'kill')).toHaveLength(1);
    expect(ofType(events, 'dashEnd')[0]!.at.x).toBeCloseTo(5, 9);
    expect(ofType(events, 'roomCleared')).toHaveLength(1);
  });
});

describe('dormant sentries and wake triggers', () => {
  it('stay inert until woken by time', () => {
    const s = makeSim({
      spawn: { x: 2, y: 2 },
      enemies: [needlerAt(8, 2, { dormant: true, wake: { kind: 'time', seconds: 2 } })],
    });
    const early = run(s, { seconds: 1.9 });
    expect(ofType(early, 'telegraph')).toHaveLength(0);
    const later = run(s, { seconds: 2 });
    expect(ofType(later, 'wake')[0]!.t).toBeCloseTo(2, 9);
  });

  it('wake when a named enemy dies, with the authored phase delaying the first attack', () => {
    const s = makeSim({
      spawn: { x: 2, y: 2 },
      enemies: [
        needlerAt(3.5, 2, { id: 'first', dormant: true }),
        needlerAt(10, 10, { id: 'second', dormant: true, wake: { kind: 'enemyKilled', enemy: 'first' }, phase: -1 }),
      ],
    });
    const events = run(s, { first: [dash(3, 0)], seconds: 4 });
    const kill = ofType(events, 'kill')[0]!;
    const wake = ofType(events, 'wake')[0]!;
    expect(wake.t).toBeCloseTo(kill.t, 9);
    const track = ofType(events, 'telegraph')[0]!;
    expect(track.t - wake.t).toBeCloseTo(ENEMY_TUNING.needler.cooldown + 1, 9);
  });

  it('wake on separation and on body proximity', () => {
    const s = makeSim({
      spawn: { x: 2, y: 2 },
      enemies: [
        needlerAt(10, 10, { id: 'a', dormant: true, wake: { kind: 'separated' } }),
        needlerAt(8, 2, { id: 'b', dormant: true, wake: { kind: 'bodyWithin', radius: 3.5 } }),
      ],
    });
    const events = run(s, { first: [dash(3, 0)], seconds: 0.3 });
    const woken = ofType(events, 'wake').map((w) => s.enemies.find((e) => e.id === w.enemyId)!.key);
    expect(woken.sort()).toEqual(['a', 'b']);
    step(s);
  });
});
