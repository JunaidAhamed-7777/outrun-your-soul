import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/types';
import { createCueMemory, cueContext, cuesForEvent, type CueContext } from '../../src/audio/cues';
import { CUE_SPECS } from '../../src/audio/voices';
import { PhaseWatch, isOpening, type WatchedEnemy } from '../../src/audio/watch';

const at = { x: 6, y: 5 };
const ctx: CueContext = { roomWidth: 8, dashMax: 3, roleOf: (id) => (id === 7 ? 'warden' : 'needler') };
const cues = (e: SimEvent) => cuesForEvent(e, ctx, createCueMemory());
const names = (e: SimEvent) => cues(e).map((c) => c.cue);

describe('final simulation events', () => {
  it('gives every relic event its own sound', () => {
    expect(names({ type: 'boost', t: 0, at, multiplier: 1.8, seconds: 1.2 })).toEqual(['boost']);
    expect(names({ type: 'boostEnd', t: 0 })).toEqual(['boostEnd']);
    expect(names({ type: 'burst', t: 0, at, radius: 1.6, killed: [] })).toEqual(['bellBurst']);
    expect(names({ type: 'knotMarked', t: 0 })).toEqual(['knotMark']);
    expect(names({ type: 'decoyPlaced', t: 0, at })).toEqual(['decoyPlace']);
    expect(names({ type: 'decoyClaimed', t: 0, enemyId: 1, at })).toEqual(['decoyClaim']);
    expect(names({ type: 'decoyTaken', t: 0, enemyId: 1, at })).toEqual(['decoyTake']);
    expect(names({ type: 'guarded', t: 0, enemyId: 7, at })).toEqual(['guardClang']);
    expect(names({ type: 'sweep', t: 0, enemyId: 7, attackId: 3, at, facing: { x: 0, y: -1 }, range: 2.2, halfAngle: 1 })).toEqual(['sweepWhoosh']);
  });

  it('keeps Glass Lantern halo crossings very quiet', () => {
    const enter = cues({ type: 'haloEnter', t: 0, projectileId: 1, at })[0];
    const exit = cues({ type: 'haloExit', t: 0, projectileId: 1, at })[0];
    expect(enter?.cue).toBe('haloShimmer');
    expect(exit?.variant).toBe('exit');
    expect(enter?.intensity).toBeLessThanOrEqual(0.4);
    expect(CUE_SPECS.haloShimmer.priority).toBe(1);
  });

  it('rings a small rising pip per bell kill and a full bell when charged', () => {
    const pip1 = cues({ type: 'charge', t: 0, at, charge: 1, max: 2, charged: false })[0];
    const full = cues({ type: 'charge', t: 0, at, charge: 2, max: 2, charged: true })[0];
    expect(pip1?.variant).toBe('pip');
    expect(full?.variant).toBe('full');
    expect(full?.intensity).toBeGreaterThan(pip1?.intensity ?? 1);
  });

  it('gives each boss beat a distinct cue', () => {
    const whats = ['wake', 'telegraph', 'charge', 'fan', 'heartHit', 'stagger', 'reunited', 'defeated'] as const;
    const out = whats.map((what) => names({ type: 'boss', t: 0, what, at }));
    expect(out.every((c) => c.length === 1)).toBe(true);
    expect(new Set(out.map((c) => c[0])).size).toBe(whats.length);
    expect(out[4]).toEqual(['bossHeartHit']);
    expect(out[7]).toEqual(['bossDefeated']);
  });

  it('separates the charge and fan telegraphs and never reuses sentry ticks', () => {
    const charge = cues({ type: 'boss', t: 0, what: 'telegraph', at, pattern: 'charge' })[0];
    const fan = cues({ type: 'boss', t: 0, what: 'telegraph', at, pattern: 'fan' })[0];
    expect(charge?.variant).toBe('charge');
    expect(fan?.variant).toBe('fan');
    expect(['trackTick', 'lockTick']).not.toContain(charge?.cue);
  });

  it('ignores an unknown boss beat safely', () => {
    expect(cuesForEvent({ type: 'boss', t: 0, what: 'dance', at } as unknown as SimEvent, ctx, createCueMemory())).toEqual([]);
  });

  it('plays a warden windup instead of a sentry lock tick', () => {
    expect(names({ type: 'telegraph', t: 0, enemyId: 7, phase: 'locked', target: 'body' })).toEqual(['wardenWindup']);
    expect(names({ type: 'telegraph', t: 0, enemyId: 2, phase: 'locked', target: 'body' })).toEqual(['lockTick']);
  });

  it('builds the role lookup from state', () => {
    const c = cueContext({
      room: { width: 8 } as never,
      params: { dashMaxDistance: 3 } as never,
      enemies: [{ id: 7, role: 'warden' }] as never,
    });
    expect(c.roleOf?.(7)).toBe('warden');
    expect(c.roleOf?.(99)).toBeUndefined();
  });

  it('lets the bell toll lead over burst kills', () => {
    const k = cues({ type: 'kill', t: 0, enemyId: 1, role: 'needler', at, cause: 'burst' })[0];
    expect(k?.variant).toBe('burst');
    expect(k?.intensity).toBeLessThan(0.6);
  });

  it('keeps hits from sweeps and charges audible', () => {
    expect(names({ type: 'hit', t: 0, endpoint: 'soul', attackId: 1, at, health: 2, source: 'sweep' })).toEqual(['hitCrunch']);
    expect(names({ type: 'hit', t: 0, endpoint: 'body', attackId: 1, at, health: 2, source: 'charge' })).toEqual(['hitCrunch']);
    expect(names({ type: 'dashEnd', t: 0, at, reason: 'guarded' })).toEqual([]);
  });

  it('has a voice spec for every cue it can emit', () => {
    for (const name of ['boostEnd', 'haloShimmer', 'knotMark', 'decoyClaim', 'wardenWindup', 'bossWake', 'bossTelegraph', 'bossCharge', 'bossFan', 'bossHeartHit', 'bossStagger', 'bossReunite', 'bossDefeated'] as const) {
      expect(CUE_SPECS[name], name).toBeDefined();
    }
  });
});

describe('PhaseWatch', () => {
  const warden = (phase: WatchedEnemy['phase']): WatchedEnemy => ({ id: 7, role: 'warden', phase, pos: at });

  it('reports a warden opening once, never on first sight', () => {
    const w = new PhaseWatch();
    expect(w.observe('room', 0, [warden('exposed')])).toEqual([]);
    expect(w.observe('room', 1, [warden('idle')]).filter(isOpening)).toEqual([]);
    expect(w.observe('room', 2, [warden('locked')]).filter(isOpening)).toEqual([]);
    expect(w.observe('room', 3, [warden('exposed')]).filter(isOpening)).toHaveLength(1);
    expect(w.observe('room', 4, [warden('exposed')]).filter(isOpening)).toHaveLength(0);
  });

  it('forgets everything on a new room or a restart', () => {
    const w = new PhaseWatch();
    w.observe('a', 10, [warden('locked')]);
    expect(w.observe('a', 2, [warden('exposed')])).toEqual([]);
    w.observe('a', 3, [warden('locked')]);
    expect(w.observe('b', 4, [warden('exposed')])).toEqual([]);
  });

  it('ignores sentries changing phase', () => {
    const w = new PhaseWatch();
    w.observe('room', 0, [{ id: 1, role: 'needler', phase: 'idle', pos: at }]);
    const changes = w.observe('room', 1, [{ id: 1, role: 'needler', phase: 'tracking', pos: at }]);
    expect(changes).toHaveLength(1);
    expect(changes.filter(isOpening)).toEqual([]);
  });
});
