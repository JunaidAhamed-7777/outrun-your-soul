/**
 * Pitch vocabulary. Everything sits in D Lydian: bright and suspended, a "sunlit"
 * mode whose raised fourth resolves sweetly when body and soul meet. The body plays
 * in the upper octave; the soul answers the same pitch class an octave lower.
 */
export const ROOT_HZ = 293.66; // D4
export const LYDIAN = [0, 2, 4, 6, 7, 9, 11] as const;

/** Semitones above the root for a scale degree; degrees outside 0..6 wrap by octave. */
export function degreeToSemitones(degree: number): number {
  const d = Math.round(degree);
  const octave = Math.floor(d / LYDIAN.length);
  const idx = ((d % LYDIAN.length) + LYDIAN.length) % LYDIAN.length;
  return octave * 12 + (LYDIAN[idx] ?? 0);
}

export function semitonesToHz(semitones: number, root = ROOT_HZ): number {
  return root * 2 ** (semitones / 12);
}

export function degreeHz(degree: number, octaveShift = 0): number {
  return semitonesToHz(degreeToSemitones(degree) + octaveShift * 12);
}

/** Reunion chord tones (degrees): root, third, fifth, plus the ninth for brightness. */
export const REUNION_CHORD = [0, 2, 4] as const;
export const REUNION_BRIGHT = [0, 2, 4, 7, 8] as const;
