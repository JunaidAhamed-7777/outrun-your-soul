/**
 * Turns gesture outputs into simulation commands and the live aim overlay. DOM-free so
 * the tap/drag/cancel -> command contract can be tested without a browser.
 */
import type { GestureOutput } from '../input/gesture';
import { aimFromGesture } from '../input/aim';
import type { Command } from '../sim/types';
import type { Vec2 } from '../sim/vec';

export type ScreenToGround = (clientX: number, clientY: number) => Vec2 | null;

export interface AimView {
  /** Current aim vector while armed outside the dead zone; null otherwise. */
  readonly aim: Vec2 | null;
  /** Armed but back inside the dead zone: the preview shows a cancel state. */
  readonly cancelZone: boolean;
}

export class AimTracker {
  private aimVec: Vec2 | null = null;
  private inCancelZone = false;

  get view(): AimView {
    return { aim: this.aimVec, cancelZone: this.inCancelZone };
  }

  /** Apply one gesture output; returns the command it commits, if any. */
  apply(out: GestureOutput, screenToGround: ScreenToGround): Command | null {
    switch (out.kind) {
      case 'aim':
        this.inCancelZone = false;
        this.aimVec = aimFromGesture(out, screenToGround);
        return null;
      case 'aimCancelZone':
        this.inCancelZone = true;
        this.aimVec = null;
        return null;
      case 'dash': {
        const aim = aimFromGesture(out, screenToGround);
        this.reset();
        return aim ? { kind: 'dash', aim } : null;
      }
      case 'return':
        this.reset();
        return { kind: 'return' };
      case 'cancel':
        this.reset();
        return null;
    }
  }

  reset(): void {
    this.aimVec = null;
    this.inCancelZone = false;
  }
}
