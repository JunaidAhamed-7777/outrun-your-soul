/**
 * The Last Warden: the game's flaw reflected back. A fast armoured body runs telegraphed
 * routes while its slower, vulnerable heart follows that route behind it, exactly like
 * the player's soul. The heart is the only weak point, and only while it trails.
 *
 * Patterns (data in BOSS_TUNING.stages, overridable per BossSpawn):
 *  - charge: show a two-leg route (toward the body, then toward the soul), frozen; run it.
 *    The running body damages endpoints it passes (one attack ID per charge). Afterwards
 *    the heart walks the route home: that walk is the opening.
 *  - fan: show three bolt lines led onto the soul's forecast position, frozen; fire.
 *    The heart is home during a fan, so it is pure pressure.
 * Each heart hit staggers the boss and advances the stage; the last stage remixes both.
 *
 * Everything here is data-driven and deterministic; numbers are unvalidated.
 */
import { applyDamage, stopDashGuarded } from './combat';
import { leadSoul } from './forecast';
import { circleApproachTime, circleTimeOfImpact, sweepCircle } from './geom';
import { beginAppend, clearRoute, consumeHead, cornerArcs, isSeparated, pointAtArc, setTail } from './route';
import { TUNING } from './tuning';
import type { BossPatternKind, BossSpawn, BossState, EntityId, ProjectileState, SimEvent, SimState } from './types';
import { add, dist, fromAngle, normalize, scale, sub, ZERO, type Vec2 } from './vec';

export const BOSS_TUNING = {
  bodyRadius: 0.6,
  heartRadius: 0.35,
  heartSpeed: 2.2,
  maxHp: 3,
  /** Pause between patterns once the heart is home. */
  idle: 1.0,
  /** After a heart hit: the body freezes, the heart keeps walking home. */
  stagger: 1.4,
  charge: { aim: 1.2, speed: 8, legLength: 3.4 },
  fan: { aim: 1.0, bolts: 3, spreadDeg: 22, boltSpeed: 4.5, boltRadius: 0.18 },
  /** Stage 1 and 2 teach the two patterns; stage 3 remixes them. */
  stages: [['charge', 'fan'], ['fan', 'charge'], ['charge', 'fan', 'charge']] as readonly (readonly BossPatternKind[])[],
} as const;

export type BossKind = 'bossHeart' | 'bossGuard' | 'bossHit' | 'bossLeg' | 'bossPhase' | 'bossHome' | 'bossWake';

export interface BossCandidate {
  readonly tau: number;
  readonly kind: BossKind;
  readonly id: number;
  readonly endpoint: 0 | 1;
}

export function createBoss(spawn: BossSpawn, id: EntityId): BossState {
  const dormant = spawn.dormant === true;
  return {
    id,
    key: spawn.id,
    phase: dormant ? 'dormant' : 'idle',
    phaseTime: 0,
    phaseDuration: dormant ? Infinity : BOSS_TUNING.idle,
    body: { pos: spawn.at, prevPos: spawn.at, facing: spawn.facing ? normalize(spawn.facing) : { x: 0, y: -1 } },
    heart: { pos: spawn.at, prevPos: spawn.at },
    route: { points: [], length: 0 },
    path: [],
    legIndex: 0,
    fan: [],
    attackId: null,
    chargeTouched: [],
    hp: BOSS_TUNING.maxHp,
    maxHp: BOSS_TUNING.maxHp,
    stage: 0,
    step: 0,
  };
}

export function bossAlive(state: SimState): boolean {
  return !!state.boss && state.boss.phase !== 'dead';
}

function stagesOf(state: SimState): readonly (readonly BossPatternKind[])[] {
  return state.room.boss?.stages ?? BOSS_TUNING.stages;
}

/** The heart is a valid target only while it trails the body and the boss is not staggered. */
export function heartVulnerable(b: BossState): boolean {
  return isSeparated(b.route) && b.phase !== 'stagger' && b.phase !== 'dead' && b.phase !== 'dormant';
}

// ---------------------------------------------------------------------------
// Motion within one iteration
// ---------------------------------------------------------------------------

export interface BossPlan {
  readonly body0: Vec2;
  readonly vel: Vec2;
  readonly separated: boolean;
  readonly pts: readonly Vec2[];
  readonly length: number;
  readonly extendDir: Vec2 | undefined;
  readonly breaks: readonly number[];
}

export function buildBossPlan(b: BossState): BossPlan {
  const separated = isSeparated(b.route);
  let vel = ZERO;
  let extendDir: Vec2 | undefined;
  if (b.phase === 'charge') {
    const target = b.path[b.legIndex + 1];
    if (target) {
      extendDir = normalize(sub(target, b.body.pos));
      vel = scale(extendDir, BOSS_TUNING.charge.speed);
    }
  }
  const pts = b.route.points.slice();
  const breaks = separated ? cornerArcs(pts).map((arc) => arc / BOSS_TUNING.heartSpeed) : [];
  return { body0: b.body.pos, vel, separated, pts, length: b.route.length, extendDir, breaks };
}

export function bossBodyAt(bp: BossPlan, tau: number): Vec2 {
  return add(bp.body0, scale(bp.vel, tau));
}

export function bossHeartAt(bp: BossPlan, tau: number): Vec2 {
  if (!bp.separated) return bossBodyAt(bp, tau);
  return pointAtArc(bp.pts, BOSS_TUNING.heartSpeed * tau, bp.extendDir);
}

export function bossTimers(state: SimState, bp: BossPlan): BossCandidate[] {
  const b = state.boss;
  if (!b || b.phase === 'dead') return [];
  const out: BossCandidate[] = [];
  if (b.phase === 'dormant') {
    const wake = state.room.boss?.wake;
    if (wake?.kind === 'time') out.push({ tau: Math.max(0, wake.seconds - state.time), kind: 'bossWake', id: b.id, endpoint: 0 });
    return out;
  }
  if (Number.isFinite(b.phaseDuration)) {
    out.push({ tau: Math.max(0, b.phaseDuration - b.phaseTime), kind: 'bossPhase', id: b.id, endpoint: 0 });
  }
  if (b.phase === 'charge') {
    const target = b.path[b.legIndex + 1];
    if (target) out.push({ tau: dist(b.body.pos, target) / BOSS_TUNING.charge.speed, kind: 'bossLeg', id: b.id, endpoint: 0 });
  } else if (bp.separated) {
    out.push({ tau: bp.length / BOSS_TUNING.heartSpeed, kind: 'bossHome', id: b.id, endpoint: 0 });
  }
  return out;
}

/** Player-vs-boss contacts within one linear piece [ta, ta + dt]. */
export function bossCollisions(
  state: SimState,
  bp: BossPlan,
  ta: number,
  dt: number,
  playerBody: { readonly p0: Vec2; readonly v: Vec2 },
  playerSoul: { readonly p0: Vec2; readonly v: Vec2 } | null,
  dashing: boolean,
): BossCandidate[] {
  const b = state.boss;
  if (!b || b.phase === 'dead' || b.phase === 'dormant') return [];
  const out: BossCandidate[] = [];
  const B0 = bossBodyAt(bp, ta);
  const vB = bp.vel;
  if (dashing) {
    if (heartVulnerable(b)) {
      const h0 = bossHeartAt(bp, ta);
      const vH = dt > 0 ? scale(sub(bossHeartAt(bp, ta + dt), h0), 1 / dt) : ZERO;
      const t = circleTimeOfImpact(sub(playerBody.p0, h0), sub(playerBody.v, vH), TUNING.bodyRadius + BOSS_TUNING.heartRadius, dt);
      if (t !== null) out.push({ tau: ta + t, kind: 'bossHeart', id: b.id, endpoint: 0 });
    }
    const g = circleApproachTime(sub(playerBody.p0, B0), sub(playerBody.v, vB), TUNING.bodyRadius + BOSS_TUNING.bodyRadius, dt);
    if (g !== null) out.push({ tau: ta + g, kind: 'bossGuard', id: b.id, endpoint: 0 });
  }
  if (b.phase === 'charge' && b.attackId !== null) {
    if (!b.chargeTouched.includes('body')) {
      const tb = circleTimeOfImpact(sub(B0, playerBody.p0), sub(vB, playerBody.v), TUNING.bodyRadius + BOSS_TUNING.bodyRadius, dt);
      if (tb !== null) out.push({ tau: ta + tb, kind: 'bossHit', id: b.id, endpoint: 0 });
    }
    if (playerSoul && !b.chargeTouched.includes('soul')) {
      const ts = circleTimeOfImpact(sub(B0, playerSoul.p0), sub(vB, playerSoul.v), TUNING.soulRadius + BOSS_TUNING.bodyRadius, dt);
      if (ts !== null) out.push({ tau: ta + ts, kind: 'bossHit', id: b.id, endpoint: 1 });
    }
  }
  return out;
}

export function advanceBoss(state: SimState, bp: BossPlan, dt: number): void {
  const b = state.boss;
  if (!b || dt <= 0 || b.phase === 'dead') return;
  if (b.phase !== 'dormant') b.phaseTime += dt;
  if (b.phase === 'charge' && (bp.vel.x !== 0 || bp.vel.y !== 0)) {
    b.body.pos = add(bp.body0, scale(bp.vel, dt));
    setTail(b.route, b.body.pos);
  }
  if (bp.separated || isSeparated(b.route)) {
    consumeHead(b.route, BOSS_TUNING.heartSpeed * dt);
    b.heart.pos = b.route.points[0] ?? b.body.pos;
    b.body.pos = b.route.points[b.route.points.length - 1] ?? b.body.pos;
  } else {
    b.heart.pos = b.body.pos;
  }
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** Longest wall-clear run from `from` along `dir`, up to `length`. */
function clampLeg(state: SimState, from: Vec2, dir: Vec2, length: number): Vec2 {
  const hit = sweepCircle(state.room, from, scale(dir, length), BOSS_TUNING.bodyRadius + TUNING.wallSkin);
  return add(from, scale(dir, hit ? length * hit.t : length));
}

function chargePath(state: SimState, b: BossState): Vec2[] {
  const L = BOSS_TUNING.charge.legLength;
  let d1 = normalize(sub(state.body.pos, b.body.pos));
  if (d1.x === 0 && d1.y === 0) d1 = b.body.facing;
  const p1 = clampLeg(state, b.body.pos, d1, L);
  let d2 = normalize(sub(state.soul.pos, p1));
  if (d2.x === 0 && d2.y === 0) d2 = { x: -d1.y, y: d1.x };
  const p2 = clampLeg(state, p1, d2, L);
  const path = [b.body.pos];
  if (dist(p1, b.body.pos) > 0.25) path.push(p1);
  if (dist(p2, path[path.length - 1]!) > 0.25) path.push(p2);
  return path;
}

function fanDirections(state: SimState, b: BossState, events: SimEvent[]): Vec2[] {
  const f = BOSS_TUNING.fan;
  // A new aim acquisition: a Traveler's Knot decoy takes it (claimed and consumed at once).
  const relics = state.relicState;
  let target: Vec2;
  if (relics?.decoy && relics.decoyClaimedBy === null) {
    target = relics.decoy;
    events.push({ type: 'decoyTaken', t: state.time, enemyId: b.id, at: target });
    relics.decoy = null;
  } else {
    target = leadSoul(state, b.body.pos, BOSS_TUNING.bodyRadius, f.boltSpeed, f.aim);
  }
  let centre = normalize(sub(target, b.body.pos));
  if (centre.x === 0 && centre.y === 0) centre = b.body.facing;
  const base = Math.atan2(centre.y, centre.x);
  const spread = (f.spreadDeg * Math.PI) / 180;
  const dirs: Vec2[] = [];
  for (let i = 0; i < f.bolts; i++) dirs.push(fromAngle(base + (i - (f.bolts - 1) / 2) * spread));
  return dirs;
}

function startNextPattern(state: SimState, b: BossState, events: SimEvent[]): void {
  const stages = stagesOf(state);
  const list = stages[Math.min(b.stage, stages.length - 1)] ?? ['charge'];
  const kind = list[b.step % list.length] ?? 'charge';
  b.step += 1;
  b.phaseTime = 0;
  if (kind === 'charge') {
    b.path = chargePath(state, b);
    if (b.path.length < 2) {
      // Nowhere to run (pinned in a corner): fall back to a fan rather than stalling.
      startFan(state, b, events);
      return;
    }
    b.phase = 'aimCharge';
    b.phaseDuration = BOSS_TUNING.charge.aim;
    b.attackId = state.nextId++;
    b.chargeTouched = [];
    b.body.facing = normalize(sub(b.path[1]!, b.body.pos));
    events.push({ type: 'boss', t: state.time, what: 'telegraph', at: b.body.pos, pattern: 'charge', path: b.path.slice() });
  } else {
    startFan(state, b, events);
  }
}

function startFan(state: SimState, b: BossState, events: SimEvent[]): void {
  b.phase = 'aimFan';
  b.phaseDuration = BOSS_TUNING.fan.aim;
  b.phaseTime = 0;
  b.fan = fanDirections(state, b, events);
  b.body.facing = b.fan[Math.floor(b.fan.length / 2)] ?? b.body.facing;
  events.push({ type: 'boss', t: state.time, what: 'telegraph', at: b.body.pos, pattern: 'fan', directions: b.fan.slice() });
}

function fireFan(state: SimState, b: BossState, events: SimEvent[]): void {
  const f = BOSS_TUNING.fan;
  for (const dir of b.fan) {
    const pos = add(b.body.pos, scale(dir, BOSS_TUNING.bodyRadius));
    const bolt: ProjectileState = {
      id: state.nextId++,
      attackId: state.nextId++,
      sourceId: b.id,
      pos,
      prevPos: pos,
      vel: scale(dir, f.boltSpeed),
      radius: f.boltRadius,
      age: 0,
      alive: true,
      aimPoint: null,
      speedScale: 1,
      slowed: false,
    };
    state.projectiles.push(bolt);
    events.push({ type: 'fire', t: state.time, enemyId: b.id, projectileId: bolt.id, attackId: bolt.attackId, at: pos });
  }
  events.push({ type: 'boss', t: state.time, what: 'fan', at: b.body.pos, pattern: 'fan' });
  b.fan = [];
  b.phase = 'idle';
  b.phaseTime = 0;
  b.phaseDuration = BOSS_TUNING.idle;
}

function beginLeg(b: BossState): void {
  const from = b.path[b.legIndex]!;
  const to = b.path[b.legIndex + 1]!;
  const dir = normalize(sub(to, from));
  beginAppend(b.route, b.body.pos, dir);
  b.body.facing = dir;
}

export function wakeBoss(state: SimState, events: SimEvent[]): void {
  const b = state.boss;
  if (!b || b.phase !== 'dormant') return;
  b.phase = 'idle';
  b.phaseTime = 0;
  b.phaseDuration = BOSS_TUNING.idle;
  events.push({ type: 'boss', t: state.time, what: 'wake', at: b.body.pos });
}

export function resolveBoss(state: SimState, kind: BossKind, endpoint: 0 | 1, events: SimEvent[]): void {
  const b = state.boss;
  if (!b || b.phase === 'dead') return;
  const t = state.time;
  switch (kind) {
    case 'bossWake':
      wakeBoss(state, events);
      return;
    case 'bossPhase':
      switch (b.phase) {
        case 'idle':
          startNextPattern(state, b, events);
          return;
        case 'aimCharge':
          b.phase = 'charge';
          b.phaseTime = 0;
          b.phaseDuration = Infinity;
          b.legIndex = 0;
          beginLeg(b);
          events.push({ type: 'boss', t, what: 'charge', at: b.body.pos, pattern: 'charge' });
          return;
        case 'aimFan':
          fireFan(state, b, events);
          return;
        case 'stagger':
          b.phaseTime = 0;
          if (isSeparated(b.route)) {
            b.phase = 'recover';
            b.phaseDuration = Infinity;
          } else {
            b.phase = 'idle';
            b.phaseDuration = BOSS_TUNING.idle;
          }
          return;
        default:
          return;
      }
    case 'bossLeg': {
      const target = b.path[b.legIndex + 1];
      if (!target) return;
      b.body.pos = target;
      setTail(b.route, target);
      b.legIndex += 1;
      if (b.legIndex + 1 < b.path.length) {
        beginLeg(b);
      } else {
        b.phase = 'recover';
        b.phaseTime = 0;
        b.phaseDuration = Infinity;
        b.attackId = null;
        b.path = [];
      }
      return;
    }
    case 'bossHome':
      clearRoute(b.route);
      b.heart.pos = b.body.pos;
      events.push({ type: 'boss', t, what: 'reunited', at: b.body.pos });
      if (b.phase === 'recover') {
        b.phase = 'idle';
        b.phaseTime = 0;
        b.phaseDuration = BOSS_TUNING.idle;
      }
      return;
    case 'bossGuard':
      stopDashGuarded(state, b.id, events);
      return;
    case 'bossHit': {
      if (b.attackId === null) return;
      const ep = endpoint === 0 ? 'body' : 'soul';
      const at = ep === 'body' ? state.body.pos : state.soul.pos;
      b.chargeTouched.push(ep);
      if (ep === 'body' && state.body.mode === 'dash') {
        events.push({ type: 'shielded', t, endpoint: ep, attackId: b.attackId, at, reason: 'dash' });
      } else {
        applyDamage(state, ep, b.attackId, 'charge', at, events);
      }
      return;
    }
    case 'bossHeart': {
      if (!heartVulnerable(b)) return;
      b.hp -= 1;
      events.push({ type: 'boss', t, what: 'heartHit', at: b.heart.pos, hp: b.hp });
      b.attackId = null;
      b.path = [];
      b.fan = [];
      if (b.hp <= 0) {
        b.phase = 'dead';
        b.phaseDuration = Infinity;
        events.push({ type: 'boss', t, what: 'defeated', at: b.body.pos });
        return;
      }
      b.phase = 'stagger';
      b.phaseTime = 0;
      b.phaseDuration = BOSS_TUNING.stagger;
      b.stage = Math.min(b.stage + 1, stagesOf(state).length - 1);
      b.step = 0;
      events.push({ type: 'boss', t, what: 'stagger', at: b.body.pos, hp: b.hp });
      return;
    }
  }
}

/** Invariant violations for the boss (empty when healthy). */
export function bossInvariants(state: SimState): string[] {
  const b = state.boss;
  if (!b) return [];
  const errors: string[] = [];
  const pts = b.route.points;
  if (pts.length === 0) {
    if (dist(b.heart.pos, b.body.pos) > 1e-6) errors.push('boss heart away from body without a route');
  } else {
    if (dist(pts[0]!, b.heart.pos) > 1e-6) errors.push('boss route head is not the heart');
    if (dist(pts[pts.length - 1]!, b.body.pos) > 1e-6) errors.push('boss route tail is not the body');
  }
  if (b.hp < 0 || b.hp > b.maxHp) errors.push('boss hp out of range');
  if ((b.phase === 'dead') !== (b.hp <= 0)) errors.push('boss death inconsistent with hp');
  if (b.phase === 'charge' && b.path.length < 2) errors.push('boss charging without a path');
  return errors;
}
