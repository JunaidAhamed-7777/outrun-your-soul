import { describe, expect, it } from 'vitest';
import { LAST_WARDEN_ARENA } from '../../src/content/rooms/last-warden';
import { simHooksFor } from '../../src/run/relics';
import { checkInvariants, createSim, TUNING } from '../../src/sim';
import { BOSS_TUNING, heartVulnerable } from '../../src/sim/boss';
import type { BossSpawn, RoomDef, SimEvent, SimState } from '../../src/sim/types';
import { hunter } from './boss-hunter';
import { makeRoom, ofType, step } from './helpers';

const BOSS: BossSpawn = { id: 'lw', at: { x: 6, y: 9 }, facing: { x: 0, y: -1 } };
const OPEN: RoomDef = {
  ...makeRoom({ width: 12, height: 12, spawn: { x: 6, y: 2 }, exit: { x: 5, y: 11, w: 2, h: 1 } }),
  boss: BOSS,
};

function untilBoss(s: SimState, phase: string, seconds = 8): void {
  for (let i = 0; i < seconds * 120 && s.boss!.phase !== phase && s.outcome === 'playing'; i++) step(s);
}

/** Separate the pair so the soul reaches the body at `at` almost at once (exhaustion reunion). */
function reuniteSoonAt(s: SimState, at: { x: number; y: number }): void {
  const soul = { x: at.x - 0.3, y: at.y };
  s.route.points = [soul, at];
  s.route.length = 0.3;
  s.soul.pos = soul;
  s.body.pos = at;
  s.body.mode = 'ready';
  s.body.dash = null;
  s.body.recoverLeft = 0;
  s.contactArmed = false;
  s.gate = 'sealed';
}

describe('Mourning Bell against the Last Warden', () => {
  it('a burst covering the trailing heart counts as exactly one heart strike, and charges nothing', () => {
    const s = createSim(OPEN, {
      seed: 1,
      relics: simHooksFor(['mourning_bell']),
      charges: { bellKills: 0, bellCharged: true, knotMarked: false },
    });
    untilBoss(s, 'recover');
    const b = s.boss!;
    expect(heartVulnerable(b)).toBe(true);
    // Reunite right beside the walking heart.
    const h = b.heart.pos;
    reuniteSoonAt(s, { x: Math.min(11, h.x + 1.2), y: h.y });
    const events: SimEvent[] = [];
    for (let i = 0; i < 60 && !ofType(events, 'burst').length; i++) events.push(...step(s));
    expect(ofType(events, 'burst')).toHaveLength(1);
    const strikes = ofType(events, 'boss').filter((e) => e.what === 'heartHit');
    expect(strikes).toHaveLength(1);
    expect(strikes[0]!.cause).toBe('burst');
    expect(b.hp).toBe(BOSS_TUNING.maxHp - 1);
    expect(b.phase).toBe('stagger');
    expect(b.stage).toBe(1);
    expect(s.relicState!.bellCharged).toBe(false);
    expect(s.relicState!.bellKills).toBe(0);
  });

  it('a burst far from the heart, or while the heart is home, strikes nothing', () => {
    const far = createSim(OPEN, {
      seed: 1,
      relics: simHooksFor(['mourning_bell']),
      charges: { bellKills: 0, bellCharged: true, knotMarked: false },
    });
    untilBoss(far, 'recover');
    const hx = far.boss!.heart.pos.x;
    reuniteSoonAt(far, { x: hx > 6 ? 1.5 : 10.5, y: 1.5 });
    const e1: SimEvent[] = [];
    for (let i = 0; i < 60; i++) e1.push(...step(far));
    expect(ofType(e1, 'burst')).toHaveLength(1);
    expect(ofType(e1, 'boss').filter((e) => e.what === 'heartHit')).toHaveLength(0);

    const home = createSim(OPEN, {
      seed: 1,
      relics: simHooksFor(['mourning_bell']),
      charges: { bellKills: 0, bellCharged: true, knotMarked: false },
    });
    // Dormant-free idle boss: heart is home inside the armour.
    reuniteSoonAt(home, { x: 7.4, y: 9 });
    const e2: SimEvent[] = [];
    for (let i = 0; i < 60; i++) e2.push(...step(home));
    expect(ofType(e2, 'burst')).toHaveLength(1);
    expect(ofType(e2, 'boss').filter((e) => e.what === 'heartHit')).toHaveLength(0);
  });
});

describe('maxHealth', () => {
  it('honours the run cap and validates health against it', () => {
    expect(createSim(OPEN, { seed: 1 }).maxHealth).toBe(TUNING.maxHealth);
    const big = createSim(OPEN, { seed: 1, maxHealth: 7, health: 6 });
    expect([big.maxHealth, big.health]).toEqual([7, 6]);
    const over = createSim(OPEN, { seed: 1, maxHealth: 4, health: 9 });
    expect([over.maxHealth, over.health]).toEqual([4, 4]);
    const full = createSim(OPEN, { seed: 1, maxHealth: 6 });
    expect(full.health).toBe(6);
    const bad = createSim(OPEN, { seed: 1, maxHealth: Number.NaN, health: 2 });
    expect([bad.maxHealth, bad.health]).toEqual([TUNING.maxHealth, 2]);
    expect(checkInvariants(big)).toEqual([]);
  });
});

describe('boss room flow', () => {
  /** Content arena geometry with the boss added; escorts stay dormant so the test isolates flow. */
  const ARENA: RoomDef = {
    ...LAST_WARDEN_ARENA,
    enemies: LAST_WARDEN_ARENA.enemies.map((e) => ({ ...e, dormant: true, wake: undefined })),
    boss: { id: 'lw', at: { x: 4, y: 9.4 } },
  };

  it('ends like every room: defeat shatters escorts, clears the room, and victory needs the reunited pair in the exit', () => {
    const s = createSim(ARENA, { seed: 5 });
    const events: SimEvent[] = [];
    for (let i = 0; i < 240 * 120 && s.outcome === 'playing'; i++) {
      const cmd = i % 30 === 0 ? hunter(s) : null;
      events.push(...step(s, cmd ? [cmd] : []));
    }
    expect(s.outcome).toBe('victory');
    const defeated = ofType(events, 'boss').find((e) => e.what === 'defeated')!;
    expect(defeated).toBeDefined();
    // Every escort shattered at the same instant, without waking anything or charging relics.
    const collapse = ofType(events, 'kill').filter((k) => k.cause === 'collapse');
    expect(collapse).toHaveLength(ARENA.enemies.length);
    for (const k of collapse) expect(k.t).toBe(defeated.t);
    expect(ofType(events, 'wake')).toHaveLength(0);
    const cleared = ofType(events, 'roomCleared');
    expect(cleared).toHaveLength(1);
    expect(cleared[0]!.t).toBe(defeated.t);
    const firstGate = ofType(events, 'gate').find((g) => g.t >= defeated.t)!;
    expect(firstGate.status === 'ready' || firstGate.status === 'open').toBe(true);
    // Victory came only once the reunited pair stood in the exit.
    const victory = ofType(events, 'victory')[0]!;
    const lastReunion = ofType(events, 'reunion').filter((r) => r.t <= victory.t).pop()!;
    expect(lastReunion).toBeDefined();
    expect(s.route.points).toEqual([]);
    const exit = s.room.exit;
    expect(s.body.pos.x).toBeGreaterThanOrEqual(exit.x);
    expect(s.body.pos.x).toBeLessThanOrEqual(exit.x + exit.w);
    expect(s.body.pos.y).toBeGreaterThanOrEqual(exit.y);
  });

  it('the gate refuses a separated body after the boss falls', () => {
    const s = createSim(OPEN, { seed: 1 });
    s.boss!.hp = 0;
    s.boss!.phase = 'dead';
    // Body in the exit, soul still walking up to it.
    s.route.points = [
      { x: 6, y: 7 },
      { x: 6, y: 11.5 },
    ];
    s.route.length = 4.5;
    s.soul.pos = { x: 6, y: 7 };
    s.body.pos = { x: 6, y: 11.5 };
    s.contactArmed = true;
    const first = step(s);
    expect(ofType(first, 'roomCleared')).toHaveLength(1);
    expect(ofType(first, 'gate')[0]?.status).toBe('ready');
    expect(s.outcome).toBe('playing');
    const later: SimEvent[] = [];
    for (let i = 0; i < 600 && s.outcome === 'playing'; i++) later.push(...step(s));
    expect(s.outcome).toBe('victory');
    expect(ofType(later, 'reunion')[0]!.t).toBeLessThanOrEqual(ofType(later, 'victory')[0]!.t);
  });
});
