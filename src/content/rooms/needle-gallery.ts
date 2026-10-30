/**
 * Needle Gallery (CONTENT.md template 2): cover splits a straight firing line from a
 * longer flank. Needlers aim at the BODY, but their bolts fly on down the line — and
 * the slow soul walks that same line behind you. The decision: rush the gallery head
 * now (fast, but the soul trails up the firing line), or flank behind cover (longer,
 * costs thread, keeps the soul shaded).
 *
 * Variant I
 *   y=12 +--------+
 *        |k1 [EX] |   keeper k1 wakes once the gallery head falls
 *   y=10 |   n1   |   n1: gallery head, fires straight down the gallery
 *        |        |
 *   y=8  |  #  #  |   cover columns x 2..3 and 5..6, y 4..8: the gallery is x 3..5
 *        |  #  #  |
 *        |  #  #  |   n2 (east flank, dormant) wakes when the body enters the flank
 *   y=4  |  #  # n|
 *        |        |
 *   y=1  |   S    |
 *        +--------+
 *
 * Variant II ("Crossfire"): two gallery heads in the top corners whose firing lines
 * cross over a central cover block; one bolt can be cut on the way to the other source
 * (keep a source alive for an interception) or each removed in turn from the shade.
 */
import type { RoomDef } from '../../sim/types';

const GATE_HINTS = [
  { id: 'gate', when: 'cleared', text: 'Bring your soul to the gate.' },
  { id: 'both', when: 'gateWaiting', text: 'The gate needs both of you.' },
] as const;

export const NEEDLE_GALLERY: RoomDef = {
  id: 'needle_gallery',
  name: 'Needle Gallery',
  width: 8,
  height: 12,
  walls: [
    { x: 2, y: 4, w: 1, h: 4 },
    { x: 5, y: 4, w: 1, h: 4 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    // Gallery head: awake, first shot after ~3.7 s (phase delays the first cooldown).
    { id: 'n1', role: 'needler', at: { x: 4, y: 9.4 }, facing: { x: 0, y: -1 }, phase: -0.5 },
    // East flank guard: wakes only when the body commits to the east flank.
    {
      id: 'n2',
      role: 'needler',
      at: { x: 7.1, y: 4.6 },
      facing: { x: -1, y: 0 },
      dormant: true,
      wake: { kind: 'bodyWithin', radius: 2.6 },
    },
    // Keeper over the gate: appears once the gallery head is gone.
    {
      id: 'k1',
      role: 'keeper',
      at: { x: 1.2, y: 10.6 },
      facing: { x: 1, y: -1 },
      dormant: true,
      wake: { kind: 'enemyKilled', enemy: 'n1' },
      phase: -0.6,
    },
  ],
  lanes: [],
  hints: [
    { id: 'line', when: 'start', text: 'Bolts keep flying past you. Your soul walks the line you leave.' },
    ...GATE_HINTS,
  ],
};

export const NEEDLE_GALLERY_CROSSFIRE: RoomDef = {
  id: 'needle_gallery',
  name: 'Needle Gallery: Crossfire',
  width: 8,
  height: 12,
  walls: [
    { x: 3, y: 5, w: 2, h: 2 },
    { x: 0, y: 8, w: 1, h: 1 },
    { x: 7, y: 8, w: 1, h: 1 },
  ],
  spawn: { x: 4, y: 1.5 },
  exit: { x: 3, y: 11, w: 2, h: 1 },
  enemies: [
    // Two heads whose lines cross over the central block; staggered so they alternate.
    { id: 'nw', role: 'needler', at: { x: 1.3, y: 9.9 }, facing: { x: 1, y: -1 }, phase: -0.4 },
    { id: 'ne', role: 'needler', at: { x: 6.7, y: 9.9 }, facing: { x: -1, y: -1 }, phase: -1.4 },
    // Low keeper behind the block: it watches the soul's walk up either side.
    {
      id: 'k1',
      role: 'keeper',
      at: { x: 4, y: 8.2 },
      facing: { x: 0, y: -1 },
      dormant: true,
      wake: { kind: 'time', seconds: 6 },
    },
  ],
  lanes: [],
  hints: [
    { id: 'cross', when: 'start', text: 'Two lines cross. Cut one shot on the way to the other shooter.' },
    ...GATE_HINTS,
  ],
};
