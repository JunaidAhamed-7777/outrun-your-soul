/**
 * Presentation-only stand-in that animates a SimState for the render lab. It is a rough
 * imitation of the rules (no swept events, no contact reunion, respawning enemies) so the
 * renderer can be developed and screenshotted before the real simulation lands. Never used
 * by the game build.
 */
import type { DashPreview, EnemyState, ReturnPreview, RoomDef, SimEvent, SimState } from '../../sim/types';
import { TUNING } from '../../sim/tuning';
import type { Vec2 } from '../../sim/vec';
import { rayToWalls } from '../raycast';
import { makeEnemy, makeLane } from './fixture';

const STEP = 1 / 120;

function d(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function routeLength(points: readonly Vec2[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += d(points[i - 1]!, points[i]!);
  return l;
}

function insideWall(room: RoomDef, p: Vec2, r: number): boolean {
  if (p.x < r || p.y < r || p.x > room.width - r || p.y > room.height - r) return true;
  return room.walls.some((w) => p.x > w.x - r && p.x < w.x + w.w + r && p.y > w.y - r && p.y < w.y + w.h + r);
}

export class MiniSim {
  state: SimState;
  private respawn = new Map<number, number>();
  private laneTime = 0;
  private nextAttack = 500;

  constructor(base: SimState) {
    this.state = base;
    const s = this.state;
    const spawn = s.room.spawn;
    s.body = { pos: spawn, prevPos: spawn, mode: 'ready', dash: null, recoverLeft: 0, facing: { x: 0, y: 1 } };
    s.soul = { pos: spawn, prevPos: spawn, speedMultiplier: 1, boostLeft: 0 };
    s.route = { points: [], length: 0 };
    s.projectiles = [];
    s.enemies = s.room.enemies.map((e, i) =>
      makeEnemy(i + 1, e.id, e.role, e.at, e.dormant ? 'dormant' : 'idle', { x: spawn.x - e.at.x, y: spawn.y - e.at.y }),
    );
    s.enemies.forEach((e, i) => (e.phaseTime = i * 0.7));
    s.lanes = s.room.lanes.map((_, i) => makeLane(200 + i, s.room, 'idle'));
  }

  previewDash(aim: Vec2): DashPreview {
    const s = this.state;
    const from = s.body.pos;
    const len = Math.hypot(aim.x, aim.y);
    const dir = len > 0 ? { x: aim.x / len, y: aim.y / len } : { x: 0, y: 1 };
    const range = Math.min(len, s.params.dashMaxDistance);
    const requestedEnd = { x: from.x + dir.x * range, y: from.y + dir.y * range };
    const capacityLeft = s.params.tetherCapacity - routeLength(s.route.points);
    let dist = range;
    let limitedBy: DashPreview['limitedBy'] = len > s.params.dashMaxDistance ? 'range' : 'none';
    if (capacityLeft < dist) {
      dist = Math.max(0, capacityLeft);
      limitedBy = 'capacity';
    }
    // Approximate wall clamp (ray from slightly ahead of centre, minus radius).
    const wallDist = Math.max(0, rayToWalls(from, dir, s.room) - TUNING.bodyRadius - TUNING.wallSkin);
    if (wallDist < dist) {
      dist = wallDist;
      limitedBy = 'wall';
    }
    let end = { x: from.x + dir.x * dist, y: from.y + dir.y * dist };
    let contact: DashPreview['contact'] = null;
    if (s.route.points.length > 1 && s.contactArmed) {
      const soul = s.soul.pos;
      const t = Math.max(0, Math.min(dist, (soul.x - from.x) * dir.x + (soul.y - from.y) * dir.y));
      const p = { x: from.x + dir.x * t, y: from.y + dir.y * t };
      if (d(p, soul) < TUNING.bodyRadius + TUNING.soulRadius) {
        end = p;
        dist = t;
        contact = { at: p, soulAt: soul };
        limitedBy = 'contact';
      }
    }
    const valid = dist >= TUNING.dashMinDistance && s.body.mode !== 'dead';
    return {
      valid,
      ...(valid ? {} : { reason: capacityLeft <= TUNING.dashMinDistance ? 'noCapacity' : 'tooShort' }),
      from,
      requestedEnd,
      end,
      limitedBy,
      contact,
      capacityAfter: contact ? s.params.tetherCapacity : Math.max(0, capacityLeft - dist),
      soulArrivalSeconds: (routeLength(s.route.points) + dist) / s.params.soulSpeed,
      queued: s.body.mode === 'dash' || s.body.mode === 'recover',
    };
  }

  previewReturn(): ReturnPreview {
    const s = this.state;
    const pts = s.route.points;
    if (pts.length < 2) return { valid: false, reason: 'notSeparated', meetAt: null, seconds: 0 };
    const total = routeLength(pts);
    const t = total / (s.params.soulSpeed + TUNING.returnSpeed);
    let along = s.params.soulSpeed * t;
    for (let i = 1; i < pts.length; i++) {
      const seg = d(pts[i - 1]!, pts[i]!);
      if (along <= seg) {
        const k = seg > 0 ? along / seg : 0;
        return {
          valid: true,
          meetAt: { x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * k, y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * k },
          seconds: t,
        };
      }
      along -= seg;
    }
    return { valid: true, meetAt: pts[pts.length - 1]!, seconds: t };
  }

  dash(aim: Vec2, events: SimEvent[]): void {
    const s = this.state;
    if (s.body.mode === 'return') {
      s.body.mode = 'ready';
      events.push({ type: 'returnStop', t: s.time, at: s.body.pos, reason: 'interrupted' });
    }
    if (s.body.mode !== 'ready') return;
    const p = this.previewDash(aim);
    if (!p.valid) {
      events.push({ type: 'rejected', t: s.time, command: 'dash', reason: p.reason ?? 'tooShort' });
      return;
    }
    if (s.route.points.length === 0) s.route.points = [s.body.pos, s.body.pos];
    else s.route.points.push(s.body.pos);
    const dist = d(p.from, p.end);
    s.body.dash = { from: p.from, to: p.end, elapsed: 0, duration: dist / TUNING.dashSpeed };
    s.body.mode = 'dash';
    s.body.facing = { x: (p.end.x - p.from.x) / dist, y: (p.end.y - p.from.y) / dist };
    s.stats.dashes++;
    events.push({ type: 'dashStart', t: s.time, from: p.from, to: p.end, limitedBy: p.limitedBy });
  }

  ret(events: SimEvent[]): void {
    const s = this.state;
    if (s.route.points.length < 2) {
      events.push({ type: 'rejected', t: s.time, command: 'return', reason: 'notSeparated' });
      return;
    }
    if (s.body.mode !== 'ready') return;
    s.body.mode = 'return';
    s.stats.returns++;
    events.push({ type: 'returnStart', t: s.time, from: s.body.pos });
  }

  private reunite(at: Vec2, cause: 'exhaustion' | 'return' | 'contact', events: SimEvent[]): void {
    const s = this.state;
    s.route.points = [];
    s.route.length = 0;
    s.soul.pos = at;
    s.body.pos = at;
    s.contactArmed = false;
    if (s.body.mode === 'return') s.body.mode = 'ready';
    events.push({ type: 'reunion', t: s.time, at, cause });
  }

  step(events: SimEvent[]): void {
    const s = this.state;
    s.tick++;
    s.time += STEP;
    s.body.prevPos = s.body.pos;
    s.soul.prevPos = s.soul.pos;
    for (const p of s.projectiles) p.prevPos = p.pos;
    s.graceLeft = Math.max(0, s.graceLeft - STEP);
    const pts = s.route.points;

    // Body.
    if (s.body.mode === 'dash' && s.body.dash) {
      const dash = s.body.dash;
      dash.elapsed += STEP;
      const k = Math.min(1, dash.elapsed / Math.max(1e-6, dash.duration));
      s.body.pos = { x: dash.from.x + (dash.to.x - dash.from.x) * k, y: dash.from.y + (dash.to.y - dash.from.y) * k };
      pts[pts.length - 1] = s.body.pos;
      if (k >= 1) {
        s.body.mode = 'recover';
        s.body.recoverLeft = TUNING.recoverySeconds;
        s.body.dash = null;
        events.push({ type: 'dashEnd', t: s.time, at: s.body.pos, reason: 'arrived' });
      }
    } else if (s.body.mode === 'recover') {
      s.body.recoverLeft -= STEP;
      if (s.body.recoverLeft <= 0) {
        s.body.mode = 'ready';
        events.push({ type: 'ready', t: s.time });
      }
    } else if (s.body.mode === 'return' && pts.length >= 2) {
      let left = TUNING.returnSpeed * STEP;
      while (left > 0 && pts.length >= 2) {
        const last = pts[pts.length - 1]!;
        const prev = pts[pts.length - 2]!;
        const seg = d(prev, last);
        if (seg <= left) {
          left -= seg;
          pts.pop();
          if (pts.length >= 2) s.body.facing = { x: prev.x - last.x, y: prev.y - last.y };
        } else {
          const k = left / seg;
          pts[pts.length - 1] = { x: last.x + (prev.x - last.x) * k, y: last.y + (prev.y - last.y) * k };
          s.body.facing = { x: prev.x - last.x, y: prev.y - last.y };
          left = 0;
        }
      }
      s.body.pos = pts[pts.length - 1] ?? s.body.pos;
      if (pts.length < 2) this.reunite(s.body.pos, 'return', events);
    }

    // Soul follows the head.
    if (s.route.points.length >= 2) {
      let left = s.params.soulSpeed * STEP;
      const r = s.route.points;
      while (left > 0 && r.length >= 2) {
        const a = r[0]!;
        const b = r[1]!;
        const seg = d(a, b);
        if (seg <= left) {
          left -= seg;
          r.shift();
        } else {
          const k = left / seg;
          r[0] = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
          left = 0;
        }
      }
      if (r.length < 2) this.reunite(s.body.pos, s.body.mode === 'return' ? 'return' : 'exhaustion', events);
      else s.soul.pos = r[0]!;
      if (!s.contactArmed && d(s.body.pos, s.soul.pos) > TUNING.bodyRadius + TUNING.soulRadius + TUNING.contactArmTolerance) {
        s.contactArmed = true;
        events.push({ type: 'separated', t: s.time });
      }
    } else {
      s.soul.pos = s.body.pos;
    }
    s.route.length = routeLength(s.route.points);

    this.stepEnemies(events);
    this.stepProjectiles(events);
    this.stepLanes(events);
  }

  private targetOf(e: EnemyState): Vec2 {
    return e.target === 'body' ? this.state.body.pos : this.state.soul.pos;
  }

  private stepEnemies(events: SimEvent[]): void {
    const s = this.state;
    for (const e of s.enemies) {
      if (e.phase === 'dead') {
        const left = (this.respawn.get(e.id) ?? 0) - STEP;
        this.respawn.set(e.id, left);
        if (left <= 0) {
          e.phase = 'idle';
          e.phaseTime = 0;
          e.phaseDuration = 1.7;
          events.push({ type: 'wake', t: s.time, enemyId: e.id });
        }
        continue;
      }
      if (s.body.mode === 'dash' && d(s.body.pos, e.pos) < e.radius + TUNING.bodyRadius) {
        e.phase = 'dead';
        this.respawn.set(e.id, 4);
        s.stats.kills++;
        events.push({ type: 'kill', t: s.time, enemyId: e.id, role: e.role, at: e.pos });
        continue;
      }
      if (e.phase === 'dormant') {
        if (s.time > 6) {
          e.phase = 'idle';
          e.phaseTime = 0;
          events.push({ type: 'wake', t: s.time, enemyId: e.id });
        }
        continue;
      }
      e.phaseTime += STEP;
      const target = this.targetOf(e);
      if (e.phase === 'tracking') {
        const dx = target.x - e.pos.x;
        const dy = target.y - e.pos.y;
        const l = Math.hypot(dx, dy) || 1;
        e.aim = { x: dx / l, y: dy / l };
      }
      if (e.phaseTime < e.phaseDuration) continue;
      e.phaseTime = 0;
      if (e.phase === 'idle') {
        e.phase = 'tracking';
        e.phaseDuration = e.role === 'keeper' ? 1.1 : 0.9;
        events.push({ type: 'telegraph', t: s.time, enemyId: e.id, phase: 'tracking', target: e.target });
      } else if (e.phase === 'tracking') {
        e.phase = 'locked';
        e.phaseDuration = 0.6;
        e.attackId = this.nextAttack++;
        events.push({ type: 'telegraph', t: s.time, enemyId: e.id, phase: 'locked', target: e.target });
      } else if (e.phase === 'locked') {
        const speed = e.role === 'keeper' ? 4.5 : 6;
        const at = { x: e.pos.x + e.aim.x * (e.radius + 0.1), y: e.pos.y + e.aim.y * (e.radius + 0.1) };
        const id = s.nextId++;
        s.projectiles.push({
          id,
          attackId: e.attackId ?? 0,
          sourceId: e.id,
          pos: at,
          prevPos: at,
          vel: { x: e.aim.x * speed, y: e.aim.y * speed },
          radius: 0.15,
          age: 0,
          alive: true,
        });
        events.push({ type: 'fire', t: s.time, enemyId: e.id, projectileId: id, attackId: e.attackId ?? 0, at });
        e.phase = 'recover';
        e.phaseDuration = 0.35;
      } else {
        e.phase = 'idle';
        e.phaseDuration = 1.7;
      }
    }
  }

  private stepProjectiles(events: SimEvent[]): void {
    const s = this.state;
    for (const p of s.projectiles) {
      if (!p.alive) continue;
      p.age += STEP;
      p.pos = { x: p.pos.x + p.vel.x * STEP, y: p.pos.y + p.vel.y * STEP };
      if (insideWall(s.room, p.pos, 0)) {
        p.alive = false;
        events.push({ type: 'projectileGone', t: s.time, projectileId: p.id, at: p.pos, reason: 'wall' });
        continue;
      }
      const hitBody = d(p.pos, s.body.pos) < p.radius + TUNING.bodyRadius;
      if (hitBody && s.body.mode === 'dash') {
        p.alive = false;
        s.stats.cuts++;
        events.push({ type: 'cut', t: s.time, projectileId: p.id, at: p.pos });
        continue;
      }
      const separated = s.route.points.length >= 2;
      const hitSoul = separated && d(p.pos, s.soul.pos) < p.radius + TUNING.soulRadius;
      if (hitBody || hitSoul) {
        p.alive = false;
        const endpoint = hitBody ? 'body' : 'soul';
        const at = hitBody ? s.body.pos : s.soul.pos;
        if (s.graceLeft > 0) {
          events.push({ type: 'shielded', t: s.time, endpoint, attackId: p.attackId, at, reason: 'grace' });
        } else {
          s.health = Math.max(1, s.health - 1);
          s.graceLeft = TUNING.hitGraceSeconds;
          s.stats.hits++;
          events.push({ type: 'hit', t: s.time, endpoint, attackId: p.attackId, at, health: s.health, source: 'bolt' });
        }
        events.push({ type: 'projectileGone', t: s.time, projectileId: p.id, at: p.pos, reason: 'endpoint' });
      }
    }
    s.projectiles = s.projectiles.filter((p) => p.alive);
  }

  private stepLanes(events: SimEvent[]): void {
    const s = this.state;
    this.laneTime += STEP;
    s.room.lanes.forEach((def, i) => {
      const lane = s.lanes[i];
      if (!lane) return;
      const t = (this.laneTime + (def.phase ?? 0)) % def.period;
      const status = t >= def.activeFrom && t < def.activeTo ? 'active' : t >= def.activeFrom - def.warnLead && t < def.activeFrom ? 'warning' : 'idle';
      if (status !== lane.status) {
        lane.status = status;
        lane.attackId = status === 'active' ? this.nextAttack++ : null;
        events.push({ type: 'lane', t: s.time, laneId: lane.id, status });
      }
      lane.cycleTime = t;
    });
  }
}
