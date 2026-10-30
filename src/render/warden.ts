/**
 * Warden presentation: frontal guard arc (faint ivory wedge on the ground), sweep telegraph
 * (amber sector whose fill grows until it fires), and an exposed state (shield drops, core
 * glows gold). Also used, scaled up and gilded, for the Last Warden boss body placeholder.
 * Every value that has gameplay meaning (radii, angles, timing) comes from the simulation via
 * simext readers; this file only draws it.
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
import type { EnemyState } from '../sim/types';
import type { ModelLibrary } from './assets';
import { ACTOR_SCALE, approach, approachAngle, groundRing } from './actors';
import { yawForFacing } from './contract';
import { color } from './palette';
import { findPart } from './placeholders';
import { sectorMaterial, setUniform } from './shaders';
import { isExposed, wardenShape } from './simext';

function sector(c: Color, opts: { fillOpacity?: number; edgeOpacity?: number }, renderOrder: number): Mesh<PlaneGeometry, ShaderMaterial> {
  const geo = new PlaneGeometry(2, 2);
  geo.rotateX(-Math.PI / 2);
  const mat = sectorMaterial(c, opts);
  mat.depthTest = false;
  const mesh = new Mesh(geo, mat);
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  mesh.position.y = 0.02;
  return mesh;
}

/** Sector meshes are centred on local +X; rotate so +X points along simulation direction d. */
function aimSector(mesh: Object3D, dx: number, dy: number): void {
  mesh.rotation.y = Math.atan2(dy, dx);
}

export class WardenView {
  readonly root = new Group();
  readonly id: number;
  private readonly model: Object3D;
  private readonly body?: Object3D;
  private readonly shield?: Object3D;
  private readonly shieldRest: number;
  private readonly coreMaterials: MeshToonMaterial[] = [];
  private readonly guard: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly sweep: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly ring: Mesh<PlaneGeometry>;
  private readonly shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly coreGlow: Sprite;
  private exposed = 0;
  private flash = 0;
  private clang = 0;

  constructor(
    lib: ModelLibrary,
    spot: Texture,
    enemy: EnemyState,
    private readonly scale = 1,
  ) {
    this.id = enemy.id;
    this.root.name = `warden_view:${enemy.key}`;
    this.model = lib.instance('warden', true);
    this.body = findPart(this.model, 'warden', 'body');
    this.shield = findPart(this.model, 'warden', 'shield');
    this.shieldRest = this.shield?.rotation.x ?? 0;
    findPart(this.model, 'warden', 'core')?.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
        if (m instanceof MeshToonMaterial) {
          m.emissive.copy(color('gold'));
          m.emissiveIntensity = 0;
          this.coreMaterials.push(m);
        }
      }
    });
    this.model.scale.setScalar(ACTOR_SCALE * scale);
    if (this.body) this.body.rotation.y = yawForFacing(enemy.facing);

    const shadowGeo = new PlaneGeometry(1.3 * scale, 1.3 * scale);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadow = new Mesh(shadowGeo, new MeshBasicMaterial({ map: spot, color: new Color('#0a1035'), transparent: true, opacity: 0.45, depthWrite: false }));
    this.shadow.position.y = 0.006;
    this.shadow.renderOrder = 1;
    this.shadow.visible = false;
    this.ring = groundRing(enemy.radius, color('gold'), 0.04, 0.6, 20);
    this.guard = sector(color('ivory'), { fillOpacity: 0, edgeOpacity: 0.55 }, 24);
    setUniform(this.guard.material, 'uBaseOpacity', 0.1);
    this.sweep = sector(color('warning_amber'), { fillOpacity: 0.5, edgeOpacity: 0.95 }, 35);
    this.coreGlow = new Sprite(
      new SpriteMaterial({ map: spot, color: color('gold'), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    );
    this.coreGlow.renderOrder = 26;
    this.root.add(this.shadow, this.guard, this.model, this.ring, this.sweep, this.coreGlow);
    this.root.position.set(enemy.pos.x, 0, -enemy.pos.y);
  }

  /** 'guarded' event: a strike glanced off the shield. */
  guarded(): void {
    this.clang = 1;
  }

  /** 'sweep' event: the attack fired. */
  swept(): void {
    this.flash = 1;
  }

  update(enemy: EnemyState, dt: number, time: number, reducedMotion: boolean): void {
    const alive = enemy.phase !== 'dead';
    this.root.visible = alive;
    if (!alive) return;
    const shape = wardenShape(enemy);
    const exposedNow = isExposed(enemy);
    this.exposed = approach(this.exposed, exposedNow ? 1 : 0, exposedNow ? 10 : 6, dt);

    // warden_body turns to the guard facing (the sim may rotate it); the base stays put.
    if (this.body) this.body.rotation.y = approachAngle(this.body.rotation.y, yawForFacing(enemy.facing), 8, dt);

    // Shield drops forward around its lower hinge (~80 degrees) while exposed; a clang jolts it.
    this.clang = Math.max(0, this.clang - dt * 5);
    if (this.shield) {
      const jolt = reducedMotion ? 0 : Math.sin(this.clang * Math.PI * 3) * 0.08 * this.clang;
      this.shield.rotation.x = this.shieldRest + this.exposed * 1.4 - jolt;
    }
    const pulse = reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(time * 10);
    for (const m of this.coreMaterials) m.emissiveIntensity = this.exposed * 1.4 * pulse;
    const glow = this.coreGlow.material as SpriteMaterial;
    glow.opacity = this.exposed * 0.8 * pulse;
    this.coreGlow.visible = glow.opacity > 0.01;
    const g = 0.6 * this.scale + this.exposed * 0.5;
    this.coreGlow.scale.set(g, g, 1);
    this.coreGlow.position.set(0, 0.55 * this.scale * ACTOR_SCALE, 0);
    (this.ring.material as ShaderMaterial).uniforms.uOpacity!.value = 0.5 + this.exposed * 0.5;

    // Guard arc: the protected frontal wedge, faded out while the shield is down.
    const guardR = enemy.radius + 0.6 * this.scale;
    this.guard.scale.setScalar(guardR);
    aimSector(this.guard, enemy.facing.x, enemy.facing.y);
    setUniform(this.guard.material, 'uHalf', shape.guardHalf);
    setUniform(this.guard.material, 'uOpacity', 1 - this.exposed);

    // Sweep telegraph: outline while tracking, radial fill while locked, flash on fire.
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const tracking = enemy.phase === 'tracking';
    const locked = enemy.phase === 'locked';
    this.sweep.visible = tracking || locked || this.flash > 0;
    if (this.sweep.visible) {
      this.sweep.scale.setScalar(shape.sweepRadius);
      aimSector(this.sweep, enemy.aim.x, enemy.aim.y);
      setUniform(this.sweep.material, 'uHalf', shape.sweepHalf);
      const progress = locked && enemy.phaseDuration > 0 ? Math.min(1, enemy.phaseTime / enemy.phaseDuration) : 0;
      const flicker = tracking && !reducedMotion ? 0.7 + 0.3 * Math.sin(time * 22) : 1;
      setUniform(this.sweep.material, 'uFill', this.flash > 0 ? 1 : progress);
      setUniform(this.sweep.material, 'uFillOpacity', this.flash > 0 ? 0.75 * this.flash : 0.45);
      setUniform(this.sweep.material, 'uEdgeOpacity', (tracking ? 0.6 : 0.95) * flicker);
      setUniform(this.sweep.material, 'uOpacity', 1);
    }
  }

  dispose(): void {
    this.model.traverse((node) => {
      if (node instanceof Mesh) (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => m.dispose());
    });
    for (const m of [this.guard, this.sweep]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.ring.geometry.dispose();
    (this.ring.material as ShaderMaterial).dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    (this.coreGlow.material as SpriteMaterial).dispose();
    this.root.removeFromParent();
  }
}
