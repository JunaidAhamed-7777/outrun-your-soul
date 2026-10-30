import { describe, expect, it } from 'vitest';
import { MAX_FRAME_DT_SECONDS, advanceAccumulator, createFixedLoop } from '../../src/core/loop';

const STEP = 1 / 120;
const MAX = 0.1;

describe('advanceAccumulator', () => {
  it('runs whole steps and carries the remainder', () => {
    const r = advanceAccumulator(0, 0.02, STEP, MAX);
    expect(r.steps).toBe(2);
    expect(r.acc).toBeCloseTo(0.02 - 2 * STEP, 12);
    expect(r.dropped).toBe(0);
    expect(r.alpha).toBeCloseTo((0.02 - 2 * STEP) / STEP, 9);
  });

  it('does not lose a step to float drift', () => {
    let acc = 0;
    let steps = 0;
    for (let i = 0; i < 3; i += 1) {
      const r = advanceAccumulator(acc, STEP, STEP, MAX);
      acc = r.acc;
      steps += r.steps;
    }
    expect(steps).toBe(3);
    // Exactly one step's worth sums cleanly too.
    expect(advanceAccumulator(0, 3 * STEP, STEP, MAX).steps).toBe(3);
  });

  it('bounds catch-up and reports dropped time instead of replaying it', () => {
    const r = advanceAccumulator(0, 5, STEP, MAX);
    expect(r.steps).toBe(Math.floor(MAX / STEP + 1e-9));
    expect(r.steps).toBe(12);
    expect(r.dropped).toBeCloseTo(5 - MAX, 9);
  });

  it('the carry counts toward the catch-up bound', () => {
    const r = advanceAccumulator(STEP * 0.9, 1, STEP, MAX);
    expect(r.steps).toBeLessThanOrEqual(12);
  });

  it('treats negative, NaN and zero dt as no time', () => {
    expect(advanceAccumulator(0.001, -1, STEP, MAX)).toMatchObject({ steps: 0, acc: 0.001 });
    expect(advanceAccumulator(0.001, Number.NaN, STEP, MAX)).toMatchObject({ steps: 0, acc: 0.001 });
    expect(advanceAccumulator(0, 0, STEP, MAX)).toMatchObject({ steps: 0, acc: 0, alpha: 0 });
  });

  it('alpha always lies in [0, 1)', () => {
    let acc = 0;
    for (let i = 0; i < 500; i += 1) {
      const dt = ((i * 7919) % 97) / 1000; // deterministic spread 0..96 ms
      const r = advanceAccumulator(acc, dt, STEP, MAX);
      expect(r.alpha).toBeGreaterThanOrEqual(0);
      expect(r.alpha).toBeLessThan(1);
      acc = r.acc;
    }
  });

  it('rejects a non-positive step', () => {
    expect(() => advanceAccumulator(0, 0.1, 0, MAX)).toThrow();
  });
});

/** Deterministic stand-in for requestAnimationFrame. */
function fakeRaf() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  return {
    raf: (cb: FrameRequestCallback) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    caf: (id: number) => {
      pending.delete(id);
    },
    /** Run every callback scheduled before this frame, at time ms. */
    frame(ms: number) {
      const due = [...pending.entries()];
      pending.clear();
      for (const [, cb] of due) cb(ms);
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

function setupLoop(hooks: Partial<{ onStep: () => void }> = {}) {
  const r = fakeRaf();
  const record = { steps: 0, frames: [] as Array<{ alpha: number; dt: number }> };
  const loop = createFixedLoop(
    {
      step: () => {
        record.steps += 1;
        hooks.onStep?.();
      },
      frame: (alpha, dt) => record.frames.push({ alpha, dt }),
    },
    { stepSeconds: STEP, maxCatchUpSeconds: MAX, raf: r.raf, caf: r.caf },
  );
  return { r, loop, record };
}

describe('createFixedLoop', () => {
  it('steps at the fixed rate and renders every frame', () => {
    const { r, loop, record } = setupLoop();
    loop.start();
    expect(loop.running).toBe(true);
    r.frame(1000); // first frame establishes the clock
    expect(record.steps).toBe(0);
    for (let i = 1; i <= 60; i += 1) r.frame(1000 + (i * 1000) / 60);
    // One second of 60 Hz frames at a 120 Hz step: 120 steps (+/-1 for float carry).
    expect(record.steps).toBeGreaterThanOrEqual(119);
    expect(record.steps).toBeLessThanOrEqual(120);
    expect(record.frames).toHaveLength(61);
    for (const f of record.frames) {
      expect(f.alpha).toBeGreaterThanOrEqual(0);
      expect(f.alpha).toBeLessThan(1);
    }
  });

  it('a long stall runs at most the bounded number of catch-up steps', () => {
    const { r, loop, record } = setupLoop();
    loop.start();
    r.frame(0);
    r.frame(5000);
    expect(record.steps).toBe(12);
    expect(record.frames.at(-1)!.dt).toBe(MAX_FRAME_DT_SECONDS);
  });

  it('pause freezes stepping and alpha but keeps rendering', () => {
    const { r, loop, record } = setupLoop();
    loop.start();
    r.frame(0);
    r.frame(20);
    const stepsBefore = record.steps;
    const alphaBefore = record.frames.at(-1)!.alpha;
    loop.pause();
    expect(loop.paused).toBe(true);
    for (let t = 40; t <= 2000; t += 16) r.frame(t);
    expect(record.steps).toBe(stepsBefore);
    for (const f of record.frames.slice(2)) expect(f.alpha).toBe(alphaBefore);
    expect(record.frames.at(-1)!.dt).toBeCloseTo(0.016, 9);
  });

  it('resume discards the paused/hidden gap instead of bursting steps', () => {
    const { r, loop, record } = setupLoop();
    loop.start();
    r.frame(0);
    r.frame(16);
    loop.pause();
    // Hidden tab: no frames at all for a minute, then resume before the next frame.
    loop.resume();
    const stepsBefore = record.steps;
    r.frame(60_000);
    expect(record.steps).toBe(stepsBefore);
    r.frame(60_016);
    expect(record.steps - stepsBefore).toBeGreaterThanOrEqual(1);
    expect(record.steps - stepsBefore).toBeLessThanOrEqual(2);
  });

  it('resume while not paused is a no-op', () => {
    const { r, loop, record } = setupLoop();
    loop.start();
    r.frame(0);
    loop.resume();
    r.frame(25);
    expect(record.steps).toBe(3);
  });

  it('a step that pauses the loop discards the remaining due steps', () => {
    let loopRef: ReturnType<typeof createFixedLoop> | null = null;
    const { r, loop, record } = setupLoop({
      onStep: () => {
        if (record.steps === 2) loopRef!.pause();
      },
    });
    loopRef = loop;
    loop.start();
    r.frame(0);
    r.frame(50); // 6 steps due
    expect(record.steps).toBe(2);
    r.frame(100);
    expect(record.steps).toBe(2);
  });

  it('stop cancels the scheduled frame; start is idempotent', () => {
    const { r, loop, record } = setupLoop();
    loop.start();
    loop.start();
    expect(r.pendingCount).toBe(1);
    r.frame(0);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(r.pendingCount).toBe(0);
    r.frame(100);
    expect(record.frames).toHaveLength(1);
  });

  it('restarting after stop does not simulate the stopped interval', () => {
    const { r, loop, record } = setupLoop();
    loop.start();
    r.frame(0);
    loop.stop();
    loop.start();
    r.frame(10_000);
    expect(record.steps).toBe(0);
  });

  it('keeps scheduling frames even if a hook throws', () => {
    const r = fakeRaf();
    let calls = 0;
    const loop = createFixedLoop(
      {
        step: () => {},
        frame: () => {
          calls += 1;
          if (calls === 1) throw new Error('render failure');
        },
      },
      { stepSeconds: STEP, maxCatchUpSeconds: MAX, raf: r.raf, caf: r.caf },
    );
    loop.start();
    expect(() => r.frame(0)).toThrow('render failure');
    expect(r.pendingCount).toBe(1);
    r.frame(16);
    expect(calls).toBe(2);
  });

  it('validates the step size', () => {
    expect(() => createFixedLoop({ step() {}, frame() {} }, { stepSeconds: 0, maxCatchUpSeconds: 0.1 })).toThrow();
  });
});
