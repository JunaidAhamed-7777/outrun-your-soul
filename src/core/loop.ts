/**
 * Fixed-step simulation loop with render interpolation.
 *
 * - Simulation advances only in whole fixed steps; rendering receives alpha in [0, 1).
 * - Catch-up is bounded: wall time beyond maxCatchUpSeconds is dropped, never replayed,
 *   so a stalled frame cannot deliver a burst of hidden damage.
 * - While paused, frame() still runs (alpha frozen, real dt for UI animation) but step()
 *   never runs and no time accumulates. resume() discards any gap.
 */

export interface LoopHooks {
  step(): void;
  frame(alpha: number, realDt: number): void;
}

export interface FixedLoop {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
  readonly running: boolean;
  /** Interpolation factor most recently passed to frame(). */
  readonly alpha: number;
}

export interface LoopOptions {
  stepSeconds: number;
  maxCatchUpSeconds: number;
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
}

export interface AccumulatorResult {
  /** Whole fixed steps to run now. */
  readonly steps: number;
  /** Leftover time (< one step) carried to the next frame. */
  readonly acc: number;
  /** Wall time discarded by the catch-up bound. */
  readonly dropped: number;
  /** acc / step, in [0, 1). */
  readonly alpha: number;
}

/** Real dt handed to frame() is capped so UI animation never jumps after a long stall. */
export const MAX_FRAME_DT_SECONDS = 0.25;

/** Tolerance so float drift (e.g. 3 x 1/120 summing below 0.025) does not lose a step. */
const STEP_EPSILON = 1e-9;

/**
 * Pure accumulator update. Pending time (carry + dt) is capped at maxCatchUp, so at most
 * floor(maxCatchUp / step) steps run per call.
 */
export function advanceAccumulator(acc: number, dt: number, step: number, maxCatchUp: number): AccumulatorResult {
  if (!(step > 0)) throw new Error('advanceAccumulator: step must be positive');
  const safeDt = dt > 0 ? dt : 0; // also rejects NaN
  let total = Math.max(0, acc) + safeDt;
  let dropped = 0;
  const cap = Math.max(step, maxCatchUp);
  if (total > cap) {
    dropped = total - cap;
    total = cap;
  }
  const steps = Math.floor(total / step + STEP_EPSILON);
  const rest = Math.max(0, total - steps * step);
  const alpha = Math.min(rest / step, 1 - Number.EPSILON);
  return { steps, acc: rest, dropped, alpha };
}

export function createFixedLoop(hooks: LoopHooks, opts: LoopOptions): FixedLoop {
  const { stepSeconds, maxCatchUpSeconds } = opts;
  if (!(stepSeconds > 0)) throw new Error('createFixedLoop: stepSeconds must be positive');
  const raf = opts.raf ?? ((cb: FrameRequestCallback) => globalThis.requestAnimationFrame(cb));
  const caf = opts.caf ?? ((id: number) => globalThis.cancelAnimationFrame(id));

  let running = false;
  let paused = false;
  let acc = 0;
  let alpha = 0;
  let last: number | null = null;
  let handle: number | null = null;
  /** Set by resume(): the next frame's elapsed time is not simulated. */
  let discardNextGap = false;

  const tick = (timestamp: number): void => {
    handle = null;
    if (!running) return;
    // Schedule first so an exception in a hook cannot silently kill the loop.
    handle = raf(tick);
    const realDt = last === null ? 0 : Math.max(0, (timestamp - last) / 1000);
    last = timestamp;

    if (!paused) {
      const simDt = discardNextGap ? 0 : realDt;
      discardNextGap = false;
      const result = advanceAccumulator(acc, simDt, stepSeconds, maxCatchUpSeconds);
      acc = result.acc;
      for (let i = 0; i < result.steps; i += 1) {
        hooks.step();
        if (paused || !running) {
          // A step ended play (pause, defeat, stop): remaining due steps are discarded.
          acc = 0;
          break;
        }
      }
      if (!paused) alpha = result.alpha;
    }
    hooks.frame(alpha, Math.min(realDt, MAX_FRAME_DT_SECONDS));
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = null;
      handle = raf(tick);
    },
    stop() {
      running = false;
      if (handle !== null) caf(handle);
      handle = null;
      last = null;
    },
    pause() {
      paused = true;
    },
    resume() {
      if (!paused) return;
      paused = false;
      discardNextGap = true;
    },
    get paused() {
      return paused;
    },
    get running() {
      return running;
    },
    get alpha() {
      return alpha;
    },
  };
}
