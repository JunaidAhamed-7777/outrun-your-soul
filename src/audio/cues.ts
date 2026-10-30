/**
 * Simulation event -> sound cue mapping. Pure and exhaustive over SimEvent types, so
 * the compiler flags any new event that has not been given a sound decision.
 *
 * The two-speed premise in sound: an outward dash is a bright pluck from the body,
 * answered a moment later by the soul's softer, lower chime of the same pitch class.
 * A reunion resolves both into one chord.
 */
import type { SimEvent, SimEventType, SimState } from '../sim/types';
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
  | 'wake';

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
}

/** Small memory carried between events (e.g. the last dash pitch the soul will echo). */
export interface CueMemory {
  lastDashDegree: number;
}

export function createCueMemory(): CueMemory {
  return { lastDashDegree: 4 };
}

export function cueContext(state: Pick<SimState, 'room' | 'params'>): CueContext {
  return { roomWidth: state.room.width, dashMax: state.params.dashMaxDistance };
}

/** Stereo position from a world x, kept away from hard left/right. */
export function panFor(p: Vec2 | undefined, ctx: CueContext): number {
  if (!p || !(ctx.roomWidth > 0)) return 0;
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

const HANDLERS: { readonly [T in SimEventType]: Handler<T> } = {
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
  kill: (e, ctx) => [cue('killThock', { pan: panFor(e.at, ctx), variant: e.role, intensity: 0.9 })],
  hit: (e, ctx) => [cue('hitCrunch', { pan: panFor(e.at, ctx), variant: e.endpoint, intensity: 1 })],
  shielded: (e, ctx) => [cue('shieldTick', { pan: panFor(e.at, ctx), variant: e.reason, intensity: 0.5 })],
  wake: () => [cue('wake', { intensity: 0.6 })],
  telegraph: (e) =>
    e.phase === 'tracking'
      ? [cue('trackTick', { variant: e.target, intensity: 0.5 })]
      : [cue('lockTick', { variant: e.target, intensity: 0.9 })],
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
  // Warden and relic events (added by the simulation; dedicated cues pending from the audio owner).
  guarded: () => [],
  sweep: () => [],
  soulBoost: () => [],
  soulBoostEnd: () => [],
  halo: () => [],
  bellCharge: () => [],
  bellBurst: () => [],
  knotMarked: () => [],
  decoyPlaced: () => [],
  decoyClaimed: () => [],
  decoyConsumed: () => [],
};

export function cuesForEvent(e: SimEvent, ctx: CueContext, mem: CueMemory): CueRequest[] {
  const handler = HANDLERS[e.type] as Handler<SimEventType>;
  return handler(e as never, ctx, mem);
}

/** Cues that would read as offence; RETURN must never trigger these. */
export const ATTACK_CUES: ReadonlySet<CueName> = new Set(['cutTing', 'killThock', 'dashPluck']);
