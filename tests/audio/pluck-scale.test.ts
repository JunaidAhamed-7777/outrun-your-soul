import { describe, expect, it } from 'vitest';
import { renderPluck } from '../../src/audio/pluck';
import { ROOT_HZ, degreeHz, degreeToSemitones, semitonesToHz } from '../../src/audio/scale';

const rms = (a: Float32Array, from: number, to: number): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += (a[i] ?? 0) ** 2;
  return Math.sqrt(s / Math.max(1, to - from));
};

describe('renderPluck', () => {
  const sr = 44100;
  const opts = { seconds: 0.8, brightness: 0.8, t60: 0.6 };

  it('is deterministic for the same seed', () => {
    expect(renderPluck(sr, 587, opts)).toEqual(renderPluck(sr, 587, opts));
  });

  it('renders the requested length with finite samples within [-1, 1]', () => {
    const a = renderPluck(sr, 587, opts);
    expect(a.length).toBe(Math.floor(sr * 0.8));
    for (const x of a) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
    }
  });

  it('decays over time and ends silently', () => {
    const a = renderPluck(sr, 440, opts);
    const n = a.length;
    expect(rms(a, Math.floor(n * 0.8), n)).toBeLessThan(rms(a, 0, Math.floor(n * 0.1)) * 0.2);
    expect(Math.abs(a[n - 1] ?? 1)).toBeLessThan(1e-3);
  });

  it('repeats at roughly the requested pitch period', () => {
    const a = renderPluck(sr, 441, { seconds: 0.2, brightness: 0.2, t60: 2 });
    const period = Math.round(sr / 441);
    let best = 0;
    let bestLag = 0;
    for (let lag = 40; lag < 200; lag++) {
      let c = 0;
      for (let i = 2000; i < 6000; i++) c += (a[i] ?? 0) * (a[i + lag] ?? 0);
      if (c > best) {
        best = c;
        bestLag = lag;
      }
    }
    expect(Math.abs(bestLag - period)).toBeLessThanOrEqual(1);
  });
});

describe('scale', () => {
  it('maps Lydian degrees with octave wrap', () => {
    expect(degreeToSemitones(0)).toBe(0);
    expect(degreeToSemitones(3)).toBe(6);
    expect(degreeToSemitones(7)).toBe(12);
    expect(degreeToSemitones(-1)).toBe(-1);
  });

  it('converts to hertz around D4', () => {
    expect(semitonesToHz(0)).toBeCloseTo(ROOT_HZ);
    expect(semitonesToHz(12)).toBeCloseTo(ROOT_HZ * 2);
    expect(degreeHz(0, -1)).toBeCloseTo(ROOT_HZ / 2);
  });
});
