import { describe, expect, it } from 'vitest';
import { DEPARTURE_COURT } from '../../src/content/rooms';
import { checkInvariants, createSim, previewDash, previewReturn, stepSim } from '../../src/sim';
import { nextRandom, seedRng } from '../../src/sim/rng';
import { simDiagnostics } from '../../src/sim/step';
import type { Command, RoomDef, SimEvent } from '../../src/sim/types';
import { makeRoom } from './helpers';

const ARENA: RoomDef = makeRoom({
  width: 9,
  height: 13,
  spawn: { x: 4.5, y: 1.5 },
  walls: [
    { x: 2, y: 4, w: 2, h: 1 },
    { x: 6, y: 6, w: 1, h: 3 },
    { x: 1, y: 9, w: 3, h: 1 },
  ],
  exit: { x: 3, y: 12, w: 3, h: 1 },
  enemies: [
    { id: 'n1', role: 'needler', at: { x: 7.5, y: 3 } },
    { id: 'k1', role: 'keeper', at: { x: 1.5, y: 7 }, phase: 0.8 },
    { id: 'n2', role: 'needler', at: { x: 4.5, y: 11 }, phase: 1.3 },
    { id: 'n3', role: 'needler', at: { x: 8, y: 11.5 }, dormant: true, wake: { kind: 'separated' } },
  ],
  lanes: [
    { id: 'beam', rect: { x: 0, y: 7, w: 5, h: 1 }, period: 3, activeFrom: 1.2, activeTo: 2.2, warnLead: 0.7 },
    { id: 'col', rect: { x: 7, y: 0, w: 1, h: 13 }, period: 4.5, activeFrom: 2, activeTo: 3.5, warnLead: 1, phase: 1 },
  ],
});

function fuzz(room: RoomDef, seed: number, steps: number): { events: SimEvent[]; violations: string[] } {
  const rng = { rng: seedRng(seed) };
  const s = createSim(room, { seed });
  const events: SimEvent[] = [];
  const violations: string[] = [];
  for (let i = 0; i < steps; i++) {
    let cmd: Command | null = null;
    const roll = nextRandom(rng);
    if (roll < 0.06) {
      const angle = nextRandom(rng) * Math.PI * 2;
      const length = nextRandom(rng) * 4.2;
      cmd = { kind: 'dash', aim: { x: Math.cos(angle) * length, y: Math.sin(angle) * length } };
    } else if (roll < 0.075) {
      cmd = { kind: 'return' };
    }
    if (roll > 0.97) {
      // Previews must never mutate state.
      const before = JSON.stringify(s.route) + JSON.stringify(s.body) + s.time;
      previewDash(s, { x: nextRandom(rng) * 4 - 2, y: nextRandom(rng) * 4 - 2 });
      previewReturn(s);
      const after = JSON.stringify(s.route) + JSON.stringify(s.body) + s.time;
      if (before !== after) violations.push(`tick ${s.tick}: preview mutated state`);
    }
    const ev = stepSim(s, cmd ? [cmd] : []);
    events.push(...ev);
    for (let k = 1; k < ev.length; k++) {
      if (ev[k]!.t < ev[k - 1]!.t - 1e-12) violations.push(`tick ${s.tick}: events out of time order`);
    }
    for (const v of checkInvariants(s)) violations.push(`seed ${seed} tick ${s.tick}: ${v}`);
    if (violations.length > 5) break;
    if (s.outcome !== 'playing') {
      // Restart the room to keep exploring (Continue restarts this room).
      Object.assign(s, createSim(room, { seed: seed + i }));
    }
  }
  return { events, violations };
}

describe('seeded fuzz: invariants hold after every step', () => {
  const overflowsBefore = simDiagnostics.iterationOverflows;

  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`arena with lanes, walls and all sentry roles (seed ${seed})`, () => {
      const { events, violations } = fuzz(ARENA, seed, 4000);
      expect(violations).toEqual([]);
      // The fuzz actually exercised the interesting paths.
      const types = new Set(events.map((e) => e.type));
      for (const t of ['dashStart', 'reunion', 'fire', 'lane']) expect(types.has(t as SimEvent['type'])).toBe(true);
    });
  }

  for (const seed of [11, 12, 13]) {
    it(`Departure Court (seed ${seed})`, () => {
      const { violations } = fuzz(DEPARTURE_COURT, seed, 4000);
      expect(violations).toEqual([]);
    });
  }

  it('never overflowed the per-step event budget', () => {
    expect(simDiagnostics.iterationOverflows).toBe(overflowsBefore);
  });
});
