import { Box3, Mesh, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { mergeStaticMeshes } from '../../src/render/merge';
import { partName, placeholderFor } from '../../src/render/placeholders';

function meshCount(root: Object3D): number {
  let n = 0;
  root.traverse((node) => {
    if (node instanceof Mesh) n++;
  });
  return n;
}

describe('mergeStaticMeshes', () => {
  it('reduces meshes while keeping parts, sockets and bounds', () => {
    for (const id of ['courier_body', 'soul_mask', 'needler', 'keeper', 'exit_gate'] as const) {
      const model = placeholderFor(id);
      const before = meshCount(model);
      const box = new Box3().setFromObject(model);
      const removed = mergeStaticMeshes(model, id);
      const after = meshCount(model);
      expect(after).toBeLessThanOrEqual(before);
      expect(before - after).toBeLessThanOrEqual(removed);
      const box2 = new Box3().setFromObject(model);
      expect(box2.min.distanceTo(box.min)).toBeLessThan(1e-5);
      expect(box2.max.distanceTo(box.max)).toBeLessThan(1e-5);
    }
    const gate = placeholderFor('exit_gate');
    mergeStaticMeshes(gate, 'exit_gate');
    expect(gate.getObjectByName(partName('exit_gate', 'door_left'))).toBeTruthy();
    const needler = placeholderFor('needler');
    mergeStaticMeshes(needler, 'needler');
    expect(needler.getObjectByName(partName('needler', 'muzzle'))).toBeTruthy();
    expect(needler.getObjectByName(partName('needler', 'eye'))).toBeTruthy();
  });

  it('bakes opaque parts to one vertex-coloured mesh per animated part', () => {
    const budgets: Record<string, number> = { courier_body: 6, needler: 4, keeper: 4, exit_gate: 4, wall_block: 1 };
    for (const [id, budget] of Object.entries(budgets)) {
      const model = placeholderFor(id as never);
      mergeStaticMeshes(model, id);
      expect(meshCount(model), id).toBeLessThanOrEqual(budget);
    }
  });

  it('merges the gate down to a handful of draw calls', () => {
    const gate = placeholderFor('exit_gate');
    const before = meshCount(gate);
    mergeStaticMeshes(gate, 'exit_gate');
    expect(meshCount(gate)).toBeLessThanOrEqual(Math.ceil(before * 0.6));
  });
});
