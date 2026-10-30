import { describe, expect, it } from 'vitest';
import { bootFraction, SCRIPT_SHARE } from '../../src/game/boot';

describe('boot progress', () => {
  it('reserves the first share for start-up, then fills with models loaded', () => {
    expect(bootFraction(0, 17)).toBeCloseTo(SCRIPT_SHARE);
    expect(bootFraction(17, 17)).toBe(1);
    expect(bootFraction(8, 16)).toBeCloseTo(SCRIPT_SHARE + (1 - SCRIPT_SHARE) / 2);
  });

  it('never leaves 0..1 and treats an empty model list as done', () => {
    expect(bootFraction(30, 17)).toBe(1);
    expect(bootFraction(-2, 17)).toBeCloseTo(SCRIPT_SHARE);
    expect(bootFraction(0, 0)).toBe(1);
  });
});
