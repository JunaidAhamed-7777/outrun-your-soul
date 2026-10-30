/**
 * Versioned room-entry checkpoint (docs/COMBAT_SPEC.md "Checkpoints"). Continue restarts
 * the current room from the state it was entered with; there is no mid-room resume.
 *
 * A checkpoint is written at safe reunited boundaries only: entering a node, after a room
 * completion is committed, and after a station choice. The run graph is not stored: it is
 * regenerated from the seed and compared by fingerprint, so a content change is detected
 * as a version mismatch instead of silently loading a different expedition. Loading
 * replays the recorded draft decisions to prove offers and loadout are consistent.
 */
import {
  completeRoom,
  generateGraph,
  generateOffer,
  graphFingerprint,
  isFinished,
  roomEntry,
  RUN_STATE_VERSION,
  RUN_TUNING,
  RunError,
  type DraftRecord,
  type RoomEntry,
  type RoomResult,
  type RunGraph,
  type RunState,
  type RunTotals,
} from '../run/expedition';
import {
  applyDraft,
  isLegalLoadout,
  isRelicId,
  isStarterId,
  normalizeCharges,
  STARTERS,
  type Loadout,
  type RelicCharges,
  type RelicId,
} from '../run/relics';
import { browserStorage, saveError, TwoSlotStore, type Parsed, type SlotLoad, type SlotSaveResult, type StorageLike } from './storage';

export const SAVE_VERSION = 1;
/** Bump when run rules change meaning (relic rules, health, graph semantics). */
export const RUN_RULES_VERSION = 1;
/** Bump when room templates or graph content change. */
export const CONTENT_VERSION = 1;

/** Player-facing label for the checkpoint promise. Never claim exact mid-room resume. */
export const CONTINUE_LABEL = 'Continue restarts this room.';

export interface Checkpoint {
  readonly saveVersion: number;
  readonly rulesVersion: number;
  readonly contentVersion: number;
  readonly graphFingerprint: string;
  readonly run: RunState;
  /** The room-entry snapshot when the run stands at an uncleared combat node. */
  readonly entry: RoomEntry | null;
}

export function makeCheckpoint(run: RunState, entry: RoomEntry | null = roomEntry(run)): Checkpoint {
  if (isFinished(run)) throw new RunError('finished', 'finished runs are recorded in progress, not checkpointed');
  return {
    saveVersion: SAVE_VERSION,
    rulesVersion: RUN_RULES_VERSION,
    contentVersion: CONTENT_VERSION,
    graphFingerprint: graphFingerprint(run.graph),
    run,
    entry,
  };
}

/** Plain JSON-safe object (graph omitted, entry reduced to its identifying fields). */
export function checkpointToJSON(cp: Checkpoint): unknown {
  const { graph: _graph, ...run } = cp.run;
  return {
    saveVersion: cp.saveVersion,
    rulesVersion: cp.rulesVersion,
    contentVersion: cp.contentVersion,
    graphFingerprint: cp.graphFingerprint,
    run,
    entry: cp.entry && {
      nodeId: cp.entry.nodeId,
      roomId: cp.entry.roomId,
      variant: cp.entry.variant,
      seed: cp.entry.seed,
      health: cp.entry.health,
      loadout: cp.entry.loadout,
      charges: cp.entry.charges,
    },
  };
}

export function serializeCheckpoint(cp: Checkpoint): string {
  return JSON.stringify(checkpointToJSON(cp));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNonNegInt = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const isNonNegNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

class Invalid extends Error {}
function check(cond: unknown, detail: string): asserts cond {
  if (!cond) throw new Invalid(detail);
}

function parseCharges(x: unknown, loadout: Loadout): RelicCharges {
  check(isObj(x), 'charges must be an object');
  check(isNonNegInt(x.bellKills), 'charges.bellKills out of range');
  check(typeof x.bellCharged === 'boolean' && typeof x.knotMarked === 'boolean', 'charges flags must be booleans');
  const charges: RelicCharges = { bellKills: x.bellKills, bellCharged: x.bellCharged, knotMarked: x.knotMarked };
  const normal = normalizeCharges(loadout, charges);
  check(
    normal.bellKills === charges.bellKills && normal.bellCharged === charges.bellCharged && normal.knotMarked === charges.knotMarked,
    'charges exceed what the loadout can hold',
  );
  return charges;
}

function parseLoadout(x: unknown): Loadout {
  check(Array.isArray(x) && x.length >= 1 && isLegalLoadout(x), 'loadout is not a legal non-empty loadout');
  return x as Loadout;
}

function parseTotals(x: unknown): RunTotals {
  check(isObj(x), 'totals must be an object');
  const keys = ['roomsCleared', 'failedAttempts', 'hitsTaken', 'cuts', 'kills', 'contactReunions', 'roomSeconds'] as const;
  for (const k of keys) check(isNonNegNum(x[k]), `totals.${k} out of range`);
  return Object.fromEntries(keys.map((k) => [k, x[k] as number])) as unknown as RunTotals;
}

function parseHistory(x: unknown, graph: RunGraph): string[] {
  check(Array.isArray(x) && x.length >= 1, 'history must be a non-empty array');
  check(x[0] === graph.start, 'history must begin at the opening node');
  check(new Set(x).size === x.length, 'history repeats a node');
  for (let i = 0; i < x.length; i++) {
    const id = x[i];
    check(typeof id === 'string' && graph.nodes[id], `history has unknown node ${String(id)}`);
    if (i > 0) check(graph.nodes[x[i - 1] as string]?.next.includes(id), `history jumps from ${String(x[i - 1])} to ${id}`);
  }
  return x as string[];
}

function parseDraft(x: unknown, id: string, isCurrent: boolean): DraftRecord {
  check(isObj(x), `draft ${id} must be an object`);
  const { offer, resolved, pick, replaced } = x;
  check(Array.isArray(offer) && offer.length <= RUN_TUNING.draftOfferSize && offer.every(isRelicId), `draft ${id} offer invalid`);
  check(new Set(offer).size === offer.length, `draft ${id} offer repeats a relic`);
  check(typeof resolved === 'boolean', `draft ${id} resolved flag invalid`);
  check(resolved || isCurrent, `draft ${id} was left unresolved`);
  check(pick === null || (isRelicId(pick) && offer.includes(pick)), `draft ${id} pick was not offered`);
  check(replaced === null || isRelicId(replaced), `draft ${id} replaced relic invalid`);
  check(resolved || (pick === null && replaced === null), `draft ${id} has a pick but is unresolved`);
  return { offer: offer as RelicId[], resolved, pick: pick as RelicId | null, replaced: replaced as RelicId | null };
}

function parseRun(x: unknown): RunState {
  check(isObj(x), 'run must be an object');
  check(x.version === RUN_STATE_VERSION, 'unsupported run state version');
  check(typeof x.runId === 'string' && RUN_ID.test(x.runId), 'runId invalid');
  check(isNonNegInt(x.seed) && x.seed <= 0xffffffff, 'seed out of range');
  check(isStarterId(x.starter), 'unknown starter');
  check(x.outcome === 'active', 'only active runs are checkpointed');
  const graph = generateGraph(x.seed);
  const history = parseHistory(x.history, graph);
  check(x.at === history[history.length - 1], 'current node does not end the history');
  const at = x.at as string;
  const loadout = parseLoadout(x.loadout);
  check(x.maxHealth === RUN_TUNING.maxHealth, 'maxHealth mismatch');
  check(Number.isSafeInteger(x.health) && (x.health as number) >= 1 && (x.health as number) <= RUN_TUNING.maxHealth, 'health out of range');
  const charges = parseCharges(x.charges, loadout);

  check(Array.isArray(x.completed) && new Set(x.completed).size === x.completed.length, 'completed must be a unique list');
  const completed = x.completed as unknown[];
  for (const id of completed) {
    check(typeof id === 'string' && history.includes(id), `completed node ${String(id)} not in history`);
    const kind = graph.nodes[id]?.kind;
    check(kind === 'encounter' || kind === 'boss', `completed node ${id} is not a combat node`);
  }
  for (const id of history.slice(0, -1)) {
    const kind = graph.nodes[id]?.kind;
    if (kind === 'encounter' || kind === 'boss') check(completed.includes(id), `left ${id} without clearing it`);
  }

  check(isObj(x.drafts), 'drafts must be an object');
  const drafts: Record<string, DraftRecord> = {};
  for (const [id, record] of Object.entries(x.drafts)) {
    check(history.includes(id) && graph.nodes[id]?.kind === 'station', `draft for non-station ${id}`);
    drafts[id] = parseDraft(record, id, id === at);
  }
  // Replay station decisions: offers must match generation and the loadout must follow.
  let replay: Loadout = [STARTERS[x.starter].relic];
  for (const id of history) {
    if (graph.nodes[id]?.kind !== 'station') continue;
    const record = drafts[id];
    check(record, `station ${id} has no draft record`);
    const expected = generateOffer(x.seed, id, replay);
    check(expected.length === record.offer.length && expected.every((r, i) => r === record.offer[i]), `draft ${id} offer was rerolled`);
    if (record.resolved && record.pick !== null) {
      const idx = record.replaced === null ? undefined : replay.indexOf(record.replaced);
      check(idx === undefined || idx >= 0, `draft ${id} replaced a relic that was not equipped`);
      const applied = applyDraft(replay, record.pick, idx);
      check(applied.ok, `draft ${id} is not a legal pick`);
      replay = applied.loadout;
    } else {
      check(record.replaced === null, `draft ${id} replaced without a pick`);
    }
  }
  check(replay.length === loadout.length && replay.every((r, i) => r === loadout[i]), 'loadout does not match recorded drafts');

  check(isObj(x.attempts), 'attempts must be an object');
  for (const [id, n] of Object.entries(x.attempts)) {
    check(history.includes(id) && isNonNegInt(n), `attempts for ${id} invalid`);
  }

  return {
    version: RUN_STATE_VERSION,
    runId: x.runId,
    seed: x.seed,
    starter: x.starter,
    graph,
    at,
    history,
    loadout,
    health: x.health as number,
    maxHealth: RUN_TUNING.maxHealth,
    charges,
    completed: completed as string[],
    drafts,
    attempts: x.attempts as Record<string, number>,
    outcome: 'active',
    totals: parseTotals(x.totals),
  };
}

function parseEntry(x: unknown, run: RunState): RoomEntry | null {
  const expected = roomEntry(run);
  if (x === null) {
    check(expected === null, 'missing room entry for an uncleared room');
    return null;
  }
  check(isObj(x) && expected, 'room entry recorded where none applies');
  check(
    x.nodeId === expected.nodeId &&
      x.roomId === expected.roomId &&
      x.variant === expected.variant &&
      x.seed === expected.seed &&
      x.health === expected.health,
    'room entry does not match the run state',
  );
  check(Array.isArray(x.loadout) && x.loadout.length === expected.loadout.length && x.loadout.every((r, i) => r === expected.loadout[i]), 'room entry loadout mismatch');
  const charges = parseCharges(x.charges, expected.loadout);
  check(
    charges.bellKills === expected.charges.bellKills &&
      charges.bellCharged === expected.charges.bellCharged &&
      charges.knotMarked === expected.charges.knotMarked,
    'room entry charges mismatch',
  );
  return expected;
}

/** Validate a checkpoint from text or an already-parsed object. Never throws. */
export function parseCheckpoint(input: unknown): Parsed<Checkpoint> {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      return saveError('corrupt', 'checkpoint is not valid JSON');
    }
  }
  if (!isObj(data)) return saveError('corrupt', 'checkpoint is not an object');
  if (data.saveVersion !== SAVE_VERSION) return saveError('version', `unsupported save version ${String(data.saveVersion)}`);
  if (data.rulesVersion !== RUN_RULES_VERSION) return saveError('version', `rules version ${String(data.rulesVersion)} differs`);
  if (data.contentVersion !== CONTENT_VERSION) return saveError('version', `content version ${String(data.contentVersion)} differs`);
  try {
    const run = parseRun(data.run);
    if (data.graphFingerprint !== graphFingerprint(run.graph)) return saveError('version', 'expedition content changed since this save');
    const entry = parseEntry(data.entry ?? null, run);
    return {
      ok: true,
      value: {
        saveVersion: SAVE_VERSION,
        rulesVersion: RUN_RULES_VERSION,
        contentVersion: CONTENT_VERSION,
        graphFingerprint: graphFingerprint(run.graph),
        run,
        entry,
      },
    };
  } catch (err) {
    if (err instanceof Invalid) return saveError('invalid', err.message);
    return saveError('invalid', 'checkpoint could not be validated');
  }
}

// ---------------------------------------------------------------------------
// Store and transactions
// ---------------------------------------------------------------------------

export class CheckpointStore {
  private readonly slots: TwoSlotStore<Checkpoint>;

  constructor(storage: StorageLike | null = browserStorage(), prefix = 'oys.checkpoint') {
    this.slots = new TwoSlotStore<Checkpoint>(storage, prefix, parseCheckpoint, checkpointToJSON);
  }

  /** False when saving is impossible right now; the UI must disclose it. */
  get available(): boolean {
    return this.slots.available;
  }

  load(): SlotLoad<Checkpoint> {
    return this.slots.load();
  }

  /** Write the run's current safe-boundary checkpoint. */
  save(run: RunState): SlotSaveResult {
    return this.slots.save(makeCheckpoint(run));
  }

  clear(): boolean {
    return this.slots.clear();
  }
}

export interface CommitResult {
  readonly run: RunState;
  /** False when this completion had already been committed (no second reward). */
  readonly committed: boolean;
  readonly save: SlotSaveResult;
}

/**
 * Complete the room, grant its reward and advance the checkpoint as one idempotent step.
 * Replaying it (double callback, reload then replay) cannot pay twice.
 */
export function commitRoomCompletion(store: CheckpointStore, run: RunState, result: RoomResult): CommitResult {
  const next = completeRoom(run, result);
  return { run: next, committed: next !== run, save: store.save(next) };
}

/** Restore a loaded checkpoint: the run plus the entry state Continue restarts from. */
export function resumeFrom(cp: Checkpoint): { run: RunState; entry: RoomEntry | null } {
  return { run: cp.run, entry: roomEntry(cp.run) };
}
