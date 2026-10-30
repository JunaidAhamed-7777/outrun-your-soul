/**
 * Structural invariants from COMBAT_SPEC "Assert after each step". Returns readable
 * violations; tests run this after every step and dev builds may log it.
 */
import { circleClear, corridorClear } from './geom';
import { isActive } from './enemies';
import { polylineLength } from './route';
import { TUNING } from './tuning';
import type { SimState } from './types';
import { dist } from './vec';

const POS_EPS = 1e-6;
const LEN_EPS = 1e-6;

export function checkInvariants(state: SimState): string[] {
  const errors: string[] = [];
  const { body, soul, route, room } = state;
  const pts = route.points;

  if (pts.length === 0) {
    if (dist(body.pos, soul.pos) > POS_EPS) errors.push('reunited but body and soul positions differ');
    if (route.length !== 0) errors.push('empty route has non-zero length');
    if (state.contactArmed) errors.push('contact armed while reunited');
  } else {
    if (pts.length < 2) errors.push('separated route needs at least two points');
    if (dist(pts[0]!, soul.pos) > POS_EPS) errors.push('route head does not equal soul position');
    if (dist(pts[pts.length - 1]!, body.pos) > POS_EPS) errors.push('route tail does not equal body position');
    const measured = polylineLength(pts);
    if (Math.abs(measured - route.length) > LEN_EPS) {
      errors.push(`cached route length ${route.length} != measured ${measured}`);
    }
    if (route.length > state.params.tetherCapacity + LEN_EPS) {
      errors.push(`route length ${route.length} exceeds capacity ${state.params.tetherCapacity}`);
    }
    if (pts.length > TUNING.maxRouteVertices) errors.push(`route has ${pts.length} vertices`);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (dist(a, b) < 1e-12) continue;
      if (!corridorClear(room, a, b, TUNING.soulRadius - 1e-7)) {
        errors.push(`route segment ${i} is not traversable at soul radius`);
      }
    }
  }

  if (!circleClear(room, body.pos, TUNING.bodyRadius - 1e-7)) errors.push('body overlaps a wall or bound');
  if (!circleClear(room, soul.pos, TUNING.soulRadius - 1e-7)) errors.push('soul overlaps a wall or bound');

  if (state.health < 0 || state.health > state.maxHealth) errors.push(`health ${state.health} out of range`);
  if (state.graceLeft < 0) errors.push('negative grace');
  if ((body.mode === 'dash') !== (body.dash !== null)) errors.push('dash travel inconsistent with body mode');
  if (body.recoverLeft > 0 && body.mode !== 'recover') errors.push('recovery time outside recover mode');
  if ((state.outcome === 'defeat') !== (body.mode === 'dead')) errors.push('defeat inconsistent with body mode');
  if ((state.outcome === 'victory') !== (body.mode === 'exited')) errors.push('victory inconsistent with body mode');
  if (state.buffered && body.mode !== 'dash' && body.mode !== 'recover') {
    errors.push(`buffered command while body is ${body.mode}`);
  }

  const cleared = state.enemies.every((e) => e.phase === 'dead');
  const expectedGate = !cleared ? 'sealed' : pts.length > 0 ? 'ready' : 'open';
  if (state.outcome === 'playing' && state.gate !== expectedGate) {
    errors.push(`gate ${state.gate} but expected ${expectedGate}`);
  }

  for (const id of state.damagedAttackIds) {
    if (id >= state.nextId) errors.push(`damaged attack ${id} was never issued`);
  }
  const seen = new Set<number>();
  for (const p of state.projectiles) {
    if (!p.alive) errors.push(`dead projectile ${p.id} still listed`);
    if (seen.has(p.id)) errors.push(`duplicate projectile ${p.id}`);
    seen.add(p.id);
  }
  for (const e of state.enemies) {
    if (e.phase === 'locked' && e.attackId === null) errors.push(`enemy ${e.key} locked without attack ID`);
    if (!isActive(e.phase) && e.attackId !== null) errors.push(`inactive enemy ${e.key} holds attack ID`);
    if (Math.abs(Math.hypot(e.aim.x, e.aim.y) - 1) > 1e-6) errors.push(`enemy ${e.key} aim is not unit`);
    if (e.lockTarget != null && e.phase !== 'locked') errors.push(`enemy ${e.key} holds a lock target while ${e.phase}`);
  }
  const relics = state.relicState;
  if (relics) {
    const bell = relics.config.mourningBell;
    if (!bell && (relics.bellKills !== 0 || relics.bellCharged)) errors.push('bell state without Mourning Bell');
    if (bell && (relics.bellKills < 0 || relics.bellKills >= Math.max(1, bell.killsPerCharge))) {
      errors.push(`bell kill count ${relics.bellKills} out of range`);
    }
    if (!relics.config.travelersKnot && (relics.knotMarked || relics.decoy)) errors.push("knot state without Traveler's Knot");
    if (relics.knotMarked && relics.decoy) errors.push('a knot mark and an active decoy at once');
    const claimer = relics.decoy?.claimedBy;
    if (claimer != null && state.enemies.find((e) => e.id === claimer)?.phase !== 'tracking') {
      errors.push('decoy claimed by a sentry that is not tracking');
    }
    if (state.soul.boostLeft > 0 && !relics.config.needlesong) errors.push('soul boost without Needlesong');
  }
  if ((state.soul.boostLeft > 0) !== (state.soul.speedMultiplier !== 1)) errors.push('soul boost timer and multiplier disagree');
  for (const p of state.projectiles) {
    const scale = p.speedScale ?? 1;
    const expected = p.inHalo ? (relics?.config.glassLantern?.slowFactor ?? 1) : 1;
    if (Math.abs(scale - expected) > 1e-12) errors.push(`bolt ${p.id} speed scale ${scale} does not match halo state`);
  }
  for (const lane of state.lanes) {
    if ((lane.status === 'active') !== (lane.attackId !== null)) {
      errors.push(`lane ${lane.key} attack ID inconsistent with status`);
    }
  }
  return errors;
}
