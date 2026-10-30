/**
 * Last Warden boss presentation: it mirrors the player. A tall gilded body
 * (last_warden_body.glb), a slower heart (last_warden_heart.glb: floating cage and core on a
 * chain down to its true ground position) and its own gold-vermilion ribbon between them.
 * Optional and defensive: enemies with roles 'last_warden_body' / 'last_warden_heart' use
 * BossBodyView / HeartView; a dedicated `state.boss` structure is drawn by BossLayer.
 */
import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  type Object3D,
  type ShaderMaterial,
  type Texture,
} from 'three';
import type { EnemyState, SimState } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { approachAngle, groundRing, lerpVec } from './actors';
import type { ModelLibrary } from './assets';
import { yawForFacing } from './contract';
import { color } from './palette';
import { findPart } from './placeholders';
import { ribbonMaterial, setUniform } from './shaders';
import { bossView } from './simext';
import { StripMesh } from './stripMesh';

export const BOSS_BODY_RADIUS = 0.55;
export const BOSS_HEART_RADIUS = 0.3;

function disposeModel(model: Object3D): void {
  model.traverse((node) => {
    if (node instanceof Mesh) (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => m.dispose());
  });
}

function shadowDisc(spot: Texture, size: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const geo = new PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geo, new MeshBasicMaterial({ map: spot, color: new Color('#0a1035'), transparent: true, opacity: 0.45, depthWrite: false }));
  mesh.position.y = 0.006;
  mesh.renderOrder = 1;
  return mesh;
}

/** The boss body: faces where it is heading, head turns toward the courier, mantle sways. */
export class BossBodyView {
  readonly root = new Group();
  private readonly model: Object3D;
  private readonly head?: Object3D;
  private readonly mantle?: Object3D;
  private readonly ring: Mesh<PlaneGeometry>;
  private readonly shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private yaw = 0;
  private last: Vec2 | null = null;

  constructor(lib: ModelLibrary, spot: Texture, radius = BOSS_BODY_RADIUS) {
    this.model = lib.instance('last_warden_body', true);
    this.head = findPart(this.model, 'last_warden_body', 'head');
    this.mantle = findPart(this.model, 'last_warden_body', 'mantle');
    this.ring = groundRing(radius, color('gold'), 0.05, 0.9, 0);
    this.shadow = shadowDisc(spot, 1.4);
    this.root.add(this.shadow, this.model, this.ring);
  }

  update(pos: Vec2, facing: Vec2 | null, lookAt: Vec2 | null, dt: number, time: number, reducedMotion: boolean): void {
    this.root.position.set(pos.x, 0, -pos.y);
    let dir = facing;
    if (!dir && this.last) {
      const dx = pos.x - this.last.x;
      const dy = pos.y - this.last.y;
      if (dx * dx + dy * dy > 1e-6) dir = { x: dx, y: dy };
    }
    this.last = pos;
    if (dir) this.yaw = approachAngle(this.yaw, yawForFacing(dir), 10, dt);
    this.model.rotation.y = this.yaw;
    if (this.head && lookAt) {
      const want = yawForFacing({ x: lookAt.x - pos.x, y: lookAt.y - pos.y }) - this.yaw;
      let d = want;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.head.rotation.y = Math.max(-0.9, Math.min(0.9, d));
    }
    if (this.mantle) this.mantle.rotation.x = reducedMotion ? 0 : Math.sin(time * 2.1) * 0.05;
  }

  dispose(): void {
    disposeModel(this.model);
    this.ring.geometry.dispose();
    (this.ring.material as ShaderMaterial).dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.root.removeFromParent();
  }
}

/** The boss heart: a slow-spinning cage with a beating core above its true ground position. */
export class HeartView {
  readonly root = new Group();
  private readonly model: Object3D;
  private readonly cage?: Object3D;
  private readonly core?: Object3D;
  private readonly coreMaterials: MeshToonMaterial[] = [];
  private readonly glow: Sprite;
  private readonly ring: Mesh<PlaneGeometry>;

  constructor(lib: ModelLibrary, spot: Texture, radius = BOSS_HEART_RADIUS) {
    this.model = lib.instance('last_warden_heart', true);
    this.cage = findPart(this.model, 'last_warden_heart', 'cage');
    this.core = findPart(this.model, 'last_warden_heart', 'core');
    this.core?.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
        if (m instanceof MeshToonMaterial) {
          m.emissive.copy(color('vermilion'));
          this.coreMaterials.push(m);
        }
      }
    });
    this.glow = new Sprite(
      new SpriteMaterial({ map: spot, color: new Color('#ff9a4a'), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }),
    );
    this.glow.renderOrder = -1;
    this.ring = groundRing(radius, color('vermilion'), 0.05, 0.9, 10);
    this.root.add(this.glow, this.model, this.ring);
  }

  update(pos: Vec2, time: number, reducedMotion: boolean): void {
    this.root.position.set(pos.x, 0, -pos.y);
    const beat = reducedMotion ? 0 : Math.max(0, Math.sin(time * 5.5));
    if (this.cage) this.cage.rotation.y = reducedMotion ? 0 : time * 0.6;
    if (this.core) this.core.scale.setScalar(1 + 0.15 * beat);
    for (const m of this.coreMaterials) m.emissiveIntensity = 0.4 + 0.5 * beat;
    this.glow.position.set(0, 0.5, -0.3);
    const g = 1 + 0.15 * beat;
    this.glow.scale.set(g, g, 1);
  }

  dispose(): void {
    disposeModel(this.model);
    (this.glow.material as SpriteMaterial).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as ShaderMaterial).dispose();
    this.root.removeFromParent();
  }
}

/** Gold-and-vermilion silk for the boss's own route (it mirrors the player's ribbon). */
export function bossRibbon(): StripMesh<ShaderMaterial> {
  const mat = ribbonMaterial();
  (mat.uniforms.uColor!.value as Color).copy(color('gold'));
  (mat.uniforms.uDark!.value as Color).copy(color('vermilion_dark'));
  (mat.uniforms.uSheen!.value as Color).set('#fff0c0');
  return new StripMesh(mat, 160, 12);
}

/**
 * Boss ribbon between body and heart (both enemy-based and `state.boss`-based bosses), plus
 * body/heart views when the sim provides a dedicated `state.boss` structure.
 */
export class BossLayer {
  readonly group = new Group();
  private body: BossBodyView | null = null;
  private heart: HeartView | null = null;
  private readonly ribbon = bossRibbon();
  private time = 0;
  private readonly pts: Vec2[] = [];

  constructor(
    private readonly lib: ModelLibrary,
    private readonly spot: Texture,
  ) {
    this.group.add(this.ribbon.mesh);
  }

  update(state: SimState, alpha: number, dt: number, reducedMotion: boolean, courier: Vec2): void {
    this.time += dt;
    const boss = bossView(state);
    let bodyPos: Vec2 | null = null;
    let heartPos: Vec2 | null = null;
    let route: readonly Vec2[] = [];
    if (boss) {
      bodyPos = boss.body ? lerpVec(boss.body.prevPos, boss.body.pos, alpha) : null;
      heartPos = boss.heart ? lerpVec(boss.heart.prevPos, boss.heart.pos, alpha) : null;
      route = boss.route;
      if (bodyPos) {
        if (!this.body) {
          this.body = new BossBodyView(this.lib, this.spot);
          this.group.add(this.body.root);
        }
        this.body.update(bodyPos, null, courier, dt, this.time, reducedMotion);
      }
      if (heartPos) {
        if (!this.heart) {
          this.heart = new HeartView(this.lib, this.spot);
          this.group.add(this.heart.root);
        }
        this.heart.update(heartPos, this.time, reducedMotion);
      }
    } else {
      // Enemy-based boss: connect the parts (views are owned by the renderer's enemy map).
      const parts = enemyBossParts(state.enemies);
      bodyPos = parts.body;
      heartPos = parts.heart;
      route = parts.route;
    }
    if (this.body) this.body.root.visible = !!(boss && bodyPos);
    if (this.heart) this.heart.root.visible = !!(boss && heartPos);
    this.pts.length = 0;
    if (route.length >= 2) {
      this.pts.push(...route);
      if (heartPos) this.pts[0] = heartPos;
      if (bodyPos) this.pts[this.pts.length - 1] = bodyPos;
    } else if (heartPos && bodyPos) {
      this.pts.push(heartPos, bodyPos);
    }
    setUniform(this.ribbon.mesh.material, 'uTime', reducedMotion ? 0 : this.time);
    this.ribbon.set(this.pts, 0.085, 0.034);
  }

  dispose(): void {
    this.body?.dispose();
    this.heart?.dispose();
    this.ribbon.dispose();
    this.group.removeFromParent();
  }
}

/** Positions (and optional route) of an enemy-based boss, if present and alive. */
export function enemyBossParts(enemies: readonly EnemyState[]): { body: Vec2 | null; heart: Vec2 | null; route: readonly Vec2[] } {
  let body: Vec2 | null = null;
  let heart: Vec2 | null = null;
  let route: readonly Vec2[] = [];
  for (const e of enemies) {
    const role = e.role as string;
    if (e.phase === 'dead' || !role.startsWith('last_warden')) continue;
    if (role.includes('heart')) heart = e.pos;
    else {
      body = e.pos;
      const r = (e as unknown as { route?: { points?: unknown } }).route?.points;
      if (Array.isArray(r)) route = r as Vec2[];
    }
  }
  return { body, heart, route };
}
