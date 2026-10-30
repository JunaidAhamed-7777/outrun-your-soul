import { describe, expect, it } from 'vitest';
import { rayRect, rayToWalls } from '../../src/render/raycast';

describe('presentation ray casting', () => {
  const room = { width: 8, height: 12, walls: [{ x: 3, y: 5, w: 2, h: 1 }] };

  it('stops at the first wall in the way', () => {
    expect(rayToWalls({ x: 4, y: 1 }, { x: 0, y: 1 }, room)).toBeCloseTo(4, 9);
  });

  it('reaches the room boundary when nothing blocks', () => {
    expect(rayToWalls({ x: 1, y: 1 }, { x: 0, y: 1 }, room)).toBeCloseTo(11, 9);
    expect(rayToWalls({ x: 1, y: 1 }, { x: -1, y: 0 }, room)).toBeCloseTo(1, 9);
    const d = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    expect(rayToWalls({ x: 6, y: 1 }, d, room)).toBeCloseTo(2 / Math.SQRT1_2, 9);
  });

  it('ignores rectangles behind the ray and handles axis-parallel rays outside slabs', () => {
    expect(rayRect({ x: 4, y: 8 }, { x: 0, y: 1 }, room.walls[0]!)).toBe(Infinity);
    expect(rayRect({ x: 0, y: 0 }, { x: 1, y: 0 }, room.walls[0]!)).toBe(Infinity);
    expect(rayRect({ x: 4, y: 5.5 }, { x: 1, y: 0 }, room.walls[0]!)).toBe(0);
  });
});
