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
  'warden',
  'last_warden_body',
  'last_warden_heart',
  'floor_tile',
  'wall_block',
  'exit_gate',
  'distant_engine',
  'lane_emitter',
  'threshold_inlay',
  'urn',
  'banner_post',
  'lamp_post',
  'station_kiosk',
] as const;
export type ModelId = (typeof MODEL_IDS)[number];

/** Named animated parts per asset (node `<asset_id>_<part>`), from docs/ASSET_CONTRACT.md and the art notes. */
export const CONTRACT_PARTS: Readonly<Record<string, readonly string[]>> = {
  courier_body: ['body', 'head', 'mask', 'scarf'],
  soul_mask: ['mask', 'wisp'],
  needler: ['base', 'head', 'muzzle'],
  keeper: ['base', 'head', 'muzzle'],
  warden: ['base', 'body', 'shield', 'core', 'muzzle'],
  last_warden_body: ['body', 'head', 'mask', 'mantle'],
  last_warden_heart: ['cage', 'core'],
  exit_gate: ['frame', 'door_left', 'door_right'],
  distant_engine: ['body', 'gear_a', 'gear_b', 'train'],
  lane_emitter: ['body', 'aperture'],
  threshold_inlay: ['inlay'],
  urn: ['vessel'],
  banner_post: ['post', 'cloth'],
  lamp_post: ['lamp'],
  station_kiosk: ['house', 'bell', 'signal_arm'],
};

/**
 * Parts the runtime animates or looks up. Contract parts not listed here (e.g. the courier's
 * mask, which only rides on the head) may be merged into their parent to save draw calls.
 */
export const ANIMATED_PARTS: Readonly<Record<string, readonly string[]>> = {
  ...CONTRACT_PARTS,
  courier_body: ['body', 'head', 'scarf'],
  lane_emitter: ['aperture'],
  threshold_inlay: [],
  urn: [],
  lamp_post: [],
};
