/** Authored room templates by stable ID. A pool, not a fixed sequence (CONTENT.md). */
import type { RoomDef } from '../../sim/types';
import { DEPARTURE_COURT } from './departure-court';
import { GLASS_CROSSING } from './glass-crossing';

export { DEPARTURE_COURT } from './departure-court';
export { GLASS_CROSSING } from './glass-crossing';
export { validateRoom, reachablePoints } from './validate';

export const ROOMS: Readonly<Record<string, RoomDef>> = {
  [DEPARTURE_COURT.id]: DEPARTURE_COURT,
  [GLASS_CROSSING.id]: GLASS_CROSSING,
};

/** The room a fresh expedition starts in. */
export const FIRST_ROOM_ID = DEPARTURE_COURT.id;
