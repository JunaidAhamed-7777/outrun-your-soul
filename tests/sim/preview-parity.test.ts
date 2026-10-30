/**
 * Previews forecast on a reduced copy (only what can change movement). This fuzz checks
 * the reduction never changes the answer: in busy rooms (sentries, bolts, lanes, wardens,
 * the boss, relics), every dash and RETURN preview equals what full execution then does.
 */
import { describe, expect, it } from 'vitest';
import { LAST_PLATFORM_WARDEN } from '../../src/content/rooms';
import { LAST_WARDEN_ARENA } from '../../src/content/rooms/last-warden';
import { simHooksFor, type Loadout } from '../../src/run/relics';
import { cloneState, createSim, previewDash, previewReturn, stepSim } from '../../src/sim';
import { nextRandom, seedRng } from '../../src/sim/rng';
import type { Command, RoomDef, SimEvent, SimState } from '../../src/sim/types';
import { hunter } from './boss-hunter';

const ROOMS: [string, RoomDef, Loadout][] = [
  ['boss arena, lantern + needlesong', { ...LAST_WARDEN_ARENA, boss: { id: 'lw', at: { x: 4, y: 9.4 } } }, ['glass_lantern', 'needlesong']],
  ['boss arena, bell + knot', { ...LAST_WARDEN_ARENA, boss: { id: 'lw', at: { x: 4, y: 9.4 } } }, ['mourning_bell', 'travelers_knot']],
  ['warden platform, needlesong', LAST_PLATFORM_WARDEN, ['needlesong']],
];

/** Execute a command on a full copy until `done` sees an event; null if the run ended first. */
function execute(state: SimState, cmd: Command, done: (e: SimEvent) => boolean): SimEvent | null {
  const sim = cloneState(state);
  for (let i = 0; i < 400; i++) {
    for (const e of stepSim(sim, i === 0 ? [cmd] : [])) {
      if (e.type === 'rejected' && i === 0) return e;
      if (done(e)) return e;
    }
    if (sim.outcome !== 'playing') return null;
  }
  return null;
}

describe('preview parity with execution in busy rooms', () => {
  for (const [name, room, loadout] of ROOMS) {
    it(name, () => {
      const rng = { rng: seedRng(77) };
      const s = createSim(room, { seed: 4, relics: simHooksFor(loadout) });
      let checked = 0;
      for (let i = 0; i < 70 * 120 && s.outcome === 'playing'; i++) {
        if (i % 9 === 0) {
          const a = nextRandom(rng) * Math.PI * 2;
          const l = 0.5 + nextRandom(rng) * 3;
          const aim = { x: Math.cos(a) * l, y: Math.sin(a) * l };
          const p = previewDash(s, aim);
          // The command's own dash: a dash already in flight may end first.
          let started = false;
          const end = execute(s, { kind: 'dash', aim }, (e) => {
            if (e.type === 'dashStart') started = true;
            return e.type === 'queueExpired' || (started && e.type === 'dashEnd');
          });
          if (end && p.valid) {
            expect(end.type).toBe('dashEnd');
            if (end.type === 'dashEnd') {
              expect(end.at.x).toBeCloseTo(p.end.x, 9);
              expect(end.at.y).toBeCloseTo(p.end.y, 9);
              expect(end.reason === 'contact').toBe(p.limitedBy === 'contact');
              expect(end.reason === 'guarded').toBe(p.limitedBy === 'guard');
            }
            checked++;
          }
          if (s.route.points.length > 0) {
            const r = previewReturn(s);
            const meet = execute(s, { kind: 'return' }, (e) => e.type === 'reunion');
            if (meet && meet.type === 'reunion' && r.valid) {
              expect(meet.at.x).toBeCloseTo(r.meetAt!.x, 9);
              expect(meet.at.y).toBeCloseTo(r.meetAt!.y, 9);
              checked++;
            }
          }
        }
        const cmd = i % 30 === 0 ? hunter(s) : null;
        stepSim(s, cmd ? [cmd] : []);
      }
      expect(checked).toBeGreaterThan(100);
    });
  }
});
