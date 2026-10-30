/**
 * Rules RNG: mulberry32 over a uint32 state stored in SimState.rng, so the full
 * generator state is saved with a room-entry checkpoint. Decorative randomness
 * (particles, idle sway) must never draw from this generator.
 */

/** Normalise any finite number into a non-zero uint32 seed. */
export function seedRng(seed: number): number {
  let s = Math.floor(Math.abs(seed)) >>> 0;
  // Mix so that small consecutive seeds do not produce correlated first values.
  s = Math.imul(s ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  s = (s ^ (s >>> 13)) >>> 0;
  return s === 0 ? 0x6d2b79f5 : s;
}

/** Advance the generator held in `holder.rng` and return a float in [0, 1). */
export function nextRandom(holder: { rng: number }): number {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function nextInt(holder: { rng: number }, n: number): number {
  return Math.floor(nextRandom(holder) * n);
}
