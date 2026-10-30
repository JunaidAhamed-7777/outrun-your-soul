import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  abandonRun,
  choose,
  completeRoom,
  createRun,
  currentNode,
  failRoom,
  isFinished,
  RunError,
  takeDraft,
  type RunState,
} from '../../src/run/expedition';
import { isLegalLoadout, RELIC_IDS, type RelicId } from '../../src/run/relics';
import { RunRandom } from '../../src/run/rng';
import { CheckpointStore, makeCheckpoint, parseCheckpoint, serializeCheckpoint } from '../../src/save/checkpoint';
import { MemoryStorage } from '../../src/save/storage';

const NODE_IDS = ['n0', 'n1a', 'n1b', 'n2', 'n3a', 'n3b', 'n4', 'n5', 'n6', 'n7', 'nX'];

function randomOp(run: RunState, rnd: RunRandom): RunState {
  const node = currentNode(run);
  switch (rnd.int(6)) {
    case 0:
      return completeRoom(run, { nodeId: rnd.float() < 0.8 ? node.id : NODE_IDS[rnd.int(NODE_IDS.length)]!, health: rnd.int(7) });
    case 1:
      return failRoom(run, rnd.float() < 0.8 ? node.id : NODE_IDS[rnd.int(NODE_IDS.length)]!);
    case 2:
      return choose(run, rnd.float() < 0.7 ? (node.next[rnd.int(Math.max(1, node.next.length))] ?? 'n0') : NODE_IDS[rnd.int(NODE_IDS.length)]!);
    case 3: {
      const pick = rnd.float() < 0.2 ? null : (RELIC_IDS[rnd.int(RELIC_IDS.length)] as RelicId);
      const idx = rnd.float() < 0.5 ? undefined : rnd.int(3) - 1;
      return takeDraft(run, pick, idx);
    }
    case 4:
      return rnd.float() < 0.03 ? abandonRun(run) : run;
    default:
      return run;
  }
}

function assertHealthy(run: RunState): void {
  expect(isLegalLoadout(run.loadout)).toBe(true);
  expect(run.loadout.length).toBeGreaterThanOrEqual(1);
  expect(run.health).toBeGreaterThanOrEqual(1);
  expect(run.health).toBeLessThanOrEqual(run.maxHealth);
  for (const id of run.completed) expect(run.history).toContain(id);
  expect(run.history[run.history.length - 1]).toBe(run.at);
  expect(new Set(run.completed).size).toBe(run.completed.length);
}

describe('run layer fuzz', () => {
  it('random operation sequences keep legal state and survive save/load at every step', () => {
    let opsApplied = 0;
    let rejected = 0;
    let finished = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const rnd = new RunRandom(seed * 7919);
      const store = new CheckpointStore(new MemoryStorage());
      let run = createRun(seed, rnd.float() < 0.5 ? 'threadkeeper' : 'long_reach');
      for (let i = 0; i < 160 && !isFinished(run); i++) {
        const before = run;
        try {
          run = randomOp(run, rnd);
          opsApplied++;
        } catch (err) {
          expect(err).toBeInstanceOf(RunError);
          expect(run).toBe(before);
          rejected++;
        }
        assertHealthy(run);
        if (!isFinished(run)) {
          const parsed = parseCheckpoint(serializeCheckpoint(makeCheckpoint(run)));
          expect(parsed.ok, parsed.ok ? '' : parsed.error.detail).toBe(true);
          if (parsed.ok) expect(parsed.value.run).toEqual(run);
          if (i % 10 === 0) {
            expect(store.save(run).ok).toBe(true);
            expect(store.load().value?.run).toEqual(run);
          }
        }
      }
      if (isFinished(run)) finished++;
    }
    expect(opsApplied).toBeGreaterThan(1000);
    expect(rejected).toBeGreaterThan(100);
    expect(finished).toBeGreaterThan(0);
    // ~2.5 s alone; give headroom for a busy machine running the whole suite in parallel.
  }, 30_000);
});

describe('run layer boundaries', () => {
  it('imports no renderer, DOM framework, input or UI modules', () => {
    const allowed = /^(\.\/|\.\.\/sim\/(types|tuning)$|\.\.\/save\/storage$|\.\.\/run\/)/;
    const offenders: string[] = [];
    for (const dir of ['src/run', 'src/save']) {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.ts') || (dir === 'src/save' && !['checkpoint.ts', 'storage.ts'].includes(name))) continue;
        const text = readFileSync(join(dir, name), 'utf8');
        for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
          if (!allowed.test(m[1]!)) offenders.push(`${dir}/${name} -> ${m[1]}`);
        }
        if (/\b(document|window|Math\.random|Date\.now|performance\.now)\b/.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))) {
          offenders.push(`${dir}/${name} uses a DOM or nondeterministic global`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
