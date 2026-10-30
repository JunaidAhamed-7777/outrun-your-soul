/**
 * Last Warden boss placeholder: it mirrors the player. A large gilded armoured body, a slower
 * glowing heart that follows the body's route, and its own vermilion-gold ribbon between them.
 * Optional and defensive: drawn only when `state.boss` exists (see simext.bossView); boss parts
 * that arrive as enemies ('last_warden_body' / 'last_warden_heart') are drawn by the renderer's
 * enemy views (WardenView for the body, HeartView for the heart).
 */
import {
  AdditiveBlending,
  Color,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshToonMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  type Object3D,
  type ShaderMaterial,
  type Texture,
} from 'three';
import type { SimState } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { ACTOR_SCALE, groundRing, lerpVec } from './actors';
import type { ModelLibrary } from './assets';
import { yawForFacing } from './contract';
import { toonGradient } from './materials';
import { color } from './palette';
import { faceted } from './placeholders';
import { ribbonMaterial, setUniform } from './shaders';
import { bossView } from './simext';
import { StripMesh } from './stripMesh';

export const BOSS_SCALE = 1.6;

/** The boss heart: a floating vermilion-gold orb with a halo and a ground ring. */
export class HeartView {
  readonly root = new Group();
  private readonly orb: Mesh<IcosahedronGeometry, MeshToonMaterial>;
  private readonly glow: Sprite;
  private readonly ring: Mesh<PlaneGeometry>;

  constructor(spot: Texture, radius: number) {
    const mat = new MeshToonMaterial({ color: color('vermilion'), gradientMap: toonGradient(), emissive: color('gold'), emissiveIntensity: 0.6 });
    this.orb = new Mesh(faceted(new IcosahedronGeometry(0.2, 0)) as unknown as IcosahedronGeometry, mat);
    this.glow = new Sprite(
      new SpriteMaterial({ map: spot, color: new Color('#ff9a4a'), transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }),
    );
    this.glow.renderOrder = -1;
    this.ring = groundRing(radius, color('vermilion'), 0.05, 0.9, 10);
    this.root.add(this.glow, this.orb, this.ring);
  }

  update(pos: Vec2, time: number, reducedMotion: boolean): void {
    this.root.position.set(pos.x, 0, -pos.y);
    const beat = reducedMotion ? 1 : 1 + 0.12 * Math.max(0, Math.sin(time * 5.5));
    this.orb.position.y = 0.6 + (reducedMotion ? 0 : Math.sin(time * 2) * 0.05);
    this.orb.scale.setScalar(ACTOR_SCALE * beat);
    this.orb.rotation.y += reducedMotion ? 0 : 0.02;
    this.glow.position.set(0, 0.42, -0.3);
    this.glow.scale.set(1.1 * beat, 1.1 * beat, 1);
  }

  dispose(): void {
    this.orb.geometry.dispose();
    this.orb.material.dispose();
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

/** Draws `state.boss` when the simulation provides it as a dedicated structure. */
export class BossLayer {
  readonly group = new Group();
  private body: Object3D | null = null;
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

  update(state: SimState, alpha: number, dt: number, reducedMotion: boolean): void {
    const boss = bossView(state);
    this.group.visible = !!boss;
    if (!boss) return;
    this.time += dt;
    const bodyPos = boss.body ? lerpVec(boss.body.prevPos, boss.body.pos, alpha) : null;
    const heartPos = boss.heart ? lerpVec(boss.heart.prevPos, boss.heart.pos, alpha) : null;
    if (bodyPos) {
      if (!this.body) {
        this.body = this.lib.instance('warden', true);
        this.body.scale.setScalar(ACTOR_SCALE * BOSS_SCALE);
        this.body.traverse((node) => {
          if (node instanceof Mesh && node.material instanceof MeshToonMaterial) node.material.color.lerp(color('gold'), 0.35);
        });
        this.group.add(this.body);
      }
      this.body.position.set(bodyPos.x, 0, -bodyPos.y);
      if (heartPos) this.body.rotation.y = yawForFacing({ x: bodyPos.x - heartPos.x, y: bodyPos.y - heartPos.y });
    }
    if (heartPos) {
      if (!this.heart) {
        this.heart = new HeartView(this.spot, 0.35);
        this.group.add(this.heart.root);
      }
      this.heart.update(heartPos, this.time, reducedMotion);
    }
    this.pts.length = 0;
    if (boss.route.length >= 2) {
      this.pts.push(...boss.route);
      if (heartPos) this.pts[0] = heartPos;
      if (bodyPos) this.pts[this.pts.length - 1] = bodyPos;
    } else if (heartPos && bodyPos) {
      this.pts.push(heartPos, bodyPos);
    }
    setUniform(this.ribbon.mesh.material, 'uTime', reducedMotion ? 0 : this.time);
    this.ribbon.set(this.pts, 0.085, 0.034);
  }

  dispose(): void {
    this.heart?.dispose();
    this.body?.traverse((node) => {
      if (node instanceof Mesh) (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => m.dispose());
    });
    this.ribbon.dispose();
    this.group.removeFromParent();
  }
}
