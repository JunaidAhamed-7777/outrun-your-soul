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
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
}
.oys-health { display: flex; gap: 7px; align-items: center; justify-self: start; padding: 6px 2px; }
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
  justify-self: center;
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
.oys-hud-right { justify-self: end; display: flex; align-items: center; gap: 8px; }
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
.oys-result.is-victory .oys-heading { color: #fff3da; text-shadow: 0 0 24px ${rgba(p.gold, 0.55)}; }
.oys-result.is-defeat .oys-heading { color: var(--ivory); }
.oys-result.is-victory .oys-rule { border-color: var(--gold); }
.oys-ui:not(.is-reduced) .oys-result .oys-stack { animation: oys-rise 600ms cubic-bezier(.2,.7,.2,1) both; }

/* fatal */
.oys-fatal { background: var(--cobalt-deep); }
.oys-fatal .oys-note { font-size: 15px; max-width: 360px; }

@media (prefers-reduced-motion: reduce) {
  .oys-ui *, .oys-ui *::before, .oys-ui *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; }
}
@media (min-height: 760px) { .oys-hint { font-size: 16px; } }
`;

export function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
