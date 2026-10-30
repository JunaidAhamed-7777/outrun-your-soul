import { describe, expect, it } from 'vitest';
import { EXPERT_BOT, NOVICE_BOT, playRoom } from '../../src/bot/bot';
import { LAST_WARDEN_ARENA, validateRoom } from '../../src/content/rooms';
import { checkInvariants } from '../../src/sim';

const SLOW = 600_000;

describe('The Last Warden arena', () => {
  it('has a real boss and passes validation', () => {
    expect(LAST_WARDEN_ARENA.boss).toBeDefined();
    expect(validateRoom(LAST_WARDEN_ARENA)).toEqual([]);
  });

  it('rejects a boss inside a wall or on top of the spawn', () => {
    const boss = LAST_WARDEN_ARENA.boss!;
    expect(validateRoom({ ...LAST_WARDEN_ARENA, boss: { ...boss, at: { x: 0.3, y: 6 } } }).join()).toMatch(/overlaps a wall/);
    expect(validateRoom({ ...LAST_WARDEN_ARENA, boss: { ...boss, at: { x: 4, y: 3 } } }).join()).toMatch(/of the spawn/);
  });

  for (const [label, cfg] of [
    ['novice', NOVICE_BOT],
    ['expert', EXPERT_BOT],
  ] as const) {
    it(
      `${label} bot defeats the Warden and leaves with its soul, deterministically`,
      () => {
        const a = playRoom(LAST_WARDEN_ARENA, { seed: 1 }, cfg);
        expect(a.outcome).toBe('victory');
        expect(a.healthLeft).toBeGreaterThan(0);
        expect(a.final.boss?.phase).toBe('dead');
        expect(checkInvariants(a.final)).toEqual([]);
        const b = playRoom(LAST_WARDEN_ARENA, { seed: 1 }, cfg);
        expect(b.decisions).toEqual(a.decisions);
        expect(b.seconds).toBe(a.seconds);
      },
      SLOW,
    );
  }
});
