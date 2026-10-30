import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  type Settings,
} from '../../src/save/settings';

/** Minimal in-memory Storage. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

/** Storage whose every method throws (Safari private mode, blocked site data). */
class ThrowingStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error('SecurityError');
  }
  override setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

/** Readable but not writable (quota exhausted). */
class ReadOnlyStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

const custom: Settings = { muted: true, reducedMotion: true, musicVolume: 0.25, sfxVolume: 0.5 };

describe('settings persistence', () => {
  it('round-trips through storage', () => {
    const store = new MemoryStorage();
    expect(saveSettings(custom, store)).toBe(true);
    expect(loadSettings(store)).toEqual({ settings: custom, storageAvailable: true });
  });

  it('returns defaults when nothing is saved', () => {
    const result = loadSettings(new MemoryStorage());
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.storageAvailable).toBe(true);
  });

  it('survives corrupt JSON', () => {
    const store = new MemoryStorage();
    store.setItem(SETTINGS_STORAGE_KEY, '{not json');
    expect(loadSettings(store).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects wrong types per field and clamps volumes', () => {
    const store = new MemoryStorage();
    store.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ muted: 'yes', reducedMotion: true, musicVolume: 7, sfxVolume: -3 }),
    );
    const { settings } = loadSettings(store);
    expect(settings.muted).toBe(DEFAULT_SETTINGS.muted);
    expect(settings.reducedMotion).toBe(true);
    expect(settings.musicVolume).toBe(1);
    expect(settings.sfxVolume).toBe(0);
  });

  it('ignores non-finite numbers, arrays and null payloads', () => {
    expect(sanitizeSettings({ musicVolume: Number.NaN }).musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(sanitizeSettings([1, 2, 3])).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('muted')).toEqual(DEFAULT_SETTINGS);
  });

  it('treats explicitly absent storage as unavailable without throwing', () => {
    expect(loadSettings(null)).toEqual({ settings: DEFAULT_SETTINGS, storageAvailable: false });
    expect(saveSettings(custom, null)).toBe(false);
  });

  it('never throws when storage throws, and reports it as unavailable', () => {
    const store = new ThrowingStorage();
    expect(() => loadSettings(store)).not.toThrow();
    expect(loadSettings(store).storageAvailable).toBe(false);
    expect(saveSettings(custom, store)).toBe(false);
  });

  it('reads existing data but discloses that saving is blocked', () => {
    const store = new ReadOnlyStorage();
    MemoryStorage.prototype.setItem.call(store, SETTINGS_STORAGE_KEY, JSON.stringify(custom));
    expect(loadSettings(store)).toEqual({ settings: custom, storageAvailable: false });
  });

  it('does not return the frozen default object itself', () => {
    const { settings } = loadSettings(null);
    settings.muted = !settings.muted;
    expect(DEFAULT_SETTINGS.muted).not.toBe(settings.muted);
  });

  it('sanitizes before saving', () => {
    const store = new MemoryStorage();
    saveSettings({ ...custom, sfxVolume: 4 }, store);
    expect(JSON.parse(store.getItem(SETTINGS_STORAGE_KEY) as string).sfxVolume).toBe(1);
  });
});
