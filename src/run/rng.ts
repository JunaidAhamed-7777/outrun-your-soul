/**
 * Small deterministic PRNG for run-level choices (expedition graph, draft offers).
 * Independent of the simulation's rules RNG so room combat never shifts route
 * generation, and vice versa. State is a uint32 that can be saved and restored.
 */

/** Advance a mulberry32 state; returns the next state and a float in [0, 1). */
export function nextRandom(state: number): { state: number; value: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: next, value };
}

/** Mutable cursor over a mulberry32 stream, for local use inside pure functions. */
export class RunRandom {
  constructor(public state: number) {
    this.state = state >>> 0;
  }

  float(): number {
    const r = nextRandom(this.state);
    this.state = r.state;
    return r.value;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  /** Fisher-Yates shuffle of a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }
}

/** FNV-1a over a string, mixed with a seed. Derives stable sub-seeds (e.g. per room node). */
export function hashSeed(seed: number, label: string): number {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Final avalanche so nearby labels produce unrelated seeds.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
