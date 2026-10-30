import { describe, expect, it } from 'vitest';
import {
  GATE_WAITING_TEXT,
  formatDuration,
  gateLabel,
  healthLabel,
  healthPips,
  resultStats,
  threadMeter,
} from '../../src/ui/hud-logic';

describe('threadMeter', () => {
  it('reads reunited with no outstanding route', () => {
    const m = threadMeter(0, 6, 0.35);
    expect(m).toMatchObject({ used: 0, fraction: 0, remaining: 6, state: 'reunited' });
  });

  it('distinguishes slack, taut and full', () => {
    expect(threadMeter(2, 6, 0.35).state).toBe('slack');
    expect(threadMeter(4.5, 6, 0.35).state).toBe('taut');
    expect(threadMeter(5.8, 6, 0.35).state).toBe('full');
  });

  it('clamps the fraction and never reports negative remaining', () => {
    const m = threadMeter(7, 6, 0.35);
    expect(m.fraction).toBe(1);
    expect(m.remaining).toBe(0);
  });

  it('handles bad numbers without NaN', () => {
    const m = threadMeter(Number.NaN, 0, 0.35);
    expect(Number.isNaN(m.fraction)).toBe(false);
    expect(m.used).toBe(0);
  });
});

describe('health', () => {
  it('fills pips from the left and clamps', () => {
    expect(healthPips(3, 5)).toEqual([true, true, true, false, false]);
    expect(healthPips(9, 5)).toEqual([true, true, true, true, true]);
    expect(healthPips(-2, 3)).toEqual([false, false, false]);
  });

  it('describes health for assistive tech', () => {
    expect(healthLabel(2, 5)).toBe('Health 2 of 5');
  });
});

describe('formatDuration', () => {
  it('formats minutes, seconds and tenths', () => {
    expect(formatDuration(0)).toBe('0:00.0');
    expect(formatDuration(42.34)).toBe('0:42.3');
    expect(formatDuration(125)).toBe('2:05.0');
    expect(formatDuration(59.99)).toBe('0:59.9');
  });

  it('never shows negative or NaN time', () => {
    expect(formatDuration(-4)).toBe('0:00.0');
    expect(formatDuration(Number.NaN)).toBe('0:00.0');
  });
});

describe('gate label and results', () => {
  it('only labels the gate when it waits for the pair', () => {
    expect(gateLabel('sealed')).toBeNull();
    expect(gateLabel('ready')).toBe(GATE_WAITING_TEXT);
    expect(gateLabel('open')).toBeNull();
  });

  it('lists run stats in a fixed order', () => {
    const lines = resultStats({
      time: 61.25,
      stats: { dashes: 9, returns: 2, cuts: 3, kills: 3, hits: 1, contactReunions: 2, exhaustionReunions: 1 },
    });
    expect(lines.map((l) => l.label)).toEqual(['Time', 'Hits taken', 'Bolts cut', 'Sentries felled', 'Contact reunions']);
    expect(lines[0]?.value).toBe('1:01.2');
    expect(lines[2]?.value).toBe('3');
  });
});
