import { describe, expect, it } from 'vitest';
import { GestureMachine, type GestureOutput } from '../../src/input/gesture';
import { bindPointerInput } from '../../src/input/pointer';

/** Minimal stand-in for an HTMLElement: an EventTarget with style and pointer capture. */
class FakeSurface extends EventTarget {
  style: Record<string, string | undefined> = { touchAction: 'auto', userSelect: '' };
  captured = new Set<number>();
  captureFails = false;
  setPointerCapture(id: number): void {
    if (this.captureFails) throw new Error('NotFoundError');
    this.captured.add(id);
  }
  releasePointerCapture(id: number): void {
    this.captured.delete(id);
  }
  hasPointerCapture(id: number): boolean {
    return this.captured.has(id);
  }
}

interface PointerInit {
  pointerId?: number;
  x?: number;
  y?: number;
  button?: number;
  pointerType?: string;
}

function fire(target: EventTarget, type: string, init: PointerInit = {}): Event {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, {
    pointerId: init.pointerId ?? 1,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
    button: init.button ?? 0,
    pointerType: init.pointerType ?? 'touch',
    isPrimary: true,
  });
  target.dispatchEvent(e);
  return e;
}

function setup() {
  const surface = new FakeSurface();
  const machine = new GestureMachine();
  const outputs: GestureOutput[] = [];
  let interrupts = 0;
  let clock = 0;
  const unbind = bindPointerInput(
    surface as unknown as HTMLElement,
    machine,
    { onOutput: (o) => outputs.push(o), onInterrupt: () => interrupts++ },
    () => clock,
  );
  return {
    surface,
    machine,
    outputs,
    get interrupts() {
      return interrupts;
    },
    advance(ms: number) {
      clock += ms;
    },
    unbind,
  };
}

describe('bindPointerInput', () => {
  it('suppresses scrolling only on the play surface and restores styles on unbind', () => {
    const s = setup();
    expect(s.surface.style.touchAction).toBe('none');
    expect(s.surface.style.overscrollBehavior).toBe('none');
    expect(s.surface.style.userSelect).toBe('none');
    s.unbind();
    expect(s.surface.style.touchAction).toBe('auto');
    expect(s.surface.style.userSelect).toBe('');
  });

  it('a quick tap produces RETURN using the injected clock', () => {
    const s = setup();
    const down = fire(s.surface, 'pointerdown', { x: 10, y: 10 });
    expect(down.defaultPrevented).toBe(true);
    expect(s.surface.captured.has(1)).toBe(true);
    s.advance(100);
    fire(s.surface, 'pointerup', { x: 10, y: 10 });
    expect(s.outputs).toEqual([{ kind: 'return' }]);
  });

  it('a drag produces aim updates then a dash', () => {
    const s = setup();
    fire(s.surface, 'pointerdown', { x: 100, y: 500 });
    s.advance(16);
    fire(s.surface, 'pointermove', { x: 100, y: 460 });
    s.advance(16);
    fire(s.surface, 'pointerup', { x: 110, y: 420 });
    expect(s.outputs).toEqual([
      { kind: 'aim', startX: 100, startY: 500, x: 100, y: 460 },
      { kind: 'dash', startX: 100, startY: 500, x: 110, y: 420 },
    ]);
  });

  it('ignores non-primary mouse buttons', () => {
    const s = setup();
    fire(s.surface, 'pointerdown', { pointerType: 'mouse', button: 2 });
    expect(s.machine.phase).toBe('idle');
    fire(s.surface, 'pointerup', { pointerType: 'mouse', button: 2 });
    expect(s.outputs).toEqual([]);
  });

  it('accepts the primary mouse button like a touch', () => {
    const s = setup();
    fire(s.surface, 'pointerdown', { pointerType: 'mouse', pointerId: 1, x: 0, y: 0 });
    fire(s.surface, 'pointermove', { pointerType: 'mouse', pointerId: 1, x: 60, y: 0 });
    fire(s.surface, 'pointerup', { pointerType: 'mouse', pointerId: 1, x: 60, y: 0 });
    expect(s.outputs.at(-1)).toEqual({ kind: 'dash', startX: 0, startY: 0, x: 60, y: 0 });
  });

  it('a second finger is ignored and never captured', () => {
    const s = setup();
    fire(s.surface, 'pointerdown', { pointerId: 1, x: 0, y: 0 });
    fire(s.surface, 'pointermove', { pointerId: 1, x: 50, y: 0 });
    fire(s.surface, 'pointerdown', { pointerId: 2, x: 300, y: 300 });
    expect(s.surface.captured.has(2)).toBe(false);
    fire(s.surface, 'pointerup', { pointerId: 2, x: 300, y: 300 });
    fire(s.surface, 'pointercancel', { pointerId: 2 });
    fire(s.surface, 'lostpointercapture', { pointerId: 2 });
    expect(s.interrupts).toBe(0);
    fire(s.surface, 'pointerup', { pointerId: 1, x: 60, y: 0 });
    expect(s.outputs.filter((o) => o.kind === 'dash')).toHaveLength(1);
    expect(s.outputs.some((o) => o.kind === 'return')).toBe(false);
  });

  it('pointercancel mid-aim cancels and requests a pause', () => {
    const s = setup();
    fire(s.surface, 'pointerdown', { x: 0, y: 0 });
    fire(s.surface, 'pointermove', { x: 50, y: 0 });
    fire(s.surface, 'pointercancel', {});
    expect(s.outputs.at(-1)).toEqual({ kind: 'cancel', reason: 'interrupted' });
    expect(s.interrupts).toBe(1);
    expect(s.machine.phase).toBe('idle');
    // The stale release that may follow does nothing.
    fire(s.surface, 'pointerup', { x: 60, y: 0 });
    expect(s.outputs.some((o) => o.kind === 'dash')).toBe(false);
  });

  it('losing capture without a release is an interruption', () => {
    const s = setup();
    fire(s.surface, 'pointerdown', { x: 0, y: 0 });
    fire(s.surface, 'lostpointercapture', {});
    expect(s.outputs).toEqual([{ kind: 'cancel', reason: 'interrupted' }]);
    expect(s.interrupts).toBe(1);
  });

  it('the lostpointercapture that follows a normal release is ignored', () => {
    const s = setup();
    fire(s.surface, 'pointerdown', { x: 0, y: 0 });
    s.advance(50);
    fire(s.surface, 'pointerup', { x: 0, y: 0 });
    fire(s.surface, 'lostpointercapture', {});
    expect(s.outputs).toEqual([{ kind: 'return' }]);
    expect(s.interrupts).toBe(0);
  });

  it('contextmenu from a long press is suppressed without pausing', () => {
    const s = setup();
    fire(s.surface, 'pointerdown', { x: 0, y: 0 });
    s.advance(600);
    const menu = fire(s.surface, 'contextmenu', {});
    expect(menu.defaultPrevented).toBe(true);
    expect(s.interrupts).toBe(0);
    fire(s.surface, 'pointerup', { x: 0, y: 0 });
    expect(s.outputs).toEqual([{ kind: 'cancel', reason: 'longPress' }]);
  });

  it('suppresses touch scrolling and pinch on the surface', () => {
    const s = setup();
    expect(fire(s.surface, 'touchmove').defaultPrevented).toBe(true);
    expect(fire(s.surface, 'gesturestart').defaultPrevented).toBe(true);
  });

  it('works when pointer capture throws', () => {
    const s = setup();
    s.surface.captureFails = true;
    fire(s.surface, 'pointerdown', { x: 0, y: 0 });
    s.advance(50);
    fire(s.surface, 'pointerup', { x: 0, y: 0 });
    expect(s.outputs).toEqual([{ kind: 'return' }]);
  });

  it('unbind removes listeners and silently discards an in-progress gesture', () => {
    const s = setup();
    fire(s.surface, 'pointerdown', { x: 0, y: 0 });
    fire(s.surface, 'pointermove', { x: 50, y: 0 });
    const before = s.outputs.length;
    s.unbind();
    expect(s.machine.phase).toBe('idle');
    fire(s.surface, 'pointerdown', { x: 0, y: 0 });
    fire(s.surface, 'pointerup', { x: 0, y: 0 });
    expect(s.outputs.length).toBe(before);
    expect(s.interrupts).toBe(0);
  });
});
