/**
 * Shared-health damage accounting. One attack ID damages at most once, damage grants a
 * brief global grace (not dash protection), and health zero ends the room.
 */
import { isSeparated, setTail } from './route';
import { TUNING } from './tuning';
import type { AttackId, EntityId, SimEvent, SimState } from './types';
import type { Vec2 } from './vec';

export function applyDamage(
  state: SimState,
  endpoint: 'body' | 'soul',
  attackId: AttackId,
  source: 'bolt' | 'lane' | 'sweep' | 'charge',
  at: Vec2,
  events: SimEvent[],
): void {
  const t = state.time;
  if (state.damagedAttackIds.has(attackId)) {
    events.push({ type: 'shielded', t, endpoint, attackId, at, reason: 'spent' });
    return;
  }
  if (state.graceLeft > 0) {
    events.push({ type: 'shielded', t, endpoint, attackId, at, reason: 'grace' });
    return;
  }
  state.damagedAttackIds.add(attackId);
  state.health = Math.max(0, state.health - 1);
  state.graceLeft = TUNING.hitGraceSeconds;
  state.stats.hits += 1;
  events.push({ type: 'hit', t, endpoint, attackId, at, health: state.health, source });
  if (state.health <= 0) {
    state.outcome = 'defeat';
    state.body.mode = 'dead';
    state.body.dash = null;
    state.body.recoverLeft = 0;
    state.buffered = null;
    events.push({ type: 'defeat', t });
  }
}

/** An outward dash that struck armour (warden front, boss body) stops at contact; nobody is hurt. */
export function stopDashGuarded(state: SimState, enemyId: EntityId, events: SimEvent[]): void {
  const body = state.body;
  if (!body.dash) return;
  const at = body.pos;
  if (isSeparated(state.route)) setTail(state.route, at);
  body.dash = null;
  body.mode = 'recover';
  body.recoverLeft = TUNING.recoverySeconds;
  events.push({ type: 'guarded', t: state.time, enemyId, at });
  events.push({ type: 'dashEnd', t: state.time, at, reason: 'guarded' });
}
