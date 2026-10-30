/**
 * Tutorial coach for First Light: turns simulation events into an ordered list of
 * onboarding steps. A step completes whenever its condition happens, in any order; the
 * prompt shown is always the first unfinished step. Pure and DOM-free.
 */
import type { SimEvent, SimState } from '../sim/types';

export interface TutorialStep {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'dash', title: 'Dash', text: 'Drag anywhere on the screen, then release. Your body dashes the way you dragged.' },
  { id: 'follow', title: 'Your soul follows', text: 'Your soul walks your red thread slowly. Wait, and it will catch up and rejoin you.' },
  { id: 'return', title: 'Return', text: 'Dash out again, then tap once (no drag). Your body runs back along the thread to meet your soul.' },
  { id: 'contact', title: 'Meet early', text: 'Dash out, then dash straight back into your soul. Touching it rejoins you at once — the gold ring shows where.' },
  { id: 'strike', title: 'Strike', text: 'A sentry has arrived, and it will fire at you. A dash cuts through anything in its path: break it.' },
  { id: 'locked', title: 'Read the amber line', text: 'An amber line is a shot about to fire. Once it locks it never moves: step off it, or dash through the bolt.' },
  { id: 'keeper', title: 'Protect your soul', text: 'The lantern aims where your soul is going, not where it is. Return or dash back to it before the shot lands, then break the lantern.' },
  { id: 'gate', title: 'Leave together', text: 'The gate opens only for both of you. Rejoin your soul and step into the gate.' },
];

/** Steps that dismiss themselves after this many simulation seconds as the current step. */
export const TIMED_STEPS: Readonly<Record<string, number>> = { locked: 8 };

/**
 * Minimum seconds a step stays on screen before it can tick off, so the prompt can be
 * read even when the player completes it at once (the soul often catches up within a
 * second). Steps not listed use DEFAULT_READ_SECONDS.
 */
export const READ_SECONDS: Readonly<Record<string, number>> = { follow: 5 };
export const DEFAULT_READ_SECONDS = 2.5;

export interface TutorialView {
  readonly index: number;
  readonly total: number;
  readonly step: TutorialStep | null;
  /** Id of a step completed by the latest update (for a brief tick), else null. */
  readonly justCompleted: string | null;
}

const dead = (s: SimState, key: string) => s.enemies.some((e) => e.key === key && e.phase === 'dead');

export class TutorialCoach {
  /** Lessons the player has performed (in any order). */
  private readonly met = new Set<string>();
  /** Steps ticked off on screen, always in order. */
  private readonly done = new Set<string>();
  private last: string | null = null;
  /** The step currently shown and the sim time it became current. */
  private shown: { id: string; since: number } | null = null;

  /** Feed one frame's events and the current state. */
  update(events: readonly SimEvent[], state: SimState): void {
    this.last = null;
    for (const e of events) {
      if (e.type === 'dashStart') this.met.add('dash');
      if (e.type === 'reunion') {
        this.met.add('follow');
        if (e.cause === 'contact') this.met.add('contact');
      }
      if (e.type === 'returnStart') this.met.add('return');
      if (e.type === 'victory') this.met.add('gate');
    }
    if (dead(state, 'dummy')) this.met.add('strike');
    if (dead(state, 'needler')) this.met.add('locked');
    if (dead(state, 'keeper')) this.met.add('keeper');

    // Tick off the current step once it is met (or timed out) and has been readable long enough.
    const current = TUTORIAL_STEPS.find((s) => !this.done.has(s.id));
    if (!current) return;
    if (this.shown?.id !== current.id) this.shown = { id: current.id, since: state.time };
    const shownFor = state.time - this.shown.since;
    const limit = TIMED_STEPS[current.id];
    if (limit !== undefined && shownFor >= limit) this.met.add(current.id);
    const readFor = READ_SECONDS[current.id] ?? DEFAULT_READ_SECONDS;
    if (this.met.has(current.id) && shownFor >= readFor) {
      this.done.add(current.id);
      this.last = current.id;
    }
  }

  get view(): TutorialView {
    const index = TUTORIAL_STEPS.findIndex((s) => !this.done.has(s.id));
    return {
      index: index < 0 ? TUTORIAL_STEPS.length : index,
      total: TUTORIAL_STEPS.length,
      step: index < 0 ? null : TUTORIAL_STEPS[index]!,
      justCompleted: this.last,
    };
  }

  /** The lesson was performed (it may still be waiting its turn on screen). */
  isMet(id: string): boolean {
    return this.met.has(id);
  }

  isDone(id: string): boolean {
    return this.done.has(id);
  }
}

/** Storage key recording that the player finished (or skipped) the tutorial. */
export const TUTORIAL_DONE_KEY = 'oys.tutorialDone';
