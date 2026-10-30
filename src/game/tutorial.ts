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
  { id: 'strike', title: 'Strike', text: 'A dash cuts through anything in its path. Break the still sentry on the right.' },
  { id: 'locked', title: 'Read the amber line', text: 'An amber line is a shot about to fire. Once it locks it never moves: step off it, or dash through the bolt.' },
  { id: 'keeper', title: 'Protect your soul', text: 'The lantern aims where your soul is going, not where it is. Return or dash back to it before the shot lands, then break the lantern.' },
  { id: 'gate', title: 'Leave together', text: 'The gate opens only for both of you. Rejoin your soul and step into the gate.' },
];

export interface TutorialView {
  readonly index: number;
  readonly total: number;
  readonly step: TutorialStep | null;
  /** Id of a step completed by the latest update (for a brief tick), else null. */
  readonly justCompleted: string | null;
}

const dead = (s: SimState, key: string) => s.enemies.some((e) => e.key === key && e.phase === 'dead');

export class TutorialCoach {
  private readonly done = new Set<string>();
  private last: string | null = null;

  /** Feed one frame's events and the current state. */
  update(events: readonly SimEvent[], state: SimState): void {
    this.last = null;
    for (const e of events) {
      if (e.type === 'dashStart') this.complete('dash');
      if (e.type === 'reunion') {
        this.complete('follow');
        if (e.cause === 'contact') this.complete('contact');
      }
      if (e.type === 'returnStart') this.complete('return');
      if (e.type === 'victory') this.complete('gate');
    }
    if (dead(state, 'dummy')) this.complete('strike');
    if (dead(state, 'needler')) this.complete('locked');
    if (dead(state, 'keeper')) this.complete('keeper');
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

  isDone(id: string): boolean {
    return this.done.has(id);
  }

  private complete(id: string): void {
    if (this.done.has(id)) return;
    this.done.add(id);
    this.last = id;
  }
}

/** Storage key recording that the player finished (or skipped) the tutorial. */
export const TUTORIAL_DONE_KEY = 'oys.tutorialDone';
