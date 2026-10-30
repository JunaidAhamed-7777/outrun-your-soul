/**
 * Voice budgeting, DOM/WebAudio-free. Bursts of events (several sentries locking,
 * a shower of fizzles) must never stack into clipping mush: each cue belongs to a
 * group with a cap, identical cues are debounced, and a global cap steals the
 * oldest lower-or-equal-priority voice.
 */
import type { CueName } from './cues';

export type VoiceGroup = 'pluck' | 'chime' | 'tick' | 'impact' | 'air' | 'chord' | 'stinger' | 'hum';

export interface VoiceSpec {
  readonly group: VoiceGroup;
  /** Seconds a typical instance lasts (used for bookkeeping when the engine does not report). */
  readonly duration: number;
  /** Minimum seconds between two starts of the same cue. */
  readonly minInterval: number;
  /** Higher survives stealing. */
  readonly priority: number;
}

export const GROUP_LIMITS: Readonly<Record<VoiceGroup, number>> = {
  pluck: 3,
  chime: 3,
  tick: 3,
  impact: 4,
  air: 3,
  chord: 2,
  stinger: 1,
  hum: 2,
};

export const GLOBAL_VOICE_LIMIT = 18;

export const CUE_SPECS: Readonly<Record<CueName, VoiceSpec>> = {
  dashPluck: { group: 'pluck', duration: 1.1, minInterval: 0.04, priority: 6 },
  soulChime: { group: 'chime', duration: 1.6, minInterval: 0.08, priority: 4 },
  tug: { group: 'air', duration: 0.5, minInterval: 0.3, priority: 2 },
  reunionChord: { group: 'chord', duration: 2.2, minInterval: 0.15, priority: 7 },
  returnSwell: { group: 'air', duration: 0.5, minInterval: 0.12, priority: 5 },
  cutTing: { group: 'impact', duration: 0.7, minInterval: 0.03, priority: 8 },
  killThock: { group: 'impact', duration: 0.9, minInterval: 0.03, priority: 8 },
  trackTick: { group: 'tick', duration: 0.08, minInterval: 0.09, priority: 5 },
  lockTick: { group: 'tick', duration: 0.18, minInterval: 0.05, priority: 9 },
  fireWhoosh: { group: 'air', duration: 0.35, minInterval: 0.04, priority: 6 },
  hitCrunch: { group: 'impact', duration: 0.6, minInterval: 0.05, priority: 10 },
  shieldTick: { group: 'tick', duration: 0.1, minInterval: 0.06, priority: 3 },
  fizzle: { group: 'tick', duration: 0.08, minInterval: 0.05, priority: 1 },
  laneWarn: { group: 'hum', duration: 0.8, minInterval: 0.3, priority: 6 },
  laneOn: { group: 'hum', duration: 0.6, minInterval: 0.3, priority: 7 },
  laneOff: { group: 'hum', duration: 0.5, minInterval: 0.3, priority: 3 },
  gateReady: { group: 'chord', duration: 1.8, minInterval: 0.5, priority: 6 },
  gateOpen: { group: 'chord', duration: 2.0, minInterval: 0.5, priority: 7 },
  victory: { group: 'stinger', duration: 3.2, minInterval: 1, priority: 10 },
  defeat: { group: 'stinger', duration: 2.8, minInterval: 1, priority: 10 },
  rejectClick: { group: 'tick', duration: 0.08, minInterval: 0.12, priority: 2 },
  queuedTick: { group: 'tick', duration: 0.06, minInterval: 0.1, priority: 2 },
  wake: { group: 'air', duration: 0.6, minInterval: 0.2, priority: 5 },
  select: { group: 'pluck', duration: 0.6, minInterval: 0.05, priority: 4 },
  relicTake: { group: 'chord', duration: 1.6, minInterval: 0.3, priority: 7 },
  roomSting: { group: 'stinger', duration: 1.4, minInterval: 0.5, priority: 6 },
  endingEscaped: { group: 'stinger', duration: 4.2, minInterval: 1, priority: 10 },
  endingFailed: { group: 'stinger', duration: 3.6, minInterval: 1, priority: 10 },
  boost: { group: 'air', duration: 0.45, minInterval: 0.12, priority: 6 },
  bellCharge: { group: 'chime', duration: 1.4, minInterval: 0.2, priority: 7 },
  bellBurst: { group: 'impact', duration: 1.8, minInterval: 0.2, priority: 9 },
  decoyPlace: { group: 'pluck', duration: 0.6, minInterval: 0.15, priority: 6 },
  decoyTake: { group: 'pluck', duration: 0.6, minInterval: 0.15, priority: 6 },
  guardClang: { group: 'impact', duration: 0.6, minInterval: 0.06, priority: 8 },
  sweepWhoosh: { group: 'air', duration: 0.6, minInterval: 0.1, priority: 8 },
  exposedChime: { group: 'chime', duration: 0.9, minInterval: 0.2, priority: 8 },
};

interface ActiveVoice {
  readonly id: number;
  readonly cue: string;
  readonly group: VoiceGroup;
  readonly priority: number;
  readonly start: number;
  end: number;
}

export interface Admission {
  readonly admit: boolean;
  /** Voice IDs the engine must fade out to make room. */
  readonly steal: number[];
  /** ID for the new voice (meaningful only when admitted). */
  readonly id: number;
}

export class VoiceLimiter {
  private voices: ActiveVoice[] = [];
  private lastStart = new Map<string, number>();
  private nextId = 1;

  constructor(
    private readonly globalLimit = GLOBAL_VOICE_LIMIT,
    private readonly groupLimits: Readonly<Record<VoiceGroup, number>> = GROUP_LIMITS,
  ) {}

  /** Voices still sounding at `now`. */
  active(now: number): number {
    this.prune(now);
    return this.voices.length;
  }

  admit(cue: string, spec: VoiceSpec, now: number, duration = spec.duration): Admission {
    this.prune(now);
    const last = this.lastStart.get(cue);
    if (last !== undefined && now - last < spec.minInterval) return { admit: false, steal: [], id: 0 };

    const steal: number[] = [];
    const inGroup = this.voices.filter((v) => v.group === spec.group).sort((a, b) => a.start - b.start);
    const groupLimit = this.groupLimits[spec.group];
    if (inGroup.length >= groupLimit) {
      const victim = inGroup[0];
      if (!victim || victim.priority > spec.priority) return { admit: false, steal: [], id: 0 };
      steal.push(victim.id);
    }
    if (this.voices.length - steal.length >= this.globalLimit) {
      const victim = this.voices
        .filter((v) => !steal.includes(v.id) && v.priority <= spec.priority)
        .sort((a, b) => a.priority - b.priority || a.start - b.start)[0];
      if (!victim) return { admit: false, steal: [], id: 0 };
      steal.push(victim.id);
    }

    this.voices = this.voices.filter((v) => !steal.includes(v.id));
    const id = this.nextId++;
    this.voices.push({ id, cue, group: spec.group, priority: spec.priority, start: now, end: now + duration });
    this.lastStart.set(cue, now);
    return { admit: true, steal, id };
  }

  /** The engine reports an early end (stolen or stopped). */
  release(id: number): void {
    this.voices = this.voices.filter((v) => v.id !== id);
  }

  reset(): void {
    this.voices = [];
    this.lastStart.clear();
  }

  private prune(now: number): void {
    if (this.voices.some((v) => v.end <= now)) this.voices = this.voices.filter((v) => v.end > now);
  }
}
