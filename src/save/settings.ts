/**
 * Player settings persisted in browser storage. Storage is optional: every function
 * here tolerates missing, throwing or quota-blocked storage and never throws itself.
 * Loaded data is validated field by field; anything malformed falls back to defaults.
 */
export interface Settings {
  muted: boolean;
  reducedMotion: boolean;
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  sfxVolume: number;
}

export const SETTINGS_STORAGE_KEY = 'outrun-your-soul.settings.v1';
const PROBE_KEY = 'outrun-your-soul.probe';

function prefersReducedMotion(): boolean {
  try {
    const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
    return typeof mm === 'function' ? Boolean(mm('(prefers-reduced-motion: reduce)').matches) : false;
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  muted: false,
  reducedMotion: prefersReducedMotion(),
  musicVolume: 0.6,
  sfxVolume: 0.9,
});

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Coerce arbitrary parsed data into valid settings, keeping only well-typed fields. */
export function sanitizeSettings(raw: unknown, defaults: Settings = DEFAULT_SETTINGS): Settings {
  const out: Settings = { ...defaults };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.muted === 'boolean') out.muted = r.muted;
  if (typeof r.reducedMotion === 'boolean') out.reducedMotion = r.reducedMotion;
  if (typeof r.musicVolume === 'number' && Number.isFinite(r.musicVolume)) out.musicVolume = clamp01(r.musicVolume);
  if (typeof r.sfxVolume === 'number' && Number.isFinite(r.sfxVolume)) out.sfxVolume = clamp01(r.sfxVolume);
  return out;
}

/** undefined means "use the browser's localStorage if reachable"; null means "no storage". */
function resolveStorage(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) return storage;
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

function canWrite(storage: Storage): boolean {
  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(storage?: Storage | null): { settings: Settings; storageAvailable: boolean } {
  const store = resolveStorage(storage);
  if (!store) return { settings: { ...DEFAULT_SETTINGS }, storageAvailable: false };
  const storageAvailable = canWrite(store);
  let raw: string | null = null;
  try {
    raw = store.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, storageAvailable: false };
  }
  if (raw === null) return { settings: { ...DEFAULT_SETTINGS }, storageAvailable };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  return { settings: sanitizeSettings(parsed), storageAvailable };
}

export function saveSettings(settings: Settings, storage?: Storage | null): boolean {
  const store = resolveStorage(storage);
  if (!store) return false;
  try {
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
