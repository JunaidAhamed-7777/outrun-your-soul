/**
 * Application wiring: one simulation, one renderer, one UI overlay, one audio graph.
 * The simulation is advanced only by the fixed-step loop; everything else reads it.
 */
import { createAudio, type GameAudio } from '../audio/audio';
import { DEPARTURE_COURT } from '../content/rooms/departure-court';
import { bindLifecycle, createFixedLoop, type FixedLoop } from '../core';
import { bindPointerInput, GestureMachine } from '../input';
import { createRenderer, isWebGL2Available, type GameRenderer, type RenderOverlay } from '../render/renderer';
import { loadSettings, saveSettings, type Settings } from '../save/settings';
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
import { createUI, type GameUI } from '../ui/ui';
import { AimTracker } from './aim';

type Phase = 'title' | 'playing' | 'paused' | 'ending' | 'result';

/** Real seconds the scene keeps animating after victory/defeat before the result panel. */
const ENDING_SECONDS = 1.4;

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface GameHandle {
  readonly state: () => SimState;
  readonly phase: () => Phase;
}

export async function startGame(container: HTMLElement): Promise<GameHandle | null> {
  const params = new URLSearchParams(window.location.search);
  const debug = params.has('debug');
  const seed = Number(params.get('seed') ?? '1') >>> 0;
  const storage = safeStorage();
  const loaded = loadSettings(storage);
  let settings: Settings = loaded.settings;

  let phase: Phase = 'title';
  let room: RoomDef = DEPARTURE_COURT;
  let sim: SimState = createSim(room, { seed });
  let pendingCommands: Command[] = [];
  let frameEvents: SimEvent[] = [];
  let endingLeft = 0;
  let invariantReported = false;
  const aim = new AimTracker();
  const machine = new GestureMachine();

  // Late-bound so callbacks created before construction can reference them.
  let renderer: GameRenderer | null = null;
  let loop: FixedLoop | null = null;
  const audio: GameAudio = createAudio();

  const ui: GameUI = createUI(container, settings, {
    onStart: () => {
      void audio.unlock();
      audio.ui('start');
      ui.hideTitle();
      startRoom();
    },
    onResume: () => resume(),
    onRestart: () => {
      ui.hidePause();
      ui.hideResult();
      startRoom();
    },
    onPause: () => pause('user'),
    onSettingsChange: (next) => {
      settings = next;
      saveSettings(settings, storage);
      audio.setMuted(settings.muted);
      audio.setVolumes(settings.musicVolume, settings.sfxVolume);
      renderer?.setReducedMotion(settings.reducedMotion);
    },
  });
  ui.setStorageNotice(loaded.storageAvailable);
  audio.setMuted(settings.muted);
  audio.setVolumes(settings.musicVolume, settings.sfxVolume);

  if (!isWebGL2Available()) {
    ui.showFatal('WebGL 2 is not available', 'This game needs a browser with WebGL 2 enabled. Try a current Chrome, Safari or Firefox.');
    return null;
  }
  try {
    renderer = await createRenderer(container, { reducedMotion: settings.reducedMotion });
  } catch (err) {
    ui.showFatal('The renderer could not start', String((err as Error)?.message ?? err));
    return null;
  }
  // Keep the overlay above the canvas regardless of creation order.
  container.appendChild(ui.root);
  const activeRenderer = renderer;
  activeRenderer.setRoom(room);

  function startRoom(): void {
    sim = createSim(room, { seed });
    pendingCommands = [];
    frameEvents = [];
    endingLeft = 0;
    invariantReported = false;
    aim.reset();
    machine.cancel('interrupted');
    activeRenderer.setRoom(room);
    ui.showHud(room);
    phase = 'playing';
    loop?.resume();
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
      ui.showFatal('Graphics were interrupted', 'The browser reset the graphics context. Reload the page to continue.');
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
        ui.showResult(sim.outcome === 'victory' ? 'victory' : 'defeat', sim);
      }
    }
    activeRenderer.render(sim, alpha, overlay(), realDt);
    ui.update(sim, realDt);
    audio.update(sim, realDt);
  }

  loop = createFixedLoop({ step, frame }, { stepSeconds: STEP_SECONDS, maxCatchUpSeconds: TUNING.maxCatchUpSeconds });
  loop.start();
  window.addEventListener('resize', () => activeRenderer.resize());
  ui.showTitle();

  const handle: GameHandle = { state: () => sim, phase: () => phase };
  if (debug) {
    (window as unknown as { __oys: unknown }).__oys = {
      ...handle,
      push: (command: Command) => pendingCommands.push(command),
      start: () => {
        ui.hideTitle();
        startRoom();
      },
      pause: () => pause('user'),
      resume,
    };
  }
  return handle;
}
