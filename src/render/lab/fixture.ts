/**
 * Hand-built SimState fixtures for the render lab and render tests. These are NOT the
 * game rules: they only produce plausible shapes so presentation can be developed while
 * the authoritative simulation is built elsewhere.
 */
import type { EnemyRole, EnemyState, LaneState, ProjectileState, RoomDef, SimState } from '../../sim/types';
import { TUNING } from '../../sim/tuning';
import type { Vec2 } from '../../sim/vec';

export const LAB_ROOM: RoomDef = {
  id: 'render_lab',
  name: 'Render Lab Court',
  width: 8,
  height: 12,
  walls: [
    { x: 1, y: 6, w: 2, h: 1 },
    { x: 5, y: 4, w: 2, h: 1 },
    { x: 4, y: 8, w: 1, h: 2 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    { id: 'n1', role: 'needler', at: { x: 2, y: 9 }, facing: { x: 0, y: -1 } },
    { id: 'k1', role: 'keeper', at: { x: 6.5, y: 7.5 }, facing: { x: -1, y: -1 } },
    { id: 'n2', role: 'needler', at: { x: 6.3, y: 2.4 }, facing: { x: -1, y: 0 }, dormant: true },
  ],
  lanes: [{ id: 'l1', rect: { x: 0, y: 3, w: 4.5, h: 0.75 }, period: 6, activeFrom: 3, activeTo: 5, warnLead: 1.2 }],
};

export function makeEnemy(id: number, key: string, role: EnemyRole, pos: Vec2, phase: EnemyState['phase'], aim: Vec2): EnemyState {
  const l = Math.hypot(aim.x, aim.y) || 1;
  return {
    id,
    key,
    role,
    pos,
    radius: 0.42,
    phase,
    phaseTime: 0,
    phaseDuration: phase === 'locked' ? 0.6 : phase === 'tracking' ? 0.9 : 1.7,
    aim: { x: aim.x / l, y: aim.y / l },
    target: role === 'keeper' ? 'soul' : 'body',
    attackId: null,
    facing: { x: aim.x / l, y: aim.y / l },
  };
}

export function makeProjectile(id: number, pos: Vec2, vel: Vec2): ProjectileState {
  return { id, attackId: id + 1000, sourceId: 1, pos, prevPos: pos, vel, radius: 0.15, age: 0, alive: true };
}

export function makeLane(id: number, room: RoomDef, status: LaneState['status']): LaneState {
  const def = room.lanes[0]!;
  return { id, key: def.id, rect: def.rect, status, attackId: status === 'active' ? 77 : null, cycleTime: 0 };
}

/**
 * Phase-2 presentation fixture: warden mid-sweep, relic state (halo, boost, bell, decoy) and a
 * boss structure. Uses optional fields the simulation is adding; cast because they are not yet
 * part of SimState.
 */
export function makeFeatureState(room: RoomDef = LAB_ROOM): SimState {
  const s = makeFixtureState(room);
  const warden = {
    ...makeEnemy(4, 'w1', 'warden', { x: 5.6, y: 10.2 }, 'locked', { x: -1.2, y: -2.5 }),
    radius: 0.55,
    facing: { x: 0, y: -1 },
    phaseTime: 0.4,
    phaseDuration: 0.6,
  } as EnemyState;
  s.enemies = [...s.enemies, warden];
  s.soul = { ...s.soul, boostLeft: 0.6 };
  s.projectiles = [...s.projectiles, makeProjectile(12, { x: 4.6, y: 2.6 }, { x: -3, y: 1.5 })];
  Object.assign(s, {
    relicState: { equipped: ['glass_lantern', 'mourning_bell'], haloRadius: 1.25, bellCharge: 1, bellChargeMax: 2, decoy: { x: 6.6, y: 5.6 } },
    boss: {
      body: { pos: { x: 1.4, y: 10.6 } },
      heart: { pos: { x: 1.0, y: 8.2 } },
      route: { points: [{ x: 1.0, y: 8.2 }, { x: 1.0, y: 9.6 }, { x: 1.4, y: 10.6 }] },
    },
  });
  return s;
}

/** A separated pair with a cornered route, enemies in several phases, bolts and a lane. */
export function makeFixtureState(room: RoomDef = LAB_ROOM): SimState {
  const route: Vec2[] = [
    { x: 4, y: 2.2 },
    { x: 4, y: 3.6 },
    { x: 2.4, y: 4.6 },
    { x: 3.4, y: 5.4 },
  ];
  const body = route[route.length - 1]!;
  const soul = route[0]!;
  let length = 0;
  for (let i = 1; i < route.length; i++) length += Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.y - route[i - 1]!.y);
  return {
    rulesVersion: 0,
    room,
    params: { soulSpeed: TUNING.soulSpeed, tetherCapacity: TUNING.tetherCapacity, dashMaxDistance: TUNING.dashMaxDistance },
    tick: 0,
    time: 0,
    rng: 1,
    nextId: 100,
    health: 4,
    maxHealth: TUNING.maxHealth,
    graceLeft: 0,
    damagedAttackIds: new Set(),
    body: { pos: body, prevPos: body, mode: 'ready', dash: null, recoverLeft: 0, facing: { x: 1, y: 0.8 } },
    soul: { pos: soul, prevPos: soul, speedMultiplier: 1, boostLeft: 0 },
    route: { points: route, length },
    contactArmed: true,
    enemies: [
      makeEnemy(1, 'n1', 'needler', { x: 2, y: 9 }, 'tracking', { x: 1.4, y: -3.6 }),
      // Keeper forecast: locked on the soul's predicted point on the ribbon (optional sim field).
      { ...makeEnemy(2, 'k1', 'keeper', { x: 6.5, y: 7.5 }, 'locked', { x: -2.5, y: -4.5 }), lockTarget: { x: 4, y: 3 } } as EnemyState,
      makeEnemy(3, 'n2', 'needler', { x: 6.3, y: 2.4 }, 'dormant', { x: -1, y: 0 }),
    ],
    projectiles: [makeProjectile(10, { x: 5.4, y: 6.1 }, { x: -2.5, y: -4.5 }), makeProjectile(11, { x: 1.2, y: 7.6 }, { x: 0.4, y: 5.9 })],
    lanes: [makeLane(20, room, 'active')],
    gate: 'sealed',
    outcome: 'playing',
    buffered: null,
    bufferedAge: 0,
    stats: { dashes: 0, returns: 0, cuts: 0, kills: 0, hits: 0, contactReunions: 0, exhaustionReunions: 0 },
  };
}
