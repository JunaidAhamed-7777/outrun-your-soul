import { describe, expect, it } from 'vitest';
import { roomFor } from '../../src/content/rooms';
import {
  isUnlocked,
  LEVELS,
  parseLevelProgress,
  runStoryBeat,
  serializeLevelProgress,
  unlockedThrough,
  withCleared,
} from '../../src/game/levels';

describe('levels', () => {
  it('runs from the tutorial to the boss, each with a playable room and one story sentence', () => {
    expect(LEVELS[0]!.id).toBe('first_light');
    expect(LEVELS.at(-1)!.id).toBe('last_warden');
    for (const l of LEVELS.slice(1)) expect(() => roomFor(l.id, 0)).not.toThrow();
    for (const l of LEVELS) {
      expect(l.story.length).toBeGreaterThan(20);
      expect(l.story.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length).toBe(1);
    }
  });

  it('opens only the tutorial at first, then one level past the furthest clear', () => {
    let p = parseLevelProgress(null);
    expect(unlockedThrough(p)).toBe(0);
    expect(isUnlocked(p, 'departure_court')).toBe(false);
    p = withCleared(p, 'first_light');
    expect(isUnlocked(p, 'departure_court')).toBe(true);
    expect(isUnlocked(p, 'needle_gallery')).toBe(false);
    // A branch room cleared during an expedition opens everything up to the level after it.
    p = withCleared(p, 'glass_crossing');
    expect(isUnlocked(p, 'mourners_garden')).toBe(true);
    expect(isUnlocked(p, 'last_platform')).toBe(false);
  });

  it('round-trips through storage and ignores junk', () => {
    const p = withCleared(withCleared(parseLevelProgress(null), 'first_light'), 'departure_court');
    expect([...parseLevelProgress(serializeLevelProgress(p)).cleared].sort()).toEqual(['departure_court', 'first_light']);
    expect(parseLevelProgress('{oops').cleared.size).toBe(0);
    expect(parseLevelProgress('{"cleared":["nope",3,"first_light"]}').cleared).toEqual(new Set(['first_light']));
  });

  it('tells the expedition story in order whatever rooms the run visits', () => {
    const beats = [0, 1, 3, 5, 6].map(runStoryBeat);
    expect(beats.every(Boolean)).toBe(true);
    const order = beats.map((b) => LEVELS.findIndex((l) => l.story === b));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(runStoryBeat(2)).toBeNull();
  });
});
