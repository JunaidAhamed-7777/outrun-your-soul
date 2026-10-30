import { describe, expect, it } from 'vitest';
import { DEMO, DEMO_CYCLE, DEMO_MEET_TIME, DEMO_STATIC, demoFrame } from '../../src/ui/title-demo';

describe('title vignette timing', () => {
  it('starts reunited at the beginning of the path', () => {
    expect(demoFrame(0)).toMatchObject({ body: 0, soul: 0 });
  });

  it('moves the body much faster than the soul', () => {
    const first = DEMO.dashes[0];
    if (!first) throw new Error('no dashes');
    const a = demoFrame(first.at);
    const b = demoFrame(first.at + 0.1);
    expect(b.body - a.body).toBeGreaterThan(5 * (b.soul - a.soul));
  });

  it('never lets the soul overtake the body', () => {
    for (let t = 0; t < DEMO_CYCLE * 2; t += 0.01) {
      const f = demoFrame(t);
      expect(f.soul).toBeLessThanOrEqual(f.body + 1e-12);
      expect(f.opacity).toBeGreaterThanOrEqual(0);
      expect(f.opacity).toBeLessThanOrEqual(1);
    }
  });

  it('reunites with a glow when the soul arrives', () => {
    const f = demoFrame(DEMO_MEET_TIME + 0.05);
    expect(f.soul).toBeCloseTo(f.body, 6);
    expect(f.reunion).toBeGreaterThan(0.9);
  });

  it('loops seamlessly', () => {
    expect(demoFrame(DEMO_CYCLE + 0.2)).toEqual(demoFrame(0.2));
  });

  it('has a separated static frame for reduced motion', () => {
    expect(DEMO_STATIC.body).toBeGreaterThan(DEMO_STATIC.soul);
  });
});
