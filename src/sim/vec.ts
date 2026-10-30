/**
 * Plain 2D vector helpers for the gameplay plane. Pure functions, no allocation-free
 * tricks: clarity and determinism beat micro-optimisation at this entity count.
 *
 * Gameplay plane: x grows to the right of the screen, y grows toward the top of the
 * screen (north). One unit equals one tile.
 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len2 = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  return l > 0 ? { x: a.x / l, y: a.y / l } : ZERO;
};
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const equals = (a: Vec2, b: Vec2, eps = 1e-9): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
export const clampLen = (a: Vec2, max: number): Vec2 => {
  const l = len(a);
  return l > max && l > 0 ? scale(a, max / l) : a;
};
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
export const fromAngle = (radians: number, length = 1): Vec2 => ({
  x: Math.cos(radians) * length,
  y: Math.sin(radians) * length,
});
