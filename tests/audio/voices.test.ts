import { describe, expect, it } from 'vitest';
import { CUE_SPECS, GROUP_LIMITS, VoiceLimiter, type VoiceSpec } from '../../src/audio/voices';

const spec = (over: Partial<VoiceSpec> = {}): VoiceSpec => ({
  group: 'impact',
  duration: 1,
  minInterval: 0,
  priority: 5,
  ...over,
});

describe('VoiceLimiter', () => {
  it('admits voices under the caps', () => {
    const v = new VoiceLimiter();
    const a = v.admit('cutTing', spec(), 0);
    expect(a.admit).toBe(true);
    expect(a.steal).toEqual([]);
    expect(v.active(0)).toBe(1);
  });

  it('debounces the same cue inside its minimum interval', () => {
    const v = new VoiceLimiter();
    const s = spec({ minInterval: 0.1 });
    expect(v.admit('trackTick', s, 0).admit).toBe(true);
    expect(v.admit('trackTick', s, 0.05).admit).toBe(false);
    expect(v.admit('trackTick', s, 0.11).admit).toBe(true);
  });

  it('steals the oldest voice when a group is full', () => {
    const v = new VoiceLimiter();
    const ids = [0, 1, 2, 3].map((i) => v.admit(`c${i}`, spec(), i * 0.01).id);
    expect(ids.length).toBe(GROUP_LIMITS.impact);
    const next = v.admit('c4', spec(), 0.05);
    expect(next.admit).toBe(true);
    expect(next.steal).toEqual([ids[0]]);
    expect(v.active(0.05)).toBe(GROUP_LIMITS.impact);
  });

  it('refuses to steal a higher-priority voice', () => {
    const v = new VoiceLimiter(18, { ...GROUP_LIMITS, impact: 1 });
    v.admit('hit', spec({ priority: 10 }), 0);
    expect(v.admit('fizzle', spec({ priority: 1 }), 0.01).admit).toBe(false);
  });

  it('enforces the global cap by stealing the lowest-priority oldest voice', () => {
    const v = new VoiceLimiter(3);
    const low = v.admit('a', spec({ group: 'tick', priority: 1 }), 0).id;
    v.admit('b', spec({ group: 'air', priority: 5 }), 0.01);
    v.admit('c', spec({ group: 'chime', priority: 5 }), 0.02);
    const d = v.admit('d', spec({ group: 'pluck', priority: 6 }), 0.03);
    expect(d.admit).toBe(true);
    expect(d.steal).toEqual([low]);
    expect(v.active(0.03)).toBe(3);
  });

  it('frees voices when they end or are released', () => {
    const v = new VoiceLimiter();
    const a = v.admit('x', spec({ duration: 0.5 }), 0);
    v.admit('y', spec({ duration: 2 }), 0);
    expect(v.active(0.6)).toBe(1);
    v.release(a.id);
    expect(v.active(0.6)).toBe(1);
    v.reset();
    expect(v.active(0.6)).toBe(0);
  });

  it('survives a burst of identical events without exceeding caps', () => {
    const v = new VoiceLimiter();
    let admitted = 0;
    for (let i = 0; i < 200; i++) {
      const s = CUE_SPECS.fizzle;
      if (v.admit('fizzle', s, i * 0.001).admit) admitted++;
      expect(v.active(i * 0.001)).toBeLessThanOrEqual(GROUP_LIMITS[s.group]);
    }
    expect(admitted).toBeLessThan(10);
  });

  it('gives every cue a spec whose group exists', () => {
    for (const [name, s] of Object.entries(CUE_SPECS)) {
      expect(GROUP_LIMITS[s.group], name).toBeGreaterThan(0);
      expect(s.duration, name).toBeGreaterThan(0);
    }
  });
});
