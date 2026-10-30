/**
 * Relic presentation. Each visual mirrors a rule the simulation owns:
 *  - Glass Lantern: soft ring around the soul at EXACTLY the sim halo radius (the ring's centre
 *    line is the speed boundary); bolts inside are tinted cool by BoltLayer.
 *  - Needlesong: speed streaks trailing the soul while its boost runs (ribbon flow brightens too).
 *  - Mourning Bell: charge pips above the body; the burst ring is spawned from the 'burst' event.
 *  - Traveler's Knot: a ghostly courier decoy at the placed point; an earned mark shows as a pip.
 */
import {
  BufferGeometry,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Object3D,
  type ShaderMaterial,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SimState } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import { ACTOR_SCALE } from './actors';
import type { ModelLibrary } from './assets';
import { color } from './palette';
import { ringMaterial, setUniform, streakMaterial } from './shaders';
import type { RelicView } from './simext';
import { StripMesh } from './stripMesh';

const HALO_BAND = 0.035;
const MAX_PIPS = 4;

function flat(size: number, material: ShaderMaterial, renderOrder: number): Mesh<PlaneGeometry, ShaderMaterial> {
  const geo = new PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  material.depthTest = false;
  const mesh = new Mesh(geo, material);
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  return mesh;
}

export class RelicLayer {
  readonly group = new Group();
  private readonly halo: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly streaks: StripMesh<ShaderMaterial>[];
  private readonly pips: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly knotPip: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private decoy: Object3D | null = null;
  private decoyFade = 0;
  private decoyAt: Vec2 | null = null;
  private time = 0;
  private haloRadius = 0;

  constructor(private readonly lib: ModelLibrary) {
    // Unit ring scaled to the halo radius every frame (radius may differ per relic tuning).
    this.halo = flat(2, ringMaterial({ color: color('soul_glow'), inner: 0.97, outer: 1, opacity: 0.85, segments: 24, gap: 0.25 }), 22);
    // Faint fill inside the ring (same quad, same draw call).
    setUniform(this.halo.material, 'uFill', 0.08);
    this.streaks = [0, 1, 2].map(() => {
      const s = new StripMesh(streakMaterial(new Color('#dff6ff')), 2, 27);
      s.mesh.material.depthTest = false;
      return s;
    });
    const pipGeo = new PlaneGeometry(0.11, 0.11);
    pipGeo.rotateX(-Math.PI / 2);
    pipGeo.rotateY(Math.PI / 4);
    for (let i = 0; i < MAX_PIPS; i++) {
      const pip = new Mesh(pipGeo, new MeshBasicMaterial({ color: color('gold'), transparent: true, depthTest: false, depthWrite: false }));
      pip.renderOrder = 43;
      this.pips.push(pip);
    }
    this.knotPip = new Mesh(pipGeo, new MeshBasicMaterial({ color: color('vermilion'), transparent: true, depthTest: false, depthWrite: false }));
    this.knotPip.renderOrder = 43;
    this.group.add(this.halo, ...this.streaks.map((s) => s.mesh), ...this.pips, this.knotPip);
  }

  /** Current halo radius in tiles (0 when no halo), for effects and tests. */
  get currentHaloRadius(): number {
    return this.haloRadius;
  }

  update(state: SimState, relics: RelicView, soulPos: Vec2, bodyPos: Vec2, dt: number, reducedMotion: boolean): void {
    this.time += dt;
    const separated = state.route.points.length > 1;

    // Glass Lantern halo: band centred on the exact radius.
    const r = relics.haloRadius;
    this.haloRadius = r ?? 0;
    this.halo.visible = r !== null;
    if (r !== null) {
      const outer = r + HALO_BAND;
      this.halo.scale.setScalar(outer);
      setUniform(this.halo.material, 'uInner', (r - HALO_BAND) / outer);
      setUniform(this.halo.material, 'uStart', reducedMotion ? 0 : this.time * 0.4);
      this.halo.position.set(soulPos.x, 0.03, -soulPos.y);
    }

    // Needlesong: three short streaks trailing the moving soul.
    const pts = state.route.points;
    const boosting = relics.boosting && separated && pts.length > 1;
    for (const s of this.streaks) s.hide();
    if (boosting) {
      const a = pts[0]!;
      const b = pts[1]!;
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const dx = (b.x - a.x) / l;
      const dy = (b.y - a.y) / l;
      this.streaks.forEach((s, i) => {
        const side = (i - 1) * 0.16;
        const jitter = reducedMotion ? 0 : 0.12 * Math.sin(this.time * 30 + i * 2);
        const len = 0.55 + jitter + (i === 1 ? 0.2 : 0);
        const head = { x: soulPos.x - dx * 0.18 - dy * side, y: soulPos.y - dy * 0.18 + dx * side };
        const tail = { x: head.x - dx * len, y: head.y - dy * len };
        setUniform(s.mesh.material, 'uLength', len);
        setUniform(s.mesh.material, 'uOpacity', 0.85);
        s.set([tail, head], 0.025, 0.32);
      });
    }

    // Mourning Bell pips: filled for earned charge, dim for missing, just in front of the body
    // (south, so the courier model never hides them).
    const max = Math.min(MAX_PIPS, Math.max(0, Math.round(relics.bellMax)));
    const showBell = relics.equipped.includes('mourning_bell') || relics.bellCharge > 0;
    this.pips.forEach((pip, i) => {
      pip.visible = showBell && i < max;
      if (!pip.visible) return;
      const x = bodyPos.x + (i - (max - 1) / 2) * 0.17;
      pip.position.set(x, 0.04, -(bodyPos.y - 0.46));
      const full = i < relics.bellCharge;
      pip.material.opacity = full ? 1 : 0.3;
      const ready = relics.bellCharge >= max && max > 0;
      pip.scale.setScalar(full && ready && !reducedMotion ? 1 + 0.2 * Math.sin(this.time * 8) : 1);
    });
    this.knotPip.visible = relics.knotReady;
    if (relics.knotReady) this.knotPip.position.set(bodyPos.x + (showBell ? (max / 2) * 0.17 + 0.14 : 0), 0.04, -(bodyPos.y - 0.46));

    // Traveler's Knot decoy: a ghost courier that fades in where it was placed.
    const decoy = relics.decoy;
    if (decoy) this.decoyAt = decoy;
    this.decoyFade = Math.max(0, Math.min(1, this.decoyFade + (decoy ? dt * 4 : -dt * 3)));
    if (this.decoyFade > 0 && this.decoyAt) {
      if (!this.decoy) this.decoy = this.makeGhost();
      this.decoy.visible = true;
      const bob = reducedMotion ? 0 : Math.sin(this.time * 3) * 0.03;
      this.decoy.position.set(this.decoyAt.x, bob, -this.decoyAt.y);
      this.decoy.traverse((node) => {
        if (node instanceof Mesh && node.material instanceof MeshBasicMaterial) node.material.opacity = 0.42 * this.decoyFade;
      });
    } else if (this.decoy) {
      this.decoy.visible = false;
    }
  }

  private makeGhost(): Object3D {
    // A single translucent silhouette of the courier: every part baked into one geometry.
    const source = this.lib.instance('courier_body');
    source.updateMatrixWorld(true);
    const parts: BufferGeometry[] = [];
    source.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const g = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
      g.applyMatrix4(node.matrixWorld);
      for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
      parts.push(g);
    });
    const merged = mergeGeometries(parts) ?? new BufferGeometry();
    parts.forEach((g) => g.dispose());
    const mat = new MeshBasicMaterial({ color: new Color('#d9f1ff'), transparent: true, opacity: 0.4, depthWrite: false });
    const ghost = new Group();
    const body = new Mesh(merged, mat);
    body.renderOrder = 28;
    body.scale.setScalar(ACTOR_SCALE * 0.95);
    ghost.add(body);
    const ring = flat(0.7, ringMaterial({ color: new Color('#d9f1ff'), inner: 0.82, outer: 1, opacity: 0.8, segments: 10, gap: 0.45 }), 29);
    ring.position.y = 0.02;
    ghost.add(ring);
    this.group.add(ghost);
    return ghost;
  }

  dispose(): void {
    this.halo.geometry.dispose();
    this.halo.material.dispose();
    for (const s of this.streaks) s.dispose();
    this.pips[0]?.geometry.dispose();
    for (const pip of this.pips) pip.material.dispose();
    this.knotPip.material.dispose();
    this.decoy?.traverse((node) => {
      if (node instanceof Mesh) {
        node.geometry.dispose();
        (node.material as { dispose(): void }).dispose();
      }
    });
    this.group.removeFromParent();
  }
}
