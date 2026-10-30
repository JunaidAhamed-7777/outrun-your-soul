/**
 * Where the soul will be, assuming no further player commands: it keeps following its
 * committed route at its current speed (including an active timed boost) until it meets
 * the body. Used by keepers to lock onto the soul's future position, and by the renderer
 * (through EnemyState.aimTarget / lockTarget) to put the reticle on the ribbon.
 *
 * Deliberately kinematic, not a full simulation: it ignores future hits, kills and relic
 * triggers. A RETURN, a contact dash or a new dash issued after the lock changes where the
 * soul actually goes - that is the counterplay.
 */
import { pointAtArc } from './route';
import { TUNING } from './tuning';
import type { SimState } from './types';
import { dist, type Vec2 } from './vec';

/** Arc length the soul covers in `t` seconds from now. */
function soulTravel(state: SimState, t: number): number {
  const base = state.params.soulSpeed;
  const mult = state.soul.speedMultiplier;
  const boost = state.soul.boostLeft;
  if (boost > 0 && mult !== 1) return base * mult * Math.min(t, boost) + base * Math.max(0, t - boost);
  return base * mult * t;
}

/** Predicted soul centre `t` seconds from now under passive play. */
export function forecastSoulPos(state: SimState, t: number): Vec2 {
  const pts = state.route.points;
  if (pts.length === 0 || t <= 0) return state.soul.pos;
  const body = state.body;
  const reach = TUNING.bodyRadius + TUNING.soulRadius;
  let path: readonly Vec2[] = pts;
  let end = state.route.length;
  if (body.mode === 'dash' && body.dash) {
    // The tail keeps growing to the dash endpoint; the soul may walk onto that segment.
    const last = pts[pts.length - 1]!;
    path = [...pts, body.dash.to];
    end += dist(last, body.dash.to);
  } else if (body.mode === 'return') {
    // Body consumes the tail while the soul consumes the head: they meet in between.
    const meet = meetingTime(state, end);
    if (t >= meet) return pointAtArc(path, soulTravel(state, meet));
  }
  const travel = soulTravel(state, t);
  // Within contact reach of the stopped body the soul snaps to it (reunion).
  if (travel >= end - reach) return pointAtArc(path, end);
  return pointAtArc(path, travel);
}

/** Seconds until a returning body and the following soul meet on a route of `length`. */
function meetingTime(state: SimState, length: number): number {
  // soulTravel is piecewise linear (boosted, then base speed): solve each piece directly.
  const base = state.params.soulSpeed;
  const fast = base * state.soul.speedMultiplier;
  const boost = state.soul.boostLeft > 0 && state.soul.speedMultiplier !== 1 ? state.soul.boostLeft : 0;
  const vr = TUNING.returnSpeed;
  const first = boost > 0 ? length / (fast + vr) : Infinity;
  if (first <= boost) return first;
  const covered = fast * boost + vr * boost;
  return boost + Math.max(0, length - covered) / (base + vr);
}

/**
 * Lead a shot from `origin` (bolt leaves `delay` seconds from now, `muzzleOffset` from the
 * origin, at `speed`) onto the soul's forecast position at impact. Fixed-point iteration
 * converges because the soul is slower than any bolt.
 */
export function leadSoul(state: SimState, origin: Vec2, muzzleOffset: number, speed: number, delay: number): Vec2 {
  let target = forecastSoulPos(state, delay);
  for (let i = 0; i < 8; i++) {
    const flight = Math.max(0, dist(origin, target) - muzzleOffset) / speed;
    target = forecastSoulPos(state, delay + flight);
  }
  return target;
}
