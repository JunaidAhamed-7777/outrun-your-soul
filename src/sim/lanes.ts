/**
 * Persistent environmental lanes: a fixed cycle of idle -> warning -> active -> idle.
 * Each activation window gets a fresh attack ID, so a later pulse is dangerous again.
 * Validated lanes satisfy 0 <= activeFrom - warnLead <= activeFrom < activeTo <= period.
 */
import type { LaneDef, LaneStatus } from './types';

export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Cycle position for absolute room time. */
export function laneCycleTime(def: LaneDef, time: number): number {
  return mod(time + (def.phase ?? 0), def.period);
}

export function laneStatusAt(def: LaneDef, cycleTime: number): LaneStatus {
  if (cycleTime >= def.activeFrom && cycleTime < def.activeTo) return 'active';
  if (cycleTime >= def.activeFrom - def.warnLead && cycleTime < def.activeFrom) return 'warning';
  return 'idle';
}

export interface LaneBoundary {
  /** Seconds until the boundary, strictly positive. */
  readonly dt: number;
  /** Cycle position of the boundary, in [0, period). */
  readonly at: number;
  /** Status that begins at the boundary. */
  readonly status: LaneStatus;
}

/**
 * The next status boundary strictly after the current cycle position. Resolving a
 * boundary sets cycleTime to exactly `at`, so only an exact zero means "already
 * processed"; a boundary approached to within float noise is still due now.
 */
export function nextLaneBoundary(def: LaneDef, cycleTime: number): LaneBoundary {
  const boundaries: { at: number; status: LaneStatus }[] = [
    { at: def.activeFrom, status: 'active' },
    { at: mod(def.activeTo, def.period), status: laneStatusAt(def, mod(def.activeTo, def.period)) },
  ];
  if (def.warnLead > 0) boundaries.push({ at: def.activeFrom - def.warnLead, status: 'warning' });
  let best: LaneBoundary = { dt: Infinity, at: 0, status: 'idle' };
  for (const b of boundaries) {
    let dt = mod(b.at - cycleTime, def.period);
    if (dt === 0) dt = def.period;
    // A position a hair past the boundary (float noise after an exact resolution) wraps
    // to almost a full period, which is correct: that boundary has been processed.
    if (dt < best.dt) best = { dt, at: b.at, status: b.status };
  }
  return best;
}
