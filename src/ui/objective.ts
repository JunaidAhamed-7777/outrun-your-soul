/**
 * Tutorial objective card: a prominent, non-interactive card under the HUD ("Step 3 of 8",
 * title, instruction) that pulses when a step begins, plus a brief centred banner
 * announcing each new step and a gold tick when a step completes.
 * Mounted inside the UI root so it inherits the palette tokens; never takes pointer input,
 * so gestures pass through to the play surface.
 */
export interface ObjectiveView {
  readonly index: number;
  readonly total: number;
  readonly title: string;
  readonly text: string;
}

export interface ObjectiveCard {
  set(view: ObjectiveView | null): void;
  /** Briefly mark the card as completed (gold tick) before the next step appears. */
  flash(): void;
  destroy(): void;
}

const CSS = `
.oys-objective {
  position: absolute; left: 50%; top: calc(var(--safe-top) + 58px);
  width: min(380px, calc(100% - 24px)); transform: translate(-50%, -8px);
  box-sizing: border-box; padding: 12px 16px 13px;
  background: linear-gradient(180deg, rgba(36, 67, 163, 0.96), rgba(20, 33, 90, 0.96));
  border: 2px solid var(--gold); border-radius: 14px;
  box-shadow: 0 0 0 1px rgba(8, 12, 40, 0.6), 0 8px 26px rgba(8, 12, 40, 0.55), 0 0 22px rgba(217, 164, 60, 0.35);
  color: var(--ivory); pointer-events: none; opacity: 0;
  transition: opacity 220ms ease, transform 220ms ease;
}
.oys-objective.is-on { opacity: 1; transform: translate(-50%, 0); }
.oys-objective.is-new { animation: oys-objective-pulse 900ms ease-in-out 3; }
@keyframes oys-objective-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgba(8, 12, 40, 0.6), 0 8px 26px rgba(8, 12, 40, 0.55), 0 0 22px rgba(217, 164, 60, 0.35); }
  50% { box-shadow: 0 0 0 1px rgba(8, 12, 40, 0.6), 0 8px 26px rgba(8, 12, 40, 0.55), 0 0 44px rgba(255, 210, 120, 0.9); }
}
.oys-objective.is-done { border-color: #ffe08a; }
.oys-objective .k { font: 700 12px/1 var(--font-ui); letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold); display: flex; align-items: center; gap: 8px; }
.oys-objective .bar { flex: 1; height: 3px; background: var(--ivory-faint); border-radius: 3px; overflow: hidden; }
.oys-objective .bar i { display: block; height: 100%; background: var(--vermilion); transition: width 300ms ease; }
.oys-objective .t { margin: 7px 0 4px; font: 23px/1.12 var(--font-display); }
.oys-objective .tick { color: var(--gold); margin-left: 8px; opacity: 0; transition: opacity 160ms ease; }
.oys-objective.is-done .tick { opacity: 1; }
.oys-objective .d { margin: 0; font: 600 15px/1.38 var(--font-ui); color: var(--ivory); }
.oys-callout {
  position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%) scale(0.92);
  width: min(340px, calc(100% - 40px)); box-sizing: border-box; padding: 16px 18px; text-align: center;
  background: rgba(13, 22, 64, 0.88); border: 2px solid var(--gold); border-radius: 18px;
  box-shadow: 0 0 40px rgba(217, 164, 60, 0.45), 0 14px 40px rgba(8, 12, 40, 0.6);
  color: var(--ivory); pointer-events: none; opacity: 0;
  transition: opacity 260ms ease, transform 260ms cubic-bezier(.2,.8,.2,1.2);
}
.oys-callout.is-on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.oys-callout .k { font: 700 12px/1 var(--font-ui); letter-spacing: 0.24em; text-transform: uppercase; color: var(--gold); }
.oys-callout .t { margin: 8px 0 0; font: 32px/1.05 var(--font-display); }
.oys-ui.is-reduced .oys-objective, .oys-ui.is-reduced .oys-callout { transition: opacity 150ms linear; transform: translate(-50%, 0); animation: none; }
.oys-ui.is-reduced .oys-callout { transform: translate(-50%, -50%); }
`;

export function createObjectiveCard(root: HTMLElement): ObjectiveCard {
  const doc = root.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const card = doc.createElement('div');
  card.className = 'oys-objective';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.innerHTML =
    '<div class="k"><span class="n"></span><span class="bar"><i></i></span></div>' +
    '<p class="t"><span class="tt"></span><span class="tick" aria-hidden="true">✓</span></p><p class="d"></p>';
  root.appendChild(card);
  // Big centred banner announcing each new step, which then gives way to the card.
  const callout = doc.createElement('div');
  callout.className = 'oys-callout';
  callout.setAttribute('aria-hidden', 'true');
  callout.innerHTML = '<div class="k"></div><p class="t"></p>';
  root.appendChild(callout);
  const q = (sel: string) => card.querySelector(sel) as HTMLElement;
  let shown: string | null = null;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;
  let calloutTimer: ReturnType<typeof setTimeout> | null = null;
  let pulseTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    set(view) {
      if (!view) {
        shown = null;
        card.classList.remove('is-on', 'is-done', 'is-new');
        callout.classList.remove('is-on');
        return;
      }
      const key = `${view.index}:${view.title}`;
      if (key === shown) return;
      shown = key;
      card.classList.remove('is-done');
      q('.n').textContent = `Step ${view.index + 1} of ${view.total}`;
      q('.bar i').style.width = `${(view.index / view.total) * 100}%`;
      q('.tt').textContent = view.title;
      q('.d').textContent = view.text;
      card.classList.add('is-on');
      // Re-trigger the pulse for the new step.
      card.classList.remove('is-new');
      void card.offsetWidth;
      card.classList.add('is-new');
      if (pulseTimer) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => card.classList.remove('is-new'), 2800);
      (callout.querySelector('.k') as HTMLElement).textContent = `Step ${view.index + 1} of ${view.total}`;
      (callout.querySelector('.t') as HTMLElement).textContent = view.title;
      callout.classList.add('is-on');
      if (calloutTimer) clearTimeout(calloutTimer);
      calloutTimer = setTimeout(() => callout.classList.remove('is-on'), 1600);
    },
    flash() {
      card.classList.add('is-done');
      if (doneTimer) clearTimeout(doneTimer);
      doneTimer = setTimeout(() => card.classList.remove('is-done'), 700);
    },
    destroy() {
      for (const t of [doneTimer, calloutTimer, pulseTimer]) if (t) clearTimeout(t);
      callout.remove();
      card.remove();
      style.remove();
    },
  };
}
