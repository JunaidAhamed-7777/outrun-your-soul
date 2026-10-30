import { describe, expect, it } from 'vitest';
import { makeEnemy, makeFixtureState, makeProjectile } from '../../src/render/lab/fixture';
import {
  aimTarget,
  boltSlowed,
  bossView,
  isExposed,
  lockTarget,
  loose,
  relicView,
  roleKind,
  wardenShape,
  WARDEN_DEFAULTS,
} from '../../src/render/simext';

describe('defensive simulation readers', () => {
  it('reads optional enemy aim targets and tolerates their absence', () => {
    const e = makeEnemy(1, 'k1', 'keeper', { x: 1, y: 1 }, 'locked', { x: 0, y: 1 });
    expect(lockTarget(e)).toBeNull();
    expect(aimTarget(e)).toBeNull();
    const withTargets = { ...e, lockTarget: { x: 2, y: 3 }, aimTarget: { x: 4, y: 5 } };
    expect(lockTarget(withTargets)).toEqual({ x: 2, y: 3 });
    expect(aimTarget(withTargets)).toEqual({ x: 4, y: 5 });
  });

  it('classifies roles including future boss parts and warden exposure', () => {
    const w = makeEnemy(2, 'w1', 'warden', { x: 1, y: 1 }, 'idle', { x: 0, y: -1 });
    expect(roleKind(w)).toBe('warden');
    expect(isExposed(w)).toBe(false);
    expect(isExposed({ ...w, phase: 'exposed' as never })).toBe(true);
    expect(isExposed({ ...w, exposed: true } as never)).toBe(true);
    expect(roleKind({ ...w, role: 'last_warden_heart' as never })).toBe('boss_heart');
    expect(roleKind({ ...w, role: 'last_warden_body' as never })).toBe('boss_body');
    expect(wardenShape(w)).toEqual(WARDEN_DEFAULTS);
    expect(wardenShape({ ...w, sweepRadius: 3 } as never).sweepRadius).toBe(3);
  });

  it('summarises relic state with sensible defaults', () => {
    const s = makeFixtureState();
    expect(relicView(s)).toMatchObject({ equipped: [], haloRadius: null, boosting: false, bellCharge: 0, decoy: null });
    const withRelics = {
      ...s,
      soul: { ...s.soul, boostLeft: 0.4 },
      relicState: { equipped: ['glass_lantern', 'mourning_bell'], haloRadius: 1.25, bellCharge: 1, decoy: { x: 3, y: 3 } },
    };
    const view = relicView(withRelics as never);
    expect(view.equipped).toEqual(['glass_lantern', 'mourning_bell']);
    expect(view.haloRadius).toBe(1.25);
    expect(view.boosting).toBe(true);
    expect(view.bellCharge).toBe(1);
    expect(view.decoy).toEqual({ x: 3, y: 3 });
  });

  it('marks bolts slowed by sim flag first, else by exact halo radius', () => {
    const soul = { x: 0, y: 0 };
    const inside = makeProjectile(1, { x: 0.99, y: 0 }, { x: 1, y: 0 });
    const outside = makeProjectile(2, { x: 1.01, y: 0 }, { x: 1, y: 0 });
    expect(boltSlowed(inside, soul, 1)).toBe(true);
    expect(boltSlowed(outside, soul, 1)).toBe(false);
    expect(boltSlowed(inside, soul, null)).toBe(false);
    expect(boltSlowed({ ...outside, slowed: true } as never, soul, 1)).toBe(true);
  });

  it('parses an optional boss and loose events', () => {
    const s = makeFixtureState();
    expect(bossView(s)).toBeNull();
    const boss = bossView({ ...s, boss: { body: { pos: { x: 1, y: 2 } }, heart: { pos: { x: 3, y: 4 } }, route: { points: [{ x: 3, y: 4 }, { x: 1, y: 2 }] } } } as never);
    expect(boss?.body?.pos).toEqual({ x: 1, y: 2 });
    expect(boss?.body?.prevPos).toEqual({ x: 1, y: 2 });
    expect(boss?.route).toHaveLength(2);
    expect(loose({ type: 'burst', t: 1, at: { x: 1, y: 1 }, radius: 1.5 })).toEqual({ type: 'burst', t: 1, at: { x: 1, y: 1 }, radius: 1.5 });
    expect(loose(null).type).toBe('');
  });
});
