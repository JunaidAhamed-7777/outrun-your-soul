/**
 * What the station/draft panel may offer, DOM-free. Mirrors the loadout contract:
 * two slots maximum (never a third), no duplicates, no incompatible pair (Long Silk
 * with Short Stitch); a free slot is filled before anything is replaced. The run layer
 * re-validates every pick; this only decides what to show enabled and why.
 */
export interface RelicView {
  readonly id: string;
  readonly name: string;
  readonly rule: string;
  /** Counterexample one-liner: when this relic hurts. */
  readonly cost: string;
}

export interface DraftView {
  readonly stationName: string;
  readonly healed: number;
  readonly offer: readonly RelicView[];
  readonly equipped: readonly RelicView[];
  readonly slotsFree: number;
  readonly mustReplace: boolean;
  readonly incompatible: Readonly<Record<string, readonly string[]>>;
}

export const MAX_SLOTS = 2;

export interface ReplaceOption {
  readonly index: number;
  readonly drop: RelicView;
  readonly enabled: boolean;
  readonly reason?: string;
}

export interface OfferOption {
  readonly relic: RelicView;
  readonly mode: 'take' | 'replace' | 'blocked';
  readonly reason?: string;
  /** Present in replace mode: one entry per equipped relic. */
  readonly replace: readonly ReplaceOption[];
}

function clash(a: string, b: string, inc: DraftView['incompatible']): boolean {
  return Boolean(inc[a]?.includes(b) || inc[b]?.includes(a));
}

const conflictText = (pick: RelicView, other: RelicView): string =>
  `${pick.name} cannot be carried with ${other.name}.`;

/** Free slots actually available: never more than the two-slot ceiling allows. */
export function freeSlots(view: Pick<DraftView, 'slotsFree' | 'equipped'>): number {
  const ceiling = Math.max(0, MAX_SLOTS - view.equipped.length);
  const declared = Number.isFinite(view.slotsFree) ? Math.floor(view.slotsFree) : 0;
  return Math.max(0, Math.min(declared, ceiling));
}

export function isReplaceMode(view: Pick<DraftView, 'slotsFree' | 'equipped' | 'mustReplace'>): boolean {
  return view.mustReplace || freeSlots(view) === 0;
}

export function draftOptions(view: DraftView): OfferOption[] {
  const replaceMode = isReplaceMode(view);
  return view.offer.map((relic): OfferOption => {
    if (view.equipped.some((e) => e.id === relic.id)) {
      return { relic, mode: 'blocked', reason: 'Already carried.', replace: [] };
    }
    if (!replaceMode) {
      const conflict = view.equipped.find((e) => clash(relic.id, e.id, view.incompatible));
      return conflict
        ? { relic, mode: 'blocked', reason: conflictText(relic, conflict), replace: [] }
        : { relic, mode: 'take', replace: [] };
    }
    const replace = view.equipped.map((drop, index): ReplaceOption => {
      const conflict = view.equipped.find((e, k) => k !== index && clash(relic.id, e.id, view.incompatible));
      return conflict ? { index, drop, enabled: false, reason: conflictText(relic, conflict) } : { index, drop, enabled: true };
    });
    const firstReason = replace.find((r) => !r.enabled)?.reason;
    if (replace.some((r) => r.enabled)) return { relic, mode: 'replace', replace };
    return { relic, mode: 'blocked', reason: firstReason ?? 'No relic can be set down for this one.', replace };
  });
}

/** Slots to draw: equipped relics, then empty slots, never more than MAX_SLOTS. */
export function slotLayout(view: Pick<DraftView, 'slotsFree' | 'equipped'>): (RelicView | null)[] {
  const shown: (RelicView | null)[] = view.equipped.slice(0, MAX_SLOTS);
  for (let i = 0; i < freeSlots(view) && shown.length < MAX_SLOTS; i++) shown.push(null);
  return shown;
}
