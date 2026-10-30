/**
 * Touch gesture state machine (COMBAT_SPEC "Input contract" and "Pointer ownership").
 * Pure and DOM-free: callers inject pointer IDs, CSS-pixel coordinates and times.
 *
 * - One active pointer owns the gesture; any other pointer is ignored entirely.
 * - A short tap that never armed an aim is RETURN.
 * - Crossing the arm distance starts aiming. After the pointer has left the dead zone,
 *   coming back inside it shows a cancel state; releasing there cancels (never RETURN).
 * - A long stationary press does nothing. A press too long for a tap but shorter than a
 *   long press also does nothing: the machine never guesses intent.
 * - Interruption (pointercancel, lost capture, blur, hidden page) cancels without acting.
 */

export interface GestureConfig {
  /** Movement from the press point that arms an outward aim. */
  armDistancePx: number;
  /** Radius around the press point that cancels an armed aim on release. */
  deadZonePx: number;
  /** Longest press (never armed) that still counts as a RETURN tap. */
  tapMaxMs: number;
  /** A never-armed press at least this long is a deliberate no-op. */
  longPressMs: number;
}

/**
 * Provisional thresholds. UNTESTED on real phones: COMBAT_SPEC says thresholds require
 * device testing; record evidence before changing or calling them validated.
 */
export const DEFAULT_GESTURE: GestureConfig = Object.freeze({
  armDistancePx: 14,
  deadZonePx: 16,
  tapMaxMs: 230,
  longPressMs: 420,
});

export type GesturePhase = 'idle' | 'pending' | 'aiming' | 'cancelZone';

export type CancelReason =
  /** Released after pulling an armed aim back into the dead zone. */
  | 'deadZone'
  /** Released a stationary press held at least longPressMs. */
  | 'longPress'
  /** Pointer cancellation, lost capture, blur or hidden page. */
  | 'interrupted'
  /** Released a stationary press too long for a tap but shorter than a long press. */
  | 'ambiguous';

export type GestureOutput =
  /** Armed and outside the dead zone: show the outward preview. */
  | { kind: 'aim'; startX: number; startY: number; x: number; y: number }
  /** Armed but back inside the dead zone: show the cancel state. */
  | { kind: 'aimCancelZone'; startX: number; startY: number; x: number; y: number }
  /** Released while aiming outside the dead zone: commit an outward dash. */
  | { kind: 'dash'; startX: number; startY: number; x: number; y: number }
  /** Short tap that never armed. */
  | { kind: 'return' }
  | { kind: 'cancel'; reason: CancelReason };

/** Read-only view of the gesture in progress, for presentation (e.g. a pending-tap cue). */
export interface GestureSnapshot {
  readonly phase: GesturePhase;
  readonly pointerId: number | null;
  readonly startX: number;
  readonly startY: number;
  readonly x: number;
  readonly y: number;
  readonly startTimeMs: number;
}

const NONE: GestureOutput[] = [];

export function validateGestureConfig(config: GestureConfig): void {
  for (const [name, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`GestureConfig.${name} must be a positive finite number`);
  }
  if (config.tapMaxMs >= config.longPressMs) throw new Error('GestureConfig.tapMaxMs must be shorter than longPressMs');
}

export class GestureMachine {
  readonly config: GestureConfig;
  #phase: GesturePhase = 'idle';
  #pointerId: number | null = null;
  #startX = 0;
  #startY = 0;
  #x = 0;
  #y = 0;
  #startTime = 0;
  /** Whether the armed pointer has been outside the dead zone since arming. */
  #leftDeadZone = false;

  constructor(config: GestureConfig = DEFAULT_GESTURE) {
    validateGestureConfig(config);
    this.config = { ...config };
  }

  get phase(): GesturePhase {
    return this.#phase;
  }

  get activePointerId(): number | null {
    return this.#pointerId;
  }

  snapshot(): GestureSnapshot {
    return {
      phase: this.#phase,
      pointerId: this.#pointerId,
      startX: this.#startX,
      startY: this.#startY,
      x: this.#x,
      y: this.#y,
      startTimeMs: this.#startTime,
    };
  }

  down(pointerId: number, x: number, y: number, timeMs: number): GestureOutput[] {
    if (this.#pointerId !== null) return NONE;
    this.#pointerId = pointerId;
    this.#phase = 'pending';
    this.#startX = this.#x = x;
    this.#startY = this.#y = y;
    this.#startTime = timeMs;
    this.#leftDeadZone = false;
    return NONE;
  }

  move(pointerId: number, x: number, y: number, _timeMs: number): GestureOutput[] {
    if (pointerId !== this.#pointerId) return NONE;
    this.#track(x, y);
    if (this.#phase === 'aiming') return [this.#positioned('aim')];
    if (this.#phase === 'cancelZone') return [this.#positioned('aimCancelZone')];
    return NONE;
  }

  up(pointerId: number, x: number, y: number, timeMs: number): GestureOutput[] {
    if (pointerId !== this.#pointerId) return NONE;
    // The release position may differ from the last move (coalesced events, quick flicks).
    this.#track(x, y);
    let out: GestureOutput;
    switch (this.#phase) {
      case 'aiming':
        out = this.#positioned('dash');
        break;
      case 'cancelZone':
        out = { kind: 'cancel', reason: 'deadZone' };
        break;
      default: {
        const held = Math.max(0, timeMs - this.#startTime);
        if (held <= this.config.tapMaxMs) out = { kind: 'return' };
        else if (held >= this.config.longPressMs) out = { kind: 'cancel', reason: 'longPress' };
        else out = { kind: 'cancel', reason: 'ambiguous' };
      }
    }
    this.#reset();
    return [out];
  }

  cancel(_reason: 'interrupted' = 'interrupted'): GestureOutput[] {
    if (this.#pointerId === null) return NONE;
    this.#reset();
    return [{ kind: 'cancel', reason: 'interrupted' }];
  }

  #track(x: number, y: number): void {
    this.#x = x;
    this.#y = y;
    const d = Math.hypot(x - this.#startX, y - this.#startY);
    if (this.#phase === 'pending') {
      if (d < this.config.armDistancePx) return;
      this.#phase = 'aiming';
    }
    if (d >= this.config.deadZonePx) this.#leftDeadZone = true;
    this.#phase = this.#leftDeadZone && d < this.config.deadZonePx ? 'cancelZone' : 'aiming';
  }

  #positioned<K extends 'aim' | 'aimCancelZone' | 'dash'>(kind: K): GestureOutput {
    return { kind, startX: this.#startX, startY: this.#startY, x: this.#x, y: this.#y } as GestureOutput;
  }

  #reset(): void {
    this.#phase = 'idle';
    this.#pointerId = null;
    this.#leftDeadZone = false;
  }
}
