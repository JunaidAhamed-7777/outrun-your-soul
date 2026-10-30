/**
 * Tiny procedural canvas textures (no external image assets, so no provenance burden).
 * Browser-only: callers run inside the renderer, never in simulation tests.
 */
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, SRGBColorSpace } from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function finish(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/** Vertical gradient; stops are [offset 0 = top, css colour]. */
export function verticalGradient(stops: readonly [number, string][], height = 256): CanvasTexture {
  const [c, ctx] = canvas(4, height);
  const g = ctx.createLinearGradient(0, 0, 0, height);
  for (const [offset, col] of stops) g.addColorStop(offset, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, height);
  return finish(c);
}

/** Radial soft spot (white centre to transparent edge) for blob shadows and glows. */
export function radialSpot(inner = 0.0, size = 128): CanvasTexture {
  const [c, ctx] = canvas(size, size);
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, r * inner, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c);
}

/** Four-point star with a soft core (cut sparks, kill flashes, muzzle flashes). */
export function starSpot(size = 128): CanvasTexture {
  const [c, ctx] = canvas(size, size);
  const r = size / 2;
  const core = ctx.createRadialGradient(r, r, 0, r, r, r * 0.45);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  for (const [w, h] of [
    [size, size * 0.06],
    [size * 0.06, size],
  ] as const) {
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(r, r, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}
