import { describe, expect, it } from 'vitest';
import { BOTTOM_MIN, fitCamera, PITCH_DEG, screenS, SIDE_MARGIN, TOP_MIN } from '../../src/render/camera';
import { simToWorld, worldToSim, yawForFacing } from '../../src/render/contract';

describe('contract mapping', () => {
  it('maps simulation north to Three -Z and round-trips', () => {
    expect(simToWorld({ x: 2, y: 3 })).toEqual([2, 0, -3]);
    expect(simToWorld({ x: 2, y: 3 }, 0.5)).toEqual([2, 0.5, -3]);
    const back = worldToSim(2, -3);
    expect(back.x).toBe(2);
    expect(back.y).toBe(3);
  });

  it('yaw turns a +Z-forward model toward the simulation facing', () => {
    const cases = [
      { d: { x: 0, y: -1 }, forward: [0, 1] }, // south: +Z
      { d: { x: 0, y: 1 }, forward: [0, -1] }, // north: -Z
      { d: { x: 1, y: 0 }, forward: [1, 0] }, // east: +X
      { d: { x: -1, y: 0 }, forward: [-1, 0] }, // west: -X
    ];
    for (const { d, forward } of cases) {
      const yaw = yawForFacing(d);
      // Rotating +Z by yaw around +Y gives (sin yaw, cos yaw) in (X, Z).
      expect(Math.sin(yaw)).toBeCloseTo(forward[0]!, 9);
      expect(Math.cos(yaw)).toBeCloseTo(forward[1]!, 9);
      // ...and that world direction maps back to the simulation facing.
      const sim = worldToSim(Math.sin(yaw), Math.cos(yaw));
      expect(sim.x).toBeCloseTo(d.x, 9);
      expect(sim.y).toBeCloseTo(d.y, 9);
    }
  });
});

describe('fitCamera', () => {
  const room = { roomWidth: 8, roomHeight: 12 };
  const pitch = (PITCH_DEG * Math.PI) / 180;

  it('fits the room width on portrait phones and keeps the whole room visible', () => {
    for (const [w, h] of [
      [360, 640],
      [390, 844],
      [412, 915],
      [375, 812],
      [320, 693],
    ] as const) {
      const fit = fitCamera({ ...room, viewportWidth: w, viewportHeight: h });
      expect(fit.viewWidth).toBeCloseTo(8 + SIDE_MARGIN * 2, 9);
      expect(fit.viewWidth / fit.viewHeight).toBeCloseTo(w / h, 9);
      expect(fit.sBottom).toBeLessThanOrEqual(-BOTTOM_MIN + 1e-9);
      expect(fit.sTop).toBeGreaterThanOrEqual(screenS(12, 0, pitch) + TOP_MIN - 1e-9);
    }
  });

  it('limits by height on landscape screens and shows more surroundings sideways', () => {
    const fit = fitCamera({ ...room, viewportWidth: 1600, viewportHeight: 900 });
    expect(fit.viewHeight).toBeCloseTo(screenS(12, 0, pitch) + TOP_MIN + BOTTOM_MIN, 9);
    expect(fit.viewWidth).toBeGreaterThan(8 + SIDE_MARGIN * 2);
    expect(fit.sBottom).toBeCloseTo(-BOTTOM_MIN, 9);
  });

  it('centres horizontally and places the camera along the pitched view direction', () => {
    const fit = fitCamera({ ...room, viewportWidth: 390, viewportHeight: 844 });
    expect(fit.target.x).toBe(4);
    const [x, y, z] = fit.position(50);
    expect(x).toBe(4);
    const dx = 0;
    const dy = 0 - y;
    const dz = -fit.target.y - z;
    const l = Math.hypot(dx, dy, dz);
    expect(-dy / l).toBeCloseTo(Math.sin(pitch), 9);
    expect(-dz / l).toBeCloseTo(Math.cos(pitch), 9);
  });

  it('never divides by zero for degenerate viewports', () => {
    const fit = fitCamera({ ...room, viewportWidth: 0, viewportHeight: 0 });
    expect(Number.isFinite(fit.viewWidth)).toBe(true);
    expect(Number.isFinite(fit.viewHeight)).toBe(true);
  });
});
