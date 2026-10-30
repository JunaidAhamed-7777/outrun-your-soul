import { expect } from 'vitest';
import { checkInvariants, createSim, stepSim, STEP_SECONDS } from '../../src/sim';
import type {
  Command,
  EnemySpawn,
  LaneDef,
  ProjectileState,
  RectDef,
  RoomDef,
  SimEvent,
  SimState,
} from '../../src/sim/types';
import type { Vec2 } from '../../src/sim/vec';

export interface RoomSpec {
  width?: number;
  height?: number;
  walls?: RectDef[];
  spawn?: Vec2;
  exit?: RectDef;
  enemies?: EnemySpawn[];
  lanes?: LaneDef[];
}

export function makeRoom(spec: RoomSpec = {}): RoomDef {
  return {
    id: 'test',
    name: 'Test Room',
    width: spec.width ?? 12,
    height: spec.height ?? 12,
    walls: spec.walls ?? [],
    spawn: spec.spawn ?? { x: 2, y: 2 },
    exit: spec.exit ?? { x: 10, y: 11, w: 2, h: 1 },
    enemies: spec.enemies ?? [],
    lanes: spec.lanes ?? [],
  };
}

export function makeSim(spec: RoomSpec = {}, seed = 1): SimState {
  return createSim(makeRoom(spec), { seed });
}

/** Step once and assert invariants. */
export function step(state: SimState, commands: Command[] = []): SimEvent[] {
  const events = stepSim(state, commands);
  const errors = checkInvariants(state);
  if (errors.length > 0) {
    throw new Error(`Invariant violation at tick ${state.tick}: ${errors.join('; ')}`);
  }
  return events;
}

/** Step until `until` returns true for an event or the state (max steps), collecting events. */
export function run(
  state: SimState,
  opts: { steps?: number; seconds?: number; first?: Command[]; until?: (e: SimEvent, s: SimState) => boolean },
): SimEvent[] {
  const max = opts.steps ?? Math.round((opts.seconds ?? 5) / STEP_SECONDS);
  const all: SimEvent[] = [];
  for (let i = 0; i < max; i++) {
    const events = step(state, i === 0 ? (opts.first ?? []) : []);
    all.push(...events);
    if (opts.until && events.some((e) => opts.until!(e, state))) break;
  }
  return all;
}

export const dash = (x: number, y: number): Command => ({ kind: 'dash', aim: { x, y } });
export const ret: Command = { kind: 'return' };

export function ofType<T extends SimEvent['type']>(events: SimEvent[], type: T): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

/** Inject a hostile bolt directly (test fixture for timing cases). */
export function spawnBolt(
  state: SimState,
  pos: Vec2,
  vel: Vec2,
  opts: { radius?: number; attackId?: number } = {},
): ProjectileState {
  const bolt: ProjectileState = {
    id: state.nextId++,
    attackId: opts.attackId ?? state.nextId++,
    sourceId: 0,
    pos,
    prevPos: pos,
    vel,
    radius: opts.radius ?? 0.15,
    age: 0,
    alive: true,
  };
  state.projectiles.push(bolt);
  return bolt;
}

export function expectClose(a: Vec2, b: Vec2, digits = 6): void {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
}

/** JSON with Sets serialised as sorted arrays, for determinism comparisons. */
export function serialise(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (v instanceof Set ? [...v].sort() : v));
}
