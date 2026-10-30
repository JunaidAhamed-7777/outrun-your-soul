import { describe, expect, it } from 'vitest';
import { EXPERT_BOT, NOVICE_BOT, playRoom } from '../../src/bot/bot';
import { DEPARTURE_COURT } from '../../src/content/rooms/departure-court';
import { checkInvariants, createSim, stepSim } from '../../src/sim';

// Planning bots are slow-ish (thousands of lookahead steps per decision).
const SLOW = 120_000;

describe('Departure Court played by the planning bot', () => {
  it(
    'is cleared by a novice-timed bot (0.4 s aim, 0.35 s reactions) without losing the run',
    () => {
      const result = playRoom(DEPARTURE_COURT, { seed: 1 }, NOVICE_BOT);
      expect(result.outcome).toBe('victory');
      expect(result.healthLeft).toBeGreaterThan(0);
      expect(checkInvariants(result.final)).toEqual([]);
    },
    SLOW,
  );

  it(
    'is cleared by an expert-timed bot',
    () => {
      const result = playRoom(DEPARTURE_COURT, { seed: 1 }, EXPERT_BOT);
      expect(result.outcome).toBe('victory');
    },
    SLOW,
  );

  it(
    'teaching window: standing still for the first 10 seconds takes no damage',
    () => {
      const s = createSim(DEPARTURE_COURT, { seed: 1 });
      while (s.time < 10) stepSim(s, []);
      expect(s.health).toBe(s.maxHealth);
    },
    SLOW,
  );

  it(
    'bot playthrough is deterministic for a seed',
    () => {
      const a = playRoom(DEPARTURE_COURT, { seed: 7 }, EXPERT_BOT);
      const b = playRoom(DEPARTURE_COURT, { seed: 7 }, EXPERT_BOT);
      expect(b.decisions).toEqual(a.decisions);
      expect(b.killOrder).toEqual(a.killOrder);
    },
    SLOW,
  );
});
