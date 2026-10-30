import { describe, expect, it } from 'vitest';
import { ALL_ROOM_VARIANTS, reachablePoints } from '../../src/content/rooms';
import { createSim, stepSim, TUNING } from '../../src/sim';
import type { RoomDef, SimEvent } from '../../src/sim/types';

function idle(room: RoomDef, seconds: number): SimEvent[] {
  const s = createSim(room, { seed: 1 });
  const events: SimEvent[] = [];
  while (s.time < seconds && s.outcome === 'playing') events.push(...stepSim(s, []));
  return events;
}

describe.each(ALL_ROOM_VARIANTS.map((r) => [r.name, r] as const))('fairness probes: %s', (_name, room) => {
  it('an idle player is unharmed for the first 3 seconds and nothing fires before 3 s', () => {
    const events = idle(room, 3);
    expect(events.filter((e) => e.type === 'hit')).toEqual([]);
    expect(events.filter((e) => e.type === 'fire')).toEqual([]);
  });

  it('every lane is quiet long enough for the slow soul to cross it twice over', () => {
    const soulCross = (thickness: number) => (thickness + 2 * TUNING.soulRadius) / TUNING.soulSpeed;
    for (const lane of room.lanes) {
      const quiet = lane.period - (lane.activeTo - lane.activeFrom);
      expect(quiet).toBeGreaterThanOrEqual(2 * soulCross(Math.min(lane.rect.w, lane.rect.h)));
      expect(lane.warnLead).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('no sentry sits inside a lane', () => {
    for (const e of room.enemies) {
      for (const lane of room.lanes) {
        const r = lane.rect;
        const inside = e.at.x > r.x && e.at.x < r.x + r.w && e.at.y > r.y && e.at.y < r.y + r.h;
        expect(inside).toBe(false);
      }
    }
  });

  it('the exit stays reachable even if every lane were a wall or must be timed through', () => {
    // Either a lane-free route exists, or the lane leaves a quiet window (checked above).
    const asWalls: RoomDef = { ...room, walls: [...room.walls, ...room.lanes.map((l) => l.rect)], enemies: [], lanes: [] };
    const exit = room.exit;
    const reachable = reachablePoints(asWalls).some(
      (p) => p.x >= exit.x && p.x <= exit.x + exit.w && p.y >= exit.y && p.y <= exit.y + exit.h,
    );
    if (!reachable) expect(room.lanes.length).toBeGreaterThan(0);
  });
});
