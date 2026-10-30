/**
 * Glass Crossing II: "Two Panes" (CONTENT.md template 4, variant b). Two violet lanes
 * burn in alternation, each leaving a gap on the opposite side. The lane-free plan
 * zigzags west then east (long, thread-hungry); the direct plan crosses each pane in
 * its quiet half — easy for the fast body, a timing question for the slow soul.
 *
 *   y=12 +--------+
 *        |k1 [EX] |   keeper k1 beyond the upper pane (wakes on the first kill)
 *   y=9  |~~~~~~  |   pane B x 0..6, y 8..9 (gap x 6..8), active t in [1,2)+4k
 *        |n2    n1|   needlers between the panes; n2 wakes when n1 falls
 *   y=5  |  ~~~~~~|   pane A x 2..8, y 4..5 (gap x 0..2), active t in [3,4)+4k
 *        |        |
 *   y=1  |   S    |
 *        +--------+
 *
 * Each pane is quiet (idle + warning) for 3.0 s of every 4.0 s; a soul needs ~0.8 s to
 * cross one, so every crossing has a window at least three times as long as it needs.
 */
import type { RoomDef } from '../../sim/types';

export const GLASS_CROSSING_B: RoomDef = {
  id: 'glass_crossing',
  name: 'Glass Crossing: Two Panes',
  width: 8,
  height: 12,
  walls: [{ x: 4, y: 6, w: 1, h: 1 }],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    { id: 'n1', role: 'needler', at: { x: 6.8, y: 6.6 }, facing: { x: -1, y: -1 }, phase: -0.8 },
    {
      id: 'n2',
      role: 'needler',
      at: { x: 1.2, y: 6.6 },
      facing: { x: 1, y: -1 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'n1' },
    },
    {
      id: 'k1',
      role: 'keeper',
      at: { x: 1.2, y: 10.5 },
      facing: { x: 1, y: -1 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'n2' },
      phase: -0.5,
    },
  ],
  lanes: [
    // Lower pane: first burns at t = 3 s (warning from 2.1 s).
    { id: 'pane_a', rect: { x: 2, y: 4, w: 6, h: 1 }, period: 4, activeFrom: 2, activeTo: 3, warnLead: 0.9, phase: 3 },
    // Upper pane: half a period out of step with the lower one.
    { id: 'pane_b', rect: { x: 0, y: 8, w: 6, h: 1 }, period: 4, activeFrom: 2, activeTo: 3, warnLead: 0.9, phase: 1 },
  ],
  hints: [
    { id: 'panes', when: 'start', text: 'The panes burn in turn. Time your soul, or walk it round the gaps.' },
    { id: 'gate', when: 'cleared', text: 'Bring your soul to the gate.' },
    { id: 'both', when: 'gateWaiting', text: 'The gate needs both of you.' },
  ],
};
