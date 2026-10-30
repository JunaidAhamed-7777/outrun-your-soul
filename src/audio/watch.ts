/**
 * Sounds for state changes that have no event of their own. A warden opening up after
 * its sweep ('exposed') is the moment to strike, so it gets a bright chime the first
 * frame its phase changes. First sightings never sound; a new room clears memory.
 */
import type { EnemyPhase, EnemyRole } from '../sim/types';
import type { Vec2 } from '../sim/vec';

export interface WatchedEnemy {
  readonly id: number;
  readonly role: EnemyRole;
  readonly phase: EnemyPhase;
  readonly pos: Vec2;
}

export interface PhaseChange {
  readonly id: number;
  readonly role: EnemyRole;
  readonly from: EnemyPhase;
  readonly to: EnemyPhase;
  readonly pos: Vec2;
}

export class PhaseWatch {
  private phases = new Map<number, EnemyPhase>();
  private roomKey = '';
  private lastTick = -1;

  /**
   * Compare against the previous observation. `roomKey` + a tick that went backwards
   * (restart) reset memory so nothing replays from the last attempt.
   */
  observe(roomKey: string, tick: number, enemies: readonly WatchedEnemy[]): PhaseChange[] {
    if (roomKey !== this.roomKey || tick < this.lastTick) {
      this.phases.clear();
      this.roomKey = roomKey;
    }
    this.lastTick = tick;
    const changes: PhaseChange[] = [];
    for (const e of enemies) {
      const before = this.phases.get(e.id);
      if (before !== undefined && before !== e.phase) {
        changes.push({ id: e.id, role: e.role, from: before, to: e.phase, pos: e.pos });
      }
      this.phases.set(e.id, e.phase);
    }
    return changes;
  }

  reset(): void {
    this.phases.clear();
    this.roomKey = '';
    this.lastTick = -1;
  }
}

/** Only a warden turning 'exposed' is worth a sound; other changes already emit events. */
export function isOpening(change: PhaseChange): boolean {
  return change.role === 'warden' && change.to === 'exposed';
}
