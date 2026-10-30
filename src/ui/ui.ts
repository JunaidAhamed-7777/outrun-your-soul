/**
 * DOM overlay: title, HUD, hints, pause/settings, results and fatal errors.
 * Presentation only — it never advances or alters the simulation. The HUD layer is
 * pointer-transparent so gestures reach the play surface; only real buttons and
 * full-screen panels take input.
 *
 * Button handlers update the overlay themselves (Begin hides the title, Resume hides
 * the pause panel, ...) and then notify the callbacks, so show/hide calls from the
 * integration are idempotent. Settings are not persisted here: onSettingsChange
 * receives a fresh copy for the integration to save and apply.
 */
import type { RoomDef, SimEvent, SimState } from '../sim/types';
import type { Settings } from '../save/settings';
import { HintTracker } from './hints';
import { gateLabel, healthLabel, healthPips, resultStats, threadMeter, type ThreadState } from './hud-logic';
import { ICONS } from './icons';
import { injectStyles } from './styles';
import { createTitleVignette } from './title-vignette';

export interface UICallbacks {
  onStart(): void;
  onResume(): void;
  onRestart(): void;
  onPause(): void;
  onSettingsChange(s: Settings): void;
}

export interface GameUI {
  readonly root: HTMLElement;
  showTitle(): void;
  hideTitle(): void;
  showHud(room: RoomDef): void;
  hideHud(): void;
  update(state: SimState, realDt: number): void;
  handleEvents(events: readonly SimEvent[], state: SimState): void;
  showPause(reason: 'user' | 'interrupted'): void;
  hidePause(): void;
  showResult(kind: 'victory' | 'defeat', state: SimState): void;
  hideResult(): void;
  showFatal(title: string, detail: string): void;
  setStorageNotice(available: boolean): void;
  readonly paused: boolean;
  /** Additive: sync settings changed elsewhere (no callback fired). */
  setSettings(s: Settings): void;
  /** Additive: remove listeners and DOM (labs, tests, hot reload). */
  destroy(): void;
}

type Attrs = Record<string, string>;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

function iconSpan(svg: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.style.display = 'contents';
  span.innerHTML = svg; // static, author-controlled SVG strings only
  return span;
}

const STORAGE_NOTICE = 'Settings can’t be saved in this browser; they will reset when you leave.';
const INTERRUPTED_NOTE = 'Paused — your gesture was cancelled.';

interface Toggle {
  readonly button: HTMLButtonElement;
  set(on: boolean): void;
}

export function createUI(container: HTMLElement, initialSettings: Settings, callbacks: UICallbacks): GameUI {
  injectStyles(document);
  let settings: Settings = { ...initialSettings };

  const root = el('div', 'oys-ui');
  root.classList.toggle('is-reduced', settings.reducedMotion);
  container.appendChild(root);

  // ---------------------------------------------------------------- toggles
  const toggles: Toggle[] = [];
  function makeToggle(label: string, read: () => boolean, onIcon: string, offIcon: string, flip: () => void): Toggle {
    const icon = iconSpan('');
    const state = el('span', 'oys-toggle-state');
    const button = el('button', 'oys-toggle', { type: 'button' }, [icon, el('span', '', {}, [label]), state]);
    const toggle: Toggle = {
      button,
      set(on: boolean) {
        button.setAttribute('aria-pressed', String(on));
        state.textContent = on ? 'on' : 'off';
        icon.innerHTML = on ? onIcon : offIcon;
      },
    };
    button.addEventListener('click', () => {
      flip();
    });
    toggle.set(read());
    toggles.push(toggle);
    return toggle;
  }

  function applySettings(next: Settings, notify: boolean): void {
    settings = { ...next };
    root.classList.toggle('is-reduced', settings.reducedMotion);
    vignette.setReducedMotion(settings.reducedMotion);
    for (const sync of toggleSyncs) sync();
    if (notify) callbacks.onSettingsChange({ ...settings });
  }

  const toggleSyncs: (() => void)[] = [];
  function toggleRow(): HTMLElement {
    const sound = makeToggle(
      'Sound',
      () => !settings.muted,
      ICONS.soundOn,
      ICONS.soundOff,
      () => applySettings({ ...settings, muted: !settings.muted }, true),
    );
    const motion = makeToggle(
      'Reduced motion',
      () => settings.reducedMotion,
      ICONS.motion,
      ICONS.motion,
      () => applySettings({ ...settings, reducedMotion: !settings.reducedMotion }, true),
    );
    toggleSyncs.push(() => sound.set(!settings.muted), () => motion.set(settings.reducedMotion));
    return el('div', 'oys-toggle-row', {}, [sound.button, motion.button]);
  }

  const storageNotices: HTMLElement[] = [];
  function storageNote(): HTMLElement {
    const note = el('p', 'oys-note', { role: 'status' }, [STORAGE_NOTICE]);
    note.hidden = true;
    storageNotices.push(note);
    return note;
  }

  // ---------------------------------------------------------------- title
  const vignette = createTitleVignette();
  vignette.setReducedMotion(settings.reducedMotion);
  const beginBtn = el('button', 'oys-btn', { type: 'button' }, ['Begin']);
  const title = el('section', 'oys-panel oys-title', { 'aria-label': 'Outrun Your Soul' }, [
    el('div', 'oys-title-top', {}, [
      el('div', 'oys-eyebrow', {}, ['A funeral-railway escape']),
      el('h1', 'oys-wordmark', {}, [el('span', 'w1', {}, ['Outrun']), el('span', 'w2', {}, ['Your Soul'])]),
      el('p', 'oys-tagline', {}, ['Your body can outrun death. Your soul cannot.']),
    ]),
    vignette.svg,
    el('div', 'oys-title-bottom', {}, [
      beginBtn,
      toggleRow(),
      storageNote(),
      el('p', 'oys-controls-line', {}, [el('b', '', {}, ['Drag']), ' to dash · ', el('b', '', {}, ['Tap']), ' to return']),
    ]),
  ]);
  title.hidden = true;
  beginBtn.addEventListener('click', () => {
    hideTitle();
    callbacks.onStart();
  });

  // ---------------------------------------------------------------- HUD
  const health = el('div', 'oys-health', { role: 'img', 'aria-label': 'Health' });
  const gate = el('div', 'oys-gate', { 'aria-live': 'polite' });
  const threadFill = el('div', 'oys-thread-fill');
  const thread = el('div', 'oys-thread', { role: 'meter', 'aria-label': 'Thread in use', 'aria-valuemin': '0' }, [
    iconSpan(ICONS.spool),
    el('div', 'oys-thread-track', {}, [threadFill]),
  ]);
  const pauseBtn = el('button', 'oys-icon-btn', { type: 'button', 'aria-label': 'Pause' });
  pauseBtn.append(iconSpan(ICONS.pause));
  pauseBtn.addEventListener('click', () => {
    if (pauseVisible || resultVisible) return;
    showPause('user');
    callbacks.onPause();
  });
  const hint = el('div', 'oys-hint', { 'aria-live': 'polite' });
  const vignetteFlash = el('div', 'oys-vignette', { 'aria-hidden': 'true' });
  const hud = el('div', 'oys-hud', {}, [
    vignetteFlash,
    el('div', 'oys-hud-top', {}, [health, el('div', 'oys-hud-right', {}, [thread, pauseBtn])]),
    gate,
    hint,
  ]);
  hud.hidden = true;

  // ---------------------------------------------------------------- pause
  const pauseReason = el('p', 'oys-sub', {}, []);
  const resumeBtn = el('button', 'oys-btn', { type: 'button' }, ['Resume']);
  const restartBtn = el('button', 'oys-btn oys-btn--ghost', { type: 'button' }, ['Restart room']);
  const pausePanel = el('section', 'oys-panel oys-scrim oys-pause', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'oys-pause-h' }, [
    el('div', 'oys-stack', {}, [
      el('h2', 'oys-heading', { id: 'oys-pause-h' }, ['Paused']),
      pauseReason,
      el('div', 'oys-rule'),
    ]),
    el('div', 'oys-stack', {}, [resumeBtn, restartBtn]),
    toggleRow(),
    el('p', 'oys-note', {}, ['Restarting returns you to this room’s entrance.']),
    storageNote(),
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
  const resultBtn = el('button', 'oys-btn', { type: 'button' });
  const resultNote = el('p', 'oys-note');
  const resultPanel = el('section', 'oys-panel oys-scrim oys-result', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'oys-result-h' }, [
    el('div', 'oys-stack', {}, [resultHeading, resultSub, el('div', 'oys-rule'), resultStatsList, resultBtn, resultNote]),
  ]);
  resultPanel.hidden = true;
  resultBtn.addEventListener('click', () => {
    hideResult();
    callbacks.onRestart();
  });

  // ---------------------------------------------------------------- fatal
  const fatalHeading = el('h2', 'oys-heading');
  const fatalDetail = el('p', 'oys-note');
  const reloadBtn = el('button', 'oys-btn oys-btn--ghost', { type: 'button' }, ['Reload']);
  reloadBtn.addEventListener('click', () => location.reload());
  const fatalPanel = el('section', 'oys-panel oys-fatal', { role: 'alert' }, [
    el('div', 'oys-stack', {}, [fatalHeading, el('div', 'oys-rule'), fatalDetail, reloadBtn]),
  ]);
  fatalPanel.hidden = true;

  root.append(hud, title, pausePanel, resultPanel, fatalPanel);

  // ---------------------------------------------------------------- state
  let titleVisible = false;
  let pauseVisible = false;
  let resultVisible = false;
  let fatalVisible = false;
  let hudVisible = false;
  const hints = new HintTracker();
  let lastHealth = -1;
  let lastMaxHealth = -1;
  let lastThread = '';
  let lastGate: string | null = null;
  let lastHintId: string | null = null;
  let pips: HTMLElement[] = [];

  function focusSoon(node: HTMLElement): void {
    // After display change; preventScroll keeps the fixed layout still.
    requestAnimationFrame(() => node.focus({ preventScroll: true }));
  }

  function showTitle(): void {
    if (fatalVisible) return;
    titleVisible = true;
    title.hidden = false;
    vignette.start();
    focusSoon(beginBtn);
  }
  function hideTitle(): void {
    titleVisible = false;
    title.hidden = true;
    vignette.stop();
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
    hints.reset(room.hints ?? []);
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

  function paintHint(): void {
    const current = hints.current;
    const shownGate = lastGate;
    // The gate label already says this; never show the same words twice.
    const visible = current && current.text !== shownGate ? current : null;
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
    // Hints do not age while the game is paused or finished.
    const dt = pauseVisible || resultVisible ? 0 : Math.max(0, realDt);
    if (hints.tick(dt) || lastHintId === '\u0000') paintHint();
  }

  function handleEvents(events: readonly SimEvent[], state: SimState): void {
    if (!hudVisible) return;
    for (const e of events) {
      hints.onEvent(e);
      if (e.type === 'hit') {
        flashDamage();
        renderPips(state);
        lastHealth = state.health;
        crackPip(Math.max(0, Math.min(pips.length - 1, e.health)));
      }
    }
  }

  function showPause(reason: 'user' | 'interrupted'): void {
    if (fatalVisible || titleVisible) return;
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

  function showResult(kind: 'victory' | 'defeat', state: SimState): void {
    if (fatalVisible) return;
    hidePause();
    resultVisible = true;
    resultPanel.classList.toggle('is-victory', kind === 'victory');
    resultPanel.classList.toggle('is-defeat', kind === 'defeat');
    if (kind === 'victory') {
      resultHeading.textContent = 'The gate opens.';
      resultSub.textContent = 'Body and soul pass through together.';
      resultBtn.textContent = 'Again';
      resultNote.textContent = '';
      resultNote.hidden = true;
    } else {
      resultHeading.textContent = 'Your soul was lost.';
      resultSub.textContent = 'The railway keeps what it catches.';
      resultBtn.textContent = 'Retry room';
      resultNote.textContent = 'Retrying restarts this room from its entrance.';
      resultNote.hidden = false;
    }
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

  function showFatal(heading: string, detail: string): void {
    fatalVisible = true;
    hideTitle();
    hidePause();
    hideResult();
    hideHud();
    fatalHeading.textContent = heading;
    fatalDetail.textContent = detail;
    fatalPanel.hidden = false;
    focusSoon(reloadBtn);
  }

  function setStorageNotice(available: boolean): void {
    for (const note of storageNotices) note.hidden = available;
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || fatalVisible || titleVisible || resultVisible || !hudVisible) return;
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
    setStorageNotice,
    get paused() {
      return pauseVisible;
    },
    setSettings(s: Settings): void {
      applySettings(s, false);
    },
    destroy(): void {
      document.removeEventListener('keydown', onKey);
      vignette.stop();
      root.remove();
    },
  };
}
