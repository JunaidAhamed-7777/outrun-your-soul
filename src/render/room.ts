/**
 * Static courtyard geometry for one room: instanced floor and wall modules, a perimeter
 * that never occludes play (low south curb, tall north wall), threshold stones under the
 * exit, and dressing kept strictly outside the playable bounds.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RoomDef } from '../sim/types';
import type { Vec2 } from '../sim/vec';
import type { ModelLibrary } from './assets';
import { instanceTemplate, type Placement } from './instancing';
import { sharedToon, toon } from './materials';
import { color } from './palette';
import { faceted } from './placeholders';
import { softBox, stoneTile, verticalGradient } from './textures';

/** Deterministic per-tile hash in [0, 1). Decorative only. */
export function tileHash(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Top-down planar UVs (u = x, v = -z) for meshes exported without UVs. */
function addPlanarUvs(template: Object3D): void {
  template.traverse((node) => {
    if (!(node instanceof Mesh) || node.geometry.getAttribute('uv')) return;
    const pos = node.geometry.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i);
      uv[i * 2 + 1] = -pos.getZ(i);
    }
    node.geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  });
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

export function buildRoomView(room: RoomDef, lib: ModelLibrary): RoomView {
  const group = new Group();
  group.name = `room:${room.id}`;
  const disposables: { dispose(): void }[] = [];

  // Outer plaza and grout bed.
  // The plaza ends behind the north perimeter row; the distant engine lies beyond that edge.
  const plazaSouth = -30;
  const plazaNorth = room.height + 1;
  const plazaGeo = new PlaneGeometry(80, plazaNorth - plazaSouth);
  plazaGeo.rotateX(-Math.PI / 2);
  // Large dark flagstones (2x2 tiles) so the surroundings read as stone, not void.
  const plazaTex = stoneTile(128, 11, true);
  plazaTex.wrapS = RepeatWrapping;
  plazaTex.wrapT = RepeatWrapping;
  plazaTex.repeat.set(40, (plazaNorth - plazaSouth) / 2);
  const plazaMat = toon('cobalt_deep');
  plazaMat.map = plazaTex;
  disposables.push(plazaTex, plazaMat);
  const plaza = new Mesh(plazaGeo, plazaMat);
  plaza.position.set(room.width / 2, -0.1, -(plazaSouth + plazaNorth) / 2);
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
      let k = 0.88 + h * 0.22;
      if (inExitColumn(room, x)) k += 0.1;
      const border = x === 0 || y === 0 || x === room.width - 1 || y === room.height - 1;
      if (border) k -= 0.08;
      if ((x + y) % 2 === 0) k += 0.025;
      floorPlacements.push({ matrix: placeAt(x, y), tint: new Color(k, k, k * 1.02) });
    }
  }
  // Threshold stones continue through the gate opening in the north perimeter row.
  for (let x = 0; x < room.width; x++) if (inExitColumn(room, x)) thresholdPlacements.push({ matrix: placeAt(x, room.height) });
  const floorTemplate = lib.template('floor_tile');
  // Stone mottling on the tile faces. Blender tiles carry their own chamfer (no baked bevel)
  // and no UVs, so they get top-down planar UVs.
  const glbFloor = lib.source('floor_tile') === 'glb';
  if (glbFloor) addPlanarUvs(floorTemplate);
  const stone = stoneTile(128, 7, !glbFloor);
  const floorMaterial = toon('cobalt');
  floorMaterial.map = stone;
  disposables.push(stone, floorMaterial);
  group.add(instanceTemplate(floorTemplate, floorPlacements, 'floor', floorMaterial));
  group.add(instanceTemplate(floorTemplate, thresholdPlacements, 'threshold', sharedToon('wall_cap')));

  // Interior walls and perimeter.
  const wallPlacements: Placement[] = [];
  // Interior obstacles: warm sand caps, a step below the ivory of the courier.
  const sand = new Color(0.88, 0.84, 0.8);
  for (const w of room.walls) {
    for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) wallPlacements.push({ matrix: placeAt(x, y), tint: sand });
  }
  // Perimeter stone is tinted down so interior obstacles stay the brightest architecture.
  const rim = new Color(0.6, 0.64, 0.8);
  for (let y = -1; y <= room.height; y++) {
    wallPlacements.push({ matrix: placeAt(-1, y, 1.4), tint: rim });
    wallPlacements.push({ matrix: placeAt(room.width, y, 1.4), tint: rim });
  }
  for (let x = 0; x < room.width; x++) {
    if (!inExitColumn(room, x)) wallPlacements.push({ matrix: placeAt(x, room.height, 1.7), tint: rim });
    wallPlacements.push({ matrix: placeAt(x, -1, 0.34), tint: rim });
  }
  group.add(instanceTemplate(lib.template('wall_block'), wallPlacements, 'walls'));

  // Soft contact/cast shadows: sun from the south-east throws them north-west.
  const shadowRects: { x: number; y: number; w: number; h: number; o: number }[] = [];
  for (const w of room.walls) {
    shadowRects.push({ x: w.x - 0.2, y: w.y - 0.12, w: w.w + 0.32, h: w.h + 0.5, o: 1 });
  }
  shadowRects.push({ x: room.width - 0.55, y: -0.2, w: 0.75, h: room.height + 0.4, o: 0.9 });
  shadowRects.push({ x: -0.2, y: room.height - 0.35, w: room.width + 0.4, h: 0.55, o: 0.6 });
  shadowRects.push({ x: -0.2, y: -0.2, w: room.width + 0.4, h: 0.38, o: 0.5 });
  shadowRects.push({ x: -0.2, y: -0.2, w: 0.42, h: room.height + 0.4, o: 0.45 });
  const shadowTex = softBox();
  const shadowGeo = new PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new MeshBasicMaterial({ map: shadowTex, color: new Color('#ffffff'), transparent: true, opacity: 0.75, depthWrite: false });
  const shadows = new InstancedMesh(shadowGeo, shadowMat, shadowRects.length);
  const sm = new Matrix4();
  shadowRects.forEach((r, i) => {
    tmpP.set(r.x + r.w / 2, 0.004, -(r.y + r.h / 2));
    tmpS.set(r.w, 1, r.h);
    sm.compose(tmpP, tmpQ.identity(), tmpS);
    shadows.setMatrixAt(i, sm);
    shadows.setColorAt(i, new Color('#050a28').lerp(new Color('#2443a3'), 1 - r.o));
  });
  shadows.renderOrder = 3;
  shadows.name = 'wall_shadows';
  group.add(shadows);
  disposables.push(shadowTex, shadowGeo, shadowMat);

  // Plaza emblem below the room (thumb rest area): a gold sun ring around a cobalt disc.
  const goldParts: BufferGeometry[] = [new RingGeometry(1.05, 1.18, 40), new RingGeometry(0.62, 0.68, 32)];
  for (let k = 0; k < 12; k++) {
    const ray = new PlaneGeometry(0.07, k % 2 ? 0.3 : 0.5);
    ray.translate(0, 1.18 + (k % 2 ? 0.15 : 0.25), 0);
    ray.rotateZ((k / 12) * Math.PI * 2);
    goldParts.push(ray);
  }
  const goldGeo = mergeGeometries(goldParts.map((g) => g.toNonIndexed()))!;
  goldParts.forEach((g) => g.dispose());
  goldGeo.rotateX(-Math.PI / 2);
  const discGeo = new RingGeometry(0.7, 1.05, 40);
  discGeo.rotateX(-Math.PI / 2);
  const emblemGold = new Mesh(goldGeo, new MeshBasicMaterial({ color: new Color('#a7803a') }));
  const emblemDisc = new Mesh(discGeo, new MeshBasicMaterial({ color: new Color('#1f3486') }));
  for (const m of [emblemGold, emblemDisc]) {
    m.position.set(room.width / 2, -0.095, 2.6);
    group.add(m);
    disposables.push(m.geometry, m.material);
  }

  // Exit glow: warm light rising from the threshold toward the gate.
  // Gate origin: centre of the 2-tile opening in the north perimeter row (docs/ASSET_CONTRACT.md).
  const gateAnchor: Vec2 = { x: room.exit.x + room.exit.w / 2, y: room.height + 0.5 };
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
