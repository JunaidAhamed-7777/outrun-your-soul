import { describe, expect, it } from 'vitest';
import { DEPARTURE_COURT } from '../../src/content/rooms/departure-court';
import { Director, type Screen } from '../../src/game/director';
import { ProgressStore } from '../../src/run/progress';
import { CheckpointStore } from '../../src/save/checkpoint';
import { MemoryStorage } from '../../src/save/storage';
import type { SimState } from '../../src/sim/types';

const resolveRoom = () => DEPARTURE_COURT;

function director(storage = new MemoryStorage()) {
  return new Director({
    checkpoints: new CheckpointStore(storage),
    progress: new ProgressStore(storage),
    resolveRoom,
  });
}

/** Minimal cleared-room sim snapshot: the director only reads health, stats and time. */
const cleared = (health = 4): SimState =>
  ({
    health,
    time: 21.5,
    stats: { dashes: 9, returns: 1, cuts: 2, kills: 4, hits: 1, contactReunions: 1, exhaustionReunions: 2 },
  }) as unknown as SimState;

/** Play a whole expedition taking the first route and the first draft offer each time. */
function playThrough(d: Director, first: Screen): Screen[] {
  const seen: Screen[] = [first];
  let screen = first;
  for (let guard = 0; guard < 40 && screen.kind !== 'ending'; guard++) {
    if (screen.kind === 'room') screen = d.roomVictory(cleared());
    else if (screen.kind === 'route') screen = d.chooseRoute(screen.choices[0]!.id);
    else if (screen.kind === 'station') screen = d.takeDraft(screen.draft.offer[0] ?? null, screen.run.loadout.length >= 2 ? 0 : undefined);
    seen.push(screen);
  }
  return seen;
}

describe('Director', () => {
  it('opens a new expedition in Departure Court with the starter relic equipped', () => {
    const d = director();
    const s = d.newRun(42, 'threadkeeper');
    expect(s.kind).toBe('room');
    if (s.kind !== 'room') return;
    expect(s.entry.roomId).toBe('departure_court');
    expect(s.entry.loadout).toEqual(['needlesong']);
    expect(s.attempt).toBe(1);
  });

  it('runs a complete expedition through stations and the boss to an escaped ending', () => {
    const storage = new MemoryStorage();
    const d = director(storage);
    const seen = playThrough(d, d.newRun(7, 'long_reach'));
    const kinds = seen.map((s) => s.kind);
    expect(kinds.at(-1)).toBe('ending');
    expect(kinds.filter((k) => k === 'station').length).toBe(2);
    expect(kinds.filter((k) => k === 'route').length).toBeGreaterThanOrEqual(2);
    const rooms = seen.filter((s): s is Extract<Screen, { kind: 'room' }> => s.kind === 'room').map((s) => s.entry.roomId);
    expect(rooms[0]).toBe('departure_court');
    expect(rooms.at(-1)).toBe('last_warden');
    const ending = seen.at(-1)!;
    expect(ending.kind === 'ending' && ending.escaped).toBe(true);
    // The finished run leaves nothing to continue, and the record is kept.
    expect(director(storage).hasContinue()).toBe(false);
    expect(d.progress.records.length).toBe(1);
  });

  it('Continue restarts the saved room from the same entry state', () => {
    const storage = new MemoryStorage();
    const d = director(storage);
    d.newRun(11, 'threadkeeper');
    let s = d.roomVictory(cleared(3));
    if (s.kind === 'route') s = d.chooseRoute(s.choices[1]!.id);
    expect(s.kind).toBe('room');
    if (s.kind !== 'room') return;

    const reloaded = director(storage);
    expect(reloaded.hasContinue()).toBe(true);
    const resumed = reloaded.continueRun();
    expect(resumed?.kind).toBe('room');
    if (resumed?.kind !== 'room') return;
    expect(resumed.entry).toEqual(s.entry);
    expect(resumed.entry.health).toBe(3);
  });

  it('a repeated victory callback cannot pay a room twice', () => {
    const d = director();
    d.newRun(5, 'threadkeeper');
    d.roomVictory(cleared());
    const once = d.run!;
    d.roomVictory(cleared());
    expect(d.run!.totals).toEqual(once.totals);
    expect(d.run!.completed).toEqual(once.completed);
  });

  it('a defeat retries the same room with the same seed and entry health', () => {
    const d = director();
    const first = d.newRun(9, 'threadkeeper');
    const retry = d.roomDefeat();
    expect(retry.kind).toBe('room');
    if (first.kind !== 'room' || retry.kind !== 'room') return;
    expect(retry.entry).toEqual(first.entry);
    expect(retry.attempt).toBe(2);
  });

  it('abandoning ends the run, clears the checkpoint and records it once', () => {
    const storage = new MemoryStorage();
    const d = director(storage);
    d.newRun(3, 'threadkeeper');
    const end = d.abandon();
    expect(end.kind === 'ending' && !end.escaped).toBe(true);
    expect(director(storage).hasContinue()).toBe(false);
    expect(d.progress.records.length).toBe(1);
  });
});
