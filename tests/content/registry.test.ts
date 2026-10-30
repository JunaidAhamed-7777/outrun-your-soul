import { describe, expect, it } from 'vitest';
import {
  ALL_ROOM_VARIANTS,
  FIRST_ROOM_ID,
  PENDING_WARDEN_ROOMS,
  ROOM_VARIANTS,
  ROOMS,
  roomFor,
  validateRoom,
} from '../../src/content/rooms';
import { BOSS_ROOM_ID, createRun, currentNode, generateGraph, ROOM_TEMPLATE_IDS, RUN_TUNING } from '../../src/run/expedition';

describe('room registry', () => {
  it('resolves every expedition template and boss for every variant index', () => {
    for (const id of [...ROOM_TEMPLATE_IDS, BOSS_ROOM_ID]) {
      for (let v = 0; v < RUN_TUNING.roomVariants; v++) {
        const room = roomFor(id, v);
        expect(room.id).toBe(id);
      }
    }
  });

  it('falls back to variant 0 for unknown variants and throws for unknown templates', () => {
    expect(roomFor('departure_court', 5)).toBe(ROOMS.departure_court);
    expect(roomFor('needle_gallery', -1)).toBe(ROOM_VARIANTS.needle_gallery![0]);
    expect(roomFor('needle_gallery', 1.5)).toBe(ROOM_VARIANTS.needle_gallery![0]);
    expect(roomFor('needle_gallery', 1)).toBe(ROOM_VARIANTS.needle_gallery![1]);
    expect(() => roomFor('no_such_room', 0)).toThrow(/unknown room template/);
  });

  it('keeps ROOMS as the first variant of each template and the first room', () => {
    for (const [id, variants] of Object.entries(ROOM_VARIANTS)) expect(ROOMS[id]).toBe(variants[0]);
    expect(ROOMS[FIRST_ROOM_ID]).toBeDefined();
  });

  it('every playable variant is valid, shares its template id, and has a unique display name', () => {
    const names = new Set<string>();
    for (const [id, variants] of Object.entries(ROOM_VARIANTS)) {
      for (const room of variants) {
        expect(room.id).toBe(id);
        expect(validateRoom(room)).toEqual([]);
        expect(names.has(room.name)).toBe(false);
        names.add(room.name);
      }
    }
  });

  it('follows the shared presentation layout: 8x12, gate x 3..5 on the north wall, spawn at the bottom', () => {
    for (const room of ALL_ROOM_VARIANTS) {
      expect([room.width, room.height]).toEqual([8, 12]);
      expect(room.exit).toEqual({ x: 3, y: 11, w: 2, h: 1 });
      expect(room.spawn.y).toBeLessThan(2.5);
    }
  });

  it('every seeded expedition resolves every room node it can visit', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const graph = generateGraph(seed);
      for (const node of Object.values(graph.nodes)) {
        if (node.roomId) expect(() => roomFor(node.roomId!, node.variant)).not.toThrow();
      }
    }
    const run = createRun(7, 'threadkeeper');
    expect(currentNode(run).roomId).toBe(FIRST_ROOM_ID);
  });

  it('pending warden rooms are held back only because wardens are not implemented yet', () => {
    const pending = Object.values(PENDING_WARDEN_ROOMS).flat();
    expect(pending.length).toBeGreaterThan(0);
    for (const room of pending) {
      const errors = validateRoom(room);
      expect(errors.length).toBeGreaterThan(0);
      for (const e of errors) expect(e).toMatch(/warden role is not implemented/);
      expect(ALL_ROOM_VARIANTS).not.toContain(room);
    }
  });
});
