/**
 * State-bearing ground overlays: the living ribbon, dash preview, return meet marker,
 * capacity arc and attack telegraphs. All drawn from simulation data each frame.
 */
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type ShaderMaterial,
} from 'three';
import type { DashPreview, EnemyState, ReturnPreview, RoomDef, SimState } from '../sim/types';
import { TUNING } from '../sim/tuning';
import type { Vec2 } from '../sim/vec';
import { color } from './palette';
import { rayToWalls } from './raycast';
import { aimTarget, lockTarget } from './simext';
import { dotLineMaterial, ribbonMaterial, ringMaterial, setUniform, stripShadowMaterial, telegraphMaterial } from './shaders';
import { StripMesh } from './stripMesh';

const RIBBON_POINTS = 160;
const SHEEN = new Color('#ffb08a');
const BOOST_SHEEN = new Color('#fff3e6');

function flatPlane(size: number, material: ShaderMaterial, renderOrder: number, depthTest = false): Mesh<PlaneGeometry, ShaderMaterial> {
  const geo = new PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  material.depthTest = depthTest;
  const mesh = new Mesh(geo, material);
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  return mesh;
}

function place(mesh: { position: { set(x: number, y: number, z: number): void } }, p: Vec2, h: number): void {
  mesh.position.set(p.x, h, -p.y);
}

/** Flat cross glyph (invalid endpoint / cancel). */
function crossGlyph(size: number, c: Color): Group {
  const g = new Group();
  const mat = new MeshBasicMaterial({ color: c, transparent: true, depthTest: false, depthWrite: false });
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new Mesh(new BoxGeometry(size, 0.001, size * 0.18), mat);
    bar.rotation.y = angle;
    bar.renderOrder = 41;
    g.add(bar);
  }
  return g;
}

export class RibbonView {
  readonly group = new Group();
  private readonly silk: StripMesh<ShaderMaterial>;
  private readonly shade: StripMesh<ShaderMaterial>;
  private readonly pts: Vec2[] = [];
  private readonly shadowPts: { x: number; y: number }[] = [];
  private time = 0;
  private flow = 0.3;
  private boost = 0;

  constructor() {
    this.silk = new StripMesh(ribbonMaterial(), RIBBON_POINTS, 12);
    this.shade = new StripMesh(stripShadowMaterial(0.3), RIBBON_POINTS, 11);
    this.group.add(this.shade.mesh, this.silk.mesh);
  }

  update(state: SimState, soulPos: Vec2, bodyPos: Vec2, dt: number, reducedMotion: boolean, boosting = false): void {
    const route = state.route.points;
    if (route.length < 2) {
      this.silk.hide();
      this.shade.hide();
      return;
    }
    // Endpoints follow the interpolated actors so the thread stays attached between steps.
    this.pts.length = 0;
    this.pts.push(soulPos);
    for (let i = 1; i < route.length - 1; i++) this.pts.push(route[i]!);
    this.pts.push(bodyPos);

    const returning = state.body.mode === 'return';
    // RETURN gathers the thread toward the body; a Needlesong boost hurries the soul's flow.
    this.flow += ((returning ? 2.2 : boosting ? 1.5 : 0.3) - this.flow) * Math.min(1, dt * 6);
    this.boost += ((boosting ? 1 : 0) - this.boost) * Math.min(1, dt * 8);
    (this.silk.mesh.material.uniforms.uSheen!.value as Color).copy(SHEEN).lerp(BOOST_SHEEN, this.boost);
    this.time += reducedMotion ? 0 : dt;
    setUniform(this.silk.mesh.material, 'uTime', this.time);
    setUniform(this.silk.mesh.material, 'uFlow', this.flow);

    this.silk.set(this.pts, 0.075, 0.032);
    while (this.shadowPts.length < this.pts.length) this.shadowPts.push({ x: 0, y: 0 });
    this.shadowPts.length = this.pts.length;
    for (let i = 0; i < this.pts.length; i++) {
      this.shadowPts[i]!.x = this.pts[i]!.x + 0.035;
      this.shadowPts[i]!.y = this.pts[i]!.y - 0.045;
    }
    this.shade.set(this.shadowPts, 0.12, 0.008);
  }

  dispose(): void {
    this.silk.dispose();
    this.shade.dispose();
    this.group.removeFromParent();
  }
}

export interface PreviewInput {
  readonly dash: DashPreview | null;
  readonly cancel: boolean;
  readonly queued: boolean;
  readonly ret: ReturnPreview | null;
}

export class PreviewView {
  readonly group = new Group();
  private readonly path: StripMesh<ShaderMaterial>;
  private readonly overflow: StripMesh<ShaderMaterial>;
  private readonly endRing: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly contactRing: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly capacityArc: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly wallTick: Mesh<BoxGeometry, MeshBasicMaterial>;
  private readonly invalidX: Group;
  private readonly cancelGlyph: Group;
  private readonly cancelRing: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly meet: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private time = 0;
  private readonly ivory = color('ivory');
  private readonly grey = new Color('#8b90a8');
  private readonly gold = color('gold');

  constructor() {
    this.path = new StripMesh(dotLineMaterial(color('ivory'), 0.07, 0.24, 0), 2, 40);
    this.path.mesh.material.depthTest = false;
    this.overflow = new StripMesh(dotLineMaterial(color('vermilion'), 0.05, 0.2, 1), 2, 40);
    this.overflow.mesh.material.depthTest = false;
    this.endRing = flatPlane(
      TUNING.bodyRadius * 2.4,
      ringMaterial({ color: color('ivory'), inner: 0.72, outer: 0.9, segments: 8, gap: 0.25 }),
      41,
    );
    this.contactRing = flatPlane(0.9, ringMaterial({ color: color('gold'), inner: 0.62, outer: 0.92 }), 42);
    this.capacityArc = flatPlane(1.1, ringMaterial({ color: color('vermilion'), inner: 0.8, outer: 0.92, arc: 1 }), 39);
    const tickMat = new MeshBasicMaterial({ color: color('ivory'), depthTest: false, depthWrite: false, transparent: true });
    this.wallTick = new Mesh(new BoxGeometry(0.62, 0.001, 0.07), tickMat);
    this.wallTick.renderOrder = 41;
    this.invalidX = crossGlyph(0.42, this.grey);
    this.cancelGlyph = crossGlyph(0.3, color('ivory'));
    this.cancelRing = flatPlane(0.8, ringMaterial({ color: color('ivory'), inner: 0.8, outer: 0.95, opacity: 0.8 }), 41);
    // Return meet point: a small gold diamond lying on the ribbon (distinct from round markers).
    const meetGeo = new PlaneGeometry(0.2, 0.2);
    meetGeo.rotateX(-Math.PI / 2);
    meetGeo.rotateY(Math.PI / 4);
    this.meet = new Mesh(meetGeo, new MeshBasicMaterial({ color: color('gold'), transparent: true, depthTest: false, depthWrite: false }));
    this.meet.renderOrder = 38;
    this.group.add(
      this.capacityArc,
      this.path.mesh,
      this.overflow.mesh,
      this.endRing,
      this.contactRing,
      this.wallTick,
      this.invalidX,
      this.cancelGlyph,
      this.cancelRing,
      this.meet,
    );
  }

  update(state: SimState, bodyPos: Vec2, input: PreviewInput, dt: number, reducedMotion: boolean): void {
    this.time += dt;
    const { dash } = input;
    const show = !!dash && !input.cancel;
    this.path.mesh.visible = false;
    this.overflow.mesh.visible = false;
    this.endRing.visible = false;
    this.contactRing.visible = false;
    this.wallTick.visible = false;
    this.invalidX.visible = false;
    this.capacityArc.visible = false;
    this.cancelGlyph.visible = input.cancel;
    this.cancelRing.visible = input.cancel;
    this.meet.visible = false;

    if (input.cancel) {
      place(this.cancelGlyph, bodyPos, 0.04);
      place(this.cancelRing, bodyPos, 0.04);
    }

    if (show && dash) {
      const valid = dash.valid;
      const pathMat = this.path.mesh.material;
      (pathMat.uniforms.uColor!.value as Color).copy(valid ? this.ivory : this.grey);
      setUniform(pathMat, 'uTime', reducedMotion ? 0 : this.time);
      setUniform(pathMat, 'uOpacity', valid ? 1 : 0.6);
      this.path.set([dash.end, bodyPos], 0.07, 0.045);

      if (!valid) {
        this.invalidX.visible = true;
        place(this.invalidX, dash.end, 0.05);
      } else {
        this.endRing.visible = true;
        place(this.endRing, dash.end, 0.045);
        const pulse = input.queued ? 1 + 0.18 * Math.sin(this.time * 14) : 1;
        this.endRing.scale.setScalar(pulse);
        setUniform(this.endRing.material, 'uOpacity', input.queued ? 0.6 + 0.4 * Math.sin(this.time * 14) : 1);
        if (!reducedMotion) setUniform(this.endRing.material, 'uStart', this.time * 1.5);
      }

      const dx = dash.requestedEnd.x - dash.end.x;
      const dy = dash.requestedEnd.y - dash.end.y;
      const cut = Math.hypot(dx, dy);
      if (dash.limitedBy === 'capacity' && cut > 0.05) {
        // Thread budget ran out: show the unreachable remainder in ribbon colour.
        const k = Math.min(1, 0.7 / cut);
        this.overflow.set([{ x: dash.end.x + dx * k, y: dash.end.y + dy * k }, dash.end], 0.05, 0.044);
      }
      if ((dash.limitedBy === 'wall' || dash.limitedBy === 'guard') && cut > 1e-3) {
        // Wall: ivory stop tick. Warden guard: gold tick (the dash will glance off the shield).
        this.wallTick.material.color.copy(dash.limitedBy === 'guard' ? this.gold : this.ivory);
        this.wallTick.visible = true;
        place(this.wallTick, dash.end, 0.05);
        this.wallTick.rotation.y = Math.atan2(dy, dx) + Math.PI / 2;
        const off = 0.32 / cut;
        this.wallTick.position.x = dash.end.x + dx * off;
        this.wallTick.position.z = -(dash.end.y + dy * off);
      }
      if (dash.contact) {
        this.contactRing.visible = true;
        place(this.contactRing, dash.contact.at, 0.05);
        const s = reducedMotion ? 1 : 1 + 0.08 * Math.sin(this.time * 8);
        this.contactRing.scale.setScalar(s);
      }
      // Remaining thread after this dash, as a fraction of capacity.
      this.capacityArc.visible = true;
      place(this.capacityArc, bodyPos, 0.04);
      const frac = Math.max(0, Math.min(1, dash.capacityAfter / Math.max(1e-6, state.params.tetherCapacity)));
      setUniform(this.capacityArc.material, 'uArc', frac);
      setUniform(this.capacityArc.material, 'uStart', Math.PI / 2 - frac * Math.PI);
    }

    const ret = input.ret;
    if (!show && !input.cancel && ret?.valid && ret.meetAt && state.route.points.length > 1 && state.body.mode !== 'return') {
      this.meet.visible = true;
      place(this.meet, ret.meetAt, 0.05);
      const bob = reducedMotion ? 1 : 1 + 0.12 * Math.sin(this.time * 4);
      this.meet.scale.setScalar(bob);
    }
  }

  dispose(): void {
    this.path.dispose();
    this.overflow.dispose();
    this.group.traverse((node) => {
      if (node instanceof Mesh) {
        node.geometry.dispose();
        (node.material as { dispose(): void }).dispose();
      }
    });
    this.group.removeFromParent();
  }
}

/**
 * One sentry's warning line plus the reticle on its threatened point. With forecast aim
 * (EnemyState.lockTarget / aimTarget) the reticle sits on the predicted point, which for a
 * keeper lies on the ribbon, and the locked band ends there while a thin flight line shows
 * the bolt's full path beyond it.
 */
export class TelegraphView {
  readonly group = new Group();
  private readonly line: StripMesh<ShaderMaterial>;
  private readonly reticle: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly spot: Mesh<PlaneGeometry, ShaderMaterial>;
  private lastPhase: EnemyState['phase'] | null = null;
  private lockPoint: Vec2 = { x: 0, y: 0 };
  private time = 0;

  constructor(private readonly target: 'body' | 'soul') {
    this.line = new StripMesh(telegraphMaterial(), 2, 35);
    this.line.mesh.material.depthTest = false;
    const segments = target === 'soul' ? 3 : 4;
    this.reticle = flatPlane(0.95, ringMaterial({ color: color('warning_amber'), inner: 0.8, outer: 0.95, segments, gap: 0.45 }), 36);
    // Inner band (second ring in the same shader): solid for the body, dashed for the soul.
    setUniform(this.reticle.material, 'uSegments2', target === 'soul' ? 6 : 0);
    this.spot = flatPlane(0.34, ringMaterial({ color: color('warning_amber'), inner: 0, outer: 1, opacity: 0.55 }), 36);
    this.group.add(this.line.mesh, this.reticle, this.spot);
  }

  update(enemy: EnemyState, room: RoomDef, targetPos: Vec2, dt: number, reducedMotion: boolean): void {
    this.time += dt;
    const active = enemy.phase === 'tracking' || enemy.phase === 'locked';
    if (enemy.phase === 'locked' && this.lastPhase !== 'locked') this.lockPoint = targetPos;
    this.lastPhase = enemy.phase;
    this.group.visible = active;
    if (!active) return;

    const locked = enemy.phase === 'locked';
    const origin = { x: enemy.pos.x + enemy.aim.x * enemy.radius, y: enemy.pos.y + enemy.aim.y * enemy.radius };
    const length = rayToWalls(origin, enemy.aim, room);
    const end = { x: origin.x + enemy.aim.x * length, y: origin.y + enemy.aim.y * length };
    const mat = this.line.mesh.material;
    setUniform(mat, 'uLocked', locked ? 1 : 0);
    setUniform(mat, 'uLength', length);
    setUniform(mat, 'uTime', this.time);
    setUniform(mat, 'uMotion', reducedMotion ? 0 : 1);
    const progress = locked && enemy.phaseDuration > 0 ? Math.min(1, enemy.phaseTime / enemy.phaseDuration) : 0;
    setUniform(mat, 'uProgress', progress);
    // Forecast aim: the locked band ends at the predicted point; the flight line continues.
    const forecast = locked ? lockTarget(enemy) : aimTarget(enemy);
    let mark = 1e5;
    if (locked && forecast) {
      const along = (forecast.x - origin.x) * enemy.aim.x + (forecast.y - origin.y) * enemy.aim.y;
      mark = Math.max(0.3, Math.min(length, along + 0.2));
      setUniform(mat, 'uLength', length);
    }
    setUniform(mat, 'uMark', mark);
    this.line.set([end, origin], locked ? 0.17 : 0.06, 0.05);

    // Reticle: on the forecast point when the sim provides one; otherwise tracking follows the
    // endpoint and a locked line keeps the point it locked on (it never retargets).
    const at = forecast ?? (locked ? this.lockPoint : targetPos);
    this.spot.visible = !!forecast;
    if (forecast) {
      place(this.spot, forecast, 0.048);
      const beat = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(this.time * 9);
      this.spot.scale.setScalar(locked ? (0.7 + 0.3 * progress) * beat : 0.6);
      setUniform(this.spot.material, 'uOpacity', locked ? 0.35 + 0.4 * progress : 0.25);
    }
    place(this.reticle, at, 0.05);
    const shrink = locked ? 0.85 - progress * 0.25 : 1.05 + (reducedMotion ? 0 : 0.08 * Math.sin(this.time * 10));
    this.reticle.scale.setScalar(shrink);
    setUniform(this.reticle.material, 'uStart', reducedMotion ? 0 : this.time * (this.target === 'soul' ? -2.4 : 2.4));
    setUniform(this.reticle.material, 'uOpacity', locked ? 1 : 0.75);
    const inner = locked || this.target === 'soul';
    setUniform(this.reticle.material, 'uInner2', inner ? 0.5 : 0);
    setUniform(this.reticle.material, 'uOuter2', inner ? 0.58 : 0);
  }

  dispose(): void {
    this.line.dispose();
    for (const m of [this.reticle, this.spot]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.group.removeFromParent();
  }
}
