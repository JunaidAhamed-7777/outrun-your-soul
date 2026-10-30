/** Hand-built SimState fixtures for the UI/audio lab (dev only; never shipped). */
import type { RoomDef, SimState } from '../../sim/types';

export const LAB_ROOM: RoomDef = {
  id: 'lab-court',
  name: 'Lab Court',
  width: 8,
  height: 12,
  walls: [{ x: 2, y: 5, w: 1, h: 1 }],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [],
  lanes: [{ id: 'l1', rect: { x: 0, y: 7, w: 8, h: 1 }, period: 4, activeFrom: 2, activeTo: 3, warnLead: 0.8 }],
  hints: [
    { id: 'start', when: 'start', text: 'Drag anywhere, release to dash.' },
    { id: 'sep', when: 'firstSeparation', text: 'Your soul follows slowly. Tap to return to it.' },
    { id: 'track', when: 'firstTelegraph', text: 'Amber lines show where a sentry aims.' },
    { id: 'lock', when: 'firstLock', text: 'A locked line will not move. Step off it.' },
    { id: 'clear', when: 'cleared', text: 'The courtyard falls quiet.' },
    { id: 'gate', when: 'gateWaiting', text: 'The gate needs both of you.' },
  ],
};

export function labState(over: Partial<SimState> = {}): SimState {
  const base: SimState = {
    rulesVersion: 1,
    room: LAB_ROOM,
    params: { soulSpeed: 2, tetherCapacity: 6, dashMaxDistance: 3 },
    tick: 0,
    time: 0,
    rng: 1,
    nextId: 10,
    health: 5,
    maxHealth: 5,
    graceLeft: 0,
    damagedAttackIds: new Set(),
    body: { pos: { x: 5, y: 6 }, prevPos: { x: 5, y: 6 }, mode: 'ready', dash: null, recoverLeft: 0, facing: { x: 0, y: 1 } },
    soul: { pos: { x: 4, y: 3 }, prevPos: { x: 4, y: 3 }, speedMultiplier: 1, boostLeft: 0 },
    route: {
      points: [
        { x: 4, y: 3 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
      ],
      length: 4,
    },
    contactArmed: true,
    enemies: [],
    projectiles: [],
    lanes: [],
    gate: 'sealed',
    outcome: 'playing',
    buffered: null,
    bufferedAge: 0,
    stats: { dashes: 7, returns: 2, cuts: 3, kills: 3, hits: 1, contactReunions: 2, exhaustionReunions: 1 },
  };
  return { ...base, ...over };
}

/** Same state with a route of the given length (straight north from the soul). */
export function withThread(state: SimState, length: number): SimState {
  if (length <= 0) return { ...state, route: { points: [], length: 0 } };
  const s = state.soul.pos;
  const end = { x: s.x, y: s.y + length };
  return { ...state, route: { points: [s, end], length }, body: { ...state.body, pos: end, prevPos: end } };
}
