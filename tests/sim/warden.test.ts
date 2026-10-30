import { describe, expect, it } from 'vitest';
import { validateRoom } from '../../src/content/rooms';
import { checkInvariants, createSim, ENEMY_TUNING, previewDash, stepSim, TUNING } from '../../src/sim';
import { angleBetween } from '../../src/sim/enemies';
import { nextRandom, seedRng } from '../../src/sim/rng';
import { simDiagnostics } from '../../src/sim/step';
import type { Command, EnemySpawn } from '../../src/sim/types';
import { dash, expectClose, makeRoom, makeSim, ofType, run, separatedFixture } from './helpers';

const W = ENEMY_TUNING.warden;

/** A warden at (6, 6) facing the body below it, cooldown nearly elapsed when `soon`. */
const warden = (extra: Partial<EnemySpawn> = {}): EnemySpawn => ({
  id: 'w',
  role: 'warden',
  at: { x: 6, y: 6 },
  facing: { x: 0, y: -1 },
  ...extra,
});

describe('warden guard', () => {
  it('a frontal dash is stopped at contact, unhurt, exactly where the preview said', () => {
    const s = makeSim({ spawn: { x: 6, y: 3.5 }, enemies: [warden()] });
    const aim = { x: 0, y: 3 };
    const p = previewDash(s, aim);
    expect(p.limitedBy).toBe('guard');
    const events = run(s, { first: [dash(aim.x, aim.y)], seconds: 0.4, until: (e) => e.type === 'dashEnd' });
    const guarded = ofType(events, 'guarded')[0]!;
    const end = ofType(events, 'dashEnd')[0]!;
    expect(end.reason).toBe('guarded');
    expectClose(end.at, guarded.at, 12);
    expectClose(end.at, p.end, 12);
    expect(Math.hypot(end.at.x - 6, end.at.y - 6)).toBeCloseTo(TUNING.bodyRadius + W.radius, 9);
    expect(ofType(events, 'kill')).toHaveLength(0);
    expect(ofType(events, 'hit')).toHaveLength(0);
    expect(s.enemies[0]!.phase).not.toBe('dead');
    expect(s.body.mode).toBe('recover');
  });

  it('a body resting against the guard can dash away', () => {
    const s = makeSim({ spawn: { x: 6, y: 3.5 }, enemies: [warden()] });
    run(s, { first: [dash(0, 3)], seconds: 0.6, until: (e) => e.type === 'ready' });
    const events = run(s, { first: [dash(-3, -1)], seconds: 0.4 });
    expect(ofType(events, 'dashEnd')[0]?.reason).toBe('arrived');
  });

  it('an off-angle (flank) dash kills', () => {
    const s = makeSim({ spawn: { x: 3, y: 6.4 }, enemies: [warden()] });
    // Strike from the west: 90 degrees off its southward facing.
    const events = run(s, { first: [dash(3, -0.2)], seconds: 0.4 });
    expect(ofType(events, 'kill')).toHaveLength(1);
    expect(ofType(events, 'guarded')).toHaveLength(0);
  });

  it('the guard boundary sits at the tuned half-angle', () => {
    const angleOf = (deg: number): boolean => {
      const a = (deg * Math.PI) / 180;
      // Approach direction from the warden's point of view: facing is (0,-1).
      const from = { x: 6 + Math.sin(a) * 2.5, y: 6 - Math.cos(a) * 2.5 };
      // Dormant wardens do not turn, isolating the arc itself.
      const s = makeSim({ spawn: from, enemies: [warden({ dormant: true })] });
      const events = run(s, { first: [dash(6 - from.x, 6 - from.y)], seconds: 0.4 });
      return ofType(events, 'guarded').length === 1;
    };
    const half = (W.guardHalfAngle * 180) / Math.PI;
    expect(angleOf(half - 3)).toBe(true);
    expect(angleOf(half + 3)).toBe(false);
  });
});

describe('warden sweep and opening', () => {
  it('telegraphs a frozen sector, sweeps once, then is exposed to any-angle kills', () => {
    const s = makeSim({ spawn: { x: 6, y: 3.5 }, enemies: [warden({ phase: W.cooldown - 0.05 })] });
    const wind = run(s, { seconds: 0.2, until: (e) => e.type === 'telegraph' });
    expect(ofType(wind, 'telegraph')[0]?.phase).toBe('locked');
    const facingAtLock = s.enemies[0]!.facing;
    // The body steps aside during the windup: the sector does not follow it.
    run(s, { first: [dash(-2.8, 0)], seconds: 0.4 });
    expect(s.enemies[0]!.facing).toEqual(facingAtLock);
    const sweep = run(s, { seconds: 1.2, until: (e) => e.type === 'sweep' });
    expect(ofType(sweep, 'sweep')).toHaveLength(1);
    expect(s.enemies[0]!.phase).toBe('exposed');
    // Gather the soul first (a dash past it would end as a contact reunion instead).
    run(s, { seconds: 0.5, until: (e) => e.type === 'reunion' });
    expect(s.enemies[0]!.phase).toBe('exposed');
    // Frontal dash during the opening kills.
    const strike = run(s, { first: [dash(6 - s.body.pos.x, 6 - s.body.pos.y)], seconds: 0.5 });
    expect(ofType(strike, 'kill')).toHaveLength(1);
  });

  it('the sweep damages endpoints inside it once per activation (shared health dedup)', () => {
    // Body and soul both inside the frozen sector below the warden.
    const s = separatedFixture(
      { enemies: [warden({ phase: W.cooldown - 0.01 })] },
      [
        { x: 5.2, y: 4.4 },
        { x: 6.8, y: 4.4 },
      ],
      { soulSpeed: 0.01 },
    );
    const events = run(s, { seconds: W.windup + 0.2, until: (e) => e.type === 'sweep' });
    const sweep = ofType(events, 'sweep')[0]!;
    const hits = ofType(events, 'hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.source).toBe('sweep');
    expect(hits[0]!.attackId).toBe(sweep.attackId);
    expect(ofType(events, 'shielded').map((e) => e.reason)).toEqual(['spent']);
    expect(s.health).toBe(s.maxHealth - 1);
  });

  it('endpoints outside the sector are untouched; a dashing body is protected', () => {
    const outside = makeSim({ spawn: { x: 6, y: 9 }, enemies: [warden({ phase: W.cooldown - 0.01 })] });
    // Body behind the warden: it turns at most turnRate x windup... but the sector is frozen at lock.
    const e1 = run(outside, { seconds: W.windup + 0.2, until: (e) => e.type === 'sweep' });
    expect(ofType(e1, 'hit')).toHaveLength(0);

    const s = makeSim({ spawn: { x: 6, y: 4.6 }, enemies: [warden({ phase: W.cooldown - 0.01 })] });
    run(s, { seconds: W.windup - 0.05 });
    // Dash across the sector so the body is mid-dash at the sweep instant.
    const events = run(s, { first: [dash(3, 0)], seconds: 0.3 });
    expect(ofType(events, 'sweep')).toHaveLength(1);
    expect(ofType(events, 'shielded').some((e) => e.endpoint === 'body' && e.reason === 'dash')).toBe(true);
    // The soul left behind at the spawn is inside the sector and is not protected.
    expect(ofType(events, 'hit')[0]?.endpoint).toBe('soul');
  });

  it('each activation has a fresh attack ID, so a later sweep damages again', () => {
    const s = makeSim({ spawn: { x: 6, y: 4.6 }, enemies: [warden({ phase: W.cooldown - 0.01 })] });
    const events = run(s, { seconds: 2 * (W.windup + W.exposed + W.cooldown) + 0.5 });
    const sweeps = ofType(events, 'sweep');
    expect(sweeps.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sweeps.map((e) => e.attackId)).size).toBe(sweeps.length);
    expect(ofType(events, 'hit').length).toBe(sweeps.length);
  });
});

describe('warden turning', () => {
  it('turns toward the body no faster than its turn rate, so flanking works', () => {
    const s = makeSim({ spawn: { x: 6, y: 3.5 }, enemies: [warden({ phase: -5 })] });
    run(s, { first: [dash(-3, 2.5)], seconds: 0.2 });
    const before = s.enemies[0]!.facing;
    run(s, { seconds: 0.25 });
    const after = s.enemies[0]!.facing;
    expect(angleBetween(before, after)).toBeLessThanOrEqual(W.turnRate * 0.25 + 1e-9);
    expect(angleBetween(before, after)).toBeGreaterThan(0);
  });

  it('a dash to its side then a novice-timed strike beats the turn and kills', () => {
    const s = makeSim({ spawn: { x: 6, y: 3.6 }, enemies: [warden({ phase: -5 })] });
    // Swing out beside it (about 90 degrees off its facing)...
    run(s, { first: [dash(1.97, 2.75)], seconds: 0.5, until: (e) => e.type === 'ready' });
    // ...aim for a novice 0.4 s while it turns, then strike.
    run(s, { seconds: 0.4 });
    const w = s.enemies[0]!;
    const events = run(s, { first: [dash(w.pos.x - s.body.pos.x, w.pos.y - s.body.pos.y)], seconds: 0.4 });
    expect(ofType(events, 'guarded')).toHaveLength(0);
    expect(ofType(events, 'kill')).toHaveLength(1);
  });

  it('a slow frontal approach is met by the guard', () => {
    const s = makeSim({ spawn: { x: 6, y: 3.6 }, enemies: [warden({ phase: -5 })] });
    run(s, { first: [dash(-0.8, 0)], seconds: 1.5 });
    const w = s.enemies[0]!;
    const events = run(s, { first: [dash(w.pos.x - s.body.pos.x, w.pos.y - s.body.pos.y)], seconds: 0.4 });
    expect(ofType(events, 'guarded')).toHaveLength(1);
  });
});

describe('warden content and robustness', () => {
  it('the room validator accepts wardens', () => {
    const room = makeRoom({ width: 8, height: 12, spawn: { x: 4, y: 1.5 }, exit: { x: 3, y: 11, w: 2, h: 1 }, enemies: [warden()] });
    expect(validateRoom(room)).toEqual([]);
  });

  it('fuzz: invariants hold with wardens, sentries and lanes together', () => {
    const room = makeRoom({
      width: 9,
      height: 13,
      spawn: { x: 4.5, y: 1.5 },
      walls: [{ x: 2, y: 4, w: 2, h: 1 }],
      exit: { x: 3, y: 12, w: 3, h: 1 },
      enemies: [
        warden({ id: 'w1', at: { x: 4.5, y: 7 } }),
        warden({ id: 'w2', at: { x: 7.5, y: 10 }, phase: 1 }),
        { id: 'k', role: 'keeper', at: { x: 1.5, y: 10 } },
      ],
      lanes: [{ id: 'l', rect: { x: 0, y: 9, w: 3, h: 1 }, period: 3, activeFrom: 1, activeTo: 2, warnLead: 0.5 }],
    });
    const before = simDiagnostics.iterationOverflows;
    for (const seed of [31, 32, 33]) {
      const rng = { rng: seedRng(seed) };
      let s = createSim(room, { seed });
      for (let i = 0; i < 4000; i++) {
        const roll = nextRandom(rng);
        let cmd: Command | null = null;
        if (roll < 0.07) {
          const a = nextRandom(rng) * Math.PI * 2;
          const l = nextRandom(rng) * 4;
          cmd = { kind: 'dash', aim: { x: Math.cos(a) * l, y: Math.sin(a) * l } };
        } else if (roll < 0.085) cmd = { kind: 'return' };
        stepSim(s, cmd ? [cmd] : []);
        expect(checkInvariants(s)).toEqual([]);
        if (s.outcome !== 'playing') s = createSim(room, { seed: seed + i });
      }
    }
    expect(simDiagnostics.iterationOverflows).toBe(before);
  });
});
