/**
 * DOM overlay: title, HUD, hints, pause/settings, results, run choices (starter,
 * route, station draft), room intro, ending and fatal errors.
 * Presentation only — it never advances or alters the simulation or the run. The
 * HUD layer is pointer-transparent so gestures reach the play surface; only real
 * buttons and full-screen panels take input.
 *
 * Button handlers update the overlay themselves (Begin hides the title, Resume hides
 * the pause panel, a pick hides its choice panel, ...) and then notify the callbacks,
 * so show/hide calls from the integration are idempotent. Settings are not persisted
 * here: onSettingsChange receives a fresh copy for the integration to save and apply.
 */
import type { UiSound } from '../audio/audio';
import type { RoomDef, SimEvent, SimState } from '../sim/types';
import type { Settings } from '../save/settings';
import { button, el, iconSpan } from './dom';
import type { DraftView, RelicView } from './draft-logic';
import { HintTracker, genericHintsFor } from './hints';
import { bossBar, gateLabel, healthLabel, healthPips, resultStats, threadMeter, type BossView, type ThreadState } from './hud-logic';
import { ICONS } from './icons';
import { relicIconSvg } from './relic-icons';
import {
  draftContent,
  endingContent,
  routeContent,
  starterContent,
  type EndingView,
  type PanelContent,
  type PanelEnv,
  type RouteChoice,
  type StarterOption,
} from './run-panels';
import { injectStyles } from './styles';
import { createTitleVignette } from './title-vignette';

export type { DraftView, RelicView } from './draft-logic';
export type { EndingView, RouteChoice, StarterOption } from './run-panels';
export type { BossView } from './hud-logic';
export { BOSS_HINT, BOSS_INTRO_SUBTITLE, WARDEN_HINT } from './hints';

export interface UICallbacks {
  onStart(): void;
  onResume(): void;
  onRestart(): void;
  onPause(): void;
  onSettingsChange(s: Settings): void;
  /** Title 'Continue' (room-entry checkpoint). Falls back to onStart when absent. */
  onContinue?(): void;
  /** Title 'Expedition': the branching roguelite run. Shown only when provided. */
  onExpedition?(): void;
  /** Title / pause 'Levels': open the level select. The button is shown only when provided. */
  onLevels?(): void;
  /** Pause 'Main menu': leave the room for the title screen. Shown only when provided. */
  onMainMenu?(): void;
  /** Title 'New expedition' when a save exists. Falls back to onStart when absent. */
  onNewRun?(): void;
  /** Interface sounds for the new panels (wire to GameAudio.ui). */
  onSound?(name: UiSound): void;
}

export interface TitleOptions {
  readonly canContinue: boolean;
  /** Main 'Play' flow: label for the primary button and the level it starts. */
  readonly play?: { readonly label: string; readonly detail: string };
  /** e.g. "Needle Gallery · 4 health"; shown under the Continue caption. */
  readonly continueDetail?: string;
}

export interface ResultOptions {
  readonly primaryLabel?: string;
  /** Replaces onRestart for the primary button. */
  readonly onPrimary?: () => void;
  readonly secondaryLabel?: string;
  readonly onSecondary?: () => void;
  /** Replaces the default note under the buttons ('' hides it). */
  readonly note?: string;
}

export interface LoadoutChip {
  readonly id: string;
  readonly name: string;
  readonly charge?: number;
  readonly maxCharge?: number;
  /** e.g. a running Needlesong boost. */
  readonly active?: boolean;
}

export interface GameUI {
  readonly root: HTMLElement;
  showTitle(opts?: TitleOptions): void;
  hideTitle(): void;
  showHud(room: RoomDef): void;
  hideHud(): void;
  update(state: SimState, realDt: number): void;
  handleEvents(events: readonly SimEvent[], state: SimState): void;
  showPause(reason: 'user' | 'interrupted'): void;
  hidePause(): void;
  showResult(kind: 'victory' | 'defeat', state: SimState, opts?: ResultOptions): void;
  hideResult(): void;
  showFatal(title: string, detail: string): void;
  setStorageNotice(available: boolean): void;
  readonly paused: boolean;
  /** Additive: sync settings changed elsewhere (no callback fired). */
  setSettings(s: Settings): void;
  /** Additive: remove listeners and DOM (labs, tests, hot reload). */
  destroy(): void;
  // ---- run layer (phase 2) ----
  showStarterSelect(options: readonly StarterOption[], onPick: (id: string) => void): void;
  showRouteChoice(title: string, choices: readonly RouteChoice[], onPick: (id: string) => void): void;
  showDraft(view: DraftView, onDone: (pick: string | null, replaceIndex?: number) => void): void;
  showEnding(view: EndingView, onAgain: () => void): void;
  /** Hide whichever choice panel (starter/route/draft/ending) is open. */
  hideChoice(): void;
  readonly choosing: boolean;
  setLoadout(relics: readonly LoadoutChip[]): void;
  showRoomIntro(name: string, subtitle: string, depthLabel: string): void;
  setSaveNotice(available: boolean): void;
  // ---- boss (phase 3) ----
  /** Slim boss bar under the top HUD row; null hides it. Cheap to call every frame. */
  setBoss(view: BossView | null): void;
}

const STORAGE_NOTICE = 'Settings can’t be saved in this browser; they will reset when you leave.';
const SAVE_NOTICE = 'Saving unavailable — progress lasts this session only.';
const INTERRUPTED_NOTE = 'Paused — your gesture was cancelled.';
/** Mirrors CONTINUE_LABEL in src/save/checkpoint.ts (asserted by tests). */
export const CONTINUE_CAPTION = 'Continue restarts this room.';
const CONFIRM_NEW = 'Tap again to replace your saved room';
const CONFIRM_MS = 3500;
/** Room intro: fade in, hold, fade out; never intercepts input. */
export const ROOM_INTRO_MS = 1600;

interface Toggle {
  readonly button: HTMLButtonElement;
  set(on: boolean): void;
}

export function createUI(container: HTMLElement, initialSettings: Settings, callbacks: UICallbacks): GameUI {
  injectStyles(document);
  let settings: Settings = { ...initialSettings };
  const sound = (name: UiSound): void => callbacks.onSound?.(name);

  const root = el('div', 'oys-ui');
  root.classList.toggle('is-reduced', settings.reducedMotion);
  container.appendChild(root);

  // ---------------------------------------------------------------- toggles
  const toggleSyncs: (() => void)[] = [];
  function makeToggle(label: string, read: () => boolean, onIcon: string, offIcon: string, flip: () => void): Toggle {
    const icon = iconSpan('');
    const state = el('span', 'oys-toggle-state');
    const b = button('oys-toggle', [icon, el('span', '', {}, [label]), state]);
    const toggle: Toggle = {
      button: b,
      set(on: boolean) {
        b.setAttribute('aria-pressed', String(on));
        state.textContent = on ? 'on' : 'off';
        icon.innerHTML = on ? onIcon : offIcon;
      },
    };
    b.addEventListener('click', () => flip());
    toggle.set(read());
    return toggle;
  }

  function applySettings(next: Settings, notify: boolean): void {
    settings = { ...next };
    root.classList.toggle('is-reduced', settings.reducedMotion);
    vignette.setReducedMotion(settings.reducedMotion);
    for (const sync of toggleSyncs) sync();
    if (notify) callbacks.onSettingsChange({ ...settings });
  }

  function toggleRow(): HTMLElement {
    const soundToggle = makeToggle('Sound', () => !settings.muted, ICONS.soundOn, ICONS.soundOff, () =>
      applySettings({ ...settings, muted: !settings.muted }, true),
    );
    const motion = makeToggle('Reduced motion', () => settings.reducedMotion, ICONS.motion, ICONS.motion, () =>
      applySettings({ ...settings, reducedMotion: !settings.reducedMotion }, true),
    );
    toggleSyncs.push(() => soundToggle.set(!settings.muted), () => motion.set(settings.reducedMotion));
    return el('div', 'oys-toggle-row', {}, [soundToggle.button, motion.button]);
  }

  const storageNotices: HTMLElement[] = [];
  function storageNote(): HTMLElement {
    const note = el('p', 'oys-note', { role: 'status' }, [STORAGE_NOTICE]);
    note.hidden = true;
    storageNotices.push(note);
    return note;
  }
  const saveNotices: HTMLElement[] = [];
  let saveAvailable = true;
  function saveNote(): HTMLElement {
    const note = el('p', 'oys-note', { role: 'status' }, [SAVE_NOTICE]);
    note.hidden = saveAvailable;
    saveNotices.push(note);
    return note;
  }

  // ---------------------------------------------------------------- title
  const vignette = createTitleVignette();
  vignette.setReducedMotion(settings.reducedMotion);
  const titleActions = el('div', 'oys-stack');
  const title = el('section', 'oys-panel oys-title', { 'aria-label': 'Outrun Your Soul' }, [
    el('div', 'oys-title-top', {}, [
      el('div', 'oys-eyebrow', {}, ['A funeral-railway escape']),
      el('h1', 'oys-wordmark', {}, [el('span', 'w1', {}, ['Outrun']), el('span', 'w2', {}, ['Your Soul'])]),
      el('p', 'oys-tagline', {}, ['Your body can outrun death. Your soul cannot.']),
    ]),
    vignette.svg,
    el('div', 'oys-title-bottom', {}, [
      titleActions,
      toggleRow(),
      storageNote(),
      saveNote(),
      el('p', 'oys-controls-line', {}, [el('b', '', {}, ['Drag']), ' to dash · ', el('b', '', {}, ['Tap']), ' to return']),
      el('p', 'oys-credit', {}, ['Made by Junaid']),
    ]),
  ]);
  title.hidden = true;
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;

  function levelsButton(): HTMLElement[] {
    if (!callbacks.onLevels) return [];
    const levels = button('oys-btn oys-btn--ghost', 'Levels');
    levels.addEventListener('click', () => {
      hideTitle();
      callbacks.onLevels?.();
    });
    return [levels];
  }

  function buildTitleActions(opts: TitleOptions): HTMLElement {
    if (confirmTimer) clearTimeout(confirmTimer);
    confirmTimer = null;
    if (opts.play) {
      // Main flow: play the levels in order; expedition and level select are secondary.
      const play = button('oys-btn', opts.play.label, { 'aria-describedby': 'oys-play-cap' });
      play.addEventListener('click', () => {
        hideTitle();
        callbacks.onStart();
      });
      const nodes: HTMLElement[] = [play, el('p', 'oys-continue-cap', { id: 'oys-play-cap' }, [opts.play.detail]), ...levelsButton()];
      if (callbacks.onExpedition) {
        const exp = button('oys-btn oys-btn--ghost', opts.canContinue ? 'Continue expedition' : 'Expedition');
        exp.addEventListener('click', () => {
          hideTitle();
          callbacks.onExpedition?.();
        });
        nodes.push(exp);
        // A saved expedition resumes from its room entry; say so plainly.
        if (opts.canContinue) nodes.push(el('p', 'oys-continue-cap', {}, [CONTINUE_CAPTION]));
      }
      titleActions.replaceChildren(...nodes);
      return play;
    }
    if (!opts.canContinue) {
      const begin = button('oys-btn', 'Begin');
      begin.addEventListener('click', () => {
        hideTitle();
        callbacks.onStart();
      });
      titleActions.replaceChildren(begin, ...levelsButton());
      return begin;
    }
    const cont = button('oys-btn', 'Continue', { 'aria-describedby': 'oys-continue-cap' });
    cont.addEventListener('click', () => {
      hideTitle();
      (callbacks.onContinue ?? callbacks.onStart)();
    });
    const nodes: HTMLElement[] = [cont, el('p', 'oys-continue-cap', { id: 'oys-continue-cap' }, [CONTINUE_CAPTION])];
    if (opts.continueDetail) nodes.push(el('p', 'oys-continue-detail', {}, [opts.continueDetail]));
    // Starting over replaces the saved room, so it takes a deliberate second tap.
    const fresh = button('oys-btn oys-btn--ghost', 'New expedition');
    let armed = false;
    fresh.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        fresh.textContent = CONFIRM_NEW;
        fresh.classList.add('is-confirm');
        confirmTimer = setTimeout(() => {
          armed = false;
          fresh.textContent = 'New expedition';
          fresh.classList.remove('is-confirm');
        }, CONFIRM_MS);
        return;
      }
      if (confirmTimer) clearTimeout(confirmTimer);
      hideTitle();
      (callbacks.onNewRun ?? callbacks.onStart)();
    });
    nodes.push(fresh, ...levelsButton());
    titleActions.replaceChildren(...nodes);
    return cont;
  }

  // ---------------------------------------------------------------- HUD
  const health = el('div', 'oys-health', { role: 'img', 'aria-label': 'Health' });
  const relicStrip = el('div', 'oys-relics', { role: 'list', 'aria-label': 'Relics' });
  const gate = el('div', 'oys-gate', { 'aria-live': 'polite' });
  const threadFill = el('div', 'oys-thread-fill');
  const thread = el('div', 'oys-thread', { role: 'meter', 'aria-label': 'Thread in use', 'aria-valuemin': '0' }, [
    iconSpan(ICONS.spool),
    el('div', 'oys-thread-track', {}, [threadFill]),
  ]);
  const pauseBtn = button('oys-icon-btn', [iconSpan(ICONS.pause)], { 'aria-label': 'Pause' });
  pauseBtn.addEventListener('click', () => {
    if (pauseVisible || resultVisible || choiceVisible) return;
    showPause('user');
    callbacks.onPause();
  });
  const hint = el('div', 'oys-hint', { 'aria-live': 'polite' });
  const vignetteFlash = el('div', 'oys-vignette', { 'aria-hidden': 'true' });
  const intro = el('div', 'oys-intro', { 'aria-live': 'polite' });
  const bossName = el('span', 'oys-boss-name');
  const bossStages = el('span', 'oys-boss-stages', { 'aria-hidden': 'true' });
  const bossSegments = el('div', 'oys-boss-bar', { 'aria-hidden': 'true' });
  const bossPanel = el('div', 'oys-boss', { role: 'img' }, [
    el('div', 'oys-boss-head', {}, [bossName, bossStages]),
    bossSegments,
  ]);
  const hud = el('div', 'oys-hud', {}, [
    vignetteFlash,
    el('div', 'oys-hud-top', {}, [
      el('div', 'oys-hud-left', {}, [health, relicStrip]),
      el('div', 'oys-hud-right', {}, [thread, pauseBtn]),
    ]),
    bossPanel,
    gate,
    hint,
  ]);
  hud.hidden = true;

  // ---------------------------------------------------------------- pause
  const pauseReason = el('p', 'oys-sub');
  const resumeBtn = button('oys-btn', 'Resume');
  const restartBtn = button('oys-btn oys-btn--ghost', 'Restart room');
  const pauseExits: HTMLElement[] = [];
  if (callbacks.onLevels) {
    const levelsBtn = button('oys-btn oys-btn--ghost', 'Level select');
    levelsBtn.addEventListener('click', () => {
      hidePause();
      callbacks.onLevels?.();
    });
    pauseExits.push(levelsBtn);
  }
  if (callbacks.onMainMenu) {
    const menuBtn = button('oys-btn oys-btn--ghost', 'Main menu');
    menuBtn.addEventListener('click', () => {
      hidePause();
      callbacks.onMainMenu?.();
    });
    pauseExits.push(menuBtn);
  }
  const pausePanel = el('section', 'oys-panel oys-scrim oys-pause', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'oys-pause-h' }, [
    el('div', 'oys-stack', {}, [el('h2', 'oys-heading', { id: 'oys-pause-h' }, ['Paused']), pauseReason, el('div', 'oys-rule')]),
    el('div', 'oys-stack', {}, [resumeBtn, restartBtn, ...pauseExits]),
    toggleRow(),
    el('p', 'oys-credit', {}, ['Made by Junaid']),
    el('p', 'oys-note', {}, [
      pauseExits.length
        ? 'Restarting returns you to this room’s entrance. Leaving keeps your expedition saved: Continue restarts this room.'
        : 'Restarting returns you to this room’s entrance.',
    ]),
    storageNote(),
    saveNote(),
  ]);
  pausePanel.hidden = true;
  resumeBtn.addEventListener('click', () => {
    hidePause();
    callbacks.onResume();
  });
  restartBtn.addEventListener('click', () => {
    hidePause();
    callbacks.onRestart();
  });

  // ---------------------------------------------------------------- results
  const resultHeading = el('h2', 'oys-heading', { id: 'oys-result-h' });
  const resultSub = el('p', 'oys-sub');
  const resultStatsList = el('dl', 'oys-stats');
  const resultBtn = button('oys-btn', '');
  const resultSecondary = button('oys-btn oys-btn--ghost', '');
  const resultNote = el('p', 'oys-note');
  const resultPanel = el('section', 'oys-panel oys-scrim oys-result', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'oys-result-h' }, [
    el('div', 'oys-stack', {}, [resultHeading, resultSub, el('div', 'oys-rule'), resultStatsList, resultBtn, resultSecondary, resultNote]),
  ]);
  resultPanel.hidden = true;
  let resultPrimary: () => void = () => callbacks.onRestart();
  let resultSecondaryAction: (() => void) | null = null;
  resultBtn.addEventListener('click', () => {
    hideResult();
    resultPrimary();
  });
  resultSecondary.addEventListener('click', () => {
    hideResult();
    resultSecondaryAction?.();
  });

  // ---------------------------------------------------------------- choice panel (starter / route / draft / ending)
  const choicePanel = el('section', 'oys-panel oys-scrim oys-choice', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'oys-choice-h' });
  choicePanel.hidden = true;

  // ---------------------------------------------------------------- fatal
  const fatalHeading = el('h2', 'oys-heading');
  const fatalDetail = el('p', 'oys-note');
  const reloadBtn = button('oys-btn oys-btn--ghost', 'Reload');
  reloadBtn.addEventListener('click', () => location.reload());
  const fatalPanel = el('section', 'oys-panel oys-fatal', { role: 'alert' }, [
    el('div', 'oys-stack', {}, [fatalHeading, el('div', 'oys-rule'), fatalDetail, reloadBtn]),
  ]);
  fatalPanel.hidden = true;

  root.append(hud, intro, title, pausePanel, resultPanel, choicePanel, fatalPanel);

  // ---------------------------------------------------------------- state
  let titleVisible = false;
  let pauseVisible = false;
  let resultVisible = false;
  let choiceVisible = false;
  let fatalVisible = false;
  let hudVisible = false;
  const hints = new HintTracker();
  let lastHealth = -1;
  let lastMaxHealth = -1;
  let lastThread = '';
  let lastGate: string | null = null;
  let lastHintId: string | null = null;
  let lastLoadout = '';
  let lastBoss = '';
  let lastBossHp = -1;
  let pips: HTMLElement[] = [];
  let introTimers: ReturnType<typeof setTimeout>[] = [];

  function focusSoon(node: HTMLElement | null): void {
    if (!node) return;
    // After display change; preventScroll keeps the fixed layout still.
    requestAnimationFrame(() => node.focus({ preventScroll: true }));
  }

  function showTitle(opts: TitleOptions = { canContinue: false }): void {
    if (fatalVisible) return;
    hidePause();
    hideResult();
    hideChoice();
    const primary = buildTitleActions(opts);
    title.classList.toggle('has-continue', opts.canContinue);
    titleVisible = true;
    title.hidden = false;
    vignette.start();
    focusSoon(primary);
  }
  function hideTitle(): void {
    titleVisible = false;
    title.hidden = true;
    vignette.stop();
    if (confirmTimer) clearTimeout(confirmTimer);
    confirmTimer = null;
  }

  function renderPips(state: SimState): void {
    const filled = healthPips(state.health, state.maxHealth);
    if (pips.length !== filled.length) {
      health.replaceChildren(...filled.map(() => el('span', 'oys-pip')));
      pips = [...health.children] as HTMLElement[];
    }
    filled.forEach((on, i) => pips[i]?.classList.toggle('is-empty', !on));
    health.setAttribute('aria-label', healthLabel(state.health, state.maxHealth));
  }

  function crackPip(index: number): void {
    const pip = pips[index];
    if (!pip || typeof pip.animate !== 'function') return;
    const keyframes: Keyframe[] = settings.reducedMotion
      ? [{ opacity: 0.2 }, { opacity: 1 }]
      : [
          { transform: 'rotate(45deg) scale(1.7)', filter: 'brightness(2)' },
          { transform: 'rotate(45deg) scale(1)', filter: 'brightness(1)' },
        ];
    pip.animate(keyframes, { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  function flashDamage(): void {
    if (typeof vignetteFlash.animate !== 'function') return;
    vignetteFlash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 0 }], {
      duration: settings.reducedMotion ? 320 : 460,
      easing: 'ease-out',
    });
  }

  function showHud(room: RoomDef): void {
    hudVisible = true;
    hud.hidden = false;
    hints.reset([...(room.hints ?? []), ...genericHintsFor(room)]);
    // An awake boss is introduced at once; a dormant one when it wakes.
    if (room.boss && !room.boss.dormant) hints.trigger('boss');
    lastHealth = -1;
    lastMaxHealth = -1;
    lastThread = '';
    lastGate = null;
    lastHintId = null;
    hint.classList.remove('is-on');
    gate.classList.remove('is-on');
  }
  function hideHud(): void {
    hudVisible = false;
    hud.hidden = true;
  }

  function setLoadout(relics: readonly LoadoutChip[]): void {
    const key = JSON.stringify(relics.map((r) => [r.id, r.name, r.charge ?? null, r.maxCharge ?? null, Boolean(r.active)]));
    if (key === lastLoadout) return;
    lastLoadout = key;
    relicStrip.replaceChildren(
      ...relics.slice(0, 2).map((r) => {
        const max = Math.max(0, Math.floor(r.maxCharge ?? 0));
        const charge = Math.max(0, Math.min(max, Math.floor(r.charge ?? 0)));
        const charged = max > 0 && charge >= max;
        let label = r.name;
        if (max > 0) label += charged ? ', charged' : `, ${charge} of ${max}`;
        if (r.active) label += ', active';
        const chip = el('span', 'oys-relic', { role: 'listitem', 'aria-label': label, title: label }, [
          iconSpan(relicIconSvg(r.id, 20)),
        ]);
        chip.classList.toggle('is-active', Boolean(r.active));
        chip.classList.toggle('is-charged', charged);
        if (max > 0) {
          chip.append(
            el('span', 'oys-charges', { 'aria-hidden': 'true' }, Array.from({ length: max }, (_, i) => el('span', i < charge ? 'oys-charge is-full' : 'oys-charge'))),
          );
        }
        return chip;
      }),
    );
  }

  function setBoss(view: BossView | null): void {
    const key = view ? JSON.stringify([view.name, view.heartHp, view.heartMax, view.stage, view.stages]) : '';
    if (key === lastBoss) return;
    lastBoss = key;
    hud.classList.toggle('has-boss', view !== null);
    bossPanel.classList.toggle('is-on', view !== null);
    if (!view) {
      lastBossHp = -1;
      return;
    }
    const bar = bossBar(view);
    bossName.textContent = view.name;
    bossStages.replaceChildren(...bar.stageDots.map((on) => el('span', on ? 'oys-boss-stage is-on' : 'oys-boss-stage')));
    if (bossSegments.children.length !== bar.segments.length) {
      bossSegments.replaceChildren(...bar.segments.map(() => el('span', 'oys-boss-seg')));
    }
    const segs = [...bossSegments.children] as HTMLElement[];
    bar.segments.forEach((on, i) => segs[i]?.classList.toggle('is-empty', !on));
    const hp = bar.segments.filter(Boolean).length;
    if (lastBossHp > hp) {
      // The segment that just broke flares once (opacity only under reduced motion).
      const broken = segs[hp];
      if (broken && typeof broken.animate === 'function') {
        broken.animate(
          settings.reducedMotion
            ? [{ opacity: 1 }, { opacity: 0.35 }]
            : [
                { transform: 'scaleY(2.4)', filter: 'brightness(2.2)', opacity: 1 },
                { transform: 'scaleY(1)', filter: 'brightness(1)', opacity: 0.35 },
              ],
          { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)' },
        );
      }
    }
    lastBossHp = hp;
    bossPanel.setAttribute('aria-label', bar.label);
  }

  function showRoomIntro(name: string, subtitle: string, depthLabel: string): void {
    if (fatalVisible) return;
    for (const timer of introTimers) clearTimeout(timer);
    intro.replaceChildren(
      el('div', 'oys-intro-depth', {}, [depthLabel]),
      el('div', 'oys-intro-name', {}, [name]),
      el('div', 'oys-intro-sub', {}, [subtitle]),
    );
    intro.classList.remove('is-on');
    // Next frame so the fade-in transition runs even when re-shown.
    void intro.offsetWidth;
    intro.classList.add('is-on');
    sound('roomIntro');
    introTimers = [setTimeout(() => intro.classList.remove('is-on'), ROOM_INTRO_MS - 300)];
  }

  function paintHint(): void {
    const current = hints.current;
    // The gate label already says this; never show the same words twice.
    const visible = current && current.text !== lastGate ? current : null;
    const id = visible?.id ?? null;
    if (id === lastHintId) return;
    lastHintId = id;
    if (visible) {
      hint.textContent = visible.text;
      hint.classList.add('is-on');
    } else {
      hint.classList.remove('is-on');
    }
  }

  function update(state: SimState, realDt: number): void {
    if (!hudVisible) return;
    if (state.health !== lastHealth || state.maxHealth !== lastMaxHealth) {
      renderPips(state);
      lastHealth = state.health;
      lastMaxHealth = state.maxHealth;
    }
    const meter = threadMeter(state.route.length, state.params.tetherCapacity);
    const key = `${meter.fraction.toFixed(3)}|${meter.state}`;
    if (key !== lastThread) {
      lastThread = key;
      threadFill.style.transform = `scaleX(${meter.fraction})`;
      const states: ThreadState[] = ['reunited', 'slack', 'taut', 'full'];
      for (const s of states) thread.classList.toggle(`is-${s}`, s === meter.state);
      thread.setAttribute('aria-valuemax', meter.capacity.toFixed(1));
      thread.setAttribute('aria-valuenow', meter.used.toFixed(1));
    }
    const label = state.outcome === 'playing' ? gateLabel(state.gate) : null;
    if (label !== lastGate) {
      lastGate = label;
      if (label) gate.textContent = label;
      gate.classList.toggle('is-on', label !== null);
      lastHintId = '\u0000'; // force a hint repaint for de-duplication
    }
    // Hints do not age while the game is paused, choosing or finished.
    const dt = pauseVisible || resultVisible || choiceVisible ? 0 : Math.max(0, realDt);
    if (hints.tick(dt) || lastHintId === '\u0000') paintHint();
  }

  function handleEvents(events: readonly SimEvent[], state: SimState): void {
    if (!hudVisible) return;
    const roleOf = (id: number) => state.enemies.find((en) => en.id === id)?.role;
    for (const e of events) {
      hints.onEvent(e, roleOf);
      if (e.type === 'hit') {
        flashDamage();
        renderPips(state);
        lastHealth = state.health;
        crackPip(Math.max(0, Math.min(pips.length - 1, e.health)));
      }
    }
  }

  function showPause(reason: 'user' | 'interrupted'): void {
    // Title, results, choices and fatal screens are already static; never stack a pause over them.
    if (fatalVisible || titleVisible || resultVisible || choiceVisible) return;
    pauseReason.textContent = reason === 'interrupted' ? INTERRUPTED_NOTE : 'The courtyard waits.';
    if (pauseVisible) return;
    pauseVisible = true;
    pausePanel.hidden = false;
    focusSoon(resumeBtn);
  }
  function hidePause(): void {
    pauseVisible = false;
    pausePanel.hidden = true;
  }

  function showResult(kind: 'victory' | 'defeat', state: SimState, opts: ResultOptions = {}): void {
    if (fatalVisible) return;
    hidePause();
    resultVisible = true;
    resultPanel.classList.toggle('is-victory', kind === 'victory');
    resultPanel.classList.toggle('is-defeat', kind === 'defeat');
    if (kind === 'victory') {
      resultHeading.textContent = 'The gate opens.';
      resultSub.textContent = 'Body and soul pass through together.';
    } else {
      resultHeading.textContent = 'Your soul was lost.';
      resultSub.textContent = 'The railway keeps what it catches.';
    }
    resultBtn.textContent = opts.primaryLabel ?? (kind === 'victory' ? 'Again' : 'Retry room');
    resultPrimary = opts.onPrimary ?? (() => callbacks.onRestart());
    resultSecondaryAction = opts.onSecondary ?? null;
    resultSecondary.textContent = opts.secondaryLabel ?? '';
    resultSecondary.hidden = !opts.secondaryLabel;
    const note = opts.note ?? (kind === 'defeat' ? 'Retrying restarts this room from its entrance.' : '');
    resultNote.textContent = note;
    resultNote.hidden = note === '';
    resultStatsList.replaceChildren(
      ...resultStats(state).flatMap((line) => [el('dt', '', {}, [line.label]), el('dd', '', {}, [line.value])]),
    );
    resultPanel.hidden = false;
    hint.classList.remove('is-on');
    lastHintId = null;
    focusSoon(resultBtn);
  }
  function hideResult(): void {
    resultVisible = false;
    resultPanel.hidden = true;
  }

  // ---------------------------------------------------------------- choices
  const env: PanelEnv = { sound, close: () => hideChoice() };
  const endingSaveNote = saveNote();

  function openChoice(kind: string, content: PanelContent): void {
    if (fatalVisible) return;
    hidePause();
    hideResult();
    hideTitle();
    choicePanel.className = `oys-panel oys-scrim oys-choice oys-${kind}`;
    choicePanel.replaceChildren(...content.nodes);
    choicePanel.scrollTop = 0;
    choiceVisible = true;
    choicePanel.hidden = false;
    hint.classList.remove('is-on');
    lastHintId = null;
    focusSoon(content.focus);
  }
  function hideChoice(): void {
    choiceVisible = false;
    choicePanel.hidden = true;
  }

  function showFatal(heading: string, detail: string): void {
    fatalVisible = true;
    hideTitle();
    hidePause();
    hideResult();
    hideChoice();
    hideHud();
    intro.classList.remove('is-on');
    fatalHeading.textContent = heading;
    fatalDetail.textContent = detail;
    fatalPanel.hidden = false;
    focusSoon(reloadBtn);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || fatalVisible || titleVisible || resultVisible || choiceVisible || !hudVisible) return;
    e.preventDefault();
    if (pauseVisible) {
      hidePause();
      callbacks.onResume();
    } else {
      showPause('user');
      callbacks.onPause();
    }
  }
  document.addEventListener('keydown', onKey);

  return {
    root,
    showTitle,
    hideTitle,
    showHud,
    hideHud,
    update,
    handleEvents,
    showPause,
    hidePause,
    showResult,
    hideResult,
    showFatal,
    setStorageNotice(available: boolean): void {
      for (const note of storageNotices) note.hidden = available;
    },
    get paused() {
      return pauseVisible;
    },
    setSettings(s: Settings): void {
      applySettings(s, false);
    },
    destroy(): void {
      document.removeEventListener('keydown', onKey);
      vignette.stop();
      for (const timer of introTimers) clearTimeout(timer);
      if (confirmTimer) clearTimeout(confirmTimer);
      root.remove();
    },
    showStarterSelect(options, onPick): void {
      openChoice('starter', starterContent(options, onPick, env));
    },
    showRouteChoice(heading, choices, onPick): void {
      openChoice('route', routeContent(heading, choices, onPick, env));
    },
    showDraft(view, onDone): void {
      openChoice('draft', draftContent(view, onDone, env));
    },
    showEnding(view, onAgain): void {
      openChoice(view.escaped ? 'ending is-escaped' : 'ending is-failed', endingContent(view, onAgain, env, endingSaveNote));
      sound(view.escaped ? 'escaped' : 'failed');
    },
    hideChoice,
    get choosing() {
      return choiceVisible;
    },
    setLoadout,
    setBoss,
    showRoomIntro,
    setSaveNotice(available: boolean): void {
      saveAvailable = available;
      for (const note of saveNotices) note.hidden = available;
    },
  };
}
