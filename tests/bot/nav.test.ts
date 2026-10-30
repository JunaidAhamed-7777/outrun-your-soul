import { describe, expect, it } from 'vitest';
import { navFor } from '../../src/bot/nav';
import { DEPARTURE_COURT, SILK_CLOISTER } from '../../src/content/rooms';
import { dist } from '../../src/sim/vec';

describe('wall-aware bot distance', () => {
  it('equals straight-line distance when a body-wide corridor is clear', () => {
    const nav = navFor(DEPARTURE_COURT);
    const a = { x: 4, y: 1.5 };
    const b = { x: 4, y: 5 };
    expect(nav.distance(a, b)).toBeCloseTo(dist(a, b), 9);
  });

  it('goes around walls: inside the U pocket is far from just below its base', () => {
    const nav = navFor(SILK_CLOISTER);
    const below = { x: 4, y: 3.4 };
    const pocket = { x: 4, y: 6.4 };
    const straight = dist(below, pocket);
    const around = nav.distance(below, pocket);
    // Out round an arm (x < 1.7 or > 6.3), up past y 9.3 and back down into the pocket.
    expect(around).toBeGreaterThan(straight + 6);
    expect(around).toBeLessThan(18);
  });

  it('is symmetric enough and cached per room', () => {
    const nav = navFor(SILK_CLOISTER);
    expect(navFor(SILK_CLOISTER)).toBe(nav);
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6.4 };
    expect(Math.abs(nav.distance(a, b) - nav.distance(b, a))).toBeLessThan(0.75);
  });
});
