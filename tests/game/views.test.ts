import { describe, expect, it } from 'vitest';
import { DEPARTURE_COURT } from '../../src/content/rooms/departure-court';
import { Director } from '../../src/game/director';
import { draftView, endingView, routeChoices, starterOptions } from '../../src/game/views';
import { createProgress, ProgressStore } from '../../src/run/progress';
import { CheckpointStore } from '../../src/save/checkpoint';
import { MemoryStorage } from '../../src/save/storage';
import type { SimState } from '../../src/sim/types';

const cleared = { health: 5, time: 10, stats: { hits: 0, cuts: 1, kills: 4, contactReunions: 0 } } as unknown as SimState;

function freshDirector() {
  const storage = new MemoryStorage();
  return new Director({ checkpoints: new CheckpointStore(storage), progress: new ProgressStore(storage), resolveRoom: () => DEPARTURE_COURT });
}

describe('views', () => {
  it('locks the second starter until it is earned and names each starter relic', () => {
    const options = starterOptions(createProgress());
    expect(options.map((o) => [o.id, o.locked])).toEqual([
      ['threadkeeper', false],
      ['long_reach', true],
    ]);
    expect(options[0]!.relicName).toBe('Needlesong');
    expect(options[1]!.lockHint).toBeTruthy();
  });

  it('describes branch rooms with their decision signature', () => {
    const d = freshDirector();
    d.newRun(21, 'threadkeeper');
    const s = d.roomVictory(cleared);
    expect(s.kind).toBe('route');
    if (s.kind !== 'route') return;
    const views = routeChoices(s.choices);
    expect(views).toHaveLength(2);
    for (const v of views) expect(v.blurb.length).toBeGreaterThan(10);
  });

  it('builds a station draft with a free slot after the first branch room', () => {
    const d = freshDirector();
    d.newRun(21, 'threadkeeper');
    let s = d.roomVictory(cleared);
    if (s.kind === 'route') s = d.chooseRoute(s.choices[0]!.id);
    s = d.roomVictory(cleared);
    expect(s.kind).toBe('station');
    if (s.kind !== 'station') return;
    const view = draftView(s);
    expect(view.slotsFree).toBe(1);
    expect(view.mustReplace).toBe(false);
    expect(view.equipped.map((r) => r.id)).toEqual(['needlesong']);
    expect(view.offer.length).toBeGreaterThan(0);
    expect(view.offer.every((r) => r.rule && r.cost)).toBe(true);
  });

  it('lists atlas discoveries made during the run on the ending', () => {
    const d = freshDirector();
    const before = d.progress;
    d.newRun(3, 'threadkeeper');
    d.roomVictory(cleared);
    const end = d.abandon();
    if (end.kind !== 'ending') throw new Error('expected ending');
    const view = endingView(end.run, before, d.progress);
    expect(view.escaped).toBe(false);
    expect(view.roomsCleared).toBe(1);
    expect(view.discoveries).toContain('Departure Court');
  });
});
