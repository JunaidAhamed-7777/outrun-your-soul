/**
 * Stationary sentry roles. Each attack is announced (tracking), then locked (aim frozen,
 * attack ID reserved), then fired as a cuttable bolt. Killing a sentry cancels only its
 * unlaunched attack; bolts already in flight persist.
 *
 * Timings are paper values from COMBAT_SPEC/CONTENT, not validated difficulty.
 */
import type { EnemyPhase, EnemyRole, EnemySpawn, EnemyState, EntityId } from './types';
import { normalize, sub, type Vec2 } from './vec';

export interface SentryTuning {
  readonly radius: number;
  /** Idle time between attacks. */
  readonly cooldown: number;
  /** Warning that follows the target before locking. */
  readonly tracking: number;
  /** Locked warning: aim frozen; the bolt will travel exactly this line. */
  readonly locked: number;
  /** Pause after firing before the next cooldown. */
  readonly recover: number;
  readonly boltSpeed: number;
  readonly boltRadius: number;
  readonly target: 'body' | 'soul';
}

export const ENEMY_TUNING: Readonly<Record<Exclude<EnemyRole, 'warden'>, SentryTuning>> = {
  needler: {
    radius: 0.42,
    cooldown: 1.7,
    tracking: 0.9,
    locked: 0.6,
    recover: 0.35,
    boltSpeed: 6,
    boltRadius: 0.15,
    target: 'body',
  },
  keeper: {
    radius: 0.42,
    cooldown: 2.0,
    tracking: 1.1,
    locked: 0.6,
    recover: 0.35,
    boltSpeed: 4.5,
    boltRadius: 0.17,
    target: 'soul',
  },
};

/** Bolts expire after this long even if they never meet a wall. */
export const BOLT_MAX_AGE = 6;

export function sentryTuning(role: EnemyRole): SentryTuning {
  if (role === 'warden') {
    // TODO(phase 2): warden frontal guard and announced openings (COMBAT_SPEC / CONTENT).
    throw new Error('Warden role is not implemented yet');
  }
  return ENEMY_TUNING[role];
}

const DEFAULT_FACING: Vec2 = { x: 0, y: -1 };

export function createEnemy(spawn: EnemySpawn, id: EntityId): EnemyState {
  const tune = sentryTuning(spawn.role);
  const facing = spawn.facing ? normalize(spawn.facing) : DEFAULT_FACING;
  const dormant = spawn.dormant === true;
  return {
    id,
    key: spawn.id,
    role: spawn.role,
    pos: spawn.at,
    radius: tune.radius,
    phase: dormant ? 'dormant' : 'idle',
    // `phase` is idle time already elapsed at activation; negative delays the first attack.
    phaseTime: dormant ? 0 : (spawn.phase ?? 0),
    phaseDuration: dormant ? Infinity : tune.cooldown,
    aim: facing,
    target: tune.target,
    attackId: null,
    facing,
  };
}

/** Wake a dormant sentry into its idle cooldown. */
export function wakeEnemy(enemy: EnemyState, spawn: EnemySpawn | undefined): void {
  const tune = sentryTuning(enemy.role);
  enemy.phase = 'idle';
  enemy.phaseTime = spawn?.phase ?? 0;
  enemy.phaseDuration = tune.cooldown;
}

export function isActive(phase: EnemyPhase): boolean {
  return phase === 'idle' || phase === 'tracking' || phase === 'locked' || phase === 'recover';
}

/** Unit aim from a sentry toward a point, keeping the previous aim if degenerate. */
export function aimToward(enemy: EnemyState, point: Vec2): Vec2 {
  const d = sub(point, enemy.pos);
  const n = normalize(d);
  return n.x === 0 && n.y === 0 ? enemy.aim : n;
}
