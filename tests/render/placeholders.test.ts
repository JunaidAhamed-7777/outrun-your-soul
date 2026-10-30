import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import { modelUrl } from '../../src/render/assets';
import { MODEL_IDS } from '../../src/render/contract';
import { findPart, partName, placeholderFor } from '../../src/render/placeholders';

const PARTS: Record<string, string[]> = {
  courier_body: ['body', 'head', 'mask', 'scarf'],
  soul_mask: ['mask', 'wisp'],
  needler: ['base', 'head', 'muzzle'],
  keeper: ['base', 'head', 'muzzle'],
  warden: ['base', 'head', 'shield', 'core'],
  exit_gate: ['frame', 'door_left', 'door_right'],
};

describe('placeholder models honour the asset contract', () => {
  it('names each root after its asset ID and provides the contract parts', () => {
    for (const id of MODEL_IDS) {
      const model = placeholderFor(id);
      expect(model.name).toBe(id);
      for (const name of PARTS[id] ?? []) {
        expect(model.getObjectByName(partName(id, name)), `${id}_${name}`).toBeTruthy();
        expect(findPart(model, id, name)).toBe(model.getObjectByName(partName(id, name)));
      }
    }
  });

  it('puts actor pivots on the ground at the collision centre', () => {
    for (const id of ['courier_body', 'soul_mask', 'needler', 'keeper', 'warden'] as const) {
      const box = new Box3().setFromObject(placeholderFor(id));
      expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.abs((box.min.x + box.max.x) / 2)).toBeLessThan(0.1);
    }
    // The soul floats: its lowest geometry is above the ground but its origin is not.
    const soul = new Box3().setFromObject(placeholderFor('soul_mask'));
    expect(soul.min.y).toBeGreaterThan(0.05);
  });

  it('anchors modules at the lower-left grid corner occupying one tile', () => {
    for (const id of ['floor_tile', 'wall_block'] as const) {
      const box = new Box3().setFromObject(placeholderFor(id));
      expect(box.min.x).toBeGreaterThanOrEqual(-0.011);
      expect(box.max.x).toBeLessThanOrEqual(1.011);
      // Simulation y in [0, 1] maps to Three z in [-1, 0].
      expect(box.min.z).toBeGreaterThanOrEqual(-1.011);
      expect(box.max.z).toBeLessThanOrEqual(0.011);
    }
    const floor = new Box3().setFromObject(placeholderFor('floor_tile'));
    expect(floor.max.y).toBeCloseTo(0, 6);
  });

  it('builds model URLs from the relative base, never site root', () => {
    expect(modelUrl('courier_body', './')).toBe('./assets/models/courier_body.glb');
    expect(modelUrl('needler', '/game/sub')).toBe('/game/sub/assets/models/needler.glb');
  });
});
