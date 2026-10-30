/**
 * Dev-only lab for the overlay and the procedural audio. Open /ui-lab.html with the
 * Vite dev server. Not part of the production build (vite builds index.html only).
 */
import type { SimEvent, SimState } from '../../sim/types';
import { createAudio } from '../../audio/audio';
import type { CueName } from '../../audio/cues';
import { CUE_SPECS } from '../../audio/voices';
import { Synth, courtyardImpulse } from '../../audio/synth';
import { playCue } from '../../audio/voicing';
import { loadSettings, saveSettings } from '../../save/settings';
import { createUI } from '../ui';
import { LAB_ROOM, labState, withThread } from './fixture';
import { DRAFT_FREE, DRAFT_FULL, LOADOUTS, ROUTES, ending, starterOptions } from './run-fixture';

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
  onContinue() {
    void audio.unlock().then(() => audio.ui('start'));
    ui.showHud(LAB_ROOM);
    note('onContinue');
  },
  onNewRun() {
    void audio.unlock();
    note('onNewRun');
    ui.showStarterSelect(starterOptions(false), (id) => note(`starter: ${id}`));
  },
  onSound(name) {
    void audio.unlock().then(() => audio.ui(name));
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
  (['tap', 'open', 'close', 'start', 'select', 'take', 'roomIntro', 'escaped', 'failed'] as const).map((n): Action => [
    n,
    () => void audio.unlock().then(() => audio.ui(n)),
  ]),
]);

const picked = (what: string) => (id: string | null, index?: number) => note(`${what}: ${id}${index === undefined ? '' : ` replacing #${index}`}`);
groups.splice(1, 0, [
  'Run',
  [
    ['Title: continue', () => ui.showTitle({ canContinue: true, continueDetail: 'Needle Gallery · 4 health' })],
    ['Title: fresh', () => ui.showTitle({ canContinue: false })],
    ['Starters', () => ui.showStarterSelect(starterOptions(false), picked('starter'))],
    ['Starters (lock)', () => ui.showStarterSelect(starterOptions(true), picked('starter'))],
    ['Route', () => ui.showRouteChoice('Choose your road', ROUTES, picked('route'))],
    ['Draft: free slot', () => ui.showDraft(DRAFT_FREE, picked('draft'))],
    ['Draft: full', () => ui.showDraft(DRAFT_FULL, picked('draft'))],
    ['Ending: escaped', () => ui.showEnding(ending(true), () => note('again'))],
    ['Ending: failed', () => ui.showEnding(ending(false), () => note('again'))],
    ['Room intro', () => ui.showRoomIntro('Needle Gallery', 'Cover splits a firing line from a longer flank.', 'Room 2 of 6')],
    ['Onward', () => ui.showResult('victory', { ...state, time: 41.2 }, { primaryLabel: 'Onward', onPrimary: () => note('onward') })],
    ['Defeat+abandon', () => ui.showResult('defeat', { ...state, health: 0 }, { primaryLabel: 'Retry room', secondaryLabel: 'Abandon expedition', onSecondary: () => note('abandon') })],
    ['Save off', () => ui.setSaveNotice(false)],
    ['Save on', () => ui.setSaveNotice(true)],
    ...Object.keys(LOADOUTS).map((k): Action => [`Loadout ${k}`, () => ui.setLoadout(LOADOUTS[k] ?? [])]),
  ],
]);
groups.splice(2, 0, [
  'Relic events',
  ['boost', 'charge', 'burst', 'decoyPlaced', 'decoyTaken', 'guarded', 'sweep', 'exposed', 'unknownThing'].map((type): Action => [
    type,
    () => emit({ type, t: 0, at: { x: 6, y: 5 } } as unknown as SimEvent),
  ]),
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
/** Render every cue offline and report loudness, so voicing is verified without a gesture. */
(window as unknown as { labRenderCues: () => Promise<unknown[]> }).labRenderCues = async () => {
  const results: unknown[] = [];
  for (const cue of cueNames) {
    for (const variant of variants[cue] ?? ['']) {
      const sr = 44100;
      const ctx = new OfflineAudioContext(2, Math.floor(sr * 3.6), sr);
      const out = ctx.createGain();
      out.connect(ctx.destination);
      const reverb = ctx.createConvolver();
      reverb.buffer = courtyardImpulse(ctx);
      const ret = ctx.createGain();
      ret.gain.value = 0.32;
      reverb.connect(ret).connect(out);
      const synth = new Synth(ctx, out, reverb);
      const voice = playCue(synth, { cue, variant, delay: 0, degree: 4, intensity: 1, pan: 0.3 }, 0.01);
      const buffer = await ctx.startRendering();
      let peak = 0;
      let sum = 0;
      let bad = 0;
      let lastLoud = 0;
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const d = buffer.getChannelData(ch);
        for (let i = 0; i < d.length; i++) {
          const x = d[i] ?? 0;
          if (!Number.isFinite(x)) bad++;
          const a = Math.abs(x);
          peak = Math.max(peak, a);
          sum += x * x;
          if (a > 0.002) lastLoud = Math.max(lastLoud, i / sr);
        }
      }
      const rms = Math.sqrt(sum / (buffer.length * buffer.numberOfChannels));
      results.push({ cue: variant ? `${cue}:${variant}` : cue, peak: +peak.toFixed(3), rms: +rms.toFixed(4), audibleUntil: +lastLoud.toFixed(2), declaredEnd: +voice.end.toFixed(2), bad });
    }
  }
  return results;
};
(window as unknown as { labAudio: typeof audio }).labAudio = audio;
(window as unknown as { labClick: (label: string) => void }).labClick = (label: string) => {
  [...document.querySelectorAll<HTMLButtonElement>('#lab button')].find((b) => b.textContent === label)?.click();
};

document.getElementById('toggle-lab')?.addEventListener('click', () => panel.classList.toggle('collapsed'));
