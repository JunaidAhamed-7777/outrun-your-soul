/**
 * Overlay stylesheet, injected once. Colours come from the shared palette so the
 * DOM layer matches the Blender/Three.js scene. No web fonts: system serif for
 * display, system UI for small text.
 */
import palette from '../content/palette.json';

const STYLE_ID = 'oys-ui-style';

/** "#rrggbb" + alpha -> rgba(). */
export function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const p = palette;

export const CSS = /* css */ `
.oys-ui {
  --ivory: ${p.ivory};
  --ivory-dim: ${rgba(p.ivory, 0.62)};
  --ivory-faint: ${rgba(p.ivory, 0.18)};
  --cobalt: ${p.cobalt};
  --cobalt-deep: ${p.cobalt_deep};
  --vermilion: ${p.vermilion};
  --vermilion-dark: ${p.vermilion_dark};
  --gold: ${p.gold};
  --gold-dark: ${p.gold_dark};
  --soul: ${p.soul_core};
  --soul-glow: ${p.soul_glow};
  --hit: ${p.hit_red};
  --sky: ${p.sky_top};
  --shade: ${rgba(p.cobalt_deep, 0.55)};
  --font-display: "Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", Georgia, serif;
  --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --safe-top: max(12px, env(safe-area-inset-top));
  --safe-right: max(12px, env(safe-area-inset-right));
  --safe-bottom: max(14px, env(safe-area-inset-bottom));
  --safe-left: max(12px, env(safe-area-inset-left));
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: var(--ivory);
  font-family: var(--font-ui);
  -webkit-font-smoothing: antialiased;
  z-index: 10;
  overflow: hidden;
}
.oys-ui *, .oys-ui *::before, .oys-ui *::after { box-sizing: border-box; }
.oys-ui [hidden] { display: none !important; }

/* ---------- buttons ---------- */
/* Zero-specificity base so component classes below always win. */
:where(.oys-ui) button {
  font: inherit;
  color: inherit;
}
.oys-ui button {
  pointer-events: auto;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.oys-ui button:focus { outline: none; }
.oys-ui button:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
.oys-btn {
  min-height: 52px;
  min-width: 200px;
  padding: 0 32px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, ${rgba('#ff6a3d', 1)}, var(--vermilion) 55%, var(--vermilion-dark));
  box-shadow: 0 1px 0 ${rgba('#ffffff', 0.35)} inset, 0 8px 22px ${rgba(p.vermilion_dark, 0.45)};
  font-family: var(--font-display);
  font-size: 19px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  transition: transform 120ms ease, filter 120ms ease;
}
.oys-btn:active { transform: translateY(1px) scale(0.985); filter: brightness(0.95); }
.oys-btn--ghost {
  background: ${rgba(p.cobalt_deep, 0.35)};
  border: 1px solid ${rgba(p.ivory, 0.45)};
  box-shadow: none;
  font-size: 15px;
  min-height: 46px;
  min-width: 180px;
}
.oys-toggle-row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.oys-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 13px 0 10px;
  border-radius: 999px;
  border: 1px solid ${rgba(p.ivory, 0.3)};
  background: ${rgba(p.cobalt_deep, 0.4)};
  font-size: 13px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.oys-toggle svg { width: 18px; height: 18px; }
.oys-toggle[aria-pressed="true"] { border-color: ${rgba(p.gold, 0.85)}; color: #fff7e4; }
.oys-toggle .oys-toggle-state { color: var(--ivory-dim); font-variant: all-small-caps; letter-spacing: 0.08em; }
.oys-toggle[aria-pressed="true"] .oys-toggle-state { color: var(--gold); }

/* ---------- HUD ---------- */
.oys-hud { position: absolute; inset: 0; pointer-events: none; }
.oys-hud-top {
  position: absolute;
  top: var(--safe-top);
  left: var(--safe-left);
  right: var(--safe-right);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.oys-health { display: flex; gap: 7px; align-items: center; padding: 6px 2px 6px 4px; }
.oys-pip {
  width: 13px;
  height: 13px;
  transform: rotate(45deg);
  border-radius: 2px;
  background: linear-gradient(135deg, #ff7a52, var(--vermilion) 60%, var(--vermilion-dark));
  box-shadow: 0 0 0 1.5px ${rgba(p.ivory, 0.92)}, 0 2px 6px ${rgba('#000000', 0.35)};
}
.oys-pip.is-empty { background: ${rgba(p.cobalt_deep, 0.45)}; box-shadow: 0 0 0 1.5px ${rgba(p.ivory, 0.4)}; }
.oys-gate {
  position: absolute;
  top: calc(var(--safe-top) + 52px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: 90vw;
  padding: 4px 12px;
  border-radius: 999px;
  background: ${rgba(p.cobalt_deep, 0.45)};
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.1em;
  color: var(--gold);
  text-shadow: 0 1px 2px ${rgba(p.cobalt_deep, 0.9)}, 0 0 12px ${rgba(p.cobalt_deep, 0.7)};
  white-space: nowrap;
  opacity: 0;
  transition: opacity 300ms ease;
}
.oys-gate.is-on { opacity: 1; }
.oys-hud-right { display: flex; align-items: center; gap: 10px; }
.oys-thread { display: flex; align-items: center; gap: 5px; color: var(--ivory-dim); }
.oys-thread svg { width: 16px; height: 16px; }
.oys-thread-track {
  position: relative;
  width: 84px;
  height: 8px;
  border-radius: 6px;
  background: ${rgba(p.cobalt_deep, 0.55)};
  box-shadow: 0 0 0 1px ${rgba(p.ivory, 0.35)};
  overflow: hidden;
}
.oys-thread-fill {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  transform: scaleX(0);
  background:
    repeating-linear-gradient(115deg, ${rgba('#ffffff', 0.16)} 0 3px, transparent 3px 7px),
    linear-gradient(180deg, #ff7448, var(--vermilion) 60%, var(--vermilion-dark));
  transition: transform 90ms linear;
}
.oys-thread.is-taut .oys-thread-track { box-shadow: 0 0 0 1px ${rgba(p.gold, 0.8)}; }
.oys-thread.is-full .oys-thread-track { box-shadow: 0 0 0 1.5px var(--gold), 0 0 10px ${rgba(p.gold, 0.6)}; }
.oys-thread.is-full { color: var(--gold); }
.oys-ui:not(.is-reduced) .oys-thread.is-full .oys-thread-track { animation: oys-taut 0.9s ease-in-out infinite alternate; }
@keyframes oys-taut { from { box-shadow: 0 0 0 1.5px var(--gold), 0 0 4px ${rgba(p.gold, 0.3)}; } to { box-shadow: 0 0 0 1.5px var(--gold), 0 0 12px ${rgba(p.gold, 0.75)}; } }
.oys-icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid ${rgba(p.ivory, 0.35)};
  background: ${rgba(p.cobalt_deep, 0.5)};
  display: grid;
  place-items: center;
  padding: 0;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.oys-icon-btn svg { width: 20px; height: 20px; }

.oys-hint {
  position: absolute;
  left: 50%;
  bottom: calc(var(--safe-bottom) + 9vh);
  width: max-content;
  max-width: min(86vw, 420px);
  padding: 10px 18px;
  border-radius: 14px;
  background: ${rgba(p.cobalt_deep, 0.72)};
  box-shadow: 0 0 0 1px ${rgba(p.ivory, 0.16)}, 0 8px 24px ${rgba('#000000', 0.25)};
  font-size: 15px;
  line-height: 1.35;
  text-align: center;
  letter-spacing: 0.01em;
  opacity: 0;
  transform: translate(-50%, 8px);
  transition: opacity 260ms ease, transform 260ms ease;
}
.oys-hint.is-on { opacity: 1; transform: translate(-50%, 0); }
.oys-ui.is-reduced .oys-hint { transform: translate(-50%, 0); transition: opacity 200ms linear; }

.oys-vignette {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(ellipse at center, transparent 52%, ${rgba(p.hit_red, 0.55)} 100%);
}

/* ---------- panels ---------- */
.oys-panel {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: calc(var(--safe-top) + 12px) calc(var(--safe-right) + 12px) calc(var(--safe-bottom) + 12px) calc(var(--safe-left) + 12px);
  text-align: center;
  overflow-y: auto;
  touch-action: manipulation;
}
.oys-scrim {
  background: ${rgba('#0b1236', 0.68)};
  backdrop-filter: blur(6px) saturate(0.9);
  -webkit-backdrop-filter: blur(6px) saturate(0.9);
}
.oys-heading {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(30px, 8.5vw, 44px);
  letter-spacing: 0.06em;
  line-height: 1.1;
}
.oys-sub { margin: 0; font-family: var(--font-display); font-style: italic; font-size: 17px; color: var(--ivory-dim); }
.oys-note { margin: 0; font-size: 13px; color: var(--ivory-dim); max-width: 320px; line-height: 1.4; }
.oys-rule {
  width: min(240px, 60vw);
  height: 7px;
  border-top: 1px solid ${rgba(p.gold, 0.7)};
  border-bottom: 1px solid ${rgba(p.gold, 0.35)};
}
.oys-stack { display: flex; flex-direction: column; align-items: center; gap: 12px; }

/* title */
.oys-title {
  justify-content: space-between;
  background:
    radial-gradient(130% 55% at 50% -8%, ${rgba(p.sky_top, 0.55)}, transparent 62%),
    radial-gradient(90% 40% at 50% 104%, ${rgba(p.vermilion, 0.18)}, transparent 70%),
    linear-gradient(180deg, ${rgba(p.cobalt, 0.78)}, ${rgba(p.cobalt_deep, 0.95)} 70%);
}
.oys-title-top { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-top: 3vh; }
.oys-eyebrow { font-size: 12px; letter-spacing: 0.32em; text-transform: uppercase; color: var(--gold); }
.oys-wordmark {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  line-height: 0.95;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-shadow: 0 2px 0 ${rgba(p.cobalt_deep, 0.6)}, 0 0 30px ${rgba(p.sky_top, 0.25)};
}
.oys-wordmark span { display: block; }
.oys-wordmark .w1 { font-size: clamp(46px, 15vw, 86px); }
.oys-wordmark .w2 { font-size: clamp(25px, 8.2vw, 46px); letter-spacing: 0.3em; margin-top: 8px; color: #fff3da; }
.oys-credit { margin: 6px 0 0; font: 600 11px/1.2 var(--font-ui); letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); opacity: 0.85; text-align: center; }
.oys-tagline { margin: 0; font-family: var(--font-display); font-style: italic; font-size: clamp(16px, 4.4vw, 20px); color: var(--ivory-dim); max-width: 340px; }
.oys-vignette-svg { width: min(92vw, 420px); height: auto; overflow: visible; }
.oys-title-bottom { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-bottom: 2vh; }
.oys-controls-line { font-size: 13px; letter-spacing: 0.06em; color: var(--ivory-dim); }
.oys-controls-line b { color: var(--ivory); font-weight: 600; }
.oys-ui:not(.is-reduced) .oys-title .oys-wordmark { animation: oys-rise 900ms cubic-bezier(.2,.7,.2,1) both; }
.oys-ui:not(.is-reduced) .oys-title .oys-tagline { animation: oys-rise 900ms 160ms cubic-bezier(.2,.7,.2,1) both; }
.oys-ui:not(.is-reduced) .oys-title .oys-title-bottom { animation: oys-fade 700ms 380ms ease both; }
@keyframes oys-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes oys-fade { from { opacity: 0; } to { opacity: 1; } }

/* results */
.oys-stats { margin: 0; width: min(300px, 80vw); display: grid; grid-template-columns: 1fr auto; row-gap: 0; }
.oys-stats dt, .oys-stats dd {
  margin: 0;
  padding: 9px 2px;
  border-bottom: 1px solid ${rgba(p.gold, 0.22)};
  font-size: 15px;
}
.oys-stats dt { text-align: left; color: var(--ivory-dim); }
.oys-stats dd { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--font-display); font-size: 17px; }
.oys-result .oys-btn { margin-top: 12px; }
.oys-result.is-victory .oys-heading { color: #fff3da; text-shadow: 0 0 24px ${rgba(p.gold, 0.55)}; }
.oys-result.is-defeat .oys-heading { color: var(--ivory); }
.oys-result.is-victory .oys-rule { border-color: var(--gold); }
.oys-ui:not(.is-reduced) .oys-result .oys-stack { animation: oys-rise 600ms cubic-bezier(.2,.7,.2,1) both; }

/* fatal */
.oys-fatal { background: var(--cobalt-deep); }
.oys-fatal .oys-note { font-size: 15px; max-width: 360px; }

/* ---------- relic symbols ---------- */
.oys-relic-svg { display: block; overflow: visible; }
.oys-relic-svg .oys-acc-s { stroke: var(--relic-accent, var(--gold)); }
.oys-relic-svg .oys-acc-f { fill: var(--relic-accent, var(--gold)); }
.oys-relic-svg.fam-interception { --relic-accent: var(--soul-glow); }
.oys-relic-svg.fam-reach { --relic-accent: #ff6a3d; }
.oys-relic-svg.fam-reunion { --relic-accent: var(--gold); }

/* ---------- HUD: left column (health + relic strip) ---------- */
.oys-hud-left { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.oys-relics { display: flex; gap: 6px; padding-left: 2px; }
.oys-relics:empty { display: none; }
.oys-relic {
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--ivory);
  background: ${rgba(p.cobalt_deep, 0.55)};
  box-shadow: 0 0 0 1px ${rgba(p.ivory, 0.28)};
}
.oys-relic .oys-relic-svg { width: 20px; height: 20px; }
.oys-relic.is-active { box-shadow: 0 0 0 1.5px var(--soul-glow), 0 0 12px ${rgba(p.soul_glow, 0.8)}; }
.oys-ui:not(.is-reduced) .oys-relic.is-active { animation: oys-boost 0.5s ease-in-out infinite alternate; }
@keyframes oys-boost { from { box-shadow: 0 0 0 1.5px var(--soul-glow), 0 0 5px ${rgba(p.soul_glow, 0.5)}; } to { box-shadow: 0 0 0 1.5px var(--soul-glow), 0 0 14px ${rgba(p.soul_glow, 0.95)}; } }
.oys-relic.is-charged { box-shadow: 0 0 0 1.5px var(--gold), 0 0 10px ${rgba(p.gold, 0.7)}; }
.oys-charges { position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%); display: flex; gap: 2px; }
.oys-charge { width: 5px; height: 5px; border-radius: 50%; background: ${rgba(p.cobalt_deep, 0.8)}; box-shadow: 0 0 0 1px ${rgba(p.gold, 0.8)}; }
.oys-charge.is-full { background: var(--gold); }

/* ---------- boss bar (boss room only; never takes input) ---------- */
.oys-boss {
  position: absolute;
  /* Below the health + relic column so the two never touch on narrow phones. */
  top: calc(var(--safe-top) + 68px);
  left: 50%;
  transform: translate(-50%, -4px);
  width: min(66vw, 270px);
  padding: 5px 10px 7px;
  border-radius: 12px;
  background: ${rgba(p.cobalt_deep, 0.55)};
  pointer-events: none;
  opacity: 0;
  transition: opacity 360ms ease, transform 360ms ease;
}
.oys-boss.is-on { opacity: 1; transform: translate(-50%, 0); }
.oys-ui.is-reduced .oys-boss { transform: translate(-50%, 0); }
.oys-boss-head { display: flex; justify-content: center; align-items: center; gap: 8px; margin-bottom: 5px; }
.oys-boss-name {
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--gold);
  text-shadow: 0 1px 2px ${rgba(p.cobalt_deep, 0.95)}, 0 0 10px ${rgba(p.cobalt_deep, 0.8)};
  white-space: nowrap;
}
.oys-boss-stages { display: inline-flex; gap: 3px; }
.oys-boss-stage { width: 5px; height: 5px; transform: rotate(45deg); box-shadow: 0 0 0 1px ${rgba(p.gold, 0.7)}; }
.oys-boss-stage.is-on { background: var(--gold); }
.oys-boss-bar {
  display: flex;
  gap: 3px;
  padding: 2px;
  border-radius: 6px;
  background: ${rgba(p.cobalt_deep, 0.6)};
  box-shadow: 0 0 0 1px ${rgba(p.gold, 0.45)}, 0 4px 14px ${rgba('#000000', 0.25)};
}
.oys-boss-seg {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(180deg, #ffd27a, var(--gold) 45%, var(--vermilion));
  transform-origin: center;
}
.oys-boss-seg.is-empty { background: ${rgba(p.ivory, 0.14)}; }
.oys-hud.has-boss .oys-gate { top: calc(var(--safe-top) + 120px); }
.oys-hud.has-boss ~ .oys-intro { top: calc(var(--safe-top) + 122px); }

/* ---------- room intro card (never takes input) ---------- */
.oys-intro {
  position: absolute;
  top: calc(var(--safe-top) + 92px);
  left: 50%;
  transform: translate(-50%, -6px);
  width: max-content;
  max-width: 88vw;
  pointer-events: none;
  text-align: center;
  padding: 12px 26px 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, ${rgba(p.cobalt_deep, 0.82)}, ${rgba(p.cobalt_deep, 0.6)});
  box-shadow: 0 0 0 1px ${rgba(p.gold, 0.35)}, 0 12px 30px ${rgba('#000000', 0.3)};
  opacity: 0;
  transition: opacity 280ms ease, transform 280ms ease;
}
.oys-intro.is-on { opacity: 1; transform: translate(-50%, 0); }
.oys-ui.is-reduced .oys-intro { transform: translate(-50%, 0); }
.oys-intro-depth { font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--gold); }
.oys-intro-name { font-family: var(--font-display); font-size: clamp(24px, 7vw, 32px); letter-spacing: 0.05em; margin-top: 4px; }
.oys-intro-sub { font-family: var(--font-display); font-style: italic; font-size: 14px; color: var(--ivory-dim); margin-top: 2px; }

/* ---------- choice panels: title continue, starter, route, draft, ending ---------- */
.oys-continue-cap { margin: -4px 0 0; font-size: 13px; color: var(--ivory-dim); letter-spacing: 0.02em; }
.oys-continue-detail { margin: 0; font-family: var(--font-display); font-style: italic; font-size: 14px; color: var(--gold); }
.oys-btn--ghost.is-confirm { box-shadow: 0 0 0 1px var(--vermilion); border-color: var(--vermilion); color: #ffd9cc; }
.oys-choice { justify-content: flex-start; padding-top: calc(var(--safe-top) + 4vh); }
.oys-choice-head { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.oys-eyebrow-sm { font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--gold); }
.oys-cards { display: flex; flex-direction: column; gap: 12px; width: min(400px, 100%); }
.oys-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 14px;
  align-items: start;
  width: 100%;
  min-height: 64px;
  padding: 14px 16px;
  text-align: left;
  border-radius: 16px;
  border: 1px solid ${rgba(p.ivory, 0.24)};
  background: linear-gradient(180deg, ${rgba(p.cobalt, 0.5)}, ${rgba(p.cobalt_deep, 0.62)});
  box-shadow: 0 8px 22px ${rgba('#000000', 0.18)};
  transition: border-color 140ms ease, transform 140ms ease, box-shadow 140ms ease;
}
.oys-card:active { transform: scale(0.99); }
.oys-card[aria-pressed="true"] { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold), 0 0 22px ${rgba(p.gold, 0.28)}; }
.oys-card:disabled { cursor: not-allowed; opacity: 0.62; }
.oys-card-icon {
  grid-row: span 4;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: var(--ivory);
  background: ${rgba(p.cobalt_deep, 0.7)};
  box-shadow: 0 0 0 1px ${rgba(p.ivory, 0.18)} inset;
}
.oys-card-icon .oys-relic-svg { width: 38px; height: 38px; }
.oys-card-title { display: block; font-family: var(--font-display); font-size: 20px; letter-spacing: 0.03em; line-height: 1.2; }
.oys-card-text { display: block; font-size: 14px; line-height: 1.35; color: var(--ivory); }
.oys-card-cost { display: block; font-size: 13px; line-height: 1.35; font-style: italic; color: var(--ivory-dim); }
.oys-card-cost::before { content: 'Cost: '; font-style: normal; color: ${rgba(p.vermilion, 0.95)}; font-variant: all-small-caps; letter-spacing: 0.06em; }
.oys-card-reason { display: block; font-size: 13px; color: #ffb4a0; }
.oys-card-flavour { display: block; font-family: var(--font-display); font-style: italic; font-size: 15px; color: var(--ivory-dim); }
.oys-card--route { grid-template-columns: 1fr; }
/* Relic cards: symbol beside the name, rule and cost across the full width. */
.oys-card--relic { grid-template-columns: 38px 1fr; gap: 6px 12px; padding: 12px 14px; align-items: center; }
.oys-card--relic .oys-card-icon { grid-row: auto; width: 38px; height: 38px; border-radius: 11px; }
.oys-card--relic .oys-card-icon .oys-relic-svg { width: 30px; height: 30px; }
.oys-card--relic .oys-card-title { font-size: 19px; }
.oys-card--relic .oys-card-text, .oys-card--relic .oys-card-cost, .oys-card--relic .oys-card-reason { grid-column: 1 / -1; }
.oys-draft { gap: 14px; }
.oys-draft .oys-choice-head .oys-rule { display: none; }
.oys-draft .oys-heading { font-size: clamp(26px, 7.4vw, 36px); }
.oys-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.oys-tag {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  color: var(--gold);
  box-shadow: 0 0 0 1px ${rgba(p.gold, 0.45)};
}
.oys-slots { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.oys-slot {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 4px 12px 4px 6px;
  border-radius: 999px;
  font-size: 13px;
  background: ${rgba(p.cobalt_deep, 0.55)};
  box-shadow: 0 0 0 1px ${rgba(p.ivory, 0.3)};
}
.oys-slot .oys-relic-svg { width: 26px; height: 26px; }
.oys-slot.is-empty { color: var(--ivory-dim); background: transparent; padding-left: 14px; box-shadow: none; outline: 1px dashed ${rgba(p.ivory, 0.4)}; outline-offset: -1px; }
.oys-slot.is-drop { box-shadow: 0 0 0 1px var(--vermilion); text-decoration: line-through; text-decoration-color: ${rgba(p.vermilion, 0.8)}; }
.oys-draft-actions { display: flex; flex-direction: column; align-items: center; gap: 10px; width: min(400px, 100%); }
.oys-draft-actions .oys-btn, .oys-draft-actions .oys-btn--ghost { width: 100%; max-width: 340px; }
.oys-replace-q { margin: 0; font-family: var(--font-display); font-size: 16px; color: var(--ivory); }
.oys-btn--ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.oys-btn-reason { display: block; font-family: var(--font-ui); font-size: 12px; letter-spacing: 0; text-transform: none; color: #ffb4a0; }
.oys-ending { justify-content: center; }
.oys-emblem { display: block; margin: 0 auto -4px; }
.oys-ending.is-escaped .oys-heading { color: #fff3da; text-shadow: 0 0 26px ${rgba(p.gold, 0.6)}; }
.oys-ending-line { margin: 0; font-family: var(--font-display); font-size: clamp(18px, 5vw, 22px); line-height: 1.35; max-width: 340px; }
.oys-atlas { margin: 0; font-size: 13px; color: var(--gold); max-width: 320px; line-height: 1.45; }
.oys-ending-relics { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.oys-ui:not(.is-reduced) .oys-choice .oys-cards > * { animation: oys-rise 420ms cubic-bezier(.2,.7,.2,1) both; }
.oys-ui:not(.is-reduced) .oys-choice .oys-cards > *:nth-child(2) { animation-delay: 70ms; }
.oys-ui:not(.is-reduced) .oys-choice .oys-cards > *:nth-child(3) { animation-delay: 140ms; }
.oys-ui:not(.is-reduced) .oys-ending .oys-stack { animation: oys-rise 700ms cubic-bezier(.2,.7,.2,1) both; }

@media (prefers-reduced-motion: reduce) {
  .oys-ui *, .oys-ui *::before, .oys-ui *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; }
}
@media (min-height: 760px) { .oys-hint { font-size: 16px; } }
/* Narrow phones: keep both settings toggles on one row. */
@media (max-width: 340px) {
  .oys-toggle { font-size: 12px; padding: 0 10px 0 8px; gap: 5px; }
  .oys-toggle svg { width: 16px; height: 16px; }
}
/* Short phones (e.g. 320x568): tighten the title so it never needs scrolling. */
@media (max-height: 660px) {
  .oys-card { padding: 10px 12px; gap: 2px 12px; }
  .oys-card-icon { width: 44px; height: 44px; }
  .oys-card-icon .oys-relic-svg { width: 32px; height: 32px; }
  .oys-card-title { font-size: 18px; }
  .oys-card-text { font-size: 13px; }
  .oys-cards { gap: 8px; }
  .oys-choice { padding-top: calc(var(--safe-top) + 8px); }
  .oys-title .oys-controls-line { display: none; }
  .oys-title.has-continue .oys-vignette-svg { width: min(62vw, 260px); }
  .oys-title.has-continue .oys-title-bottom { gap: 8px; }
  .oys-continue-cap { margin-top: -6px; }
  .oys-emblem { width: 84px; height: 50px; margin-bottom: -8px; }
  .oys-ending .oys-stack { gap: 9px; }
  .oys-ending-line { font-size: 17px; }
  .oys-ending .oys-slot { min-height: 34px; }
  .oys-panel { gap: 12px; }
  .oys-title-top { margin-top: 0; gap: 8px; }
  .oys-wordmark .w1 { font-size: clamp(36px, 12vw, 64px); }
  .oys-wordmark .w2 { font-size: clamp(20px, 6.6vw, 36px); margin-top: 4px; }
  .oys-tagline { font-size: 15px; }
  .oys-vignette-svg { width: min(78vw, 330px); }
  .oys-title-bottom { gap: 10px; margin-bottom: 0; }
  .oys-btn { min-height: 48px; }
  .oys-heading { font-size: clamp(26px, 8vw, 36px); }
  .oys-stats dt, .oys-stats dd { padding: 7px 2px; }
}
`;

export function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
