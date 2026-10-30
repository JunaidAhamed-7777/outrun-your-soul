/**
 * Defensive readers for simulation fields and events that are being added in parallel
 * (keeper forecast aim, relics, warden, boss). Every reader tolerates the field being
 * absent so the renderer compiles and runs against older and newer SimState shapes.
 * Presentation only: nothing here decides gameplay.
 *
 * Expected shapes (any of the listed aliases is accepted):
 *  - EnemyState.lockTarget: Vec2 | null   (point the locked attack is aimed at; keeper forecast)
 *  - EnemyState.aimTarget:  Vec2 | null   (point the tracking aim follows; decoys show here)
 *  - EnemyState.phase 'exposed' or EnemyState.exposed: boolean (warden opening window)
 *  - EnemyState.guardHalfAngle | sweepRadius | sweepHalfAngle: number (warden geometry, radians/tiles)
 *  - SimState.relicState: {
 *      equipped?: string[];               // relic IDs, e.g. 'glass_lantern'
 *      haloRadius?: number | null;        // Glass Lantern halo radius (tiles), exact sim value
 *      bellCharge?: number; bellChargeMax?: number; burstRadius?: number;
 *      decoy?: Vec2 | null;               // Traveler's Knot decoy placed in the world
 *      knotReady?: boolean;               // an earned mark waiting for the next reunion
 *    }
 *  - ProjectileState.slowed?: boolean     (inside the halo); otherwise derived from haloRadius
 *  - SimState.boss?: { body: {pos, prevPos?}, heart: {pos, prevPos?}, route?: {points: Vec2[]} }
 *    or enemies with roles 'last_warden_body' / 'last_warden_heart'.
 */
import type { EnemyState, ProjectileState, SimState } from '../sim/types';
import type { Vec2 } from '../sim/vec';

type Bag = Record<string, unknown>;

function bag(x: unknown): Bag | null {
  return x && typeof x === 'object' ? (x as Bag) : null;
}

function isVec(x: unknown): x is Vec2 {
  const b = bag(x);
  return !!b && typeof b.x === 'number' && typeof b.y === 'number';
}

function firstVec(source: unknown, ...keys: string[]): Vec2 | null {
  const b = bag(source);
  if (!b) return null;
  for (const k of keys) if (isVec(b[k])) return b[k] as Vec2;
  return null;
}

function firstNum(source: unknown, ...keys: string[]): number | null {
  const b = bag(source);
  if (!b) return null;
  for (const k of keys) {
    const v = b[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export function lockTarget(e: EnemyState): Vec2 | null {
  return firstVec(e, 'lockTarget', 'lockedTarget');
}

export function aimTarget(e: EnemyState): Vec2 | null {
  return firstVec(e, 'aimTarget', 'trackTarget');
}

export function isExposed(e: EnemyState): boolean {
  return (e.phase as string) === 'exposed' || (bag(e)?.exposed as boolean | undefined) === true;
}

export interface WardenShape {
  guardHalf: number;
  sweepRadius: number;
  sweepHalf: number;
}

export const WARDEN_DEFAULTS: WardenShape = { guardHalf: (70 * Math.PI) / 180, sweepRadius: 2.4, sweepHalf: (55 * Math.PI) / 180 };

export function wardenShape(e: EnemyState): WardenShape {
  return {
    guardHalf: firstNum(e, 'guardHalfAngle', 'guardHalf') ?? WARDEN_DEFAULTS.guardHalf,
    sweepRadius: firstNum(e, 'sweepRadius', 'attackRadius') ?? WARDEN_DEFAULTS.sweepRadius,
    sweepHalf: firstNum(e, 'sweepHalfAngle', 'sweepHalf') ?? WARDEN_DEFAULTS.sweepHalf,
  };
}

export type RoleKind = 'needler' | 'keeper' | 'warden' | 'boss_body' | 'boss_heart' | 'unknown';

export function roleKind(e: EnemyState): RoleKind {
  const role = e.role as string;
  if (role === 'needler' || role === 'keeper' || role === 'warden') return role;
  if (role.startsWith('last_warden')) return role.includes('heart') ? 'boss_heart' : 'boss_body';
  return 'unknown';
}

export interface RelicView {
  equipped: readonly string[];
  haloRadius: number | null;
  boosting: boolean;
  bellCharge: number;
  bellMax: number;
  burstRadius: number | null;
  decoy: Vec2 | null;
  knotReady: boolean;
}

export function relicView(state: SimState): RelicView {
  const rs = bag((state as unknown as Bag).relicState);
  const equippedRaw = rs?.equipped ?? rs?.relics ?? (state as unknown as Bag).relics;
  const equipped = Array.isArray(equippedRaw) ? (equippedRaw.filter((x) => typeof x === 'string') as string[]) : [];
  const lantern = bag(rs?.glassLantern) ?? bag(rs?.lantern);
  const bell = bag(rs?.mourningBell) ?? bag(rs?.bell);
  const knot = bag(rs?.travelersKnot) ?? bag(rs?.knot);
  const haloRadius = firstNum(rs, 'haloRadius') ?? firstNum(lantern, 'radius', 'haloRadius');
  return {
    equipped,
    haloRadius: haloRadius !== null && haloRadius > 0 ? haloRadius : null,
    boosting: state.soul.boostLeft > 0,
    bellCharge: firstNum(rs, 'bellCharge') ?? firstNum(bell, 'charge') ?? 0,
    bellMax: firstNum(rs, 'bellChargeMax') ?? firstNum(bell, 'max', 'chargeMax') ?? 2,
    burstRadius: firstNum(rs, 'burstRadius') ?? firstNum(bell, 'radius', 'burstRadius'),
    decoy: firstVec(rs, 'decoy', 'decoyAt') ?? firstVec(knot, 'decoy', 'at'),
    knotReady: (rs?.knotReady as boolean | undefined) === true || (knot?.ready as boolean | undefined) === true,
  };
}

/** Whether a bolt is currently slowed by the halo (sim flag if present, else exact geometry). */
export function boltSlowed(p: ProjectileState, soul: Vec2, haloRadius: number | null): boolean {
  const flag = bag(p)?.slowed;
  if (typeof flag === 'boolean') return flag;
  if (haloRadius === null) return false;
  return Math.hypot(p.pos.x - soul.x, p.pos.y - soul.y) < haloRadius;
}

export interface BossPart {
  pos: Vec2;
  prevPos: Vec2;
}

export interface BossView {
  body: BossPart | null;
  heart: BossPart | null;
  route: readonly Vec2[];
}

function part(x: unknown): BossPart | null {
  const pos = firstVec(x, 'pos');
  if (!pos) return null;
  return { pos, prevPos: firstVec(x, 'prevPos') ?? pos };
}

/** Boss presentation data from `state.boss`, or null when there is no boss. */
export function bossView(state: SimState): BossView | null {
  const boss = bag((state as unknown as Bag).boss);
  if (!boss) return null;
  const route = bag(boss.route);
  const pts = Array.isArray(route?.points) ? (route.points as unknown[]).filter(isVec) : [];
  return { body: part(boss.body), heart: part(boss.heart), route: pts };
}

/** Loose view of any event (known or not yet in the union). */
export interface LooseEvent {
  type: string;
  t?: number;
  at?: Vec2;
  enemyId?: number;
  projectileId?: number;
  radius?: number;
  charge?: number;
  dir?: Vec2;
  halfAngle?: number;
}

export function loose(e: unknown): LooseEvent {
  const b = bag(e) ?? {};
  return {
    type: typeof b.type === 'string' ? b.type : '',
    ...(typeof b.t === 'number' ? { t: b.t } : {}),
    ...(isVec(b.at) ? { at: b.at } : {}),
    ...(typeof b.enemyId === 'number' ? { enemyId: b.enemyId } : {}),
    ...(typeof b.projectileId === 'number' ? { projectileId: b.projectileId } : {}),
    ...(typeof b.radius === 'number' ? { radius: b.radius } : {}),
    ...(typeof b.charge === 'number' ? { charge: b.charge } : {}),
    ...(isVec(b.dir) ? { dir: b.dir } : {}),
    ...(typeof b.halfAngle === 'number' ? { halfAngle: b.halfAngle } : {}),
  };
}
