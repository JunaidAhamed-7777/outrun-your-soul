/**
 * Silk Cloister (CONTENT.md template 3): walls make the two selves close in a straight
 * line but far apart along the route. A contact dash through the wall is impossible
 * (reunion needs a wall-clear corridor), so the choice is a corner-following RETURN,
 * walking the long way round, or an outward chain that reaches the soul legally.
 *
 * Variant I (U cloister)
 *   y=12 +--------+
 *        |n2 [EX] |   n2 over the gate (awake, delayed)
 *   y=10 |       k|   k1 wakes when the body nears it or after 9 s
 *   y=9  |  #  #  |   U: arms x 2..3 and 5..6 (y 4..9), base x 3..5 (y 4..5)
 *        |  #n1#  |   n1 sits inside the pocket; it can only shoot out of the
 *        |  #  #  |   open north mouth, so it is harmless until you go round
 *   y=4  |  ####  |
 *        |        |
 *   y=1  |   S    |
 *        +--------+
 *
 * Variant II (zigzag arcade): two offset bars force an S route; the soul is always
 * one thin wall away from the body yet several tiles behind along the thread.
 *   y=8  |   #####|   bar x 3..8, y 7..8 (west gap x 0..3)
 *        |n1      |   middle walk y 5..7
 *   y=5  |#####   |   bar x 0..5, y 4..5 (east gap x 5..8)
 */
import type { RoomDef } from '../../sim/types';

const GATE_HINTS = [
  { id: 'gate', when: 'cleared', text: 'Bring your soul to the gate.' },
  { id: 'both', when: 'gateWaiting', text: 'The gate needs both of you.' },
] as const;

export const SILK_CLOISTER: RoomDef = {
  id: 'silk_cloister',
  name: 'Silk Cloister',
  width: 8,
  height: 12,
  walls: [
    { x: 2, y: 4, w: 1, h: 5 },
    { x: 5, y: 4, w: 1, h: 5 },
    { x: 3, y: 4, w: 2, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    // Inside the pocket: only the north mouth gives it a line of fire.
    { id: 'n1', role: 'needler', at: { x: 4, y: 6.4 }, facing: { x: 0, y: 1 } },
    { id: 'n2', role: 'needler', at: { x: 1.2, y: 10.7 }, facing: { x: 1, y: -1 }, phase: -1.2 },
    {
      id: 'k1',
      role: 'keeper',
      at: { x: 7.0, y: 10.0 },
      facing: { x: -1, y: -1 },
      dormant: true,
      wake: { kind: 'time', seconds: 9 },
    },
  ],
  lanes: [],
  hints: [
    { id: 'round', when: 'firstSeparation', text: 'Walls stand between you. Return follows the thread around them.' },
    ...GATE_HINTS,
  ],
};

export const SILK_CLOISTER_ARCADE: RoomDef = {
  id: 'silk_cloister',
  name: 'Silk Cloister: Arcade',
  width: 8,
  height: 12,
  walls: [
    { x: 0, y: 4, w: 5, h: 1 },
    { x: 3, y: 7, w: 5, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    // West end of the middle walk: reached after the first turn.
    { id: 'n1', role: 'needler', at: { x: 1.2, y: 5.9 }, facing: { x: 1, y: 0 }, phase: -0.6 },
    // Top walk: the keeper watches the soul come up through the west gap.
    {
      id: 'k1',
      role: 'keeper',
      at: { x: 6.8, y: 9.6 },
      facing: { x: -1, y: 0 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'n1' },
    },
    {
      id: 'n2',
      role: 'needler',
      at: { x: 6.8, y: 5.9 },
      facing: { x: -1, y: 0 },
      dormant: true,
      wake: { kind: 'separated' },
      phase: -1.0,
    },
  ],
  lanes: [],
  hints: [
    { id: 'round', when: 'firstSeparation', text: 'Your soul is one wall away, and a long walk behind.' },
    ...GATE_HINTS,
  ],
};
