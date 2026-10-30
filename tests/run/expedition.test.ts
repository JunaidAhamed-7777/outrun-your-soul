import { describe, expect, it } from 'vitest';
import {
  abandonRun,
  BRANCH_POOL,
  choices,
  choose,
  completeRoom,
  createRun,
  currentNode,
  draftOffer,
  failRoom,
  generateGraph,
  generateOffer,
  graphFingerprint,
  isFinished,
  isResolved,
  roomEntry,
  RUN_TUNING,
  RunError,
  takeDraft,
  type RunState,
} from '../../src/run/expedition';
import { isLegalLoadout, MAX_RELIC_SLOTS, replaceOptions, type RelicId } from '../../src/run/relics';
import { RunRandom } from '../../src/run/rng';

/** Play a run to the end with seeded choices; returns every intermediate state. */
function playThrough(seed: number, starter: 'threadkeeper' | 'long_reach' = 'threadkeeper'): RunState[] {
  const rnd = new RunRandom(seed ^ 0x9e3779b9);
  let run = createRun(seed, starter);
  const states = [run];
  for (let guard = 0; guard < 50 && !isFinished(run); guard++) {
    const node = currentNode(run);
    if ((node.kind === 'encounter' || node.kind === 'boss') && !isResolved(run)) {
      run = completeRoom(run, { nodeId: node.id, health: Math.max(1, run.health - rnd.int(2)), stats: { hits: 1, cuts: 2, kills: 3 } });
    } else if (node.kind === 'station' && !isResolved(run)) {
      const offer = draftOffer(run);
      expect(offer).not.toBeNull();
      const pick = offer!.offer[rnd.int(offer!.offer.length)] ?? null;
      if (pick && run.loadout.length >= MAX_RELIC_SLOTS) {
        const opts = replaceOptions(run.loadout, pick);
        run = takeDraft(run, pick, opts[rnd.int(opts.length)]);
      } else {
        run = takeDraft(run, pick);
      }
    } else {
      const next = choices(run);
      expect(next.length).toBeGreaterThan(0);
      run = choose(run, next[rnd.int(next.length)]!.id);
    }
    states.push(run);
  }
  return states;
}

describe('expedition graph', () => {
  it('is deterministic by seed', () => {
    expect(generateGraph(123)).toEqual(generateGraph(123));
    expect(graphFingerprint(generateGraph(123))).toBe(graphFingerprint(generateGraph(123)));
  });

  it('has the documented shape: opening, two branches, station, two branches, station, final approach, boss, ending', () => {
    const g = generateGraph(7);
    const n = g.nodes;
    expect(n.n0?.roomId).toBe('departure_court');
    expect(n.n0?.next).toEqual(['n1a', 'n1b']);
    expect(n.n2?.kind).toBe('station');
    expect(n.n4?.kind).toBe('station');
    expect(n.n5?.roomId).toBe('last_platform');
    expect(n.n6?.kind).toBe('boss');
    expect(n.n6?.roomId).toBe('last_warden');
    expect(n.n7?.kind).toBe('ending');
    const branches = ['n1a', 'n1b', 'n3a', 'n3b'].map((id) => n[id]?.roomId);
    expect(new Set(branches).size).toBe(4);
    expect([...branches].sort()).toEqual([...BRANCH_POOL].sort());
    for (const node of Object.values(n)) {
      for (const next of node.next) expect(n[next]).toBeDefined();
      expect(node.variant).toBeGreaterThanOrEqual(0);
      expect(node.variant).toBeLessThan(RUN_TUNING.roomVariants);
    }
  });

  it('varies branch pairings across seeds', () => {
    const pairings = new Set<string>();
    for (let seed = 0; seed < 64; seed++) {
      const g = generateGraph(seed);
      pairings.add(`${g.nodes.n1a?.roomId}/${g.nodes.n1b?.roomId}`);
    }
    expect(pairings.size).toBeGreaterThanOrEqual(6);
  });
});

describe('run state machine', () => {
  it('reaches the boss and the ending for every seed and both starters', () => {
    for (let seed = 1; seed <= 120; seed++) {
      for (const starter of ['threadkeeper', 'long_reach'] as const) {
        const states = playThrough(seed, starter);
        const end = states[states.length - 1]!;
        expect(end.outcome).toBe('victory');
        expect(end.at).toBe('n7');
        expect(end.completed).toContain('n6');
        expect(end.history[0]).toBe('n0');
        expect(end.totals.roomsCleared).toBe(5);
        for (const s of states) {
          expect(isLegalLoadout(s.loadout)).toBe(true);
          expect(s.health).toBeGreaterThanOrEqual(1);
          expect(s.health).toBeLessThanOrEqual(s.maxHealth);
        }
      }
    }
  });

  it('starts with the starter relic in one slot and full health', () => {
    const run = createRun(5, 'long_reach');
    expect(run.loadout).toEqual(['long_silk']);
    expect(run.health).toBe(RUN_TUNING.maxHealth);
    expect(choices(run)).toEqual([]);
    expect(roomEntry(run)?.params.tetherCapacity).toBe(8);
  });

  it('refuses to leave an unresolved node or jump to unreachable nodes', () => {
    let run = createRun(5, 'threadkeeper');
    expect(() => choose(run, 'n1a')).toThrow(RunError);
    run = completeRoom(run, { nodeId: 'n0', health: 5 });
    expect(() => choose(run, 'n2')).toThrow(/not reachable/);
    run = choose(run, 'n1b');
    expect(run.history).toEqual(['n0', 'n1b']);
  });

  it('commits a room completion exactly once', () => {
    const run = createRun(9, 'threadkeeper');
    const once = completeRoom(run, { nodeId: 'n0', health: 4, stats: { cuts: 3 } });
    const twice = completeRoom(once, { nodeId: 'n0', health: 1, stats: { cuts: 99 } });
    expect(twice).toBe(once);
    expect(once.totals.roomsCleared).toBe(1);
    expect(once.totals.cuts).toBe(3);
    expect(once.health).toBe(4);
  });

  it('rejects bad room results', () => {
    const run = createRun(9, 'threadkeeper');
    expect(() => completeRoom(run, { nodeId: 'n1a', health: 3 })).toThrow(/run is at n0/);
    expect(() => completeRoom(run, { nodeId: 'n0', health: 0 })).toThrow(/out of range/);
    expect(() => completeRoom(run, { nodeId: 'n0', health: 6 })).toThrow(/out of range/);
    expect(() => completeRoom(run, { nodeId: 'n0', health: 2.5 })).toThrow(/out of range/);
  });

  it('fixes the draft offer on arrival and applies the station choice once', () => {
    let run = completeRoom(createRun(11, 'threadkeeper'), { nodeId: 'n0', health: 3 });
    run = choose(run, 'n1a');
    run = completeRoom(run, { nodeId: 'n1a', health: 3 });
    run = choose(run, 'n2');
    const offer = draftOffer(run)!;
    expect(offer.offer.length).toBe(3);
    expect(offer.offer).not.toContain('needlesong');
    expect(offer.offer).toEqual(generateOffer(run.seed, 'n2', ['needlesong']));
    const pick = offer.offer[0] as RelicId;
    const taken = takeDraft(run, pick);
    expect(taken.loadout).toEqual(['needlesong', pick]);
    expect(taken.health).toBe(4);
    const again = takeDraft(taken, offer.offer[1] as RelicId);
    expect(again).toBe(taken);
    expect(choices(taken).map((c) => c.id)).toEqual(['n3a', 'n3b']);
  });

  it('never offers Short Stitch to fill a slot next to Long Silk, and only replaces via index', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(generateOffer(seed, 'n2', ['long_silk'])).not.toContain('short_stitch');
      const full = generateOffer(seed, 'n4', ['long_silk', 'needlesong']);
      expect(full).not.toContain('long_silk');
      expect(full).not.toContain('needlesong');
      if (full.includes('short_stitch')) expect(replaceOptions(['long_silk', 'needlesong'], 'short_stitch')).toEqual([0]);
    }
  });

  it('rejects unoffered or illegal draft picks without changing the run', () => {
    let run = completeRoom(createRun(11, 'long_reach'), { nodeId: 'n0', health: 3 });
    run = completeRoom(choose(run, 'n1a'), { nodeId: 'n1a', health: 3 });
    run = choose(run, 'n2');
    const offer = draftOffer(run)!.offer;
    const notOffered = (['needlesong', 'glass_lantern', 'mourning_bell', 'travelers_knot'] as RelicId[]).find((id) => !offer.includes(id))!;
    expect(() => takeDraft(run, notOffered)).toThrow(/not offered/);
    expect(() => takeDraft(run, offer[0] as RelicId, 0)).toThrow(/slotFree/);
    expect(draftOffer(run)?.resolved).toBe(false);
  });

  it('keep-or-replace at the second station never creates a third slot', () => {
    for (let seed = 1; seed < 60; seed++) {
      const states = playThrough(seed);
      for (const s of states) expect(s.loadout.length).toBeLessThanOrEqual(MAX_RELIC_SLOTS);
      const end = states[states.length - 1]!;
      expect(end.drafts.n2?.resolved).toBe(true);
      expect(end.drafts.n4?.resolved).toBe(true);
    }
  });

  it('records defeats as attempts and keeps the room-entry state for retries', () => {
    let run = createRun(3, 'threadkeeper');
    const entry = roomEntry(run);
    run = failRoom(run);
    run = failRoom(run);
    expect(run.attempts.n0).toBe(2);
    expect(run.totals.failedAttempts).toBe(2);
    expect(roomEntry(run)).toEqual(entry);
    expect(() => failRoom(run, 'n1a')).toThrow(RunError);
  });

  it('derives identical room seeds on every retry and different seeds per node', () => {
    const run = createRun(77, 'threadkeeper');
    const a = roomEntry(run)!.seed;
    expect(roomEntry(failRoom(run))!.seed).toBe(a);
    let next = choose(completeRoom(run, { nodeId: 'n0', health: 5 }), 'n1a');
    expect(roomEntry(next)!.seed).not.toBe(a);
    next = abandonRun(next);
    expect(isFinished(next)).toBe(true);
    expect(roomEntry(next)).toBeNull();
    expect(() => choose(next, 'n2')).toThrow(/run is over/);
  });

  it('carries normalized relic charges between rooms', () => {
    let run = createRun(4, 'threadkeeper');
    run = completeRoom(run, { nodeId: 'n0', health: 5, charges: { bellKills: 1, bellCharged: true, knotMarked: true } });
    expect(run.charges).toEqual({ bellKills: 0, bellCharged: false, knotMarked: false });
  });
});
