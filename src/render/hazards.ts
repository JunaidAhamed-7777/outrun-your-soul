/**
 * Cuttable bolts (white-hot needles with an orange edge, a short trail and a true-position
 * ground dot) and persistent environmental lanes (violet striped fields). The two must never
 * be mistaken for one another, nor for the vermilion ribbon.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
  type ShaderMaterial,
  type Texture,
} from 'three';
import type { LaneState, ProjectileState } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { yawForFacing } from './contract';
import { lerpVec } from './actors';
import { color } from './palette';
import { laneMaterial, setUniform } from './shaders';
import { boltSlowed } from './simext';
import { verticalGradient } from './textures';

export const BOLT_HEIGHT = 0.34;
const LANE_GLOW = new Color('#c77dff');
const HOT_CORE = color('bolt_core');
const HOT_EDGE = color('bolt_edge');
const COOL_CORE = new Color('#e4f6ff');
const COOL_EDGE = new Color('#59b8ff');
const UP = new Vector3(0, 1, 0);

const MAX_BOLTS = 48;

/**
 * Every bolt in four instanced draws: white-hot needles, additive trails, glow points and
 * true-position ground dots. Bolts slowed inside a Glass Lantern halo are tinted cool.
 */
export class BoltLayer {
  readonly group = new Group();
  private readonly needles: InstancedMesh<OctahedronGeometry, MeshBasicMaterial>;
  private readonly trails: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly dots: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly glows: Points<BufferGeometry, PointsMaterial>;
  private readonly glowPos: BufferAttribute;
  private readonly glowCol: BufferAttribute;
  private readonly trailTex: Texture;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();

  constructor(spot: Texture) {
    const needleGeo = new OctahedronGeometry(1, 0);
    this.needles = new InstancedMesh(needleGeo, new MeshBasicMaterial({ color: '#ffffff' }), MAX_BOLTS);
    this.needles.renderOrder = 33;
    const trailGeo = new PlaneGeometry(0.13, 0.85);
    trailGeo.rotateX(-Math.PI / 2);
    trailGeo.translate(0, 0, -0.42);
    this.trailTex = verticalGradient([
      [0, 'rgba(255,255,255,0)'],
      [1, 'rgba(255,255,255,1)'],
    ]);
    this.trails = new InstancedMesh(
      trailGeo,
      new MeshBasicMaterial({ map: this.trailTex, color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false }),
      MAX_BOLTS,
    );
    this.trails.renderOrder = 31;
    const dotGeo = new PlaneGeometry(0.16, 0.16);
    dotGeo.rotateX(-Math.PI / 2);
    this.dots = new InstancedMesh(
      dotGeo,
      new MeshBasicMaterial({ map: spot, color: '#ffffff', transparent: true, depthTest: false, depthWrite: false }),
      MAX_BOLTS,
    );
    this.dots.renderOrder = 34;
    const geo = new BufferGeometry();
    this.glowPos = new BufferAttribute(new Float32Array(MAX_BOLTS * 3), 3);
    this.glowCol = new BufferAttribute(new Float32Array(MAX_BOLTS * 3), 3);
    geo.setAttribute('position', this.glowPos);
    geo.setAttribute('color', this.glowCol);
    this.glows = new Points(
      geo,
      new PointsMaterial({ map: spot, size: 0.6, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false }),
    );
    this.glows.renderOrder = 32;
    for (const o of [this.needles, this.trails, this.dots, this.glows]) {
      o.frustumCulled = false;
      this.group.add(o);
    }
    for (const mesh of [this.needles, this.trails, this.dots]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      // Create instance colours up front so the first bolt does not trigger a shader recompile.
      mesh.setColorAt(0, HOT_EDGE);
    }
    this.update([], 0, 0);
  }

  update(projectiles: readonly ProjectileState[], alpha: number, time: number, soul?: Vec2, haloRadius: number | null = null): void {
    let n = 0;
    for (const proj of projectiles) {
      if (!proj.alive || n >= MAX_BOLTS) continue;
      const pos: Vec2 = lerpVec(proj.prevPos, proj.pos, alpha);
      const slowed = soul ? boltSlowed(proj, soul, haloRadius) : false;
      const yaw = yawForFacing(proj.vel);
      this.q.setFromAxisAngle(UP, yaw);
      this.p.set(pos.x, BOLT_HEIGHT, -pos.y);
      this.s.set(0.06, 0.06, 0.32);
      this.m.compose(this.p, this.q, this.s);
      this.needles.setMatrixAt(n, this.m);
      this.needles.setColorAt(n, slowed ? COOL_CORE : HOT_CORE);
      // Inside a Glass Lantern halo the bolt cools: same shape, colder colours, shorter trail.
      this.s.set(1, 1, slowed ? 0.55 : 1);
      this.m.compose(this.p, this.q, this.s);
      this.trails.setMatrixAt(n, this.m);
      this.trails.setColorAt(n, slowed ? COOL_EDGE : HOT_EDGE);
      this.p.set(pos.x, 0.03, -pos.y);
      this.s.set(1, 1, 1);
      this.m.compose(this.p, this.q.identity(), this.s);
      this.dots.setMatrixAt(n, this.m);
      this.dots.setColorAt(n, slowed ? COOL_EDGE : HOT_EDGE);
      const flicker = 0.75 + 0.25 * Math.sin(time * 40 + proj.id);
      const edge = slowed ? COOL_EDGE : HOT_EDGE;
      this.glowPos.setXYZ(n, pos.x, BOLT_HEIGHT, -pos.y);
      this.glowCol.setXYZ(n, edge.r * flicker, edge.g * flicker, edge.b * flicker);
      n++;
    }
    for (const mesh of [this.needles, this.trails, this.dots]) {
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.glows.geometry.setDrawRange(0, n);
    this.glows.visible = n > 0;
    this.glowPos.needsUpdate = true;
    this.glowCol.needsUpdate = true;
  }

  clear(): void {
    this.update([], 0, 0);
  }

  dispose(): void {
    for (const mesh of [this.needles, this.trails, this.dots]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.glows.geometry.dispose();
    this.glows.material.dispose();
    this.trailTex.dispose();
    this.group.removeFromParent();
  }
}

export class LaneLayer {
  readonly group = new Group();
  private readonly views = new Map<number, Mesh<PlaneGeometry, ShaderMaterial>>();
  private time = 0;
  private glows: Points<BufferGeometry, PointsMaterial> | null = null;
  private glowKeys: string[] = [];

  /** Lane emitter apertures (per lane key): one additive point batch glows with lane status. */
  setApertures(apertures: ReadonlyMap<string, Vector3[]>, spot: Texture): void {
    if (this.glows) {
      this.glows.geometry.dispose();
      this.glows.material.dispose();
      this.glows.removeFromParent();
      this.glows = null;
    }
    this.glowKeys = [];
    const pos: number[] = [];
    for (const [key, list] of apertures) {
      for (const p of list) {
        pos.push(p.x, p.y, p.z);
        this.glowKeys.push(key);
      }
    }
    if (!pos.length) return;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(pos.length), 3));
    const mat = new PointsMaterial({ map: spot, size: 0.9, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false });
    this.glows = new Points(geo, mat);
    this.glows.renderOrder = 9;
    this.glows.frustumCulled = false;
    this.group.add(this.glows);
  }

  update(lanes: readonly LaneState[], dt: number, reducedMotion: boolean): void {
    this.time += dt;
    if (this.glows) {
      const colors = this.glows.geometry.getAttribute('color') as BufferAttribute;
      this.glowKeys.forEach((key, i) => {
        const lane = lanes.find((l) => l.key === key);
        const blink = reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(this.time * 13);
        const k = !lane ? 0 : lane.status === 'active' ? 1 : lane.status === 'warning' ? 0.25 + 0.55 * blink : 0.12;
        colors.setXYZ(i, LANE_GLOW.r * k, LANE_GLOW.g * k, LANE_GLOW.b * k);
      });
      colors.needsUpdate = true;
    }
    for (const lane of lanes) {
      let mesh = this.views.get(lane.id);
      if (!mesh) {
        const geo = new PlaneGeometry(lane.rect.w, lane.rect.h);
        geo.rotateX(-Math.PI / 2);
        mesh = new Mesh(geo, laneMaterial(lane.rect.w, lane.rect.h));
        mesh.position.set(lane.rect.x + lane.rect.w / 2, 0.014, -(lane.rect.y + lane.rect.h / 2));
        mesh.renderOrder = 8;
        this.views.set(lane.id, mesh);
        this.group.add(mesh);
      }
      const status = lane.status === 'active' ? 2 : lane.status === 'warning' ? 1 : 0;
      setUniform(mesh.material, 'uStatus', status);
      setUniform(mesh.material, 'uTime', this.time);
      setUniform(mesh.material, 'uMotion', reducedMotion ? 0 : 1);
    }
  }

  clear(): void {
    if (this.glows) {
      this.glows.geometry.dispose();
      this.glows.material.dispose();
      this.glows.removeFromParent();
      this.glows = null;
    }
    for (const mesh of this.views.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.removeFromParent();
    }
    this.views.clear();
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
