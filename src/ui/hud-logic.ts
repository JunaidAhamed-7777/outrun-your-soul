/** Pure HUD derivations so the DOM layer only paints. */
import type { GateStatus, SimState } from '../sim/types';
import { TUNING } from '../sim/tuning';

export type ThreadState = 'reunited' | 'slack' | 'taut' | 'full';

export interface ThreadMeter {
  /** Outstanding route length (tiles). */
  readonly used: number;
  readonly capacity: number;
  /** used / capacity, clamped to [0, 1]. */
  readonly fraction: number;
  readonly remaining: number;
  readonly state: ThreadState;
}

/** Fraction at which the thread reads as taut. */
export const TAUT_FRACTION = 0.7;

export function threadMeter(routeLength: number, capacity: number, dashMin = TUNING.dashMinDistance): ThreadMeter {
  const cap = capacity > 0 && Number.isFinite(capacity) ? capacity : 0;
  const used = Math.max(0, Number.isFinite(routeLength) ? routeLength : 0);
  const fraction = cap > 0 ? Math.min(1, used / cap) : 1;
  const remaining = Math.max(0, cap - used);
  let state: ThreadState;
  if (used <= 1e-6) state = 'reunited';
  else if (remaining < dashMin) state = 'full';
  else if (fraction >= TAUT_FRACTION) state = 'taut';
  else state = 'slack';
  return { used, capacity: cap, fraction, remaining, state };
}

/** One boolean per pip; true means filled. */
export function healthPips(health: number, maxHealth: number): boolean[] {
  const max = Math.max(0, Math.floor(maxHealth));
  const h = Math.max(0, Math.min(max, Math.ceil(health)));
  return Array.from({ length: max }, (_, i) => i < h);
}

export function healthLabel(health: number, maxHealth: number): string {
  const pips = healthPips(health, maxHealth);
  return `Health ${pips.filter(Boolean).length} of ${pips.length}`;
}

/** m:ss.t — e.g. 0:42.3, 2:05.0. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const tenths = Math.floor(s * 10 + 1e-6);
  const m = Math.floor(tenths / 600);
  const rest = (tenths - m * 600) / 10;
  const [whole, frac] = rest.toFixed(1).split('.');
  return `${m}:${(whole ?? '0').padStart(2, '0')}.${frac ?? '0'}`;
}

export const GATE_WAITING_TEXT = 'The gate needs both of you.';

/** Micro-label only when the gate state needs the player's attention. */
export function gateLabel(gate: GateStatus): string | null {
  return gate === 'ready' ? GATE_WAITING_TEXT : null;
}

export interface StatLine {
  readonly label: string;
  readonly value: string;
}

export function resultStats(state: Pick<SimState, 'time' | 'stats'>): StatLine[] {
  const s = state.stats;
  return [
    { label: 'Time', value: formatDuration(state.time) },
    { label: 'Hits taken', value: String(s.hits) },
    { label: 'Bolts cut', value: String(s.cuts) },
    { label: 'Sentries felled', value: String(s.kills) },
    { label: 'Contact reunions', value: String(s.contactReunions) },
  ];
}
