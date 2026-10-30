import { describe, expect, it } from 'vitest';
import {
  choose,
  completeRoom,
  createRun,
  draftOffer,
  failRoom,
  roomEntry,
  takeDraft,
  type RunState,
} from '../../src/run/expedition';
import type { RelicId } from '../../src/run/relics';
import {
  checkpointToJSON,
  CheckpointStore,
  commitRoomCompletion,
  CONTINUE_LABEL,
  makeCheckpoint,
  parseCheckpoint,
  resumeFrom,
  SAVE_VERSION,
  serializeCheckpoint,
} from '../../src/save/checkpoint';
import { MemoryStorage, type StorageLike } from '../../src/save/storage';

/** A run standing at the first station with its offer fixed. */
function atStation(seed = 21): RunState {
  let run = completeRoom(createRun(seed, 'threadkeeper'), { nodeId: 'n0', health: 4 });
  run = completeRoom(choose(run, 'n1a'), { nodeId: 'n1a', health: 3, charges: { bellKills: 0, bellCharged: false, knotMarked: false } });
  return choose(run, 'n2');
}

/** A run inside the second branch room after taking a draft. */
function deepRun(seed = 21): RunState {
  const run = atStation(seed);
  const pick = draftOffer(run)!.offer[0] as RelicId;
  return choose(takeDraft(run, pick), 'n3b');
}

const mutate = (run: RunState, edit: (json: Record<string, any>) => void): string => {
  const json = checkpointToJSON(makeCheckpoint(run)) as Record<string, any>;
  edit(json);
  return JSON.stringify(json);
};

describe('checkpoint format', () => {
  it('round-trips at room entry, at a station and after a completion', () => {
    for (const run of [createRun(1, 'long_reach'), atStation(), deepRun(), completeRoom(deepRun(), { nodeId: 'n3b', health: 2 })]) {
      const text = serializeCheckpoint(makeCheckpoint(run));
      const parsed = parseCheckpoint(text);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value.run).toEqual(run);
      expect(parsed.value.entry).toEqual(roomEntry(run));
      // Parsing accepts the already-decoded object form as well.
      expect(parseCheckpoint(JSON.parse(text)).ok).toBe(true);
    }
  });

  it('keeps the draft offer stable across save and load', () => {
    const run = atStation(33);
    const parsed = parseCheckpoint(serializeCheckpoint(makeCheckpoint(run)));
    expect(parsed.ok && draftOffer(parsed.value.run)?.offer).toEqual(draftOffer(run)?.offer);
  });

  it('labels Continue honestly', () => {
    expect(CONTINUE_LABEL).toBe('Continue restarts this room.');
  });

  it('rejects corrupt JSON and wrong versions with typed errors', () => {
    expect(parseCheckpoint('{nope')).toEqual({ ok: false, error: { code: 'corrupt', detail: 'checkpoint is not valid JSON' } });
    expect(parseCheckpoint('[]')).toMatchObject({ ok: false, error: { code: 'corrupt' } });
    const run = createRun(2, 'threadkeeper');
    expect(parseCheckpoint(mutate(run, (j) => (j.saveVersion = SAVE_VERSION + 1)))).toMatchObject({ ok: false, error: { code: 'version' } });
    expect(parseCheckpoint(mutate(run, (j) => (j.rulesVersion = 0)))).toMatchObject({ ok: false, error: { code: 'version' } });
    expect(parseCheckpoint(mutate(run, (j) => (j.contentVersion = 99)))).toMatchObject({ ok: false, error: { code: 'version' } });
    expect(parseCheckpoint(mutate(run, (j) => (j.graphFingerprint = 'x')))).toMatchObject({ ok: false, error: { code: 'version' } });
  });

  it.each([
    ['health above max', (j: Record<string, any>) => (j.run.health = 9)],
    ['health zero', (j: Record<string, any>) => (j.run.health = 0)],
    ['fractional health', (j: Record<string, any>) => (j.run.health = 2.5)],
    ['unknown relic', (j: Record<string, any>) => (j.run.loadout = ['needlesong', 'iron_will'])],
    ['illegal pair', (j: Record<string, any>) => (j.run.loadout = ['long_silk', 'short_stitch'])],
    ['third slot', (j: Record<string, any>) => j.run.loadout.push('glass_lantern', 'mourning_bell')],
    ['unknown starter', (j: Record<string, any>) => (j.run.starter = 'ghost')],
    ['bad run id', (j: Record<string, any>) => (j.run.runId = '../../etc')],
    ['negative seed', (j: Record<string, any>) => (j.run.seed = -4)],
    ['history jump', (j: Record<string, any>) => (j.run.history = ['n0', 'n2', 'n3b'])],
    ['current not last', (j: Record<string, any>) => (j.run.at = 'n0')],
    ['left uncleared room', (j: Record<string, any>) => (j.run.completed = ['n0'])],
    ['rerolled offer', (j: Record<string, any>) => j.run.drafts.n2.offer.reverse()],
    ['pick not offered', (j: Record<string, any>) => (j.run.drafts.n2.pick = 'short_stitch')],
    ['loadout not from drafts', (j: Record<string, any>) => (j.run.loadout = ['needlesong'])],
    ['charges beyond loadout', (j: Record<string, any>) => (j.run.charges = { bellKills: 1, bellCharged: true, knotMarked: false })],
    ['negative totals', (j: Record<string, any>) => (j.run.totals.cuts = -1)],
    ['bad attempts', (j: Record<string, any>) => (j.run.attempts = { n0: -2 })],
    ['finished run', (j: Record<string, any>) => (j.run.outcome = 'victory')],
    ['entry health mismatch', (j: Record<string, any>) => (j.entry.health = 1)],
    ['entry seed mismatch', (j: Record<string, any>) => (j.entry.seed = 1)],
    ['entry missing', (j: Record<string, any>) => (j.entry = null)],
  ])('rejects %s', (_label, edit) => {
    const parsed = parseCheckpoint(mutate(deepRun(), edit));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.code).toBe('invalid');
  });

  it('refuses to checkpoint a finished run', () => {
    let run = createRun(1, 'threadkeeper');
    run = { ...run, outcome: 'abandoned' };
    expect(() => makeCheckpoint(run)).toThrow(/finished/);
  });
});

describe('CheckpointStore', () => {
  it('saves and loads the latest checkpoint and restarts the room from its entry state', () => {
    const store = new CheckpointStore(new MemoryStorage());
    expect(store.available).toBe(true);
    const run = deepRun();
    expect(store.save(run).ok).toBe(true);
    const failed = failRoom(run);
    expect(store.save(failed).ok).toBe(true);
    const loaded = store.load();
    expect(loaded.value?.run).toEqual(failed);
    const { entry } = resumeFrom(loaded.value!);
    expect(entry).toEqual(roomEntry(run));
  });

  it('falls back to the previous slot when the newest save is corrupt', () => {
    const mem = new MemoryStorage();
    const store = new CheckpointStore(mem);
    const first = createRun(8, 'threadkeeper');
    store.save(first);
    const second = completeRoom(first, { nodeId: 'n0', health: 4 });
    const result = store.save(second);
    expect(result.ok && result.slot).toBe('b');
    mem.setItem('oys.checkpoint.b', mem.getItem('oys.checkpoint.b')!.replace('"health":4', '"health":40'));
    const loaded = store.load();
    expect(loaded.value?.run).toEqual(first);
    expect(loaded.errors.map((e) => e.error.code)).toEqual(['invalid']);
  });

  it('never throws on throwing or absent storage and reports unavailability', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    for (const backing of [null, throwing]) {
      const store = new CheckpointStore(backing);
      expect(store.available).toBe(false);
      expect(store.load().value).toBeNull();
      expect(store.save(createRun(1, 'threadkeeper')).ok).toBe(false);
      expect(() => store.clear()).not.toThrow();
    }
  });

  it('commits a room completion with its reward exactly once', () => {
    const store = new CheckpointStore(new MemoryStorage());
    const run = createRun(13, 'threadkeeper');
    store.save(run);
    const result = { nodeId: 'n0', health: 4, stats: { cuts: 2, kills: 3 } };
    const a = commitRoomCompletion(store, run, result);
    expect(a.committed).toBe(true);
    expect(a.save.ok).toBe(true);
    const b = commitRoomCompletion(store, a.run, result);
    expect(b.committed).toBe(false);
    expect(b.run).toBe(a.run);
    // Reload, then replay the same completion: still one reward.
    const reloaded = store.load().value!.run;
    const c = commitRoomCompletion(store, reloaded, result);
    expect(c.committed).toBe(false);
    expect(c.run.totals.roomsCleared).toBe(1);
    expect(c.run.totals.kills).toBe(3);
  });

  it('keeps a station draft committed exactly once across reloads', () => {
    const store = new CheckpointStore(new MemoryStorage());
    const run = atStation(5);
    store.save(run);
    const offer = draftOffer(store.load().value!.run)!.offer;
    const taken = takeDraft(store.load().value!.run, offer[1] as RelicId);
    store.save(taken);
    const reloaded = store.load().value!.run;
    expect(reloaded.loadout).toEqual(taken.loadout);
    expect(takeDraft(reloaded, offer[2] as RelicId)).toBe(reloaded);
    expect(reloaded.health).toBe(taken.health);
  });
});
