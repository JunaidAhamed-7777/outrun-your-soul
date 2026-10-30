/**
 * Optional Blender GLB loading. Every model is optional: a missing or broken file falls
 * back to the primitive placeholder with the same pivots and part names. URLs respect the
 * relative Vite base so the build works from a nested itch.io iframe path.
 */
import { Color, Mesh, MeshStandardMaterial, MeshToonMaterial, type Material, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MODEL_IDS, type ModelId } from './contract';
import { sharedToon, toon, toonGradient } from './materials';
import { isPaletteKey, PALETTE_HEX } from './palette';
import { mergeStaticMeshes } from './merge';
import { placeholderFor } from './placeholders';

export function modelUrl(id: ModelId, base: string = import.meta.env.BASE_URL): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}assets/models/${id}.glb`;
}

export type ModelSource = 'glb' | 'placeholder';

export interface ModelLibrary {
  /** A fresh instance (deep clone) of the model; materials shared unless `ownMaterials`. */
  instance(id: ModelId, ownMaterials?: boolean): Object3D;
  source(id: ModelId): ModelSource;
  /** The un-cloned template (for instancing static modules). */
  template(id: ModelId): Object3D;
}

/**
 * Convert exported PBR materials to the shared toon look. Materials named after palette
 * keys map to the shared palette material, so art and placeholders shade identically.
 */
function toonify(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const convert = (material: Material): Material => {
      if (material instanceof MeshToonMaterial) return material;
      const emissive = material instanceof MeshStandardMaterial && material.emissive.getHex() !== 0;
      if (isPaletteKey(material.name) && !emissive && !(material as MeshStandardMaterial).transparent) {
        material.dispose();
        return sharedToon(material.name);
      }
      const base = isPaletteKey(material.name)
        ? new Color(PALETTE_HEX[material.name])
        : material instanceof MeshStandardMaterial
          ? material.color
          : new Color('#ffffff');
      const converted = toon(base);
      converted.name = material.name;
      converted.gradientMap = toonGradient();
      if (material instanceof MeshStandardMaterial) {
        converted.vertexColors = material.vertexColors;
        if (material.emissive && material.emissive.getHex() !== 0) {
          converted.emissive = material.emissive.clone();
          converted.emissiveIntensity = material.emissiveIntensity;
        }
        converted.transparent = material.transparent;
        converted.opacity = material.opacity;
      }
      material.dispose();
      return converted;
    };
    node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
  });
}

/** Give a cloned actor its own material instances so per-actor tints do not leak. */
function cloneMaterials(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.material = Array.isArray(node.material) ? node.material.map((m) => m.clone()) : node.material.clone();
  });
}

export async function loadModels(
  ids: readonly ModelId[] = MODEL_IDS,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ModelLibrary> {
  const loader = new GLTFLoader();
  const templates = new Map<ModelId, Object3D>();
  const sources = new Map<ModelId, ModelSource>();
  let done = 0;

  await Promise.all(
    ids.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(modelUrl(id));
        const root = gltf.scene.getObjectByName(id) ?? gltf.scene;
        root.removeFromParent();
        root.position.set(0, 0, 0);
        toonify(root);
        mergeStaticMeshes(root, id);
        templates.set(id, root);
        sources.set(id, 'glb');
      } catch {
        const placeholder = placeholderFor(id);
        mergeStaticMeshes(placeholder, id);
        templates.set(id, placeholder);
        sources.set(id, 'placeholder');
      } finally {
        done += 1;
        onProgress?.(done, ids.length);
      }
    }),
  );

  const template = (id: ModelId): Object3D => {
    let t = templates.get(id);
    if (!t) {
      t = placeholderFor(id);
      templates.set(id, t);
      sources.set(id, 'placeholder');
    }
    return t;
  };

  return {
    template,
    source: (id) => sources.get(id) ?? 'placeholder',
    instance(id, ownMaterials = false) {
      const copy = template(id).clone(true);
      if (ownMaterials) cloneMaterials(copy);
      return copy;
    },
  };
}
