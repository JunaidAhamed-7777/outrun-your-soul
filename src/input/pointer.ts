/**
 * Thin DOM adapter from Pointer Events to the pure GestureMachine.
 *
 * Scroll/zoom suppression is applied only to the play surface element, never the page.
 * Interruptions (pointercancel, losing capture without a release) cancel the gesture and
 * ask the game to pause; the integration must require an explicit Resume.
 *
 * contextmenu is suppressed but is NOT treated as an interruption: mobile Chrome raises it
 * for an ordinary long stationary press, which the input contract says must do nothing. If
 * the browser really takes the pointer away, it sends pointercancel, which is handled.
 */
import type { GestureMachine, GestureOutput } from './gesture';

export interface PointerBindings {
  onOutput(out: GestureOutput): void;
  onInterrupt(): void;
}

const SURFACE_STYLE: ReadonlyArray<readonly [string, string]> = [
  ['touchAction', 'none'],
  ['overscrollBehavior', 'none'],
  ['userSelect', 'none'],
  ['webkitUserSelect', 'none'],
  ['webkitTouchCallout', 'none'],
];

const defaultNow = (): number => globalThis.performance.now();

export function bindPointerInput(
  element: HTMLElement,
  machine: GestureMachine,
  bindings: PointerBindings,
  now: () => number = defaultNow,
): () => void {
  // Vendor-prefixed keys are not on CSSStyleDeclaration's type; treat style as a plain record.
  const style = element.style as unknown as Record<string, string | undefined>;
  const previousStyle = SURFACE_STYLE.map(([key]) => [key, style[key]] as const);
  for (const [key, value] of SURFACE_STYLE) style[key] = value;

  const emit = (outputs: readonly GestureOutput[]): void => {
    for (const out of outputs) bindings.onOutput(out);
  };

  const interrupt = (): void => {
    emit(machine.cancel('interrupted'));
    bindings.onInterrupt();
  };

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    if (machine.activePointerId !== null) return;
    emit(machine.down(e.pointerId, e.clientX, e.clientY, now()));
    if (machine.activePointerId === e.pointerId) {
      try {
        element.setPointerCapture(e.pointerId);
      } catch {
        // Capture can fail for a pointer the browser already released; the gesture still works.
      }
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== machine.activePointerId) return;
    if (e.cancelable) e.preventDefault();
    emit(machine.move(e.pointerId, e.clientX, e.clientY, now()));
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== machine.activePointerId) return;
    if (e.cancelable) e.preventDefault();
    // Browsers release capture implicitly after pointerup; the machine is idle by then,
    // so the following lostpointercapture is ignored.
    emit(machine.up(e.pointerId, e.clientX, e.clientY, now()));
  };

  const onCancel = (e: PointerEvent): void => {
    if (e.pointerId !== machine.activePointerId) return;
    interrupt();
  };

  const onLostCapture = (e: PointerEvent): void => {
    // Only a capture lost while the gesture is still owned (no preceding up) is an interruption.
    if (e.pointerId !== machine.activePointerId) return;
    interrupt();
  };

  const preventDefault = (e: Event): void => {
    if (e.cancelable) e.preventDefault();
  };

  const listeners: Array<[string, EventListener, AddEventListenerOptions]> = [
    ['pointerdown', onDown as EventListener, { passive: false }],
    ['pointermove', onMove as EventListener, { passive: false }],
    ['pointerup', onUp as EventListener, { passive: false }],
    ['pointercancel', onCancel as EventListener, {}],
    ['lostpointercapture', onLostCapture as EventListener, {}],
    ['contextmenu', preventDefault, { passive: false }],
    ['selectstart', preventDefault, { passive: false }],
    // Belt and braces for browsers with partial touch-action support (older iOS Safari).
    ['touchmove', preventDefault, { passive: false }],
    ['gesturestart', preventDefault, { passive: false }],
  ];
  for (const [type, listener, options] of listeners) element.addEventListener(type, listener, options);

  return () => {
    for (const [type, listener, options] of listeners) element.removeEventListener(type, listener, options);
    for (const [key, value] of previousStyle) style[key] = value ?? '';
    // Tearing down mid-gesture discards it silently; nothing is committed.
    machine.cancel('interrupted');
  };
}
