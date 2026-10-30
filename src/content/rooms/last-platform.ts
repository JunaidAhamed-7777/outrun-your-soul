/**
 * Last Platform (CONTENT.md template 6): familiar roles combine around cover and a
 * limited opening. Everything north must be reached through the opening, and the soul
 * must follow you through it. Preserve rescue capacity (short outings, RETURN when the
 * soul is threatened) or commit to a longer chain and trust the soul's timing.
 *
 * Variant I ("Platform"): the only opening holds a glass lane.
 *   y=12 +--------+
 *        |n1 [EX]k|   n1 (west) and k1 (east) over the gate
 *   y=9  |   ##   |   cover block x 3..5, y 8..9 splits the approach to the gate
 *   y=7  |###~~###|   platform wall y 6..7 with the opening x 3..5; lane in the opening
 *        |        |
 *   y=4  |n2      |   n2 below the platform: wakes when the pair separates
 *   y=1  |   S    |
 *        +--------+
 * The lane burns 1.0 s of every 4.0 s (warning 0.9 s): a soul needs ~0.8 s to pass.
 *
 * Variant II ("Long Chain"): a one-tile gap under a keeper and a far east gap; the
 * targets sit at the far corners, so reaching them is a chain the soul pays for.
 *
 * PENDING (warden): LAST_PLATFORM_WARDEN puts a warden behind the opening, facing it.
 */
import type { RoomDef } from '../../sim/types';

const GATE_HINTS = [
  { id: 'gate', when: 'cleared', text: 'Bring your soul to the gate.' },
  { id: 'both', when: 'gateWaiting', text: 'The gate needs both of you.' },
] as const;

const OPENING_LANE = {
  id: 'opening',
  rect: { x: 3, y: 6, w: 2, h: 1 },
  period: 4,
  activeFrom: 2,
  activeTo: 3,
  warnLead: 0.9,
  // First burn at t = 3 s.
  phase: 3,
} as const;

export const LAST_PLATFORM: RoomDef = {
  id: 'last_platform',
  name: 'Last Platform',
  width: 8,
  height: 12,
  walls: [
    { x: 0, y: 6, w: 3, h: 1 },
    { x: 5, y: 6, w: 3, h: 1 },
    { x: 3, y: 8, w: 2, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    { id: 'n1', role: 'needler', at: { x: 1.2, y: 10.4 }, facing: { x: 1, y: -1 }, phase: -0.6 },
    { id: 'k1', role: 'keeper', at: { x: 6.8, y: 10.4 }, facing: { x: -1, y: -1 }, phase: -1.4 },
    {
      id: 'n2',
      role: 'needler',
      at: { x: 1.0, y: 3.8 },
      facing: { x: 1, y: 0 },
      dormant: true,
      wake: { kind: 'separated' },
      phase: -0.8,
    },
  ],
  lanes: [OPENING_LANE],
  hints: [
    { id: 'opening', when: 'start', text: 'One way through. Your soul must find a quiet moment in the glass.' },
    ...GATE_HINTS,
  ],
};

export const LAST_PLATFORM_LONG_CHAIN: RoomDef = {
  id: 'last_platform',
  name: 'Last Platform: Long Chain',
  width: 8,
  height: 12,
  walls: [
    { x: 0, y: 6, w: 3, h: 1 },
    { x: 4, y: 6, w: 3, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    // Watches the one-tile gap from above: a soul walking through it is exposed.
    { id: 'k1', role: 'keeper', at: { x: 3.5, y: 9.0 }, facing: { x: 0, y: -1 }, phase: -0.8 },
    { id: 'nw', role: 'needler', at: { x: 0.9, y: 10.6 }, facing: { x: 1, y: -1 }, phase: -1.2 },
    {
      id: 'ne',
      role: 'needler',
      at: { x: 7.1, y: 10.6 },
      facing: { x: -1, y: -1 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'k1' },
    },
    {
      id: 's1',
      role: 'needler',
      at: { x: 7.1, y: 3.6 },
      facing: { x: -1, y: 0 },
      dormant: true,
      wake: { kind: 'separated' },
      phase: -1.0,
    },
  ],
  lanes: [],
  hints: [
    { id: 'chain', when: 'start', text: 'Long chains reach far, but your soul pays for every tile.' },
    ...GATE_HINTS,
  ],
};

/** PENDING (warden role): not registered until the simulation implements wardens. */
export const LAST_PLATFORM_WARDEN: RoomDef = {
  id: 'last_platform',
  name: 'Last Platform: Warden',
  width: 8,
  height: 12,
  walls: [
    { x: 0, y: 6, w: 3, h: 1 },
    { x: 5, y: 6, w: 3, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    // Guards the opening from behind; flank once through, or strike after its sweep.
    { id: 'w1', role: 'warden', at: { x: 4, y: 8.4 }, facing: { x: 0, y: -1 }, phase: -1.0 },
    { id: 'n1', role: 'needler', at: { x: 1.2, y: 10.4 }, facing: { x: 1, y: -1 }, phase: -0.6 },
    { id: 'k1', role: 'keeper', at: { x: 6.8, y: 10.4 }, facing: { x: -1, y: -1 }, phase: -1.4 },
  ],
  lanes: [],
  hints: [
    { id: 'guard', when: 'start', text: 'The warden holds the opening. Get past its front before you strike.' },
    ...GATE_HINTS,
  ],
};
