import { describe, expect, it } from 'vitest';
import {
  beginAppend,
  clearRoute,
  consumeHead,
  consumeTail,
  cornerArcs,
  needsNewVertex,
  pointAtArc,
  polylineLength,
  setTail,
  vertexCountAfterAppend,
} from '../../src/sim/route';
import type { RouteState } from '../../src/sim/types';

const route = (...pts: [number, number][]): RouteState => {
  const points = pts.map(([x, y]) => ({ x, y }));
  return { points, length: polylineLength(points) };
};

describe('route polyline', () => {
  it('measures arc points through corners and extrapolates a growing tail', () => {
    const r = route([0, 0], [2, 0], [2, 3]);
    expect(r.length).toBe(5);
    expect(pointAtArc(r.points, 1)).toEqual({ x: 1, y: 0 });
    expect(pointAtArc(r.points, 2)).toEqual({ x: 2, y: 0 });
    expect(pointAtArc(r.points, 3.5)).toEqual({ x: 2, y: 1.5 });
    expect(pointAtArc(r.points, 9)).toEqual({ x: 2, y: 3 });
    expect(pointAtArc(r.points, 6, { x: 0, y: 1 })).toEqual({ x: 2, y: 4 });
    expect(cornerArcs(r.points)).toEqual([2]);
  });

  it('consumes the head through corners, preserving the remaining corner', () => {
    const r = route([0, 0], [2, 0], [2, 3]);
    consumeHead(r, 2.5);
    expect(r.points).toEqual([
      { x: 2, y: 0.5 },
      { x: 2, y: 3 },
    ]);
    expect(r.length).toBeCloseTo(2.5);
  });

  it('consumes the tail through corners (RETURN never cuts a corner)', () => {
    const r = route([0, 0], [2, 0], [2, 3]);
    consumeTail(r, 4);
    expect(r.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(r.length).toBeCloseTo(1);
  });

  it('both ends consuming meet at the arc midpoint', () => {
    const r = route([0, 0], [2, 0], [2, 2], [0, 2]);
    consumeHead(r, 3);
    consumeTail(r, 2.5);
    expect(r.length).toBeCloseTo(0.5);
    expect(r.points[0]).toEqual({ x: 2, y: 1 });
    expect(r.points[r.points.length - 1]).toEqual({ x: 2, y: 1.5 });
  });

  it('merges only forward-collinear appends', () => {
    const r = route([0, 0], [1, 0]);
    expect(needsNewVertex(r, { x: 1, y: 0 })).toBe(false);
    expect(needsNewVertex(r, { x: -1, y: 0 })).toBe(true); // reversing is a real corner
    expect(needsNewVertex(r, { x: 0, y: 1 })).toBe(true);
    beginAppend(r, { x: 1, y: 0 }, { x: 1, y: 0 });
    setTail(r, { x: 3, y: 0 });
    expect(r.points).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    beginAppend(r, { x: 3, y: 0 }, { x: 0, y: 1 });
    setTail(r, { x: 3, y: 2 });
    expect(r.points.length).toBe(3);
    expect(r.length).toBeCloseTo(5);
  });

  it('starts a fresh route from co-located endpoints', () => {
    const r: RouteState = { points: [], length: 0 };
    expect(vertexCountAfterAppend(r, { x: 0, y: 1 })).toBe(2);
    beginAppend(r, { x: 4, y: 1 }, { x: 0, y: 1 });
    expect(r.points.length).toBe(2);
    setTail(r, { x: 4, y: 2 });
    expect(r.length).toBeCloseTo(1);
    clearRoute(r);
    expect(r.points).toEqual([]);
    expect(r.length).toBe(0);
  });

  it('keeps self-crossing loops intact (crossings do not rewire the path)', () => {
    const r = route([0, 0], [2, 0], [2, 2], [1, 2], [1, -1]);
    const before = r.length;
    consumeHead(r, 0.5);
    expect(r.points.length).toBe(5);
    expect(r.length).toBeCloseTo(before - 0.5);
  });
});
