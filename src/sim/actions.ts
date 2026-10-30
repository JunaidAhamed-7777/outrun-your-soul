/**
 * Player actions: the shared dash planner (used identically by preview and execution),
 * starting dashes and RETURN, the one-intent input buffer and command application.
 */
import { sweepCircle } from './geom';
import { beginAppend, isSeparated, vertexCountAfterAppend } from './route';
import { TUNING } from './tuning';
import type { Command, DashLimit, RejectReason, SimEvent, SimState } from './types';
import { add, len, normalize, scale, sub, type Vec2 } from './vec';

export interface DashPlan {
  readonly valid: boolean;
  readonly reason?: RejectReason;
  readonly from: Vec2;
  readonly requestedEnd: Vec2;
  readonly end: Vec2;
  readonly dir: Vec2;
  readonly distance: number;
  readonly limitedBy: DashLimit;
}

/** Optional observer used by previews to read execution internals without duplicating them. */
export interface StepProbe {
  plans: DashPlan[];
  /** Route length immediately before the executed dash appended to it. */
  dashStartLength: number | null;
  contact: { at: Vec2; soulAt: Vec2 } | null;
}

export function newProbe(): StepProbe {
  return { plans: [], dashStartLength: null, contact: null };
}

/**
 * Range, capacity, representation and wall clamps for an outward dash from the body's
 * current position. Contact is not predicted here: execution discovers it as an event and
 * previews run execution on a copy.
 */
export function planDash(state: SimState, aim: Vec2): DashPlan {
  const from = state.body.pos;
  const invalid = (reason: RejectReason, extra: Partial<DashPlan> = {}): DashPlan => ({
    valid: false,
    reason,
    from,
    requestedEnd: from,
    end: from,
    dir: { x: 0, y: 0 },
    distance: 0,
    limitedBy: 'none',
    ...extra,
  });
  if (state.outcome !== 'playing' || state.body.mode === 'dead' || state.body.mode === 'exited') {
    return invalid('ended');
  }
  const aimLen = len(aim);
  if (!(aimLen > 1e-9)) return invalid('tooShort');
  const dir = scale(aim, 1 / aimLen);
  const reqDist = Math.min(aimLen, state.params.dashMaxDistance);
  const requestedEnd = add(from, scale(dir, reqDist));
  let limitedBy: DashLimit = aimLen > state.params.dashMaxDistance ? 'range' : 'none';
  if (reqDist < TUNING.dashMinDistance) return invalid('tooShort', { requestedEnd, dir });

  let distance = reqDist;
  const capacity = Math.max(0, state.params.tetherCapacity - state.route.length);
  if (capacity < distance) {
    distance = capacity;
    limitedBy = 'capacity';
  }
  if (vertexCountAfterAppend(state.route, dir) > TUNING.maxRouteVertices) {
    return invalid('vertexLimit', { requestedEnd, dir, limitedBy });
  }
  const hit = sweepCircle(state.room, from, scale(dir, distance), TUNING.bodyRadius + TUNING.wallSkin);
  if (hit) {
    distance *= hit.t;
    limitedBy = 'wall';
  }
  if (distance < TUNING.dashMinDistance) {
    const reason: RejectReason =
      limitedBy === 'capacity' ? 'noCapacity' : limitedBy === 'wall' ? 'blocked' : 'tooShort';
    return invalid(reason, { requestedEnd, dir, limitedBy, end: add(from, scale(dir, distance)), distance });
  }
  return { valid: true, from, requestedEnd, end: add(from, scale(dir, distance)), dir, distance, limitedBy };
}

/** Seconds until the body can act again (0 when it can act now). */
export function busyRemaining(state: SimState): number {
  const body = state.body;
  if (body.mode === 'dash' && body.dash) {
    return Math.max(0, body.dash.duration - body.dash.elapsed) + TUNING.recoverySeconds;
  }
  if (body.mode === 'recover') return body.recoverLeft;
  return 0;
}

export function startDash(state: SimState, plan: DashPlan, events: SimEvent[]): void {
  const body = state.body;
  if (body.mode === 'return') {
    events.push({ type: 'returnStop', t: state.time, at: body.pos, reason: 'interrupted' });
  }
  beginAppend(state.route, plan.from, plan.dir);
  body.mode = 'dash';
  body.dash = { from: plan.from, to: plan.end, elapsed: 0, duration: plan.distance / TUNING.dashSpeed };
  body.recoverLeft = 0;
  body.facing = plan.dir;
  state.stats.dashes += 1;
  events.push({ type: 'dashStart', t: state.time, from: plan.from, to: plan.end, limitedBy: plan.limitedBy });
}

export function startReturn(state: SimState, events: SimEvent[]): void {
  const body = state.body;
  body.mode = 'return';
  const pts = state.route.points;
  const prev = pts[pts.length - 2];
  if (prev) {
    const d = normalize(sub(prev, body.pos));
    if (d.x !== 0 || d.y !== 0) body.facing = d;
  }
  state.stats.returns += 1;
  events.push({ type: 'returnStart', t: state.time, from: body.pos });
}

function tryDash(state: SimState, aim: Vec2, events: SimEvent[], probe: StepProbe | undefined): DashPlan {
  const plan = planDash(state, aim);
  if (probe) {
    probe.plans.push(plan);
    if (plan.valid) probe.dashStartLength = state.route.length;
  }
  if (plan.valid) startDash(state, plan, events);
  return plan;
}

/** Apply one command at the current instant. Busy bodies may queue one visible intent. */
export function applyCommand(state: SimState, cmd: Command, events: SimEvent[], probe?: StepProbe): void {
  const t = state.time;
  if (state.outcome !== 'playing') {
    events.push({ type: 'rejected', t, command: cmd.kind, reason: 'ended' });
    return;
  }
  const mode = state.body.mode;
  if (mode === 'dash' || mode === 'recover') {
    if (cmd.kind === 'return' && mode === 'recover' && !isSeparated(state.route)) {
      events.push({ type: 'rejected', t, command: cmd.kind, reason: 'notSeparated' });
      return;
    }
    if (busyRemaining(state) <= TUNING.inputBufferSeconds + 1e-9) {
      state.buffered = cmd;
      state.bufferedAge = 0;
      events.push({ type: 'queued', t, command: cmd.kind });
    } else {
      events.push({ type: 'rejected', t, command: cmd.kind, reason: 'busy' });
    }
    return;
  }
  if (cmd.kind === 'dash') {
    const plan = tryDash(state, cmd.aim, events, probe);
    if (!plan.valid) events.push({ type: 'rejected', t, command: 'dash', reason: plan.reason ?? 'blocked' });
    return;
  }
  if (!isSeparated(state.route)) {
    events.push({ type: 'rejected', t, command: 'return', reason: 'notSeparated' });
  } else if (mode === 'return') {
    events.push({ type: 'rejected', t, command: 'return', reason: 'busy' });
  } else {
    startReturn(state, events);
  }
}

/** Run the queued intent when the body becomes ready, revalidating it against the current state. */
export function executeBuffered(state: SimState, events: SimEvent[], probe?: StepProbe): void {
  const cmd = state.buffered;
  if (!cmd) return;
  state.buffered = null;
  state.bufferedAge = 0;
  if (cmd.kind === 'dash') {
    const plan = tryDash(state, cmd.aim, events, probe);
    if (!plan.valid) events.push({ type: 'queueExpired', t: state.time });
    return;
  }
  if (isSeparated(state.route)) startReturn(state, events);
  else events.push({ type: 'queueExpired', t: state.time });
}
