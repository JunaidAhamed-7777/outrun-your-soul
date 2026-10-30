/**
 * Level select panel: every level in story order as a card. Unlocked levels are buttons;
 * locked ones are disabled with a lock and the requirement; cleared ones carry a tick.
 * Mounted in the UI root (palette tokens, safe areas); scrolls on short screens.
 */
export interface LevelCardView {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly blurb: string;
  readonly locked: boolean;
  readonly cleared: boolean;
  /** Shown on locked cards, e.g. "Clear Departure Court to unlock". */
  readonly requirement?: string;
}

export interface LevelSelect {
  show(levels: readonly LevelCardView[], onPick: (id: string) => void, onBack: () => void): void;
  hide(): void;
  readonly visible: boolean;
}

const CSS = `
.oys-levels {
  position: absolute; inset: 0; z-index: 3; overflow-y: auto; -webkit-overflow-scrolling: touch;
  background: radial-gradient(120% 70% at 50% 18%, rgba(36, 67, 163, 0.97), rgba(13, 22, 64, 0.98));
  padding: calc(var(--safe-top) + 10px) 16px calc(var(--safe-bottom) + 16px); box-sizing: border-box;
  color: var(--ivory); pointer-events: auto;
}
.oys-levels[hidden] { display: none; }
.oys-levels .head { display: flex; align-items: center; gap: 12px; max-width: 460px; margin: 0 auto 6px; }
.oys-levels .back { min-width: 44px; min-height: 44px; border-radius: 22px; border: 1px solid var(--ivory-faint); background: transparent; color: var(--ivory); font: 600 15px var(--font-ui); padding: 0 14px; cursor: pointer; }
.oys-levels .back:focus-visible, .oys-levels .card:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.oys-levels .k { font: 700 11px/1 var(--font-ui); letter-spacing: 0.24em; text-transform: uppercase; color: var(--gold); }
.oys-levels h2 { margin: 4px 0 0; font: 30px/1.05 var(--font-display); font-weight: 400; }
.oys-levels .sub { max-width: 460px; margin: 6px auto 14px; font: 14px/1.4 var(--font-ui); color: var(--ivory-dim); }
.oys-levels ol { list-style: none; margin: 0 auto; padding: 0; max-width: 460px; display: grid; gap: 10px; }
.oys-levels .card {
  width: 100%; display: grid; grid-template-columns: 44px 1fr 28px; align-items: center; gap: 12px; text-align: left;
  padding: 12px 14px; border-radius: 14px; border: 1px solid rgba(217, 164, 60, 0.5);
  background: rgba(20, 33, 90, 0.85); color: var(--ivory); cursor: pointer; font: inherit;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}
.oys-levels .card:not(:disabled):hover { border-color: var(--gold); background: rgba(36, 67, 163, 0.9); }
.oys-levels .card:not(:disabled):active { transform: scale(0.98); }
.oys-levels .card:disabled { cursor: default; opacity: 0.55; border-color: var(--ivory-faint); background: rgba(13, 22, 64, 0.7); }
.oys-levels .num { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font: 20px var(--font-display); border: 1px solid var(--gold); color: var(--gold); }
.oys-levels .card.is-cleared .num { background: var(--gold); color: var(--cobalt-deep); }
.oys-levels .card:disabled .num { border-color: var(--ivory-faint); color: var(--ivory-dim); }
.oys-levels .name { display: block; font: 19px/1.15 var(--font-display); }
.oys-levels .blurb { display: block; margin-top: 3px; font: 13px/1.35 var(--font-ui); color: var(--ivory-dim); }
.oys-levels .req { display: block; margin-top: 3px; font: 600 12px/1.3 var(--font-ui); color: var(--gold); }
.oys-levels .mark { font-size: 18px; text-align: center; color: var(--gold); }
`;

const LOCK_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

export function createLevelSelect(root: HTMLElement): LevelSelect {
  const doc = root.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const panel = doc.createElement('section');
  panel.className = 'oys-levels';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'oys-levels-h');
  panel.hidden = true;
  root.appendChild(panel);
  let visible = false;

  return {
    get visible() {
      return visible;
    },
    show(levels, onPick, onBack) {
      const cleared = levels.filter((l) => l.cleared).length;
      panel.innerHTML = '';
      const head = doc.createElement('div');
      head.className = 'head';
      const back = doc.createElement('button');
      back.type = 'button';
      back.className = 'back';
      back.textContent = '‹ Back';
      back.addEventListener('click', onBack);
      const titles = doc.createElement('div');
      titles.innerHTML = '<div class="k">The funeral railway</div><h2 id="oys-levels-h">Levels</h2>';
      head.append(back, titles);
      const sub = doc.createElement('p');
      sub.className = 'sub';
      sub.textContent = `${cleared} of ${levels.length} cleared. Levels open in order: clear one to open the next.`;
      const list = doc.createElement('ol');
      let firstOpen: HTMLButtonElement | null = null;
      for (const l of levels) {
        const li = doc.createElement('li');
        const card = doc.createElement('button');
        card.type = 'button';
        card.className = `card${l.cleared ? ' is-cleared' : ''}`;
        card.disabled = l.locked;
        card.setAttribute(
          'aria-label',
          `Level ${l.number}, ${l.name}${l.cleared ? ', cleared' : ''}${l.locked ? `, locked. ${l.requirement ?? ''}` : ''}`,
        );
        const num = doc.createElement('span');
        num.className = 'num';
        num.textContent = String(l.number);
        const text = doc.createElement('span');
        const name = doc.createElement('span');
        name.className = 'name';
        name.textContent = l.name;
        const detail = doc.createElement('span');
        detail.className = l.locked ? 'req' : 'blurb';
        detail.textContent = l.locked ? (l.requirement ?? 'Locked') : l.blurb;
        text.append(name, detail);
        const mark = doc.createElement('span');
        mark.className = 'mark';
        if (l.locked) mark.innerHTML = LOCK_SVG;
        else if (l.cleared) mark.textContent = '✓';
        card.append(num, text, mark);
        if (!l.locked) {
          card.addEventListener('click', () => onPick(l.id));
          firstOpen ??= card;
        }
        li.append(card);
        list.append(li);
      }
      const credit = doc.createElement('p');
      credit.className = 'oys-credit';
      credit.style.marginTop = '18px';
      credit.textContent = 'Made by Junaid';
      panel.append(head, sub, list, credit);
      panel.hidden = false;
      panel.scrollTop = 0;
      visible = true;
      (firstOpen ?? back).focus({ preventScroll: true });
    },
    hide() {
      panel.hidden = true;
      visible = false;
    },
  };
}
