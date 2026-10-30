import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { decorSpots, laneEmitterSpots, tileModuleMatrix } from '../../src/render/kit';

const room = {
  width: 8,
  height: 12,
  exit: { x: 3, y: 11, w: 2, h: 1 },
  lanes: [
    { id: 'west', rect: { x: 0, y: 3, w: 4.5, h: 0.75 }, period: 6, activeFrom: 3, activeTo: 5, warnLead: 1 },
    { id: 'across', rect: { x: 0, y: 7, w: 8, h: 1 }, period: 6, activeFrom: 3, activeTo: 5, warnLead: 1 },
    { id: 'floating', rect: { x: 2, y: 5, w: 3, h: 1 }, period: 6, activeFrom: 3, activeTo: 5, warnLead: 1 },
  ],
};

describe('environment kit placement', () => {
  it('puts an emitter on each perimeter side a lane touches, facing into the lane', () => {
    const spots = laneEmitterSpots(room);
    expect(spots).toEqual([
      { laneKey: 'west', tile: { x: -1, y: 3 }, facing: { x: 1, y: 0 } },
      { laneKey: 'across', tile: { x: -1, y: 7 }, facing: { x: 1, y: 0 } },
      { laneKey: 'across', tile: { x: 8, y: 7 }, facing: { x: -1, y: 0 } },
    ]);
  });

  it('rotates corner-origin modules about the tile centre so the aperture faces the lane', () => {
    // Default aperture: front face centre (0.5, 0.2, 0) in Three = sim (0.5, 0) facing -y.
    const aperture = new Vector3(0.5, 0.2, 0);
    const east = aperture.clone().applyMatrix4(tileModuleMatrix(-1, 3, { x: 1, y: 0 }));
    // West perimeter tile [-1,0] x [3,4]: the aperture sits on its east face, mid-height of the row.
    expect(east.x).toBeCloseTo(0, 6);
    expect(-east.z).toBeCloseTo(3.5, 6);
    const south = aperture.clone().applyMatrix4(tileModuleMatrix(2, 12, { x: 0, y: -1 }));
    expect(south.x).toBeCloseTo(2.5, 6);
    expect(-south.z).toBeCloseTo(12, 6);
  });

  it('places decor deterministically on perimeter tiles, never on the gate, emitters or south edge interior', () => {
    const a = decorSpots(room);
    expect(decorSpots(room)).toEqual(a);
    const keys = a.map((s) => `${s.tile.x},${s.tile.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of a) {
      const onPerimeter = s.tile.x === -1 || s.tile.x === room.width || s.tile.y === -1 || s.tile.y === room.height;
      expect(onPerimeter).toBe(true);
      // Nothing on the low south curb between the side walls (it would cover the bottom rows).
      expect(s.tile.y === -1 && s.tile.x >= 0 && s.tile.x < room.width).toBe(false);
      // Gate opening and pillars stay clear.
      expect(s.tile.y === room.height && s.tile.x >= 2 && s.tile.x <= 5).toBe(false);
    }
    for (const e of laneEmitterSpots(room)) expect(keys).not.toContain(`${e.tile.x},${e.tile.y}`);
    expect(a.filter((s) => s.kind === 'lamp_post')).toHaveLength(2);
    expect(a.filter((s) => s.kind === 'urn')).toHaveLength(4);
  });
});
