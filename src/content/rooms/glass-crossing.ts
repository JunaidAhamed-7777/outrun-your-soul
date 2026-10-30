/**
 * Glass Crossing (CONTENT.md template 4): a telegraphed environmental lane cuts the
 * courtyard. The fast body crosses easily; the slow soul is exposed for ~0.8 s of
 * its walk across. Safe plans: cross during the idle/warning window, or take the
 * longer east detour around the lane's end (costs thread and time).
 *
 *   y=12 +--------+
 *        |   [EX] |   exit x 3..5, y 11..12
 *        |n1    k1|   needler n1 (west), keeper k1 (east)
 *   y=8  |   n2 # |   needler n2 centre; pillar (6..7, 7..8) shades the detour
 *        |        |
 *   y=6  |~~~~~~  |   lane x 0..6, y 5..6 (violet, cycles); east gap x 6..8
 *        |        |
 *   y=3  | #      |   low block (1..2, 3..4)
 *   y=1  |   S    |
 *        +--------+
 *
 * Lane cycle 3.2 s: idle 0.8 s, warning 0.8 s, active 1.2 s, idle 0.4 s (paper values).
 */
import type { RoomDef } from '../../sim/types';

export const GLASS_CROSSING: RoomDef = {
  id: 'glass_crossing',
  name: 'Glass Crossing',
  width: 8,
  height: 12,
  walls: [
    { x: 1, y: 3, w: 1, h: 1 },
    { x: 6, y: 7, w: 1, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    { id: 'n1', role: 'needler', at: { x: 1.2, y: 9.8 }, facing: { x: 1, y: -1 } },
    { id: 'k1', role: 'keeper', at: { x: 6.8, y: 9.8 }, facing: { x: -1, y: -1 }, phase: -1.2 },
    { id: 'n2', role: 'needler', at: { x: 4, y: 8.2 }, facing: { x: 0, y: -1 }, phase: -2.4 },
  ],
  lanes: [
    {
      id: 'glass',
      rect: { x: 0, y: 5, w: 6, h: 1 },
      period: 3.2,
      activeFrom: 1.6,
      activeTo: 2.8,
      warnLead: 0.8,
    },
  ],
  hints: [
    { id: 'lane', when: 'start', text: 'Violet glass burns on a rhythm. Your soul has to cross it too.' },
    { id: 'gate', when: 'cleared', text: 'Bring your soul to the gate.' },
    { id: 'both', when: 'gateWaiting', text: 'The gate needs both of you.' },
  ],
};
