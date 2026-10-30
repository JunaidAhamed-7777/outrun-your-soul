/**
 * Public simulation API. Everything outside src/sim talks to the rules through these
 * functions and the types in ./types. Deterministic: same room, seed and command
 * sequence per tick produce identical state and events.
 */
import { createSim as create, type CreateOptions } from './create';
import { checkInvariants as check } from './invariants';
import { previewDash as dashForecast, previewReturn as returnForecast } from './preview';
import { stepInternal } from './step';
export { wakeByKey } from './step';
import type { Command, DashPreview, ReturnPreview, RoomDef, SimEvent, SimState } from './types';
import type { Vec2 } from './vec';

export * from './types';
export { TUNING, STEP_SECONDS } from './tuning';
export { ENEMY_TUNING, BOLT_MAX_AGE } from './enemies';
export { RULES_VERSION } from './create';
export { cloneState } from './preview';

export interface SimOptions extends CreateOptions {}

/** Build the room-entry state. Body and soul start co-located and reunited at room.spawn. */
export function createSim(room: RoomDef, options: SimOptions): SimState {
  return create(room, options);
}

/**
 * Advance exactly one fixed step (STEP_SECONDS). Commands are applied at the start
 * of the step in array order; at most one action command is honoured per step.
 * Returns the events produced during the step in event-time order.
 */
export function stepSim(state: SimState, commands: readonly Command[]): SimEvent[] {
  return stepInternal(state, commands);
}

/** Same clamps and contact prediction execution uses. Pure: never mutates state. */
export function previewDash(state: SimState, aim: Vec2): DashPreview {
  return dashForecast(state, aim);
}

/** Pure forecast of a RETURN issued now. */
export function previewReturn(state: SimState): ReturnPreview {
  return returnForecast(state);
}

/** Returns human-readable invariant violations (empty when healthy). Used by tests and dev builds. */
export function checkInvariants(state: SimState): string[] {
  return check(state);
}
