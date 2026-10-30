import { describe, expect, it } from 'vitest';
import { abandonRun, choose, completeRoom, createRun, draftOffer, takeDraft, type RunState } from '../../src/run/expedition';
import {
  createProgress,
  isStarterUnlocked,
  MAX_RECORDS,
  noteDiscoveries,
  parseProgress,
  ProgressStore,
  recordRunEnd,
  recordRunStart,
} from '../../src/run/progress';
import type { RelicId } from '../../src/run/relics';
import { MemoryStorage, type StorageLike } from '../../src/save/storage';

function finishedAtStation(seed: number, outcome: 'abandoned' | 'victory' = 'abandoned'): RunState {
  let run = completeRoom(createRun(seed, 'threadkeeper', `r${seed}`), { nodeId: 'n0', health: 4 });
  run = completeRoom(choose(run, 'n1a'), { nodeId: 'n1a', health: 4 });
  run = choose(run, 'n2');
  run = takeDraft(run, draftOffer(run)!.offer[0] as RelicId);
  if (outcome === 'abandoned') return abandonRun(run);
  run = completeRoom(choose(run, 'n3a'), { nodeId: 'n3a', health: 4 });
  run = takeDraft(choose(run, 'n4'), null);
  run = completeRoom(choose(run, 'n5'), { nodeId: 'n5', health: 3 });
  run = completeRoom(choose(run, 'n6'), { nodeId: 'n6', health: 2 });
  return choose(run, 'n7');
}

describe('progress records', () => {
  it('starts with only the default starter unlocked', () => {
    const p = createProgress();
    expect(isStarterUnlocked(p, 'threadkeeper')).toBe(true);
    expect(isStarterUnlocked(p, 'long_reach')).toBe(false);
  });

  it('records a finished run exactly once and unlocks Long Reach laterally after reaching a station', () => {
    const run = finishedAtStation(1);
    const once = recordRunEnd(createProgress(), run);
    expect(once.runsFinished).toBe(1);
    expect(once.runsStarted).toBe(1);
    expect(once.victories).toBe(0);
    expect(once.records).toHaveLength(1);
    expect(once.records[0]).toMatchObject({ runId: 'r1', outcome: 'abandoned', depth: 2, roomsCleared: 2 });
    expect(isStarterUnlocked(once, 'long_reach')).toBe(true);
    expect(recordRunEnd(once, run)).toBe(once);
  });

  it('does not unlock from a run that never reached a station, nor record active runs', () => {
    const early = abandonRun(createRun(2, 'threadkeeper', 'early'));
    const p = recordRunEnd(createProgress(), early);
    expect(isStarterUnlocked(p, 'long_reach')).toBe(false);
    const active = createRun(3, 'threadkeeper');
    expect(recordRunEnd(p, active)).toBe(p);
  });

  it('notes discoveries idempotently and counts victories', () => {
    const run = finishedAtStation(4, 'victory');
    let p = recordRunStart(createProgress(), run);
    expect(recordRunStart(p, run)).toBe(p);
    p = noteDiscoveries(p, run);
    expect(noteDiscoveries(p, run)).toBe(p);
    expect(p.atlas.bossDefeated).toBe(true);
    expect(p.atlas.roomsCleared).toContain('departure_court');
    expect(p.atlas.roomsCleared).toContain('last_warden');
    expect(p.atlas.relicsSeen).toContain('needlesong');
    p = recordRunEnd(p, run);
    expect(p.victories).toBe(1);
    expect(p.runsStarted).toBe(1);
  });

  it('keeps a bounded record list', () => {
    let p = createProgress();
    for (let i = 0; i < MAX_RECORDS + 5; i++) p = recordRunEnd(p, abandonRun(createRun(i, 'threadkeeper', `b${i}`)));
    expect(p.records).toHaveLength(MAX_RECORDS);
    expect(p.runsFinished).toBe(MAX_RECORDS + 5);
    expect(p.records[0]?.runId).toBe('b5');
  });
});

describe('progress persistence', () => {
  it('round-trips through the store', () => {
    const store = new ProgressStore(new MemoryStorage());
    const p = recordRunEnd(createProgress(), finishedAtStation(6, 'victory'));
    expect(store.save(p).ok).toBe(true);
    expect(store.load().value).toEqual(p);
    expect(parseProgress(JSON.stringify(p))).toEqual({ ok: true, value: p });
  });

  it.each([
    ['corrupt JSON', '{', 'corrupt'],
    ['wrong version', JSON.stringify({ ...createProgress(), version: 2 }), 'version'],
    ['negative counter', JSON.stringify({ ...createProgress(), runsStarted: -1 }), 'invalid'],
    ['victories above finished', JSON.stringify({ ...createProgress(), victories: 3 }), 'invalid'],
    ['unknown relic', JSON.stringify({ ...createProgress(), atlas: { ...createProgress().atlas, relicsSeen: ['iron_will'] } }), 'invalid'],
    ['default starter removed', JSON.stringify({ ...createProgress(), atlas: { ...createProgress().atlas, startersUnlocked: [] } }), 'invalid'],
  ])('rejects %s', (_label, text, code) => {
    const parsed = parseProgress(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.code).toBe(code);
  });

  it('falls back to fresh progress on unreadable storage without throwing', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    const store = new ProgressStore(throwing);
    expect(store.available).toBe(false);
    expect(store.loadOrCreate()).toEqual(createProgress());
    expect(store.save(createProgress()).ok).toBe(false);
  });
});
