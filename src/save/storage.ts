/**
 * Thin, never-throwing storage layer. Browser storage can be absent, blocked, full or
 * cleared; every failure is reported, none is fatal. Saves use two alternating slots so
 * the previous valid save survives until a new one has been written and read back.
 */

/** The subset of the Web Storage API the game uses (localStorage satisfies it). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage when it exists and is accessible, otherwise null. Never throws. */
export function browserStorage(): StorageLike | null {
  try {
    const g = globalThis as { localStorage?: StorageLike };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

/** True when a write/read/remove round trip works right now. */
export function probeStorage(storage: StorageLike | null, key = 'oys.probe'): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, '1');
    const ok = storage.getItem(key) === '1';
    storage.removeItem(key);
    return ok;
  } catch {
    return false;
  }
}

export function safeGet(storage: StorageLike | null, key: string): { ok: true; value: string | null } | { ok: false } {
  if (!storage) return { ok: false };
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return { ok: false };
  }
}

export function safeSet(storage: StorageLike | null, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(storage: StorageLike | null, key: string): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Typed validation outcome used by every persisted format. */
export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: SaveError };

export interface SaveError {
  readonly code: 'corrupt' | 'version' | 'invalid' | 'missing';
  readonly detail: string;
}

export const saveError = (code: SaveError['code'], detail: string): { ok: false; error: SaveError } => ({
  ok: false,
  error: { code, detail },
});

export type SlotId = 'a' | 'b';

export interface SlotLoad<T> {
  readonly value: T | null;
  readonly slot: SlotId | null;
  readonly sequence: number;
  /** Problems found in either slot (a corrupt newest slot is reported even when the older one loads). */
  readonly errors: ReadonlyArray<{ readonly slot: SlotId; readonly error: SaveError }>;
  readonly available: boolean;
}

export type SlotSaveResult =
  | { readonly ok: true; readonly slot: SlotId; readonly sequence: number }
  | { readonly ok: false; readonly reason: 'unavailable' | 'writeFailed' | 'verifyFailed' };

interface Envelope {
  readonly seq: number;
  readonly data: unknown;
}

/**
 * Two alternating slots holding `{ seq, data }` envelopes. Load picks the valid slot with
 * the highest sequence; save writes the other slot, reads it back and validates it before
 * it counts. The older slot is never touched by a save.
 */
export class TwoSlotStore<T> {
  private availableNow: boolean;

  constructor(
    private readonly storage: StorageLike | null,
    private readonly prefix: string,
    private readonly parse: (data: unknown) => Parsed<T>,
    private readonly serialize: (value: T) => unknown,
  ) {
    this.availableNow = probeStorage(storage, `${prefix}.probe`);
  }

  get available(): boolean {
    return this.availableNow;
  }

  private key(slot: SlotId): string {
    return `${this.prefix}.${slot}`;
  }

  private readSlot(slot: SlotId): { state: 'empty' } | { state: 'error'; error: SaveError } | { state: 'ok'; seq: number; value: T } {
    const got = safeGet(this.storage, this.key(slot));
    if (!got.ok) return { state: 'error', error: { code: 'missing', detail: 'storage unavailable' } };
    if (got.value === null) return { state: 'empty' };
    let env: unknown;
    try {
      env = JSON.parse(got.value);
    } catch {
      return { state: 'error', error: { code: 'corrupt', detail: 'not valid JSON' } };
    }
    if (typeof env !== 'object' || env === null) return { state: 'error', error: { code: 'corrupt', detail: 'envelope is not an object' } };
    const { seq, data } = env as Partial<Envelope>;
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) {
      return { state: 'error', error: { code: 'corrupt', detail: 'bad sequence' } };
    }
    const parsed = this.parse(data);
    if (!parsed.ok) return { state: 'error', error: parsed.error };
    return { state: 'ok', seq, value: parsed.value };
  }

  load(): SlotLoad<T> {
    if (!this.storage) return { value: null, slot: null, sequence: 0, errors: [], available: false };
    const errors: Array<{ slot: SlotId; error: SaveError }> = [];
    let best: { slot: SlotId; seq: number; value: T } | null = null;
    let readable = false;
    for (const slot of ['a', 'b'] as const) {
      const r = this.readSlot(slot);
      if (r.state === 'error') {
        if (r.error.code !== 'missing') readable = true;
        errors.push({ slot, error: r.error });
      } else {
        readable = true;
        if (r.state === 'ok' && (!best || r.seq > best.seq)) best = { slot, seq: r.seq, value: r.value };
      }
    }
    if (!readable) this.availableNow = false;
    return best
      ? { value: best.value, slot: best.slot, sequence: best.seq, errors, available: this.availableNow }
      : { value: null, slot: null, sequence: 0, errors, available: this.availableNow };
  }

  /** Highest sequence present in either slot, valid or not, so a new write never ties. */
  private maxSequence(): number {
    let max = 0;
    for (const slot of ['a', 'b'] as const) {
      const got = safeGet(this.storage, this.key(slot));
      if (!got.ok || got.value === null) continue;
      try {
        const seq = (JSON.parse(got.value) as Partial<Envelope>).seq;
        if (typeof seq === 'number' && Number.isSafeInteger(seq) && seq > max) max = seq;
      } catch {
        // corrupt slot: ignore its sequence
      }
    }
    return max;
  }

  save(value: T): SlotSaveResult {
    if (!this.storage) return { ok: false, reason: 'unavailable' };
    const current = this.load();
    const target: SlotId = current.slot === 'a' ? 'b' : 'a';
    const seq = Math.max(current.sequence, this.maxSequence()) + 1;
    const text = JSON.stringify({ seq, data: this.serialize(value) } satisfies Envelope);
    if (!safeSet(this.storage, this.key(target), text)) {
      this.availableNow = probeStorage(this.storage, `${this.prefix}.probe`);
      return { ok: false, reason: this.availableNow ? 'writeFailed' : 'unavailable' };
    }
    const check = this.readSlot(target);
    if (check.state !== 'ok' || check.seq !== seq) return { ok: false, reason: 'verifyFailed' };
    this.availableNow = true;
    return { ok: true, slot: target, sequence: seq };
  }

  clear(): boolean {
    const a = safeRemove(this.storage, this.key('a'));
    const b = safeRemove(this.storage, this.key('b'));
    return a && b;
  }
}

/** In-memory StorageLike for tests and for running without browser storage. */
export class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}
