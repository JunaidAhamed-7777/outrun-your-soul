/**
 * Shared simulation contract. The renderer, audio, UI and input layers read these
 * shapes; only src/sim mutates them. Nothing here may import Three.js, the DOM or
 * any Blender-derived data.
 *
 * Coordinates are gameplay-plane tiles (see vec.ts). Times are simulation seconds.
 */
import type { Vec2 } from './vec';

export type EntityId = number;
/** One attack activation. A bolt carries one; each lane activation window gets a fresh one. */
export type AttackId = number;

// ---------------------------------------------------------------------------
// Authored room content (validated data, stable string IDs)
// ---------------------------------------------------------------------------

/** Axis-aligned rectangle: min corner (x, y) plus size. */
export interface RectDef {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type EnemyRole = 'needler' | 'keeper' | 'warden';

export type WakeTrigger =
  | { readonly kind: 'time'; readonly seconds: number }
  | { readonly kind: 'enemyKilled'; readonly enemy: string }
  | { readonly kind: 'bodyWithin'; readonly radius: number }
  | { readonly kind: 'separated' };

export interface EnemySpawn {
  /** Stable authored ID, unique within the room (for saves, tests, scripted hints). */
  readonly id: string;
  readonly role: EnemyRole;
  readonly at: Vec2;
  /** Initial facing (unit-ish vector); renderer orientation and warden guard direction. */
  readonly facing?: Vec2;
  /** Dormant enemies never attack until their wake trigger fires (tutorial teaching rule). */
  readonly dormant?: boolean;
  readonly wake?: WakeTrigger;
  /** Authored initial cycle offset in seconds. Deterministic; no hidden randomness. */
  readonly phase?: number;
}

/** Persistent environmental hazard. Not a projectile, not cuttable, not an enemy. */
export interface LaneDef {
  readonly id: string;
  readonly rect: RectDef;
  /** Full cycle length. Within a cycle: warning from (activeFrom - warnLead), active [activeFrom, activeTo). */
  readonly period: number;
  readonly activeFrom: number;
  readonly activeTo: number;
  readonly warnLead: number;
  readonly phase?: number;
}

export type HintTrigger = 'start' | 'firstSeparation' | 'firstTelegraph' | 'firstLock' | 'cleared' | 'gateWaiting';

export interface HintDef {
  readonly id: string;
  readonly when: HintTrigger;
  readonly text: string;
}

export interface RoomDef {
  readonly id: string;
  readonly name: string;
  /** Playable bounds are [0, width] x [0, height]; the boundary is an implicit wall. */
  readonly width: number;
  readonly height: number;
  readonly walls: readonly RectDef[];
  readonly spawn: Vec2;
  /** Exit gate trigger zone. Usable only when cleared AND reunited. */
  readonly exit: RectDef;
  readonly enemies: readonly EnemySpawn[];
  readonly lanes: readonly LaneDef[];
  readonly hints?: readonly HintDef[];
}

// ---------------------------------------------------------------------------
// Runtime state (mutated in place by stepSim; read-only to everyone else)
// ---------------------------------------------------------------------------

export type BodyMode = 'ready' | 'dash' | 'recover' | 'return' | 'dead' | 'exited';

export interface DashTravel {
  readonly from: Vec2;
  /** Planned endpoint after range/capacity/wall clamps (contact may stop it earlier). */
  readonly to: Vec2;
  /** Seconds elapsed since departure. */
  elapsed: number;
  readonly duration: number;
}

export interface BodyState {
  pos: Vec2;
  /** Position at the start of the latest step, for render interpolation only. */
  prevPos: Vec2;
  mode: BodyMode;
  dash: DashTravel | null;
  recoverLeft: number;
  /** Last movement direction (unit). Presentation and warden guard checks. */
  facing: Vec2;
}

export interface SoulState {
  pos: Vec2;
  prevPos: Vec2;
  /** Multiplier on params.soulSpeed (relic effects); 1 by default. */
  speedMultiplier: number;
  /** Seconds remaining on a timed speed effect; 0 when none. */
  boostLeft: number;
}

/**
 * Outstanding living tether as an ordered polyline from soul (index 0) to body (last).
 * Empty array means body and soul are reunited. When separated, points[0] equals
 * soul.pos and points[points.length - 1] equals body.pos.
 */
export interface RouteState {
  points: Vec2[];
  /** Cached total arc length; must equal the summed segment lengths within tolerance. */
  length: number;
}

export type EnemyPhase = 'dormant' | 'idle' | 'tracking' | 'locked' | 'recover' | 'dead';

export interface EnemyState {
  readonly id: EntityId;
  /** Authored room ID (EnemySpawn.id). */
  readonly key: string;
  readonly role: EnemyRole;
  readonly pos: Vec2;
  readonly radius: number;
  phase: EnemyPhase;
  /** Seconds spent in the current phase. */
  phaseTime: number;
  /** Duration of the current phase (Infinity for dormant/dead). */
  phaseDuration: number;
  /** Current aim direction (unit). While 'locked' it never changes. */
  aim: Vec2;
  /** Which endpoint the role aims at. */
  readonly target: 'body' | 'soul';
  /** Activation ID reserved when the warning locks; carried by the fired bolt. */
  attackId: AttackId | null;
  facing: Vec2;
}

export interface ProjectileState {
  readonly id: EntityId;
  readonly attackId: AttackId;
  readonly sourceId: EntityId;
  pos: Vec2;
  prevPos: Vec2;
  /** Tiles per second. Glass Lantern may scale effective speed inside its halo. */
  readonly vel: Vec2;
  readonly radius: number;
  age: number;
  alive: boolean;
}

export type LaneStatus = 'idle' | 'warning' | 'active';

export interface LaneState {
  readonly id: EntityId;
  readonly key: string;
  readonly rect: RectDef;
  status: LaneStatus;
  /** Fresh per activation window; null while idle/warning. */
  attackId: AttackId | null;
  /** Seconds into the current cycle, for presentation. */
  cycleTime: number;
}

/** sealed: enemies remain. ready: cleared but body and soul are separated. open: cleared and reunited. */
export type GateStatus = 'sealed' | 'ready' | 'open';
export type Outcome = 'playing' | 'victory' | 'defeat';

/** Parameters fixed at room entry from tuning plus loadout. Relics change these, never inline constants. */
export interface RoomParams {
  readonly soulSpeed: number;
  readonly tetherCapacity: number;
  readonly dashMaxDistance: number;
}

export interface RunStats {
  dashes: number;
  returns: number;
  cuts: number;
  kills: number;
  hits: number;
  contactReunions: number;
  exhaustionReunions: number;
}

export interface SimState {
  readonly rulesVersion: number;
  readonly room: RoomDef;
  readonly params: RoomParams;
  tick: number;
  time: number;
  /** Rules RNG (uint32 state). Decorative randomness must use a separate generator. */
  rng: number;
  nextId: number;
  health: number;
  readonly maxHealth: number;
  graceLeft: number;
  /** Attack activations that already dealt damage; one attack ID damages at most once. */
  damagedAttackIds: Set<AttackId>;
  body: BodyState;
  soul: SoulState;
  route: RouteState;
  /** True once the pair separated beyond combined radii + tolerance since the last reunion. */
  contactArmed: boolean;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  lanes: LaneState[];
  gate: GateStatus;
  outcome: Outcome;
  /** One visible queued intent (input buffer); never a chain. */
  buffered: Command | null;
  bufferedAge: number;
  stats: RunStats;
}

// ---------------------------------------------------------------------------
// Commands (input -> sim) and previews
// ---------------------------------------------------------------------------

export type Command =
  /** aim: desired displacement from the body in tiles. The sim clamps it exactly as previewDash does. */
  | { readonly kind: 'dash'; readonly aim: Vec2 }
  | { readonly kind: 'return' };

export type RejectReason =
  | 'tooShort'
  | 'noCapacity'
  | 'vertexLimit'
  | 'blocked'
  | 'busy'
  | 'notSeparated'
  | 'ended';

export type DashLimit = 'none' | 'range' | 'capacity' | 'wall' | 'contact';

export interface DashPreview {
  readonly valid: boolean;
  readonly reason?: RejectReason;
  readonly from: Vec2;
  /** Endpoint before clamps (body + aim clamped only to dash range). */
  readonly requestedEnd: Vec2;
  /** Actual endpoint execution will reach: wall, capacity, vertex and predicted contact applied. */
  readonly end: Vec2;
  readonly limitedBy: DashLimit;
  /** Predicted genuine body-soul contact during this dash, if any. end === contact.at then. */
  readonly contact: { readonly at: Vec2; readonly soulAt: Vec2 } | null;
  /** Tether capacity free when the dash completes (the full capacity when it ends in a reunion). */
  readonly capacityAfter: number;
  /** Seconds for the soul to reach the dash endpoint along the route at current speed (forecast). */
  readonly soulArrivalSeconds: number;
  /** True when the command would be queued (body busy) rather than executed now. */
  readonly queued: boolean;
}

export interface ReturnPreview {
  readonly valid: boolean;
  readonly reason?: RejectReason;
  /** Predicted meeting point when body (returning) and soul (following) consume the route. */
  readonly meetAt: Vec2 | null;
  readonly seconds: number;
}

// ---------------------------------------------------------------------------
// Events (sim -> presentation). `t` is the exact simulation time of the event.
// ---------------------------------------------------------------------------

export type SimEvent =
  | { readonly type: 'dashStart'; readonly t: number; readonly from: Vec2; readonly to: Vec2; readonly limitedBy: DashLimit }
  | { readonly type: 'dashEnd'; readonly t: number; readonly at: Vec2; readonly reason: 'arrived' | 'contact' }
  | { readonly type: 'ready'; readonly t: number }
  | { readonly type: 'returnStart'; readonly t: number; readonly from: Vec2 }
  | { readonly type: 'returnStop'; readonly t: number; readonly at: Vec2; readonly reason: 'reunited' | 'interrupted' }
  | { readonly type: 'separated'; readonly t: number }
  | { readonly type: 'reunion'; readonly t: number; readonly at: Vec2; readonly cause: 'contact' | 'exhaustion' | 'return' }
  | { readonly type: 'cut'; readonly t: number; readonly projectileId: EntityId; readonly at: Vec2 }
  | { readonly type: 'kill'; readonly t: number; readonly enemyId: EntityId; readonly role: EnemyRole; readonly at: Vec2 }
  | { readonly type: 'hit'; readonly t: number; readonly endpoint: 'body' | 'soul'; readonly attackId: AttackId; readonly at: Vec2; readonly health: number; readonly source: 'bolt' | 'lane' }
  | { readonly type: 'shielded'; readonly t: number; readonly endpoint: 'body' | 'soul'; readonly attackId: AttackId; readonly at: Vec2; readonly reason: 'grace' | 'dash' | 'spent' }
  | { readonly type: 'wake'; readonly t: number; readonly enemyId: EntityId }
  | { readonly type: 'telegraph'; readonly t: number; readonly enemyId: EntityId; readonly phase: 'tracking' | 'locked'; readonly target: 'body' | 'soul' }
  | { readonly type: 'fire'; readonly t: number; readonly enemyId: EntityId; readonly projectileId: EntityId; readonly attackId: AttackId; readonly at: Vec2 }
  | { readonly type: 'projectileGone'; readonly t: number; readonly projectileId: EntityId; readonly at: Vec2; readonly reason: 'wall' | 'range' | 'endpoint' }
  | { readonly type: 'lane'; readonly t: number; readonly laneId: EntityId; readonly status: LaneStatus }
  | { readonly type: 'gate'; readonly t: number; readonly status: GateStatus }
  | { readonly type: 'roomCleared'; readonly t: number }
  | { readonly type: 'victory'; readonly t: number }
  | { readonly type: 'defeat'; readonly t: number }
  | { readonly type: 'rejected'; readonly t: number; readonly command: Command['kind']; readonly reason: RejectReason }
  | { readonly type: 'queued'; readonly t: number; readonly command: Command['kind'] }
  | { readonly type: 'queueExpired'; readonly t: number };

export type SimEventType = SimEvent['type'];
