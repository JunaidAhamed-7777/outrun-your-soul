/**
 * Mourner's Garden (CONTENT.md template 5): outer targets surround a guarded centre.
 * The question is order and meeting place: clear the outer shooters first (earning
 * Mourning Bell charge, if carried) and choose where body and soul meet, or go for the
 * centre that keeps threatening the soul.
 *
 * Until the warden role exists, the centre is guarded by geometry: a grave slab faces
 * the spawn exactly like a warden's frontal guard, so the centre must be flanked.
 *
 * Variant I ("Graves")
 *   y=12 +--------+
 *        |   [EX] |
 *   y=10 |   n3   |   n3 north mourner: wakes when the centre falls
 *   y=8  | #    # |   side stones (1..2 and 6..7, y 7..8): cover for the flanks
 *        |   k1   |   k1 the mourner at the centre, shooting at the soul
 *   y=5  |n1 ## n2|   grave slab x 3..5, y 4..5 faces the spawn; n1 / n2 outer needlers
 *        |        |
 *   y=1  |   S    |
 *        +--------+
 *
 * Variant II ("Vigil"): four grave stones on the diagonals around an exposed centre and
 * four corner mourners that wake in pairs; the centre can be struck from any side but
 * every approach crosses some corner's line.
 *
 * PENDING (warden): MOURNERS_GARDEN_WARDEN replaces the slab with a real warden facing
 * the spawn. It is exported for the lead to enable once the warden role ships.
 */
import type { RoomDef } from '../../sim/types';

const GATE_HINTS = [
  { id: 'gate', when: 'cleared', text: 'Bring your soul to the gate.' },
  { id: 'both', when: 'gateWaiting', text: 'The gate needs both of you.' },
] as const;

export const MOURNERS_GARDEN: RoomDef = {
  id: 'mourners_garden',
  name: "Mourner's Garden",
  width: 8,
  height: 12,
  walls: [
    { x: 3, y: 4, w: 2, h: 1 },
    { x: 1, y: 7, w: 1, h: 1 },
    { x: 6, y: 7, w: 1, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    { id: 'k1', role: 'keeper', at: { x: 4, y: 6.3 }, facing: { x: 0, y: -1 }, phase: -0.6 },
    { id: 'n1', role: 'needler', at: { x: 0.9, y: 4.6 }, facing: { x: 1, y: -1 }, phase: -1.0 },
    {
      id: 'n2',
      role: 'needler',
      at: { x: 7.1, y: 4.6 },
      facing: { x: -1, y: -1 },
      dormant: true,
      wake: { kind: 'separated' },
      phase: -1.6,
    },
    {
      id: 'n3',
      role: 'needler',
      at: { x: 4, y: 9.8 },
      facing: { x: 0, y: -1 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'k1' },
      phase: -0.4,
    },
  ],
  lanes: [],
  hints: [
    { id: 'centre', when: 'start', text: 'The mourner hides behind its grave. Flank it, or clear the garden first.' },
    ...GATE_HINTS,
  ],
};

export const MOURNERS_GARDEN_VIGIL: RoomDef = {
  id: 'mourners_garden',
  name: "Mourner's Garden: Vigil",
  width: 8,
  height: 12,
  walls: [
    { x: 2, y: 4, w: 1, h: 1 },
    { x: 5, y: 4, w: 1, h: 1 },
    { x: 2, y: 8, w: 1, h: 1 },
    { x: 5, y: 8, w: 1, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    // The exposed centre: a keeper that punishes a soul left walking.
    { id: 'k1', role: 'keeper', at: { x: 4, y: 6.5 }, facing: { x: 0, y: -1 }, phase: -0.8 },
    // Lower corners wake when the pair first separates; upper corners after a while.
    {
      id: 'sw',
      role: 'needler',
      at: { x: 0.9, y: 3.2 },
      facing: { x: 1, y: 0 },
      dormant: true,
      wake: { kind: 'separated' },
      phase: -0.4,
    },
    {
      id: 'se',
      role: 'needler',
      at: { x: 7.1, y: 3.2 },
      facing: { x: -1, y: 0 },
      dormant: true,
      wake: { kind: 'separated' },
      phase: -1.3,
    },
    {
      id: 'nw',
      role: 'needler',
      at: { x: 0.9, y: 9.8 },
      facing: { x: 1, y: -1 },
      dormant: true,
      wake: { kind: 'time', seconds: 8 },
    },
    {
      id: 'ne',
      role: 'needler',
      at: { x: 7.1, y: 9.8 },
      facing: { x: -1, y: -1 },
      dormant: true,
      wake: { kind: 'time', seconds: 9 },
    },
  ],
  lanes: [],
  hints: [
    { id: 'vigil', when: 'start', text: 'Every path to the centre crosses a mourner. Choose where you meet your soul.' },
    ...GATE_HINTS,
  ],
};

/** PENDING (warden role): not registered until the simulation implements wardens. */
export const MOURNERS_GARDEN_WARDEN: RoomDef = {
  id: 'mourners_garden',
  name: "Mourner's Garden: Warden",
  width: 8,
  height: 12,
  walls: [
    { x: 1, y: 7, w: 1, h: 1 },
    { x: 6, y: 7, w: 1, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    // The guarded centre: frontal guard toward the spawn; flank it or wait for its sweep.
    { id: 'w1', role: 'warden', at: { x: 4, y: 6.2 }, facing: { x: 0, y: -1 }, phase: -1.0 },
    { id: 'n1', role: 'needler', at: { x: 0.9, y: 4.6 }, facing: { x: 1, y: -1 }, phase: -1.0 },
    { id: 'n2', role: 'needler', at: { x: 7.1, y: 4.6 }, facing: { x: -1, y: -1 }, phase: -1.8 },
    {
      id: 'k1',
      role: 'keeper',
      at: { x: 4, y: 9.8 },
      facing: { x: 0, y: -1 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'n1' },
    },
  ],
  lanes: [],
  hints: [
    { id: 'guard', when: 'start', text: 'The warden guards its front. Strike from the side, or after its sweep.' },
    ...GATE_HINTS,
  ],
};
