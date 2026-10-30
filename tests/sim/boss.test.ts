import { describe, expect, it } from 'vitest';
import { LAST_WARDEN_ARENA } from '../../src/content/rooms/last-warden';
import { simHooksFor } from '../../src/run/relics';
import { checkInvariants, createSim, stepSim } from '../../src/sim';
import { BOSS_TUNING, heartVulnerable } from '../../src/sim/boss';
import { nextRandom, seedRng } from '../../src/sim/rng';
import { simDiagnostics } from '../../src/sim/step';
import type { BossSpawn, Command, RoomDef, SimEvent, SimState } from '../../src/sim/types';
import { hunter } from './boss-hunter';
import { dash, makeRoom, ofType, run, step } from './helpers';

const BOSS: BossSpawn = { id: 'lw', at: { x: 6, y: 9 }, facing: { x: 0, y: -1 } };

function arena(spec: Partial<RoomDef> = {}): RoomDef {
  return { ...makeRoom({ width: 12, height: 12, spawn: { x: 6, y: 2 }, exit: { x: 5, y: 11, w: 2, h: 1 } }), boss: BOSS, ...spec };
}

function layRoute(s: SimState, points: { x: number; y: number }[]): void {
  s.route.points = points.slice();
  s.route.length = points.slice(1).reduce((a, q, i) => a + Math.hypot(q.x - points[i]!.x, q.y - points[i]!.y), 0);
  s.soul.pos = points[0]!;
  s.body.pos = points[points.length - 1]!;
  s.contactArmed = true;
  s.gate = 'sealed';
}

const bossEvents = (events: SimEvent[], what: string) =>
  ofType(events, 'boss').filter((e) => e.what === what);

/** Run until the boss reaches `phase` (or give up). */
function until(s: SimState, phase: string, seconds = 8): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < seconds * 120 && s.boss!.phase !== phase && s.outcome === 'playing'; i++) out.push(...step(s));
  return out;
}



describe('Last Warden: charge pattern', () => {
  it('telegraphs a frozen two-leg route toward the body then the soul, and runs it exactly', () => {
    const s = createSim(arena(), { seed: 1 });
    const events = until(s, 'aimCharge');
    const tele = bossEvents(events, 'telegraph')[0]!;
    expect(tele.pattern).toBe('charge');
    const path = tele.path!;
    expect(path.length).toBe(3);
    // First leg heads at the body.
    const d1 = { x: path[1]!.x - path[0]!.x, y: path[1]!.y - path[0]!.y };
    const toBody = { x: s.body.pos.x - path[0]!.x, y: s.body.pos.y - path[0]!.y };
    expect((d1.x * toBody.x + d1.y * toBody.y) / (Math.hypot(d1.x, d1.y) * Math.hypot(toBody.x, toBody.y))).toBeCloseTo(1, 9);
    // The body walks away during the telegraph; the route does not follow.
    run(s, { first: [dash(-3, 0)], seconds: 0.3 });
    expect(s.boss!.path).toEqual(path);
    const charge = until(s, 'recover');
    expect(bossEvents(charge, 'charge')).toHaveLength(1);
    expect(s.boss!.body.pos).toEqual(path[2]);
  });

  it('the heart trails the charge along the boss route and walks it home: the opening', () => {
    const s = createSim(arena(), { seed: 1 });
    until(s, 'charge');
    run(s, { seconds: 0.2 });
    const b = s.boss!;
    expect(heartVulnerable(b)).toBe(true);
    expect(b.route.points[0]).toEqual(b.heart.pos);
    expect(b.route.points[b.route.points.length - 1]).toEqual(b.body.pos);
    expect(Math.hypot(b.heart.pos.x - BOSS.at.x, b.heart.pos.y - BOSS.at.y)).toBeCloseTo(BOSS_TUNING.heartSpeed * (b.phaseTime), 6);
    const home = until(s, 'idle', 10);
    expect(bossEvents(home, 'reunited')).toHaveLength(1);
    expect(b.heart.pos).toEqual(b.body.pos);
    expect(heartVulnerable(b)).toBe(false);
  });

  it('the running body damages an endpoint it passes once', () => {
    const s = createSim(arena(), { seed: 1 });
    // The first leg runs straight at the reunited pair standing still.
    const events = until(s, 'recover');
    const hits = ofType(events, 'hit').filter((h) => h.source === 'charge');
    expect(hits).toHaveLength(1);
  });

  it('a dashing body crossing the charge is protected; the soul on its path is not', () => {
    const s = createSim(arena({ boss: { ...BOSS, stages: [['charge']] } }), { seed: 1, params: { soulSpeed: 0.01 } });
    layRoute(s, [
      { x: 6, y: 4.5 },
      { x: 8, y: 6 },
    ]);
    const b = s.boss!;
    b.phase = 'aimCharge';
    b.phaseDuration = BOSS_TUNING.charge.aim;
    b.phaseTime = BOSS_TUNING.charge.aim - 0.01;
    b.path = [BOSS.at, { x: 6, y: 3 }];
    b.attackId = s.nextId++;
    b.chargeTouched = [];
    run(s, { steps: 30 });
    const events = run(s, { first: [dash(-3, 0)], seconds: 1 });
    expect(ofType(events, 'shielded').filter((e) => e.endpoint === 'body' && e.reason === 'dash')).toHaveLength(1);
    const soulHits = ofType(events, 'hit').filter((h) => h.source === 'charge');
    expect(soulHits.map((h) => h.endpoint)).toEqual(['soul']);
  });
});

describe('Last Warden: heart and armour', () => {
  it('a dash into the trailing heart staggers it and advances the stage', () => {
    const s = createSim(arena(), { seed: 3 });
    let hit: SimEvent | undefined;
    for (let i = 0; i < 60 * 120 && !hit; i++) {
      const cmd = i % 30 === 0 ? hunter(s) : null;
      hit = bossEvents(step(s, cmd ? [cmd] : []), 'heartHit')[0];
    }
    expect(hit && hit.type === 'boss' ? hit.hp : null).toBe(BOSS_TUNING.maxHp - 1);
    expect(s.boss!.phase).toBe('stagger');
    expect(s.boss!.stage).toBe(1);
    // Staggered: the heart cannot be struck again until the stagger ends.
    expect(heartVulnerable(s.boss!)).toBe(false);
  });

  it('the armoured body guards every angle, and a home heart cannot be struck', () => {
    for (const from of [
      { x: 6, y: 6.5 },
      { x: 3.5, y: 9 },
      { x: 8.5, y: 9.2 },
      { x: 6, y: 11.3 },
    ]) {
      const s = createSim(arena({ spawn: from, boss: { ...BOSS, dormant: true } }), { seed: 1 });
      const events = run(s, { first: [dash(BOSS.at.x - from.x, BOSS.at.y - from.y)], seconds: 0.4 });
      expect(ofType(events, 'guarded')).toHaveLength(1);
      expect(bossEvents(events, 'heartHit')).toHaveLength(0);
    }
  });
});

describe('Last Warden: fan pattern', () => {
  it('telegraphs three frozen lines led onto the soul and fires three distinct bolts', () => {
    const s = createSim(arena({ boss: { ...BOSS, stages: [['fan']] } }), { seed: 1 });
    const events = until(s, 'aimFan');
    const tele = bossEvents(events, 'telegraph')[0]!;
    expect(tele.pattern).toBe('fan');
    expect(tele.directions).toHaveLength(BOSS_TUNING.fan.bolts);
    const fired = until(s, 'idle');
    const fires = ofType(fired, 'fire');
    expect(fires).toHaveLength(BOSS_TUNING.fan.bolts);
    expect(new Set(fires.map((f) => f.attackId)).size).toBe(BOSS_TUNING.fan.bolts);
  });

  it("a Traveler's Knot decoy takes the fan's aim", () => {
    const s = createSim(arena({ boss: { ...BOSS, stages: [['fan']], dormant: true, wake: { kind: 'time', seconds: 0.5 } } }), {
      seed: 1,
      relics: simHooksFor(['travelers_knot']),
    });
    s.relicState!.decoy = { x: 2, y: 2 };
    const events = until(s, 'aimFan');
    expect(ofType(events, 'decoyTaken')).toHaveLength(1);
    const dirs = s.boss!.fan;
    const centre = dirs[1]!;
    const toDecoy = { x: 2 - s.boss!.body.pos.x, y: 2 - s.boss!.body.pos.y };
    const n = Math.hypot(toDecoy.x, toDecoy.y);
    expect(centre.x * (toDecoy.x / n) + centre.y * (toDecoy.y / n)).toBeCloseTo(1, 9);
  });
});

describe('Last Warden: whole fight', () => {
  it('is winnable: three heart strikes defeat it, the gate opens, both selves leave', () => {
    const s = createSim(arena(), { seed: 3 });
    const events: SimEvent[] = [];
    for (let i = 0; i < 180 * 120 && s.outcome === 'playing'; i++) {
      const cmd = i % 30 === 0 ? hunter(s) : null;
      events.push(...step(s, cmd ? [cmd] : []));
    }
    expect(bossEvents(events, 'heartHit').map((e) => e.hp)).toEqual([2, 1, 0]);
    expect(bossEvents(events, 'defeated')).toHaveLength(1);
    expect(s.outcome).toBe('victory');
    // Stage order followed the tuned table: learned patterns, then the remix.
    const patterns = bossEvents(events, 'telegraph').map((e) => e.pattern);
    expect(patterns[0]).toBe('charge');
  });

  it('the content arena with the boss added validates as geometry and runs cleanly', () => {
    const s = createSim({ ...LAST_WARDEN_ARENA, enemies: [], boss: { id: 'lw', at: { x: 4, y: 9.4 } } }, { seed: 2 });
    for (let i = 0; i < 20 * 120 && s.outcome === 'playing'; i++) {
      const cmd = i % 30 === 0 ? hunter(s) : null;
      step(s, cmd ? [cmd] : []);
    }
    expect(checkInvariants(s)).toEqual([]);
  });

  it('fuzz: invariants hold with the boss, relics and random play', () => {
    const before = simDiagnostics.iterationOverflows;
    for (const seed of [41, 42, 43]) {
      const rng = { rng: seedRng(seed) };
      const room = { ...LAST_WARDEN_ARENA, enemies: [], boss: { id: 'lw', at: { x: 4, y: 9.4 } } };
      let s = createSim(room, { seed, relics: simHooksFor(['glass_lantern', 'mourning_bell']) });
      for (let i = 0; i < 5000; i++) {
        const roll = nextRandom(rng);
        let cmd: Command | null = null;
        if (roll < 0.07) {
          const a = nextRandom(rng) * Math.PI * 2;
          const l = nextRandom(rng) * 4;
          cmd = { kind: 'dash', aim: { x: Math.cos(a) * l, y: Math.sin(a) * l } };
        } else if (roll < 0.085) cmd = { kind: 'return' };
        stepSim(s, cmd ? [cmd] : []);
        const errors = checkInvariants(s);
        if (errors.length) throw new Error(`seed ${seed} tick ${s.tick}: ${errors.join('; ')}`);
        if (s.outcome !== 'playing') s = createSim(room, { seed: seed + i });
      }
    }
    expect(simDiagnostics.iterationOverflows).toBe(before);
  });
});
