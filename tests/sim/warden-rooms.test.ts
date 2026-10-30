/** The warden variants in the room pool must be valid and clearable by novice timing. */
import { describe, expect, it } from 'vitest';
import { NOVICE_BOT, playRoom } from '../../src/bot/bot';
import { ALL_ROOM_VARIANTS, validateRoom } from '../../src/content/rooms';
import { checkInvariants } from '../../src/sim';

const SLOW = 240_000;

describe('warden rooms', () => {
  for (const room of ALL_ROOM_VARIANTS.filter((r) => r.enemies.some((e) => e.role === 'warden'))) {
    it(`${room.id} validates and a novice-timed bot clears it with health to spare`, () => {
      expect(validateRoom(room)).toEqual([]);
      const r = playRoom(room, { seed: 1 }, NOVICE_BOT);
      expect(r.outcome).toBe('victory');
      expect(r.healthLeft).toBeGreaterThanOrEqual(3);
      expect(r.killOrder).toContain(room.enemies.find((e) => e.role === 'warden')!.id);
      expect(checkInvariants(r.final)).toEqual([]);
    }, SLOW);
  }
});
