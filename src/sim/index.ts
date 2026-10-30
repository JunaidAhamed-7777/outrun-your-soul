/**
 * Public simulation API. Everything outside src/sim talks to the rules through these
 * functions and the types in ./types. Deterministic: same room, seed and command
 * sequence per tick produce identical state and events.
 */
import type { Command, DashPreview, ReturnPreview, RoomDef, SimEvent, SimState } from './types';
import type { Vec2 } from './vec';

export * from './types';
export { TUNING, STEP_SECONDS } from './tuning';

export interface SimOptions {
  readonly seed: number;
  /** Overrides for room-entry parameters (relic effects later). */
  readonly params?: Partial<SimState['params']>;
  readonly health?: number;
}

/** Build the room-entry state. Body and soul start co-located and reunited at room.spawn. */
export function createSim(_room: RoomDef, _options: SimOptions): SimState {
  throw new Error('createSim: not implemented yet');
}

/**
 * Advance exactly one fixed step (STEP_SECONDS). Commands are applied at the start
 * of the step in array order; at most one action command is honoured per step.
 * Returns the events produced during the step in event-time order.
 */
export function stepSim(_state: SimState, _commands: readonly Command[]): SimEvent[] {
  throw new Error('stepSim: not implemented yet');
}

/** Same clamps and contact prediction execution uses. Pure: never mutates state. */
export function previewDash(_state: SimState, _aim: Vec2): DashPreview {
  throw new Error('previewDash: not implemented yet');
}

/** Pure forecast of a RETURN issued now. */
export function previewReturn(_state: SimState): ReturnPreview {
  throw new Error('previewReturn: not implemented yet');
}

/** Returns human-readable invariant violations (empty when healthy). Used by tests and dev builds. */
export function checkInvariants(_state: SimState): string[] {
  throw new Error('checkInvariants: not implemented yet');
}
