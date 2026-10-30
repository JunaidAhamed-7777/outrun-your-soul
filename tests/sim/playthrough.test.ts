import { describe, expect, it } from 'vitest';
import { DEPARTURE_COURT, GLASS_CROSSING } from '../../src/content/rooms';
import { createSim, STEP_SECONDS } from '../../src/sim';
import { simDiagnostics } from '../../src/sim/step';
import type { SimEvent, SimState } from '../../src/sim/types';
import { botCommand } from './bot';
import { ofType, serialise, step } from './helpers';

function playWithBot(state: SimState, maxSeconds: number, thinkEvery = 6): SimEvent[] {
  const all: SimEvent[] = [];
  const maxSteps = Math.round(maxSeconds / STEP_SECONDS);
  for (let i = 0; i < maxSteps && state.outcome === 'playing'; i++) {
    const cmd = i % thinkEvery === 0 ? botCommand(state) : null;
    all.push(...step(state, cmd ? [cmd] : []));
  }
  return all;
}

describe('Departure Court is completable', () => {
  it('a simple greedy bot reaches victory with health to spare', () => {
    const s = createSim(DEPARTURE_COURT, { seed: 42 });
    const events = playWithBot(s, 120);
    expect(s.outcome).toBe('victory');
    expect(ofType(events, 'kill')).toHaveLength(DEPARTURE_COURT.enemies.length);
    expect(ofType(events, 'roomCleared')).toHaveLength(1);
    expect(ofType(events, 'victory')).toHaveLength(1);
    expect(s.health).toBeGreaterThan(0);
    // Victory needed the reunited pair inside the gate.
    expect(s.route.points).toEqual([]);
    expect(simDiagnostics.iterationOverflows).toBe(0);
  });

  it('the gate refuses a body that arrives without its soul', () => {
    const s = createSim(DEPARTURE_COURT, { seed: 1 });
    for (const e of s.enemies) e.phase = 'dead';
    // Body already inside the gate; the soul is still walking the ribbon behind it.
    const pts = [
      { x: 1.5, y: 8.5 },
      { x: 1.5, y: 10.6 },
      { x: 4, y: 11.5 },
    ];
    s.route.points = pts.slice();
    s.route.length = 2.1 + Math.hypot(2.5, 0.9);
    s.soul.pos = pts[0]!;
    s.body.pos = pts[2]!;
    s.contactArmed = true;
    const first = step(s);
    expect(ofType(first, 'gate')[0]?.status).toBe('ready');
    expect(s.outcome).toBe('playing');
    const events: SimEvent[] = [];
    for (let i = 0; i < 600 && s.outcome === 'playing'; i++) events.push(...step(s));
    expect(s.outcome).toBe('victory');
    const reunion = ofType(events, 'reunion')[0]!;
    const open = ofType(events, 'gate').find((g) => g.status === 'open')!;
    const victory = ofType(events, 'victory')[0]!;
    expect(open.t).toBeCloseTo(reunion.t, 12);
    expect(victory.t).toBeGreaterThanOrEqual(reunion.t);
  });
});

describe('Glass Crossing is completable', () => {
  it('the greedy bot (which ignores the lane) still wins, and the lane really threatens', () => {
    const s = createSim(GLASS_CROSSING, { seed: 5 });
    const events = playWithBot(s, 120);
    expect(s.outcome).toBe('victory');
    expect(ofType(events, 'kill')).toHaveLength(GLASS_CROSSING.enemies.length);
    expect(ofType(events, 'lane').length).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('same room, seed and inputs produce identical states and events', () => {
    const runOnce = (): string => {
      const s = createSim(DEPARTURE_COURT, { seed: 7 });
      const events = playWithBot(s, 60, 5);
      return serialise({ s, events });
    };
    expect(runOnce()).toEqual(runOnce());
  });
});
