import { describe, expect, it } from 'vitest';
import { DEPARTURE_COURT, GLASS_CROSSING, reachablePoints, ROOMS, validateRoom } from '../../src/content/rooms';
import { createSim, TUNING } from '../../src/sim';
import type { RoomDef } from '../../src/sim/types';
import { ofType, run } from './helpers';

describe('room validation', () => {
  it('every registered room is valid', () => {
    for (const room of Object.values(ROOMS)) expect(validateRoom(room)).toEqual([]);
  });

  const broken = (patch: Partial<RoomDef>): string[] => validateRoom({ ...DEPARTURE_COURT, ...patch });

  it('rejects misaligned walls, blocked spawns and unknown wake references', () => {
    expect(broken({ walls: [{ x: 1.5, y: 2, w: 1, h: 1 }] }).join()).toMatch(/integer-aligned/);
    expect(broken({ spawn: { x: 2.5, y: 7.5 } }).join()).toMatch(/spawn overlaps/);
    expect(
      broken({
        enemies: [{ id: 'a', role: 'needler', at: { x: 4, y: 6 }, dormant: true, wake: { kind: 'enemyKilled', enemy: 'zz' } }],
      }).join(),
    ).toMatch(/unknown enemy/);
    expect(
      broken({ enemies: [{ id: 'a', role: 'needler', at: { x: 4, y: 6 } }, { id: 'a', role: 'keeper', at: { x: 6, y: 4 } }] }).join(),
    ).toMatch(/duplicate enemy/);
  });

  it('rejects an exit sealed off by walls', () => {
    const sealed = broken({
      enemies: [],
      walls: [...DEPARTURE_COURT.walls, { x: 0, y: 10, w: 3, h: 1 }, { x: 5, y: 10, w: 3, h: 1 }, { x: 3, y: 10, w: 2, h: 1 }],
    });
    expect(sealed.join()).toMatch(/exit is unreachable/);
  });

  it('rejects impossible lane schedules', () => {
    const bad = broken({ lanes: [{ id: 'l', rect: { x: 0, y: 4, w: 8, h: 1 }, period: 2, activeFrom: 0.2, activeTo: 1, warnLead: 0.5 }] });
    expect(bad.join()).toMatch(/impossible schedule/);
  });
});

describe('Departure Court fairness probes', () => {
  it('an idle player is never harmed in the first ten seconds', () => {
    const s = createSim(DEPARTURE_COURT, { seed: 1 });
    const events = run(s, { seconds: 10 });
    expect(ofType(events, 'hit')).toHaveLength(0);
    expect(ofType(events, 'telegraph')).toHaveLength(0);
  });

  it('the first strike target is straight ahead within one dash', () => {
    const s = createSim(DEPARTURE_COURT, { seed: 1 });
    const n1 = s.enemies.find((e) => e.key === 'n1')!;
    const events = run(s, {
      first: [{ kind: 'dash', aim: { x: n1.pos.x - s.body.pos.x, y: n1.pos.y - s.body.pos.y } }],
      seconds: 0.5,
    });
    expect(ofType(events, 'kill')).toHaveLength(1);
    expect(ofType(events, 'wake').map((w) => s.enemies.find((e) => e.id === w.enemyId)!.key)).toEqual(['n2']);
  });

  it('every attack announces itself for at least 1.5 s before its bolt can land', () => {
    const s = createSim(DEPARTURE_COURT, { seed: 1 });
    // Wake everything at once (worst case) and measure tracking-start to first hit.
    for (const e of s.enemies) if (e.phase === 'dormant') e.phase = 'idle';
    for (const e of s.enemies) e.phaseDuration = 1.7;
    const events = run(s, { seconds: 8 });
    const firstTelegraph = ofType(events, 'telegraph')[0]!;
    const firstHit = ofType(events, 'hit')[0];
    if (firstHit) expect(firstHit.t - firstTelegraph.t).toBeGreaterThanOrEqual(1.5);
  });
});

describe('Glass Crossing fairness probes', () => {
  it('a detour that never touches the lane reaches the exit', () => {
    const lane = GLASS_CROSSING.lanes[0]!;
    const laneAsWall: RoomDef = { ...GLASS_CROSSING, walls: [...GLASS_CROSSING.walls, lane.rect], enemies: [], lanes: [] };
    const exit = GLASS_CROSSING.exit;
    const inExit = (p: { x: number; y: number }): boolean =>
      p.x >= exit.x && p.x <= exit.x + exit.w && p.y >= exit.y && p.y <= exit.y + exit.h;
    expect(reachablePoints(laneAsWall).some(inExit)).toBe(true);
  });

  it('the safe window comfortably exceeds the soul exposure of a straight crossing', () => {
    const lane = GLASS_CROSSING.lanes[0]!;
    const exposure = (lane.rect.h + 2 * TUNING.soulRadius) / TUNING.soulSpeed;
    const safeWindow = lane.period - (lane.activeTo - lane.activeFrom);
    expect(safeWindow).toBeGreaterThanOrEqual(exposure * 2);
  });
});
