/**
 * Six original relic symbols drawn on a 32-unit grid with one stroke language
 * (round caps/joins). Ivory line work uses currentColor; the accent strokes/fills
 * take the relic family colour from CSS (interception = soul blue, reach = thread
 * vermilion, reunion = gold), so the family reads at a glance even at 20 px.
 */
import { RELICS, type RelicFamily } from '../run/relics';

const BODIES: Readonly<Record<string, string>> = {
  // A needle with two song arcs rising from its cut.
  needlesong:
    '<path d="M6.5 25.5 21.6 10.4" stroke-width="2.6"/>' +
    '<ellipse cx="23.7" cy="8.3" rx="3.1" ry="1.7" transform="rotate(-45 23.7 8.3)"/>' +
    '<path class="oys-acc-s" d="M16.4 22.6c2.4.1 4.2 1.9 4.4 4.3"/>' +
    '<path class="oys-acc-s" d="M19.4 18.1c4.3.2 7.6 3.5 7.8 7.8"/>',
  // A lantern with a flame inside a dashed halo.
  glass_lantern:
    '<circle class="oys-acc-s" cx="16" cy="16.5" r="13" stroke-dasharray="2.2 3.2" stroke-width="1.6"/>' +
    '<path d="M12.6 8.6a3.4 3.4 0 0 1 6.8 0"/>' +
    '<path d="M10.6 9.6h10.8"/>' +
    '<path d="M11.6 9.6 10.7 22.4h10.6l-.9-12.8"/>' +
    '<path d="M9.4 24.6h13.2"/>' +
    '<path class="oys-acc-f" stroke="none" d="M16 12.8c2 2.2 2 4.8 0 6.2-2-1.4-2-4 0-6.2z"/>',
  // A spool paying out a long wandering thread.
  long_silk:
    '<path d="M3.5 6.5h8.5M3.5 19.5h8.5"/>' +
    '<rect x="5" y="6.5" width="5.5" height="13" rx="1"/>' +
    '<path class="oys-acc-s" d="M10.5 11.5c5 0 6-5.2 10.6-5.2 4 0 6.6 3.2 5 6.4-1.8 3.4-9.4 2.4-10.6 6.6-1 3.6 3 6.6 10.8 6.2"/>',
  // A seam closed by three short cross stitches.
  short_stitch:
    '<path d="M4.5 16h23" opacity=".5"/>' +
    '<path class="oys-acc-s" d="M7 12.5l4 7M11 12.5l-4 7M14 12.5l4 7M18 12.5l-4 7M21 12.5l4 7M25 12.5l-4 7"/>' +
    '<path d="M5 25.5h7"/>',
  // A bell with its clapper and two ring lines.
  mourning_bell:
    '<path d="M16 4.5v3"/>' +
    '<path d="M9.6 21.2c1-2 1.3-4.2 1.3-7.4a5.1 5.1 0 0 1 10.2 0c0 3.2.3 5.4 1.3 7.4z"/>' +
    '<path d="M7.4 21.2h17.2"/>' +
    '<circle class="oys-acc-f" stroke="none" cx="16" cy="24.6" r="2.2"/>' +
    '<path class="oys-acc-s" d="M4.8 12.2c-1.2 1.7-1.2 4 0 5.7M27.2 12.2c1.2 1.7 1.2 4 0 5.7"/>',
  // A figure-eight knot above the ring where its decoy will stand.
  travelers_knot:
    '<path d="M16 14.2c-2.7-3.7-9.8-4.6-9.8-.1s7.1 3.8 9.8.1c2.7-3.7 9.8-4.6 9.8-.1s-7.1 3.8-9.8-.1z"/>' +
    '<path d="M13.4 16.8 10.6 23M18.6 16.8l2.8 6.2"/>' +
    '<ellipse class="oys-acc-s" cx="16" cy="26.4" rx="7.4" ry="2.1"/>',
};

const FALLBACK = '<circle cx="16" cy="16" r="9"/><path class="oys-acc-s" d="M16 11v6M16 21v.5"/>';

export const RELIC_ICON_IDS = Object.keys(BODIES);

export function relicFamily(id: string): RelicFamily | 'unknown' {
  const def = (RELICS as Readonly<Record<string, { family: RelicFamily } | undefined>>)[id];
  return def ? def.family : 'unknown';
}

/** Inline SVG for a relic symbol; unknown IDs get a neutral mark rather than nothing. */
export function relicIconSvg(id: string, size = 24): string {
  const body = BODIES[id] ?? FALLBACK;
  return (
    `<svg class="oys-relic-svg fam-${relicFamily(id)}" viewBox="0 0 32 32" width="${size}" height="${size}" ` +
    'aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" ' +
    `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
}
