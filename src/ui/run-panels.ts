/**
 * Content builders for the run-level choice panels: starter, route, station draft
 * and ending. Each returns the nodes to place in the shared choice panel plus the
 * element to focus. They own no run state: picks are reported through callbacks and
 * the run layer validates them again.
 */
import palette from '../content/palette.json';
import { RELICS, STARTERS } from '../run/relics';
import type { UiSound } from '../audio/audio';
import { button, el, iconSpan } from './dom';
import { draftOptions, isReplaceMode, slotLayout, type DraftView, type OfferOption, type RelicView } from './draft-logic';
import { formatDuration } from './hud-logic';
import { relicIconSvg } from './relic-icons';

export interface PanelContent {
  readonly nodes: HTMLElement[];
  readonly focus: HTMLElement | null;
}

export interface PanelEnv {
  sound(name: UiSound): void;
  /** Hide the choice panel before reporting a pick. */
  close(): void;
}

export interface StarterOption {
  readonly id: string;
  readonly name: string;
  readonly flavour: string;
  readonly relicName: string;
  readonly relicRule: string;
  readonly locked: boolean;
  readonly lockHint?: string;
  /** Optional explicit relic ID for the symbol; otherwise looked up from STARTERS. */
  readonly relicId?: string;
}

export interface RouteChoice {
  readonly id: string;
  readonly roomName: string;
  readonly blurb: string;
  readonly tags: readonly string[];
}

export interface EndingView {
  readonly escaped: boolean;
  readonly seconds: number;
  readonly roomsCleared: number;
  readonly relics: readonly RelicView[];
  readonly starterName: string;
  readonly discoveries: readonly string[];
}

export const ESCAPED_LINE = 'Body and soul pass the last gate together.';
export const FAILED_LINE = 'Your soul could not follow you out.';

function head(eyebrow: string, heading: string, sub?: string): HTMLElement {
  const nodes: HTMLElement[] = [el('div', 'oys-eyebrow-sm', {}, [eyebrow]), el('h2', 'oys-heading', { id: 'oys-choice-h' }, [heading])];
  if (sub) nodes.push(el('p', 'oys-sub', {}, [sub]));
  nodes.push(el('div', 'oys-rule'));
  return el('div', 'oys-choice-head', {}, nodes);
}

function relicIdFor(option: StarterOption): string {
  if (option.relicId) return option.relicId;
  const starter = (STARTERS as Readonly<Record<string, { relic: string } | undefined>>)[option.id];
  if (starter) return starter.relic;
  const byName = Object.values(RELICS).find((r) => r.name === option.relicName);
  return byName?.id ?? 'unknown';
}

const iconBox = (id: string): HTMLElement => iconSpan(relicIconSvg(id, 38), 'oys-card-icon');

// ------------------------------------------------------------------ starter
export function starterContent(options: readonly StarterOption[], onPick: (id: string) => void, env: PanelEnv): PanelContent {
  const cards = options.map((o) => {
    const parts: (Node | string)[] = [
      iconBox(relicIdFor(o)),
      el('span', 'oys-card-title', {}, [o.name]),
      el('span', 'oys-card-flavour', {}, [o.flavour]),
      el('span', 'oys-card-text', {}, [`${o.relicName}: ${o.relicRule}`]),
    ];
    if (o.locked) parts.push(el('span', 'oys-card-reason', {}, [o.lockHint ?? 'Locked for now.']));
    const card = button('oys-card', parts, { 'aria-label': `${o.name}. ${o.relicName}: ${o.relicRule}${o.locked ? ` Locked. ${o.lockHint ?? ''}` : ''}` });
    card.disabled = o.locked;
    card.addEventListener('click', () => {
      if (o.locked) return;
      env.sound('select');
      env.close();
      onPick(o.id);
    });
    return card;
  });
  return {
    nodes: [
      head('Choose a start', 'Who carries the thread?', 'Each start brings one relic. Neither is stronger; they play differently.'),
      el('div', 'oys-cards', {}, cards),
    ],
    focus: cards.find((c) => !c.disabled) ?? null,
  };
}

// ------------------------------------------------------------------ route
export function routeContent(title: string, choices: readonly RouteChoice[], onPick: (id: string) => void, env: PanelEnv): PanelContent {
  const cards = choices.map((c) => {
    const card = button(
      'oys-card oys-card--route',
      [
        el('span', 'oys-card-title', {}, [c.roomName]),
        el('span', 'oys-card-text', {}, [c.blurb]),
        el('span', 'oys-tags', {}, c.tags.map((t) => el('span', 'oys-tag', {}, [t]))),
      ],
      { 'aria-label': `${c.roomName}. ${c.blurb}${c.tags.length ? ` (${c.tags.join(', ')})` : ''}` },
    );
    card.addEventListener('click', () => {
      env.sound('select');
      env.close();
      onPick(c.id);
    });
    return card;
  });
  return { nodes: [head('Fork in the line', title), el('div', 'oys-cards', {}, cards)], focus: cards[0] ?? null };
}

// ------------------------------------------------------------------ draft
function slotChip(relic: RelicView | null): HTMLElement {
  if (!relic) return el('span', 'oys-slot is-empty', {}, ['Empty slot']);
  return el('span', 'oys-slot', { 'data-id': relic.id }, [iconSpan(relicIconSvg(relic.id, 26)), relic.name]);
}

function offerCard(option: OfferOption): HTMLButtonElement {
  const r = option.relic;
  const parts: (Node | string)[] = [
    iconBox(r.id),
    el('span', 'oys-card-title', {}, [r.name]),
    el('span', 'oys-card-text', {}, [r.rule]),
    el('span', 'oys-card-cost', {}, [r.cost]),
  ];
  if (option.mode === 'blocked' && option.reason) parts.push(el('span', 'oys-card-reason', {}, [option.reason]));
  const card = button('oys-card oys-card--relic', parts, {
    'aria-pressed': 'false',
    'aria-label': `${r.name}. ${r.rule} Cost: ${r.cost}${option.reason ? ` ${option.reason}` : ''}`,
  });
  card.disabled = option.mode === 'blocked';
  return card;
}

export function draftContent(
  view: DraftView,
  onDone: (pick: string | null, replaceIndex?: number) => void,
  env: PanelEnv,
): PanelContent {
  const options = draftOptions(view);
  const replaceMode = isReplaceMode(view);
  const slots = el('div', 'oys-slots', { 'aria-label': 'Relics carried' }, slotLayout(view).map(slotChip));
  const actions = el('div', 'oys-draft-actions');
  let selected: OfferOption | null = null;

  const keep = button('oys-btn oys-btn--ghost', 'Keep my relics');
  keep.addEventListener('click', () => {
    env.sound('close');
    env.close();
    onDone(null);
  });

  function markDrop(index: number | null): void {
    [...slots.children].forEach((chip, i) => chip.classList.toggle('is-drop', i === index));
  }

  function renderActions(): void {
    const nodes: HTMLElement[] = [];
    markDrop(null);
    if (selected?.mode === 'take') {
      const pick = selected;
      const take = button('oys-btn', `Take ${pick.relic.name}`);
      take.addEventListener('click', () => {
        env.sound('take');
        env.close();
        onDone(pick.relic.id);
      });
      nodes.push(take);
    } else if (selected?.mode === 'replace') {
      const pick = selected;
      nodes.push(el('p', 'oys-replace-q', {}, [`Set down which relic for ${pick.relic.name}?`]));
      for (const opt of pick.replace) {
        const label: (Node | string)[] = [`Set down ${opt.drop.name}`];
        if (!opt.enabled && opt.reason) label.push(el('span', 'oys-btn-reason', {}, [opt.reason]));
        const b = button(opt.enabled ? 'oys-btn' : 'oys-btn oys-btn--ghost', label);
        b.disabled = !opt.enabled;
        b.addEventListener('pointerenter', () => markDrop(opt.index));
        b.addEventListener('focus', () => markDrop(opt.index));
        b.addEventListener('pointerleave', () => markDrop(null));
        b.addEventListener('click', () => {
          if (!opt.enabled) return;
          env.sound('take');
          env.close();
          onDone(pick.relic.id, opt.index);
        });
        nodes.push(b);
      }
    }
    nodes.push(keep);
    actions.replaceChildren(...nodes);
    // On short screens the choice buttons may sit below the fold; bring them into view.
    if (selected) actions.scrollIntoView?.({ block: 'nearest' });
  }

  const cards = options.map((option) => {
    const card = offerCard(option);
    card.addEventListener('click', () => {
      if (card.disabled) return;
      selected = selected === option ? null : option;
      for (const c of cards) c.setAttribute('aria-pressed', String(c === card && selected !== null));
      env.sound('select');
      renderActions();
    });
    return card;
  });
  renderActions();

  const instruction = replaceMode
    ? 'Your hands are full. Take a relic by setting one down, or keep what you carry.'
    : 'Take one relic into your empty slot, or keep what you carry.';
  const sub = view.healed > 0 ? `Rest restores ${view.healed} health.` : 'A moment of safety.';
  return {
    nodes: [
      head('Station', view.stationName, sub),
      slots,
      el('p', 'oys-note', {}, [instruction]),
      el('div', 'oys-cards', { role: 'group', 'aria-label': 'Relics offered' }, cards),
      actions,
    ],
    focus: cards.find((c) => !c.disabled) ?? keep,
  };
}

// ------------------------------------------------------------------ ending
export function atlasLine(discoveries: readonly string[]): string {
  if (discoveries.length === 0) return 'No new atlas entries this time.';
  return `New in the atlas: ${discoveries.join(', ')}.`;
}

/** Body and soul together in a gold ring, or apart with the thread broken between them. */
export function endingEmblem(escaped: boolean): string {
  const p = palette;
  const inner = escaped
    ? `<circle cx="40" cy="24" r="18" fill="none" stroke="${p.gold}" stroke-width="1.6"/>` +
      `<circle cx="40" cy="24" r="22" fill="none" stroke="${p.gold}" stroke-opacity=".35" stroke-width="1"/>` +
      `<circle cx="45" cy="22" r="7" fill="${p.soul_core}" opacity=".95"/>` +
      `<circle cx="36" cy="25" r="8" fill="${p.ivory}" stroke="${p.cobalt_deep}" stroke-width="1.2"/>` +
      `<rect x="31.5" y="22.6" width="9" height="2.6" rx="1.3" fill="${p.mask_black}"/>`
    : `<path d="M22 26 Q31 20 37 25" fill="none" stroke="${p.vermilion}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<path d="M45 24 Q51 29 58 25" fill="none" stroke="${p.vermilion}" stroke-opacity=".45" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="2 4"/>` +
      `<circle cx="17" cy="27" r="8" fill="${p.ivory}" stroke="${p.cobalt_deep}" stroke-width="1.2"/>` +
      `<rect x="12.5" y="24.6" width="9" height="2.6" rx="1.3" fill="${p.mask_black}"/>` +
      `<circle cx="64" cy="22" r="6.5" fill="${p.soul_core}" opacity=".35"/>`;
  return `<svg class="oys-emblem" viewBox="0 0 80 48" width="120" height="72" aria-hidden="true" focusable="false">${inner}</svg>`;
}

export function endingContent(view: EndingView, onAgain: () => void, env: PanelEnv, saveNote: HTMLElement): PanelContent {
  const again = button('oys-btn', 'Again');
  again.addEventListener('click', () => {
    env.close();
    onAgain();
  });
  const stats = el('dl', 'oys-stats', {}, [
    el('dt', '', {}, ['Time']),
    el('dd', '', {}, [formatDuration(view.seconds)]),
    el('dt', '', {}, ['Rooms cleared']),
    el('dd', '', {}, [String(view.roomsCleared)]),
    el('dt', '', {}, ['Start']),
    el('dd', '', {}, [view.starterName]),
  ]);
  const relics = el(
    'div',
    'oys-ending-relics',
    { 'aria-label': 'Relics carried' },
    view.relics.map((r) => el('span', 'oys-slot', {}, [iconSpan(relicIconSvg(r.id, 26)), r.name])),
  );
  return {
    nodes: [
      el('div', 'oys-stack', {}, [
        iconSpan(endingEmblem(view.escaped)),
        el('div', 'oys-eyebrow-sm', {}, [view.escaped ? 'The last gate' : 'The railway']),
        el('h2', 'oys-heading', { id: 'oys-choice-h' }, [view.escaped ? 'Escaped.' : 'Lost on the line.']),
        el('p', 'oys-ending-line', {}, [view.escaped ? ESCAPED_LINE : FAILED_LINE]),
        el('div', 'oys-rule'),
        stats,
        relics,
        el('p', 'oys-atlas', {}, [atlasLine(view.discoveries)]),
        again,
        saveNote,
      ]),
    ],
    focus: again,
  };
}
