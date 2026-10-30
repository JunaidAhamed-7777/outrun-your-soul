/**
 * Level select and story: the canonical order from First Light to the Last Warden, which
 * levels are unlocked, and the one-sentence story beat shown before each level begins.
 *
 * Unlocks are strictly in order (1 -> 2 -> ... -> 8): a level opens only once every level
 * before it has been cleared. Clearing a later room early (e.g. on an expedition) never
 * skips ahead. Clears are kept in a small versioned record in local storage (never
 * throws when storage is unavailable; then only First Light is open).
 */
import { roomMeta } from './room-meta';

export interface LevelDef {
  /** Room template id (FIRST_LIGHT is 'first_light'). */
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /** The story sentence that fades in before this level begins. */
  readonly story: string;
}

const level = (id: string, story: string, name?: string, blurb?: string): LevelDef => {
  const meta = roomMeta(id);
  return { id, name: name ?? meta.name, blurb: blurb ?? meta.blurb, story };
};

export const LEVELS: readonly LevelDef[] = [
  level('first_light', 'You died on the funeral railway, and then you took your body back.', 'First Light', 'Learn to leave yourself behind.'),
  level('departure_court', 'Your body is quick again, but your soul can only follow the thread you leave.'),
  level('needle_gallery', 'The railway keeps sentries for one purpose: the dead do not leave.'),
  level('silk_cloister', 'Every corner you take, your soul must take too, a little later.'),
  level('glass_crossing', 'Funeral light burns the paths of anyone who lingers.'),
  level('mourners_garden', 'Mourners still tend your grave, not knowing you are already gone.'),
  level('last_platform', 'The last train waits at the end of the line, and so does its warden.'),
  level('last_warden', 'The Last Warden outran its own soul long ago, and never let it catch up.'),
];

export const LEVELS_KEY = 'oys.levels.v1';

export interface LevelProgress {
  readonly cleared: ReadonlySet<string>;
}

export function parseLevelProgress(raw: string | null): LevelProgress {
  try {
    const data = raw ? (JSON.parse(raw) as { cleared?: unknown }) : null;
    const ids = Array.isArray(data?.cleared) ? data.cleared.filter((x): x is string => typeof x === 'string') : [];
    const known = new Set(LEVELS.map((l) => l.id));
    return { cleared: new Set(ids.filter((id) => known.has(id))) };
  } catch {
    return { cleared: new Set() };
  }
}

export function serializeLevelProgress(p: LevelProgress): string {
  return JSON.stringify({ cleared: LEVELS.map((l) => l.id).filter((id) => p.cleared.has(id)) });
}

export function withCleared(p: LevelProgress, id: string): LevelProgress {
  if (p.cleared.has(id) || !LEVELS.some((l) => l.id === id)) return p;
  return { cleared: new Set([...p.cleared, id]) };
}

/** Index of the furthest unlocked level: the first level not yet cleared, in order. */
export function unlockedThrough(p: LevelProgress): number {
  const firstUncleared = LEVELS.findIndex((l) => !p.cleared.has(l.id));
  return firstUncleared < 0 ? LEVELS.length - 1 : firstUncleared;
}

/** The level the Play button starts: the first one not yet cleared, or null when all are done. */
export function nextCampaignLevel(p: LevelProgress): LevelDef | null {
  return LEVELS.find((l) => !p.cleared.has(l.id)) ?? null;
}

export function isUnlocked(p: LevelProgress, id: string): boolean {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i <= unlockedThrough(p);
}

export function levelIndex(id: string): number {
  return LEVELS.findIndex((l) => l.id === id);
}

/**
 * Story beat for an expedition room. Expedition routes branch, so beats follow the
 * journey's stage (opening, first branch, second branch, final approach, boss) rather
 * than the room, keeping the story in order whichever rooms a run visits.
 */
const RUN_STAGE_BEATS: Readonly<Record<number, number>> = { 0: 1, 1: 2, 3: 4, 5: 6, 6: 7 };

export function runStoryBeat(depth: number): string | null {
  const i = RUN_STAGE_BEATS[depth];
  return i === undefined ? null : (LEVELS[i]?.story ?? null);
}
