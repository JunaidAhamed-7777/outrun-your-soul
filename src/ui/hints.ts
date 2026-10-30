/**
 * Contextual hint bookkeeping, DOM-free. Each authored hint shows at most once per
 * room attempt; acting on a hint dismisses it (after a short minimum so it can be
 * read), and a newer hint replaces an older one once that minimum has elapsed.
 */
import type { EnemyRole, HintTrigger, RoomDef, SimEvent, SimEventType } from '../sim/types';

/** Authored triggers plus overlay-generated ones for mechanics rooms may not explain. */
export type UiHintTrigger = HintTrigger | 'warden' | 'boss';

/** A HintDef with the wider trigger set (every authored HintDef is a UiHint). */
export interface UiHint {
  readonly id: string;
  readonly when: UiHintTrigger;
  readonly text: string;
}

export const WARDEN_HINT = 'Its shield faces you. Strike from the side, or after it swings.';
export const BOSS_HINT = 'Armour turns every blade. Strike its heart as it walks home along its thread.';
/** Suggested room-intro subtitle for the boss arena. */
export const BOSS_INTRO_SUBTITLE = 'It is fast too. Its heart is not.';

export interface HintTiming {
  /** Shown at least this long before an action or a newer hint can replace it. */
  readonly minSeconds: number;
  /** Fades on its own after this long. */
  readonly maxSeconds: number;
}

export const HINT_TIMING: Readonly<Record<UiHintTrigger, HintTiming>> = {
  start: { minSeconds: 1.4, maxSeconds: 10 },
  firstSeparation: { minSeconds: 1.2, maxSeconds: 6 },
  firstTelegraph: { minSeconds: 1, maxSeconds: 4.5 },
  firstLock: { minSeconds: 0.8, maxSeconds: 4 },
  cleared: { minSeconds: 1.2, maxSeconds: 5 },
  gateWaiting: { minSeconds: 1.2, maxSeconds: 6 },
  warden: { minSeconds: 1.6, maxSeconds: 6.5 },
  boss: { minSeconds: 2.2, maxSeconds: 8 },
};

/** Events showing the player already did what a hint suggests. */
export const HINT_DISMISS: Readonly<Record<UiHintTrigger, readonly SimEventType[]>> = {
  start: ['dashStart'],
  firstSeparation: ['returnStart', 'reunion'],
  firstTelegraph: ['fire', 'kill'],
  firstLock: ['fire', 'kill', 'cut'],
  cleared: ['victory'],
  gateWaiting: ['reunion', 'victory'],
  warden: ['victory'],
  boss: ['victory'],
};

/**
 * Hint triggers raised by one simulation event. 'start' is raised by reset(). `roleOf`
 * tells a warden's windup (also a 'telegraph' event) apart from a sentry's warning.
 */
export function triggersForEvent(e: SimEvent, roleOf?: (enemyId: number) => EnemyRole | undefined): UiHintTrigger[] {
  switch (e.type) {
    case 'separated':
      return ['firstSeparation'];
    case 'telegraph':
      if (roleOf?.(e.enemyId) === 'warden') return ['warden'];
      return e.phase === 'tracking' ? ['firstTelegraph'] : ['firstLock'];
    case 'guarded':
    case 'sweep':
      return ['warden'];
    case 'boss':
      return e.what === 'wake' ? ['boss'] : [];
    case 'roomCleared':
      return ['cleared'];
    case 'gate':
      return e.status === 'ready' ? ['gateWaiting'] : [];
    default:
      return [];
  }
}

/** Words that show a room's own hints already teach a mechanic. */
const COVERS: Readonly<Record<'warden' | 'boss', RegExp>> = {
  warden: /warden|shield|guard/i,
  boss: /heart/i,
};

/** Overlay hints for mechanics present in a room that its authored hints do not cover. */
export function genericHintsFor(room: Pick<RoomDef, 'enemies' | 'hints' | 'boss'>): UiHint[] {
  const authored = room.hints ?? [];
  const covered = (k: 'warden' | 'boss') => authored.some((h) => COVERS[k].test(h.text));
  const out: UiHint[] = [];
  if (room.enemies.some((e) => e.role === 'warden') && !covered('warden')) {
    out.push({ id: 'ui-warden', when: 'warden', text: WARDEN_HINT });
  }
  if (room.boss && !covered('boss')) out.push({ id: 'ui-boss', when: 'boss', text: BOSS_HINT });
  return out;
}

export class HintTracker {
  private hints: readonly UiHint[];
  private readonly shown = new Set<string>();
  private queue: UiHint[] = [];
  private dismissRequested = false;
  private _current: UiHint | null = null;
  private _age = 0;

  constructor(hints: readonly UiHint[] = []) {
    this.hints = hints;
  }

  get current(): UiHint | null {
    return this._current;
  }

  /** Seconds the current hint has been visible. */
  get age(): number {
    return this._age;
  }

  /** Begin a new room attempt: forget shown hints and raise 'start'. */
  reset(hints: readonly UiHint[] = this.hints): void {
    this.hints = hints;
    this.shown.clear();
    this.queue = [];
    this._current = null;
    this._age = 0;
    this.dismissRequested = false;
    this.trigger('start');
  }

  trigger(when: UiHintTrigger): void {
    for (const hint of this.hints) {
      if (hint.when !== when || this.shown.has(hint.id)) continue;
      this.shown.add(hint.id);
      this.queue.push(hint);
    }
  }

  onEvent(e: SimEvent, roleOf?: (enemyId: number) => EnemyRole | undefined): void {
    if (this._current && HINT_DISMISS[this._current.when].includes(e.type)) this.dismissRequested = true;
    // A queued hint whose advice was already followed is stale; drop it unseen.
    this.queue = this.queue.filter((h) => !HINT_DISMISS[h.when].includes(e.type));
    for (const when of triggersForEvent(e, roleOf)) this.trigger(when);
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
