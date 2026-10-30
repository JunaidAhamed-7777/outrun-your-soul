import { describe, expect, it } from 'vitest';
import { buildStrip, createStripBuffers, MAX_MITER, polylineLength, stripIndices } from '../../src/render/strip';

function vertex(buf: ReturnType<typeof createStripBuffers>, i: number): [number, number, number] {
  return [buf.positions[i * 3]!, buf.positions[i * 3 + 1]!, buf.positions[i * 3 + 2]!];
}

describe('buildStrip', () => {
  it('builds a straight strip of the requested width at the requested height', () => {
    const buf = createStripBuffers(8);
    const n = buildStrip(
      [
        { x: 0, y: 0 },
        { x: 0, y: 2 },
      ],
      0.1,
      0.03,
      buf,
    );
    expect(n).toBe(2);
    // Travelling north (+y): left is -x. Three z = -y.
    expect(vertex(buf, 0)).toEqual([expect.closeTo(-0.1, 6), expect.closeTo(0.03, 6), expect.closeTo(0, 6)]);
    expect(vertex(buf, 1)).toEqual([expect.closeTo(0.1, 6), expect.closeTo(0.03, 6), expect.closeTo(0, 6)]);
    expect(vertex(buf, 2)).toEqual([expect.closeTo(-0.1, 6), expect.closeTo(0.03, 6), expect.closeTo(-2, 6)]);
  });

  it('measures u from the body end so patterns stay anchored while the soul consumes the head', () => {
    const buf = createStripBuffers(8);
    buildStrip(
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 1 },
      ],
      0.1,
      0,
      buf,
    );
    expect(buf.uvs[0]).toBeCloseTo(4, 6);
    expect(buf.uvs[2 * 2]).toBeCloseTo(1, 6);
    expect(buf.uvs[4 * 2]).toBeCloseTo(0, 6);
    expect(buf.uvs[1]).toBe(0);
    expect(buf.uvs[3]).toBe(1);
  });

  it('mitres right-angle corners and clamps hairpins', () => {
    const buf = createStripBuffers(8);
    buildStrip(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      0.1,
      0,
      buf,
    );
    const [lx, , lz] = vertex(buf, 2);
    // Corner left offset is along (-1, 1)/sqrt2 scaled by sqrt2 -> (-0.1, +0.1) in sim.
    expect(lx).toBeCloseTo(0.9, 6);
    expect(-lz).toBeCloseTo(0.1, 6);

    const hair = createStripBuffers(8);
    buildStrip(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 0.01 },
      ],
      0.1,
      0,
      hair,
    );
    const [hx, , hz] = vertex(hair, 2);
    const offset = Math.hypot(hx - 1, -hz - 0);
    expect(offset).toBeLessThanOrEqual(0.1 * MAX_MITER + 1e-6);
  });

  it('skips duplicates, rejects degenerate input and keeps the body end when over capacity', () => {
    const buf = createStripBuffers(3);
    expect(buildStrip([{ x: 1, y: 1 }], 0.1, 0, buf)).toBe(0);
    expect(
      buildStrip(
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        0.1,
        0,
        buf,
      ),
    ).toBe(0);
    const n = buildStrip(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
      0.1,
      0,
      buf,
    );
    expect(n).toBe(3);
    // Last point written is the body end (3, 0).
    expect(buf.positions[2 * 2 * 3]).toBeCloseTo(3, 6);
    for (const value of buf.positions) expect(Number.isFinite(value)).toBe(true);
  });

  it('produces indices for two triangles per segment and computes lengths', () => {
    const idx = stripIndices(3);
    expect(Array.from(idx)).toEqual([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 5 },
      ]),
    ).toBeCloseTo(6, 9);
  });
});
