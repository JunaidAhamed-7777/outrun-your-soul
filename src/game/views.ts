/**
 * Pure view-model builders: run-layer state -> the plain shapes the UI panels render.
 * Keeps src/ui free of run logic and the game wiring free of formatting.
 */
import {
  isStarterUnlocked,
  RELICS,
  RUN_TUNING,
  STARTER_IDS,
  STARTERS,
  type ProgressState,
  type RelicId,
  type RouteChoice as RunChoice,
  type RunState,
} from '../run';
import type { SimState } from '../sim/types';
import type { DraftView, EndingView, LoadoutChip, RelicView, RouteChoice, StarterOption } from '../ui/ui';
import { roomMeta } from './room-meta';
import type { Screen } from './director';

export function relicView(id: RelicId): RelicView {
  const r = RELICS[id];
  return { id, name: r.name, rule: r.rule, cost: r.counterexample };
}

export function starterOptions(progress: ProgressState): StarterOption[] {
  return STARTER_IDS.map((id) => {
    const s = STARTERS[id];
    const relic = RELICS[s.relic];
    const locked = !isStarterUnlocked(progress, id);
    return {
      id,
      name: s.name,
      flavour: s.flavour,
      relicName: relic.name,
      relicRule: relic.rule,
      relicId: s.relic,
      locked,
      ...(locked ? { lockHint: 'Reach the Signal House once to unlock.' } : {}),
    };
  });
}

export function routeChoices(choices: readonly RunChoice[]): RouteChoice[] {
  return choices.map((c) => {
    if (c.roomId) {
      const meta = roomMeta(c.roomId);
      return { id: c.id, roomName: meta.name, blurb: meta.blurb, tags: [...meta.tags] };
    }
    return { id: c.id, roomName: c.label, blurb: c.kind === 'station' ? 'A safe platform. Rest and choose a relic.' : '', tags: [c.kind] };
  });
}

export function draftView(screen: Extract<Screen, { kind: 'station' }>): DraftView {
  const { run, draft, label } = screen;
  const incompatible: Record<string, string[]> = {};
  for (const id of draft.offer) incompatible[id] = [...RELICS[id].incompatible];
  const slotsFree = Math.max(0, 2 - run.loadout.length);
  return {
    stationName: label,
    healed: run.health < run.maxHealth ? RUN_TUNING.stationHeal : 0,
    offer: draft.offer.map(relicView),
    equipped: run.loadout.map(relicView),
    slotsFree,
    mustReplace: slotsFree === 0,
    incompatible,
  };
}

/** Relic chips for the HUD, with live charge/boost state from the simulation. */
export function loadoutChips(run: RunState | null, sim: SimState | null): LoadoutChip[] {
  if (!run) return [];
  const relics = sim?.relicState;
  return run.loadout.map((id) => {
    const name = RELICS[id].name;
    switch (id) {
      case 'needlesong':
        return { id, name, active: (sim?.soul.boostLeft ?? 0) > 0 };
      case 'mourning_bell':
        return { id, name, charge: relics?.bellCharge ?? 0, maxCharge: relics?.bellChargeMax ?? 1 };
      case 'travelers_knot':
        return { id, name, charge: relics?.knotReady || relics?.decoy ? 1 : 0, maxCharge: 1 };
      default:
        return { id, name };
    }
  });
}

export function endingView(run: RunState, before: ProgressState, after: ProgressState): EndingView {
  const fresh = <T extends string>(was: readonly T[], now: readonly T[]) => now.filter((id) => !was.includes(id));
  const discoveries = [
    ...fresh(before.atlas.relicsSeen, after.atlas.relicsSeen).map((id) => RELICS[id].name),
    ...fresh(before.atlas.roomsCleared, after.atlas.roomsCleared).map((id) => roomMeta(id).name),
    ...fresh(before.atlas.startersUnlocked, after.atlas.startersUnlocked).map((id) => `${STARTERS[id].name} start`),
  ];
  return {
    escaped: run.outcome === 'victory',
    seconds: run.totals.roomSeconds,
    roomsCleared: run.totals.roomsCleared,
    relics: run.loadout.map(relicView),
    starterName: STARTERS[run.starter].name,
    discoveries,
  };
}

/** Short description of a saved room for the Continue button. */
export function continueDetail(screen: Screen | null): string | undefined {
  if (!screen || screen.kind !== 'room') return undefined;
  return `${roomMeta(screen.entry.roomId).name} · ${screen.entry.health} health`;
}
