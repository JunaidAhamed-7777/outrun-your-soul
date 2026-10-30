/**
 * The Last Warden's arena (boss room, separate from the six-template pool).
 *
 * The boss mirrors the player's flaw: a fast armoured body that charges along a
 * telegraphed two-leg route (at you, then at your soul) and a slow heart that must walk
 * that route home afterwards. The armour stops dashes like a wall; the trailing heart is
 * the only weak point. The player faces their own dilemma from the other side: strike
 * the heart while it is far from its body, without leaving their own soul in the next
 * charge's path or under the fan of bolts it leads onto the soul.
 *
 *   y=12 +--------+
 *        |   [EX] |   the gate stands behind the Warden
 *   y=9  |    W   |   W: the Last Warden at (4, 8.6), facing the courtyard
 *        |        |   an open floor: every charge runs its full length, so the heart
 *        |        |   always has a long walk home (the opening)
 *   y=1  |   S    |
 *        +--------+
 *
 * Pillars were tried and removed (bot evidence, 30 Oct): a player sheltering behind a
 * pillar next to the boss blocks every charge leg, the boss falls back to fans forever
 * and the heart never leaves home — a stalemate, not a climax.
 * The Warden sleeps for the first 2.5 s, so its first telegraph comes after ~3.5 s.
 * No escort sentries: the boss alone carries the finale (stages from BOSS_TUNING:
 * charge/fan, fan/charge, then a charge-fan-charge remix).
 */
import type { RoomDef } from '../../sim/types';

export const LAST_WARDEN_ARENA: RoomDef = {
  id: 'last_warden',
  name: 'The Last Warden',
  width: 8,
  height: 12,
  walls: [
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [],
  lanes: [],
  boss: {
    id: 'last_warden',
    at: { x: 4, y: 8.6 },
    facing: { x: 0, y: -1 },
    dormant: true,
    wake: { kind: 'time', seconds: 2.5 },
  },
  hints: [
    { id: 'warden', when: 'start', text: 'Its armour turns every blade. Strike the heart while it walks home.' },
    { id: 'gate', when: 'cleared', text: 'The last gate opens. Bring your soul home.' },
    { id: 'both', when: 'gateWaiting', text: 'The gate needs both of you.' },
  ],
};
