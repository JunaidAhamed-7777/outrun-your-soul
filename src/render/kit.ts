/**
 * Environment kit placement for a room (art/environment-kit.md): threshold inlay on the exit
 * zone, lane emitters replacing the perimeter tile where each lane meets the wall, and
 * deterministic non-blocking decor on perimeter tiles only (lamps beside the gate, urns at the
 * corners, banners on the east/west/north walls; nothing tall on the south edge).
 * Everything is instanced: one draw call per template mesh however many pieces a room uses.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshToonMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
  type Object3D,
  type Texture,
} from 'three';
import type { LaneDef, RoomDef } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import type { ModelLibrary } from './assets';
import { yawForFacing } from './contract';
import { instanceTemplate, type Placement } from './instancing';
import { findPart } from './placeholders';

/** Perimeter wall height scales used by the room (east/west, north, south). */
export const PERIMETER_SCALE = { side: 1.4, north: 1.7, south: 0.34 } as const;

export interface EmitterSpot {
  readonly laneKey: string;
  /** Perimeter tile (min corner, simulation coordinates). */
  readonly tile: { x: number; y: number };
  /** Direction the aperture faces (into the room along the lane). */
  readonly facing: Vec2;
}

/** Where each lane meets the room boundary, one emitter per touching side. Pure. */
export function laneEmitterSpots(room: Pick<RoomDef, 'width' | 'height' | 'lanes'>): EmitterSpot[] {
  const spots: EmitterSpot[] = [];
  const eps = 1e-6;
  const add = (lane: LaneDef, tile: { x: number; y: number }, facing: Vec2) => spots.push({ laneKey: lane.id, tile, facing });
  for (const lane of room.lanes) {
    const r = lane.rect;
    const cy = Math.floor(r.y + r.h / 2);
    const cx = Math.floor(r.x + r.w / 2);
    if (r.x <= eps) add(lane, { x: -1, y: cy }, { x: 1, y: 0 });
    if (r.x + r.w >= room.width - eps) add(lane, { x: room.width, y: cy }, { x: -1, y: 0 });
    if (r.y <= eps) add(lane, { x: cx, y: -1 }, { x: 0, y: 1 });
    if (r.y + r.h >= room.height - eps) add(lane, { x: cx, y: room.height }, { x: 0, y: -1 });
  }
  return spots;
}

export interface DecorSpot {
  readonly kind: 'lamp_post' | 'urn' | 'banner_post';
  readonly tile: { x: number; y: number };
  readonly facing: Vec2;
}

/**
 * Deterministic decor on perimeter tiles that are not the gate opening, gate pillars or lane
 * emitters. Pure, so placement is testable and identical for every visit of a room.
 */
export function decorSpots(room: Pick<RoomDef, 'width' | 'height' | 'exit' | 'lanes'>): DecorSpot[] {
  const taken = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;
  for (const s of laneEmitterSpots(room)) taken.add(key(s.tile.x, s.tile.y));
  const gateMin = Math.floor(room.exit.x) - 1;
  const gateMax = Math.ceil(room.exit.x + room.exit.w);
  for (let x = gateMin; x <= gateMax; x++) taken.add(key(x, room.height));
  const out: DecorSpot[] = [];
  const put = (kind: DecorSpot['kind'], x: number, y: number, facing: Vec2) => {
    if (taken.has(key(x, y))) return;
    taken.add(key(x, y));
    out.push({ kind, tile: { x, y }, facing });
  };
  // Lamps flank the gate on the north row.
  put('lamp_post', gateMin - 1, room.height, { x: 0, y: -1 });
  put('lamp_post', gateMax + 1, room.height, { x: 0, y: -1 });
  // Urns on the four corners.
  put('urn', -1, room.height, { x: 1, y: -1 });
  put('urn', room.width, room.height, { x: -1, y: -1 });
  put('urn', -1, -1, { x: 1, y: 1 });
  put('urn', room.width, -1, { x: -1, y: 1 });
  // Banners along the east/west walls, every few rows.
  for (let y = 2; y < room.height - 1; y += 4) {
    put('banner_post', -1, y, { x: 1, y: 0 });
    put('banner_post', room.width, y + 2, { x: -1, y: 0 });
  }
  return out;
}

const tmpQ = new Quaternion();
const tmpS = new Vector3(1, 1, 1);
const tmpP = new Vector3();
const Y_AXIS = new Vector3(0, 1, 0);

/** Matrix for a corner-origin module on tile (x, y), rotated about the tile centre to face d. */
export function tileModuleMatrix(x: number, y: number, facing: Vec2, height = 0, scaleY = 1): Matrix4 {
  const centre = new Matrix4().makeTranslation(x + 0.5, height, -(y + 0.5));
  const rot = new Matrix4().makeRotationAxis(Y_AXIS, yawForFacing(facing));
  const scale = new Matrix4().makeScale(1, scaleY, 1);
  const back = new Matrix4().makeTranslation(-0.5, 0, 0.5);
  return centre.multiply(rot).multiply(scale).multiply(back);
}

/** Matrix for a centre-origin decor piece standing on top of perimeter tile (x, y). */
function decorMatrix(x: number, y: number, facing: Vec2, height: number): Matrix4 {
  tmpP.set(x + 0.5, height, -(y + 0.5));
  tmpQ.setFromAxisAngle(Y_AXIS, yawForFacing(facing));
  return new Matrix4().compose(tmpP, tmpQ, tmpS);
}

function perimeterTop(room: Pick<RoomDef, 'width' | 'height'>, x: number, y: number, wallHeight: number): number {
  if (x < 0 || x >= room.width) return wallHeight * PERIMETER_SCALE.side;
  if (y >= room.height) return wallHeight * PERIMETER_SCALE.north;
  return wallHeight * PERIMETER_SCALE.south;
}

export interface KitView {
  readonly group: Group;
  /** Own threshold materials (emissive gold driven by the gate), empty if no inlay GLB. */
  readonly thresholdMaterials: MeshToonMaterial[];
  /** Whether the GLB inlay covers the exit zone (the room then skips its fallback stones). */
  readonly hasInlay: boolean;
  /** Perimeter tiles replaced by emitters ("x,y" keys). */
  readonly emitterTiles: ReadonlySet<string>;
  /** Aperture world positions per lane key (for lane glow). */
  readonly apertures: ReadonlyMap<string, Vector3[]>;
  update(time: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function buildKit(room: RoomDef, lib: ModelLibrary, wallHeight: number, spot: Texture): KitView {
  const group = new Group();
  group.name = 'kit';
  const disposables: { dispose(): void }[] = [];

  // Threshold inlay: 2 x 1 modules tiled over the exit rect and through the gate opening.
  const thresholdMaterials: MeshToonMaterial[] = [];
  const hasInlay = lib.source('threshold_inlay') === 'glb';
  if (hasInlay) {
    const rows: number[] = [];
    for (let y = Math.floor(room.exit.y); y < room.exit.y + room.exit.h; y++) rows.push(y);
    rows.push(room.height);
    const placements: Placement[] = [];
    for (const y of rows) {
      for (let x = room.exit.x; x + 2 <= room.exit.x + room.exit.w + 1e-6; x += 2) {
        placements.push({ matrix: new Matrix4().makeTranslation(x, 0, -y) });
      }
    }
    // One instanced batch per inlay mesh, each with this room's own glowable material.
    const template = lib.template('threshold_inlay');
    template.updateMatrixWorld(true);
    template.traverse((node) => {
      if (!(node instanceof Mesh) || Array.isArray(node.material) || !(node.material instanceof MeshToonMaterial)) return;
      const own = node.material.clone();
      own.emissive = new Color('#d9a43c');
      own.emissiveIntensity = 0;
      thresholdMaterials.push(own);
      disposables.push(own);
      const single = new Group();
      const copy = new Mesh(node.geometry, own);
      copy.applyMatrix4(node.matrixWorld);
      single.add(copy);
      group.add(instanceTemplate(single, placements, 'threshold_inlay'));
    });
  }

  // Lane emitters replace the perimeter tile where a lane enters.
  const emitterTiles = new Set<string>();
  const apertures = new Map<string, Vector3[]>();
  const emitterSpots = laneEmitterSpots(room);
  if (emitterSpots.length) {
    const template = lib.template('lane_emitter');
    template.updateMatrixWorld(true);
    const aperture = findPart(template, 'lane_emitter', 'aperture');
    const apertureLocal = aperture ? aperture.getWorldPosition(new Vector3()) : new Vector3(0.5, 0.2, 0);
    const placements: Placement[] = emitterSpots.map((s) => {
      emitterTiles.add(`${s.tile.x},${s.tile.y}`);
      const side = s.tile.x < 0 || s.tile.x >= room.width;
      const scaleY = side ? PERIMETER_SCALE.side : s.tile.y >= room.height ? PERIMETER_SCALE.north : 1;
      const matrix = tileModuleMatrix(s.tile.x, s.tile.y, s.facing, 0, scaleY);
      const world = apertureLocal.clone().applyMatrix4(matrix);
      const list = apertures.get(s.laneKey) ?? [];
      list.push(world);
      apertures.set(s.laneKey, list);
      return { matrix };
    });
    group.add(instanceTemplate(template, placements, 'lane_emitters'));
  }

  // Decor, one instanced batch per kind.
  const spots = decorSpots(room);
  const byKind = new Map<DecorSpot['kind'], Placement[]>();
  const lampGlows: Vector3[] = [];
  for (const s of spots) {
    const h = perimeterTop(room, s.tile.x, s.tile.y, wallHeight);
    const list = byKind.get(s.kind) ?? [];
    list.push({ matrix: decorMatrix(s.tile.x, s.tile.y, s.facing, h) });
    byKind.set(s.kind, list);
    if (s.kind === 'lamp_post') lampGlows.push(new Vector3(s.tile.x + 0.5, h, -(s.tile.y + 0.5)));
  }
  for (const [kind, placements] of byKind) {
    if (kind === 'banner_post') continue;
    group.add(instanceTemplate(lib.template(kind), placements, `decor:${kind}`));
  }
  const bannerSway = buildBanners(lib, byKind.get('banner_post') ?? [], group);

  // Lamp globes: one additive point batch for every lamp's warm glow.
  if (lampGlows.length) {
    const lamp = lib.template('lamp_post');
    const box = new Vector3();
    lamp.updateMatrixWorld(true);
    let top = 0;
    lamp.traverse((node) => {
      if (node instanceof Mesh) {
        node.geometry.computeBoundingBox();
        box.copy(node.geometry.boundingBox!.max).applyMatrix4(node.matrixWorld);
        top = Math.max(top, box.y);
      }
    });
    const pos = new Float32Array(lampGlows.length * 3);
    lampGlows.forEach((p, i) => {
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y + top - 0.12;
      pos[i * 3 + 2] = p.z;
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    const mat = new PointsMaterial({
      map: spot,
      color: new Color('#ffd98a'),
      size: 0.75,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.75,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const glows = new Points(geo, mat);
    glows.name = 'lamp_glows';
    glows.renderOrder = 6;
    group.add(glows);
    disposables.push(geo, mat);
  }

  return {
    group,
    thresholdMaterials,
    hasInlay,
    emitterTiles,
    apertures,
    update(time, reducedMotion) {
      bannerSway(time, reducedMotion);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
}

/**
 * Banners: the post is a static instanced batch; each cloth instance sways a few degrees about
 * its crossbar pivot (local X). Two draw calls for any number of banners.
 */
function buildBanners(lib: ModelLibrary, placements: readonly Placement[], parent: Group): (time: number, reducedMotion: boolean) => void {
  if (!placements.length) return () => undefined;
  const template: Object3D = lib.template('banner_post');
  template.updateMatrixWorld(true);
  const rootInv = new Matrix4().copy(template.matrixWorld).invert();
  const cloth = findPart(template, 'banner_post', 'cloth');
  const clothMeshes = new Set<Object3D>();
  cloth?.traverse((n) => clothMeshes.add(n));
  const clothLocal = cloth ? new Matrix4().multiplyMatrices(rootInv, cloth.matrixWorld) : new Matrix4();
  const clothInv = new Matrix4().copy(clothLocal).invert();
  const swaying: { mesh: InstancedMesh; inner: Matrix4 }[] = [];
  template.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const local = new Matrix4().multiplyMatrices(rootInv, node.matrixWorld);
    const mesh = new InstancedMesh(node.geometry, node.material, placements.length);
    mesh.name = `decor:banner_post:${node.name}`;
    if (clothMeshes.has(node)) {
      swaying.push({ mesh, inner: new Matrix4().multiplyMatrices(clothInv, local) });
    } else {
      placements.forEach((p, i) => mesh.setMatrixAt(i, new Matrix4().multiplyMatrices(p.matrix, local)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
  });
  const outer = placements.map((p) => new Matrix4().multiplyMatrices(p.matrix, clothLocal));
  const sway = new Matrix4();
  const m = new Matrix4();
  const apply = (time: number, reducedMotion: boolean): void => {
    for (const { mesh, inner } of swaying) {
      outer.forEach((o, i) => {
        sway.makeRotationX(reducedMotion ? 0 : Math.sin(time * 1.3 + i * 1.7) * 0.06);
        m.multiplyMatrices(o, sway).multiply(inner);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  apply(0, true);
  return apply;
}
