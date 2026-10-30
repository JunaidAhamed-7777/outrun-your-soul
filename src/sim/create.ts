/** Room-entry state construction. */
import { createEnemy } from './enemies';
import { laneCycleTime, laneStatusAt } from './lanes';
import { seedRng } from './rng';
import { TUNING } from './tuning';
import type { LaneState, RoomDef, RoomParams, SimState } from './types';

/** Bump when rules change in a way that invalidates saved room-entry checkpoints. */
export const RULES_VERSION = 1;

export interface CreateOptions {
  readonly seed: number;
  readonly params?: Partial<RoomParams>;
  readonly health?: number;
}

export function createSim(room: RoomDef, options: CreateOptions): SimState {
  const params: RoomParams = {
    soulSpeed: TUNING.soulSpeed,
    tetherCapacity: TUNING.tetherCapacity,
    dashMaxDistance: TUNING.dashMaxDistance,
    ...options.params,
  };
  let nextId = 1;
  const enemies = room.enemies.map((spawn) => createEnemy(spawn, nextId++));
  const lanes: LaneState[] = room.lanes.map((def) => {
    const cycleTime = laneCycleTime(def, 0);
    const status = laneStatusAt(def, cycleTime);
    return { id: nextId++, key: def.id, rect: def.rect, status, attackId: null, cycleTime };
  });
  for (const lane of lanes) if (lane.status === 'active') lane.attackId = nextId++;
  const health = Math.min(TUNING.maxHealth, Math.max(1, options.health ?? TUNING.maxHealth));
  return {
    rulesVersion: RULES_VERSION,
    room,
    params,
    tick: 0,
    time: 0,
    rng: seedRng(options.seed),
    nextId,
    health,
    maxHealth: TUNING.maxHealth,
    graceLeft: 0,
    damagedAttackIds: new Set(),
    body: {
      pos: room.spawn,
      prevPos: room.spawn,
      mode: 'ready',
      dash: null,
      recoverLeft: 0,
      facing: { x: 0, y: 1 },
    },
    soul: { pos: room.spawn, prevPos: room.spawn, speedMultiplier: 1, boostLeft: 0 },
    route: { points: [], length: 0 },
    contactArmed: false,
    enemies,
    projectiles: [],
    lanes,
    gate: enemies.length === 0 ? 'open' : 'sealed',
    outcome: 'playing',
    buffered: null,
    bufferedAge: 0,
    stats: { dashes: 0, returns: 0, cuts: 0, kills: 0, hits: 0, contactReunions: 0, exhaustionReunions: 0 },
  };
}
