/**
 * Render-lab adapter around the REAL simulation, so presentation can be verified against
 * authoritative state and events (dev only). Same surface as MiniSim.
 */
import { createSim, previewDash, previewReturn, stepSim } from '../../sim';
import type { Command, DashPreview, ReturnPreview, RoomDef, SimEvent, SimRelicConfig, SimState } from '../../sim/types';
import type { Vec2 } from '../../sim/vec';

export class RealSim {
  state: SimState;
  private readonly pending: Command[] = [];

  constructor(room: RoomDef, seed = 1, relics?: SimRelicConfig) {
    this.state = createSim(room, { seed, ...(relics ? { relics } : {}) });
  }

  previewDash(aim: Vec2): DashPreview {
    return previewDash(this.state, aim);
  }

  previewReturn(): ReturnPreview {
    return previewReturn(this.state);
  }

  dash(aim: Vec2, _events: SimEvent[]): void {
    this.pending.push({ kind: 'dash', aim });
  }

  ret(_events: SimEvent[]): void {
    this.pending.push({ kind: 'return' });
  }

  step(events: SimEvent[]): void {
    for (const e of stepSim(this.state, this.pending.splice(0, 1))) events.push(e);
  }
}
