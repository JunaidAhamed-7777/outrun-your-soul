import { describe, expect, it } from 'vitest';
import { RELICS } from '../../src/run/relics';
import { draftOptions, freeSlots, isReplaceMode, slotLayout, type DraftView, type RelicView } from '../../src/ui/draft-logic';

const view = (id: keyof typeof RELICS): RelicView => ({
  id,
  name: RELICS[id].name,
  rule: RELICS[id].rule,
  cost: RELICS[id].counterexample,
});

const incompatible = Object.fromEntries(Object.values(RELICS).map((r) => [r.id, [...r.incompatible]]));

const base = (over: Partial<DraftView>): DraftView => ({
  stationName: 'Signal Box',
  healed: 1,
  offer: [],
  equipped: [],
  slotsFree: 1,
  mustReplace: false,
  incompatible,
  ...over,
});

describe('draft options', () => {
  it('takes into a free slot when legal', () => {
    const opts = draftOptions(base({ equipped: [view('needlesong')], offer: [view('mourning_bell')] }));
    expect(opts[0]?.mode).toBe('take');
  });

  it('blocks Short Stitch while Long Silk is carried and a slot is free (never replaces while a slot is free)', () => {
    const opts = draftOptions(base({ equipped: [view('long_silk')], offer: [view('short_stitch')] }));
    expect(opts[0]?.mode).toBe('blocked');
    expect(opts[0]?.reason).toBe('Short Stitch cannot be carried with Long Silk.');
  });

  it('offers explicit keep-or-replace when slots are full', () => {
    const opts = draftOptions(
      base({ equipped: [view('needlesong'), view('long_silk')], slotsFree: 0, mustReplace: true, offer: [view('mourning_bell')] }),
    );
    expect(opts[0]?.mode).toBe('replace');
    expect(opts[0]?.replace.map((r) => [r.drop.id, r.enabled])).toEqual([
      ['needlesong', true],
      ['long_silk', true],
    ]);
  });

  it('only lets Short Stitch replace Long Silk, never sit beside it', () => {
    const opts = draftOptions(
      base({ equipped: [view('needlesong'), view('long_silk')], slotsFree: 0, mustReplace: true, offer: [view('short_stitch')] }),
    );
    const replace = opts[0]?.replace ?? [];
    expect(opts[0]?.mode).toBe('replace');
    expect(replace[0]).toMatchObject({ enabled: false, reason: 'Short Stitch cannot be carried with Long Silk.' });
    expect(replace[1]).toMatchObject({ enabled: true });
  });

  it('marks an already carried relic as blocked', () => {
    const opts = draftOptions(base({ equipped: [view('needlesong')], offer: [view('needlesong')] }));
    expect(opts[0]).toMatchObject({ mode: 'blocked', reason: 'Already carried.' });
  });

  it('never offers a third slot even if the view claims one', () => {
    const v = base({ equipped: [view('needlesong'), view('glass_lantern')], slotsFree: 3, offer: [view('mourning_bell')] });
    expect(freeSlots(v)).toBe(0);
    expect(isReplaceMode(v)).toBe(true);
    expect(draftOptions(v)[0]?.mode).toBe('replace');
    expect(slotLayout(v)).toHaveLength(2);
  });

  it('draws equipped relics then empty slots, capped at two', () => {
    expect(slotLayout(base({ equipped: [view('needlesong')], slotsFree: 1 })).map((s) => s?.id ?? null)).toEqual([
      'needlesong',
      null,
    ]);
    expect(slotLayout(base({ equipped: [], slotsFree: 5 }))).toEqual([null, null]);
  });

  it('respects incompatibility declared from either side', () => {
    const opts = draftOptions(
      base({ equipped: [view('short_stitch')], offer: [view('long_silk')], incompatible: { long_silk: ['short_stitch'] } }),
    );
    expect(opts[0]?.mode).toBe('blocked');
  });
});
