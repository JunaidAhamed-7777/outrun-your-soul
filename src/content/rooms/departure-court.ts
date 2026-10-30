/**
 * Departure Court — the first room and teaching encounter (CONTENT.md template 1).
 *
 * Layout (8 x 12 tiles, y grows up the screen):
 *
 *   y=12 +--------+
 *        |n3 [EX]k|   exit gate x 3..5, y 11..12; n3 / k1 wake for the finale
 *   y=10 |   ##   |   plinth x 3..5, y 9..10 (the route to the gate bends around it)
 *        |        |
 *   y=8  |  #  #  |   pillars at (2..3, 7..8) and (5..6, 7..8): cover from the top shooters
 *        |        |
 *        |   n1   |   n1 dormant straight ahead: the first strike target
 *   y=4  |n2      |   n2 wakes when n1 dies: first real telegraph
 *        |        |
 *   y=1  |   S    |   spawn (4, 1.5)
 *        +--------+
 *
 * Beats (paper design, untested on devices):
 *  - Nothing can hurt the player until they act or ~15 s pass (n1 is dormant).
 *  - Killing n1 teaches dash-through; the soul visibly trails along the ribbon.
 *  - n2 then announces a body-targeted shot from the side: step off the locked line,
 *    dash through the bolt, or kill n2 (it is within one dash of where n1 fell).
 *  - n2's death wakes the keeper k1 (aims at the soul) and, slightly later, needler n3.
 *    Reaching them needs more thread than one outing allows, so the player chooses
 *    between RETURN, a contact dash, or waiting behind the pillars for the soul.
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
    { x: 5, y: 7, w: 1, h: 1 },
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
      at: { x: 6.9, y: 10.6 },
      facing: { x: -1, y: -1 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'n2' },
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
