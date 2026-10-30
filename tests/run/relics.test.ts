import { describe, expect, it } from 'vitest';
import {
  applyDraft,
  areCompatible,
  canAdd,
  EMPTY_CHARGES,
  isLegalLoadout,
  legalPairs,
  MAX_RELIC_SLOTS,
  normalizeCharges,
  RELIC_IDS,
  RELICS,
  replaceOptions,
  roomParamsFor,
  simHooksFor,
  STARTER_IDS,
  STARTERS,
  type Loadout,
  type RelicId,
} from '../../src/run/relics';
import { nextRandom, RunRandom, hashSeed } from '../../src/run/rng';

const BASE = { soulSpeed: 2, tetherCapacity: 6, dashMaxDistance: 3 };

describe('relic pool', () => {
  it('defines exactly six relics with complete records', () => {
    expect(RELIC_IDS).toHaveLength(6);
    for (const id of RELIC_IDS) {
      const def = RELICS[id];
      expect(def.id).toBe(id);
      for (const field of ['name', 'rule', 'trigger', 'effect', 'cap', 'savedState', 'indicator', 'counterexample'] as const) {
        expect(def[field].length, `${id}.${field}`).toBeGreaterThan(5);
      }
    }
  });

  it('has exactly fourteen legal unordered pairs and rejects Long Silk + Short Stitch', () => {
    const pairs = legalPairs();
    expect(pairs).toHaveLength(14);
    const keys = new Set(pairs.map(([a, b]) => [a, b].sort().join('+')));
    expect(keys.size).toBe(14);
    expect(keys.has('long_silk+short_stitch')).toBe(false);
    expect(isLegalLoadout(['long_silk', 'short_stitch'])).toBe(false);
    expect(isLegalLoadout(['short_stitch', 'long_silk'])).toBe(false);
    expect(areCompatible('long_silk', 'short_stitch')).toBe(false);
  });

  it('rejects duplicates, a third slot and unknown IDs', () => {
    expect(isLegalLoadout(['needlesong', 'needlesong'])).toBe(false);
    expect(isLegalLoadout(['needlesong', 'glass_lantern', 'mourning_bell'])).toBe(false);
    expect(isLegalLoadout(['needlesong', 'bogus'])).toBe(false);
    expect(isLegalLoadout([])).toBe(true);
    expect(isLegalLoadout(['travelers_knot'])).toBe(true);
  });
});

describe('applyDraft', () => {
  it('fills the free slot and refuses incompatible additions', () => {
    expect(applyDraft(['needlesong'], 'mourning_bell')).toEqual({ ok: true, loadout: ['needlesong', 'mourning_bell'], replaced: null });
    expect(applyDraft(['long_silk'], 'short_stitch')).toEqual({ ok: false, reason: 'incompatible' });
    expect(canAdd(['long_silk'], 'short_stitch')).toBe(false);
  });

  it('only replaces Long Silk with Short Stitch through an explicit replace', () => {
    const full: Loadout = ['long_silk', 'glass_lantern'];
    expect(applyDraft(full, 'short_stitch')).toEqual({ ok: false, reason: 'slotsFull' });
    expect(applyDraft(full, 'short_stitch', 1)).toEqual({ ok: false, reason: 'incompatible' });
    expect(applyDraft(full, 'short_stitch', 0)).toEqual({ ok: true, loadout: ['short_stitch', 'glass_lantern'], replaced: 'long_silk' });
    expect(replaceOptions(full, 'short_stitch')).toEqual([0]);
    expect(replaceOptions(full, 'mourning_bell')).toEqual([0, 1]);
    expect(replaceOptions(full, 'long_silk')).toEqual([]);
  });

  it('rejects bad replace indices and duplicates', () => {
    expect(applyDraft(['needlesong', 'glass_lantern'], 'mourning_bell', 2)).toEqual({ ok: false, reason: 'badReplaceIndex' });
    expect(applyDraft(['needlesong', 'glass_lantern'], 'mourning_bell', 0.5)).toEqual({ ok: false, reason: 'badReplaceIndex' });
    expect(applyDraft(['needlesong'], 'needlesong')).toEqual({ ok: false, reason: 'duplicate' });
    expect(applyDraft(['needlesong'], 'bogus' as RelicId)).toEqual({ ok: false, reason: 'unknownRelic' });
    expect(applyDraft(['needlesong'], 'mourning_bell', 0)).toEqual({ ok: false, reason: 'slotFree' });
  });

  it('never produces an illegal loadout across every pick from every legal state', () => {
    const states: Loadout[] = [[], ...RELIC_IDS.map((id) => [id] as Loadout), ...legalPairs().map((p) => [...p] as Loadout)];
    for (const loadout of states) {
      for (const pick of RELIC_IDS) {
        for (const idx of [undefined, -1, 0, 1, 2]) {
          const result = applyDraft(loadout, pick, idx);
          if (result.ok) {
            expect(isLegalLoadout(result.loadout)).toBe(true);
            expect(result.loadout.length).toBeLessThanOrEqual(MAX_RELIC_SLOTS);
            expect(result.loadout).toContain(pick);
          }
        }
      }
    }
  });
});

describe('room parameters and hooks', () => {
  it('applies Long Silk and Short Stitch reach tradeoffs', () => {
    expect(roomParamsFor([], BASE)).toEqual(BASE);
    const silk = roomParamsFor(['long_silk', 'needlesong'], BASE);
    expect(silk.tetherCapacity).toBe(8);
    expect(silk.soulSpeed).toBeCloseTo(1.6);
    const stitch = roomParamsFor(['short_stitch'], BASE);
    expect(stitch.tetherCapacity).toBe(4.5);
    expect(stitch.soulSpeed).toBeCloseTo(2.5);
    expect(stitch.dashMaxDistance).toBe(3);
  });

  it('exposes behavioural hook data only for equipped relics', () => {
    expect(simHooksFor([])).toEqual({});
    const hooks = simHooksFor(['needlesong', 'travelers_knot']);
    expect(Object.keys(hooks).sort()).toEqual(['needlesong', 'travelersKnot']);
    expect(hooks.needlesong?.boostMultiplier).toBeGreaterThan(1);
    expect(simHooksFor(['mourning_bell']).mourningBell?.killsPerCharge).toBe(2);
    expect(simHooksFor(['glass_lantern']).glassLantern?.slowFactor).toBeLessThan(1);
  });

  it('clamps carried charges to the loadout', () => {
    expect(normalizeCharges([], { bellKills: 1, bellCharged: true, knotMarked: true })).toEqual(EMPTY_CHARGES);
    expect(normalizeCharges(['mourning_bell'], { bellKills: 7, bellCharged: true, knotMarked: true })).toEqual({
      bellKills: 1,
      bellCharged: true,
      knotMarked: false,
    });
    expect(normalizeCharges(['travelers_knot'], { bellKills: Number.NaN, bellCharged: false, knotMarked: true }).knotMarked).toBe(true);
  });
});

describe('starters', () => {
  it('offers two sidegrade starters drawn from the pool', () => {
    expect(STARTER_IDS).toEqual(['threadkeeper', 'long_reach']);
    expect(STARTERS.threadkeeper.relic).toBe('needlesong');
    expect(STARTERS.long_reach.relic).toBe('long_silk');
    expect(STARTERS.threadkeeper.family).not.toBe(STARTERS.long_reach.family);
  });
});

describe('run rng', () => {
  it('is deterministic and in range', () => {
    const a = new RunRandom(42);
    const b = new RunRandom(42);
    const seqA = Array.from({ length: 50 }, () => a.float());
    const seqB = Array.from({ length: 50 }, () => b.float());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(nextRandom(1).state).toBe(nextRandom(1).state);
    expect(new RunRandom(7).shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('derives distinct stable sub-seeds per label', () => {
    expect(hashSeed(1, 'n1a')).toBe(hashSeed(1, 'n1a'));
    expect(hashSeed(1, 'n1a')).not.toBe(hashSeed(1, 'n1b'));
    expect(hashSeed(1, 'n1a')).not.toBe(hashSeed(2, 'n1a'));
  });
});
