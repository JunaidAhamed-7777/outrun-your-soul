/**
 * Cuttable bolts (white-hot needles with an orange edge, a short trail and a true-position
 * ground dot) and persistent environmental lanes (violet striped fields). The two must never
 * be mistaken for one another, nor for the vermilion ribbon.
 */
import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  type ShaderMaterial,
  type Texture,
} from 'three';
import type { LaneState, ProjectileState } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { yawForFacing } from './contract';
import { lerpVec } from './actors';
import { color } from './palette';
import { laneMaterial, ringMaterial, setUniform } from './shaders';
import { boltSlowed } from './simext';
import { verticalGradient } from './textures';

export const BOLT_HEIGHT = 0.34;
const HOT_CORE = color('bolt_core');
const HOT_EDGE = color('bolt_edge');
const COOL_CORE = new Color('#e4f6ff');
const COOL_EDGE = new Color('#59b8ff');

class BoltView {
  readonly root = new Group();
  readonly needle: Mesh<OctahedronGeometry, MeshBasicMaterial>;
  readonly edge: Mesh<OctahedronGeometry, MeshBasicMaterial>;
  readonly trail: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly glow: Sprite;
  readonly dot: Mesh<PlaneGeometry, ShaderMaterial>;
  id = -1;

  constructor(shared: { needleGeo: OctahedronGeometry; trailGeo: PlaneGeometry; dotGeo: PlaneGeometry; trailTex: Texture; spot: Texture }) {
    this.needle = new Mesh(shared.needleGeo, new MeshBasicMaterial({ color: color('bolt_core') }));
    this.needle.scale.set(0.055, 0.055, 0.3);
    this.edge = new Mesh(
      shared.needleGeo,
      new MeshBasicMaterial({ color: color('bolt_edge'), transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
    );
    this.edge.scale.set(0.1, 0.1, 0.42);
    this.trail = new Mesh(
      shared.trailGeo,
      new MeshBasicMaterial({
        map: shared.trailTex,
        color: color('bolt_edge'),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.glow = new Sprite(
      new SpriteMaterial({ map: shared.spot, color: color('bolt_edge'), transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false }),
    );
    this.glow.scale.set(0.55, 0.55, 1);
    const head = new Group();
    head.position.y = BOLT_HEIGHT;
    head.add(this.trail, this.edge, this.needle, this.glow);
    this.dot = new Mesh(shared.dotGeo, ringMaterial({ color: color('bolt_edge'), inner: 0, outer: 1, opacity: 0.9 }));
    this.dot.material.depthTest = false;
    this.dot.position.y = 0.03;
    this.dot.renderOrder = 34;
    this.needle.renderOrder = 33;
    this.edge.renderOrder = 32;
    this.trail.renderOrder = 31;
    this.glow.renderOrder = 32;
    this.root.add(head, this.dot);
  }

  update(p: ProjectileState, alpha: number, time: number, slowed: boolean): void {
    const pos: Vec2 = lerpVec(p.prevPos, p.pos, alpha);
    this.root.position.set(pos.x, 0, -pos.y);
    this.root.rotation.y = yawForFacing(p.vel);
    const flicker = 0.85 + 0.15 * Math.sin(time * 40 + p.id);
    this.glow.material.opacity = 0.7 * flicker;
    // Inside a Glass Lantern halo the bolt cools: same shape, colder colours, shorter trail.
    if (slowed !== this.slowed) {
      this.slowed = slowed;
      this.needle.material.color.copy(slowed ? COOL_CORE : HOT_CORE);
      this.edge.material.color.copy(slowed ? COOL_EDGE : HOT_EDGE);
      this.trail.material.color.copy(slowed ? COOL_EDGE : HOT_EDGE);
      this.glow.material.color.copy(slowed ? COOL_EDGE : HOT_EDGE);
      this.dot.material.uniforms.uColor!.value.copy(slowed ? COOL_EDGE : HOT_EDGE);
      this.trail.scale.z = slowed ? 0.55 : 1;
    }
  }

  private slowed = false;

  dispose(): void {
    this.needle.material.dispose();
    this.edge.material.dispose();
    this.trail.material.dispose();
    this.glow.material.dispose();
    this.dot.material.dispose();
  }
}

export class BoltLayer {
  readonly group = new Group();
  private readonly pool: BoltView[] = [];
  private readonly active = new Map<number, BoltView>();
  private readonly seen = new Set<number>();
  private readonly shared: ConstructorParameters<typeof BoltView>[0];

  constructor(spot: Texture) {
    const trailGeo = new PlaneGeometry(0.13, 0.85);
    trailGeo.rotateX(-Math.PI / 2);
    trailGeo.translate(0, 0, -0.42);
    const dotGeo = new PlaneGeometry(0.16, 0.16);
    dotGeo.rotateX(-Math.PI / 2);
    this.shared = {
      needleGeo: new OctahedronGeometry(1, 0),
      trailGeo,
      dotGeo,
      trailTex: verticalGradient([
        [0, 'rgba(255,255,255,0)'],
        [1, 'rgba(255,255,255,1)'],
      ]),
      spot,
    };
  }

  /** Last known ground position of a bolt (for cut/gone effects that need it). */
  positionOf(id: number): Vec2 | null {
    const view = this.active.get(id);
    return view ? { x: view.root.position.x, y: -view.root.position.z } : null;
  }

  update(projectiles: readonly ProjectileState[], alpha: number, time: number, soul?: Vec2, haloRadius: number | null = null): void {
    const seen = this.seen;
    seen.clear();
    for (const p of projectiles) {
      if (!p.alive) continue;
      seen.add(p.id);
      let view = this.active.get(p.id);
      if (!view) {
        view = this.pool.pop() ?? new BoltView(this.shared);
        view.id = p.id;
        this.active.set(p.id, view);
        this.group.add(view.root);
      }
      view.update(p, alpha, time, soul ? boltSlowed(p, soul, haloRadius) : false);
    }
    for (const [id, view] of this.active) {
      if (seen.has(id)) continue;
      this.active.delete(id);
      view.root.removeFromParent();
      this.pool.push(view);
    }
  }

  clear(): void {
    for (const view of this.active.values()) {
      view.root.removeFromParent();
      this.pool.push(view);
    }
    this.active.clear();
  }

  dispose(): void {
    this.clear();
    for (const view of this.pool) view.dispose();
    this.shared.needleGeo.dispose();
    this.shared.trailGeo.dispose();
    this.shared.dotGeo.dispose();
    this.shared.trailTex.dispose();
    this.group.removeFromParent();
  }
}

export class LaneLayer {
  readonly group = new Group();
  private readonly views = new Map<number, Mesh<PlaneGeometry, ShaderMaterial>>();
  private time = 0;

  update(lanes: readonly LaneState[], dt: number, reducedMotion: boolean): void {
    this.time += dt;
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
