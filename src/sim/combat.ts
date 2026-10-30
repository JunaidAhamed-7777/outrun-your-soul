/**
 * Shared-health damage accounting. One attack ID damages at most once, damage grants a
 * brief global grace (not dash protection), and health zero ends the room.
 */
import { TUNING } from './tuning';
import type { AttackId, SimEvent, SimState } from './types';
import type { Vec2 } from './vec';

export function applyDamage(
  state: SimState,
  endpoint: 'body' | 'soul',
  attackId: AttackId,
  source: 'bolt' | 'lane',
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
