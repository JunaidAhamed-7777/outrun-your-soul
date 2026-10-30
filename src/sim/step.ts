/**
 * One fixed simulation step, resolved as a sequence of exact sub-step events.
 *
 * Within a step every mover is piecewise linear: the dashing body moves in a straight
 * line, the soul follows the route head through its corners, a returning body retraces
 * the route tail through its corners, and bolts fly straight. Each iteration finds the
 * earliest event (collisions by closed-form time of impact, timers by remaining time),
 * advances every mover to that instant, resolves only that event, and repeats. Entity
 * array order never decides an outcome; ties use the documented priority table.
 *
 * Exact-tie policy (events within TUNING.timeEpsilon of each other):
 *   1. projectile cuts, then dash kills (player-favouring);
 *   2. hits, evaluated while dash protection and grace are still in their pre-tie state;
 *   3. bolt/wall removal;
 *   4. body-soul contact or route exhaustion (reunion);
 *   5. dash arrival (ends protection), then lane, enemy, wake and bolt-age timers,
 *      then grace expiry, then recovery end.
 * Same kind: ascending entity ID, then body before soul.
 */
import { applyCommand, executeBuffered, type StepProbe } from './actions';
import { applyDamage } from './combat';
import { aimToward, BOLT_MAX_AGE, isActive, sentryTuning, wakeEnemy } from './enemies';
import {
  circleEntersRect,
  circleTimeOfImpact,
  corridorClear,
  pointInRect,
  rectSignedDistance,
  sweepCircle,
} from './geom';
import { mod, nextLaneBoundary, type LaneBoundary } from './lanes';
import {
  clearRoute,
  consumeHead,
  consumeTail,
  cornerArcs,
  isSeparated,
  pointAtArc,
  setTail,
} from './route';
import { STEP_SECONDS, TUNING } from './tuning';
import type {
  Command,
  EnemySpawn,
  EnemyState,
  LaneDef,
  LaneState,
  ProjectileState,
  RoomDef,
  SimEvent,
  SimState,
} from './types';
import { add, dist, len, lerp, normalize, scale, sub, ZERO, type Vec2 } from './vec';

const MAX_ITERATIONS_PER_STEP = 256;

/** Counters for pathological situations; tests assert these stay zero. */
export const simDiagnostics = { iterationOverflows: 0 };

type Kind =
  | 'cut'
  | 'kill'
  | 'boltHit'
  | 'laneHit'
  | 'boltWall'
  | 'contact'
  | 'exhaust'
  | 'dashArrive'
  | 'lane'
  | 'enemyPhase'
  | 'wake'
  | 'boltExpire'
  | 'graceEnd'
  | 'recoverEnd';

const PRIORITY: Readonly<Record<Kind, number>> = {
  cut: 0,
  kill: 1,
  boltHit: 2,
  laneHit: 2,
  boltWall: 3,
  contact: 4,
  exhaust: 4,
  dashArrive: 5,
  lane: 6,
  enemyPhase: 7,
  wake: 8,
  boltExpire: 9,
  graceEnd: 10,
  recoverEnd: 11,
};

const BODY = 0;
const SOUL = 1;
type Endpoint = typeof BODY | typeof SOUL;

interface Candidate {
  readonly tau: number;
  readonly kind: Kind;
  readonly id: number;
  readonly endpoint: Endpoint;
  readonly boundary?: LaneBoundary;
}

const candidate = (tau: number, kind: Kind, id = 0, endpoint: Endpoint = BODY): Candidate => ({
  tau,
  kind,
  id,
  endpoint,
});

/** Earliest candidate; among those within timeEpsilon of the earliest, the tie policy decides. */
function selectBest(cands: readonly Candidate[]): Candidate | null {
  if (cands.length === 0) return null;
  let minTau = Infinity;
  for (const c of cands) minTau = Math.min(minTau, c.tau);
  let best: Candidate | null = null;
  for (const c of cands) {
    if (c.tau > minTau + TUNING.timeEpsilon) continue;
    if (
      best === null ||
      PRIORITY[c.kind] < PRIORITY[best.kind] ||
      (PRIORITY[c.kind] === PRIORITY[best.kind] &&
        (c.id < best.id || (c.id === best.id && c.endpoint < best.endpoint)))
    ) {
      best = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Authored-data lookups
// ---------------------------------------------------------------------------

interface RoomIndex {
  readonly spawns: ReadonlyMap<string, EnemySpawn>;
  readonly lanes: ReadonlyMap<string, LaneDef>;
}
const roomIndexCache = new WeakMap<RoomDef, RoomIndex>();

function roomIndex(room: RoomDef): RoomIndex {
  let index = roomIndexCache.get(room);
  if (!index) {
    index = {
      spawns: new Map(room.enemies.map((e) => [e.id, e])),
      lanes: new Map(room.lanes.map((l) => [l.id, l])),
    };
    roomIndexCache.set(room, index);
  }
  return index;
}

function laneDef(state: SimState, lane: LaneState): LaneDef {
  const def = roomIndex(state.room).lanes.get(lane.key);
  if (!def) throw new Error(`Unknown lane ${lane.key}`);
  return def;
}

// ---------------------------------------------------------------------------
// Motion plan for one iteration
// ---------------------------------------------------------------------------

interface Plan {
  readonly bodyKind: 'static' | 'dash' | 'return';
  readonly body0: Vec2;
  readonly dashVel: Vec2;
  readonly separated: boolean;
  readonly soulSpeed: number;
  readonly pts: readonly Vec2[];
  readonly length: number;
  readonly extendDir: Vec2 | undefined;
  /** Local times at which the soul or returning body passes a route corner. */
  readonly breaks: readonly number[];
}

function buildPlan(state: SimState): Plan {
  const body = state.body;
  const separated = isSeparated(state.route);
  const pts = state.route.points.slice();
  const length = state.route.length;
  const soulSpeed = state.params.soulSpeed * state.soul.speedMultiplier;
  let bodyKind: Plan['bodyKind'] = 'static';
  let dashVel = ZERO;
  let extendDir: Vec2 | undefined;
  if (body.mode === 'dash' && body.dash) {
    bodyKind = 'dash';
    extendDir = normalize(sub(body.dash.to, body.dash.from));
    dashVel = scale(extendDir, TUNING.dashSpeed);
  } else if (body.mode === 'return' && separated) {
    bodyKind = 'return';
  }
  const breaks: number[] = [];
  if (separated) {
    for (const arc of cornerArcs(pts)) {
      if (soulSpeed > 0) breaks.push(arc / soulSpeed);
      if (bodyKind === 'return') breaks.push((length - arc) / TUNING.returnSpeed);
    }
  }
  return { bodyKind, body0: body.pos, dashVel, separated, soulSpeed, pts, length, extendDir, breaks };
}

function bodyAt(plan: Plan, tau: number): Vec2 {
  if (plan.bodyKind === 'dash') return add(plan.body0, scale(plan.dashVel, tau));
  if (plan.bodyKind === 'return') {
    return pointAtArc(plan.pts, Math.max(0, plan.length - TUNING.returnSpeed * tau));
  }
  return plan.body0;
}

function soulAt(plan: Plan, tau: number): Vec2 {
  if (!plan.separated) return bodyAt(plan, tau);
  return pointAtArc(plan.pts, plan.soulSpeed * tau, plan.extendDir);
}

// ---------------------------------------------------------------------------
// Event discovery
// ---------------------------------------------------------------------------

function nextTimer(state: SimState, plan: Plan, limit: number): Candidate | null {
  const cands: Candidate[] = [];
  const body = state.body;
  if (plan.bodyKind === 'dash' && body.dash) {
    cands.push(candidate(Math.max(0, body.dash.duration - body.dash.elapsed), 'dashArrive'));
  }
  if (body.mode === 'recover') cands.push(candidate(Math.max(0, body.recoverLeft), 'recoverEnd'));
  if (state.graceLeft > 0) cands.push(candidate(state.graceLeft, 'graceEnd'));
  if (plan.separated) {
    const closing =
      plan.bodyKind === 'return'
        ? plan.soulSpeed + TUNING.returnSpeed
        : plan.bodyKind === 'dash'
          ? plan.soulSpeed - TUNING.dashSpeed
          : plan.soulSpeed;
    if (closing > 0) cands.push(candidate(plan.length / closing, 'exhaust'));
  }
  const spawns = roomIndex(state.room).spawns;
  for (const e of state.enemies) {
    if (isActive(e.phase)) {
      cands.push(candidate(Math.max(0, e.phaseDuration - e.phaseTime), 'enemyPhase', e.id));
    } else if (e.phase === 'dormant') {
      const wake = spawns.get(e.key)?.wake;
      if (wake?.kind === 'time') cands.push(candidate(Math.max(0, wake.seconds - state.time), 'wake', e.id));
    }
  }
  for (const lane of state.lanes) {
    const boundary = nextLaneBoundary(laneDef(state, lane), lane.cycleTime);
    cands.push({ ...candidate(boundary.dt, 'lane', lane.id), boundary });
  }
  for (const p of state.projectiles) cands.push(candidate(Math.max(0, BOLT_MAX_AGE - p.age), 'boltExpire', p.id));
  return selectBest(cands.filter((c) => c.tau <= limit));
}

function contactEligible(state: SimState, soulPos: Vec2, anchor: Vec2): boolean {
  return corridorClear(state.room, soulPos, anchor, TUNING.soulRadius);
}

function findCollision(state: SimState, plan: Plan, span: number): Candidate | null {
  const cands: Candidate[] = [];
  const dashing = plan.bodyKind === 'dash';
  const room = state.room;

  for (const p of state.projectiles) {
    const hit = sweepCircle(room, p.pos, scale(p.vel, span), p.radius);
    if (hit) cands.push(candidate(hit.t * span, 'boltWall', p.id));
  }

  const inner = plan.breaks.filter((b) => b > 1e-12 && b < span - 1e-12).sort((a, b) => a - b);
  const bounds = [0, ...inner, span];
  const reach = TUNING.bodyRadius + TUNING.soulRadius;
  const activeLanes = state.lanes.filter(
    (l) => l.status === 'active' && l.attackId !== null && !state.damagedAttackIds.has(l.attackId),
  );

  for (let k = 0; k < bounds.length - 1; k++) {
    const ta = bounds[k]!;
    const tb = bounds[k + 1]!;
    const dt = tb - ta;
    const b0 = bodyAt(plan, ta);
    const s0 = soulAt(plan, ta);
    const vb = dt > 0 ? scale(sub(bodyAt(plan, tb), b0), 1 / dt) : ZERO;
    const vs = dt > 0 ? scale(sub(soulAt(plan, tb), s0), 1 / dt) : ZERO;
    const found: Candidate[] = [];

    for (const p of state.projectiles) {
      const p0 = add(p.pos, scale(p.vel, ta));
      const tBody = circleTimeOfImpact(sub(p0, b0), sub(p.vel, vb), TUNING.bodyRadius + p.radius, dt);
      if (tBody !== null) found.push(candidate(ta + tBody, dashing ? 'cut' : 'boltHit', p.id, BODY));
      if (plan.separated) {
        const tSoul = circleTimeOfImpact(sub(p0, s0), sub(p.vel, vs), TUNING.soulRadius + p.radius, dt);
        if (tSoul !== null) found.push(candidate(ta + tSoul, 'boltHit', p.id, SOUL));
      }
    }

    if (dashing) {
      for (const e of state.enemies) {
        if (e.phase === 'dead') continue;
        const tKill = circleTimeOfImpact(sub(b0, e.pos), vb, TUNING.bodyRadius + e.radius, dt);
        if (tKill !== null) found.push(candidate(ta + tKill, 'kill', e.id));
      }
    }

    for (const lane of activeLanes) {
      const endpoints: [Endpoint, Vec2, Vec2, number][] = [[BODY, b0, vb, TUNING.bodyRadius]];
      if (plan.separated) endpoints.push([SOUL, s0, vs, TUNING.soulRadius]);
      for (const [ep, p0, v, r] of endpoints) {
        if (rectSignedDistance(p0, lane.rect).d <= r) {
          const eligible = state.graceLeft <= 0 && !(ep === BODY && dashing);
          if (eligible) found.push(candidate(ta, 'laneHit', lane.id, ep));
        } else if (dt > 0) {
          const frac = circleEntersRect(p0, scale(v, dt), r, lane.rect);
          if (frac !== null) found.push(candidate(ta + frac * dt, 'laneHit', lane.id, ep));
        }
      }
    }

    if (plan.separated && state.contactArmed) {
      const rel = sub(b0, s0);
      if (len(rel) <= reach) {
        if (contactEligible(state, s0, b0)) found.push(candidate(ta, 'contact'));
      } else {
        const tC = circleTimeOfImpact(rel, sub(vb, vs), reach, dt);
        if (tC !== null && contactEligible(state, add(s0, scale(vs, tC)), add(b0, scale(vb, tC)))) {
          found.push(candidate(ta + tC, 'contact'));
        }
      }
    }

    if (found.length > 0) {
      cands.push(...found);
      break;
    }
  }
  return selectBest(cands);
}

// ---------------------------------------------------------------------------
// Advancing time
// ---------------------------------------------------------------------------

function targetPos(state: SimState, e: EnemyState): Vec2 {
  return e.target === 'body' ? state.body.pos : state.soul.pos;
}

function advance(state: SimState, plan: Plan, dt: number): void {
  if (dt <= 0) return;
  const body = state.body;
  const route = state.route;
  if (plan.bodyKind === 'dash' && body.dash) {
    body.dash.elapsed += dt;
    const next = body.dash.elapsed >= body.dash.duration ? body.dash.to : add(plan.body0, scale(plan.dashVel, dt));
    setTail(route, next);
    body.pos = next;
  }
  if (plan.separated) {
    consumeHead(route, plan.soulSpeed * dt);
    if (plan.bodyKind === 'return') consumeTail(route, TUNING.returnSpeed * dt);
    state.soul.pos = route.points[0]!;
    body.pos = route.points[route.points.length - 1]!;
  } else {
    state.soul.pos = body.pos;
  }
  if (body.mode === 'recover') body.recoverLeft = Math.max(0, body.recoverLeft - dt);
  state.graceLeft = Math.max(0, state.graceLeft - dt);
  for (const e of state.enemies) {
    if (!isActive(e.phase)) continue;
    e.phaseTime += dt;
    if (e.phase === 'tracking') {
      e.aim = aimToward(e, targetPos(state, e));
      e.facing = e.aim;
    }
  }
  for (const lane of state.lanes) {
    lane.cycleTime = mod(lane.cycleTime + dt, laneDef(state, lane).period);
  }
  for (const p of state.projectiles) {
    p.pos = add(p.pos, scale(p.vel, dt));
    p.age += dt;
  }
  if (state.buffered) state.bufferedAge += dt;
  state.time += dt;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function removeProjectile(state: SimState, id: number): ProjectileState | undefined {
  const p = state.projectiles.find((q) => q.id === id);
  if (p) {
    p.alive = false;
    state.projectiles = state.projectiles.filter((q) => q.id !== id);
  }
  return p;
}

function wake(state: SimState, e: EnemyState, events: SimEvent[]): void {
  if (e.phase !== 'dormant') return;
  wakeEnemy(e, roomIndex(state.room).spawns.get(e.key));
  events.push({ type: 'wake', t: state.time, enemyId: e.id });
}

function wakeWhere(state: SimState, events: SimEvent[], test: (spawn: EnemySpawn) => boolean): void {
  const spawns = roomIndex(state.room).spawns;
  for (const e of state.enemies) {
    if (e.phase !== 'dormant') continue;
    const spawn = spawns.get(e.key);
    if (spawn && test(spawn)) wake(state, e, events);
  }
}

/** Collapse the route at `at` and leave dash/return as the rules require. */
function reunite(state: SimState, at: Vec2, how: 'contact' | 'exhaust', events: SimEvent[]): void {
  const body = state.body;
  const routeLength = state.route.length;
  clearRoute(state.route);
  body.pos = at;
  state.soul.pos = at;
  state.contactArmed = false;
  let cause: 'contact' | 'exhaustion' | 'return';
  if (body.mode === 'dash') {
    body.dash = null;
    body.mode = 'recover';
    body.recoverLeft = TUNING.recoverySeconds;
    events.push({ type: 'dashEnd', t: state.time, at, reason: 'contact' });
    cause = 'contact';
  } else if (body.mode === 'return') {
    body.mode = 'recover';
    body.recoverLeft = TUNING.recoverySeconds;
    events.push({ type: 'returnStop', t: state.time, at, reason: 'reunited' });
    cause = 'return';
  } else {
    const shortcut = routeLength > TUNING.bodyRadius + TUNING.soulRadius + TUNING.contactArmTolerance + 1e-6;
    cause = how === 'contact' && shortcut ? 'contact' : 'exhaustion';
  }
  if (cause === 'contact') state.stats.contactReunions += 1;
  else state.stats.exhaustionReunions += 1;
  events.push({ type: 'reunion', t: state.time, at, cause });
}

function resolveContact(state: SimState, events: SimEvent[], probe: StepProbe | undefined): void {
  const anchor = state.body.pos;
  const soulFrom = state.soul.pos;
  const disp = sub(anchor, soulFrom);
  // Hazards crossed by the bounded local snap are real hits, earliest first.
  const crossings: { t: number; order: number; id: number; lane: LaneState | null }[] = [];
  for (const p of state.projectiles) {
    const t = circleTimeOfImpact(sub(soulFrom, p.pos), disp, TUNING.soulRadius + p.radius, 1);
    if (t !== null) crossings.push({ t, order: 0, id: p.id, lane: null });
  }
  for (const lane of state.lanes) {
    if (lane.status !== 'active' || lane.attackId === null) continue;
    const t = circleEntersRect(soulFrom, disp, TUNING.soulRadius, lane.rect);
    if (t !== null) crossings.push({ t, order: 1, id: lane.id, lane });
  }
  crossings.sort((a, b) => a.t - b.t || a.order - b.order || a.id - b.id);
  for (const c of crossings) {
    if (state.outcome !== 'playing') return;
    const at = lerp(soulFrom, anchor, c.t);
    if (c.lane) {
      if (c.lane.attackId !== null) applyDamage(state, 'soul', c.lane.attackId, 'lane', at, events);
    } else {
      const p = removeProjectile(state, c.id);
      if (p) {
        events.push({ type: 'projectileGone', t: state.time, projectileId: p.id, at: p.pos, reason: 'endpoint' });
        applyDamage(state, 'soul', p.attackId, 'bolt', at, events);
      }
    }
  }
  if (state.outcome !== 'playing') return;
  if (probe) probe.contact = { at: anchor, soulAt: soulFrom };
  reunite(state, anchor, 'contact', events);
}

function enemyTransition(state: SimState, e: EnemyState, events: SimEvent[]): void {
  const tune = sentryTuning(e.role);
  const t = state.time;
  e.phaseTime = 0;
  switch (e.phase) {
    case 'idle':
      e.phase = 'tracking';
      e.phaseDuration = tune.tracking;
      e.aim = aimToward(e, targetPos(state, e));
      e.facing = e.aim;
      events.push({ type: 'telegraph', t, enemyId: e.id, phase: 'tracking', target: e.target });
      return;
    case 'tracking':
      e.phase = 'locked';
      e.phaseDuration = tune.locked;
      e.aim = aimToward(e, targetPos(state, e));
      e.facing = e.aim;
      e.attackId = state.nextId++;
      events.push({ type: 'telegraph', t, enemyId: e.id, phase: 'locked', target: e.target });
      return;
    case 'locked': {
      const attackId = e.attackId ?? state.nextId++;
      const pos = add(e.pos, scale(e.aim, e.radius));
      const bolt: ProjectileState = {
        id: state.nextId++,
        attackId,
        sourceId: e.id,
        pos,
        prevPos: pos,
        vel: scale(e.aim, tune.boltSpeed),
        radius: tune.boltRadius,
        age: 0,
        alive: true,
      };
      state.projectiles.push(bolt);
      e.attackId = null;
      e.phase = 'recover';
      e.phaseDuration = tune.recover;
      events.push({ type: 'fire', t, enemyId: e.id, projectileId: bolt.id, attackId, at: pos });
      return;
    }
    case 'recover':
      e.phase = 'idle';
      e.phaseDuration = tune.cooldown;
      return;
    default:
      return;
  }
}

function resolve(state: SimState, ev: Candidate, events: SimEvent[], probe: StepProbe | undefined): void {
  const t = state.time;
  const body = state.body;
  switch (ev.kind) {
    case 'cut': {
      const p = removeProjectile(state, ev.id);
      if (p) {
        state.stats.cuts += 1;
        events.push({ type: 'cut', t, projectileId: p.id, at: p.pos });
      }
      return;
    }
    case 'kill': {
      const e = state.enemies.find((q) => q.id === ev.id);
      if (!e || e.phase === 'dead') return;
      e.phase = 'dead';
      e.phaseTime = 0;
      e.phaseDuration = Infinity;
      e.attackId = null;
      state.stats.kills += 1;
      events.push({ type: 'kill', t, enemyId: e.id, role: e.role, at: e.pos });
      wakeWhere(state, events, (s) => s.wake?.kind === 'enemyKilled' && s.wake.enemy === e.key);
      return;
    }
    case 'boltHit': {
      const p = removeProjectile(state, ev.id);
      if (!p) return;
      const endpoint = ev.endpoint === BODY ? 'body' : 'soul';
      const at = endpoint === 'body' ? body.pos : state.soul.pos;
      events.push({ type: 'projectileGone', t, projectileId: p.id, at: p.pos, reason: 'endpoint' });
      applyDamage(state, endpoint, p.attackId, 'bolt', at, events);
      return;
    }
    case 'laneHit': {
      const lane = state.lanes.find((l) => l.id === ev.id);
      if (!lane || lane.attackId === null) return;
      const endpoint = ev.endpoint === BODY ? 'body' : 'soul';
      const at = endpoint === 'body' ? body.pos : state.soul.pos;
      if (endpoint === 'body' && body.mode === 'dash') {
        events.push({ type: 'shielded', t, endpoint, attackId: lane.attackId, at, reason: 'dash' });
      } else {
        applyDamage(state, endpoint, lane.attackId, 'lane', at, events);
      }
      return;
    }
    case 'boltWall': {
      const p = removeProjectile(state, ev.id);
      if (p) events.push({ type: 'projectileGone', t, projectileId: p.id, at: p.pos, reason: 'wall' });
      return;
    }
    case 'boltExpire': {
      const p = removeProjectile(state, ev.id);
      if (p) events.push({ type: 'projectileGone', t, projectileId: p.id, at: p.pos, reason: 'range' });
      return;
    }
    case 'contact':
      resolveContact(state, events, probe);
      return;
    case 'exhaust':
      reunite(state, body.pos, 'exhaust', events);
      return;
    case 'dashArrive': {
      const dash = body.dash;
      if (!dash) return;
      body.pos = dash.to;
      if (isSeparated(state.route)) setTail(state.route, dash.to);
      body.dash = null;
      body.mode = 'recover';
      body.recoverLeft = TUNING.recoverySeconds;
      events.push({ type: 'dashEnd', t, at: dash.to, reason: 'arrived' });
      return;
    }
    case 'recoverEnd':
      body.recoverLeft = 0;
      body.mode = 'ready';
      events.push({ type: 'ready', t });
      executeBuffered(state, events, probe);
      return;
    case 'graceEnd':
      state.graceLeft = 0;
      return;
    case 'enemyPhase': {
      const e = state.enemies.find((q) => q.id === ev.id);
      if (e && isActive(e.phase)) enemyTransition(state, e, events);
      return;
    }
    case 'wake': {
      const e = state.enemies.find((q) => q.id === ev.id);
      if (e) wake(state, e, events);
      return;
    }
    case 'lane': {
      const lane = state.lanes.find((l) => l.id === ev.id);
      const boundary = ev.boundary;
      if (!lane || !boundary) return;
      lane.cycleTime = mod(boundary.at, laneDef(state, lane).period);
      if (lane.status === boundary.status) return;
      lane.status = boundary.status;
      lane.attackId = boundary.status === 'active' ? state.nextId++ : null;
      events.push({ type: 'lane', t, laneId: lane.id, status: lane.status });
      return;
    }
  }
}

/** State-derived transitions checked after every resolution: arming, proximity wakes, gate, victory. */
function settle(state: SimState, events: SimEvent[]): void {
  if (state.outcome !== 'playing') return;
  const t = state.time;
  const body = state.body;
  const separated = isSeparated(state.route);
  if (
    separated &&
    !state.contactArmed &&
    dist(body.pos, state.soul.pos) > TUNING.bodyRadius + TUNING.soulRadius + TUNING.contactArmTolerance
  ) {
    state.contactArmed = true;
    events.push({ type: 'separated', t });
    wakeWhere(state, events, (s) => s.wake?.kind === 'separated');
  }
  wakeWhere(
    state,
    events,
    (s) => s.wake?.kind === 'bodyWithin' && dist(body.pos, s.at) <= s.wake.radius,
  );

  const cleared = state.enemies.every((e) => e.phase === 'dead');
  const gate = !cleared ? 'sealed' : separated ? 'ready' : 'open';
  if (gate !== state.gate) {
    if (state.gate === 'sealed') events.push({ type: 'roomCleared', t });
    state.gate = gate;
    events.push({ type: 'gate', t, status: gate });
  }
  if (
    state.gate === 'open' &&
    (body.mode === 'ready' || body.mode === 'recover') &&
    pointInRect(body.pos, state.room.exit)
  ) {
    state.outcome = 'victory';
    body.mode = 'exited';
    body.recoverLeft = 0;
    state.buffered = null;
    events.push({ type: 'victory', t });
  }
}

/** Advance one fixed step. `probe` lets previews observe execution internals. */
export function stepInternal(state: SimState, commands: readonly Command[], probe?: StepProbe): SimEvent[] {
  const events: SimEvent[] = [];
  state.body.prevPos = state.body.pos;
  state.soul.prevPos = state.soul.pos;
  for (const p of state.projectiles) p.prevPos = p.pos;

  if (state.outcome === 'playing') {
    commands.forEach((cmd, i) => {
      if (i === 0) applyCommand(state, cmd, events, probe);
      else events.push({ type: 'rejected', t: state.time, command: cmd.kind, reason: 'busy' });
    });
    settle(state, events);

    let remaining = STEP_SECONDS;
    let iterations = 0;
    while (remaining > 1e-12 && state.outcome === 'playing') {
      if (++iterations > MAX_ITERATIONS_PER_STEP) {
        simDiagnostics.iterationOverflows += 1;
        break;
      }
      const plan = buildPlan(state);
      const timer = nextTimer(state, plan, remaining);
      const span = timer ? timer.tau : remaining;
      const collision = findCollision(state, plan, span);
      const ev = selectBest([collision, timer].filter((c): c is Candidate => c !== null));
      const dt = ev ? Math.min(ev.tau, remaining) : remaining;
      advance(state, plan, dt);
      remaining -= dt;
      if (ev) resolve(state, ev, events, probe);
      settle(state, events);
    }
  } else {
    for (const cmd of commands) events.push({ type: 'rejected', t: state.time, command: cmd.kind, reason: 'ended' });
  }
  state.tick += 1;
  state.time = state.tick * STEP_SECONDS;
  return events;
}
