/**
 * The six relic rules, loadout legality and the room parameters/simulation hooks a
 * loadout produces. Rules text follows docs/CONTENT.md and docs/ROADMAP.md section 2.
 * Numbers marked PROVISIONAL are untested starting values, not balance.
 */
import type { RoomParams } from '../sim/types';

export const RELIC_IDS = [
  'needlesong',
  'glass_lantern',
  'long_silk',
  'short_stitch',
  'mourning_bell',
  'travelers_knot',
] as const;
export type RelicId = (typeof RELIC_IDS)[number];

/** Two equipped slots maximum, including the starter relic. */
export const MAX_RELIC_SLOTS = 2;

export type RelicFamily = 'interception' | 'reach' | 'reunion';

export interface RelicDef {
  readonly id: RelicId;
  readonly name: string;
  readonly family: RelicFamily;
  /** One line for the draft/loadout UI. */
  readonly rule: string;
  readonly trigger: string;
  readonly effect: string;
  readonly cap: string;
  readonly incompatible: readonly RelicId[];
  /** What a room-entry checkpoint must remember for this relic. */
  readonly savedState: string;
  /** How the player sees the relic's live state. */
  readonly indicator: string;
  /** When the relic hurts: why it is a sidegrade, not an upgrade. */
  readonly counterexample: string;
}

export const RELICS: Readonly<Record<RelicId, RelicDef>> = {
  needlesong: {
    id: 'needlesong',
    name: 'Needlesong',
    family: 'interception',
    rule: 'Cutting a hostile bolt briefly hurries your soul along its path.',
    trigger: 'An outward dash cuts a real hostile projectile.',
    effect: 'Soul speed is multiplied for a short time on its existing route; a new cut refreshes the timer, never stacks the multiplier.',
    cap: 'One active boost; refresh only.',
    incompatible: [],
    savedState: 'None at room entry (boost is mid-room only).',
    indicator: 'Soul trail brightens and the arrival forecast updates immediately.',
    counterexample: 'Earlier arrival can carry the soul into a lane that slow arrival would have avoided; no cuttable bolts means no boost.',
  },
  glass_lantern: {
    id: 'glass_lantern',
    name: 'Glass Lantern',
    family: 'interception',
    rule: 'Hostile bolts slow down inside a visible halo around your soul.',
    trigger: 'A hostile bolt is inside the soul halo.',
    effect: 'Bolt speed is reduced while inside the halo and restored outside it.',
    cap: 'One halo of fixed radius; never affects environmental lanes.',
    incompatible: [],
    savedState: 'None (the halo is live geometry only).',
    indicator: 'A pale halo ring around the soul whose edge is the exact speed boundary.',
    counterexample: 'A slowed bolt occupies its line longer and can make RETURN through it more dangerous; lanes and body threats are unaffected.',
  },
  long_silk: {
    id: 'long_silk',
    name: 'Long Silk',
    family: 'reach',
    rule: 'Two more tiles of thread; your soul follows 20% slower.',
    trigger: 'Always on.',
    effect: 'Tether capacity +2 tiles; soul speed x0.8.',
    cap: 'Cannot be equipped with Short Stitch.',
    incompatible: ['short_stitch'],
    savedState: 'None (applies at room entry).',
    indicator: 'Longer thread meter; the soul moves visibly slower.',
    counterexample: 'Narrow crossings with recurring lanes punish the longer, slower backlog.',
  },
  short_stitch: {
    id: 'short_stitch',
    name: 'Short Stitch',
    family: 'reach',
    rule: 'Less thread, but your soul follows faster.',
    trigger: 'Always on.',
    effect: 'Tether capacity -1.5 tiles; soul speed x1.25 (provisional).',
    cap: 'Cannot be equipped with Long Silk.',
    incompatible: ['long_silk'],
    savedState: 'None (applies at room entry).',
    indicator: 'Shorter thread meter; the soul moves visibly faster.',
    counterexample: 'Some wide flanks become unreachable without an extra stop or a different route.',
  },
  mourning_bell: {
    id: 'mourning_bell',
    name: 'Mourning Bell',
    family: 'reunion',
    rule: 'Two dash kills charge a burst that rings out at your next reunion.',
    trigger: 'Two distinct enemies killed directly by outward dashes.',
    effect: 'One burst at the reunion point at the next separated-to-reunited transition; the charge is consumed once.',
    cap: 'One stored charge; burst kills never recharge it.',
    incompatible: [],
    savedState: 'Kills counted toward the next charge, and whether a charge is held.',
    indicator: 'Bell pips near the health marks; a ringing outline on the soul when charged.',
    counterexample: 'Reuniting early or in the wrong place wastes the burst; chasing a perfect meeting point exposes the soul.',
  },
  travelers_knot: {
    id: 'travelers_knot',
    name: "Traveler's Knot",
    family: 'reunion',
    rule: 'A dash kill leaves a decoy at your next reunion that draws the next new aim.',
    trigger: 'A direct outward-dash kill; the decoy is placed at the next reunion.',
    effect: 'The next NEW aim acquisition targets the decoy and consumes it when that aim locks; the locked line is kept.',
    cap: 'At most one unspent mark or active decoy.',
    incompatible: [],
    savedState: 'Whether an earned, not yet placed mark is held.',
    indicator: 'A small knot icon on the soul while a mark is held; a knot marker on the ground for an active decoy.',
    counterexample: 'Never retargets a locked warning or fired bolt, does not block the shot, and draws fire to the same spot a Mourning Bell reunion wants.',
  },
};

/** Ordered, duplicate-free list of equipped relic IDs (starter first). */
export type Loadout = readonly RelicId[];

export function isRelicId(value: unknown): value is RelicId {
  return typeof value === 'string' && (RELIC_IDS as readonly string[]).includes(value);
}

export function areCompatible(a: RelicId, b: RelicId): boolean {
  return a !== b && !RELICS[a].incompatible.includes(b) && !RELICS[b].incompatible.includes(a);
}

export function isLegalLoadout(loadout: readonly unknown[]): loadout is Loadout {
  if (loadout.length > MAX_RELIC_SLOTS) return false;
  if (!loadout.every(isRelicId)) return false;
  for (let i = 0; i < loadout.length; i++) {
    for (let j = i + 1; j < loadout.length; j++) {
      if (!areCompatible(loadout[i] as RelicId, loadout[j] as RelicId)) return false;
    }
  }
  return true;
}

/** Every legal unordered pair, in RELIC_IDS order. Six relics, one excluded pair: fourteen. */
export function legalPairs(): Array<readonly [RelicId, RelicId]> {
  const out: Array<readonly [RelicId, RelicId]> = [];
  for (let i = 0; i < RELIC_IDS.length; i++) {
    for (let j = i + 1; j < RELIC_IDS.length; j++) {
      const a = RELIC_IDS[i] as RelicId;
      const b = RELIC_IDS[j] as RelicId;
      if (areCompatible(a, b)) out.push([a, b] as const);
    }
  }
  return out;
}

/** Slot indices the pick may legally replace in a full loadout (empty when none). */
export function replaceOptions(loadout: Loadout, pick: RelicId): number[] {
  if (loadout.includes(pick)) return [];
  const out: number[] = [];
  for (let i = 0; i < loadout.length; i++) {
    const next = loadout.map((id, k) => (k === i ? pick : id));
    if (isLegalLoadout(next)) out.push(i);
  }
  return out;
}

/** True when the pick can be added to a free slot without replacing anything. */
export function canAdd(loadout: Loadout, pick: RelicId): boolean {
  return loadout.length < MAX_RELIC_SLOTS && isLegalLoadout([...loadout, pick]);
}

export type DraftResult =
  | { readonly ok: true; readonly loadout: Loadout; readonly replaced: RelicId | null }
  | {
      readonly ok: false;
      readonly reason: 'duplicate' | 'incompatible' | 'slotsFull' | 'slotFree' | 'badReplaceIndex' | 'unknownRelic';
    };

/**
 * Apply a draft pick. With a free slot the pick is added (replaceIndex must be omitted);
 * with full slots a replaceIndex is required (the first draft fills the empty slot; it
 * never replaces while a slot is free). Never creates a third slot, a duplicate or
 * an illegal pair: such requests are rejected, leaving the loadout unchanged.
 */
export function applyDraft(loadout: Loadout, pick: RelicId, replaceIndex?: number): DraftResult {
  if (!isRelicId(pick)) return { ok: false, reason: 'unknownRelic' };
  if (loadout.includes(pick)) return { ok: false, reason: 'duplicate' };
  if (replaceIndex === undefined) {
    if (loadout.length >= MAX_RELIC_SLOTS) return { ok: false, reason: 'slotsFull' };
    const next = [...loadout, pick];
    return isLegalLoadout(next) ? { ok: true, loadout: next, replaced: null } : { ok: false, reason: 'incompatible' };
  }
  if (loadout.length < MAX_RELIC_SLOTS) return { ok: false, reason: 'slotFree' };
  if (!Number.isInteger(replaceIndex) || replaceIndex < 0 || replaceIndex >= loadout.length) {
    return { ok: false, reason: 'badReplaceIndex' };
  }
  const next = loadout.map((id, k) => (k === replaceIndex ? pick : id));
  if (!isLegalLoadout(next)) return { ok: false, reason: 'incompatible' };
  return { ok: true, loadout: next, replaced: loadout[replaceIndex] as RelicId };
}

// ---------------------------------------------------------------------------
// Room parameters and simulation hook data
// ---------------------------------------------------------------------------

/** PROVISIONAL reach-family modifiers. */
export const REACH_TUNING = {
  longSilk: { capacityDelta: 2, soulSpeedFactor: 0.8 },
  shortStitch: { capacityDelta: -1.5, soulSpeedFactor: 1.25 },
} as const;

/** Room-entry parameters for a loadout. Only reach relics change the base numbers. */
export function roomParamsFor(loadout: Loadout, base: RoomParams): RoomParams {
  let soulSpeed = base.soulSpeed;
  let tetherCapacity = base.tetherCapacity;
  if (loadout.includes('long_silk')) {
    tetherCapacity += REACH_TUNING.longSilk.capacityDelta;
    soulSpeed *= REACH_TUNING.longSilk.soulSpeedFactor;
  }
  if (loadout.includes('short_stitch')) {
    tetherCapacity += REACH_TUNING.shortStitch.capacityDelta;
    soulSpeed *= REACH_TUNING.shortStitch.soulSpeedFactor;
  }
  return { soulSpeed, tetherCapacity, dashMaxDistance: base.dashMaxDistance };
}

/**
 * Data the simulation needs to implement behavioural relics. Absent keys mean the relic
 * is not equipped. All numbers PROVISIONAL; the simulation must read them from here
 * rather than hard-coding its own copies.
 */
export interface RelicSimHooks {
  readonly needlesong?: { readonly boostMultiplier: number; readonly boostSeconds: number };
  readonly glassLantern?: { readonly haloRadius: number; readonly slowFactor: number };
  readonly mourningBell?: { readonly killsPerCharge: number; readonly maxCharges: number; readonly burstRadius: number };
  readonly travelersKnot?: { readonly maxMarks: number; readonly decoyRadius: number };
}

export const RELIC_SIM_TUNING = {
  needlesong: { boostMultiplier: 1.8, boostSeconds: 1.2 },
  glassLantern: { haloRadius: 1.4, slowFactor: 0.45 },
  mourningBell: { killsPerCharge: 2, maxCharges: 1, burstRadius: 1.6 },
  travelersKnot: { maxMarks: 1, decoyRadius: 0.3 },
} as const;

export function simHooksFor(loadout: Loadout): RelicSimHooks {
  return {
    ...(loadout.includes('needlesong') ? { needlesong: RELIC_SIM_TUNING.needlesong } : {}),
    ...(loadout.includes('glass_lantern') ? { glassLantern: RELIC_SIM_TUNING.glassLantern } : {}),
    ...(loadout.includes('mourning_bell') ? { mourningBell: RELIC_SIM_TUNING.mourningBell } : {}),
    ...(loadout.includes('travelers_knot') ? { travelersKnot: RELIC_SIM_TUNING.travelersKnot } : {}),
  };
}

// ---------------------------------------------------------------------------
// Relic charge state carried between rooms
// ---------------------------------------------------------------------------

/**
 * Earned relic state recorded at a room-entry checkpoint. Spatial state (an active decoy,
 * a burst position) never crosses rooms; only counts and held marks do.
 */
export interface RelicCharges {
  /** Mourning Bell: distinct dash kills counted toward the next charge. */
  readonly bellKills: number;
  /** Mourning Bell: a charge waiting for the next reunion. */
  readonly bellCharged: boolean;
  /** Traveler's Knot: an earned mark not yet placed as a decoy. */
  readonly knotMarked: boolean;
}

export const EMPTY_CHARGES: RelicCharges = Object.freeze({ bellKills: 0, bellCharged: false, knotMarked: false });

/** Clamp reported charges to what the loadout can legally hold. */
export function normalizeCharges(loadout: Loadout, charges: RelicCharges): RelicCharges {
  const bell = loadout.includes('mourning_bell');
  const knot = loadout.includes('travelers_knot');
  const perCharge = RELIC_SIM_TUNING.mourningBell.killsPerCharge;
  const kills = Number.isFinite(charges.bellKills) ? Math.floor(charges.bellKills) : 0;
  return {
    bellKills: bell ? Math.min(Math.max(kills, 0), perCharge - 1) : 0,
    bellCharged: bell && charges.bellCharged === true,
    knotMarked: knot && charges.knotMarked === true,
  };
}

// ---------------------------------------------------------------------------
// Starters: sidegrade kits drawn from the same pool
// ---------------------------------------------------------------------------

export const STARTER_IDS = ['threadkeeper', 'long_reach'] as const;
export type StarterId = (typeof STARTER_IDS)[number];

export interface StarterDef {
  readonly id: StarterId;
  readonly name: string;
  readonly relic: RelicId;
  readonly flavour: string;
  readonly family: RelicFamily;
}

export const STARTERS: Readonly<Record<StarterId, StarterDef>> = {
  threadkeeper: {
    id: 'threadkeeper',
    name: 'Threadkeeper',
    relic: 'needlesong',
    family: 'interception',
    flavour: 'Cut the needle out of the air, and your soul hurries home.',
  },
  long_reach: {
    id: 'long_reach',
    name: 'Long Reach',
    relic: 'long_silk',
    family: 'reach',
    flavour: 'More thread, wider flanks, and a slower soul trailing behind.',
  },
};

export function isStarterId(value: unknown): value is StarterId {
  return typeof value === 'string' && (STARTER_IDS as readonly string[]).includes(value);
}
