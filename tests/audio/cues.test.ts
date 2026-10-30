import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/types';
import {
  ATTACK_CUES,
  createCueMemory,
  cuesForEvent,
  dashDegree,
  panFor,
  soulEchoDelay,
  type CueContext,
} from '../../src/audio/cues';
import { CUE_SPECS } from '../../src/audio/voices';

const ctx: CueContext = { roomWidth: 8, dashMax: 3 };
const at = { x: 4, y: 4 };

const ALL_EVENTS: SimEvent[] = [
  { type: 'dashStart', t: 0, from: { x: 4, y: 1 }, to: { x: 4, y: 4 }, limitedBy: 'none' },
  { type: 'dashEnd', t: 0, at, reason: 'arrived' },
  { type: 'dashEnd', t: 0, at, reason: 'contact' },
  { type: 'ready', t: 0 },
  { type: 'returnStart', t: 0, from: at },
  { type: 'returnStop', t: 0, at, reason: 'reunited' },
  { type: 'returnStop', t: 0, at, reason: 'interrupted' },
  { type: 'separated', t: 0 },
  { type: 'reunion', t: 0, at, cause: 'contact' },
  { type: 'reunion', t: 0, at, cause: 'exhaustion' },
  { type: 'reunion', t: 0, at, cause: 'return' },
  { type: 'cut', t: 0, projectileId: 1, at },
  { type: 'kill', t: 0, enemyId: 1, role: 'needler', at },
  { type: 'hit', t: 0, endpoint: 'body', attackId: 1, at, health: 4, source: 'bolt' },
  { type: 'hit', t: 0, endpoint: 'soul', attackId: 2, at, health: 3, source: 'lane' },
  { type: 'shielded', t: 0, endpoint: 'body', attackId: 1, at, reason: 'grace' },
  { type: 'wake', t: 0, enemyId: 1 },
  { type: 'telegraph', t: 0, enemyId: 1, phase: 'tracking', target: 'body' },
  { type: 'telegraph', t: 0, enemyId: 1, phase: 'locked', target: 'soul' },
  { type: 'fire', t: 0, enemyId: 1, projectileId: 2, attackId: 3, at },
  { type: 'projectileGone', t: 0, projectileId: 2, at, reason: 'wall' },
  { type: 'projectileGone', t: 0, projectileId: 2, at, reason: 'endpoint' },
  { type: 'lane', t: 0, laneId: 1, status: 'warning' },
  { type: 'lane', t: 0, laneId: 1, status: 'active' },
  { type: 'lane', t: 0, laneId: 1, status: 'idle' },
  { type: 'gate', t: 0, status: 'ready' },
  { type: 'gate', t: 0, status: 'open' },
  { type: 'gate', t: 0, status: 'sealed' },
  { type: 'roomCleared', t: 0 },
  { type: 'victory', t: 0 },
  { type: 'defeat', t: 0 },
  { type: 'rejected', t: 0, command: 'dash', reason: 'tooShort' },
  { type: 'queued', t: 0, command: 'dash' },
  { type: 'queueExpired', t: 0 },
];

const cuesOf = (e: SimEvent) => cuesForEvent(e, ctx, createCueMemory());

describe('event -> cue mapping', () => {
  it('handles every event type without throwing and only emits known cues', () => {
    for (const e of ALL_EVENTS) {
      for (const c of cuesOf(e)) {
        expect(CUE_SPECS[c.cue], `${e.type} -> ${c.cue}`).toBeDefined();
        expect(c.delay).toBeGreaterThanOrEqual(0);
        expect(Math.abs(c.pan)).toBeLessThanOrEqual(1);
        expect(c.intensity).toBeGreaterThan(0);
        expect(c.intensity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('answers an outward dash with a body pluck and a later soul chime of the same pitch class', () => {
    const cues = cuesOf(ALL_EVENTS[0] as SimEvent);
    const pluck = cues.find((c) => c.cue === 'dashPluck');
    const chime = cues.find((c) => c.cue === 'soulChime');
    expect(pluck?.delay).toBe(0);
    expect(chime?.delay).toBeGreaterThan(0.2);
    expect(chime?.degree).toBe(pluck?.degree);
  });

  it('keeps tracking and locked warnings audibly distinct', () => {
    const tracking = cuesOf({ type: 'telegraph', t: 0, enemyId: 1, phase: 'tracking', target: 'body' });
    const locked = cuesOf({ type: 'telegraph', t: 0, enemyId: 1, phase: 'locked', target: 'body' });
    expect(tracking.map((c) => c.cue)).toEqual(['trackTick']);
    expect(locked.map((c) => c.cue)).toEqual(['lockTick']);
  });

  it('makes a contact reunion brighter than an exhaustion reunion', () => {
    const contact = cuesOf({ type: 'reunion', t: 0, at, cause: 'contact' })[0];
    const exhaustion = cuesOf({ type: 'reunion', t: 0, at, cause: 'exhaustion' })[0];
    expect(contact?.cue).toBe('reunionChord');
    expect(contact?.intensity).toBeGreaterThan(exhaustion?.intensity ?? 1);
    expect(contact?.variant).toBe('contact');
  });

  it('never gives RETURN an attack sound', () => {
    const cues = cuesOf({ type: 'returnStart', t: 0, from: at });
    expect(cues.map((c) => c.cue)).toEqual(['returnSwell']);
    expect(cues.some((c) => ATTACK_CUES.has(c.cue))).toBe(false);
  });

  it('distinguishes body and soul hits', () => {
    expect(cuesOf(ALL_EVENTS[13] as SimEvent)[0]?.variant).toBe('body');
    expect(cuesOf(ALL_EVENTS[14] as SimEvent)[0]?.variant).toBe('soul');
  });

  it('lets endpoint-consumed bolts stay silent (the hit or shield already sounded)', () => {
    expect(cuesOf({ type: 'projectileGone', t: 0, projectileId: 2, at, reason: 'endpoint' })).toEqual([]);
  });

  it('remembers the dash pitch for the reunion chord', () => {
    const mem = createCueMemory();
    cuesForEvent({ type: 'dashStart', t: 0, from: { x: 1, y: 1 }, to: { x: 1, y: 1.4 }, limitedBy: 'none' }, ctx, mem);
    const chord = cuesForEvent({ type: 'reunion', t: 1, at, cause: 'return' }, ctx, mem)[0];
    expect(chord?.degree).toBe(dashDegree(0.4, 3));
  });
});

describe('cue helpers', () => {
  it('raises dash pitch with distance', () => {
    expect(dashDegree(3, 3)).toBeGreaterThan(dashDegree(0.5, 3));
    expect(dashDegree(10, 3)).toBe(dashDegree(3, 3));
  });

  it('delays the soul echo a little more for longer dashes, within bounds', () => {
    expect(soulEchoDelay(3)).toBeGreaterThan(soulEchoDelay(0.5));
    expect(soulEchoDelay(100)).toBeLessThanOrEqual(0.55);
  });

  it('pans by room position without hard-panning', () => {
    expect(panFor({ x: 0, y: 0 }, ctx)).toBeCloseTo(-0.65);
    expect(panFor({ x: 8, y: 0 }, ctx)).toBeCloseTo(0.65);
    expect(panFor({ x: 4, y: 0 }, ctx)).toBeCloseTo(0);
    expect(panFor(undefined, ctx)).toBe(0);
    expect(panFor({ x: 4, y: 0 }, { roomWidth: 0, dashMax: 3 })).toBe(0);
  });
});

describe('defensive mapping for new and unknown events', () => {
  const loose = (e: Record<string, unknown>) => cuesForEvent(e as unknown as SimEvent, ctx, createCueMemory());

  it('ignores unknown or malformed event types safely', () => {
    expect(loose({ type: 'somethingNew', t: 0 })).toEqual([]);
    expect(loose({ t: 0 })).toEqual([]);
    expect(loose({ type: 42 })).toEqual([]);
    expect(loose({ type: 'toString' })).toEqual([]);
    expect(loose({ type: '__proto__' })).toEqual([]);
  });

  it('maps relic and warden events announced by the simulation', () => {
    const cases: [string, string][] = [
      ['boost', 'boost'],
      ['charge', 'bellCharge'],
      ['burst', 'bellBurst'],
      ['decoyPlaced', 'decoyPlace'],
      ['decoyTaken', 'decoyTake'],
      ['guarded', 'guardClang'],
      ['sweep', 'sweepWhoosh'],
      ['exposed', 'exposedChime'],
    ];
    for (const [type, cue] of cases) {
      const out = loose({ type, t: 0, at: { x: 8, y: 2 } });
      expect(out.map((c) => c.cue), type).toEqual([cue]);
      expect(out[0]?.pan, type).toBeCloseTo(0.65);
      expect(CUE_SPECS[out[0]?.cue ?? 'tug'], type).toBeDefined();
    }
  });

  it('tolerates missing or bad positions on loose events', () => {
    expect(loose({ type: 'guarded', t: 0 })[0]?.pan).toBe(0);
    expect(loose({ type: 'guarded', t: 0, at: { x: 'a', y: 1 } })[0]?.pan).toBe(0);
    expect(loose({ type: 'burst', t: 0, pos: { x: 0, y: 0 } })[0]?.pan).toBeCloseTo(-0.65);
  });
});
