import { describe, expect, it } from 'vitest';
import { RELIC_SIM_TUNING, simHooksFor, type Loadout } from '../../src/run/relics';
import { createSim } from '../../src/sim';
import { HALO_EXIT_BAND, simDiagnostics } from '../../src/sim/step';
import type { EnemySpawn, LaneDef, SimRelicCharges, SimState } from '../../src/sim/types';
import { dash, makeRoom, ofType, ret, run, spawnBolt, step, type RoomSpec } from './helpers';

const SONG = RELIC_SIM_TUNING.needlesong;
const LANTERN = RELIC_SIM_TUNING.glassLantern;
const BELL = RELIC_SIM_TUNING.mourningBell;

/** A sim with relics taken straight from the run layer (proves structural compatibility). */
function withRelics(
  loadout: Loadout,
  spec: RoomSpec = {},
  params: Partial<SimState['params']> = {},
  charges?: SimRelicCharges,
): SimState {
  return createSim(makeRoom(spec), { seed: 1, params, relics: simHooksFor(loadout), charges });
}

/** Lay a straight route by hand (soul at points[0], body at the end). */
function layRoute(s: SimState, points: { x: number; y: number }[]): void {
  s.route.points = points.slice();
  s.route.length = points.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);
  s.soul.pos = points[0]!;
  s.body.pos = points[points.length - 1]!;
  s.contactArmed = true;
  s.gate = s.enemies.every((e) => e.phase === 'dead') ? 'ready' : 'sealed';
}

const sentry = (id: string, x: number, y: number, extra: Partial<EnemySpawn> = {}): EnemySpawn => ({
  id,
  role: 'needler',
  at: { x, y },
  dormant: true,
  ...extra,
});

describe('Needlesong', () => {
  it('a real cut boosts the soul along its route for the tuned time, then ends exactly', () => {
    const s = withRelics(['needlesong'], { spawn: { x: 2, y: 2 } });
    spawnBolt(s, { x: 3.5, y: 2 }, { x: 0, y: 0 });
    const events = run(s, { first: [dash(3, 0)], seconds: 2 });
    const cut = ofType(events, 'cut')[0]!;
    const boost = ofType(events, 'soulBoost')[0]!;
    expect(boost.t).toBe(cut.t);
    expect(boost.multiplier).toBe(SONG.boostMultiplier);
    const end = ofType(events, 'soulBoostEnd')[0];
    // Soul reunites quickly here, but the timer still expires exactly on schedule.
    expect(end?.t).toBeCloseTo(cut.t + SONG.boostSeconds, 9);
    expect(s.soul.speedMultiplier).toBe(1);
  });

  it('boosted soul really moves faster along the same path', () => {
    const base = withRelics([], { spawn: { x: 2, y: 2 } }, { tetherCapacity: 12 });
    const song = withRelics(['needlesong'], { spawn: { x: 2, y: 2 } }, { tetherCapacity: 12 });
    for (const s of [base, song]) {
      layRoute(s, [
        { x: 1, y: 1 },
        { x: 1, y: 9 },
      ]);
      spawnBolt(s, { x: 2.5, y: 9 }, { x: 0, y: 0 });
      run(s, { first: [dash(3, 0)], seconds: 0.5 });
    }
    expect(song.soul.pos.y).toBeGreaterThan(base.soul.pos.y + 0.3);
    expect(song.soul.pos.x).toBe(1); // still on its route, not cutting a corner
  });

  it('a second cut refreshes the timer and never stacks the multiplier', () => {
    const s = withRelics(['needlesong'], { spawn: { x: 2, y: 2 } }, { tetherCapacity: 12 });
    layRoute(s, [
      { x: 1, y: 1 },
      { x: 1, y: 9 },
    ]);
    spawnBolt(s, { x: 2.5, y: 9 }, { x: 0, y: 0 });
    spawnBolt(s, { x: 5.5, y: 9 }, { x: 0, y: 0 });
    const first = run(s, { first: [dash(2, 0)], seconds: 0.5, until: (e) => e.type === 'ready' });
    const second = run(s, { first: [dash(3, 0)], seconds: 0.4 });
    const boosts = [...ofType(first, 'soulBoost'), ...ofType(second, 'soulBoost')];
    expect(boosts).toHaveLength(2);
    expect(s.soul.speedMultiplier).toBe(SONG.boostMultiplier);
    const rest = run(s, { seconds: 2 });
    expect(ofType(rest, 'soulBoostEnd')[0]!.t).toBeCloseTo(boosts[1]!.t + SONG.boostSeconds, 9);
    expect(ofType([...first, ...second], 'soulBoostEnd')).toHaveLength(0);
  });

  it('empty swings grant nothing', () => {
    const s = withRelics(['needlesong'], { spawn: { x: 2, y: 2 } });
    const events = run(s, { first: [dash(3, 0)], seconds: 1 });
    expect(ofType(events, 'soulBoost')).toHaveLength(0);
  });

  it('counterexample: earlier arrival carries the soul into a lane slow arrival would miss', () => {
    // Lane active 1.0-2.0 s across the soul's route. Unboosted, the soul reaches it at ~2.1 s.
    const lane: LaneDef = { id: 'L', rect: { x: 0, y: 5.5, w: 12, h: 1 }, period: 10, activeFrom: 1, activeTo: 2, warnLead: 0.5 };
    const outcome = (loadout: Loadout): number => {
      const s = withRelics(loadout, { spawn: { x: 2, y: 2 }, lanes: [lane] }, { tetherCapacity: 14 });
      layRoute(s, [
        { x: 1, y: 1 },
        { x: 1, y: 10 },
      ]);
      spawnBolt(s, { x: 2.2, y: 10 }, { x: 0, y: 0 });
      const events = run(s, { first: [dash(3, 0)], seconds: 4 });
      return ofType(events, 'hit').filter((h) => h.endpoint === 'soul' && h.source === 'lane').length;
    };
    expect(outcome([])).toBe(0);
    expect(outcome(['needlesong'])).toBe(1);
  });
});

describe('Glass Lantern', () => {
  it('bolts slow inside the soul halo at the exact boundary and recover outside', () => {
    const s = withRelics(['glass_lantern'], { spawn: { x: 6, y: 2 } });
    // Bolt passes 1 tile from the stationary reunited pair: through the halo, missing them.
    const bolt = spawnBolt(s, { x: 1, y: 3 }, { x: 4, y: 0 });
    const events = run(s, { seconds: 4 });
    const halo = ofType(events, 'halo').filter((h) => h.projectileId === bolt.id);
    expect(halo.map((h) => h.inside)).toEqual([true, false]);
    // Slows exactly at the visible radius; recovers just outside it (HALO_EXIT_BAND).
    expect(Math.hypot(halo[0]!.at.x - 6, halo[0]!.at.y - 2)).toBeCloseTo(LANTERN.haloRadius, 9);
    expect(Math.hypot(halo[1]!.at.x - 6, halo[1]!.at.y - 2)).toBeCloseTo(LANTERN.haloRadius + HALO_EXIT_BAND, 9);
    // Inside time = (half chord in + half chord out) / slowed speed.
    const half = (r: number): number => Math.sqrt(r * r - 1);
    const inside = (half(LANTERN.haloRadius) + half(LANTERN.haloRadius + HALO_EXIT_BAND)) / (4 * LANTERN.slowFactor);
    expect(halo[1]!.t - halo[0]!.t).toBeCloseTo(inside, 9);
    expect(ofType(events, 'hit')).toHaveLength(0);
  });

  it('grazes are clean: outside never enters, a hair inside enters and leaves once', () => {
    const graze = (offset: number): boolean[] => {
      const s = withRelics(['glass_lantern'], { spawn: { x: 6, y: 2 } });
      const bolt = spawnBolt(s, { x: 1, y: 2 + offset }, { x: 4, y: 0 });
      return ofType(run(s, { seconds: 4 }), 'halo')
        .filter((h) => h.projectileId === bolt.id)
        .map((h) => h.inside);
    };
    // Exactly tangent in floating point may land a hair inside: never more than one balanced pair.
    expect([[], [true, false]]).toContainEqual(graze(LANTERN.haloRadius));
    expect(graze(LANTERN.haloRadius + 0.01)).toEqual([]);
    expect(graze(LANTERN.haloRadius - 0.01)).toEqual([true, false]);
  });

  it('a boosted soul outrunning a slowed bolt makes it chase the halo edge without stalling the step', () => {
    // Regression from fuzzing: Needlesong + Glass Lantern sliding mode on the halo boundary.
    const s = withRelics(['needlesong', 'glass_lantern'], { spawn: { x: 2, y: 2 } }, { tetherCapacity: 12 });
    layRoute(s, [
      { x: 1, y: 3 },
      { x: 1, y: 11 },
    ]);
    s.soul.speedMultiplier = 3;
    s.soul.boostLeft = 1.5;
    // Bolt chasing the soul (6 tiles/s) up its route at 7 tiles/s: faster than the soul at
    // full speed, slower once slowed (3.15 tiles/s).
    spawnBolt(s, { x: 1, y: 1.45 }, { x: 0, y: 7 }, { radius: 0.05 });
    const before = simDiagnostics.iterationOverflows;
    const events = run(s, { seconds: 1.2 });
    expect(simDiagnostics.iterationOverflows).toBe(before);
    const flips = ofType(events, 'halo');
    expect(flips.length).toBeGreaterThan(2);
    for (let i = 1; i < flips.length; i++) expect(flips[i]!.t).toBeGreaterThan(flips[i - 1]!.t);
  });

  it('never affects lanes', () => {
    const lane: LaneDef = { id: 'L', rect: { x: 0, y: 1, w: 12, h: 2 }, period: 10, activeFrom: 0.5, activeTo: 5, warnLead: 0 };
    const s = withRelics(['glass_lantern'], { spawn: { x: 6, y: 2 }, lanes: [lane] });
    const events = run(s, { seconds: 1 });
    expect(ofType(events, 'hit')[0]?.source).toBe('lane');
  });

  it('counterexample: a slowed bolt lingers on the ribbon and can catch a RETURN that the fast bolt would miss', () => {
    // Deterministic search over bolt start positions: some configuration must flip.
    let flipped = false;
    for (let x = 2; x <= 6 && !flipped; x += 0.25) {
      for (let y = 3.5; y <= 6 && !flipped; y += 0.5) {
        const outcome = (loadout: Loadout): number => {
          const s = withRelics(loadout, { spawn: { x: 2, y: 2 } }, { tetherCapacity: 10, soulSpeed: 0.5 });
          layRoute(s, [
            { x: 1.5, y: 2 },
            { x: 8.5, y: 2 },
          ]);
          spawnBolt(s, { x, y }, { x: 0, y: -4 });
          const events = run(s, { first: [ret], seconds: 3 });
          return ofType(events, 'hit').filter((h) => h.endpoint === 'body').length;
        };
        if (outcome([]) === 0 && outcome(['glass_lantern']) === 1) flipped = true;
      }
    }
    expect(flipped).toBe(true);
  });
});

describe('Mourning Bell', () => {
  it('two direct dash kills charge one burst; the next reunion rings it once at the meeting point', () => {
    const s = withRelics(['mourning_bell'], {
      spawn: { x: 2, y: 2 },
      enemies: [sentry('a', 3.2, 2), sentry('b', 4.4, 2), sentry('near', 5.5, 3.2), sentry('far', 10, 10)],
    });
    const events = run(s, { first: [dash(3, 0)], seconds: 3, until: (e) => e.type === 'reunion' });
    expect(ofType(events, 'bellCharge').map((e) => [e.kills, e.charged])).toEqual([
      [1, false],
      [0, true],
    ]);
    const burst = ofType(events, 'bellBurst');
    expect(burst).toHaveLength(1);
    const reunion = ofType(events, 'reunion')[0]!;
    expect(burst[0]!.at).toEqual(reunion.at);
    const killedKeys = burst[0]!.killed.map((id) => s.enemies.find((e) => e.id === id)!.key);
    expect(killedKeys).toEqual(['near']);
    // Burst kills never recharge.
    expect(s.relicState!.bellCharged).toBe(false);
    expect(s.relicState!.bellKills).toBe(0);
    expect(ofType(events, 'kill').find((k) => s.enemies.find((e) => e.id === k.enemyId)!.key === 'near')?.cause).toBe('burst');
    // The next reunion without new kills rings nothing.
    const again = run(s, { first: [dash(0, 3)], seconds: 3, until: (e) => e.type === 'reunion' });
    expect(ofType(again, 'bellBurst')).toHaveLength(0);
  });

  it('counterexample: reuniting away from enemies wastes the charge', () => {
    const s = withRelics(['mourning_bell'], {
      spawn: { x: 2, y: 2 },
      enemies: [sentry('a', 3.2, 2), sentry('b', 4.4, 2), sentry('far', 10, 10)],
    });
    const events = run(s, { first: [dash(3, 0)], seconds: 3, until: (e) => e.type === 'reunion' });
    expect(ofType(events, 'bellBurst')[0]?.killed).toEqual([]);
    expect(s.relicState!.bellCharged).toBe(false);
  });

  it('empty dash-return cycles never charge it', () => {
    const s = withRelics(['mourning_bell'], { spawn: { x: 2, y: 2 } });
    for (let i = 0; i < 6; i++) {
      run(s, { first: [dash(i % 2 ? -3 : 3, 0)], seconds: 0.4, until: (e) => e.type === 'ready' });
      run(s, { first: [ret], seconds: 1, until: (e) => e.type === 'reunion' });
    }
    expect(s.relicState!.bellKills).toBe(0);
    expect(s.relicState!.bellCharged).toBe(false);
  });

  it('a charge carried from the checkpoint rings at the first reunion of the room', () => {
    const s = withRelics(['mourning_bell'], { spawn: { x: 2, y: 2 }, enemies: [sentry('near', 5.6, 2.9)] }, {}, {
      bellKills: 0,
      bellCharged: true,
      knotMarked: false,
    });
    const events = run(s, { first: [dash(3, 0)], seconds: 3, until: (e) => e.type === 'reunion' });
    expect(ofType(events, 'bellBurst')[0]!.killed).toHaveLength(1);
  });

  it('carried charges are clamped to what the loadout holds', () => {
    const s = withRelics([], {}, {}, { bellKills: 7, bellCharged: true, knotMarked: true });
    expect(s.relicState).toMatchObject({ bellKills: 0, bellCharged: false, knotMarked: false });
    const b = withRelics(['mourning_bell'], {}, {}, { bellKills: 7, bellCharged: false, knotMarked: false });
    expect(b.relicState!.bellKills).toBe(BELL.killsPerCharge - 1);
  });
});

describe("Traveler's Knot", () => {
  /** Kill a dormant sentry with one dash, then let the soul reunite at the dash end. */
  function earnAndPlace(extra: EnemySpawn[] = []): SimState {
    const s = withRelics(['travelers_knot'], {
      spawn: { x: 2, y: 2 },
      enemies: [sentry('prey', 3.5, 2), ...extra],
    });
    const events = run(s, { first: [dash(3, 0)], seconds: 3, until: (e) => e.type === 'decoyPlaced' });
    expect(ofType(events, 'knotMarked')).toHaveLength(1);
    expect(ofType(events, 'decoyPlaced')[0]!.at).toEqual(ofType(events, 'reunion')[0]!.at);
    return s;
  }

  it('a dash kill earns a mark that becomes a decoy at the meeting point', () => {
    const s = earnAndPlace();
    expect(s.relicState!.decoy?.pos).toEqual(s.body.pos);
    expect(s.relicState!.knotMarked).toBe(false);
  });

  it('the next new aim acquisition takes the decoy and is consumed at lock; the locked line stays', () => {
    const s = earnAndPlace([sentry('shooter', 9, 8, { wake: { kind: 'time', seconds: 1.5 } })]);
    const decoyAt = s.relicState!.decoy!.pos;
    // Walk the body away so the decoy and body are clearly different targets.
    run(s, { first: [dash(0, 3)], seconds: 0.4, until: (e) => e.type === 'ready' });
    const events = run(s, { seconds: 6, until: (e) => e.type === 'fire' });
    expect(ofType(events, 'decoyClaimed')).toHaveLength(1);
    const consumed = ofType(events, 'decoyConsumed')[0]!;
    expect(consumed.at).toEqual(decoyAt);
    const lock = ofType(events, 'telegraph').find((e) => e.phase === 'locked')!;
    expect(lock.t).toBe(consumed.t);
    const fire = ofType(events, 'fire')[0]!;
    const bolt = s.projectiles.find((p) => p.id === fire.projectileId)!;
    expect(bolt.aimPoint).toEqual(decoyAt);
    expect(s.relicState!.decoy).toBeNull();
  });

  it('an existing lock never retargets onto a new decoy', () => {
    const s = withRelics(['travelers_knot'], {
      spawn: { x: 2, y: 2 },
      enemies: [sentry('prey', 3.5, 2), sentry('shooter', 9, 8, { dormant: false, phase: 1.7 - 0.4 })],
    });
    // Shooter locks at ~1.3 s; the decoy is placed later, at the reunion.
    run(s, { seconds: 1.4, until: (e) => e.type === 'telegraph' && e.phase === 'locked' });
    const shooter = s.enemies.find((e) => e.key === 'shooter')!;
    expect(shooter.phase).toBe('locked');
    const locked = shooter.lockTarget;
    const events = run(s, { first: [dash(3, 0)], seconds: 3, until: (e) => e.type === 'fire' });
    expect(shooter.lockTarget === null || shooter.lockTarget === locked).toBe(true);
    const fire = ofType(events, 'fire')[0]!;
    expect(s.projectiles.find((p) => p.id === fire.projectileId)?.aimPoint).toEqual(locked);
  });

  it('empty loops grant no decoy, and at most one mark or decoy exists', () => {
    const empty = withRelics(['travelers_knot'], { spawn: { x: 2, y: 2 } });
    run(empty, { first: [dash(3, 0)], seconds: 3, until: (e) => e.type === 'reunion' });
    expect(empty.relicState!.decoy).toBeNull();
    expect(empty.relicState!.knotMarked).toBe(false);

    const two = withRelics(['travelers_knot'], {
      spawn: { x: 2, y: 2 },
      enemies: [sentry('a', 3.2, 2), sentry('b', 4.4, 2)],
    });
    const events = run(two, { first: [dash(3, 0)], seconds: 3, until: (e) => e.type === 'decoyPlaced' });
    expect(ofType(events, 'knotMarked')).toHaveLength(1);
    expect(ofType(events, 'decoyPlaced')).toHaveLength(1);
    // While a decoy is down, more kills earn nothing.
    const more = withRelics(['travelers_knot'], {
      spawn: { x: 2, y: 2 },
      enemies: [sentry('a', 3.5, 2), sentry('c', 5, 5)],
    });
    run(more, { first: [dash(3, 0)], seconds: 3, until: (e) => e.type === 'decoyPlaced' });
    const kill2 = run(more, { first: [dash(0, 3)], seconds: 0.4 });
    expect(ofType(kill2, 'kill')).toHaveLength(1);
    expect(ofType(kill2, 'knotMarked')).toHaveLength(0);
  });

  it('a claimer killed before it locks releases the decoy for the next acquisition', () => {
    const s = earnAndPlace([sentry('shooter', 5, 4.2, { wake: { kind: 'time', seconds: 0.9 } })]);
    run(s, { seconds: 3, until: (e) => e.type === 'decoyClaimed' });
    expect(s.relicState!.decoy?.claimedBy).not.toBeNull();
    // Kill the tracking claimer before it locks.
    const shooter = s.enemies.find((e) => e.key === 'shooter')!;
    const aim = { x: shooter.pos.x - s.body.pos.x, y: shooter.pos.y - s.body.pos.y };
    const events = run(s, { first: [{ kind: 'dash', aim }], seconds: 0.3 });
    expect(ofType(events, 'kill')).toHaveLength(1);
    expect(s.relicState!.decoy?.claimedBy ?? null).toBeNull();
  });
});

describe('relic determinism', () => {
  it('relic runs are reproducible', () => {
    const runOnce = (): string => {
      const s = withRelics(['mourning_bell', 'travelers_knot'], {
        spawn: { x: 2, y: 2 },
        enemies: [sentry('a', 3.2, 2), sentry('b', 4.4, 2)],
      });
      const before = JSON.stringify(s.relicState);
      const out: string[] = [];
      for (let i = 0; i < 360; i++) out.push(...step(s, i === 0 ? [dash(3, 0)] : []).map((e) => e.type));
      expect(before).not.toBe(JSON.stringify(s.relicState));
      return out.join(',') + JSON.stringify(s.relicState);
    };
    expect(runOnce()).toBe(runOnce());
  });
});
