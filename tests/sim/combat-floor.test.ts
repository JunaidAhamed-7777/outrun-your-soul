import { describe, expect, it } from 'vitest';
import { FIRST_LIGHT } from '../../src/content/rooms';
import { checkInvariants, createSim, stepSim } from '../../src/sim';

describe('health floor (minHealth)', () => {
  it('defaults to no floor: an idle player in a live room can be defeated', () => {
    const s = createSim(FIRST_LIGHT, { seed: 1 });
    while (s.time < 120 && s.outcome === 'playing') stepSim(s, []);
    expect(s.outcome).toBe('defeat');
  });

  it('with a floor, hits still register and grant grace but never kill', () => {
    const s = createSim(FIRST_LIGHT, { seed: 1, minHealth: 1 });
    let hitEvents = 0;
    while (s.time < 120) for (const e of stepSim(s, [])) if (e.type === 'hit') hitEvents += 1;
    expect(hitEvents).toBeGreaterThan(s.maxHealth);
    expect(s.health).toBe(1);
    expect(s.outcome).toBe('playing');
    expect(checkInvariants(s)).toEqual([]);
  });
});
