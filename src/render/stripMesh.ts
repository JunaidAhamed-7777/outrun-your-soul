/** A ground strip mesh whose geometry is rebuilt in place from a polyline each frame. */
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, type Material } from 'three';
import type { Vec2 } from '../sim/vec';
import { buildStrip, createStripBuffers, stripIndices, type StripBuffers } from './strip';

export class StripMesh<M extends Material = Material> {
  readonly mesh: Mesh<BufferGeometry, M>;
  private readonly buffers: StripBuffers;
  private readonly position: BufferAttribute;
  private readonly uv: BufferAttribute;

  constructor(material: M, maxPoints: number, renderOrder = 10) {
    this.buffers = createStripBuffers(maxPoints);
    const geometry = new BufferGeometry();
    this.position = new BufferAttribute(this.buffers.positions, 3);
    this.position.setUsage(DynamicDrawUsage);
    this.uv = new BufferAttribute(this.buffers.uvs, 2);
    this.uv.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('uv', this.uv);
    geometry.setIndex(new BufferAttribute(stripIndices(maxPoints), 1));
    geometry.setDrawRange(0, 0);
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  /** Rebuild from points; returns the number of points used (0 hides the strip). */
  set(points: readonly Vec2[], halfWidth: number, height: number): number {
    const n = buildStrip(points, halfWidth, height, this.buffers);
    this.mesh.geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
    this.mesh.visible = n >= 2;
    if (n >= 2) {
      this.position.clearUpdateRanges();
      this.position.addUpdateRange(0, n * 2 * 3);
      this.position.needsUpdate = true;
      this.uv.clearUpdateRanges();
      this.uv.addUpdateRange(0, n * 2 * 2);
      this.uv.needsUpdate = true;
    }
    return n;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}
