/**
 * Shared stylised materials. Low-poly flat-shaded toon look: a three-band gradient keeps
 * forms crisp at phone size and costs the same as Lambert shading.
 */
import {
  Color,
  DataTexture,
  DoubleSide,
  Material,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type ColorRepresentation,
} from 'three';
import { color, type PaletteKey } from './palette';

let gradient: DataTexture | null = null;

/** Three-band toon ramp (shadow, mid, lit). */
export function toonGradient(): DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([96, 178, 255]);
  gradient = new DataTexture(data, data.length, 1, RedFormat);
  gradient.minFilter = NearestFilter;
  gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const shared = new Map<string, MeshToonMaterial>();

export interface ToonOptions {
  emissive?: ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  doubleSide?: boolean;
}

/** A NEW toon material (use for anything tinted per instance, e.g. actors that flash). */
export function toon(c: PaletteKey | Color, options: ToonOptions = {}): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color: typeof c === 'string' ? color(c) : c.clone(),
    gradientMap: toonGradient(),
  });
  if (options.emissive !== undefined) material.emissive = new Color(options.emissive);
  if (options.emissiveIntensity !== undefined) material.emissiveIntensity = options.emissiveIntensity;
  if (options.transparent) {
    material.transparent = true;
    material.opacity = options.opacity ?? 1;
    material.depthWrite = false;
  }
  if (options.doubleSide) material.side = DoubleSide;
  return material;
}

/** Cached toon material for static, never-tinted geometry. */
export function sharedToon(key: PaletteKey): MeshToonMaterial {
  let material = shared.get(key);
  if (!material) {
    material = toon(key);
    material.name = key;
    shared.set(key, material);
  }
  return material;
}

/** Unlit flat colour (signals that must not be shaded into ambiguity). */
export function flat(c: PaletteKey | Color, opacity = 1): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color: typeof c === 'string' ? color(c) : c.clone(),
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  return material;
}

export function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) material.forEach((m) => m.dispose());
  else material.dispose();
}

export function disposeSharedMaterials(): void {
  for (const material of shared.values()) material.dispose();
  shared.clear();
  gradient?.dispose();
  gradient = null;
}
