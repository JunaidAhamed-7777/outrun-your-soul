/**
 * Last Warden boss presentation: it mirrors the player. A tall gilded armoured body
 * (last_warden_body.glb), a slower heart (last_warden_heart.glb: a floating cage and core on a
 * chain down to its true ground position) and its own gold-vermilion ribbon between them.
 *
 * Driven by SimState.boss (BossState). Telegraphs speak the same amber language as sentries:
 * the frozen charge path is a railed band with forward chevrons and a time-to-fire fill as wide
 * as the body's danger corridor; fan lines are locked bands. The body's footprint ring doubles
 * as the HP gauge. Stagger slumps the body and makes the heart flicker; defeat collapses both.
 * Presentation only: every position, phase and timing comes from the simulation.
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
import type { BossState, RoomDef, SimState } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { ACTOR_SCALE, approach, approachAngle, groundRing, lerpVec } from './actors';
import type { ModelLibrary } from './assets';
import { yawForFacing } from './contract';
import { color } from './palette';
import { findPart } from './placeholders';
import { rayToWalls } from './raycast';
import { ribbonMaterial, setUniform, telegraphMaterial } from './shaders';
import { StripMesh } from './stripMesh';

export const BOSS_BODY_RADIUS = 0.6;
export const BOSS_HEART_RADIUS = 0.35;
const MAX_FAN = 6;

function disposeModel(model: Object3D): void {
  model.traverse((node) => {
    if (node instanceof Mesh) (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => m.dispose());
  });
}

/** Heart is exposed when it trails the body on its route and the boss is not staggered. */
export function bossHeartVulnerable(b: Pick<BossState, 'route' | 'phase'>): boolean {
  return b.route.points.length > 1 && b.phase !== 'stagger' && b.phase !== 'dead' && b.phase !== 'dormant';
}

/** The boss body: faces where it is heading, head turns toward the courier, mantle sways. */
export class BossBodyView {
  readonly root = new Group();
  private readonly model: Object3D;
  private readonly body?: Object3D;
  private readonly head?: Object3D;
  private readonly mantle?: Object3D;
  /** Footprint ring; its arc doubles as the HP gauge for the state-driven boss. */
  readonly ring: Mesh<PlaneGeometry>;
  private yaw = 0;
  private last: Vec2 | null = null;
  private slump = 0;
  private collapse = 0;

  constructor(lib: ModelLibrary, radius = BOSS_BODY_RADIUS) {
    this.model = lib.instance('last_warden_body', true);
    this.body = findPart(this.model, 'last_warden_body', 'body');
    this.head = findPart(this.model, 'last_warden_body', 'head');
    this.mantle = findPart(this.model, 'last_warden_body', 'mantle');
    this.model.scale.setScalar(ACTOR_SCALE);
    this.ring = groundRing(radius, color('gold'), 0.06, 0.95, 0);
    this.root.add(this.model, this.ring);
  }

  update(pos: Vec2, facing: Vec2 | null, lookAt: Vec2 | null, dt: number, time: number, reducedMotion: boolean, mood: 'normal' | 'stagger' | 'dead' = 'normal'): void {
    this.root.position.set(pos.x, 0, -pos.y);
    let dir = facing;
    if (!dir && this.last) {
      const dx = pos.x - this.last.x;
      const dy = pos.y - this.last.y;
      if (dx * dx + dy * dy > 1e-6) dir = { x: dx, y: dy };
    }
    this.last = pos;
    if (dir && mood !== 'dead') this.yaw = approachAngle(this.yaw, yawForFacing(dir), 10, dt);
    this.model.rotation.y = this.yaw;
    this.slump = approach(this.slump, mood === 'stagger' ? 1 : 0, 8, dt);
    this.collapse = Math.min(1, this.collapse + (mood === 'dead' ? dt / 1.4 : -this.collapse));
    if (this.head) {
      let d = 0;
      if (lookAt && mood === 'normal') {
        d = yawForFacing({ x: lookAt.x - pos.x, y: lookAt.y - pos.y }) - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
      }
      this.head.rotation.y = Math.max(-0.9, Math.min(0.9, d));
      this.head.rotation.x = this.slump * 0.6;
    }
    if (this.body) {
      const shake = reducedMotion ? 0 : this.slump * Math.sin(time * 40) * 0.03;
      this.body.rotation.x = this.slump * 0.35 + this.collapse * 1.2;
      this.body.rotation.z = shake;
    }
    if (this.mantle) this.mantle.rotation.x = reducedMotion ? 0 : Math.sin(time * 2.1) * 0.05;
    const s = ACTOR_SCALE * (1 - this.collapse * 0.85);
    this.model.scale.setScalar(Math.max(0.001, s));
    this.model.position.y = -this.collapse * 0.4;
    this.ring.visible = mood !== 'dead';
  }

  dispose(): void {
    disposeModel(this.model);
    this.ring.geometry.dispose();
    (this.ring.material as ShaderMaterial).dispose();
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
  readonly ring: Mesh<PlaneGeometry>;
  private flash = 0;

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
    this.model.scale.setScalar(ACTOR_SCALE);
    this.glow = new Sprite(
      new SpriteMaterial({ map: spot, color: new Color('#ff9a4a'), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }),
    );
    this.glow.renderOrder = -1;
    this.ring = groundRing(radius, color('vermilion'), 0.05, 0.9, 10);
    this.root.add(this.glow, this.model, this.ring);
  }

  /** A heart hit: bright flash. */
  hit(): void {
    this.flash = 1;
  }

  /**
   * vulnerable: exposed on its route (bright pulsing ring). stagger: flickers and trembles.
   */
  update(pos: Vec2, time: number, reducedMotion: boolean, mood: { vulnerable?: boolean; stagger?: boolean } = {}, dt = 1 / 60): void {
    this.root.position.set(pos.x, 0, -pos.y);
    const beat = reducedMotion ? 0 : Math.max(0, Math.sin(time * (mood.stagger ? 14 : 5.5)));
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.cage) this.cage.rotation.y = reducedMotion ? 0 : time * (mood.stagger ? 2.4 : 0.6);
    if (this.core) this.core.scale.setScalar(1 + 0.15 * beat + this.flash * 0.4);
    const flicker = mood.stagger && !reducedMotion ? (Math.sin(time * 37) > 0 ? 1 : 0.35) : 1;
    for (const m of this.coreMaterials) m.emissiveIntensity = (0.4 + 0.5 * beat + this.flash * 2) * flicker;
    if (mood.stagger && !reducedMotion) this.model.position.x = Math.sin(time * 45) * 0.03;
    else this.model.position.x = 0;
    this.glow.position.set(0, 0.5, -0.3);
    const g = 1 + 0.15 * beat + this.flash * 0.8 + (mood.vulnerable ? 0.25 : 0);
    this.glow.scale.set(g, g, 1);
    (this.glow.material as SpriteMaterial).opacity = (mood.vulnerable ? 0.75 : 0.45) * flicker;
    const ringMat = this.ring.material as ShaderMaterial;
    setUniform(ringMat, 'uOpacity', mood.vulnerable ? 0.75 + (reducedMotion ? 0 : 0.25 * Math.sin(time * 9)) : 0.45);
    setUniform(ringMat, 'uSegments', mood.vulnerable ? 0 : 10);
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

function amberBand(maxPoints: number): StripMesh<ShaderMaterial> {
  const strip = new StripMesh(telegraphMaterial(), maxPoints, 35);
  strip.mesh.material.depthTest = false;
  setUniform(strip.mesh.material, 'uLocked', 1);
  return strip;
}

/** Draws SimState.boss: body, heart, ribbon, charge path, fan lines, HP gauge and defeat. */
export class BossLayer {
  readonly group = new Group();
  private body: BossBodyView | null = null;
  private heart: HeartView | null = null;
  private readonly ribbon = bossRibbon();
  private readonly path = amberBand(32);
  private readonly fan: StripMesh<ShaderMaterial>[] = [];
  private time = 0;
  private readonly pts: Vec2[] = [];
  private readonly pathPts: Vec2[] = [];
  private ribbonFade = 1;
  bodyPos: Vec2 | null = null;
  heartPos: Vec2 | null = null;

  constructor(
    private readonly lib: ModelLibrary,
    private readonly spot: Texture,
  ) {
    for (let i = 0; i < MAX_FAN; i++) {
      const s = amberBand(2);
      this.fan.push(s);
      this.group.add(s.mesh);
    }
    this.group.add(this.ribbon.mesh, this.path.mesh);
  }

  heartHit(): void {
    this.heart?.hit();
  }

  update(state: SimState, alpha: number, dt: number, reducedMotion: boolean, courier: Vec2, room: RoomDef | null): void {
    this.time += dt;
    const b = state.boss;
    this.group.visible = !!b;
    if (!b) {
      this.bodyPos = null;
      this.heartPos = null;
      return;
    }
    const bodyPos = lerpVec(b.body.prevPos, b.body.pos, alpha);
    const heartPos = lerpVec(b.heart.prevPos, b.heart.pos, alpha);
    this.bodyPos = bodyPos;
    this.heartPos = heartPos;
    const dead = b.phase === 'dead';
    const stagger = b.phase === 'stagger';

    if (!this.body) {
      this.body = new BossBodyView(this.lib);
      this.group.add(this.body.root);
    }
    this.body.update(bodyPos, b.body.facing, courier, dt, this.time, reducedMotion, dead ? 'dead' : stagger ? 'stagger' : 'normal');
    // Footprint ring as HP gauge: one segment per remaining heart hit.
    const ringMat = this.body.ring.material as ShaderMaterial;
    setUniform(ringMat, 'uSegments', b.maxHp);
    setUniform(ringMat, 'uGap', 0.12);
    setUniform(ringMat, 'uArc', Math.max(0, Math.min(1, b.hp / Math.max(1, b.maxHp))));
    setUniform(ringMat, 'uStart', Math.PI / 2);

    if (!this.heart) {
      this.heart = new HeartView(this.lib, this.spot);
      this.group.add(this.heart.root);
    }
    this.heart.root.visible = !dead;
    this.heart.update(heartPos, this.time, reducedMotion, { vulnerable: bossHeartVulnerable(b), stagger }, dt);

    // Boss tether: heart (index 0) to body (last), endpoints on the interpolated parts.
    this.ribbonFade = approach(this.ribbonFade, dead ? 0 : 1, 3, dt);
    this.pts.length = 0;
    if (b.route.points.length >= 2 && this.ribbonFade > 0.02) {
      this.pts.push(...b.route.points);
      this.pts[0] = heartPos;
      this.pts[this.pts.length - 1] = bodyPos;
    }
    setUniform(this.ribbon.mesh.material, 'uTime', reducedMotion ? 0 : this.time);
    setUniform(this.ribbon.mesh.material, 'uOpacity', this.ribbonFade);
    this.ribbon.set(this.pts, 0.085, 0.034);

    // Charge path: frozen route shown while aiming, remaining legs while running.
    const progress = b.phaseDuration > 0 ? Math.min(1, b.phaseTime / b.phaseDuration) : 1;
    this.pathPts.length = 0;
    if ((b.phase === 'aimCharge' || b.phase === 'charge') && b.path.length >= 2) {
      const from = b.phase === 'charge' ? Math.min(b.legIndex + 1, b.path.length - 1) : 1;
      // buildStrip measures u from the LAST point, so list the path end-first (u = 0 at the body).
      for (let i = b.path.length - 1; i >= from; i--) this.pathPts.push(b.path[i]!);
      this.pathPts.push(b.phase === 'charge' ? bodyPos : b.path[0]!);
    }
    if (this.pathPts.length >= 2) {
      let length = 0;
      for (let i = 1; i < this.pathPts.length; i++) length += Math.hypot(this.pathPts[i]!.x - this.pathPts[i - 1]!.x, this.pathPts[i]!.y - this.pathPts[i - 1]!.y);
      const mat = this.path.mesh.material;
      setUniform(mat, 'uLength', length);
      setUniform(mat, 'uProgress', b.phase === 'aimCharge' ? progress : 1);
      setUniform(mat, 'uTime', this.time);
      setUniform(mat, 'uMotion', reducedMotion ? 0 : 1);
      setUniform(mat, 'uOpacity', b.phase === 'charge' ? 0.7 : 1);
      this.path.set(this.pathPts, BOSS_BODY_RADIUS, 0.05);
    } else {
      this.path.hide();
    }

    // Fan lines: one locked band per telegraphed direction, ray-cast to the walls.
    const showFan = b.phase === 'aimFan' && b.fan.length > 0 && room;
    this.fan.forEach((strip, i) => {
      const dir = showFan ? b.fan[i] : undefined;
      if (!dir || !room) {
        strip.hide();
        return;
      }
      const origin = { x: bodyPos.x + dir.x * BOSS_BODY_RADIUS, y: bodyPos.y + dir.y * BOSS_BODY_RADIUS };
      const length = rayToWalls(origin, dir, room);
      const end = { x: origin.x + dir.x * length, y: origin.y + dir.y * length };
      const mat = strip.mesh.material;
      setUniform(mat, 'uLength', length);
      setUniform(mat, 'uProgress', progress);
      setUniform(mat, 'uTime', this.time);
      setUniform(mat, 'uMotion', reducedMotion ? 0 : 1);
      setUniform(mat, 'uMark', 1e5);
      strip.set([end, origin], 0.15, 0.05);
    });
  }

  clear(): void {
    this.body?.dispose();
    this.body = null;
    this.heart?.dispose();
    this.heart = null;
    this.ribbonFade = 1;
    this.path.hide();
    this.ribbon.hide();
    for (const s of this.fan) s.hide();
  }

  dispose(): void {
    this.clear();
    this.ribbon.dispose();
    this.path.dispose();
    for (const s of this.fan) s.dispose();
    this.group.removeFromParent();
  }
}
