import { describe, expect, it } from 'vitest';
import { roomFor } from '../../src/content/rooms';
import {
  isUnlocked,
  LEVELS,
  nextCampaignLevel,
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

  it('unlocks strictly in order: 1 -> 2 -> ... -> 8, never skipping ahead', () => {
    let p = parseLevelProgress(null);
    expect(unlockedThrough(p)).toBe(0);
    expect(nextCampaignLevel(p)?.id).toBe('first_light');
    expect(isUnlocked(p, 'departure_court')).toBe(false);
    p = withCleared(p, 'first_light');
    expect(isUnlocked(p, 'departure_court')).toBe(true);
    expect(isUnlocked(p, 'needle_gallery')).toBe(false);
    // Clearing a later room early (e.g. on an expedition) does not open anything past the gap.
    p = withCleared(p, 'mourners_garden');
    expect(isUnlocked(p, 'needle_gallery')).toBe(false);
    expect(isUnlocked(p, 'last_platform')).toBe(false);
    expect(nextCampaignLevel(p)?.id).toBe('departure_court');
    for (const l of LEVELS) p = withCleared(p, l.id);
    expect(nextCampaignLevel(p)).toBeNull();
    expect(isUnlocked(p, 'last_warden')).toBe(true);
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
