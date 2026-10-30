/**
 * Authoring-time room validation. Rejects data the simulation cannot run fairly:
 * misaligned walls, blocked spawns/enemies/exits, unreachable targets, broken wake
 * chains and impossible lane schedules. Returns readable errors (empty = valid).
 */
import { ENEMY_TUNING } from '../../sim/enemies';
import { circleClear, corridorClear, pointInRect } from '../../sim/geom';
import { TUNING } from '../../sim/tuning';
import type { RectDef, RoomDef } from '../../sim/types';
import { dist, type Vec2 } from '../../sim/vec';

const GRID = 0.25;
const isInt = (n: number): boolean => Number.isInteger(n);

function rectInside(r: RectDef, room: RoomDef): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= room.width && r.y + r.h <= room.height && r.w > 0 && r.h > 0;
}

/** Body-centre positions reachable from spawn by short legal moves (grid flood fill). */
export function reachablePoints(room: RoomDef): Vec2[] {
  const clearance = TUNING.bodyRadius + TUNING.wallSkin;
  const cols = Math.floor(room.width / GRID);
  const rows = Math.floor(room.height / GRID);
  const key = (i: number, j: number): number => j * (cols + 1) + i;
  const nodes = new Map<number, Vec2>();
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const p = { x: i * GRID, y: j * GRID };
      if (circleClear(room, p, clearance)) nodes.set(key(i, j), p);
    }
  }
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const [k, p] of nodes) {
    if (dist(p, room.spawn) <= GRID * 1.5 && corridorClear(room, room.spawn, p, clearance)) {
      seen.add(k);
      queue.push(k);
    }
  }
  while (queue.length > 0) {
    const k = queue.shift()!;
    const i = k % (cols + 1);
    const j = Math.floor(k / (cols + 1));
    const p = nodes.get(k)!;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue;
        const nk = key(i + di, j + dj);
        const q = nodes.get(nk);
        if (!q || seen.has(nk) || i + di < 0 || i + di > cols) continue;
        if (!corridorClear(room, p, q, clearance)) continue;
        seen.add(nk);
        queue.push(nk);
      }
    }
  }
  return [...seen].map((k) => nodes.get(k)!);
}

export function validateRoom(room: RoomDef): string[] {
  const errors: string[] = [];
  const err = (msg: string): void => {
    errors.push(`${room.id}: ${msg}`);
  };
  if (!room.id) err('missing id');
  if (!room.name) err('missing name');
  if (!isInt(room.width) || !isInt(room.height) || room.width < 3 || room.height < 3) {
    err('width and height must be integers of at least 3');
    return errors;
  }

  room.walls.forEach((w, i) => {
    if (![w.x, w.y, w.w, w.h].every(isInt) || w.w < 1 || w.h < 1) err(`wall ${i} is not integer-aligned`);
    if (!rectInside(w, room)) err(`wall ${i} leaves the room`);
  });

  const clearance = TUNING.bodyRadius + TUNING.wallSkin;
  if (!circleClear(room, room.spawn, clearance)) err('spawn overlaps a wall or bound');

  if (!rectInside(room.exit, room)) err('exit leaves the room');
  if (room.walls.some((w) => overlaps(w, room.exit))) err('exit overlaps a wall');

  const ids = new Set<string>();
  for (const e of room.enemies) {
    if (ids.has(e.id)) err(`duplicate enemy id ${e.id}`);
    ids.add(e.id);
    const radius = ENEMY_TUNING[e.role].radius;
    if (!circleClear(room, e.at, radius)) err(`enemy ${e.id} overlaps a wall or bound`);
    if (dist(e.at, room.spawn) < radius + TUNING.bodyRadius + 0.5) err(`enemy ${e.id} is on top of the spawn`);
    if (e.wake && !e.dormant) err(`enemy ${e.id} has a wake trigger but is not dormant`);
    if (e.wake?.kind === 'enemyKilled') {
      const awaited = e.wake.enemy;
      if (awaited === e.id) err(`enemy ${e.id} waits for its own death`);
      else if (!room.enemies.some((o) => o.id === awaited)) err(`enemy ${e.id} waits for unknown enemy ${awaited}`);
    }
  }

  const laneIds = new Set<string>();
  for (const l of room.lanes) {
    if (laneIds.has(l.id)) err(`duplicate lane id ${l.id}`);
    laneIds.add(l.id);
    if (!rectInside(l.rect, room)) err(`lane ${l.id} leaves the room`);
    const ok =
      l.period > 0 &&
      l.warnLead >= 0 &&
      l.activeFrom - l.warnLead >= 0 &&
      l.activeFrom < l.activeTo &&
      l.activeTo <= l.period;
    if (!ok) err(`lane ${l.id} has an impossible schedule`);
  }

  const hintIds = new Set<string>();
  for (const h of room.hints ?? []) {
    if (hintIds.has(h.id)) err(`duplicate hint id ${h.id}`);
    hintIds.add(h.id);
    if (!h.text.trim()) err(`hint ${h.id} is empty`);
  }

  if (errors.length > 0) return errors;
  const reachable = reachablePoints(room);
  if (!reachable.some((p) => pointInRect(p, room.exit))) err('exit is unreachable from spawn');
  for (const e of room.enemies) {
    const reach = ENEMY_TUNING[e.role].radius + TUNING.bodyRadius;
    if (!reachable.some((p) => dist(p, e.at) < reach)) err(`enemy ${e.id} cannot be reached`);
  }
  return errors;
}

function overlaps(a: RectDef, b: RectDef): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
