/**
 * The Last Warden's arena (boss room, separate from the six-template pool).
 *
 * Geometry is final-intent: a wide open floor with four low pillars for cover and a
 * full-width procession lane that every route north must time. The enemy set is a
 * PLACEHOLDER built from existing roles (two escorts waves) so the expedition is
 * playable end to end; the simulation agent replaces it with the Last Warden boss (a
 * fast armoured body with a slower heart following its route) once that ships.
 *
 *   y=12 +--------+
 *        |n1 [EX]n2|  wave 1: two needlers over the gate, a keeper at centre-top
 *   y=10 |   k1   |
 *   y=9  | #    # |   pillars (1..2, 8..9) and (6..7, 8..9)
 *   y=7  |~~~~~~~~|   procession lane, full width, y 6..7: burns 1.0 s of every 4.4 s
 *   y=5  | #    # |   pillars (1..2, 4..5) and (6..7, 4..5)
 *        |k2    n3|   wave 2 (behind you): wakes when the keeper k1 falls
 *   y=1  |   S    |
 *        +--------+
 */
import type { RoomDef } from '../../sim/types';

export const LAST_WARDEN_ARENA: RoomDef = {
  id: 'last_warden',
  name: 'The Last Warden',
  width: 8,
  height: 12,
  walls: [
    { x: 1, y: 4, w: 1, h: 1 },
    { x: 6, y: 4, w: 1, h: 1 },
    { x: 1, y: 8, w: 1, h: 1 },
    { x: 6, y: 8, w: 1, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    { id: 'n1', role: 'needler', at: { x: 0.9, y: 10.6 }, facing: { x: 1, y: -1 }, phase: -0.8 },
    { id: 'n2', role: 'needler', at: { x: 7.1, y: 10.6 }, facing: { x: -1, y: -1 }, phase: -1.7 },
    { id: 'k1', role: 'keeper', at: { x: 4, y: 9.6 }, facing: { x: 0, y: -1 }, phase: -1.0 },
    {
      id: 'k2',
      role: 'keeper',
      at: { x: 0.9, y: 2.6 },
      facing: { x: 1, y: 1 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'k1' },
      phase: -0.5,
    },
    {
      id: 'n3',
      role: 'needler',
      at: { x: 7.1, y: 2.6 },
      facing: { x: -1, y: 1 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'k1' },
      phase: -1.2,
    },
  ],
  lanes: [
    {
      id: 'procession',
      rect: { x: 0, y: 6, w: 8, h: 1 },
      period: 4.4,
      activeFrom: 2.2,
      activeTo: 3.2,
      warnLead: 1.0,
      // First burn at t = 3.4 s; warning from 2.4 s.
      phase: 3.2,
    },
  ],
  hints: [
    { id: 'procession', when: 'start', text: 'The procession burns across the whole floor. Your soul must cross it in a quiet moment.' },
    { id: 'gate', when: 'cleared', text: 'The last gate opens. Bring your soul home.' },
    { id: 'both', when: 'gateWaiting', text: 'The gate needs both of you.' },
  ],
};
