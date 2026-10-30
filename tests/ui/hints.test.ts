import { describe, expect, it } from 'vitest';
import type { HintDef, SimEvent } from '../../src/sim/types';
import { HINT_TIMING, HintTracker, triggersForEvent } from '../../src/ui/hints';

const HINTS: HintDef[] = [
  { id: 'start', when: 'start', text: 'Drag anywhere, release to dash' },
  { id: 'sep', when: 'firstSeparation', text: 'Your soul follows slowly. Tap to return to it.' },
  { id: 'track', when: 'firstTelegraph', text: 'Amber lines show where a sentry is aiming.' },
  { id: 'lock', when: 'firstLock', text: 'A locked line will not move. Step off it.' },
  { id: 'clear', when: 'cleared', text: 'The courtyard is quiet.' },
  { id: 'gate', when: 'gateWaiting', text: 'The gate needs both of you.' },
];

const ev = {
  dash: { type: 'dashStart', t: 0, from: { x: 0, y: 0 }, to: { x: 0, y: 2 }, limitedBy: 'none' } as SimEvent,
  sep: { type: 'separated', t: 0 } as SimEvent,
  ret: { type: 'returnStart', t: 0, from: { x: 0, y: 2 } } as SimEvent,
  track: { type: 'telegraph', t: 0, enemyId: 1, phase: 'tracking', target: 'body' } as SimEvent,
  lock: { type: 'telegraph', t: 0, enemyId: 1, phase: 'locked', target: 'body' } as SimEvent,
  fire: { type: 'fire', t: 0, enemyId: 1, projectileId: 2, attackId: 3, at: { x: 1, y: 1 } } as SimEvent,
  cleared: { type: 'roomCleared', t: 0 } as SimEvent,
  gateReady: { type: 'gate', t: 0, status: 'ready' } as SimEvent,
  gateOpen: { type: 'gate', t: 0, status: 'open' } as SimEvent,
};

function tracker(): HintTracker {
  const t = new HintTracker(HINTS);
  t.reset();
  t.tick(0);
  return t;
}

describe('hint triggers', () => {
  it('maps simulation events to hint triggers', () => {
    expect(triggersForEvent(ev.sep)).toEqual(['firstSeparation']);
    expect(triggersForEvent(ev.track)).toEqual(['firstTelegraph']);
    expect(triggersForEvent(ev.lock)).toEqual(['firstLock']);
    expect(triggersForEvent(ev.cleared)).toEqual(['cleared']);
    expect(triggersForEvent(ev.gateReady)).toEqual(['gateWaiting']);
    expect(triggersForEvent(ev.gateOpen)).toEqual([]);
    expect(triggersForEvent(ev.dash)).toEqual([]);
  });
});

describe('HintTracker', () => {
  it('shows the start hint on reset', () => {
    expect(tracker().current?.id).toBe('start');
  });

  it('keeps a hint for its minimum time even if the player acts at once', () => {
    const t = tracker();
    t.onEvent(ev.dash);
    t.tick(0.5);
    expect(t.current?.id).toBe('start');
    t.tick(HINT_TIMING.start.minSeconds);
    expect(t.current).toBeNull();
  });

  it('fades a hint after its maximum time without action', () => {
    const t = tracker();
    t.tick(HINT_TIMING.start.maxSeconds + 0.01);
    expect(t.current).toBeNull();
  });

  it('shows each hint at most once per attempt', () => {
    const t = tracker();
    t.onEvent(ev.dash);
    t.tick(5);
    t.onEvent(ev.sep);
    t.tick(0);
    expect(t.current?.id).toBe('sep');
    t.tick(10);
    t.onEvent(ev.sep);
    t.tick(0);
    expect(t.current).toBeNull();
  });

  it('shows hints again after a room restart', () => {
    const t = tracker();
    t.onEvent(ev.dash);
    t.tick(5);
    t.onEvent(ev.sep);
    t.tick(10);
    t.reset();
    t.onEvent(ev.sep);
    t.tick(0);
    expect(t.current?.id).toBe('start');
    t.tick(HINT_TIMING.start.minSeconds + 0.01);
    expect(t.current?.id).toBe('sep');
  });

  it('lets a newer hint replace the current one after the minimum time', () => {
    const t = tracker();
    t.onEvent(ev.track);
    t.tick(0.2);
    expect(t.current?.id).toBe('start');
    t.tick(HINT_TIMING.start.minSeconds);
    expect(t.current?.id).toBe('track');
  });

  it('drops a queued hint whose advice was already followed', () => {
    const t = tracker();
    t.onEvent(ev.sep);
    t.onEvent(ev.ret);
    t.onEvent(ev.dash);
    t.tick(HINT_TIMING.start.minSeconds + 0.01);
    expect(t.current).toBeNull();
  });

  it('dismisses the lock hint when the bolt fires', () => {
    const t = tracker();
    t.onEvent(ev.dash);
    t.tick(5);
    t.onEvent(ev.lock);
    t.tick(0);
    expect(t.current?.id).toBe('lock');
    t.onEvent(ev.fire);
    t.tick(HINT_TIMING.firstLock.minSeconds + 0.01);
    expect(t.current).toBeNull();
  });

  it('reports changes from tick', () => {
    const t = new HintTracker(HINTS);
    t.reset();
    expect(t.tick(0)).toBe(true);
    expect(t.tick(0.1)).toBe(false);
  });

  it('copes with rooms that author no hints', () => {
    const t = new HintTracker([]);
    t.reset();
    t.onEvent(ev.sep);
    expect(t.tick(1)).toBe(false);
    expect(t.current).toBeNull();
  });
});
