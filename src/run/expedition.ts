/**
 * Seeded expedition graph and the run state machine (docs/CONTENT.md "Delivery envelope").
 *
 *   opening (Departure Court) -> branch A | B -> station (first draft fills slot two)
 *   -> branch C | D -> station (keep-or-replace) -> final approach (Last Platform)
 *   -> boss (Last Warden) -> ending
 *
 * Four regular encounters per run drawn from the six-template pool, plus the boss. The
 * graph is a pure function of the seed. Run RNG is stateless by label (hashSeed), so the
 * seed is the complete run-RNG state: draft offers, room variants and room seeds never
 * depend on how many times something was rolled. All updates return new objects; a
 * repeated completion or draft commit returns the same state unchanged.
 */
import { TUNING } from '../sim/tuning';
import type { RoomParams } from '../sim/types';
import {
  applyDraft,
  canAdd,
  EMPTY_CHARGES,
  normalizeCharges,
  RELIC_IDS,
  replaceOptions,
  roomParamsFor,
  simHooksFor,
  STARTERS,
  type Loadout,
  type RelicCharges,
  type RelicId,
  type RelicSimHooks,
  type StarterId,
} from './relics';
import { hashSeed, RunRandom } from './rng';

export const ROOM_TEMPLATE_IDS = [
  'departure_court',
  'needle_gallery',
  'silk_cloister',
  'glass_crossing',
  'mourners_garden',
  'last_platform',
] as const;
export type RoomTemplateId = (typeof ROOM_TEMPLATE_IDS)[number];
export const BOSS_ROOM_ID = 'last_warden';
export type EncounterRoomId = RoomTemplateId | typeof BOSS_ROOM_ID;

export const OPENING_ROOM: RoomTemplateId = 'departure_court';
export const FINAL_APPROACH_ROOM: RoomTemplateId = 'last_platform';
/** Branch encounters are drawn from this part of the pool. */
export const BRANCH_POOL: readonly RoomTemplateId[] = ['needle_gallery', 'silk_cloister', 'glass_crossing', 'mourners_garden'];

/** PROVISIONAL run pacing numbers. */
export const RUN_TUNING = {
  maxHealth: TUNING.maxHealth,
  /** Health restored once when a station's choice is committed. */
  stationHeal: 1,
  draftOfferSize: 3,
  /** Authored variants per room template; rooms may ignore variants they do not define. */
  roomVariants: 2,
} as const;

export const RUN_STATE_VERSION = 1;

export type NodeKind = 'encounter' | 'station' | 'boss' | 'ending';

export interface RunNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly depth: number;
  readonly label: string;
  readonly roomId: EncounterRoomId | null;
  readonly variant: number;
  readonly next: readonly string[];
}

export interface RunGraph {
  readonly seed: number;
  readonly start: string;
  readonly nodes: Readonly<Record<string, RunNode>>;
}

export interface DraftRecord {
  readonly offer: readonly RelicId[];
  readonly resolved: boolean;
  /** Relic taken, or null when the player kept their loadout. */
  readonly pick: RelicId | null;
  readonly replaced: RelicId | null;
}

export interface RunTotals {
  readonly roomsCleared: number;
  readonly failedAttempts: number;
  readonly hitsTaken: number;
  readonly cuts: number;
  readonly kills: number;
  readonly contactReunions: number;
  readonly roomSeconds: number;
}

export type RunOutcome = 'active' | 'victory' | 'abandoned';

export interface RunState {
  readonly version: number;
  readonly runId: string;
  readonly seed: number;
  readonly starter: StarterId;
  readonly graph: RunGraph;
  readonly at: string;
  /** Node IDs entered, in order (branch history). */
  readonly history: readonly string[];
  readonly loadout: Loadout;
  readonly health: number;
  readonly maxHealth: number;
  readonly charges: RelicCharges;
  /** Nodes whose completion and reward were committed (exactly once). */
  readonly completed: readonly string[];
  readonly drafts: Readonly<Record<string, DraftRecord>>;
  /** Failed attempts per node (retries restart the room from its entry state). */
  readonly attempts: Readonly<Record<string, number>>;
  readonly outcome: RunOutcome;
  readonly totals: RunTotals;
}

export class RunError extends Error {
  constructor(
    readonly code: 'notHere' | 'unresolved' | 'notAChoice' | 'wrongKind' | 'finished' | 'badResult' | 'notOffered' | 'illegalDraft',
    message: string,
  ) {
    super(message);
    this.name = 'RunError';
  }
}

const ZERO_TOTALS: RunTotals = Object.freeze({
  roomsCleared: 0,
  failedAttempts: 0,
  hitsTaken: 0,
  cuts: 0,
  kills: 0,
  contactReunions: 0,
  roomSeconds: 0,
});

const ROOM_LABELS: Readonly<Record<EncounterRoomId, string>> = {
  departure_court: 'Departure Court',
  needle_gallery: 'Needle Gallery',
  silk_cloister: 'Silk Cloister',
  glass_crossing: 'Glass Crossing',
  mourners_garden: "Mourner's Garden",
  last_platform: 'Last Platform',
  last_warden: 'The Last Warden',
};

// ---------------------------------------------------------------------------
// Graph generation
// ---------------------------------------------------------------------------

export function generateGraph(seed: number): RunGraph {
  const s = seed >>> 0;
  const order = new RunRandom(hashSeed(s, 'branches')).shuffle(BRANCH_POOL);
  const variant = (id: string) => new RunRandom(hashSeed(s, `variant:${id}`)).int(RUN_TUNING.roomVariants);
  const encounter = (id: string, depth: number, roomId: EncounterRoomId, next: string[], kind: NodeKind = 'encounter'): RunNode => ({
    id,
    kind,
    depth,
    label: ROOM_LABELS[roomId],
    roomId,
    variant: kind === 'boss' ? 0 : variant(id),
    next,
  });
  const nodes: RunNode[] = [
    encounter('n0', 0, OPENING_ROOM, ['n1a', 'n1b']),
    encounter('n1a', 1, order[0] as RoomTemplateId, ['n2']),
    encounter('n1b', 1, order[1] as RoomTemplateId, ['n2']),
    { id: 'n2', kind: 'station', depth: 2, label: 'Signal House', roomId: null, variant: 0, next: ['n3a', 'n3b'] },
    encounter('n3a', 3, order[2] as RoomTemplateId, ['n4']),
    encounter('n3b', 3, order[3] as RoomTemplateId, ['n4']),
    { id: 'n4', kind: 'station', depth: 4, label: 'Final Crossing', roomId: null, variant: 0, next: ['n5'] },
    encounter('n5', 5, FINAL_APPROACH_ROOM, ['n6']),
    encounter('n6', 6, BOSS_ROOM_ID, ['n7'], 'boss'),
    { id: 'n7', kind: 'ending', depth: 7, label: 'The Last Gate', roomId: null, variant: 0, next: [] },
  ];
  return { seed: s, start: 'n0', nodes: Object.fromEntries(nodes.map((n) => [n.id, n])) };
}

/** Stable text fingerprint of a graph, used to detect content drift when loading saves. */
export function graphFingerprint(graph: RunGraph): string {
  return Object.values(graph.nodes)
    .map((n) => `${n.id}:${n.kind}:${n.roomId ?? '-'}:${n.variant}>${n.next.join(',')}`)
    .join('|');
}

// ---------------------------------------------------------------------------
// Run state machine
// ---------------------------------------------------------------------------

export function defaultRunId(seed: number): string {
  return `run-${(seed >>> 0).toString(36)}`;
}

export function createRun(seed: number, starterId: StarterId, runId: string = defaultRunId(seed)): RunState {
  const graph = generateGraph(seed);
  return {
    version: RUN_STATE_VERSION,
    runId,
    seed: seed >>> 0,
    starter: starterId,
    graph,
    at: graph.start,
    history: [graph.start],
    loadout: [STARTERS[starterId].relic],
    health: RUN_TUNING.maxHealth,
    maxHealth: RUN_TUNING.maxHealth,
    charges: EMPTY_CHARGES,
    completed: [],
    drafts: {},
    attempts: {},
    outcome: 'active',
    totals: ZERO_TOTALS,
  };
}

export function nodeById(run: RunState, id: string): RunNode {
  const node = run.graph.nodes[id];
  if (!node) throw new RunError('notHere', `unknown node ${id}`);
  return node;
}

export function currentNode(run: RunState): RunNode {
  return nodeById(run, run.at);
}

export function isFinished(run: RunState): boolean {
  return run.outcome !== 'active';
}

/** True when the player may leave the current node. */
export function isResolved(run: RunState, id: string = run.at): boolean {
  const node = nodeById(run, id);
  switch (node.kind) {
    case 'encounter':
    case 'boss':
      return run.completed.includes(id);
    case 'station':
      return run.drafts[id]?.resolved === true;
    case 'ending':
      return true;
  }
}

export interface RouteChoice {
  readonly id: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly roomId: EncounterRoomId | null;
  readonly variant: number;
}

/** Next nodes the player may choose now (empty until the current node is resolved). */
export function choices(run: RunState): RouteChoice[] {
  if (isFinished(run) || !isResolved(run)) return [];
  return currentNode(run).next.map((id) => {
    const n = nodeById(run, id);
    return { id: n.id, kind: n.kind, label: n.label, roomId: n.roomId, variant: n.variant };
  });
}

/** Offer for a station: up to three relics not equipped that the loadout can legally take. */
export function generateOffer(seed: number, nodeId: string, loadout: Loadout): RelicId[] {
  const eligible = RELIC_IDS.filter((id) => (loadout.length < 2 ? canAdd(loadout, id) : replaceOptions(loadout, id).length > 0));
  return new RunRandom(hashSeed(seed, `draft:${nodeId}`)).shuffle(eligible).slice(0, RUN_TUNING.draftOfferSize);
}

export function choose(run: RunState, choiceId: string): RunState {
  if (isFinished(run)) throw new RunError('finished', 'run is over');
  if (!isResolved(run)) throw new RunError('unresolved', `node ${run.at} is not resolved`);
  if (!currentNode(run).next.includes(choiceId)) throw new RunError('notAChoice', `${choiceId} is not reachable from ${run.at}`);
  const node = nodeById(run, choiceId);
  const next: RunState = { ...run, at: choiceId, history: [...run.history, choiceId] };
  if (node.kind === 'station' && !run.drafts[choiceId]) {
    // Fix the offer on arrival so reload/replay cannot reroll it.
    const offer = generateOffer(run.seed, choiceId, run.loadout);
    return { ...next, drafts: { ...run.drafts, [choiceId]: { offer, resolved: false, pick: null, replaced: null } } };
  }
  if (node.kind === 'ending') return { ...next, outcome: 'victory' };
  return next;
}

export interface RoomResultStats {
  readonly hits?: number;
  readonly cuts?: number;
  readonly kills?: number;
  readonly contactReunions?: number;
  readonly seconds?: number;
}

export interface RoomResult {
  readonly nodeId: string;
  /** Shared health when the pair exited (must be > 0: a defeat is reported with failRoom). */
  readonly health: number;
  readonly charges?: RelicCharges;
  readonly stats?: RoomResultStats;
}

const nonNeg = (x: number | undefined): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);

/**
 * Commit a cleared encounter/boss: carried health, earned charges and totals. Idempotent:
 * repeating the same node's completion returns the run unchanged (no second reward).
 */
export function completeRoom(run: RunState, result: RoomResult): RunState {
  if (run.completed.includes(result.nodeId)) return run;
  if (isFinished(run)) throw new RunError('finished', 'run is over');
  if (result.nodeId !== run.at) throw new RunError('notHere', `result for ${result.nodeId} but run is at ${run.at}`);
  const node = currentNode(run);
  if (node.kind !== 'encounter' && node.kind !== 'boss') throw new RunError('wrongKind', `${node.id} is a ${node.kind}`);
  if (!Number.isInteger(result.health) || result.health < 1 || result.health > run.maxHealth) {
    throw new RunError('badResult', `health ${result.health} out of range`);
  }
  const s = result.stats ?? {};
  return {
    ...run,
    health: result.health,
    charges: normalizeCharges(run.loadout, result.charges ?? run.charges),
    completed: [...run.completed, result.nodeId],
    totals: {
      ...run.totals,
      roomsCleared: run.totals.roomsCleared + 1,
      hitsTaken: run.totals.hitsTaken + nonNeg(s.hits),
      cuts: run.totals.cuts + nonNeg(s.cuts),
      kills: run.totals.kills + nonNeg(s.kills),
      contactReunions: run.totals.contactReunions + nonNeg(s.contactReunions),
      roomSeconds: run.totals.roomSeconds + nonNeg(s.seconds),
    },
  };
}

/** Record a defeat in the current room. The player retries from the room-entry state. */
export function failRoom(run: RunState, nodeId: string = run.at): RunState {
  if (isFinished(run)) throw new RunError('finished', 'run is over');
  if (nodeId !== run.at) throw new RunError('notHere', `defeat for ${nodeId} but run is at ${run.at}`);
  if (run.completed.includes(nodeId)) throw new RunError('wrongKind', `${nodeId} was already cleared`);
  return {
    ...run,
    attempts: { ...run.attempts, [nodeId]: (run.attempts[nodeId] ?? 0) + 1 },
    totals: { ...run.totals, failedAttempts: run.totals.failedAttempts + 1 },
  };
}

export function abandonRun(run: RunState): RunState {
  return isFinished(run) ? run : { ...run, outcome: 'abandoned' };
}

/** The current station's fixed offer, or null when not at a station. */
export function draftOffer(run: RunState): DraftRecord | null {
  return currentNode(run).kind === 'station' ? (run.drafts[run.at] ?? null) : null;
}

/**
 * Commit the station choice: take an offered relic (adding to a free slot or replacing
 * replaceIndex) or keep the loadout (pick null). Applies the station heal once. A second
 * call for an already resolved station returns the run unchanged.
 */
export function takeDraft(run: RunState, pick: RelicId | null, replaceIndex?: number): RunState {
  if (isFinished(run)) throw new RunError('finished', 'run is over');
  const record = draftOffer(run);
  if (!record) throw new RunError('wrongKind', `${run.at} is not a station`);
  if (record.resolved) return run;
  let loadout = run.loadout;
  let replaced: RelicId | null = null;
  if (pick !== null) {
    if (!record.offer.includes(pick)) throw new RunError('notOffered', `${pick} was not offered`);
    const result = applyDraft(run.loadout, pick, replaceIndex);
    if (!result.ok) throw new RunError('illegalDraft', `cannot take ${pick}: ${result.reason}`);
    loadout = result.loadout;
    replaced = result.replaced;
  }
  return {
    ...run,
    loadout,
    // Charges belong to relics; a replaced relic's held state is dropped, never truncating live play.
    charges: normalizeCharges(loadout, run.charges),
    health: Math.min(run.maxHealth, run.health + RUN_TUNING.stationHeal),
    drafts: { ...run.drafts, [run.at]: { ...record, resolved: true, pick, replaced } },
  };
}

// ---------------------------------------------------------------------------
// Room entry
// ---------------------------------------------------------------------------

export interface RoomEntry {
  readonly nodeId: string;
  readonly roomId: EncounterRoomId;
  readonly variant: number;
  /** Simulation seed for this room: identical on every retry/reload of the same node. */
  readonly seed: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly loadout: Loadout;
  readonly params: RoomParams;
  readonly hooks: RelicSimHooks;
  readonly charges: RelicCharges;
}

export const BASE_ROOM_PARAMS: RoomParams = Object.freeze({
  soulSpeed: TUNING.soulSpeed,
  tetherCapacity: TUNING.tetherCapacity,
  dashMaxDistance: TUNING.dashMaxDistance,
});

export function roomSeed(run: RunState, nodeId: string): number {
  return hashSeed(run.seed, `room:${nodeId}`);
}

/** Everything needed to (re)create the current room exactly as it was entered; null if not a combat node. */
export function roomEntry(run: RunState): RoomEntry | null {
  const node = currentNode(run);
  if ((node.kind !== 'encounter' && node.kind !== 'boss') || node.roomId === null) return null;
  if (run.completed.includes(node.id) || isFinished(run)) return null;
  return {
    nodeId: node.id,
    roomId: node.roomId,
    variant: node.variant,
    seed: roomSeed(run, node.id),
    health: run.health,
    maxHealth: run.maxHealth,
    loadout: run.loadout,
    params: roomParamsFor(run.loadout, BASE_ROOM_PARAMS),
    hooks: simHooksFor(run.loadout),
    charges: run.charges,
  };
}
