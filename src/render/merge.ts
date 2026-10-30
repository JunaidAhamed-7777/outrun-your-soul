/**
 * Draw-call reduction for model templates. Within each animated part (the asset root and
 * every `<asset_id>_<part>` node):
 *  - opaque, non-emissive, untextured toon meshes are baked to vertex colours and merged into
 *    ONE mesh sharing a vertex-colour toon material;
 *  - remaining meshes (glowing eyes, translucent soul pieces, textured parts) merge only with
 *    meshes sharing their exact material.
 * Part pivots, named sockets and `_eye` nodes are preserved, so procedural animation and the
 * asset contract are unaffected.
 */
import { BufferAttribute, BufferGeometry, Color, Matrix4, Mesh, MeshToonMaterial, Object3D, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONTRACT_PARTS } from './contract';
import { toonGradient } from './materials';

/**
 * Parts keep their identity: exact contract part nodes (group or mesh), plus any non-mesh
 * `<id>_*` pivot group (placeholder sub-parts such as courier_body_scarf_tail). Primitive child
 * meshes that GLTFLoader names `<part>_1`, `<part>_2` are NOT parts and get merged.
 */
function isPart(node: Object3D, id: string): boolean {
  if (node.name.includes(':')) return false;
  if ((CONTRACT_PARTS[id] ?? []).some((p) => node.name === `${id}_${p}`)) return true;
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

function bakeable(material: Material): material is MeshToonMaterial {
  return (
    material instanceof MeshToonMaterial &&
    !material.transparent &&
    !material.map &&
    (material.emissive.getHex() === 0 || material.emissiveIntensity === 0) &&
    material.name !== 'eye'
  );
}

/** Non-indexed copy in part space with position/normal/colour only. */
function bakedGeometry(mesh: Mesh, toPart: Matrix4, tint: Color | null): BufferGeometry {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  src.applyMatrix4(toPart);
  const out = new BufferGeometry();
  const pos = src.getAttribute('position');
  out.setAttribute('position', pos);
  if (src.getAttribute('normal')) out.setAttribute('normal', src.getAttribute('normal'));
  else out.computeVertexNormals();
  if (tint) {
    const colors = new Float32Array(pos.count * 3);
    const existing = src.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      const r = existing ? existing.getX(i) : 1;
      const g = existing ? existing.getY(i) : 1;
      const b = existing ? existing.getZ(i) : 1;
      colors[i * 3] = r * tint.r;
      colors[i * 3 + 1] = g * tint.g;
      colors[i * 3 + 2] = b * tint.b;
    }
    out.setAttribute('color', new BufferAttribute(colors, 3));
  }
  return out;
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
  let vcMaterial: MeshToonMaterial | null = null;

  for (const part of parts) {
    const meshes: Mesh[] = [];
    ownedMeshes(part, id, meshes);
    const toPart = (mesh: Mesh): Matrix4 => new Matrix4().copy(part.matrixWorld).invert().multiply(mesh.matrixWorld);

    // 1) Bake plain opaque toon meshes into one vertex-coloured mesh.
    const plain = meshes.filter((m) => bakeable(m.material as Material));
    if (plain.length >= 2) {
      const geos = plain.map((m) => bakedGeometry(m, toPart(m), (m.material as MeshToonMaterial).color));
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (merged) {
        if (!vcMaterial) {
          vcMaterial = new MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: toonGradient() });
          vcMaterial.name = 'vc';
        }
        const mesh = new Mesh(merged, vcMaterial);
        mesh.name = `${part.name}:vc`;
        part.add(mesh);
        for (const old of plain) {
          old.removeFromParent();
          old.geometry.dispose();
          removed++;
        }
      }
    }

    // 2) Merge the rest only with identical materials.
    const rest = meshes.filter((m) => m.parent !== null);
    const groups = new Map<string, Mesh[]>();
    for (const mesh of rest) {
      const key = `${(mesh.material as Material).uuid}|${attributeSignature(mesh.geometry)}`;
      const list = groups.get(key) ?? [];
      list.push(mesh);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((mesh) => {
        const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()) as BufferGeometry;
        g.applyMatrix4(toPart(mesh));
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
