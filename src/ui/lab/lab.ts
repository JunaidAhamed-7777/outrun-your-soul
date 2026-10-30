/**
 * Dev-only lab for the overlay and the procedural audio. Open /ui-lab.html with the
 * Vite dev server. Not part of the production build (vite builds index.html only).
 */
import type { SimEvent, SimState } from '../../sim/types';
import { createAudio } from '../../audio/audio';
import type { CueName } from '../../audio/cues';
import { CUE_SPECS } from '../../audio/voices';
import { loadSettings, saveSettings } from '../../save/settings';
import { createUI } from '../ui';
import { LAB_ROOM, labState, withThread } from './fixture';

const stage = document.getElementById('stage') as HTMLElement;
const panel = document.getElementById('lab') as HTMLElement;
const log = document.getElementById('log') as HTMLElement;

const { settings, storageAvailable } = loadSettings();
const audio = createAudio();
audio.setMuted(settings.muted);
audio.setVolumes(settings.musicVolume, settings.sfxVolume);

let state: SimState = labState();
let thread = 4;
let running = true;

function note(msg: string): void {
  log.textContent = `${new Date().toLocaleTimeString()}  ${msg}\n${log.textContent ?? ''}`.slice(0, 1600);
}

const ui = createUI(stage, settings, {
  onStart() {
    void audio.unlock().then(() => audio.ui('start'));
    ui.showHud(LAB_ROOM);
    note('onStart');
  },
  onResume() {
    audio.resume();
    audio.ui('close');
    running = true;
    note('onResume');
  },
  onRestart() {
    state = labState();
    thread = 4;
    ui.showHud(LAB_ROOM);
    running = true;
    note('onRestart');
  },
  onPause() {
    audio.ui('open');
    running = false;
    note('onPause');
  },
  onSettingsChange(s) {
    audio.setMuted(s.muted);
    audio.setVolumes(s.musicVolume, s.sfxVolume);
    note(`settings ${JSON.stringify(s)} saved=${saveSettings(s)}`);
  },
});
ui.setStorageNotice(storageAvailable);
ui.showTitle();

function emit(...events: SimEvent[]): void {
  void audio.unlock();
  ui.handleEvents(events, state);
  audio.handleEvents(events, state);
  note(events.map((e) => e.type).join(', '));
}

const at = { x: 4, y: 6 };

type Action = [label: string, run: () => void];
const groups: [string, Action[]][] = [
  [
    'Panels',
    [
      ['Title', () => ui.showTitle()],
      ['HUD', () => { ui.hideTitle(); ui.showHud(LAB_ROOM); }],
      ['Pause', () => { ui.showPause('user'); running = false; }],
      ['Interrupted', () => { ui.showPause('interrupted'); running = false; }],
      ['Victory', () => { emit({ type: 'victory', t: 0 }); ui.showResult('victory', { ...state, time: 73.4 }); }],
      ['Defeat', () => { emit({ type: 'defeat', t: 0 }); ui.showResult('defeat', { ...state, health: 0, time: 48.2 }); }],
      ['Fatal', () => ui.showFatal('This browser can’t draw the courtyard.', 'Outrun Your Soul needs WebGL 2. Try a recent Chrome, Safari or Firefox, or enable hardware acceleration.')],
      ['Storage off', () => ui.setStorageNotice(false)],
      ['Storage on', () => ui.setStorageNotice(true)],
    ],
  ],
  [
    'State',
    [
      ['Hit body', () => { state = { ...state, health: Math.max(0, state.health - 1) }; emit({ type: 'hit', t: 0, endpoint: 'body', attackId: 1, at, health: state.health, source: 'bolt' }); }],
      ['Hit soul', () => { state = { ...state, health: Math.max(0, state.health - 1) }; emit({ type: 'hit', t: 0, endpoint: 'soul', attackId: 2, at, health: state.health, source: 'bolt' }); }],
      ['Heal', () => { state = { ...state, health: Math.min(state.maxHealth, state.health + 1) }; }],
      ['Thread +1', () => { thread = Math.min(6, thread + 1); }],
      ['Thread -1', () => { thread = Math.max(0, thread - 1); }],
      ['Gate ready', () => { state = { ...state, gate: 'ready' }; emit({ type: 'roomCleared', t: 0 }, { type: 'gate', t: 0, status: 'ready' }); }],
      ['Gate open', () => { state = { ...state, gate: 'open' }; emit({ type: 'gate', t: 0, status: 'open' }); }],
      ['Gate sealed', () => { state = { ...state, gate: 'sealed' }; }],
      ['Lane active', () => { state = { ...state, lanes: [{ id: 1, key: 'l1', rect: { x: 0, y: 7, w: 8, h: 1 }, status: 'active', attackId: 9, cycleTime: 2.1 }] }; emit({ type: 'lane', t: 0, laneId: 1, status: 'active' }); }],
      ['Lane idle', () => { state = { ...state, lanes: [] }; emit({ type: 'lane', t: 0, laneId: 1, status: 'idle' }); }],
    ],
  ],
  [
    'Sequences',
    [
      ['Dash', () => emit({ type: 'dashStart', t: 0, from: state.soul.pos, to: { x: 6, y: 5 }, limitedBy: 'none' }, { type: 'separated', t: 0 })],
      ['Short dash', () => emit({ type: 'dashStart', t: 0, from: { x: 4, y: 3 }, to: { x: 4.6, y: 3.2 }, limitedBy: 'none' })],
      ['Return', () => emit({ type: 'returnStart', t: 0, from: at })],
      ['Reunion: contact', () => emit({ type: 'reunion', t: 0, at, cause: 'contact' })],
      ['Reunion: return', () => emit({ type: 'reunion', t: 0, at, cause: 'return' })],
      ['Reunion: exhaust', () => emit({ type: 'reunion', t: 0, at, cause: 'exhaustion' })],
      ['Needler track', () => emit({ type: 'telegraph', t: 0, enemyId: 1, phase: 'tracking', target: 'body' })],
      ['Needler lock', () => emit({ type: 'telegraph', t: 0, enemyId: 1, phase: 'locked', target: 'body' })],
      ['Keeper track', () => emit({ type: 'telegraph', t: 0, enemyId: 2, phase: 'tracking', target: 'soul' })],
      ['Keeper lock', () => emit({ type: 'telegraph', t: 0, enemyId: 2, phase: 'locked', target: 'soul' })],
      ['Burst x12', () => emit(...Array.from({ length: 12 }, (_, i): SimEvent => ({ type: 'fire', t: i, enemyId: i, projectileId: i, attackId: i, at: { x: i % 8, y: 4 } })))],
    ],
  ],
];

const cueNames = Object.keys(CUE_SPECS) as CueName[];
const variants: Partial<Record<CueName, string[]>> = {
  reunionChord: ['contact', 'return', 'exhaustion'],
  hitCrunch: ['body', 'soul'],
  trackTick: ['body', 'soul'],
  lockTick: ['body', 'soul'],
  shieldTick: ['grace', 'dash'],
};
groups.push([
  'Cues',
  cueNames.flatMap((cue): Action[] =>
    (variants[cue] ?? ['']).map((variant): Action => [
      variant ? `${cue}:${variant}` : cue,
      () => {
        void audio.unlock().then(() => audio.audition?.({ cue, variant }));
      },
    ]),
  ),
]);
groups.push([
  'UI sounds',
  (['tap', 'open', 'close', 'start'] as const).map((n): Action => [n, () => void audio.unlock().then(() => audio.ui(n))]),
]);

for (const [title, actions] of groups) {
  const details = document.createElement('details');
  details.open = title !== 'Cues';
  const summary = document.createElement('summary');
  summary.textContent = title;
  details.append(summary);
  const wrap = document.createElement('div');
  for (const [label, run] of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', run);
    wrap.append(b);
  }
  details.append(wrap);
  panel.append(details);
}

function advance(dt: number): void {
  if (running) state = { ...state, time: state.time + dt };
  const shown = withThread(state, thread);
  ui.update(shown, dt);
  audio.update(shown, dt);
}

let last = performance.now();
function frame(now: number): void {
  advance(Math.min(0.1, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** Manual stepping for automated checks when rAF is throttled in a background tab. */
(window as unknown as { labStep: (seconds: number) => void }).labStep = (seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) advance(1 / 60);
};
(window as unknown as { labClick: (label: string) => void }).labClick = (label: string) => {
  [...document.querySelectorAll<HTMLButtonElement>('#lab button')].find((b) => b.textContent === label)?.click();
};

document.getElementById('toggle-lab')?.addEventListener('click', () => panel.classList.toggle('collapsed'));
