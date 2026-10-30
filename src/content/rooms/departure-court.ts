/**
 * Departure Court — the first room and teaching encounter (CONTENT.md template 1).
 *
 * Layout (8 x 12 tiles, y grows up the screen):
 *
 *   y=12 +--------+
 *        |n3 [EX] |   exit gate x 3..5, y 11..12; n3 wakes for the finale
 *   y=10 |   ##   |   plinth x 3..5, y 9..10 (the route to the gate bends around it)
 *        |       k|   keeper k1 (7, 7.6) wakes with n3 and aims almost at once
 *   y=8  |  #     |   left pillar (2..3, 7..8): the soul's only cover from k1 on the climb
 *        |        |
 *        |   n1   |   n1 dormant straight ahead: the first strike target
 *   y=4  |n2    # |   n2 wakes when n1 dies; low block (6..7, 4..5) shades the start
 *        |        |
 *   y=1  |   S    |   spawn (4, 1.5)
 *        +--------+
 *
 * Beats (paper design, untested on devices):
 *  - Nothing can hurt the player until they act or ~15 s pass (n1 is dormant).
 *  - Killing n1 teaches dash-through; the soul visibly trails along the ribbon.
 *  - n2 then announces a body-targeted shot from the side: step off the locked line,
 *    dash through the bolt, or kill n2 (it is within one dash of where n1 fell).
 *  - n2's death wakes needler n3 (top left) and keeper k1 (right side). k1 leads the
 *    soul along its ribbon, and its first shot lands while a player chasing n3 has the
 *    soul climbing the open left corridor. The dilemma: chain to n3 and expose the soul,
 *    turn on k1 first, RETURN to gather the soul, or time the soul behind the pillar.
 *    Bot evidence (tests/sim/departure-finale.test.ts): a danger-blind chaser takes a
 *    keeper hit on the soul; the planning bots switch to killing k1 first.
 *  - The gate opens only when both selves stand in it.
 */
import type { RoomDef } from '../../sim/types';

export const DEPARTURE_COURT: RoomDef = {
  id: 'departure_court',
  name: 'Departure Court',
  width: 8,
  height: 12,
  walls: [
    { x: 2, y: 7, w: 1, h: 1 },
    { x: 6, y: 4, w: 1, h: 1 },
    { x: 3, y: 9, w: 2, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    {
      id: 'n1',
      role: 'needler',
      at: { x: 4, y: 5 },
      facing: { x: 0, y: -1 },
      dormant: true,
      wake: { kind: 'time', seconds: 15 },
    },
    {
      id: 'n2',
      role: 'needler',
      at: { x: 1, y: 3.6 },
      facing: { x: 1, y: 0 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'n1' },
    },
    {
      id: 'k1',
      role: 'keeper',
      at: { x: 7, y: 7.6 },
      facing: { x: -1, y: 0 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'n2' },
      // Starts tracking 0.2 s after waking, so its led shot arrives during the climb to n3.
      phase: 1.8,
    },
    {
      id: 'n3',
      role: 'needler',
      at: { x: 1.1, y: 10.6 },
      facing: { x: 1, y: -1 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'n2' },
      // Starts its cooldown 1.5 s behind the keeper so the two warnings do not overlap.
      phase: -1.5,
    },
  ],
  lanes: [],
  hints: [
    { id: 'drag', when: 'start', text: 'Drag anywhere, release to dash' },
    { id: 'follow', when: 'firstSeparation', text: 'Your soul follows slowly. Tap to return to it.' },
    { id: 'amber', when: 'firstTelegraph', text: 'Amber lines show where a shot will fly.' },
    { id: 'locked', when: 'firstLock', text: 'A locked line never moves. Step off it, or dash through the bolt.' },
    { id: 'gate', when: 'cleared', text: 'The gate wakes. Bring your soul to it.' },
    { id: 'both', when: 'gateWaiting', text: 'The gate needs both of you.' },
  ],
};
