/**
 * Instance every mesh of a template model at many placements: one draw call per
 * template mesh regardless of how many tiles a room has.
 */
import { Color, Group, InstancedMesh, Matrix4, Mesh, type Material, type Object3D } from 'three';

export interface Placement {
  readonly matrix: Matrix4;
  /** Optional per-instance tint (multiplies material colour). */
  readonly tint?: Color;
}

export function instanceTemplate(
  template: Object3D,
  placements: readonly Placement[],
  name: string,
  materialOverride?: Material,
): Group {
  const group = new Group();
  group.name = name;
  if (placements.length === 0) return group;
  template.updateMatrixWorld(true);
  const rootInverse = new Matrix4().copy(template.matrixWorld).invert();
  const local = new Matrix4();
  const out = new Matrix4();
  template.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    local.multiplyMatrices(rootInverse, node.matrixWorld);
    const mesh = new InstancedMesh(node.geometry, materialOverride ?? node.material, placements.length);
    mesh.name = `${name}:${node.name || 'mesh'}`;
    placements.forEach((p, i) => {
      out.multiplyMatrices(p.matrix, local);
      mesh.setMatrixAt(i, out);
      if (p.tint) mesh.setColorAt(i, p.tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  return group;
}
