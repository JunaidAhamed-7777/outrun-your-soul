/**
 * Pooled, short-lived feedback effects driven only by simulation events. Each one answers
 * a gameplay question: did my dash connect, was that a cut, who got hit, did we reunite?
 * Decorative randomness here uses its own generator, never the rules RNG.
 */
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Sprite,
  SpriteMaterial,
  TetrahedronGeometry,
  Vector3,
  type ShaderMaterial,
  type Texture,
} from 'three';
import type { Vec2 } from '../sim/vec';
import { color } from './palette';
import { faceted } from './placeholders';
import { ringMaterial, setUniform, streakMaterial } from './shaders';
import { StripMesh } from './stripMesh';

interface RingFx {
  mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  life: number;
  duration: number;
  from: number;
  to: number;
  opacity: number;
}

interface SpriteFx {
  sprite: Sprite;
  life: number;
  duration: number;
  from: number;
  to: number;
  opacity: number;
}

interface Shard {
  pos: Vector3;
  vel: Vector3;
  axis: Vector3;
  spin: number;
  angle: number;
  size: number;
  life: number;
  duration: number;
  color: Color;
}

interface StreakFx {
  strip: StripMesh<ShaderMaterial>;
  from: Vec2;
  to: Vec2;
  grow: number;
  life: number;
  duration: number;
}

const MAX_SHARDS = 120;

function decorRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class EffectSystem {
  readonly group = new Group();
  private readonly rings: RingFx[] = [];
  private readonly sprites: SpriteFx[] = [];
  private readonly shards: Shard[] = [];
  private readonly streaks: StreakFx[] = [];
  private readonly shardMesh: InstancedMesh;
  private readonly rand = decorRng(0xfeed);
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly ringGeo: PlaneGeometry;
  private shake = 0;
  private readonly shakeOffset = new Vector3();
  reducedMotion = false;

  constructor(
    private readonly spot: Texture,
    private readonly star: Texture,
  ) {
    this.ringGeo = new PlaneGeometry(2, 2);
    this.ringGeo.rotateX(-Math.PI / 2);
    const shardGeo = faceted(new TetrahedronGeometry(1, 0));
    const shardMat = new MeshBasicMaterial({ color: '#ffffff' });
    this.shardMesh = new InstancedMesh(shardGeo, shardMat, MAX_SHARDS);
    this.shardMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shardMesh.count = 0;
    this.shardMesh.frustumCulled = false;
    this.shardMesh.renderOrder = 45;
    this.shardMesh.setColorAt(0, new Color('#ffffff'));
    this.group.add(this.shardMesh);
  }

  // --- primitives -----------------------------------------------------------

  ring(at: Vec2, c: Color, from: number, to: number, duration: number, opts: { thickness?: number; opacity?: number; height?: number; segments?: number } = {}): void {
    let fx = this.rings.find((r) => r.life >= r.duration);
    if (!fx) {
      if (this.rings.length >= 16) return;
      const mesh = new Mesh(this.ringGeo, ringMaterial({ color: c, inner: 0.8, outer: 1 }));
      mesh.material.depthTest = false;
      mesh.renderOrder = 44;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      fx = { mesh, life: 0, duration, from, to, opacity: 1 };
      this.rings.push(fx);
    }
    const mat = fx.mesh.material;
    (mat.uniforms.uColor!.value as Color).copy(c);
    setUniform(mat, 'uInner', 1 - (opts.thickness ?? 0.18));
    setUniform(mat, 'uSegments', opts.segments ?? 0);
    fx.mesh.position.set(at.x, opts.height ?? 0.05, -at.y);
    fx.life = 0;
    fx.duration = duration;
    fx.from = from;
    fx.to = to;
    fx.opacity = opts.opacity ?? 1;
    fx.mesh.visible = true;
  }

  private sprite(at: Vec2, height: number, c: Color, map: Texture, from: number, to: number, duration: number, opacity = 1): void {
    let fx = this.sprites.find((s) => s.life >= s.duration);
    if (!fx) {
      if (this.sprites.length >= 16) return;
      const sprite = new Sprite(new SpriteMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, depthTest: false }));
      sprite.renderOrder = 46;
      this.group.add(sprite);
      fx = { sprite, life: 0, duration, from, to, opacity };
      this.sprites.push(fx);
    }
    const mat = fx.sprite.material;
    mat.map = map;
    mat.color.copy(c);
    mat.needsUpdate = true;
    fx.sprite.position.set(at.x, height, -at.y);
    fx.sprite.material.rotation = this.rand() * Math.PI;
    fx.life = 0;
    fx.duration = duration;
    fx.from = from;
    fx.to = to;
    fx.opacity = opacity;
    fx.sprite.visible = true;
  }

  burst(at: Vec2, height: number, c: Color, count: number, speed: number, size: number, duration = 0.55): void {
    const n = this.reducedMotion ? Math.ceil(count / 3) : count;
    for (let i = 0; i < n; i++) {
      if (this.shards.length >= MAX_SHARDS) this.shards.shift();
      const a = this.rand() * Math.PI * 2;
      const up = 0.4 + this.rand() * 0.9;
      const sp = speed * (0.5 + this.rand() * 0.7);
      const shard: Shard = {
        pos: new Vector3(at.x, height, -at.y),
        vel: new Vector3(Math.cos(a) * sp, up * speed, -Math.sin(a) * sp),
        axis: new Vector3(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).normalize(),
        spin: (this.rand() - 0.5) * 18,
        angle: this.rand() * 6,
        size: size * (0.6 + this.rand() * 0.6),
        life: 0,
        duration: duration * (0.7 + this.rand() * 0.5),
        color: c,
      };
      this.shards.push(shard);
    }
  }

  streak(from: Vec2, to: Vec2, c: Color, growSeconds: number): void {
    let fx = this.streaks.find((s) => s.life >= s.duration);
    if (!fx) {
      if (this.streaks.length >= 4) return;
      const strip = new StripMesh(streakMaterial(c), 2, 30);
      strip.mesh.material.depthTest = false;
      this.group.add(strip.mesh);
      fx = { strip, from, to, grow: growSeconds, life: 0, duration: growSeconds + 0.28 };
      this.streaks.push(fx);
    }
    (fx.strip.mesh.material.uniforms.uColor!.value as Color).copy(c);
    fx.from = from;
    fx.to = to;
    fx.grow = Math.max(0.02, growSeconds);
    fx.life = 0;
    fx.duration = fx.grow + 0.28;
  }

  addShake(amount: number): void {
    if (!this.reducedMotion) this.shake = Math.min(0.25, this.shake + amount);
  }

  /** Current camera offset from shake (zero in reduced motion). */
  get cameraOffset(): Vector3 {
    return this.shakeOffset;
  }

  // --- semantic effects --------------------------------------------------------

  dash(from: Vec2, to: Vec2, seconds: number): void {
    this.streak(from, to, color('ivory'), seconds);
    this.sprite(from, 0.12, new Color('#c9c0e6'), this.spot, 0.3, 0.9, 0.35, 0.5);
  }

  cut(at: Vec2): void {
    this.sprite(at, 0.34, color('bolt_core'), this.star, 0.3, 1.25, 0.28, 1);
    this.sprite(at, 0.34, color('bolt_edge'), this.spot, 0.2, 0.9, 0.3, 0.8);
    this.burst(at, 0.34, color('bolt_core'), 7, 2.6, 0.045, 0.35);
    this.burst(at, 0.34, color('bolt_edge'), 5, 2.2, 0.04, 0.35);
    this.ring(at, color('bolt_edge'), 0.1, 0.6, 0.25, { thickness: 0.3 });
  }

  kill(at: Vec2): void {
    this.burst(at, 0.55, color('ivory'), 14, 2.4, 0.07, 0.6);
    this.burst(at, 0.5, color('gold'), 10, 2.0, 0.06, 0.6);
    this.ring(at, color('gold'), 0.3, 1.25, 0.45, { thickness: 0.22 });
    this.sprite(at, 0.5, color('gold'), this.star, 0.4, 1.6, 0.3, 1);
    this.addShake(0.05);
  }

  hit(at: Vec2): void {
    this.ring(at, color('hit_red'), 0.25, 1.1, 0.4, { thickness: 0.3 });
    this.burst(at, 0.4, color('hit_red'), 8, 2.0, 0.05, 0.45);
    this.sprite(at, 0.4, color('hit_red'), this.spot, 0.4, 1.4, 0.3, 0.9);
    this.addShake(0.16);
  }

  shielded(at: Vec2, reason: 'grace' | 'dash' | 'spent'): void {
    if (reason === 'spent') return;
    this.ring(at, reason === 'dash' ? color('ivory') : new Color('#ffffff'), 0.25, 0.65, 0.25, { thickness: 0.25, opacity: 0.8, segments: 6 });
  }

  reunion(at: Vec2, contact: boolean): void {
    this.ring(at, color('gold'), 0.2, contact ? 1.3 : 0.95, contact ? 0.55 : 0.45, { thickness: 0.2 });
    this.sprite(at, 0.6, color('soul_glow'), this.spot, 0.6, 1.4, 0.45, 0.9);
    if (contact) {
      this.burst(at, 0.6, color('gold'), 8, 1.4, 0.04, 0.5);
      this.sprite(at, 0.6, color('gold'), this.star, 0.4, 1.3, 0.3, 0.9);
    }
  }

  alert(at: Vec2, radius: number): void {
    this.ring(at, color('warning_amber'), radius * 0.8, radius * 2.1, 0.4, { thickness: 0.2 });
  }

  muzzle(at: Vec2, height: number): void {
    this.sprite(at, height, color('bolt_edge'), this.star, 0.25, 0.8, 0.18, 1);
  }

  fizzle(at: Vec2): void {
    this.sprite(at, 0.34, color('bolt_edge'), this.spot, 0.2, 0.6, 0.22, 0.7);
    this.burst(at, 0.34, color('bolt_edge'), 3, 1.2, 0.03, 0.25);
  }

  /** Warden shield deflection: dull ivory clang, no damage colours. */
  clang(at: Vec2): void {
    this.sprite(at, 0.5, new Color('#e8e2d4'), this.star, 0.25, 0.9, 0.2, 0.9);
    this.burst(at, 0.5, new Color('#9ea3b8'), 6, 1.8, 0.035, 0.35);
    this.ring(at, color('ivory'), 0.2, 0.7, 0.22, { thickness: 0.3, segments: 8 });
  }

  /** Mourning Bell burst: the ring settles on the TRUE burst radius. */
  bellBurst(at: Vec2, radius: number): void {
    this.ring(at, color('gold'), radius * 0.25, radius, 0.55, { thickness: 0.08 });
    this.ring(at, new Color('#fff1c8'), radius * 0.9, radius, 0.7, { thickness: 0.04, opacity: 0.9 });
    this.sprite(at, 0.4, color('gold'), this.star, 0.6, 2.2, 0.35, 1);
    this.burst(at, 0.5, color('gold'), 14, 2.4, 0.05, 0.6);
    this.addShake(0.08);
  }

  sparkle(at: Vec2, c: Color, size = 0.6): void {
    this.sprite(at, 0.45, c, this.star, size * 0.3, size, 0.3, 0.9);
  }

  invalid(at: Vec2): void {
    this.ring(at, new Color('#8b90a8'), 0.35, 0.55, 0.25, { thickness: 0.25, opacity: 0.9, segments: 8 });
  }

  gate(at: Vec2): void {
    this.ring(at, color('gold'), 0.4, 2.0, 0.6, { thickness: 0.12 });
    this.burst(at, 0.4, color('gold'), 10, 1.6, 0.05, 0.6);
  }

  // --- per frame ----------------------------------------------------------------

  update(dt: number, bodyPos: Vec2): void {
    for (const fx of this.rings) {
      if (fx.life >= fx.duration) continue;
      fx.life += dt;
      const t = Math.min(1, fx.life / fx.duration);
      const e = 1 - (1 - t) * (1 - t);
      const r = fx.from + (fx.to - fx.from) * e;
      fx.mesh.scale.setScalar(r);
      setUniform(fx.mesh.material, 'uOpacity', fx.opacity * (1 - t));
      fx.mesh.visible = fx.life < fx.duration;
    }
    for (const fx of this.sprites) {
      if (fx.life >= fx.duration) continue;
      fx.life += dt;
      const t = Math.min(1, fx.life / fx.duration);
      const r = fx.from + (fx.to - fx.from) * (1 - (1 - t) * (1 - t));
      fx.sprite.scale.set(r, r, 1);
      fx.sprite.material.opacity = fx.opacity * (1 - t);
      fx.sprite.visible = fx.life < fx.duration;
    }
    for (const fx of this.streaks) {
      if (fx.life >= fx.duration) {
        fx.strip.hide();
        continue;
      }
      fx.life += dt;
      const g = Math.min(1, fx.life / fx.grow);
      const head = { x: fx.from.x + (fx.to.x - fx.from.x) * g, y: fx.from.y + (fx.to.y - fx.from.y) * g };
      const len = Math.hypot(head.x - fx.from.x, head.y - fx.from.y);
      const fade = fx.life <= fx.grow ? 1 : 1 - (fx.life - fx.grow) / (fx.duration - fx.grow);
      setUniform(fx.strip.mesh.material, 'uLength', Math.max(0.01, len));
      setUniform(fx.strip.mesh.material, 'uOpacity', 0.75 * Math.max(0, fade));
      fx.strip.set([fx.from, head], 0.17, 0.06);
    }

    let alive = 0;
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i]!;
      s.life += dt;
      if (s.life >= s.duration) continue;
      s.vel.y -= 7.5 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < 0.02) {
        s.pos.y = 0.02;
        s.vel.multiplyScalar(0.4);
        s.vel.y = Math.abs(s.vel.y) * 0.3;
      }
      s.angle += s.spin * dt;
      const k = 1 - s.life / s.duration;
      this.q.setFromAxisAngle(s.axis, s.angle);
      this.s.setScalar(s.size * (0.4 + 0.6 * k));
      this.m.compose(s.pos, this.q, this.s);
      this.shards[alive] = s;
      this.shardMesh.setColorAt(alive, s.color);
      this.shardMesh.setMatrixAt(alive, this.m);
      alive++;
    }
    this.shards.length = alive;
    this.shardMesh.count = alive;
    this.shardMesh.instanceMatrix.needsUpdate = true;
    if (this.shardMesh.instanceColor) this.shardMesh.instanceColor.needsUpdate = true;

    this.shake = Math.max(0, this.shake - dt * 1.4);
    if (this.shake > 0 && !this.reducedMotion) {
      const a = this.shake * this.shake * 4;
      this.shakeOffset.set((this.rand() - 0.5) * a, 0, (this.rand() - 0.5) * a);
    } else {
      this.shakeOffset.set(0, 0, 0);
    }
    void bodyPos;
  }

  clear(): void {
    for (const fx of this.rings) {
      fx.life = fx.duration;
      fx.mesh.visible = false;
    }
    for (const fx of this.sprites) {
      fx.life = fx.duration;
      fx.sprite.visible = false;
    }
    for (const fx of this.streaks) {
      fx.life = fx.duration;
      fx.strip.hide();
    }
    this.shards.length = 0;
    this.shardMesh.count = 0;
    this.shake = 0;
  }

  dispose(): void {
    for (const fx of this.rings) fx.mesh.material.dispose();
    for (const fx of this.sprites) fx.sprite.material.dispose();
    for (const fx of this.streaks) fx.strip.dispose();
    this.ringGeo.dispose();
    this.shardMesh.geometry.dispose();
    (this.shardMesh.material as MeshBasicMaterial).dispose();
    this.group.removeFromParent();
  }
}
