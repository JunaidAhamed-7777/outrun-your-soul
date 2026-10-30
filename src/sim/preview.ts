/**
 * Previews run the real step function on a private copy of the state, so walls,
 * capacity, contact stops and the input buffer behave exactly as execution will.
 * The live state is never mutated.
 */
import { newProbe, planDash, type DashPlan } from './actions';
import { isSeparated } from './route';
import { stepInternal } from './step';
import { STEP_SECONDS, TUNING } from './tuning';
import type { DashPreview, RejectReason, ReturnPreview, SimEvent, SimState } from './types';
import type { Vec2 } from './vec';

/** Generous bound: buffer window + longest dash + recovery, or a full-length RETURN. */
const MAX_FORECAST_STEPS = Math.ceil(3 / STEP_SECONDS);

/** Deep copy sharing the immutable room definition. */
export function cloneState(state: SimState): SimState {
  const { room, ...rest } = state;
  const copy = structuredClone(rest) as Omit<SimState, 'room'>;
  return { ...copy, room } as SimState;
}

function invalidDash(plan: DashPlan, reason: RejectReason, state: SimState): DashPreview {
  return {
    valid: false,
    reason,
    from: plan.from,
    requestedEnd: plan.requestedEnd,
    end: plan.end,
    limitedBy: plan.limitedBy,
    contact: null,
    capacityAfter: Math.max(0, state.params.tetherCapacity - state.route.length),
    soulArrivalSeconds: 0,
    queued: false,
  };
}

export function previewDash(state: SimState, aim: Vec2): DashPreview {
  const geometry = planDash(state, aim);
  if (state.outcome !== 'playing') return invalidDash(geometry, 'ended', state);

  const sim = cloneState(state);
  const probe = newProbe();
  let queued = false;
  let startedAt: number | null = null;
  let ended: Extract<SimEvent, { type: 'dashEnd' }> | null = null;

  for (let step = 0; step < MAX_FORECAST_STEPS && ended === null; step++) {
    const events = stepInternal(sim, step === 0 ? [{ kind: 'dash', aim }] : [], probe);
    for (const ev of events) {
      if (ev.type === 'rejected' && step === 0) return invalidDash(geometry, ev.reason, state);
      if (ev.type === 'queued') queued = true;
      if (ev.type === 'queueExpired') {
        const plan = probe.plans[probe.plans.length - 1] ?? geometry;
        return { ...invalidDash(plan, plan.reason ?? 'blocked', state), queued: true };
      }
      if (ev.type === 'dashStart' && startedAt === null) startedAt = ev.t;
      if (ev.type === 'dashEnd' && startedAt !== null && ended === null) ended = ev;
    }
    if (sim.outcome !== 'playing') break;
  }

  const plan = probe.plans[probe.plans.length - 1] ?? geometry;
  if (!plan.valid) return invalidDash(plan, plan.reason ?? 'blocked', state);
  const contact = ended?.reason === 'contact' && probe.contact ? probe.contact : null;
  const guarded = ended?.reason === 'guarded' ? ended.at : null;
  const soulSpeed = state.params.soulSpeed * state.soul.speedMultiplier;
  const startLength = probe.dashStartLength ?? state.route.length;
  const lengthAtEnd = Math.max(0, startLength + plan.distance - soulSpeed * (plan.distance / TUNING.dashSpeed));
  const delay = startedAt === null ? 0 : startedAt - state.time;
  return {
    valid: true,
    from: plan.from,
    requestedEnd: plan.requestedEnd,
    end: contact ? contact.at : (guarded ?? plan.end),
    limitedBy: contact ? 'contact' : guarded ? 'guard' : plan.limitedBy,
    contact,
    capacityAfter: contact
      ? state.params.tetherCapacity
      : Math.max(0, state.params.tetherCapacity - lengthAtEnd),
    soulArrivalSeconds: contact ? 0 : delay + (startLength + plan.distance) / soulSpeed,
    queued,
  };
}

export function previewReturn(state: SimState): ReturnPreview {
  if (state.outcome !== 'playing') return { valid: false, reason: 'ended', meetAt: null, seconds: 0 };
  if (!isSeparated(state.route)) return { valid: false, reason: 'notSeparated', meetAt: null, seconds: 0 };
  const sim = cloneState(state);
  // An in-progress RETURN is forecast as-is; otherwise issue one (it may queue while busy).
  const alreadyReturning = state.body.mode === 'return';
  for (let step = 0; step < MAX_FORECAST_STEPS; step++) {
    const command = step === 0 && !alreadyReturning ? [{ kind: 'return' as const }] : [];
    const events = stepInternal(sim, command, undefined);
    for (const ev of events) {
      if (ev.type === 'rejected' && step === 0) return { valid: false, reason: ev.reason, meetAt: null, seconds: 0 };
      if (ev.type === 'queueExpired') return { valid: false, reason: 'notSeparated', meetAt: null, seconds: 0 };
      if (ev.type === 'reunion') return { valid: true, meetAt: ev.at, seconds: ev.t - state.time };
    }
    if (sim.outcome !== 'playing') break;
  }
  return { valid: false, reason: 'ended', meetAt: null, seconds: 0 };
}
