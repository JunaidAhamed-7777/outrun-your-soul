/**
 * Static courtyard geometry for one room: instanced floor and wall modules, a perimeter
 * that never occludes play (low south curb, tall north wall), threshold stones under the
 * exit, and dressing kept strictly outside the playable bounds.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three';
import type { RoomDef } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import type { ModelLibrary } from './assets';
import { instanceTemplate, type Placement } from './instancing';
import { sharedToon } from './materials';
import { color } from './palette';
import { faceted } from './placeholders';
import { verticalGradient } from './textures';

/** Deterministic per-tile hash in [0, 1). Decorative only. */
export function tileHash(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface RoomView {
  readonly group: Group;
  /** Simulation position of the exit gate model origin. */
  readonly gateAnchor: Vec2;
  /** Additive floor glow over the exit rect (opacity driven by gate state). */
  readonly exitGlow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  dispose(): void;
}

const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpP = new Vector3();

function placeAt(x: number, y: number, heightScale = 1): Matrix4 {
  tmpP.set(x, 0, -y);
  tmpS.set(1, heightScale, 1);
  return new Matrix4().compose(tmpP, tmpQ.identity(), tmpS);
}

function inExitColumn(room: RoomDef, x: number): boolean {
  return x + 0.5 > room.exit.x && x + 0.5 < room.exit.x + room.exit.w;
}

function inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return x + 0.5 > r.x && x + 0.5 < r.x + r.w && y + 0.5 > r.y && y + 0.5 < r.y + r.h;
}

/** Outer dressing: colonnade with cobalt banners north of the wall, lantern posts by the gate. */
function buildDressing(room: RoomDef, gateX: number): Object3D[] {
  const out: Object3D[] = [];
  const column = new Group();
  const shaft = new Mesh(faceted(new CylinderGeometry(0.17, 0.2, 2.3, 7)), sharedToon('ivory_shadow'));
  shaft.position.y = 1.15;
  const capital = new Mesh(faceted(new BoxGeometry(0.5, 0.14, 0.5)), sharedToon('gold'));
  capital.position.y = 2.37;
  const plinth = new Mesh(faceted(new BoxGeometry(0.46, 0.18, 0.46)), sharedToon('wall_body'));
  plinth.position.y = 0.09;
  column.add(shaft, capital, plinth);
  const columns: Placement[] = [];
  for (let x = -2; x <= room.width + 2; x += 2) {
    if (Math.abs(x - gateX) < 2.2) continue;
    columns.push({ matrix: placeAt(x, room.height + 1.9) });
  }
  out.push(instanceTemplate(column, columns, 'colonnade'));

  const banner = new Group();
  const cloth = new Mesh(faceted(new BoxGeometry(0.62, 1.1, 0.03)), sharedToon('cobalt_light'));
  cloth.position.set(0, 1.6, 0);
  const trim = new Mesh(faceted(new BoxGeometry(0.66, 0.07, 0.05)), sharedToon('gold'));
  trim.position.set(0, 2.15, 0);
  const emblem = new Mesh(faceted(new OctahedronGeometry(0.11)), sharedToon('gold'));
  emblem.position.set(0, 1.62, 0.03);
  banner.add(cloth, trim, emblem);
  const banners: Placement[] = [];
  for (let x = -1; x <= room.width + 1; x += 2) {
    if (Math.abs(x - gateX) < 2.2) continue;
    banners.push({ matrix: placeAt(x, room.height + 1.85) });
  }
  out.push(instanceTemplate(banner, banners, 'banners'));

  // Lantern posts flanking the gate; their glow is warm decoration, far from play.
  for (const side of [-1, 1]) {
    const post = new Group();
    const pole = new Mesh(faceted(new CylinderGeometry(0.04, 0.05, 1.5, 5)), sharedToon('gold_dark'));
    pole.position.y = 0.75;
    const lamp = new Mesh(faceted(new OctahedronGeometry(0.13)), sharedToon('gold'));
    lamp.position.y = 1.6;
    post.add(pole, lamp);
    post.position.set(gateX + side * 1.85, 0, -(room.height + 0.6));
    out.push(post);
  }
  return out;
}

export function buildRoomView(room: RoomDef, lib: ModelLibrary): RoomView {
  const group = new Group();
  group.name = `room:${room.id}`;
  const disposables: { dispose(): void }[] = [];

  // Outer plaza and grout bed.
  const plazaGeo = new PlaneGeometry(80, 80);
  plazaGeo.rotateX(-Math.PI / 2);
  const plaza = new Mesh(plazaGeo, sharedToon('cobalt_deep'));
  plaza.position.set(room.width / 2, -0.1, -room.height / 2 - 20);
  plaza.name = 'plaza';
  const groutGeo = new PlaneGeometry(room.width, room.height);
  groutGeo.rotateX(-Math.PI / 2);
  const groutMat = new MeshBasicMaterial({ color: new Color('#0d1640') });
  const grout = new Mesh(groutGeo, groutMat);
  grout.position.set(room.width / 2, -0.07, -room.height / 2);
  grout.name = 'grout';
  group.add(plaza, grout);
  disposables.push(plazaGeo, groutGeo, groutMat);

  // Floor tiles: subtle deterministic variation, a lighter processional path to the gate,
  // darker border tiles framing the room, ivory threshold stones in the exit zone.
  const floorPlacements: Placement[] = [];
  const thresholdPlacements: Placement[] = [];
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      if (room.walls.some((w) => inRect(x, y, w))) continue;
      if (inRect(x, y, room.exit)) {
        thresholdPlacements.push({ matrix: placeAt(x, y) });
        continue;
      }
      const h = tileHash(x, y);
      let k = 0.9 + h * 0.16;
      if (inExitColumn(room, x)) k += 0.1;
      const border = x === 0 || y === 0 || x === room.width - 1 || y === room.height - 1;
      if (border) k -= 0.08;
      if ((x + y) % 2 === 0) k += 0.025;
      floorPlacements.push({ matrix: placeAt(x, y), tint: new Color(k, k, k * 1.02) });
    }
  }
  const floorTemplate = lib.template('floor_tile');
  group.add(instanceTemplate(floorTemplate, floorPlacements, 'floor'));
  group.add(instanceTemplate(floorTemplate, thresholdPlacements, 'threshold', sharedToon('wall_cap')));

  // Interior walls and perimeter.
  const wallPlacements: Placement[] = [];
  for (const w of room.walls) {
    for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) wallPlacements.push({ matrix: placeAt(x, y) });
  }
  for (let y = -1; y <= room.height; y++) {
    wallPlacements.push({ matrix: placeAt(-1, y, 1.4) });
    wallPlacements.push({ matrix: placeAt(room.width, y, 1.4) });
  }
  for (let x = 0; x < room.width; x++) {
    if (!inExitColumn(room, x)) wallPlacements.push({ matrix: placeAt(x, room.height, 1.7) });
    wallPlacements.push({ matrix: placeAt(x, -1, 0.34) });
  }
  group.add(instanceTemplate(lib.template('wall_block'), wallPlacements, 'walls'));

  // Exit glow: warm light rising from the threshold toward the gate.
  const gateAnchor: Vec2 = { x: room.exit.x + room.exit.w / 2, y: room.height + 0.12 };
  const glowGeo = new PlaneGeometry(room.exit.w, room.exit.h);
  glowGeo.rotateX(-Math.PI / 2);
  const glowTex = verticalGradient([
    [0, 'rgba(255,214,120,1)'],
    [0.6, 'rgba(255,190,90,0.45)'],
    [1, 'rgba(255,170,60,0)'],
  ]);
  const glowMat = new MeshBasicMaterial({
    map: glowTex,
    color: color('gold'),
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const exitGlow = new Mesh(glowGeo, glowMat);
  exitGlow.position.set(room.exit.x + room.exit.w / 2, 0.012, -(room.exit.y + room.exit.h / 2));
  exitGlow.renderOrder = 2;
  exitGlow.name = 'exit_glow';
  group.add(exitGlow);
  disposables.push(glowGeo, glowTex, glowMat);

  for (const d of buildDressing(room, gateAnchor.x)) group.add(d);

  return {
    group,
    gateAnchor,
    exitGlow,
    dispose() {
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
}
