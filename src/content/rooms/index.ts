/**
 * Authored room templates by stable ID. A pool, not a fixed sequence (CONTENT.md).
 *
 * Each template has up to RUN_TUNING.roomVariants authored variants; every variant
 * shares the template's room ID (saves and the expedition graph refer to template
 * IDs) and differs in layout, schedule and display name. `roomFor` resolves the
 * expedition's (template, variant) pair, falling back to variant 0.
 */
import type { RoomDef } from '../../sim/types';
import { DEPARTURE_COURT } from './departure-court';
import { GLASS_CROSSING } from './glass-crossing';
import { GLASS_CROSSING_B } from './glass-crossing-b';
import { LAST_PLATFORM, LAST_PLATFORM_LONG_CHAIN, LAST_PLATFORM_WARDEN } from './last-platform';
import { LAST_WARDEN_ARENA } from './last-warden';
import { MOURNERS_GARDEN, MOURNERS_GARDEN_VIGIL, MOURNERS_GARDEN_WARDEN } from './mourners-garden';
import { NEEDLE_GALLERY, NEEDLE_GALLERY_CROSSFIRE } from './needle-gallery';
import { SILK_CLOISTER, SILK_CLOISTER_ARCADE } from './silk-cloister';

export { DEPARTURE_COURT } from './departure-court';
export { GLASS_CROSSING } from './glass-crossing';
export { GLASS_CROSSING_B } from './glass-crossing-b';
export { NEEDLE_GALLERY, NEEDLE_GALLERY_CROSSFIRE } from './needle-gallery';
export { SILK_CLOISTER, SILK_CLOISTER_ARCADE } from './silk-cloister';
export { MOURNERS_GARDEN, MOURNERS_GARDEN_VIGIL, MOURNERS_GARDEN_WARDEN } from './mourners-garden';
export { LAST_PLATFORM, LAST_PLATFORM_LONG_CHAIN, LAST_PLATFORM_WARDEN } from './last-platform';
export { LAST_WARDEN_ARENA } from './last-warden';
export { validateRoom, reachablePoints } from './validate';

/** Playable variants per template ID (index = RoomEntry.variant). */
export const ROOM_VARIANTS: Readonly<Record<string, readonly RoomDef[]>> = {
  departure_court: [DEPARTURE_COURT],
  needle_gallery: [NEEDLE_GALLERY, NEEDLE_GALLERY_CROSSFIRE],
  silk_cloister: [SILK_CLOISTER, SILK_CLOISTER_ARCADE],
  glass_crossing: [GLASS_CROSSING, GLASS_CROSSING_B],
  mourners_garden: [MOURNERS_GARDEN, MOURNERS_GARDEN_VIGIL],
  last_platform: [LAST_PLATFORM, LAST_PLATFORM_LONG_CHAIN],
  last_warden: [LAST_WARDEN_ARENA],
};

/**
 * Warden layouts authored ahead of the warden role. NOT playable yet: createSim throws
 * on wardens and validateRoom rejects them. Once the simulation implements wardens,
 * append these to ROOM_VARIANTS (e.g. as each template's second variant).
 */
export const PENDING_WARDEN_ROOMS: Readonly<Record<string, readonly RoomDef[]>> = {
  mourners_garden: [MOURNERS_GARDEN_WARDEN],
  last_platform: [LAST_PLATFORM_WARDEN],
};

/** The first variant of every template, by ID. */
export const ROOMS: Readonly<Record<string, RoomDef>> = Object.fromEntries(
  Object.entries(ROOM_VARIANTS).map(([id, variants]) => [id, variants[0]!]),
);

/** Every playable variant, in registry order (for validation and evidence runs). */
export const ALL_ROOM_VARIANTS: readonly RoomDef[] = Object.values(ROOM_VARIANTS).flat();

/** The room a fresh expedition starts in. */
export const FIRST_ROOM_ID = DEPARTURE_COURT.id;

/** Resolve an expedition room. Unknown template IDs throw; unknown variants use variant 0. */
export function roomFor(templateId: string, variant: number): RoomDef {
  const variants = ROOM_VARIANTS[templateId];
  if (!variants || variants.length === 0) throw new Error(`unknown room template '${templateId}'`);
  return (Number.isInteger(variant) && variant >= 0 ? variants[variant] : undefined) ?? variants[0]!;
}
