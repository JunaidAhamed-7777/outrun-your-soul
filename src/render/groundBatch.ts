/**
 * Instanced ground marks shared by every actor: blob shadows and enemy footprint rings.
 * Rebuilt each frame from simulation positions; two draw calls however many actors exist.
 */
import { Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type ShaderMaterial, type Texture } from 'three';
import type { Vec2 } from '../sim/vec';
import { color } from './palette';
import { ringMaterial, setUniform } from './shaders';

const CAPACITY = 32;
const DARK = new Color('#0a1035');
const FLOOR = new Color('#2443a3');

export class GroundBatch {
  readonly shadows: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  readonly rings: InstancedMesh<PlaneGeometry, ShaderMaterial>;
  private shadowCount = 0;
  private ringCount = 0;
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly q = new Quaternion();
  private readonly c = new Color();

  constructor(spot: Texture) {
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.shadows = new InstancedMesh(geo, new MeshBasicMaterial({ map: spot, color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }), CAPACITY);
    this.shadows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shadows.renderOrder = 1;
    this.shadows.frustumCulled = false;
    this.shadows.name = 'blob_shadows';
    this.shadows.setColorAt(0, DARK);

    const ringGeo = new PlaneGeometry(2, 2);
    ringGeo.rotateX(-Math.PI / 2);
    const mat = ringMaterial({ color: color('gold'), inner: 0.91, outer: 1, opacity: 0.55, segments: 16, gap: 0.35 });
    mat.depthTest = false;
    this.rings = new InstancedMesh(ringGeo, mat, CAPACITY);
    this.rings.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rings.renderOrder = 30;
    this.rings.frustumCulled = false;
    this.rings.name = 'enemy_rings';
  }

  begin(): void {
    this.shadowCount = 0;
    this.ringCount = 0;
  }

  /** strength 0..1 blends from barely visible to a full contact shadow. */
  shadow(at: Vec2, size: number, strength: number): void {
    if (this.shadowCount >= CAPACITY) return;
    this.p.set(at.x, 0.006, -at.y);
    this.s.set(size, 1, size);
    this.m.compose(this.p, this.q.identity(), this.s);
    this.shadows.setMatrixAt(this.shadowCount, this.m);
    this.c.copy(FLOOR).lerp(DARK, Math.max(0, Math.min(1, strength)));
    this.shadows.setColorAt(this.shadowCount, this.c);
    this.shadowCount++;
  }

  ring(at: Vec2, radius: number): void {
    if (this.ringCount >= CAPACITY) return;
    this.p.set(at.x, 0.018, -at.y);
    this.s.set(radius, 1, radius);
    this.m.compose(this.p, this.q.identity(), this.s);
    this.rings.setMatrixAt(this.ringCount, this.m);
    this.ringCount++;
  }

  end(time: number, reducedMotion: boolean): void {
    this.shadows.count = this.shadowCount;
    this.shadows.visible = this.shadowCount > 0;
    this.shadows.instanceMatrix.needsUpdate = true;
    if (this.shadows.instanceColor) this.shadows.instanceColor.needsUpdate = true;
    this.rings.count = this.ringCount;
    this.rings.visible = this.ringCount > 0;
    this.rings.instanceMatrix.needsUpdate = true;
    setUniform(this.rings.material, 'uStart', reducedMotion ? 0 : time * 0.3);
  }

  dispose(): void {
    this.shadows.geometry.dispose();
    this.shadows.material.dispose();
    this.rings.geometry.dispose();
    this.rings.material.dispose();
    this.shadows.removeFromParent();
    this.rings.removeFromParent();
  }
}
