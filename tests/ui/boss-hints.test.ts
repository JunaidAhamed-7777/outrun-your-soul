import { describe, expect, it } from 'vitest';
import type { RoomDef, SimEvent } from '../../src/sim/types';
import { BOSS_HINT, HintTracker, WARDEN_HINT, genericHintsFor, triggersForEvent } from '../../src/ui/hints';
import { bossBar } from '../../src/ui/hud-logic';

const room = (over: Partial<RoomDef>): Pick<RoomDef, 'enemies' | 'hints' | 'boss'> => ({
  enemies: [],
  hints: [],
  ...over,
});
const warden = { id: 'w', role: 'warden' as const, at: { x: 4, y: 6 } };
const at = { x: 4, y: 6 };

describe('generic mechanic hints', () => {
  it('adds the warden hint when a room has a warden and does not explain it', () => {
    expect(genericHintsFor(room({ enemies: [warden] }))).toEqual([{ id: 'ui-warden', when: 'warden', text: WARDEN_HINT }]);
  });

  it('defers to a room hint that already covers the warden', () => {
    const hints = [{ id: 'guard', when: 'start' as const, text: 'The warden guards its front.' }];
    expect(genericHintsFor(room({ enemies: [warden], hints }))).toEqual([]);
  });

  it('introduces the boss unless the room already talks about its heart', () => {
    const boss = { id: 'b', at: { x: 4, y: 9 } };
    expect(genericHintsFor(room({ boss })).map((h) => h.text)).toEqual([BOSS_HINT]);
    const hints = [{ id: 'h', when: 'start' as const, text: 'Strike its heart.' }];
    expect(genericHintsFor(room({ boss, hints }))).toEqual([]);
  });

  it('adds nothing for ordinary rooms', () => {
    expect(genericHintsFor(room({ enemies: [{ id: 'n', role: 'needler', at }] }))).toEqual([]);
  });

  it('routes a warden windup to the warden hint, not the sentry lock hint', () => {
    const windup: SimEvent = { type: 'telegraph', t: 0, enemyId: 7, phase: 'locked', target: 'body' };
    expect(triggersForEvent(windup, (id) => (id === 7 ? 'warden' : 'needler'))).toEqual(['warden']);
    expect(triggersForEvent(windup)).toEqual(['firstLock']);
    expect(triggersForEvent({ type: 'guarded', t: 0, enemyId: 7, at })).toEqual(['warden']);
    expect(triggersForEvent({ type: 'boss', t: 0, what: 'wake', at })).toEqual(['boss']);
    expect(triggersForEvent({ type: 'boss', t: 0, what: 'fan', at })).toEqual([]);
  });

  it('shows the warden hint the first time the player bounces off a shield', () => {
    const t = new HintTracker();
    t.reset(genericHintsFor(room({ enemies: [warden] })));
    t.tick(0);
    expect(t.current).toBeNull();
    t.onEvent({ type: 'guarded', t: 0, enemyId: 7, at });
    t.tick(0);
    expect(t.current?.text).toBe(WARDEN_HINT);
    t.tick(10);
    t.onEvent({ type: 'guarded', t: 1, enemyId: 7, at });
    t.tick(0);
    expect(t.current).toBeNull();
  });
});

describe('bossBar', () => {
  it('draws heart segments and reached stages', () => {
    const bar = bossBar({ name: 'The Last Warden', heartHp: 2, heartMax: 3, stage: 1, stages: 3 });
    expect(bar.segments).toEqual([true, true, false]);
    expect(bar.stageDots).toEqual([true, true, false]);
    expect(bar.label).toBe('The Last Warden: heart 2 of 3, stage 2 of 3');
  });

  it('clamps bad numbers instead of drawing nonsense', () => {
    const bar = bossBar({ name: 'X', heartHp: 9, heartMax: 3, stage: 7, stages: 3 });
    expect(bar.segments).toEqual([true, true, true]);
    expect(bar.stageDots).toEqual([true, true, true]);
    const nan = bossBar({ name: 'X', heartHp: Number.NaN, heartMax: 2, stage: -1, stages: 0 });
    expect(nan.segments).toEqual([false, false]);
    expect(nan.stageDots).toEqual([]);
  });
});
