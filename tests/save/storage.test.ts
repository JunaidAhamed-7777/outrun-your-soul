import { describe, expect, it } from 'vitest';
import {
  MemoryStorage,
  probeStorage,
  safeGet,
  safeSet,
  saveError,
  TwoSlotStore,
  type Parsed,
  type StorageLike,
} from '../../src/save/storage';

interface Box {
  n: number;
}
const parseBox = (data: unknown): Parsed<Box> =>
  typeof data === 'object' && data !== null && typeof (data as Box).n === 'number' && (data as Box).n >= 0
    ? { ok: true, value: { n: (data as Box).n } }
    : saveError('invalid', 'not a box');
const store = (s: StorageLike | null) => new TwoSlotStore<Box>(s, 't', parseBox, (b) => b);

class ThrowingStorage implements StorageLike {
  constructor(private readonly mode: 'all' | 'set' | 'get') {}
  getItem(): string | null {
    if (this.mode !== 'set') throw new Error('SecurityError');
    return null;
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
  removeItem(): void {
    if (this.mode === 'all') throw new Error('SecurityError');
  }
}

describe('safe storage helpers', () => {
  it('never throw and report unavailability', () => {
    expect(probeStorage(null)).toBe(false);
    expect(probeStorage(new ThrowingStorage('all'))).toBe(false);
    expect(probeStorage(new MemoryStorage())).toBe(true);
    expect(safeGet(new ThrowingStorage('all'), 'k')).toEqual({ ok: false });
    expect(safeSet(new ThrowingStorage('set'), 'k', 'v')).toBe(false);
  });
});

describe('TwoSlotStore', () => {
  it('round-trips and alternates slots with increasing sequence', () => {
    const mem = new MemoryStorage();
    const s = store(mem);
    expect(s.available).toBe(true);
    expect(s.load().value).toBeNull();
    expect(s.save({ n: 1 })).toEqual({ ok: true, slot: 'a', sequence: 1 });
    expect(s.save({ n: 2 })).toEqual({ ok: true, slot: 'b', sequence: 2 });
    expect(s.save({ n: 3 })).toEqual({ ok: true, slot: 'a', sequence: 3 });
    const loaded = s.load();
    expect(loaded.value).toEqual({ n: 3 });
    expect(loaded.slot).toBe('a');
    // A fresh store over the same storage sees the same state.
    expect(store(mem).load().value).toEqual({ n: 3 });
  });

  it('falls back to the older valid slot when the newest is corrupt', () => {
    const mem = new MemoryStorage();
    const s = store(mem);
    s.save({ n: 1 });
    s.save({ n: 2 });
    mem.setItem('t.b', '{"seq":2,"data":{broken');
    const loaded = s.load();
    expect(loaded.value).toEqual({ n: 1 });
    expect(loaded.errors).toEqual([{ slot: 'b', error: { code: 'corrupt', detail: 'not valid JSON' } }]);
  });

  it('rejects invalid payloads and bad envelopes', () => {
    const mem = new MemoryStorage();
    mem.setItem('t.a', JSON.stringify({ seq: 5, data: { n: -1 } }));
    mem.setItem('t.b', JSON.stringify({ seq: 'x', data: { n: 1 } }));
    const loaded = store(mem).load();
    expect(loaded.value).toBeNull();
    expect(loaded.errors.map((e) => e.error.code).sort()).toEqual(['corrupt', 'invalid']);
  });

  it('never overwrites the only valid save when writing over a corrupt slot sequence', () => {
    const mem = new MemoryStorage();
    const s = store(mem);
    s.save({ n: 1 }); // slot a, seq 1
    mem.setItem('t.b', JSON.stringify({ seq: 9, data: 'junk' }));
    const result = s.save({ n: 2 });
    expect(result).toEqual({ ok: true, slot: 'b', sequence: 10 });
    expect(JSON.parse(mem.getItem('t.a') as string).data).toEqual({ n: 1 });
    expect(s.load().value).toEqual({ n: 2 });
  });

  it('keeps the previous save when a write fails', () => {
    const mem = new MemoryStorage();
    const s = store(mem);
    s.save({ n: 1 });
    const failing: StorageLike = {
      getItem: (k) => mem.getItem(k),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: (k) => mem.removeItem(k),
    };
    const s2 = new TwoSlotStore<Box>(failing, 't', parseBox, (b) => b);
    expect(s2.save({ n: 2 }).ok).toBe(false);
    expect(s2.load().value).toEqual({ n: 1 });
  });

  it('reports verify failure when the read-back differs', () => {
    const mem = new MemoryStorage();
    const lossy: StorageLike = {
      getItem: (k) => mem.getItem(k),
      setItem: (k) => mem.setItem(k, '{"seq":1,"data":{"n":-5}}'),
      removeItem: (k) => mem.removeItem(k),
    };
    const s = new TwoSlotStore<Box>(lossy, 't', parseBox, (b) => b);
    expect(s.save({ n: 4 })).toEqual({ ok: false, reason: 'verifyFailed' });
  });

  it('handles absent and throwing storage without throwing', () => {
    for (const backing of [null, new ThrowingStorage('all'), new ThrowingStorage('get'), new ThrowingStorage('set')]) {
      const s = store(backing);
      expect(s.available).toBe(false);
      expect(() => s.load()).not.toThrow();
      expect(s.load().value).toBeNull();
      const result = s.save({ n: 1 });
      expect(result.ok).toBe(false);
      expect(() => s.clear()).not.toThrow();
    }
  });
});
