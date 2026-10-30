/**
 * Application wiring: one simulation, one renderer, one UI overlay, one audio graph and
 * the expedition director. The simulation is advanced only by the fixed-step loop;
 * everything else reads it. The director decides which screen comes next and owns all
 * run-layer transitions and checkpoint writes.
 */
import { createAudio, type GameAudio } from '../audio/audio';
import { DEPARTURE_COURT, roomFor } from '../content/rooms';
import { bindLifecycle, createFixedLoop, type FixedLoop } from '../core';
import { bindPointerInput, GestureMachine } from '../input';
import { createRenderer, isWebGL2Available, type GameRenderer, type RenderOverlay } from '../render/renderer';
import { isStarterId, type RelicId } from '../run';
import { ProgressStore } from '../run/progress';
import { CheckpointStore } from '../save/checkpoint';
import { loadSettings, saveSettings, type Settings } from '../save/settings';
import { browserStorage } from '../save/storage';
import {
  checkInvariants,
  createSim,
  previewDash,
  previewReturn,
  STEP_SECONDS,
  stepSim,
  TUNING,
  type Command,
  type RoomDef,
  type SimEvent,
  type SimState,
} from '../sim';
import { BOSS_INTRO_SUBTITLE, createUI, type GameUI } from '../ui/ui';
import { AimTracker } from './aim';
import { bootFraction, bootScreen, SCRIPT_SHARE } from './boot';
import { Director, type Screen } from './director';
import { roomMeta } from './room-meta';
import { continueDetail, draftView, endingView, loadoutChips, routeChoices, starterOptions } from './views';

type Phase = 'title' | 'choosing' | 'playing' | 'paused' | 'ending' | 'result';
type RoomScreen = Extract<Screen, { kind: 'room' }>;

/** Real seconds the scene keeps animating after victory/defeat before the result panel. */
const ENDING_SECONDS = 1.4;
/** Total stops on the expedition graph (opening .. ending), for the intro card. */
const ROUTE_STOPS = 7;

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Content registry lookup; an unknown template falls back to a known room so a run never dead-ends. */
function resolveRoom(roomId: string, variant: number): RoomDef {
  try {
    return roomFor(roomId, variant);
  } catch {
    console.warn(`[rooms] '${roomId}' is not authored; using Departure Court`);
    return DEPARTURE_COURT;
  }
}

export interface GameHandle {
  readonly state: () => SimState;
  readonly phase: () => Phase;
}

export async function startGame(container: HTMLElement): Promise<GameHandle | null> {
  const boot = bootScreen();
  boot.progress(SCRIPT_SHARE, 'Loading the courtyard…');
  const params = new URLSearchParams(window.location.search);
  const debug = params.has('debug');
  const fixedSeed = params.get('seed');
  const storage = safeStorage();
  const loaded = loadSettings(storage);
  let settings: Settings = loaded.settings;

  const checkpoints = new CheckpointStore(browserStorage());
  const director = new Director({ checkpoints, progress: new ProgressStore(browserStorage()), resolveRoom });

  let phase: Phase = 'title';
  let current: RoomScreen | null = null;
  let room: RoomDef = DEPARTURE_COURT;
  let sim: SimState = createSim(room, { seed: 1 });
  let pendingCommands: Command[] = [];
  let frameEvents: SimEvent[] = [];
  let endingLeft = 0;
  let afterEnding: (() => void) | null = null;
  let transitionToken = 0;
  /** Settles when the latest room entry (with its iris transition) has finished. */
  let roomReady: Promise<void> = Promise.resolve();
  let invariantReported = false;
  const aim = new AimTracker();
  const machine = new GestureMachine();

  // Late-bound so callbacks created before construction can reference them.
  let renderer: GameRenderer | null = null;
  let loop: FixedLoop | null = null;
  const audio: GameAudio = createAudio();

  const ui: GameUI = createUI(container, settings, {
    onStart: () => beginNewExpedition(),
    onNewRun: () => beginNewExpedition(),
    onContinue: () => {
      void audio.unlock();
      audio.ui('start');
      const screen = director.continueRun();
      if (screen) present(screen);
      else beginNewExpedition();
    },
    onResume: () => resume(),
    onRestart: () => {
      ui.hidePause();
      ui.hideResult();
      if (current) roomReady = enterRoom(current);
    },
    onPause: () => pause('user'),
    onSettingsChange: (next) => {
      settings = next;
      saveSettings(settings, storage);
      audio.setMuted(settings.muted);
      audio.setVolumes(settings.musicVolume, settings.sfxVolume);
      renderer?.setReducedMotion(settings.reducedMotion);
    },
    onSound: (name) => audio.ui(name),
  });
  ui.setStorageNotice(loaded.storageAvailable);
  ui.setSaveNotice(checkpoints.available);
  audio.setMuted(settings.muted);
  audio.setVolumes(settings.musicVolume, settings.sfxVolume);

  if (!isWebGL2Available()) {
    boot.done();
    ui.showFatal('WebGL 2 is not available', 'This game needs a browser with WebGL 2 enabled. Try a current Chrome, Safari or Firefox.');
    return null;
  }
  try {
    renderer = await createRenderer(container, {
      reducedMotion: settings.reducedMotion,
      onLoadProgress: (loaded, total) =>
        boot.progress(bootFraction(loaded, total), loaded >= total ? 'Lighting the lamps…' : `Raising the courtyard · ${loaded}/${total}`),
    });
  } catch (err) {
    boot.done();
    ui.showFatal('The renderer could not start', String((err as Error)?.message ?? err));
    return null;
  }
  // Keep the overlay above the canvas regardless of creation order.
  container.appendChild(ui.root);
  const activeRenderer = renderer;
  activeRenderer.setRoom(room);

  function newSeed(): number {
    if (fixedSeed !== null) return Number(fixedSeed) >>> 0;
    return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  }

  function showTitle(): void {
    phase = 'title';
    ui.hideHud();
    ui.setBoss(null);
    const canContinue = director.hasContinue();
    // Peek at the saved room for the Continue caption without disturbing the active run.
    const peek = canContinue ? new Director({ checkpoints, progress: new ProgressStore(browserStorage()), resolveRoom }).continueRun() : null;
    const detail = continueDetail(peek);
    ui.showTitle(detail ? { canContinue, continueDetail: detail } : { canContinue });
  }

  function beginNewExpedition(): void {
    void audio.unlock();
    audio.ui('start');
    ui.hideTitle();
    phase = 'choosing';
    ui.showStarterSelect(starterOptions(director.progress), (id) => {
      if (!isStarterId(id)) return;
      present(director.newRun(newSeed(), id));
    });
  }

  /** Show whatever the director says comes next. */
  function present(screen: Screen): void {
    ui.hideChoice();
    ui.hideResult();
    ui.hidePause();
    switch (screen.kind) {
      case 'room':
        roomReady = enterRoom(screen);
        return;
      case 'route':
        phase = 'choosing';
        ui.hideHud();
        ui.showRouteChoice('Choose your line', routeChoices(screen.choices), (id) => present(director.chooseRoute(id)));
        return;
      case 'station':
        phase = 'choosing';
        ui.hideHud();
        void (async () => {
          const token = ++transitionToken;
          await activeRenderer.transitionOut();
          if (token !== transitionToken) return;
          activeRenderer.showStation();
          await activeRenderer.transitionIn();
        })();
        ui.showDraft(draftView(screen), (pick, replaceIndex) => {
          if (pick) activeRenderer.stationSignal('pick');
          activeRenderer.stationSignal('depart');
          present(director.takeDraft(pick as RelicId | null, replaceIndex));
        });
        return;
      case 'ending': {
        phase = 'choosing';
        ui.hideHud();
        current = null;
        ui.showEnding(endingView(screen.run, director.progressAtStart ?? director.progress, director.progress), () => {
          ui.hideChoice();
          showTitle();
        });
        return;
      }
    }
  }

  /** Iris out, build the room (leaving any station scene), iris in. Stale transitions are dropped. */
  async function enterRoom(screen: RoomScreen): Promise<void> {
    const token = ++transitionToken;
    phase = 'choosing';
    await activeRenderer.transitionOut();
    if (token !== transitionToken) return;
    activeRenderer.hideStation();
    startRoom(screen);
    await activeRenderer.transitionIn();
  }

  function startRoom(screen: RoomScreen): void {
    current = screen;
    room = screen.room;
    const entry = screen.entry;
    sim = createSim(room, { seed: entry.seed, params: entry.params, health: entry.health, maxHealth: entry.maxHealth, relics: entry.hooks, charges: entry.charges });
    pendingCommands = [];
    frameEvents = [];
    endingLeft = 0;
    afterEnding = null;
    invariantReported = false;
    aim.reset();
    machine.cancel('interrupted');
    activeRenderer.setRoom(room);
    ui.showHud(room);
    ui.setLoadout(loadoutChips(director.run, sim));
    const meta = roomMeta(entry.roomId);
    const subtitle =
      screen.attempt > 1 ? `Attempt ${screen.attempt} — the room is as you entered it.` : room.boss ? BOSS_INTRO_SUBTITLE : meta.blurb;
    ui.showRoomIntro(room.name || meta.name, subtitle, `${screen.label} · stop ${screen.depth + 1} of ${ROUTE_STOPS}`);
    phase = 'playing';
    loop?.resume();
  }

  function onRoomOver(): void {
    if (sim.outcome === 'victory') {
      // Commit completion + reward + checkpoint now (idempotent), so a reload on the
      // result panel never replays a cleared room.
      const next = director.roomVictory(sim);
      afterEnding = () =>
        ui.showResult('victory', sim, {
          primaryLabel: next.kind === 'ending' ? 'Pass the last gate' : 'Onward',
          onPrimary: () => present(next),
        });
    } else {
      const retry = director.roomDefeat();
      afterEnding = () =>
        ui.showResult('defeat', sim, {
          primaryLabel: 'Retry room',
          onPrimary: () => present(retry),
          secondaryLabel: 'Abandon expedition',
          onSecondary: () => present(director.abandon()),
          note: 'Continue restarts this room.',
        });
    }
  }

  function pause(reason: 'user' | 'interrupted'): void {
    machine.cancel('interrupted');
    aim.reset();
    pendingCommands = [];
    if (phase !== 'playing') return;
    phase = 'paused';
    loop?.pause();
    audio.suspend();
    ui.showPause(reason);
  }

  function resume(): void {
    if (phase !== 'paused') return;
    ui.hidePause();
    phase = 'playing';
    audio.resume();
    loop?.resume();
  }

  bindPointerInput(activeRenderer.canvas, machine, {
    onOutput: (out) => {
      if (phase !== 'playing') {
        aim.reset();
        return;
      }
      const command = aim.apply(out, activeRenderer.screenToGround);
      if (command) pendingCommands.push(command);
    },
    onInterrupt: () => pause('interrupted'),
  });

  bindLifecycle({
    onInterrupt: () => pause('interrupted'),
    onContextLost: () => {
      pause('interrupted');
      ui.showFatal('Graphics were interrupted', 'The browser reset the graphics context. Reload the page; Continue restarts this room.');
    },
  });

  function step(): void {
    if (phase !== 'playing' || sim.outcome !== 'playing') return;
    const commands = pendingCommands;
    pendingCommands = [];
    const events = stepSim(sim, commands);
    if (events.length) frameEvents.push(...events);
    if (import.meta.env.DEV && !invariantReported) {
      const problems = checkInvariants(sim);
      if (problems.length) {
        invariantReported = true;
        console.error('[sim invariants]', sim.tick, problems);
      }
    }
    if (sim.outcome !== 'playing') {
      phase = 'ending';
      endingLeft = ENDING_SECONDS;
      onRoomOver();
    }
  }

  function overlay(): RenderOverlay {
    const view = aim.view;
    const dashPreview = phase === 'playing' && view.aim ? previewDash(sim, view.aim) : null;
    const separated = sim.route.points.length > 0;
    const returnPreview = phase === 'playing' && !view.aim && separated ? previewReturn(sim) : null;
    return { dashPreview, aimCancel: view.cancelZone, returnPreview, queued: sim.buffered !== null };
  }

  function frame(alpha: number, realDt: number): void {
    if (frameEvents.length) {
      const events = frameEvents;
      frameEvents = [];
      activeRenderer.handleEvents(events, sim);
      audio.handleEvents(events, sim);
      ui.handleEvents(events, sim);
    }
    if (phase === 'ending') {
      endingLeft -= realDt;
      if (endingLeft <= 0) {
        phase = 'result';
        afterEnding?.();
        afterEnding = null;
      }
    }
    activeRenderer.render(sim, alpha, overlay(), realDt);
    if (phase === 'playing' || phase === 'paused' || phase === 'ending') {
      ui.update(sim, realDt);
      ui.setLoadout(loadoutChips(director.run, sim));
      const boss = sim.boss;
      ui.setBoss(boss ? { name: 'The Last Warden', heartHp: boss.hp, heartMax: boss.maxHp, stage: boss.stage, stages: boss.maxHp } : null);
    }
    audio.update(sim, realDt);
  }

  loop = createFixedLoop({ step, frame }, { stepSeconds: STEP_SECONDS, maxCatchUpSeconds: TUNING.maxCatchUpSeconds });
  loop.start();
  window.addEventListener('resize', () => activeRenderer.resize());
  showTitle();
  boot.progress(1, 'Ready');
  boot.done();

  const handle: GameHandle = { state: () => sim, phase: () => phase };
  if (debug) {
    (window as unknown as { __oys: unknown }).__oys = {
      ...handle,
      run: () => director.run,
      push: (command: Command) => pendingCommands.push(command),
      /** Start a fresh expedition with a starter, skipping the title/starter panels. Await it. */
      start: (starter = 'threadkeeper') => {
        ui.hideTitle();
        if (isStarterId(starter)) present(director.newRun(newSeed(), starter));
        return roomReady;
      },
      /** Settles once the current room entry transition has finished (await after Onward/route clicks). */
      ready: () => roomReady,
      pause: () => pause('user'),
      resume,
      /** Drive the game synchronously (hidden/throttled browser panes do not fire frames). */
      advance: (seconds: number, frameSeconds = 1 / 60) => {
        for (let t = 0; t < seconds - 1e-9; t += frameSeconds) {
          const steps = Math.round(frameSeconds / STEP_SECONDS);
          for (let i = 0; i < steps; i++) step();
          frame(1, frameSeconds);
        }
        return { t: sim.time, phase, outcome: sim.outcome, health: sim.health };
      },
    };
  }
  return handle;
}
