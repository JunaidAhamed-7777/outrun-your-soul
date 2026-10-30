/** Lab-only fixtures for the run panels, built from the static relic and starter data. */
import { RELICS, STARTERS, type RelicId } from '../../run/relics';
import type { DraftView, RelicView } from '../draft-logic';
import type { EndingView, RouteChoice, StarterOption } from '../run-panels';
import type { LoadoutChip } from '../ui';

export const relicView = (id: RelicId): RelicView => ({
  id,
  name: RELICS[id].name,
  rule: RELICS[id].rule,
  cost: RELICS[id].counterexample,
});

export const INCOMPATIBLE: Record<string, string[]> = Object.fromEntries(
  Object.values(RELICS).map((r) => [r.id, [...r.incompatible]]),
);

export function starterOptions(lockSecond = false): StarterOption[] {
  return Object.values(STARTERS).map((s, i) => ({
    id: s.id,
    name: s.name,
    flavour: s.flavour,
    relicName: RELICS[s.relic].name,
    relicRule: RELICS[s.relic].rule,
    locked: lockSecond && i === 1,
    lockHint: 'Reach the Last Platform once to unlock.',
  }));
}

export const ROUTES: RouteChoice[] = [
  { id: 'needle_gallery', roomName: 'Needle Gallery', blurb: 'Cover splits a firing line from a longer flank.', tags: ['Needlers', 'Cover'] },
  { id: 'glass_crossing', roomName: 'Glass Crossing', blurb: 'A timed lane crosses the route your soul must walk.', tags: ['Lane', 'Keeper'] },
];

export const DRAFT_FREE: DraftView = {
  stationName: 'Signal Box',
  healed: 1,
  offer: [relicView('mourning_bell'), relicView('glass_lantern'), relicView('short_stitch')],
  equipped: [relicView('long_silk')],
  slotsFree: 1,
  mustReplace: false,
  incompatible: INCOMPATIBLE,
};

export const DRAFT_FULL: DraftView = {
  stationName: 'Lamp Room',
  healed: 1,
  offer: [relicView('short_stitch'), relicView('travelers_knot'), relicView('needlesong')],
  equipped: [relicView('needlesong'), relicView('long_silk')],
  slotsFree: 0,
  mustReplace: true,
  incompatible: INCOMPATIBLE,
};

export function ending(escaped: boolean): EndingView {
  return {
    escaped,
    seconds: escaped ? 731.4 : 402.8,
    roomsCleared: escaped ? 6 : 3,
    relics: escaped ? [relicView('needlesong'), relicView('mourning_bell')] : [relicView('long_silk')],
    starterName: escaped ? 'Threadkeeper' : 'Long Reach',
    discoveries: escaped ? ['Mourner’s Garden', 'Mourning Bell', 'Long Reach start'] : [],
  };
}

export const LOADOUTS: Record<string, LoadoutChip[]> = {
  starter: [{ id: 'needlesong', name: 'Needlesong' }],
  boosting: [{ id: 'needlesong', name: 'Needlesong', active: true }, { id: 'glass_lantern', name: 'Glass Lantern' }],
  bellHalf: [{ id: 'long_silk', name: 'Long Silk' }, { id: 'mourning_bell', name: 'Mourning Bell', charge: 1, maxCharge: 2 }],
  bellFull: [{ id: 'mourning_bell', name: 'Mourning Bell', charge: 2, maxCharge: 2 }, { id: 'travelers_knot', name: "Traveler's Knot", charge: 1, maxCharge: 1 }],
  none: [],
};
