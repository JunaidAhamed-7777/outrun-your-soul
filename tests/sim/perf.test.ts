/**
 * Opt-in performance benchmark (timing assertions would be flaky on shared machines).
 * Run: SIM_PERF=1 npx vitest run tests/sim/perf.test.ts   (PowerShell: $env:SIM_PERF='1'; npx vitest run tests/sim/perf.test.ts)
 *
 * States are sampled from a played session; each operation is timed REPS times per state
 * and the per-state median is kept, which filters GC pauses and scheduler noise. A frame
 * at 60 fps runs two 120 Hz sim steps plus one dash preview and one RETURN preview.
 */
import { describe, expect, it } from 'vitest';
import { DEPARTURE_COURT } from '../../src/content/rooms';
import { LAST_WARDEN_ARENA } from '../../src/content/rooms/last-warden';
import { simHooksFor, type Loadout } from '../../src/run/relics';
import { cloneState, createSim, previewDash, previewReturn, stepSim } from '../../src/sim';
import type { RoomDef, SimState } from '../../src/sim/types';
import { hunter } from './boss-hunter';

const REPS = 7;
const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

function timeMedian(fn: () => void): number {
  const ts: number[] = [];
  for (let r = 0; r < REPS; r++) {
    const t0 = performance.now();
    fn();
    ts.push(performance.now() - t0);
  }
  return pct(ts, 0.5);
}

function bench(room: RoomDef, loadout: Loadout): { frame: number[]; summary: string } {
  const s = createSim(room, { seed: 9, relics: simHooksFor(loadout) });
  const samples: SimState[] = [];
  for (let i = 0; i < 90 * 120 && s.outcome === 'playing'; i++) {
    const cmd = i % 30 === 0 ? hunter(s) : null;
    stepSim(s, cmd ? [cmd] : []);
    if (i % 6 === 0) samples.push(cloneState(s));
  }
  const step: number[] = [];
  const dash: number[] = [];
  const ret: number[] = [];
  samples.forEach((st, i) => {
    const a = (i * 2.399) % (Math.PI * 2);
    const aim = { x: Math.cos(a) * 3, y: Math.sin(a) * 3 };
    const copies = Array.from({ length: REPS }, () => cloneState(st));
    let k = 0;
    step.push(timeMedian(() => stepSim(copies[k++]!, [])));
    dash.push(timeMedian(() => previewDash(st, aim)));
    ret.push(timeMedian(() => previewReturn(st)));
  });
  const frame = samples.map((_, i) => 2 * step[i]! + dash[i]! + ret[i]!);
  const f = (xs: number[]): string =>
    `mean ${mean(xs).toFixed(3)} p95 ${pct(xs, 0.95).toFixed(3)} p99 ${pct(xs, 0.99).toFixed(3)} max ${Math.max(...xs).toFixed(3)}`;
  return {
    frame,
    summary: `${samples.length} states | step ${f(step)} | previewDash ${f(dash)} | previewReturn ${f(ret)} | frame ${f(frame)} ms`,
  };
}

describe.runIf(process.env.SIM_PERF === '1')('simulation performance (opt-in)', () => {
  it('worst room stays well under 1 ms of sim + previews per 60 fps frame', () => {
    bench(DEPARTURE_COURT, []); // JIT warm-up
    const boss: RoomDef = { ...LAST_WARDEN_ARENA, boss: { id: 'lw', at: { x: 4, y: 9.4 } } };
    for (const [name, room, loadout] of [
      ['Departure Court, no relics', DEPARTURE_COURT, []],
      ['Boss arena + 5 sentries + lane, Glass Lantern + Needlesong', boss, ['glass_lantern', 'needlesong']],
      ["Boss arena + 5 sentries + lane, Mourning Bell + Traveler's Knot", boss, ['mourning_bell', 'travelers_knot']],
    ] as const) {
      const r = bench(room, loadout);
      console.log(`${name}: ${r.summary}`);
      expect(pct(r.frame, 0.99)).toBeLessThan(1);
    }
  }, 900_000);
});
