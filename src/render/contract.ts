/**
 * Coordinate mapping between the gameplay plane and the Three.js world.
 * See docs/ASSET_CONTRACT.md. Keep this the only place that knows the mapping.
 */
import type { Vec2 } from '../sim/vec';

/** Simulation (x, y) -> Three (x, height, -y). */
export function simToWorld(p: Vec2, height = 0): [number, number, number] {
  return [p.x, height, -p.y];
}

/** Three (x, _, z) -> simulation (x, -z). */
export function worldToSim(x: number, z: number): Vec2 {
  return { x, y: -z };
}

/** Model root yaw so a +Z-forward glTF model faces simulation direction d. */
export function yawForFacing(d: Vec2): number {
  return Math.atan2(d.x, -d.y);
}

/** Asset IDs the runtime may request from public/assets/models/<id>.glb. */
export const MODEL_IDS = [
  'courier_body',
  'soul_mask',
  'needler',
  'keeper',
  'floor_tile',
  'wall_block',
  'exit_gate',
  'distant_engine',
] as const;
export type ModelId = (typeof MODEL_IDS)[number];
