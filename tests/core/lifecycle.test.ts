import { describe, expect, it } from 'vitest';
import { bindContextLoss, bindLifecycle, type InterruptReason } from '../../src/core/lifecycle';

class FakeDocument extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
}

class FakeWindow extends EventTarget {
  screen = { orientation: new EventTarget() };
}

function setup(initial: 'visible' | 'hidden' = 'visible', withCanvas = false) {
  const doc = new FakeDocument();
  doc.visibilityState = initial;
  const win = new FakeWindow();
  const canvas = new EventTarget();
  const log: string[] = [];
  const unbind = bindLifecycle(
    {
      onInterrupt: (reason: InterruptReason) => log.push(`interrupt:${reason}`),
      onVisible: () => log.push('visible'),
      onContextLost: () => log.push('contextLost'),
      onContextRestored: () => log.push('contextRestored'),
    },
    {
      document: doc as unknown as Document,
      window: win as unknown as Window,
      ...(withCanvas ? { canvas } : {}),
    },
  );
  return { doc, win, canvas, log, unbind };
}

const fire = (t: EventTarget, type: string, cancelable = false): Event => {
  const e = new Event(type, { cancelable });
  t.dispatchEvent(e);
  return e;
};

describe('bindLifecycle', () => {
  it('hidden page interrupts; becoming visible only notifies (never resumes)', () => {
    const s = setup();
    s.doc.visibilityState = 'hidden';
    fire(s.doc, 'visibilitychange');
    s.doc.visibilityState = 'visible';
    fire(s.doc, 'visibilitychange');
    expect(s.log).toEqual(['interrupt:hidden', 'visible']);
  });

  it('blur, pagehide, freeze and orientation changes interrupt', () => {
    const s = setup();
    fire(s.win, 'blur');
    fire(s.win, 'pagehide');
    fire(s.doc, 'freeze');
    fire(s.win, 'orientationchange');
    fire(s.win.screen.orientation, 'change');
    expect(s.log).toEqual([
      'interrupt:blur',
      'interrupt:pagehide',
      'interrupt:hidden',
      'interrupt:orientation',
      'interrupt:orientation',
    ]);
  });

  it('a page that starts hidden is interrupted immediately', () => {
    const s = setup('hidden');
    expect(s.log).toEqual(['interrupt:hidden']);
  });

  it('watches the canvas for context loss when given one', () => {
    const s = setup('visible', true);
    const lost = fire(s.canvas, 'webglcontextlost', true);
    expect(lost.defaultPrevented).toBe(true);
    fire(s.canvas, 'webglcontextrestored');
    expect(s.log).toEqual(['contextLost', 'contextRestored']);
  });

  it('unbind removes every listener', () => {
    const s = setup('visible', true);
    s.unbind();
    s.doc.visibilityState = 'hidden';
    fire(s.doc, 'visibilitychange');
    fire(s.win, 'blur');
    fire(s.win, 'pagehide');
    fire(s.win, 'orientationchange');
    fire(s.win.screen.orientation, 'change');
    fire(s.canvas, 'webglcontextlost', true);
    expect(s.log).toEqual([]);
  });

  it('works without screen.orientation support', () => {
    const doc = new FakeDocument();
    const win = new EventTarget();
    const log: string[] = [];
    const unbind = bindLifecycle(
      { onInterrupt: (r) => log.push(r) },
      { document: doc as unknown as Document, window: win as unknown as Window },
    );
    fire(win, 'orientationchange');
    unbind();
    expect(log).toEqual(['orientation']);
  });
});

describe('bindContextLoss', () => {
  it('reports loss (allowing restoration) and optional restore', () => {
    const canvas = new EventTarget();
    const log: string[] = [];
    const unbind = bindContextLoss(
      canvas,
      () => log.push('lost'),
      () => log.push('restored'),
    );
    expect(fire(canvas, 'webglcontextlost', true).defaultPrevented).toBe(true);
    fire(canvas, 'webglcontextrestored');
    unbind();
    fire(canvas, 'webglcontextlost', true);
    expect(log).toEqual(['lost', 'restored']);
  });
});
