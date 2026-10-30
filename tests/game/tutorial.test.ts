import { describe, expect, it } from 'vitest';
import { NOVICE_BOT, playRoom } from '../../src/bot/bot';
import { FIRST_LIGHT, validateRoom } from '../../src/content/rooms';
import { TIMED_STEPS, TUTORIAL_STEPS, TutorialCoach } from '../../src/game/tutorial';
import { createSim, stepSim, type SimEvent, type SimState } from '../../src/sim';

const ev = (e: Record<string, unknown>) => e as unknown as SimEvent;

describe('tutorial coach', () => {
  it('walks the steps in order and reports each completion once', () => {
    const coach = new TutorialCoach();
    const s = createSim(FIRST_LIGHT, { seed: 1 });
    expect(coach.view.step?.id).toBe('dash');
    coach.update([ev({ type: 'dashStart' })], s);
    expect(coach.view.justCompleted).toBe('dash');
    expect(coach.view.step?.id).toBe('follow');
    coach.update([ev({ type: 'reunion', cause: 'exhaustion' })], s);
    coach.update([ev({ type: 'returnStart' })], s);
    expect(coach.view.step?.id).toBe('contact');
    coach.update([], s);
    expect(coach.view.justCompleted).toBeNull();
  });

  it('accepts lessons learned out of order (kills are read from state)', () => {
    const coach = new TutorialCoach();
    const s = createSim(FIRST_LIGHT, { seed: 1 }) as SimState;
    s.enemies.find((e) => e.key === 'dummy')!.phase = 'dead';
    coach.update([], s);
    expect(coach.isDone('strike')).toBe(true);
    expect(coach.view.step?.id).toBe('dash');
    coach.update([ev({ type: 'dashStart' }), ev({ type: 'reunion', cause: 'contact' }), ev({ type: 'returnStart' })], s);
    expect(coach.view.step?.id).toBe('locked');
  });

  it('finishes with no step after victory', () => {
    const coach = new TutorialCoach();
    const s = createSim(FIRST_LIGHT, { seed: 1 }) as SimState;
    for (const e of s.enemies) e.phase = 'dead';
    coach.update(
      [ev({ type: 'dashStart' }), ev({ type: 'reunion', cause: 'contact' }), ev({ type: 'returnStart' }), ev({ type: 'victory' })],
      s,
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
    coach.update([ev({ type: 'dashStart' }), ev({ type: 'reunion', cause: 'contact' }), ev({ type: 'returnStart' })], s);
    expect(coach.view.step?.id).toBe('locked');
    s.time += TIMED_STEPS.locked! - 0.5;
    coach.update([], s);
    expect(coach.view.step?.id).toBe('locked');
    s.time += 1;
    coach.update([], s);
    expect(coach.view.justCompleted).toBe('locked');
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
