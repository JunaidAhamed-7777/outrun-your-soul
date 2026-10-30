/**
 * Tiny procedural canvas textures (no external image assets, so no provenance burden).
 * Browser-only: callers run inside the renderer, never in simulation tests.
 */
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';

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

/**
 * Stone tile face used as a multiplicative map on the floor: bevelled edges (light top-left,
 * dark bottom-right), soft mottling and a few hairline veins. Deterministic.
 */
export function stoneTile(size = 128, seed = 7, bevel = true): CanvasTexture {
  const [c, ctx] = canvas(size, size);
  let s = seed >>> 0;
  const rand = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  ctx.fillStyle = '#d9d9d9';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const r = 3 + rand() * 14;
    const light = rand() < 0.5;
    ctx.fillStyle = light ? `rgba(255,255,255,${0.05 + rand() * 0.07})` : `rgba(90,90,110,${0.04 + rand() * 0.06})`;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,120,150,0.18)';
  ctx.lineWidth = 1;
  for (let v = 0; v < 2; v++) {
    ctx.beginPath();
    let x = rand() * size;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < size) {
      x += (rand() - 0.5) * 18;
      y += 8 + rand() * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (bevel) {
    const b = Math.max(3, size * 0.045);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(0, 0, size, b);
    ctx.fillRect(0, 0, b, size);
    ctx.fillStyle = 'rgba(40,40,70,0.35)';
    ctx.fillRect(0, size - b, size, b);
    ctx.fillRect(size - b, 0, b, size);
  }
  const t = finish(c);
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}

/**
 * Exit threshold inlay: dark slate stone with a gold border and a central gold lozenge.
 * Clearly not floor and not wall coping; the renderer adds a gold glow when the gate is usable.
 */
export function thresholdInlay(size = 128): CanvasTexture {
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = '#3b3f62';
  ctx.fillRect(0, 0, size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const gold = '#e2b252';
  const inset = size * 0.08;
  ctx.strokeStyle = gold;
  ctx.lineWidth = size * 0.045;
  ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
  ctx.lineWidth = size * 0.015;
  const inner = size * 0.17;
  ctx.strokeRect(inner, inner, size - inner * 2, size - inner * 2);
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(size / 2, size * 0.3);
  ctx.lineTo(size * 0.7, size / 2);
  ctx.lineTo(size / 2, size * 0.7);
  ctx.lineTo(size * 0.3, size / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3b3f62';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
  const t = finish(c);
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}

/** Soft-edged box (contact and cast shadows). White in the alpha channel; tint by material. */
export function softBox(size = 64, steps = 10): CanvasTexture {
  const [c, ctx] = canvas(size, size);
  const step = size / 2 / (steps + 1);
  for (let i = 0; i < steps; i++) {
    ctx.fillStyle = `rgba(255,255,255,${1 / steps})`;
    const inset = i * step;
    ctx.fillRect(inset, inset, size - inset * 2, size - inset * 2);
  }
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
