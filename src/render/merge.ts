/**
 * Draw-call reduction for model templates: within each animated part (the asset root and
 * every `<asset_id>_<part>` node), merge the static meshes that share a material into one
 * mesh. Part pivots, named sockets and per-material identity (used for tints and eye glow)
 * are preserved, so procedural animation and the asset contract are unaffected.
 */
import { BufferGeometry, Matrix4, Mesh, Object3D, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function isPart(node: Object3D, id: string): boolean {
  return node.name.startsWith(`${id}_`) && !(node instanceof Mesh);
}

/** Collect meshes owned by `part` (not inside a nested part). */
function ownedMeshes(part: Object3D, id: string, out: Mesh[]): void {
  for (const child of part.children) {
    if (isPart(child, id)) continue;
    if (child instanceof Mesh && !Array.isArray(child.material) && child.children.length === 0 && !child.name.endsWith('_eye')) {
      out.push(child);
    }
    if (!(child instanceof Mesh)) ownedMeshes(child, id, out);
  }
}

function attributeSignature(g: BufferGeometry): string {
  return Object.keys(g.attributes).sort().join(',') + (g.index ? ':i' : ':n');
}

export function mergeStaticMeshes(root: Object3D, id: string): number {
  const parts: Object3D[] = [root];
  root.traverse((node) => {
    if (node !== root && isPart(node, id)) parts.push(node);
  });
  let removed = 0;
  root.updateMatrixWorld(true);
  for (const part of parts) {
    const meshes: Mesh[] = [];
    ownedMeshes(part, id, meshes);
    const groups = new Map<string, Mesh[]>();
    for (const mesh of meshes) {
      const key = `${(mesh.material as Material).uuid}|${attributeSignature(mesh.geometry)}`;
      const list = groups.get(key) ?? [];
      list.push(mesh);
      groups.set(key, list);
    }
    const partInverse = new Matrix4().copy(part.matrixWorld).invert();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((mesh) => {
        const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()) as BufferGeometry;
        g.applyMatrix4(new Matrix4().multiplyMatrices(partInverse, mesh.matrixWorld));
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const first = list[0]!;
      const mesh = new Mesh(merged, first.material);
      mesh.name = `${part.name}:${(first.material as Material).name || 'merged'}`;
      part.add(mesh);
      for (const old of list) {
        old.removeFromParent();
        old.geometry.dispose();
        removed++;
      }
    }
  }
  return removed;
}
