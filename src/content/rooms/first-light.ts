/**
 * First Light: the onboarding room played before a player's first expedition. Not part
 * of the expedition template pool. No sentry is present during the movement lessons: the
 * first arrives when lesson 5 begins, each later one when the previous one falls. Hits land but the room runs
 * with a health floor of 1, so nobody can lose here; the step-by-step prompts live in src/game/tutorial.ts.
 *
 * Layout (8 x 12 tiles, y grows up the screen):
 *
 *   y=12 +--------+
 *        |   [EX]  k|  exit gate x 3..5; keeper k wakes when n falls (aims at the soul)
 *   y=10 |        |
 *        |n       |   needler n wakes when the dummy breaks (aims at the body)
 *   y=7  |  ##    |   low block: cover from the needler's line
 *        |     d  |   sentry d: arrives when lesson 5 begins, then fires; the first strike target
 *   y=4  |        |
 *        |        |   open start: room to practise dash, follow, RETURN, contact
 *   y=1  |   S    |
 *        +--------+
 */
import type { RoomDef } from '../../sim/types';

export const FIRST_LIGHT: RoomDef = {
  id: 'first_light',
  name: 'First Light',
  width: 8,
  height: 12,
  walls: [{ x: 2, y: 7, w: 2, h: 1 }],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    // Not present during the movement lessons: the tutorial wakes it (spawn-in) when step 5
    // begins, and it starts firing at the body. The tutorial runs with a health floor of 1
    // (src/game/game.ts), so shots teach without ending the run.
    { id: 'dummy', role: 'needler', at: { x: 5.6, y: 5.6 }, facing: { x: 0, y: -1 }, dormant: true, hidden: true },
    {
      id: 'needler',
      role: 'needler',
      at: { x: 1.2, y: 8.8 },
      facing: { x: 1, y: -1 },
      dormant: true,
      hidden: true,
      wake: { kind: 'enemyKilled', enemy: 'dummy' },
      // Extra idle time after waking so the first lock arrives after the prompt is read.
      phase: -1.2,
    },
    {
      id: 'keeper',
      role: 'keeper',
      at: { x: 6.8, y: 10.4 },
      facing: { x: -1, y: -1 },
      dormant: true,
      hidden: true,
      wake: { kind: 'enemyKilled', enemy: 'needler' },
      phase: -1.2,
    },
  ],
  lanes: [],
  // Prompts come from the tutorial coach, not the generic hint system.
  hints: [],
};
