import { describe, expect, it } from 'vitest';
import { DEFAULT_GESTURE, GestureMachine, type GestureOutput } from '../../src/input/gesture';

/** Small deterministic PRNG for reproducible fuzzing (mulberry32). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Tracked {
  owner: number;
  startX: number;
  startY: number;
  startT: number;
  maxDist: number;
  sawAimOutput: boolean;
}

const TERMINAL = new Set(['dash', 'return', 'cancel']);

describe('GestureMachine fuzz invariants', () => {
  it('random multi-pointer sequences never break the input contract', () => {
    const cfg = DEFAULT_GESTURE;
    const seen = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed += 1) {
      const rand = rng(seed);
      const g = new GestureMachine();
      const fingers = new Map<number, { x: number; y: number }>();
      let t = 0;
      let tracked: Tracked | null = null;

      const check = (outs: GestureOutput[], pointerId: number, kind: string) => {
        const context = `seed ${seed} t ${t} ${kind} p${pointerId}`;
        if (!tracked || pointerId !== tracked.owner) {
          // Only the owner (or an interruption) may produce output.
          if (kind !== 'cancel' && kind !== 'down') expect(outs, context).toEqual([]);
        }
        for (const o of outs) {
          const key = o.kind === 'cancel' ? `cancel:${o.reason}` : o.kind;
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
        const terminals = outs.filter((o) => TERMINAL.has(o.kind));
        expect(terminals.length, context).toBeLessThanOrEqual(1);
        for (const o of outs) {
          if (o.kind === 'aim' || o.kind === 'aimCancelZone') {
            expect(tracked, context).not.toBeNull();
            tracked!.sawAimOutput = true;
          }
          if (o.kind === 'return') {
            expect(tracked, context).not.toBeNull();
            // RETURN only for a tap that never armed.
            expect(tracked!.sawAimOutput, context).toBe(false);
            expect(tracked!.maxDist, context).toBeLessThan(cfg.armDistancePx);
            expect(t - tracked!.startT, context).toBeLessThanOrEqual(cfg.tapMaxMs);
          }
          if (o.kind === 'dash') {
            expect(tracked, context).not.toBeNull();
            expect(tracked!.maxDist, context).toBeGreaterThanOrEqual(cfg.armDistancePx);
            expect(o.startX).toBe(tracked!.startX);
            expect(o.startY).toBe(tracked!.startY);
          }
        }
        if (terminals.length === 1) tracked = null;
      };

      for (let i = 0; i < 200; i += 1) {
        t += Math.floor(rand() * 120);
        const roll = rand();
        const id = 1 + Math.floor(rand() * 3);
        if (roll < 0.25 && !fingers.has(id)) {
          const pos = { x: Math.floor(rand() * 400), y: Math.floor(rand() * 800) };
          fingers.set(id, pos);
          const wasIdle = g.activePointerId === null;
          const outs = g.down(id, pos.x, pos.y, t);
          expect(outs).toEqual([]);
          if (wasIdle) {
            expect(g.activePointerId).toBe(id);
            tracked = { owner: id, startX: pos.x, startY: pos.y, startT: t, maxDist: 0, sawAimOutput: false };
          } else {
            expect(g.activePointerId).not.toBe(id);
          }
        } else if (roll < 0.75 && fingers.has(id)) {
          const f = fingers.get(id)!;
          const step = rand() < 0.5 ? 6 : 40;
          f.x += Math.round((rand() - 0.5) * step);
          f.y += Math.round((rand() - 0.5) * step);
          if (tracked && tracked.owner === id) {
            tracked.maxDist = Math.max(tracked.maxDist, Math.hypot(f.x - tracked.startX, f.y - tracked.startY));
          }
          check(g.move(id, f.x, f.y, t), id, 'move');
        } else if (roll < 0.95 && fingers.has(id)) {
          const f = fingers.get(id)!;
          fingers.delete(id);
          const owned = tracked !== null && tracked.owner === id;
          const outs = g.up(id, f.x, f.y, t);
          check(outs, id, 'up');
          // The owner's release always ends the gesture with exactly one terminal output.
          if (owned) expect(outs.filter((o) => TERMINAL.has(o.kind))).toHaveLength(1);
          else expect(outs).toEqual([]);
        } else if (roll >= 0.95) {
          const active = g.activePointerId;
          const outs = g.cancel('interrupted');
          if (active === null) expect(outs).toEqual([]);
          else {
            expect(outs).toEqual([{ kind: 'cancel', reason: 'interrupted' }]);
            tracked = null;
          }
          // Fingers stay physically down but their gesture is over; they cannot act again.
          for (const [fid, f] of fingers) expect(g.up(fid, f.x, f.y, t)).toEqual([]);
          fingers.clear();
        }
        // Phase and ownership stay consistent.
        expect(g.phase === 'idle').toBe(g.activePointerId === null);
      }
    }
    // The fuzz must actually exercise every outcome, or it proves nothing.
    for (const key of ['aim', 'aimCancelZone', 'dash', 'return', 'cancel:deadZone', 'cancel:longPress', 'cancel:ambiguous']) {
      expect(seen.get(key) ?? 0, key).toBeGreaterThan(0);
    }
  });
});
