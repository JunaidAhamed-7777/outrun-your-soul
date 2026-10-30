/**
 * Contextual hint bookkeeping, DOM-free. Each authored hint shows at most once per
 * room attempt; acting on a hint dismisses it (after a short minimum so it can be
 * read), and a newer hint replaces an older one once that minimum has elapsed.
 */
import type { HintDef, HintTrigger, SimEvent, SimEventType } from '../sim/types';

export interface HintTiming {
  /** Shown at least this long before an action or a newer hint can replace it. */
  readonly minSeconds: number;
  /** Fades on its own after this long. */
  readonly maxSeconds: number;
}

export const HINT_TIMING: Readonly<Record<HintTrigger, HintTiming>> = {
  start: { minSeconds: 1.4, maxSeconds: 10 },
  firstSeparation: { minSeconds: 1.2, maxSeconds: 6 },
  firstTelegraph: { minSeconds: 1, maxSeconds: 4.5 },
  firstLock: { minSeconds: 0.8, maxSeconds: 4 },
  cleared: { minSeconds: 1.2, maxSeconds: 5 },
  gateWaiting: { minSeconds: 1.2, maxSeconds: 6 },
};

/** Events showing the player already did what a hint suggests. */
export const HINT_DISMISS: Readonly<Record<HintTrigger, readonly SimEventType[]>> = {
  start: ['dashStart'],
  firstSeparation: ['returnStart', 'reunion'],
  firstTelegraph: ['fire', 'kill'],
  firstLock: ['fire', 'kill', 'cut'],
  cleared: ['victory'],
  gateWaiting: ['reunion', 'victory'],
};

/** Hint triggers raised by one simulation event. 'start' is raised by reset(). */
export function triggersForEvent(e: SimEvent): HintTrigger[] {
  switch (e.type) {
    case 'separated':
      return ['firstSeparation'];
    case 'telegraph':
      return e.phase === 'tracking' ? ['firstTelegraph'] : ['firstLock'];
    case 'roomCleared':
      return ['cleared'];
    case 'gate':
      return e.status === 'ready' ? ['gateWaiting'] : [];
    default:
      return [];
  }
}

export class HintTracker {
  private hints: readonly HintDef[];
  private readonly shown = new Set<string>();
  private queue: HintDef[] = [];
  private dismissRequested = false;
  private _current: HintDef | null = null;
  private _age = 0;

  constructor(hints: readonly HintDef[] = []) {
    this.hints = hints;
  }

  get current(): HintDef | null {
    return this._current;
  }

  /** Seconds the current hint has been visible. */
  get age(): number {
    return this._age;
  }

  /** Begin a new room attempt: forget shown hints and raise 'start'. */
  reset(hints: readonly HintDef[] = this.hints): void {
    this.hints = hints;
    this.shown.clear();
    this.queue = [];
    this._current = null;
    this._age = 0;
    this.dismissRequested = false;
    this.trigger('start');
  }

  trigger(when: HintTrigger): void {
    for (const hint of this.hints) {
      if (hint.when !== when || this.shown.has(hint.id)) continue;
      this.shown.add(hint.id);
      this.queue.push(hint);
    }
  }

  onEvent(e: SimEvent): void {
    if (this._current && HINT_DISMISS[this._current.when].includes(e.type)) this.dismissRequested = true;
    // A queued hint whose advice was already followed is stale; drop it unseen.
    this.queue = this.queue.filter((h) => !HINT_DISMISS[h.when].includes(e.type));
    for (const when of triggersForEvent(e)) this.trigger(when);
  }

  /** Advance timers. Returns true when the visible hint changed (including to none). */
  tick(dt: number): boolean {
    let changed = false;
    if (this._current) {
      this._age += dt;
      const timing = HINT_TIMING[this._current.when];
      const pastMin = this._age >= timing.minSeconds;
      if ((pastMin && (this.dismissRequested || this.queue.length > 0)) || this._age >= timing.maxSeconds) {
        this._current = null;
        changed = true;
      }
    }
    if (!this._current) {
      const next = this.queue.shift();
      if (next) {
        this._current = next;
        this._age = 0;
        this.dismissRequested = false;
        changed = true;
      }
    }
    return changed;
  }
}
