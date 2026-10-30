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
  /** Not yet arrived: invisible and untouchable (no kill, cut or burst) until woken. Requires dormant. */
  readonly hidden?: boolean;
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
  /** The Last Warden boss, if this is the boss arena (optional; ordinary rooms have none). */
  readonly boss?: BossSpawn;
}

export type BossPatternKind = 'charge' | 'fan';

export interface BossSpawn {
  readonly id: string;
  readonly at: Vec2;
  readonly facing?: Vec2;
  readonly dormant?: boolean;
  readonly wake?: WakeTrigger;
  /**
   * Pattern order per stage (one stage per heart hit). Defaults to BOSS_TUNING.stages:
   * two learned patterns, then a remix. Data, so the arena author can tune it.
   */
  readonly stages?: readonly (readonly BossPatternKind[])[];
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

/** 'exposed' is the warden's opening after its sweep (no guard). */
export type EnemyPhase = 'dormant' | 'idle' | 'tracking' | 'locked' | 'recover' | 'exposed' | 'dead';

export interface EnemyState {
  readonly id: EntityId;
  /** True while a hidden spawn has not arrived yet (see EnemySpawn.hidden). */
  hidden?: boolean;
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
  /**
   * Live point the warning is following while 'tracking': the body for needlers, the
   * soul's forecast position on its route for keepers, or a Traveler's Knot decoy.
   * Null when not aiming. Always populated by the simulation (optional for fixtures).
   */
  aimTarget?: Vec2 | null;
  /** Point the locked shot was aimed at (where the reticle sits); null outside 'locked'. */
  lockTarget?: Vec2 | null;
  /** Warden geometry (radians / tiles), copied from ENEMY_TUNING.warden for presentation. */
  guardHalfAngle?: number;
  sweepRadius?: number;
  sweepHalfAngle?: number;
}

export interface ProjectileState {
  readonly id: EntityId;
  readonly attackId: AttackId;
  readonly sourceId: EntityId;
  pos: Vec2;
  prevPos: Vec2;
  /** Base velocity in tiles per second. Effective velocity is vel * speedScale. */
  readonly vel: Vec2;
  readonly radius: number;
  age: number;
  alive: boolean;
  /** Point the source locked onto when it fired (keeper forecast, needler body, decoy). */
  aimPoint?: Vec2 | null;
  /** Glass Lantern: 1 outside the soul halo, slowFactor inside. Missing means 1. */
  speedScale?: number;
  /** Glass Lantern: whether the bolt is inside the soul halo (and slowed). */
  slowed?: boolean;
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

// ---------------------------------------------------------------------------
// Relics (behavioural hooks; structurally compatible with src/run/relics.ts)
// ---------------------------------------------------------------------------

/**
 * Behavioural relic parameters for one room. Mirrors RelicSimHooks in src/run/relics.ts
 * (the simulation may not import the run layer). Absent keys mean "not equipped".
 * Reach relics (Long Silk, Short Stitch) arrive as RoomParams instead.
 */
export interface SimRelicConfig {
  readonly needlesong?: { readonly boostMultiplier: number; readonly boostSeconds: number };
  readonly glassLantern?: { readonly haloRadius: number; readonly slowFactor: number };
  readonly mourningBell?: { readonly killsPerCharge: number; readonly maxCharges: number; readonly burstRadius: number };
  readonly travelersKnot?: { readonly maxMarks: number; readonly decoyRadius: number };
}

/** Earned relic state carried across rooms (mirrors RelicCharges in src/run/relics.ts). */
export interface SimRelicCharges {
  readonly bellKills: number;
  readonly bellCharged: boolean;
  readonly knotMarked: boolean;
}

/**
 * Live relic state. bellKills / bellCharged / knotMarked are the checkpoint charges
 * (SimRelicCharges). The flat presentation fields (equipped, haloRadius, bellCharge,
 * bellChargeMax, burstRadius, knotReady, decoy) are kept in sync by the simulation for
 * the renderer and HUD.
 */
export interface RelicRuntimeState {
  readonly config: SimRelicConfig;
  /** Behavioural relic IDs equipped in the simulation ('needlesong', 'glass_lantern', ...). */
  readonly equipped: readonly string[];
  /** Glass Lantern halo radius in tiles (the exact speed boundary), or null. */
  readonly haloRadius: number | null;
  /** Mourning Bell burst radius in tiles, or null. */
  readonly burstRadius: number | null;
  /** Mourning Bell: distinct direct dash kills counted toward the next charge. */
  bellKills: number;
  /** Mourning Bell: a burst waiting for the next separated-to-reunited transition. */
  bellCharged: boolean;
  /** Mourning Bell pips: kills toward the charge, or bellChargeMax while charged. */
  bellCharge: number;
  readonly bellChargeMax: number;
  /** Traveler's Knot: an earned mark waiting to become a decoy at the next reunion. */
  knotMarked: boolean;
  /** Presentation alias of knotMarked. */
  knotReady: boolean;
  /** Traveler's Knot: the active decoy's position on the ground (never crosses rooms). */
  decoy: Vec2 | null;
  /** Sentry whose new aim acquisition took the decoy; consumed when that aim locks. */
  decoyClaimedBy: EntityId | null;
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
  /** Health never drops below this (0 normally; 1 in the tutorial, where hits still land but cannot kill). */
  readonly minHealth?: number;
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
  /** Relic runtime state. Always populated by createSim (optional only for test fixtures). */
  relicState?: RelicRuntimeState;
  /** The Last Warden, when the room has one. */
  boss?: BossState | null;
}

/**
 * dormant -> idle -> aimCharge (route telegraphed, frozen) -> charge (body runs the route,
 * heart trails it) -> recover (until the heart catches up) -> idle -> aimFan (bolt lines
 * telegraphed, frozen) -> fire -> idle ... A heart hit staggers it and advances the stage.
 */
export type BossPhase = 'dormant' | 'idle' | 'aimCharge' | 'charge' | 'recover' | 'aimFan' | 'stagger' | 'dead';

export interface BossState {
  readonly id: EntityId;
  readonly key: string;
  phase: BossPhase;
  phaseTime: number;
  phaseDuration: number;
  /** Armoured body (guards every angle). */
  body: { pos: Vec2; prevPos: Vec2; facing: Vec2 };
  /** Vulnerable heart: follows the boss's own route at a slower speed, like the soul. */
  heart: { pos: Vec2; prevPos: Vec2 };
  /** Boss tether, heart (index 0) to body (last); empty when the heart is home. */
  route: RouteState;
  /** Telegraphed charge path starting at the body; frozen once shown. Empty otherwise. */
  path: Vec2[];
  /** Index of the leg currently being run (path[legIndex] -> path[legIndex + 1]). */
  legIndex: number;
  /** Telegraphed fan directions (unit), frozen once shown. Empty otherwise. */
  fan: Vec2[];
  /** Activation ID of the current charge (its body damages endpoints it runs through). */
  attackId: AttackId | null;
  /** Endpoints this charge already met (hit or shielded): each is met at most once per charge. */
  chargeTouched: ('body' | 'soul')[];
  hp: number;
  readonly maxHp: number;
  /** Current stage (0-based); advances with each heart hit. */
  stage: number;
  /** Position in the current stage's pattern list. */
  step: number;
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

/** 'guard': the dash will be stopped by a warden's armoured front. */
export type DashLimit = 'none' | 'range' | 'capacity' | 'wall' | 'contact' | 'guard';

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
  | { readonly type: 'dashEnd'; readonly t: number; readonly at: Vec2; readonly reason: 'arrived' | 'contact' | 'guarded' }
  | { readonly type: 'ready'; readonly t: number }
  | { readonly type: 'returnStart'; readonly t: number; readonly from: Vec2 }
  | { readonly type: 'returnStop'; readonly t: number; readonly at: Vec2; readonly reason: 'reunited' | 'interrupted' }
  | { readonly type: 'separated'; readonly t: number }
  | { readonly type: 'reunion'; readonly t: number; readonly at: Vec2; readonly cause: 'contact' | 'exhaustion' | 'return' }
  | { readonly type: 'cut'; readonly t: number; readonly projectileId: EntityId; readonly at: Vec2 }
  | {
      readonly type: 'kill';
      readonly t: number;
      readonly enemyId: EntityId;
      readonly role: EnemyRole;
      readonly at: Vec2;
      /**
       * 'dash': direct outward-dash kill. 'burst': Mourning Bell burst. 'collapse': the
       * Last Warden fell and its remaining escorts shattered. Only 'dash' earns relic charge.
       */
      readonly cause?: 'dash' | 'burst' | 'collapse';
    }
  | { readonly type: 'hit'; readonly t: number; readonly endpoint: 'body' | 'soul'; readonly attackId: AttackId; readonly at: Vec2; readonly health: number; readonly source: 'bolt' | 'lane' | 'sweep' | 'charge' }
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
  | { readonly type: 'queueExpired'; readonly t: number }
  /** An outward dash struck a warden's guarded front: the dash stops there, nobody is hurt. */
  | { readonly type: 'guarded'; readonly t: number; readonly enemyId: EntityId; readonly at: Vec2 }
  /** A warden's sweep resolved over its frozen sector (fresh attack ID per activation). */
  | {
      readonly type: 'sweep';
      readonly t: number;
      readonly enemyId: EntityId;
      readonly attackId: AttackId;
      readonly at: Vec2;
      readonly facing: Vec2;
      readonly range: number;
      readonly halfAngle: number;
    }
  /** The Last Warden: one event type with a discriminator keeps the surface small. */
  | {
      readonly type: 'boss';
      readonly t: number;
      readonly what: 'wake' | 'telegraph' | 'charge' | 'fan' | 'heartHit' | 'stagger' | 'reunited' | 'defeated';
      readonly at: Vec2;
      readonly pattern?: BossPatternKind;
      /** Telegraphed charge route (for 'telegraph' of a charge). */
      readonly path?: readonly Vec2[];
      /** Telegraphed bolt directions (for 'telegraph' of a fan). */
      readonly directions?: readonly Vec2[];
      readonly hp?: number;
      /** For 'heartHit': what struck the heart. */
      readonly cause?: 'dash' | 'burst';
    }
  /** Needlesong: a cut sped up the soul (refreshes, never stacks). `at` is the soul. */
  | { readonly type: 'boost'; readonly t: number; readonly at: Vec2; readonly multiplier: number; readonly seconds: number }
  | { readonly type: 'boostEnd'; readonly t: number }
  /** Glass Lantern: a bolt crossed into / out of the soul halo (its speed changed). */
  | { readonly type: 'haloEnter'; readonly t: number; readonly projectileId: EntityId; readonly at: Vec2 }
  | { readonly type: 'haloExit'; readonly t: number; readonly projectileId: EntityId; readonly at: Vec2 }
  /** Mourning Bell: progress after a direct dash kill (`charge` of `max` pips; `at` is the body). */
  | { readonly type: 'charge'; readonly t: number; readonly at: Vec2; readonly charge: number; readonly max: number; readonly charged: boolean }
  /** Mourning Bell: the stored charge rang out at a reunion. */
  | { readonly type: 'burst'; readonly t: number; readonly at: Vec2; readonly radius: number; readonly killed: readonly EntityId[] }
  /** Traveler's Knot: a direct dash kill earned a mark. */
  | { readonly type: 'knotMarked'; readonly t: number }
  | { readonly type: 'decoyPlaced'; readonly t: number; readonly at: Vec2 }
  /** A sentry's new aim acquisition took the decoy (tracking toward it). */
  | { readonly type: 'decoyClaimed'; readonly t: number; readonly enemyId: EntityId; readonly at: Vec2 }
  /** The claiming attacker locked onto the decoy; the decoy is gone, the locked line stays. */
  | { readonly type: 'decoyTaken'; readonly t: number; readonly enemyId: EntityId; readonly at: Vec2 };

export type SimEventType = SimEvent['type'];
