/** Inline SVG glyphs (original, currentColor). Kept tiny: no icon font or downloads. */
const svg = (body: string, viewBox = '0 0 24 24'): string =>
  `<svg viewBox="${viewBox}" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  pause: svg('<rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none"/>'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>'),
  soundOn: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a7.8 7.8 0 0 1 0 11"/>'),
  soundOff: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  motion: svg('<path d="M3 12h4M5 8h6M5 16h6"/><circle cx="16.5" cy="12" r="3.5" fill="currentColor" stroke="none"/>'),
  restart: svg('<path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M5 4.5V8h3.5"/>'),
  /** Spool glyph for the thread meter. */
  spool: svg('<rect x="6" y="4" width="12" height="3" rx="1" fill="currentColor" stroke="none"/><rect x="6" y="17" width="12" height="3" rx="1" fill="currentColor" stroke="none"/><path d="M8 9.5h8M8 12h8M8 14.5h8" stroke-width="1.6"/>'),
} as const;

export type IconName = keyof typeof ICONS;
