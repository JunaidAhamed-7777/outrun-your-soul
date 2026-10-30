/**
 * Expedition director: decides which screen comes next and owns every run-layer
 * transition, checkpoint write and progress record. DOM-free and deterministic so the
 * whole flow (new run -> rooms -> stations -> boss -> ending, Continue, retry) is tested
 * without a browser.
 *
 * Checkpoint boundaries (COMBAT_SPEC "Checkpoints"): after a route choice into a room,
 * after a station draft, and after a room completion (one idempotent transaction).
 * Continue always restarts the saved room from its entry state.
 */
import {
  abandonRun,
  choices,
  choose,
  createRun,
  currentNode,
  draftOffer,
  failRoom,
  isFinished,
  noteDiscoveries,
  recordRunEnd,
  recordRunStart,
  roomEntry,
  takeDraft,
  type DraftRecord,
  type ProgressState,
  type RelicId,
  type RoomEntry,
  type RouteChoice,
  type RunState,
  type StarterId,
} from '../run';
import { commitRoomCompletion, resumeFrom, type CheckpointStore } from '../save/checkpoint';
import type { ProgressStore } from '../run/progress';
import type { RoomDef, SimState } from '../sim/types';

export type Screen =
  | { readonly kind: 'room'; readonly entry: RoomEntry; readonly room: RoomDef; readonly label: string; readonly depth: number; readonly attempt: number }
  | { readonly kind: 'route'; readonly choices: readonly RouteChoice[] }
  | { readonly kind: 'station'; readonly label: string; readonly draft: DraftRecord; readonly run: RunState }
  | { readonly kind: 'ending'; readonly run: RunState; readonly escaped: boolean };

export interface DirectorDeps {
  readonly checkpoints: CheckpointStore;
  readonly progress: ProgressStore;
  /** Room data for a template ID and variant (content registry). */
  readonly resolveRoom: (roomId: string, variant: number) => RoomDef;
}

export class Director {
  private runState: RunState | null = null;
  private progressState: ProgressState;
  private progressBefore: ProgressState | null = null;

  constructor(private readonly deps: DirectorDeps) {
    this.progressState = deps.progress.loadOrCreate();
  }

  get run(): RunState | null {
    return this.runState;
  }

  get progress(): ProgressState {
    return this.progressState;
  }

  /** Progress as it was when the current run started or was continued (for "new in the atlas"). */
  get progressAtStart(): ProgressState | null {
    return this.progressBefore;
  }

  /** True when a saved, unfinished expedition can be continued. */
  hasContinue(): boolean {
    const loaded = this.deps.checkpoints.load();
    return loaded.value !== null && !isFinished(loaded.value.run);
  }

  newRun(seed: number, starter: StarterId): Screen {
    this.progressBefore = this.progressState;
    this.runState = createRun(seed >>> 0, starter);
    this.saveProgress(recordRunStart(this.progressState, this.runState));
    this.deps.checkpoints.save(this.runState);
    return this.screen();
  }

  /** Restore the saved checkpoint. Returns null when there is nothing valid to continue. */
  continueRun(): Screen | null {
    const loaded = this.deps.checkpoints.load();
    if (!loaded.value || isFinished(loaded.value.run)) return null;
    this.progressBefore = this.progressState;
    this.runState = resumeFrom(loaded.value).run;
    return this.screen();
  }

  /** The screen for the run's current position. */
  screen(): Screen {
    const run = this.require();
    if (isFinished(run)) return { kind: 'ending', run, escaped: run.outcome === 'victory' };
    const node = currentNode(run);
    const entry = roomEntry(run);
    if (entry) {
      return {
        kind: 'room',
        entry,
        room: this.deps.resolveRoom(entry.roomId, entry.variant),
        label: node.label,
        depth: node.depth,
        attempt: (run.attempts[node.id] ?? 0) + 1,
      };
    }
    const draft = draftOffer(run);
    if (draft && !draft.resolved) return { kind: 'station', label: node.label, draft, run };
    const next = choices(run);
    // A single onward path needs no decision screen: take it (and checkpoint) directly.
    if (next.length === 1) return this.chooseRoute(next[0]!.id);
    return { kind: 'route', choices: next };
  }

  /** Commit a cleared room (idempotent) and advance. */
  roomVictory(sim: SimState): Screen {
    const run = this.require();
    const entry = roomEntry(run);
    if (!entry) return this.screen();
    const { run: next } = commitRoomCompletion(this.deps.checkpoints, run, {
      nodeId: entry.nodeId,
      health: Math.max(1, sim.health),
      stats: {
        hits: sim.stats.hits,
        cuts: sim.stats.cuts,
        kills: sim.stats.kills,
        contactReunions: sim.stats.contactReunions,
        seconds: sim.time,
      },
    });
    this.runState = next;
    this.saveProgress(noteDiscoveries(this.progressState, next));
    return this.screen();
  }

  /** Record a defeat; the next screen is the same room again (room-entry restart). */
  roomDefeat(): Screen {
    this.runState = failRoom(this.require());
    this.deps.checkpoints.save(this.runState);
    return this.screen();
  }

  chooseRoute(choiceId: string): Screen {
    this.runState = choose(this.require(), choiceId);
    if (isFinished(this.runState)) return this.finish();
    this.deps.checkpoints.save(this.runState);
    return this.screen();
  }

  takeDraft(pick: RelicId | null, replaceIndex?: number): Screen {
    this.runState = takeDraft(this.require(), pick, replaceIndex);
    this.saveProgress(noteDiscoveries(this.progressState, this.runState));
    this.deps.checkpoints.save(this.runState);
    return this.screen();
  }

  abandon(): Screen {
    this.runState = abandonRun(this.require());
    return this.finish();
  }

  private finish(): Screen {
    const run = this.require();
    this.saveProgress(recordRunEnd(noteDiscoveries(this.progressState, run), run));
    this.deps.checkpoints.clear();
    return { kind: 'ending', run, escaped: run.outcome === 'victory' };
  }

  private saveProgress(next: ProgressState): void {
    this.progressState = next;
    this.deps.progress.save(next);
  }

  private require(): RunState {
    if (!this.runState) throw new Error('no active expedition');
    return this.runState;
  }
}
