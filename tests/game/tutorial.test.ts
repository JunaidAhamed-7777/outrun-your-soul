import { describe, expect, it } from 'vitest';
import { NOVICE_BOT, playRoom } from '../../src/bot/bot';
import { FIRST_LIGHT, validateRoom } from '../../src/content/rooms';
import { DEFAULT_READ_SECONDS, READ_SECONDS, TIMED_STEPS, TUTORIAL_STEPS, TutorialCoach } from '../../src/game/tutorial';
import { createSim, stepSim, type SimEvent, type SimState } from '../../src/sim';

const ev = (e: Record<string, unknown>) => e as unknown as SimEvent;

/** Feed events, then let `seconds` of sim time pass in small frames. */
function run(coach: TutorialCoach, s: SimState, events: SimEvent[], seconds = 0): string[] {
  const ticked: string[] = [];
  coach.update(events, s);
  if (coach.view.justCompleted) ticked.push(coach.view.justCompleted);
  for (let t = 0; t < seconds; t += 0.1) {
    s.time += 0.1;
    coach.update([], s);
    if (coach.view.justCompleted) ticked.push(coach.view.justCompleted);
  }
  return ticked;
}

describe('tutorial coach', () => {
  it('walks the steps in order, each staying up long enough to read', () => {
    const coach = new TutorialCoach();
    const s = createSim(FIRST_LIGHT, { seed: 1 }) as SimState;
    expect(coach.view.step?.id).toBe('dash');
    // Dashing at once still leaves the first prompt up for its reading time.
    expect(run(coach, s, [ev({ type: 'dashStart' })], DEFAULT_READ_SECONDS - 0.5)).toEqual([]);
    expect(run(coach, s, [], 1)).toEqual(['dash']);
    expect(coach.view.step?.id).toBe('follow');
  });

  it('keeps step 2 up for its full reading time even when the soul catches up at once', () => {
    const coach = new TutorialCoach();
    const s = createSim(FIRST_LIGHT, { seed: 1 }) as SimState;
    run(coach, s, [ev({ type: 'dashStart' })], DEFAULT_READ_SECONDS + 0.2);
    expect(coach.view.step?.id).toBe('follow');
    expect(run(coach, s, [ev({ type: 'reunion', cause: 'exhaustion' })], READ_SECONDS.follow! - 0.5)).toEqual([]);
    expect(coach.view.step?.id).toBe('follow');
    expect(run(coach, s, [], 1)).toEqual(['follow']);
  });

  it('accepts lessons performed early and ticks them off in order', () => {
    const coach = new TutorialCoach();
    const s = createSim(FIRST_LIGHT, { seed: 1 }) as SimState;
    s.enemies.find((e) => e.key === 'dummy')!.phase = 'dead';
    run(coach, s, [ev({ type: 'dashStart' }), ev({ type: 'reunion', cause: 'contact' }), ev({ type: 'returnStart' })]);
    expect(coach.isMet('strike')).toBe(true);
    expect(coach.isDone('strike')).toBe(false);
    expect(coach.view.step?.id).toBe('dash');
    expect(run(coach, s, [], 16)).toEqual(['dash', 'follow', 'return', 'contact', 'strike']);
    expect(coach.view.step?.id).toBe('locked');
  });

  it('finishes with no step after victory', () => {
    const coach = new TutorialCoach();
    const s = createSim(FIRST_LIGHT, { seed: 1 }) as SimState;
    for (const e of s.enemies) e.phase = 'dead';
    run(
      coach,
      s,
      [ev({ type: 'dashStart' }), ev({ type: 'reunion', cause: 'contact' }), ev({ type: 'returnStart' }), ev({ type: 'victory' })],
      40,
    );
    expect(coach.view.step).toBeNull();
    expect(coach.view.index).toBe(TUTORIAL_STEPS.length);
  });
});

describe('timed tutorial steps', () => {
  it('step 6 (the amber line) steps aside after its timer even if the needler lives', () => {
    const coach = new TutorialCoach();
    const s = createSim(FIRST_LIGHT, { seed: 1 }) as SimState;
    s.enemies.find((e) => e.key === 'dummy')!.phase = 'dead';
    run(coach, s, [ev({ type: 'dashStart' }), ev({ type: 'reunion', cause: 'contact' }), ev({ type: 'returnStart' })], 16);
    expect(coach.view.step?.id).toBe('locked');
    expect(run(coach, s, [], TIMED_STEPS.locked! - 0.5)).toEqual([]);
    expect(run(coach, s, [], 1)).toEqual(['locked']);
    expect(coach.view.step?.id).toBe('keeper');
  });
});

describe('First Light room', () => {
  it('validates', () => {
    expect(validateRoom(FIRST_LIGHT)).toEqual([]);
  });

  it('stays quiet for the movement lessons, then its shots land but never drop health below 1', () => {
    const s = createSim(FIRST_LIGHT, { seed: 1, minHealth: 1 });
    while (s.time < 15) stepSim(s, []);
    expect(s.health).toBe(s.maxHealth);
    while (s.time < 120) stepSim(s, []);
    expect(s.stats.hits).toBeGreaterThan(s.maxHealth);
    expect(s.health).toBe(1);
    expect(s.outcome).toBe('playing');
  });

  it('is cleared by a novice-timed bot without losing', () => {
    const r = playRoom(FIRST_LIGHT, { seed: 1 }, NOVICE_BOT);
    expect(r.outcome).toBe('victory');
    expect(r.healthLeft).toBeGreaterThan(0);
    expect(r.killOrder[0]).toBe('dummy');
    expect([...r.killOrder].sort()).toEqual(['dummy', 'keeper', 'needler']);
  });
});
