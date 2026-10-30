/**
 * Local progression across sessions: completed-run records and a small discovery atlas.
 * Unlocks are lateral (a second starter), never permanent damage or health inflation.
 * Every update is idempotent per run ID, so replays and reloads cannot double-count.
 */
import { browserStorage, saveError, TwoSlotStore, type Parsed, type SlotLoad, type SlotSaveResult, type StorageLike } from '../save/storage';
import { BOSS_ROOM_ID, isFinished, ROOM_TEMPLATE_IDS, type EncounterRoomId, type RunState } from './expedition';
import { isRelicId, isStarterId, RELIC_IDS, STARTER_IDS, type RelicId, type StarterId } from './relics';

export const PROGRESS_VERSION = 1;
export const MAX_RECORDS = 20;
/** Run IDs remembered for exactly-once accounting. */
export const MAX_TRACKED_RUNS = 200;
export const DEFAULT_STARTERS: readonly StarterId[] = ['threadkeeper'];

export type RecordedOutcome = 'victory' | 'abandoned';

export interface RunRecord {
  readonly runId: string;
  readonly starter: StarterId;
  readonly outcome: RecordedOutcome;
  readonly roomsCleared: number;
  /** Deepest graph depth reached (0 opening ... 7 ending). */
  readonly depth: number;
  readonly loadout: readonly RelicId[];
  readonly failedAttempts: number;
}

export interface Atlas {
  readonly relicsSeen: readonly RelicId[];
  readonly roomsCleared: readonly EncounterRoomId[];
  readonly startersUnlocked: readonly StarterId[];
  readonly bossDefeated: boolean;
}

export interface ProgressState {
  readonly version: number;
  readonly runsStarted: number;
  readonly runsFinished: number;
  readonly victories: number;
  readonly records: readonly RunRecord[];
  readonly startedRunIds: readonly string[];
  readonly finishedRunIds: readonly string[];
  readonly atlas: Atlas;
}

export function createProgress(): ProgressState {
  return {
    version: PROGRESS_VERSION,
    runsStarted: 0,
    runsFinished: 0,
    victories: 0,
    records: [],
    startedRunIds: [],
    finishedRunIds: [],
    atlas: { relicsSeen: [], roomsCleared: [], startersUnlocked: [...DEFAULT_STARTERS], bossDefeated: false },
  };
}

export function isStarterUnlocked(progress: ProgressState, starter: StarterId): boolean {
  return progress.atlas.startersUnlocked.includes(starter);
}

const ENCOUNTER_IDS: readonly string[] = [...ROOM_TEMPLATE_IDS, BOSS_ROOM_ID];
const capped = <T>(items: readonly T[], max: number): T[] => items.slice(Math.max(0, items.length - max));

/** Merge new items into an ordered set; returns the original array when nothing is new. */
function union<T>(base: readonly T[], extra: readonly T[], order: readonly T[]): readonly T[] {
  const set = new Set(base);
  if (extra.every((x) => set.has(x))) return base;
  for (const x of extra) set.add(x);
  return order.filter((x) => set.has(x));
}

export function recordRunStart(progress: ProgressState, run: RunState): ProgressState {
  if (progress.startedRunIds.includes(run.runId)) return progress;
  return {
    ...progress,
    runsStarted: progress.runsStarted + 1,
    startedRunIds: capped([...progress.startedRunIds, run.runId], MAX_TRACKED_RUNS),
  };
}

/** Record what a run has revealed so far (relics seen, rooms cleared, boss). Idempotent. */
export function noteDiscoveries(progress: ProgressState, run: RunState): ProgressState {
  const seen: RelicId[] = [...run.loadout, ...Object.values(run.drafts).flatMap((d) => d.offer)];
  const cleared = run.completed
    .map((id) => run.graph.nodes[id]?.roomId)
    .filter((r): r is EncounterRoomId => typeof r === 'string');
  const bossDefeated = progress.atlas.bossDefeated || run.completed.some((id) => run.graph.nodes[id]?.kind === 'boss');
  const relicsSeen = union(progress.atlas.relicsSeen, seen, RELIC_IDS);
  const roomsCleared = union(progress.atlas.roomsCleared, cleared, ENCOUNTER_IDS as readonly EncounterRoomId[]);
  if (relicsSeen === progress.atlas.relicsSeen && roomsCleared === progress.atlas.roomsCleared && bossDefeated === progress.atlas.bossDefeated) {
    return progress;
  }
  return { ...progress, atlas: { ...progress.atlas, relicsSeen, roomsCleared, bossDefeated } };
}

/**
 * Record a finished run exactly once. A run that reached a station (completed or failed)
 * laterally unlocks the Long Reach starter.
 */
export function recordRunEnd(progress: ProgressState, run: RunState): ProgressState {
  if (!isFinished(run) || progress.finishedRunIds.includes(run.runId)) return progress;
  const noted = noteDiscoveries(recordRunStart(progress, run), run);
  const outcome: RecordedOutcome = run.outcome === 'victory' ? 'victory' : 'abandoned';
  const reachedStation = run.history.some((id) => run.graph.nodes[id]?.kind === 'station');
  const depth = Math.max(...run.history.map((id) => run.graph.nodes[id]?.depth ?? 0));
  const record: RunRecord = {
    runId: run.runId,
    starter: run.starter,
    outcome,
    roomsCleared: run.totals.roomsCleared,
    depth,
    loadout: [...run.loadout],
    failedAttempts: run.totals.failedAttempts,
  };
  const startersUnlocked = reachedStation ? union<StarterId>(noted.atlas.startersUnlocked, ['long_reach'], STARTER_IDS) : noted.atlas.startersUnlocked;
  return {
    ...noted,
    runsFinished: noted.runsFinished + 1,
    victories: noted.victories + (outcome === 'victory' ? 1 : 0),
    records: capped([...noted.records, record], MAX_RECORDS),
    finishedRunIds: capped([...noted.finishedRunIds, run.runId], MAX_TRACKED_RUNS),
    atlas: { ...noted.atlas, startersUnlocked },
  };
}

// ---------------------------------------------------------------------------
// Validation and persistence
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;
const isRunId = (x: unknown): x is string => typeof x === 'string' && RUN_ID.test(x);
const uniqueList = <T>(x: unknown, valid: (v: unknown) => v is T, max: number): x is T[] =>
  Array.isArray(x) && x.length <= max && x.every(valid) && new Set(x).size === x.length;

function validRecord(x: unknown): x is RunRecord {
  return (
    isObj(x) &&
    isRunId(x.runId) &&
    isStarterId(x.starter) &&
    (x.outcome === 'victory' || x.outcome === 'abandoned') &&
    isCount(x.roomsCleared) &&
    isCount(x.depth) &&
    x.depth <= 7 &&
    isCount(x.failedAttempts) &&
    uniqueList(x.loadout, isRelicId, 2)
  );
}

export function parseProgress(input: unknown): Parsed<ProgressState> {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      return saveError('corrupt', 'progress is not valid JSON');
    }
  }
  if (!isObj(data)) return saveError('corrupt', 'progress is not an object');
  if (data.version !== PROGRESS_VERSION) return saveError('version', `unsupported progress version ${String(data.version)}`);
  const { runsStarted, runsFinished, victories, records, startedRunIds, finishedRunIds, atlas } = data;
  if (!isCount(runsStarted) || !isCount(runsFinished) || !isCount(victories) || victories > runsFinished) {
    return saveError('invalid', 'run counters out of range');
  }
  if (!Array.isArray(records) || records.length > MAX_RECORDS || !records.every(validRecord)) return saveError('invalid', 'run records invalid');
  if (!uniqueList(startedRunIds, isRunId, MAX_TRACKED_RUNS) || !uniqueList(finishedRunIds, isRunId, MAX_TRACKED_RUNS)) {
    return saveError('invalid', 'tracked run IDs invalid');
  }
  if (!isObj(atlas)) return saveError('invalid', 'atlas missing');
  const isRoom = (v: unknown): v is EncounterRoomId => typeof v === 'string' && ENCOUNTER_IDS.includes(v);
  if (
    !uniqueList(atlas.relicsSeen, isRelicId, RELIC_IDS.length) ||
    !uniqueList(atlas.roomsCleared, isRoom, ENCOUNTER_IDS.length) ||
    !uniqueList(atlas.startersUnlocked, isStarterId, STARTER_IDS.length) ||
    typeof atlas.bossDefeated !== 'boolean'
  ) {
    return saveError('invalid', 'atlas entries invalid');
  }
  if (!DEFAULT_STARTERS.every((s) => (atlas.startersUnlocked as StarterId[]).includes(s))) {
    return saveError('invalid', 'default starter missing');
  }
  return {
    ok: true,
    value: {
      version: PROGRESS_VERSION,
      runsStarted,
      runsFinished,
      victories,
      records: records as RunRecord[],
      startedRunIds,
      finishedRunIds,
      atlas: {
        relicsSeen: atlas.relicsSeen,
        roomsCleared: atlas.roomsCleared,
        startersUnlocked: atlas.startersUnlocked,
        bossDefeated: atlas.bossDefeated,
      },
    },
  };
}

export class ProgressStore {
  private readonly slots: TwoSlotStore<ProgressState>;

  constructor(storage: StorageLike | null = browserStorage(), prefix = 'oys.progress') {
    this.slots = new TwoSlotStore<ProgressState>(storage, prefix, parseProgress, (p) => p);
  }

  get available(): boolean {
    return this.slots.available;
  }

  load(): SlotLoad<ProgressState> {
    return this.slots.load();
  }

  /** Loaded progress, or a fresh record when absent/unreadable (never throws). */
  loadOrCreate(): ProgressState {
    return this.slots.load().value ?? createProgress();
  }

  save(progress: ProgressState): SlotSaveResult {
    return this.slots.save(progress);
  }

  clear(): boolean {
    return this.slots.clear();
  }
}
