/** A simple scripted player for boss rooms (test evidence only, not the planning bot). */
import { heartVulnerable } from '../../src/sim/boss';
import type { Command, SimState } from '../../src/sim/types';

/** A simple heart hunter: strike the trailing heart, otherwise keep distance and stay reunited. */
export function hunter(s: SimState): Command | null {
  if (s.outcome !== 'playing' || s.body.mode !== 'ready') return null;
  const b = s.boss;
  if (!b || b.phase === 'dead') {
    const exit = s.room.exit;
    const goal = { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2 };
    if (s.route.points.length > 0) return { kind: 'return' };
    const d = { x: goal.x - s.body.pos.x, y: goal.y - s.body.pos.y };
    return Math.hypot(d.x, d.y) > 0.4 ? { kind: 'dash', aim: d } : null;
  }
  if (heartVulnerable(b)) {
    // Lead the heart slightly along its route.
    const h = b.route.points[1] ?? b.heart.pos;
    const target = { x: (b.heart.pos.x * 2 + h.x) / 3, y: (b.heart.pos.y * 2 + h.y) / 3 };
    const d = { x: target.x - s.body.pos.x, y: target.y - s.body.pos.y };
    const len = Math.hypot(d.x, d.y);
    return { kind: 'dash', aim: { x: (d.x / len) * Math.min(3, len + 0.6), y: (d.y / len) * Math.min(3, len + 0.6) } };
  }
  if (s.route.points.length > 0) return { kind: 'return' };
  if (b.phase === 'aimCharge' && b.path.length > 1) {
    // Sidestep the first leg.
    const leg = { x: b.path[1]!.x - b.path[0]!.x, y: b.path[1]!.y - b.path[0]!.y };
    const n = Math.hypot(leg.x, leg.y);
    const side = { x: -leg.y / n, y: leg.x / n };
    const sign = side.x * (s.room.width / 2 - s.body.pos.x) + side.y * (s.room.height / 2 - s.body.pos.y) > 0 ? 1 : -1;
    return { kind: 'dash', aim: { x: side.x * 2.2 * sign, y: side.y * 2.2 * sign } };
  }
  return null;
}
