/**
 * Actor presentation: courier body, soul, sentries and the exit gate. Positions come from
 * the simulation (interpolated); every pose here is decorative and never feeds back.
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
  Vector3,
  type Object3D,
  type Texture,
} from 'three';
import type { BodyState, EnemyState, GateStatus, SimState } from '../sim/types';
import { TUNING } from '../sim/tuning';
import type { Vec2 } from '../sim/vec';
import type { ModelLibrary } from './assets';
import { yawForFacing } from './contract';
import { color } from './palette';
import { findPart } from './placeholders';
import { ringMaterial, setUniform } from './shaders';

const GROUND = 0.018;
/** Presentation scale for actor art; collision rings always show the true simulation radius. */
export const ACTOR_SCALE = 1.18;
/** The soul is the endpoint players must protect: give it extra presence. */
export const SOUL_SCALE = 1.4;

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Shortest-path angle approach (rad), frame-rate independent. */
export function approachAngle(current: number, target: number, rate: number, dt: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-rate * dt));
}

export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

interface TintEntry {
  material: MeshToonMaterial;
  emissive: Color;
  intensity: number;
}

/** Per-actor emissive control for hit flashes and grace blinking. */
class Tint {
  private readonly entries: TintEntry[] = [];
  private readonly tmp = new Color();
  constructor(root: Object3D) {
    const seen = new Set<MeshToonMaterial>();
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of list) {
        if (m instanceof MeshToonMaterial && !seen.has(m)) {
          seen.add(m);
          this.entries.push({ material: m, emissive: m.emissive.clone(), intensity: m.emissiveIntensity });
        }
      }
    });
  }
  apply(flash: Color | null, amount: number): void {
    for (const e of this.entries) {
      if (flash && amount > 0) {
        this.tmp.copy(e.emissive).multiplyScalar(e.intensity).lerp(flash, Math.min(1, amount));
        e.material.emissive.copy(this.tmp);
        e.material.emissiveIntensity = 1;
      } else {
        e.material.emissive.copy(e.emissive);
        e.material.emissiveIntensity = e.intensity;
      }
    }
  }
  dispose(): void {
    for (const e of this.entries) e.material.dispose();
  }
}

export function groundRing(radius: number, c: Color, thickness: number, opacity = 1, segments = 0): Mesh<PlaneGeometry> {
  const geo = new PlaneGeometry(radius * 2, radius * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = ringMaterial({ color: c, inner: 1 - thickness / radius, outer: 1, opacity, segments, gap: 0.35 });
  mat.depthTest = false;
  const mesh = new Mesh(geo, mat);
  mesh.renderOrder = 30;
  mesh.position.y = GROUND;
  return mesh;
}

function blobShadow(spot: Texture, size: number, opacity: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const geo = new PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const mat = new MeshBasicMaterial({ map: spot, color: new Color('#0a1035'), transparent: true, opacity, depthWrite: false });
  const mesh = new Mesh(geo, mat);
  mesh.position.y = 0.006;
  mesh.renderOrder = 1;
  return mesh;
}

const HIT = new Color('#ff2d55');
const GRACE = new Color('#ffffff');

export class BodyView {
  readonly root = new Group();
  private readonly model: Object3D;
  private readonly tint: Tint;
  private readonly ring: Mesh<PlaneGeometry>;
  private readonly shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly torso?: Object3D;
  private readonly head?: Object3D;
  private readonly scarf?: Object3D;
  private readonly tail?: Object3D;
  private yaw = 0;
  private lean = 0;
  private stretch = 0;
  private fall = 0;
  private vanish = 0;
  private flash = 0;
  private lastMode: BodyState['mode'] = 'ready';
  private squashKick = 0;
  /** Interpolated simulation position from the latest frame. */
  pos: Vec2 = { x: 0, y: 0 };

  constructor(lib: ModelLibrary, spot: Texture) {
    this.root.name = 'body_view';
    this.model = lib.instance('courier_body', true);
    this.tint = new Tint(this.model);
    this.torso = findPart(this.model, 'courier_body', 'body');
    this.head = findPart(this.model, 'courier_body', 'head');
    this.scarf = findPart(this.model, 'courier_body', 'scarf');
    this.tail = findPart(this.model, 'courier_body', 'scarf_tail');
    this.shadow = blobShadow(spot, 0.85, 0.45);
    this.ring = groundRing(TUNING.bodyRadius, color('ivory'), 0.05, 0.95);
    this.root.add(this.shadow, this.model, this.ring);
  }

  hit(): void {
    this.flash = 1;
  }

  update(state: SimState, alpha: number, dt: number, time: number, reducedMotion: boolean): void {
    const b = state.body;
    this.pos = lerpVec(b.prevPos, b.pos, alpha);
    this.root.position.set(this.pos.x, 0, -this.pos.y);

    if (b.mode !== this.lastMode) {
      if (b.mode === 'recover') this.squashKick = 1;
      this.lastMode = b.mode;
    }
    const target = yawForFacing(b.facing);
    this.yaw = approachAngle(this.yaw, target, b.mode === 'dash' ? 40 : 14, dt);
    this.model.rotation.y = this.yaw;

    const dashing = b.mode === 'dash';
    const returning = b.mode === 'return';
    this.lean = approach(this.lean, dashing ? 0.55 : returning ? 0.25 : 0, dashing ? 30 : 10, dt);
    this.stretch = approach(this.stretch, dashing ? 1 : 0, dashing ? 40 : 12, dt);
    this.squashKick = Math.max(0, this.squashKick - dt * 5);
    const squash = reducedMotion ? 0 : Math.sin(this.squashKick * Math.PI) * 0.12;
    const s = this.stretch * 0.22;
    this.model.scale.set((1 - s * 0.4 + squash) * ACTOR_SCALE, (1 - s * 0.25 - squash) * ACTOR_SCALE, (1 + s) * ACTOR_SCALE);
    if (this.torso) this.torso.rotation.x = this.lean;
    if (this.head) {
      this.head.rotation.x = this.lean * 0.6;
      this.head.position.z = this.lean * 0.12;
    }
    const bob = reducedMotion || b.mode !== 'ready' ? 0 : Math.sin(time * 2.6) * 0.012;
    this.model.position.y = bob;
    if (this.scarf) this.scarf.position.z = this.lean * 0.1;
    if (this.tail) {
      const sway = reducedMotion ? 0 : Math.sin(time * 3.1) * 0.12;
      this.tail.rotation.x = approach(this.tail.rotation.x, dashing ? -0.9 : returning ? -0.45 : -0.1 + sway, 18, dt);
      this.tail.rotation.y = reducedMotion ? 0 : Math.sin(time * 2.2) * 0.15;
    }

    // Defeat: fall and sink. Victory: dissolve into the gate light.
    this.fall = approach(this.fall, b.mode === 'dead' ? 1 : 0, 6, dt);
    this.model.rotation.z = this.fall * 1.35;
    this.vanish = approach(this.vanish, b.mode === 'exited' ? 1 : 0, 5, dt);
    const scale = 1 - this.vanish;
    this.root.scale.setScalar(Math.max(0.001, scale));
    this.ring.visible = b.mode !== 'dead' && b.mode !== 'exited';

    // Hit flash beats grace blink; grace blink is gentle and slow.
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.flash > 0) this.tint.apply(HIT, this.flash);
    else if (state.graceLeft > 0) this.tint.apply(GRACE, (0.5 + 0.5 * Math.sin(time * 18)) * 0.45);
    else this.tint.apply(null, 0);
    setUniform(this.ring.material as never, 'uOpacity', state.graceLeft > 0 ? 0.6 + 0.4 * Math.sin(time * 18) : 0.95);
  }

  dispose(): void {
    this.tint.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as { dispose(): void }).dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.root.removeFromParent();
  }
}

export class SoulView {
  readonly root = new Group();
  private readonly model: Object3D;
  private readonly tint: Tint;
  private readonly ring: Mesh<PlaneGeometry>;
  private readonly shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly glow: Sprite;
  private readonly mask?: Object3D;
  private readonly wisp?: Object3D;
  private yaw = 0;
  /** 0 = merged with the body (reunited), 1 = separated and following. */
  private apart = 0;
  private flash = 0;
  private pulse = 0;
  pos: Vec2 = { x: 0, y: 0 };

  constructor(lib: ModelLibrary, spot: Texture) {
    this.root.name = 'soul_view';
    this.model = lib.instance('soul_mask', true);
    this.tint = new Tint(this.model);
    this.mask = findPart(this.model, 'soul_mask', 'mask');
    this.wisp = findPart(this.model, 'soul_mask', 'wisp');
    this.shadow = blobShadow(spot, 0.6, 0.22);
    this.ring = groundRing(TUNING.soulRadius, color('soul_glow'), 0.05, 0.95, 12);
    const glowMat = new SpriteMaterial({
      map: spot,
      color: color('soul_glow'),
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.glow = new Sprite(glowMat);
    this.glow.scale.set(0.75, 0.75, 1);
    this.glow.renderOrder = 25;
    this.root.add(this.shadow, this.glow, this.model, this.ring);
  }

  hit(): void {
    this.flash = 1;
  }

  separatedPulse(): void {
    this.pulse = 1;
  }

  update(state: SimState, alpha: number, dt: number, time: number, reducedMotion: boolean, bodyPos: Vec2): void {
    const s = state.soul;
    const separated = state.route.points.length > 1;
    this.pos = separated ? lerpVec(s.prevPos, s.pos, alpha) : bodyPos;
    this.root.position.set(this.pos.x, 0, -this.pos.y);
    this.apart = approach(this.apart, separated ? 1 : 0, separated ? 10 : 7, dt);

    // Face along the route toward the body when following.
    const pts = state.route.points;
    let face: Vec2 = state.body.facing;
    if (separated && pts.length > 1) {
      const a = pts[0]!;
      const b = pts[1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy > 1e-8) face = { x: dx, y: dy };
    }
    this.yaw = approachAngle(this.yaw, yawForFacing(face), 8, dt);
    this.model.rotation.y = this.yaw;

    const float = reducedMotion ? 0 : Math.sin(time * 1.9 + 0.7) * 0.035;
    // Merged: a small mask riding just behind and above the courier's head.
    const k = this.apart;
    const scale = (0.5 + 0.5 * k) * SOUL_SCALE;
    this.model.scale.setScalar(scale);
    this.model.position.set(0, (1 - k) * 0.5 + float, (1 - k) * -0.12);
    if (this.wisp) this.wisp.rotation.z = reducedMotion ? 0 : Math.sin(time * 2.7) * 0.18;
    if (this.mask) this.mask.rotation.z = reducedMotion ? 0 : Math.sin(time * 1.3) * 0.06;
    this.glow.position.set(0, (0.55 * scale + (1 - k) * 0.5) + float, 0);
    this.pulse = Math.max(0, this.pulse - dt * 2.5);
    const glowSize = 0.6 + 0.45 * k + this.pulse * 0.7;
    this.glow.scale.set(glowSize, glowSize, 1);
    this.ring.visible = k > 0.5 && state.body.mode !== 'dead';
    this.shadow.visible = k > 0.3;
    this.shadow.material.opacity = 0.22 * k;

    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.flash > 0) this.tint.apply(HIT, this.flash);
    else if (state.graceLeft > 0) this.tint.apply(GRACE, (0.5 + 0.5 * Math.sin(time * 18)) * 0.4);
    else this.tint.apply(null, 0);

    // Defeat: the soul fades; victory: it rides into the gate with the body.
    const fading = state.outcome === 'defeat' ? 1 : 0;
    (this.glow.material as SpriteMaterial).opacity = (0.55 + this.pulse * 0.35) * (1 - fading * 0.8);
  }

  dispose(): void {
    this.tint.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as { dispose(): void }).dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    (this.glow.material as SpriteMaterial).dispose();
    this.root.removeFromParent();
  }
}

export class SentryView {
  readonly root = new Group();
  readonly id: number;
  private readonly model: Object3D;
  private readonly head?: Object3D;
  private readonly muzzle?: Object3D;
  private readonly eyeMaterials: MeshToonMaterial[] = [];
  private readonly ring: Mesh<PlaneGeometry>;
  private readonly shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly charge: Sprite;
  private headYaw: number;
  private droop = 0;
  private readonly role: EnemyState['role'];
  private readonly tmp = new Vector3();

  constructor(lib: ModelLibrary, spot: Texture, enemy: EnemyState) {
    this.id = enemy.id;
    this.role = enemy.role;
    const modelId = enemy.role === 'keeper' ? 'keeper' : 'needler';
    this.root.name = `sentry_view:${enemy.key}`;
    this.model = lib.instance(modelId, true);
    this.head = findPart(this.model, modelId, 'head');
    this.muzzle = findPart(this.model, modelId, 'muzzle');
    this.model.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of list) if (m instanceof MeshToonMaterial && (m.name === 'eye' || node.name.endsWith('_eye'))) this.eyeMaterials.push(m);
    });
    this.model.rotation.y = yawForFacing(enemy.facing);
    this.model.scale.setScalar(ACTOR_SCALE);
    this.headYaw = yawForFacing(enemy.aim);
    this.shadow = blobShadow(spot, 1.0, 0.4);
    this.ring = groundRing(enemy.radius, color('gold'), 0.035, 0.55, 16);
    const chargeMat = new SpriteMaterial({
      map: spot,
      color: color('warning_amber'),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.charge = new Sprite(chargeMat);
    this.charge.renderOrder = 26;
    this.root.add(this.shadow, this.model, this.ring, this.charge);
    this.root.position.set(enemy.pos.x, 0, -enemy.pos.y);
  }

  update(enemy: EnemyState, dt: number, time: number, reducedMotion: boolean): void {
    const alive = enemy.phase !== 'dead';
    this.root.visible = alive;
    if (!alive) return;
    const baseYaw = this.model.rotation.y;
    const aimYaw = yawForFacing(enemy.aim);
    // Locked aim is drawn exactly; tracking eases so the head reads as "following".
    this.headYaw = enemy.phase === 'locked' ? aimYaw : approachAngle(this.headYaw, aimYaw, 12, dt);
    if (this.head) this.head.rotation.y = this.headYaw - baseYaw;
    this.droop = approach(this.droop, enemy.phase === 'dormant' ? 1 : 0, 4, dt);
    if (this.head) {
      this.head.rotation.x = this.droop * 0.45;
      if (this.role === 'keeper' && !reducedMotion) this.head.rotation.z = Math.sin(time * 1.7 + this.id) * 0.06 * (1 - this.droop);
    }

    let glow = 0.15;
    if (enemy.phase === 'dormant') glow = 0.02;
    else if (enemy.phase === 'tracking') glow = 0.7 + (reducedMotion ? 0 : 0.35 * Math.sin(time * 16));
    else if (enemy.phase === 'locked') glow = 2.2;
    else if (enemy.phase === 'recover') glow = 0.35;
    for (const m of this.eyeMaterials) m.emissiveIntensity = glow;

    // Muzzle glow works for any model (GLBs carry no special eye material): a soft amber
    // flicker while tracking, a steadily growing charge once the line is locked.
    const progress = enemy.phase === 'locked' && enemy.phaseDuration > 0 ? Math.min(1, enemy.phaseTime / enemy.phaseDuration) : 0;
    const chargeMat = this.charge.material as SpriteMaterial;
    const tracking = enemy.phase === 'tracking';
    if ((enemy.phase === 'locked' || tracking) && this.muzzle) {
      this.root.updateMatrixWorld(true);
      this.muzzle.getWorldPosition(this.tmp);
      this.root.worldToLocal(this.tmp);
      this.charge.position.copy(this.tmp);
      const size = tracking ? 0.26 + (reducedMotion ? 0 : 0.05 * Math.sin(time * 16)) : 0.3 + progress * 0.5;
      this.charge.scale.set(size, size, 1);
      chargeMat.opacity = tracking ? 0.45 : 0.5 + progress * 0.5;
    } else {
      chargeMat.opacity = 0;
    }
  }

  /** World position of the muzzle socket (for fire flashes). */
  muzzleWorld(target: Vector3): Vector3 {
    if (this.muzzle) return this.muzzle.getWorldPosition(target);
    return target.set(this.root.position.x, 0.7, this.root.position.z);
  }

  dispose(): void {
    this.model.traverse((node) => {
      if (node instanceof Mesh) (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => m.dispose());
    });
    this.ring.geometry.dispose();
    (this.ring.material as { dispose(): void }).dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    (this.charge.material as SpriteMaterial).dispose();
    this.root.removeFromParent();
  }
}

export class GateView {
  readonly root = new Group();
  private readonly doorL?: Object3D;
  private readonly doorR?: Object3D;
  private readonly shaft: Sprite;
  private open = 0;
  private ready = 0;
  private flare = 0;

  constructor(lib: ModelLibrary, spot: Texture, anchor: Vec2, private readonly exitGlow: Mesh<PlaneGeometry, MeshBasicMaterial>) {
    this.root.name = 'gate_view';
    const model = lib.instance('exit_gate');
    this.doorL = findPart(model, 'exit_gate', 'door_left');
    this.doorR = findPart(model, 'exit_gate', 'door_right');
    const shaftMat = new SpriteMaterial({
      map: spot,
      color: color('gold'),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.shaft = new Sprite(shaftMat);
    this.shaft.position.set(0, 0.8, -0.1);
    this.shaft.scale.set(2.4, 2.4, 1);
    this.shaft.renderOrder = 5;
    this.root.add(model, this.shaft);
    this.root.position.set(anchor.x, 0, -anchor.y);
  }

  victory(): void {
    this.flare = 1;
  }

  update(status: GateStatus, dt: number, time: number, reducedMotion: boolean): void {
    this.open = approach(this.open, status === 'open' ? 1 : 0, 4, dt);
    this.ready = approach(this.ready, status === 'sealed' ? 0 : 1, 3, dt);
    const ajar = this.ready * 0.1;
    const angle = Math.max(ajar, this.open * 1.45);
    if (this.doorL) this.doorL.rotation.y = angle;
    if (this.doorR) this.doorR.rotation.y = -angle;
    const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 3.2);
    this.flare = Math.max(0, this.flare - dt * 1.2);
    const shaftOpacity = this.open * 0.75 + this.ready * (1 - this.open) * 0.18 * (0.6 + 0.4 * pulse) + this.flare;
    (this.shaft.material as SpriteMaterial).opacity = Math.min(1, shaftOpacity);
    const shaftSize = 2.2 + this.open * 0.8 + this.flare * 3;
    this.shaft.scale.set(shaftSize, shaftSize * 1.15, 1);
    this.exitGlow.material.opacity = 0.08 + this.ready * (1 - this.open) * (0.25 + 0.25 * pulse) + this.open * 0.85;
  }

  dispose(): void {
    (this.shaft.material as SpriteMaterial).dispose();
    this.root.removeFromParent();
  }
}
