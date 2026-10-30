/**
 * Evidence that Departure Court's finale (n3 + forecast keeper k1) is a real choice:
 * chaining straight to n3 exposes the soul, while players who weigh the keeper change
 * their target order and stay healthy. Bot evidence, not playtest evidence.
 */
import { describe, expect, it } from 'vitest';
import { EXPERT_BOT, NOVICE_BOT, playRoom } from '../../src/bot/bot';
import { DEPARTURE_COURT } from '../../src/content/rooms';
import { createSim, stepSim } from '../../src/sim';
import { botCommand } from './bot';

const SLOW = 240_000;

describe('Departure Court finale dilemma', () => {
  it('a danger-blind chaser that climbs straight to n3 takes the keeper’s led shot on its soul', () => {
    const s = createSim(DEPARTURE_COURT, { seed: 1 });
    const keeperId = s.enemies.find((q) => q.key === 'k1')!.id;
    const keeperAttacks = new Set<number>();
    const keeperSoulHits: number[] = [];
    // 0.4 s decision cadence, greedy nearest-target, no awareness of bolts.
    for (let i = 0; i < 120 * 120 && s.outcome === 'playing'; i++) {
      const cmd = i % 48 === 0 ? botCommand(s) : null;
      for (const e of stepSim(s, cmd ? [cmd] : [])) {
        if (e.type === 'fire' && e.enemyId === keeperId) keeperAttacks.add(e.attackId);
        if (e.type === 'hit' && e.endpoint === 'soul' && keeperAttacks.has(e.attackId)) keeperSoulHits.push(e.t);
      }
    }
    expect(s.outcome).toBe('victory');
    expect(keeperSoulHits.length).toBeGreaterThanOrEqual(1);
    expect(s.health).toBeLessThan(s.maxHealth);
  });

  it(
    'a novice-timed planner clears with at least 3 health by turning on the keeper first',
    () => {
      const r = playRoom(DEPARTURE_COURT, { seed: 1 }, NOVICE_BOT);
      expect(r.outcome).toBe('victory');
      expect(r.healthLeft).toBeGreaterThanOrEqual(3);
      expect(r.killOrder.indexOf('k1')).toBeLessThan(r.killOrder.indexOf('n3'));
    },
    SLOW,
  );

  it(
    'an expert-timed planner also clears unharmed',
    () => {
      const r = playRoom(DEPARTURE_COURT, { seed: 1 }, EXPERT_BOT);
      expect(r.outcome).toBe('victory');
      expect(r.healthLeft).toBe(r.final.maxHealth);
    },
    SLOW,
  );
});
