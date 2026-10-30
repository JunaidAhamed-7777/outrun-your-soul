import { describe, expect, it } from 'vitest';
import { simDiagnostics } from '../../src/sim/step';
import type { LaneDef } from '../../src/sim/types';
import { dash, makeSim, ofType, run } from './helpers';

describe('regressions found by fuzzing', () => {
  it('a dash starting exactly tangent to an active lane is shielded once, not rediscovered forever', () => {
    const lane: LaneDef = { id: 'col', rect: { x: 7, y: 0, w: 1, h: 12 }, period: 10, activeFrom: 0, activeTo: 9, warnLead: 0 };
    // Body centre exactly one radius from the lane edge.
    const s = makeSim({ spawn: { x: 8.3, y: 3 }, lanes: [lane] });
    const before = simDiagnostics.iterationOverflows;
    const events = run(s, { first: [dash(-1.5, -0.4)], seconds: 0.4 });
    expect(simDiagnostics.iterationOverflows).toBe(before);
    // Touching at departure counts as already inside: at most one shield is reported.
    expect(ofType(events, 'shielded').filter((e) => e.reason === 'dash').length).toBeLessThanOrEqual(1);
    // Protection ends at arrival inside the lane: the next instant is a real hit.
    expect(ofType(events, 'hit')[0]?.source).toBe('lane');
  });

  it('a lane boundary approached through float accumulation still fires on time', () => {
    const lane: LaneDef = { id: 'L', rect: { x: 0, y: 6, w: 12, h: 1 }, period: 2, activeFrom: 1, activeTo: 1.5, warnLead: 0.5 };
    const s = makeSim({ spawn: { x: 6, y: 2 }, lanes: [lane] });
    const events = run(s, { seconds: 20.05 });
    // 10 cycles x 3 transitions, none skipped.
    expect(ofType(events, 'lane')).toHaveLength(30);
  });
});
