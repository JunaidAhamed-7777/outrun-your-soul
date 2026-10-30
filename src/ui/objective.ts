/**
 * Tutorial objective card: a compact, non-interactive card near the bottom of the screen
 * ("Step 3 of 8", title, instruction) with a brief gold tick when a step completes.
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
  position: absolute; left: 50%; bottom: calc(var(--safe-bottom) + 6px);
  width: min(360px, calc(100% - 32px)); transform: translate(-50%, 8px);
  box-sizing: border-box; padding: 12px 16px 13px;
  background: rgba(20, 33, 90, 0.82); border: 1px solid rgba(217, 164, 60, 0.55); border-radius: 14px;
  box-shadow: 0 10px 30px rgba(8, 12, 40, 0.45); backdrop-filter: blur(6px);
  color: var(--ivory); pointer-events: none; opacity: 0;
  transition: opacity 220ms ease, transform 220ms ease, border-color 220ms ease;
}
.oys-objective.is-on { opacity: 1; transform: translate(-50%, 0); }
.oys-objective.is-done { border-color: var(--gold); }
.oys-objective .k { font: 600 11px/1 var(--font-ui); letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); display: flex; align-items: center; gap: 8px; }
.oys-objective .bar { flex: 1; height: 2px; background: var(--ivory-faint); border-radius: 2px; overflow: hidden; }
.oys-objective .bar i { display: block; height: 100%; background: var(--vermilion); transition: width 300ms ease; }
.oys-objective .t { margin: 7px 0 3px; font: 20px/1.15 var(--font-display); }
.oys-objective .tick { color: var(--gold); margin-left: 6px; opacity: 0; transition: opacity 160ms ease; }
.oys-objective.is-done .tick { opacity: 1; }
.oys-objective .d { margin: 0; font: 14px/1.4 var(--font-ui); color: var(--ivory-dim); }
.oys-ui.is-reduced .oys-objective { transition: none; transform: translate(-50%, 0); }
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
  const q = (sel: string) => card.querySelector(sel) as HTMLElement;
  let shown: string | null = null;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    set(view) {
      if (!view) {
        shown = null;
        card.classList.remove('is-on', 'is-done');
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
    },
    flash() {
      card.classList.add('is-done');
      if (doneTimer) clearTimeout(doneTimer);
      doneTimer = setTimeout(() => card.classList.remove('is-done'), 700);
    },
    destroy() {
      if (doneTimer) clearTimeout(doneTimer);
      card.remove();
      style.remove();
    },
  };
}
