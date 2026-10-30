/**
 * Shared bot-clear suite: every playable variant of a template must be cleared by the
 * planning bot (src/bot/bot.ts, wall-aware) under both the novice (0.4 s aim, 0.35 s
 * reactions) and expert timing profiles, without losing the run, with clean invariants.
 */
import { describe, expect, it } from 'vitest';
import { EXPERT_BOT, NOVICE_BOT, playRoom } from '../../src/bot/bot';
import { ROOM_VARIANTS } from '../../src/content/rooms';
import { checkInvariants } from '../../src/sim';

const SLOW = 240_000;

export function describeBotClears(templateId: string): void {
  const variants = ROOM_VARIANTS[templateId] ?? [];
  describe(`${templateId}: planning bot clears`, () => {
    it('has playable variants', () => expect(variants.length).toBeGreaterThan(0));
    for (const room of variants) {
      for (const [label, cfg] of [
        ['novice', NOVICE_BOT],
        ['expert', EXPERT_BOT],
      ] as const) {
        it(
          `${room.name} — ${label}`,
          () => {
            const result = playRoom(room, { seed: 1 }, cfg);
            expect(result.outcome).toBe('victory');
            expect(result.healthLeft).toBeGreaterThan(0);
            expect(checkInvariants(result.final)).toEqual([]);
          },
          SLOW,
        );
      }
    }
  });
}
