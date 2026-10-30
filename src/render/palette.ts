/**
 * Presentation palette. Hex values live in src/content/palette.json (shared with the
 * Blender scripts); this module only exposes them in the forms the renderer needs.
 */
import { Color } from 'three';
import paletteJson from '../content/palette.json';

export type PaletteKey = Exclude<keyof typeof paletteJson, '_comment'>;

export const PALETTE_HEX = paletteJson as Record<PaletteKey, string> & { _comment: string };

export const PALETTE_KEYS = Object.keys(paletteJson).filter((k) => k !== '_comment') as PaletteKey[];

/** sRGB hex -> Three Color in the linear working space (ColorManagement handles conversion). */
export function color(key: PaletteKey): Color {
  return new Color(PALETTE_HEX[key]);
}

/** True when a material name matches a palette key (Blender materials are named after keys). */
export function isPaletteKey(name: string): name is PaletteKey {
  return (PALETTE_KEYS as string[]).includes(name);
}
