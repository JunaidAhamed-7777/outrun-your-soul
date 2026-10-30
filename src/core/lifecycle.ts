/**
 * Page lifecycle interruptions. Backgrounding while the process stays alive must cancel
 * input and pause the in-memory state; the player resumes it explicitly. Nothing here
 * ever auto-resumes: onVisible is only a notification (e.g. to show the paused overlay).
 *
 * Several signals can fire for one real interruption (blur + hidden, orientationchange +
 * screen.orientation change), so onInterrupt must be idempotent.
 */

export type InterruptReason = 'hidden' | 'blur' | 'pagehide' | 'orientation';

export interface LifecycleHandlers {
  onInterrupt(reason: InterruptReason): void;
  /** The page became visible again. Do NOT resume play here. */
  onVisible?(): void;
  /** WebGL context lost on target.canvas: stop play safely. */
  onContextLost?(): void;
  onContextRestored?(): void;
}

export interface LifecycleTarget {
  document: Document;
  window: Window;
  /** Optional canvas to watch for WebGL context loss/restoration. */
  canvas?: EventTarget;
}

type Listener = [EventTarget, string, EventListener];

function listenAll(listeners: Listener[]): () => void {
  for (const [target, type, fn] of listeners) target.addEventListener(type, fn);
  return () => {
    for (const [target, type, fn] of listeners) target.removeEventListener(type, fn);
  };
}

/** Watches a canvas for WebGL context loss. preventDefault allows the browser to restore it. */
export function bindContextLoss(canvas: EventTarget, onLost: () => void, onRestored?: () => void): () => void {
  const listeners: Listener[] = [
    [
      canvas,
      'webglcontextlost',
      (e) => {
        if (e.cancelable) e.preventDefault();
        onLost();
      },
    ],
  ];
  if (onRestored) listeners.push([canvas, 'webglcontextrestored', () => onRestored()]);
  return listenAll(listeners);
}

export function bindLifecycle(handlers: LifecycleHandlers, target?: LifecycleTarget): () => void {
  const doc = target?.document ?? globalThis.document;
  const win = target?.window ?? globalThis.window;
  const isHidden = (): boolean => doc.visibilityState === 'hidden';

  const listeners: Listener[] = [
    [
      doc,
      'visibilitychange',
      () => {
        if (isHidden()) handlers.onInterrupt('hidden');
        else handlers.onVisible?.();
      },
    ],
    // Page Lifecycle "freeze" (Chrome) can arrive without a prior hidden event in some embeds.
    [doc, 'freeze', () => handlers.onInterrupt('hidden')],
    [win, 'blur', () => handlers.onInterrupt('blur')],
    [win, 'pagehide', () => handlers.onInterrupt('pagehide')],
    [win, 'orientationchange', () => handlers.onInterrupt('orientation')],
  ];
  const orientation = (win as Window & { screen?: { orientation?: EventTarget } }).screen?.orientation;
  if (orientation && typeof orientation.addEventListener === 'function') {
    listeners.push([orientation, 'change', () => handlers.onInterrupt('orientation')]);
  }

  const unbindPage = listenAll(listeners);
  const unbindCanvas =
    target?.canvas && handlers.onContextLost
      ? bindContextLoss(target.canvas, handlers.onContextLost, handlers.onContextRestored)
      : () => {};

  // A page that starts in the background must not run until the player is present.
  if (isHidden()) handlers.onInterrupt('hidden');

  return () => {
    unbindPage();
    unbindCanvas();
  };
}
