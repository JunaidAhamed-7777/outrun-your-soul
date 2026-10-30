/**
 * Relative aiming: the drag's ground-plane displacement, scaled by a gain, becomes the
 * dash aim. The gesture can start anywhere (often under the thumb, far from the body);
 * the preview always originates at the body. The simulation clamps range, capacity and
 * walls itself, so no clamping happens here.
 */
import type { Vec2 } from '../sim/vec';

/**
 * Drag-to-aim gain. PROVISIONAL and UNTESTED on real phones: chosen so a ~3-tile dash
 * needs a comfortable thumb drag rather than a full-screen swipe. Tune with device evidence.
 */
export const AIM_GAIN = 1.6;

/** Converts two ground points (from the renderer's screenToGround) into an aim vector. */
export function aimVectorFromScreen(startGround: Vec2, currentGround: Vec2, gain: number = AIM_GAIN): Vec2 {
  return { x: (currentGround.x - startGround.x) * gain, y: (currentGround.y - startGround.y) * gain };
}

/** A gesture output carrying both its press point and current point (CSS pixels). */
export interface PositionedGesture {
  readonly startX: number;
  readonly startY: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Projects a positioned gesture through screenToGround and returns its aim vector, or
 * null if either point misses the ground plane (the caller should treat that as no aim).
 */
export function aimFromGesture(
  gesture: PositionedGesture,
  screenToGround: (clientX: number, clientY: number) => Vec2 | null,
  gain: number = AIM_GAIN,
): Vec2 | null {
  const start = screenToGround(gesture.startX, gesture.startY);
  const current = screenToGround(gesture.x, gesture.y);
  if (!start || !current) return null;
  return aimVectorFromScreen(start, current, gain);
}
