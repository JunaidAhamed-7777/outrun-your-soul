/**
 * Simulation event -> sound cue mapping. Pure and exhaustive over SimEvent types, so
 * the compiler flags any new event that has not been given a sound decision.
 *
 * The two-speed premise in sound: an outward dash is a bright pluck from the body,
 * answered a moment later by the soul's softer, lower chime of the same pitch class.
 * A reunion resolves both into one chord.
 */
import type { EnemyRole, SimEvent, SimEventType, SimState } from '../sim/types';
import type { Vec2 } from '../sim/vec';

export type CueName =
  | 'dashPluck'
  | 'soulChime'
  | 'tug'
  | 'reunionChord'
  | 'returnSwell'
  | 'cutTing'
  | 'killThock'
  | 'trackTick'
  | 'lockTick'
  | 'fireWhoosh'
  | 'hitCrunch'
  | 'shieldTick'
  | 'fizzle'
  | 'laneWarn'
  | 'laneOn'
  | 'laneOff'
  | 'gateReady'
  | 'gateOpen'
  | 'victory'
  | 'defeat'
  | 'rejectClick'
  | 'queuedTick'
  | 'wake'
  // Run interface stingers (played through GameAudio.ui).
  | 'select'
  | 'relicTake'
  | 'roomSting'
  | 'endingEscaped'
  | 'endingFailed'
  // Relic and warden events (mapped defensively by event type string).
  | 'boost'
  | 'bellCharge'
  | 'bellBurst'
  | 'decoyPlace'
  | 'decoyTake'
  | 'guardClang'
  | 'sweepWhoosh'
  | 'exposedChime'
  // Final simulation events (phase 3).
  | 'boostEnd'
  | 'haloShimmer'
  | 'knotMark'
  | 'decoyClaim'
  | 'wardenWindup'
  | 'bossWake'
  | 'bossTelegraph'
  | 'bossCharge'
  | 'bossFan'
  | 'bossHeartHit'
  | 'bossStagger'
  | 'bossReunite'
  | 'bossDefeated';

export interface CueRequest {
  readonly cue: CueName;
  /** Seconds after "now" to start. */
  readonly delay: number;
  /** Scale degree for pitched cues (see scale.ts). */
  readonly degree: number;
  /** 0..1 loudness/brightness scaler. */
  readonly intensity: number;
  /** -1 (left) .. 1 (right). */
  readonly pan: number;
  /** Cue-specific flavour, e.g. reunion cause or hit endpoint. */
  readonly variant: string;
}

/** What the mapper needs from the current state. */
export interface CueContext {
  readonly roomWidth: number;
  readonly dashMax: number;
  /** Role of an enemy by entity ID (warden windups share the 'telegraph' event with sentries). */
  readonly roleOf?: (enemyId: number) => EnemyRole | undefined;
}

/** Small memory carried between events (e.g. the last dash pitch the soul will echo). */
export interface CueMemory {
  lastDashDegree: number;
}

export function createCueMemory(): CueMemory {
  return { lastDashDegree: 4 };
}

export function cueContext(state: Pick<SimState, 'room' | 'params'> & Partial<Pick<SimState, 'enemies'>>): CueContext {
  const enemies = state.enemies ?? [];
  return {
    roomWidth: state.room.width,
    dashMax: state.params.dashMaxDistance,
    roleOf: (id) => enemies.find((e) => e.id === id)?.role,
  };
}

/** Stereo position from a world x, kept away from hard left/right. */
export function panFor(p: Vec2 | undefined, ctx: CueContext): number {
  if (!p || !(ctx.roomWidth > 0) || typeof p.x !== 'number' || !Number.isFinite(p.x)) return 0;
  const u = (p.x / ctx.roomWidth) * 2 - 1;
  return Math.max(-1, Math.min(1, u)) * 0.65;
}

const cue = (name: CueName, over: Partial<Omit<CueRequest, 'cue'>> = {}): CueRequest => ({
  cue: name,
  delay: 0,
  degree: 0,
  intensity: 0.8,
  pan: 0,
  variant: '',
  ...over,
});

/** Dash degree grows with distance: short hops sit low, full dashes ring higher. */
export function dashDegree(distance: number, dashMax: number): number {
  const f = dashMax > 0 ? Math.max(0, Math.min(1, distance / dashMax)) : 0.5;
  return 2 + Math.round(f * 4);
}

/** Soul answers after a beat that lengthens slightly with the distance it must travel. */
export function soulEchoDelay(distance: number): number {
  return 0.3 + Math.min(0.25, Math.max(0, distance) * 0.06);
}

type Handler<T extends SimEventType> = (
  e: Extract<SimEvent, { type: T }>,
  ctx: CueContext,
  mem: CueMemory,
) => CueRequest[];

/**
 * Typed handlers for known event types. Partial on purpose: when the simulation adds
 * event types, this table keeps compiling and the string-keyed table below (or
 * silence) covers them until they get a typed entry.
 */
const HANDLERS: { readonly [T in SimEventType]?: Handler<T> } = {
  dashStart: (e, ctx, mem) => {
    const d = Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y);
    const degree = dashDegree(d, ctx.dashMax);
    mem.lastDashDegree = degree;
    const f = ctx.dashMax > 0 ? Math.min(1, d / ctx.dashMax) : 0.6;
    return [
      cue('dashPluck', { degree, intensity: 0.6 + 0.4 * f, pan: panFor(e.to, ctx) }),
      cue('soulChime', { degree, delay: soulEchoDelay(d), intensity: 0.55, pan: panFor(e.from, ctx) }),
    ];
  },
  dashEnd: () => [],
  ready: () => [],
  returnStart: (e, ctx) => [cue('returnSwell', { pan: panFor(e.from, ctx), intensity: 0.7 })],
  returnStop: () => [],
  separated: () => [cue('tug', { intensity: 0.45 })],
  reunion: (e, ctx, mem) => [
    cue('reunionChord', {
      variant: e.cause,
      degree: mem.lastDashDegree,
      intensity: e.cause === 'contact' ? 1 : e.cause === 'return' ? 0.75 : 0.6,
      pan: panFor(e.at, ctx),
    }),
  ],
  cut: (e, ctx) => [cue('cutTing', { pan: panFor(e.at, ctx), intensity: 0.9 })],
  // A burst kill is part of the bell's toll; keep its own thock small so the toll leads.
  kill: (e, ctx) =>
    e.cause === 'burst'
      ? [cue('killThock', { pan: panFor(e.at, ctx), variant: 'burst', intensity: 0.45, delay: 0.06 })]
      : [cue('killThock', { pan: panFor(e.at, ctx), variant: e.role, intensity: 0.9 })],
  hit: (e, ctx) => [cue('hitCrunch', { pan: panFor(e.at, ctx), variant: e.endpoint, intensity: 1 })],
  shielded: (e, ctx) => [cue('shieldTick', { pan: panFor(e.at, ctx), variant: e.reason, intensity: 0.5 })],
  wake: () => [cue('wake', { intensity: 0.6 })],
  telegraph: (e, ctx) => {
    // A warden's windup is a low metal scrape, never a sentry's high tick.
    if (ctx.roleOf?.(e.enemyId) === 'warden') return [cue('wardenWindup', { intensity: 0.85 })];
    return e.phase === 'tracking'
      ? [cue('trackTick', { variant: e.target, intensity: 0.5 })]
      : [cue('lockTick', { variant: e.target, intensity: 0.9 })];
  },
  fire: (e, ctx) => [cue('fireWhoosh', { pan: panFor(e.at, ctx), intensity: 0.7 })],
  projectileGone: (e, ctx) =>
    e.reason === 'endpoint' ? [] : [cue('fizzle', { pan: panFor(e.at, ctx), intensity: 0.3 })],
  lane: (e) =>
    e.status === 'warning'
      ? [cue('laneWarn', { intensity: 0.6 })]
      : e.status === 'active'
        ? [cue('laneOn', { intensity: 0.8 })]
        : [cue('laneOff', { intensity: 0.5 })],
  gate: (e) =>
    e.status === 'ready'
      ? [cue('gateReady', { intensity: 0.7 })]
      : e.status === 'open'
        ? [cue('gateOpen', { intensity: 0.9 })]
        : [],
  roomCleared: () => [],
  victory: () => [cue('victory', { intensity: 1 })],
  defeat: () => [cue('defeat', { intensity: 1 })],
  rejected: () => [cue('rejectClick', { intensity: 0.5 })],
  queued: () => [cue('queuedTick', { intensity: 0.4 })],
  queueExpired: () => [cue('rejectClick', { intensity: 0.3, variant: 'expired' })],
  guarded: (e, ctx) => [cue('guardClang', { pan: panFor(e.at, ctx), intensity: 0.9 })],
  sweep: (e, ctx) => [cue('sweepWhoosh', { pan: panFor(e.at, ctx), intensity: 0.9 })],
  boost: (e, ctx) => [cue('boost', { pan: panFor(e.at, ctx), intensity: 0.7 })],
  boostEnd: () => [cue('boostEnd', { intensity: 0.4 })],
  // Halo crossings happen often; they whisper, never compete with threats.
  haloEnter: (e, ctx) => [cue('haloShimmer', { pan: panFor(e.at, ctx), variant: 'enter', intensity: 0.35 })],
  haloExit: (e, ctx) => [cue('haloShimmer', { pan: panFor(e.at, ctx), variant: 'exit', intensity: 0.25 })],
  charge: (e, ctx) => [
    cue('bellCharge', {
      pan: panFor(e.at, ctx),
      variant: e.charged ? 'full' : 'pip',
      degree: Math.max(0, Math.min(6, e.charge * 2)),
      intensity: e.charged ? 0.9 : 0.55,
    }),
  ],
  burst: (e, ctx) => [cue('bellBurst', { pan: panFor(e.at, ctx), intensity: 1 })],
  knotMarked: () => [cue('knotMark', { intensity: 0.6 })],
  decoyPlaced: (e, ctx) => [cue('decoyPlace', { pan: panFor(e.at, ctx), intensity: 0.7 })],
  decoyClaimed: (e, ctx) => [cue('decoyClaim', { pan: panFor(e.at, ctx), intensity: 0.7 })],
  decoyTaken: (e, ctx) => [cue('decoyTake', { pan: panFor(e.at, ctx), intensity: 0.7 })],
  boss: (e, ctx) => {
    const pan = panFor(e.at, ctx);
    switch (e.what) {
      case 'wake':
        return [cue('bossWake', { pan, intensity: 1 })];
      case 'telegraph':
        return [cue('bossTelegraph', { pan, variant: e.pattern ?? 'charge', intensity: 0.95 })];
      case 'charge':
        return [cue('bossCharge', { pan, intensity: 1 })];
      case 'fan':
        return [cue('bossFan', { pan, intensity: 0.9 })];
      case 'heartHit':
        return [cue('bossHeartHit', { pan, intensity: 1 })];
      case 'stagger':
        return [cue('bossStagger', { pan, intensity: 0.9 })];
      case 'reunited':
        return [cue('bossReunite', { pan, intensity: 0.75 })];
      case 'defeated':
        return [cue('bossDefeated', { intensity: 1 })];
      default:
        return [];
    }
  },
};

/** Read a position from an event that may not be typed yet ({ at } or { pos }). */
export function pointOf(e: unknown): Vec2 | undefined {
  if (typeof e !== 'object' || e === null) return undefined;
  const r = e as Record<string, unknown>;
  for (const key of ['at', 'pos', 'to']) {
    const v = r[key];
    if (typeof v === 'object' && v !== null) {
      const { x, y } = v as Record<string, unknown>;
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    }
  }
  return undefined;
}

type LooseHandler = (e: unknown, ctx: CueContext, mem: CueMemory) => CueRequest[];

const one = (name: CueName, intensity: number): LooseHandler => (e, ctx) => [
  cue(name, { pan: panFor(pointOf(e), ctx), intensity }),
];

/**
 * Relic and warden events announced by the simulation work in progress. Keyed by the
 * event type string (with a few likely spellings) so new events sound right as soon as
 * they exist, and unknown types stay silent instead of throwing.
 */
export const LOOSE_HANDLERS: Readonly<Record<string, LooseHandler>> = {
  boost: one('boost', 0.7),
  soulBoost: one('boost', 0.7),
  charge: one('bellCharge', 0.8),
  bellCharge: one('bellCharge', 0.8),
  bellCharged: one('bellCharge', 0.8),
  burst: one('bellBurst', 1),
  bellBurst: one('bellBurst', 1),
  decoyPlaced: one('decoyPlace', 0.7),
  decoyPlace: one('decoyPlace', 0.7),
  decoyTaken: one('decoyTake', 0.7),
  decoyConsumed: one('decoyTake', 0.7),
  guarded: one('guardClang', 0.9),
  guard: one('guardClang', 0.9),
  sweep: one('sweepWhoosh', 0.85),
  wardenSweep: one('sweepWhoosh', 0.85),
  exposed: one('exposedChime', 0.8),
  opening: one('exposedChime', 0.8),
};

export function cuesForEvent(e: SimEvent, ctx: CueContext, mem: CueMemory): CueRequest[] {
  const type = (e as { type?: unknown }).type;
  if (typeof type !== 'string') return [];
  const typed = Object.prototype.hasOwnProperty.call(HANDLERS, type)
    ? (HANDLERS as Record<string, Handler<SimEventType> | undefined>)[type]
    : undefined;
  if (typed) return typed(e as never, ctx, mem);
  const loose = Object.prototype.hasOwnProperty.call(LOOSE_HANDLERS, type) ? LOOSE_HANDLERS[type] : undefined;
  return loose ? loose(e, ctx, mem) : [];
}

/** Cues that would read as offence; RETURN must never trigger these. */
export const ATTACK_CUES: ReadonlySet<CueName> = new Set(['cutTing', 'killThock', 'dashPluck']);
