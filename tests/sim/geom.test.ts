import { describe, expect, it } from 'vitest';
import {
  circleClear,
  circleEntersRect,
  circleTimeOfImpact,
  corridorClear,
  rectSignedDistance,
  sweepCircle,
  sweepCircleRect,
} from '../../src/sim/geom';
import { nextRandom, seedRng } from '../../src/sim/rng';
import type { RoomDef } from '../../src/sim/types';

const box = { x: 2, y: 2, w: 2, h: 1 };
const room: RoomDef = {
  id: 't',
  name: 't',
  width: 8,
  height: 12,
  walls: [box],
  spawn: { x: 1, y: 1 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [],
  lanes: [],
};

describe('rectSignedDistance', () => {
  it('is positive outside, negative inside, with outward normals', () => {
    expect(rectSignedDistance({ x: 5, y: 2.5 }, box)).toEqual({ d: 1, n: { x: 1, y: 0 } });
    const inside = rectSignedDistance({ x: 3, y: 2.9 }, box);
    expect(inside.d).toBeCloseTo(-0.1);
    expect(inside.n).toEqual({ x: 0, y: 1 });
    const corner = rectSignedDistance({ x: 5, y: 4 }, box);
    expect(corner.d).toBeCloseTo(Math.SQRT2);
    expect(corner.n.x).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('sweepCircleRect', () => {
  it('hits a face at the exact radius offset', () => {
    const hit = sweepCircleRect({ x: 3, y: 0 }, { x: 0, y: 4 }, 0.5, box);
    expect(hit?.t).toBeCloseTo((2 - 0.5 - 0) / 4);
    expect(hit?.normal).toEqual({ x: 0, y: -1 });
  });

  it('hits a rounded corner, not the square bounding corner', () => {
    // Diagonal approach toward the (4,3) corner from the upper right.
    const hit = sweepCircleRect({ x: 6, y: 5 }, { x: -2, y: -2 }, 0.5, box);
    expect(hit).not.toBeNull();
    const t = hit?.t ?? 0;
    const at = { x: 6 - 2 * t, y: 5 - 2 * t };
    expect(Math.hypot(at.x - 4, at.y - 3)).toBeCloseTo(0.5, 9);
  });

  it('misses a corner it only grazes from outside the rounded region', () => {
    // Passes the corner at distance 0.6 > radius 0.5.
    expect(sweepCircleRect({ x: 4.6, y: 6 }, { x: 0, y: -6 }, 0.5, box)).toBeNull();
  });

  it('treats touching as a hit only when moving inward', () => {
    const touching = { x: 3, y: 1.5 }; // radius 0.5 exactly touches the bottom face
    expect(sweepCircleRect(touching, { x: 1, y: 0 }, 0.5, box)).toBeNull();
    expect(sweepCircleRect(touching, { x: 0, y: -1 }, 0.5, box)).toBeNull();
    expect(sweepCircleRect(touching, { x: 0, y: 1 }, 0.5, box)?.t).toBe(0);
  });

  it('reports overlap at t=0', () => {
    expect(sweepCircleRect({ x: 3, y: 1.8 }, { x: 0, y: -1 }, 0.5, box)?.t).toBe(0);
  });
});

describe('sweepCircle against room', () => {
  it('stops at the boundary minus radius', () => {
    const hit = sweepCircle(room, { x: 6, y: 6 }, { x: 4, y: 0 }, 0.3);
    expect(hit?.t).toBeCloseTo((8 - 0.3 - 6) / 4);
  });

  it('returns the earliest of boundary and wall contacts', () => {
    const hit = sweepCircle(room, { x: 3, y: 0.5 }, { x: 0, y: 10 }, 0.3);
    expect(hit?.t).toBeCloseTo((2 - 0.3 - 0.5) / 10);
  });

  it('agrees with dense sampling on random sweeps', () => {
    const rng = { rng: seedRng(7) };
    for (let i = 0; i < 400; i++) {
      const p0 = { x: 0.3 + nextRandom(rng) * 7.4, y: 0.3 + nextRandom(rng) * 11.4 };
      if (!circleClear(room, p0, 0.3)) continue;
      const disp = { x: (nextRandom(rng) - 0.5) * 8, y: (nextRandom(rng) - 0.5) * 8 };
      const hit = sweepCircle(room, p0, disp, 0.3);
      const limit = hit ? hit.t : 1;
      // Every sampled point strictly before the hit is clear.
      for (let k = 0; k < 50; k++) {
        const s = (limit * k) / 50;
        expect(circleClear(room, { x: p0.x + disp.x * s, y: p0.y + disp.y * s }, 0.3 - 1e-7)).toBe(true);
      }
      if (hit && hit.t > 1e-6) {
        const after = Math.min(1, hit.t + 1e-3);
        const q = { x: p0.x + disp.x * after, y: p0.y + disp.y * after };
        expect(circleClear(room, q, 0.3 + 1e-9)).toBe(false);
      }
    }
  });
});

describe('corridorClear', () => {
  it('rejects a corridor that crosses a wall and accepts an open one', () => {
    expect(corridorClear(room, { x: 3, y: 1.4 }, { x: 3, y: 3.6 }, 0.3)).toBe(false);
    expect(corridorClear(room, { x: 1, y: 1 }, { x: 1, y: 5 }, 0.3)).toBe(true);
  });

  it('rejects an endpoint whose final footprint overlaps a wall', () => {
    expect(corridorClear(room, { x: 3, y: 1 }, { x: 3, y: 1.9 }, 0.3)).toBe(false);
  });
});

describe('circleTimeOfImpact', () => {
  it('solves head-on approach', () => {
    expect(circleTimeOfImpact({ x: 4, y: 0 }, { x: -2, y: 0 }, 1, 10)).toBeCloseTo(1.5);
  });
  it('returns 0 when overlapping and null when separating or out of window', () => {
    expect(circleTimeOfImpact({ x: 0.5, y: 0 }, { x: 1, y: 0 }, 1, 1)).toBe(0);
    expect(circleTimeOfImpact({ x: 4, y: 0 }, { x: 2, y: 0 }, 1, 10)).toBeNull();
    expect(circleTimeOfImpact({ x: 4, y: 0 }, { x: -2, y: 0 }, 1, 1)).toBeNull();
  });
  it('misses a passing circle', () => {
    expect(circleTimeOfImpact({ x: 4, y: 2 }, { x: -2, y: 0 }, 1, 10)).toBeNull();
  });
});

describe('circleEntersRect', () => {
  it('reports entry fraction and overlap', () => {
    const lane = { x: 0, y: 5, w: 8, h: 1 };
    expect(circleEntersRect({ x: 1, y: 3 }, { x: 0, y: 2 }, 0.5, lane)).toBeCloseTo(0.75);
    expect(circleEntersRect({ x: 1, y: 5.5 }, { x: 0, y: 2 }, 0.5, lane)).toBe(0);
    expect(circleEntersRect({ x: 1, y: 3 }, { x: 0, y: -2 }, 0.5, lane)).toBeNull();
  });
});
