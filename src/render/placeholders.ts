/**
 * Primitive stand-ins that honour docs/ASSET_CONTRACT.md: same asset IDs, pivots, footprints
 * and named parts as the Blender GLBs, so swapping art never changes behaviour. They are
 * deliberately styled (faceted toon, palette colours) so the game is presentable even if a
 * GLB is missing.
 *
 * Built directly in Three space: +Y up, model forward +Z, ground at y = 0. Part nodes use
 * the `<asset_id>_<part>` naming the Blender exports use.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  Object3D,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  type Material,
} from 'three';
import type { ModelId } from './contract';
import { sharedToon, toon } from './materials';
import type { PaletteKey } from './palette';

/** Faceted normals for the low-poly look (toon materials have no flatShading switch). */
export function faceted<T extends BufferGeometry>(geometry: T): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.computeVertexNormals();
  if (flat !== geometry) geometry.dispose();
  return flat;
}

/** GLB part nodes are named `<asset_id>_<part>` because Blender object names are global. */
export function partName(id: string, part: string): string {
  return `${id}_${part}`;
}

/** Find a contract part on a model: `<id>_<part>` first, bare `<part>` as a fallback. */
export function findPart(root: Object3D, id: string, part: string): Object3D | undefined {
  return root.getObjectByName(partName(id, part)) ?? root.getObjectByName(part);
}

function part(name: string, ...children: Object3D[]): Group {
  const g = new Group();
  g.name = name;
  for (const child of children) g.add(child);
  return g;
}

function piece(geometry: BufferGeometry, material: Material | PaletteKey, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(faceted(geometry), typeof material === 'string' ? sharedToon(material) : material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function courierPlaceholder(): Group {
  const root = part('courier_body');
  // Per-instance materials so the actor can flash on hits without tinting other meshes.
  const ivory = toon('ivory');
  ivory.name = 'ivory';
  const shade = toon('ivory_shadow');
  shade.name = 'ivory_shadow';
  const ink = toon('mask_black');
  ink.name = 'mask_black';
  const red = toon('vermilion');
  red.name = 'vermilion';

  const legL = piece(new CylinderGeometry(0.045, 0.05, 0.16, 5), ink, -0.07, 0.08, 0);
  const legR = piece(new CylinderGeometry(0.045, 0.05, 0.16, 5), ink, 0.07, 0.08, 0);
  const cloak = piece(new ConeGeometry(0.25, 0.5, 7), ivory, 0, 0.37, 0);
  const tunic = piece(new BoxGeometry(0.12, 0.26, 0.04), ink, 0, 0.33, 0.17);
  tunic.rotation.x = -0.42;
  const sash = piece(new BoxGeometry(0.32, 0.045, 0.3), red, 0, 0.42, 0);
  sash.rotation.z = 0.32;
  const body = part('courier_body_body', legL, legR, cloak, tunic, sash);

  const hood = piece(new ConeGeometry(0.17, 0.3, 6), shade, 0, 0.08, -0.02);
  const face = piece(new IcosahedronGeometry(0.115, 0), ink, 0, 0, 0.01);
  const plate = piece(new SphereGeometry(0.105, 7, 5), ivory, 0, 0, 0);
  plate.scale.set(1, 1.15, 0.42);
  const eyeL = piece(new BoxGeometry(0.045, 0.016, 0.02), ink, -0.04, 0.02, 0.045);
  const eyeR = piece(new BoxGeometry(0.045, 0.016, 0.02), ink, 0.04, 0.02, 0.045);
  const mark = piece(new BoxGeometry(0.014, 0.06, 0.02), red, 0, -0.045, 0.043);
  const mask = part('courier_body_mask', plate, eyeL, eyeR, mark);
  mask.position.set(0, -0.005, 0.085);
  const head = part('courier_body_head', hood, face, mask);
  head.position.set(0, 0.69, 0);

  const collar = piece(new TorusGeometry(0.115, 0.035, 4, 9), red, 0, 0, 0);
  collar.rotation.x = Math.PI / 2;
  const tailA = piece(new BoxGeometry(0.07, 0.018, 0.34), red, -0.04, -0.02, -0.19);
  const tailB = piece(new BoxGeometry(0.055, 0.018, 0.27), red, 0.05, -0.05, -0.16);
  const tails = part('courier_body_scarf_tail', tailA, tailB);
  const scarf = part('courier_body_scarf', collar, tails);
  scarf.position.set(0, 0.6, 0);

  root.add(body, head, scarf);
  return root;
}

export function soulPlaceholder(): Group {
  const root = part('soul_mask');
  const core = toon('soul_core', { emissive: '#7fd8ff', emissiveIntensity: 0.55 });
  core.name = 'soul_core';
  const glow = toon('soul_glow', { emissive: '#5cc8ff', emissiveIntensity: 0.8, transparent: true, opacity: 0.6 });
  glow.name = 'soul_glow';
  const hollow = toon('cobalt_deep');
  hollow.name = 'cobalt_deep';

  const face = piece(new SphereGeometry(0.15, 8, 6), core, 0, 0, 0);
  face.scale.set(1, 1.2, 0.42);
  const eyeL = piece(new CircleGeometry(0.035, 6), hollow, -0.055, 0.03, 0.066);
  const eyeR = piece(new CircleGeometry(0.035, 6), hollow, 0.055, 0.03, 0.066);
  eyeL.scale.set(1, 1.5, 1);
  eyeR.scale.set(1, 1.5, 1);
  const mouth = piece(new CircleGeometry(0.022, 5), hollow, 0, -0.07, 0.062);
  const halo = piece(new TorusGeometry(0.21, 0.016, 4, 18, Math.PI * 1.35), glow, 0, 0.02, -0.06);
  halo.rotation.z = Math.PI * -0.175 + Math.PI / 2;
  const mask = part('soul_mask_mask', face, eyeL, eyeR, mouth, halo);
  mask.position.set(0, 0.55, 0);

  const tail = piece(new ConeGeometry(0.105, 0.34, 7), glow, 0, 0, 0);
  tail.rotation.x = Math.PI;
  const mote = piece(new OctahedronGeometry(0.03), core, 0.13, 0.08, 0);
  const wisp = part('soul_mask_wisp', tail, mote);
  wisp.position.set(0, 0.33, 0);

  root.add(mask, wisp);
  return root;
}

export function needlerPlaceholder(): Group {
  const root = part('needler');
  const housing = toon('ivory');
  housing.name = 'ivory';
  const eyeMat = toon('warning_amber', { emissive: '#ffb21e', emissiveIntensity: 0.2 });
  eyeMat.name = 'eye';

  const plinth = piece(new CylinderGeometry(0.33, 0.4, 0.16, 6), 'cobalt_deep', 0, 0.08, 0);
  const trim = piece(new CylinderGeometry(0.3, 0.33, 0.05, 6), 'gold', 0, 0.185, 0);
  const column = piece(new CylinderGeometry(0.075, 0.12, 0.44, 6), 'ivory_shadow', 0, 0.42, 0);
  const base = part('needler_base', plinth, trim, column);

  const shell = piece(new OctahedronGeometry(0.17, 0), housing, 0, 0, 0);
  shell.scale.set(0.95, 0.75, 1.25);
  const barrel = piece(new CylinderGeometry(0.018, 0.05, 0.44, 6), 'gold', 0, 0.0, 0.27);
  barrel.rotation.x = Math.PI / 2;
  const finL = piece(new BoxGeometry(0.03, 0.15, 0.16), 'cobalt', -0.15, 0.02, -0.03);
  const finR = piece(new BoxGeometry(0.03, 0.15, 0.16), 'cobalt', 0.15, 0.02, -0.03);
  const eye = piece(new SphereGeometry(0.048, 6, 4), eyeMat, 0, 0.045, 0.14);
  eye.name = 'needler_eye';
  const muzzle = new Object3D();
  muzzle.name = 'needler_muzzle';
  muzzle.position.set(0, 0, 0.5);
  const head = part('needler_head', shell, barrel, finL, finR, eye, muzzle);
  head.position.set(0, 0.7, 0);

  root.add(base, head);
  return root;
}

export function keeperPlaceholder(): Group {
  const root = part('keeper');
  const glass = toon('soul_glow', { emissive: '#5cc8ff', emissiveIntensity: 0.25 });
  glass.name = 'eye';

  const foot = piece(new CylinderGeometry(0.42, 0.46, 0.1, 8), 'cobalt_deep', 0, 0.05, 0);
  const postL = piece(new CylinderGeometry(0.045, 0.06, 1.0, 5), 'gold_dark', -0.3, 0.55, -0.05);
  const postR = piece(new CylinderGeometry(0.045, 0.06, 1.0, 5), 'gold_dark', 0.3, 0.55, -0.05);
  const beam = piece(new BoxGeometry(0.76, 0.07, 0.1), 'gold', 0, 1.06, -0.05);
  const finialL = piece(new OctahedronGeometry(0.06), 'gold', -0.36, 1.12, -0.05);
  const finialR = piece(new OctahedronGeometry(0.06), 'gold', 0.36, 1.12, -0.05);
  const base = part('keeper_base', foot, postL, postR, beam, finialL, finialR);

  const chain = piece(new CylinderGeometry(0.012, 0.012, 0.2, 4), 'gold_dark', 0, 0.2, 0);
  const cap = piece(new ConeGeometry(0.17, 0.12, 6), 'gold', 0, 0.12, 0);
  const cage = piece(new CylinderGeometry(0.15, 0.12, 0.24, 6, 1, true), 'ivory', 0, -0.02, 0);
  const core = piece(new OctahedronGeometry(0.095, 0), glass, 0, -0.02, 0);
  core.name = 'keeper_eye';
  const foot2 = piece(new ConeGeometry(0.1, 0.1, 6), 'gold', 0, -0.19, 0);
  foot2.rotation.x = Math.PI;
  const muzzle = new Object3D();
  muzzle.name = 'keeper_muzzle';
  muzzle.position.set(0, -0.02, 0.2);
  const head = part('keeper_head', chain, cap, cage, core, foot2, muzzle);
  head.position.set(0, 0.74, -0.05);

  root.add(base, head);
  return root;
}

export function gatePlaceholder(): Group {
  const root = part('exit_gate');
  const pillarL = piece(new BoxGeometry(0.32, 1.5, 0.32), 'ivory', -1.16, 0.75, 0);
  const pillarR = piece(new BoxGeometry(0.32, 1.5, 0.32), 'ivory', 1.16, 0.75, 0);
  const capL = piece(new BoxGeometry(0.42, 0.12, 0.42), 'gold', -1.16, 1.56, 0);
  const capR = piece(new BoxGeometry(0.42, 0.12, 0.42), 'gold', 1.16, 1.56, 0);
  const lintel = piece(new BoxGeometry(2.7, 0.2, 0.3), 'gold', 0, 1.72, 0);
  const crest = piece(new TorusGeometry(0.2, 0.05, 4, 10), 'gold', 0, 2.02, 0);
  const crestCore = piece(new OctahedronGeometry(0.09), 'vermilion', 0, 2.02, 0);
  const step = piece(new BoxGeometry(2.6, 0.06, 0.5), 'wall_cap', 0, 0.03, 0.05);
  const frame = part('exit_gate_frame', pillarL, pillarR, capL, capR, lintel, crest, crestCore, step);

  const door = (name: string, hingeX: number, dir: 1 | -1): Group => {
    const panel = piece(new BoxGeometry(0.98, 1.3, 0.06), 'gold_dark', dir * 0.5, 0.67, 0);
    const barA = piece(new BoxGeometry(0.06, 1.3, 0.09), 'gold', dir * 0.2, 0.67, 0);
    const barB = piece(new BoxGeometry(0.06, 1.3, 0.09), 'gold', dir * 0.62, 0.67, 0);
    const rail = piece(new BoxGeometry(0.98, 0.06, 0.09), 'gold', dir * 0.5, 0.9, 0);
    const boss = piece(new OctahedronGeometry(0.08), 'ivory', dir * 0.86, 0.67, 0.05);
    const g = part(name, panel, barA, barB, rail, boss);
    g.position.set(hingeX, 0, 0);
    return g;
  };
  root.add(frame, door('exit_gate_door_left', -1.0, 1), door('exit_gate_door_right', 1.0, -1));
  return root;
}

/** Floor module: occupies [0,1] x [0,1] of the gameplay plane; top surface at y = 0. */
export function floorTilePlaceholder(): Group {
  const root = part('floor_tile');
  const slab = piece(new BoxGeometry(0.94, 0.08, 0.94), 'cobalt', 0.5, -0.04, -0.5);
  root.add(slab);
  return root;
}

/** Wall module: occupies one tile, low enough not to hide a body standing north of it. */
export const WALL_HEIGHT = 0.5;
export function wallBlockPlaceholder(): Group {
  const root = part('wall_block');
  const block = piece(new BoxGeometry(1, WALL_HEIGHT - 0.08, 1), 'wall_body', 0.5, (WALL_HEIGHT - 0.08) / 2, -0.5);
  const cap = piece(new BoxGeometry(1.02, 0.08, 1.02), 'wall_cap', 0.5, WALL_HEIGHT - 0.04, -0.5);
  root.add(block, cap);
  return root;
}

export function placeholderFor(id: ModelId): Group {
  switch (id) {
    case 'courier_body':
      return courierPlaceholder();
    case 'soul_mask':
      return soulPlaceholder();
    case 'needler':
      return needlerPlaceholder();
    case 'keeper':
      return keeperPlaceholder();
    case 'floor_tile':
      return floorTilePlaceholder();
    case 'wall_block':
      return wallBlockPlaceholder();
    case 'exit_gate':
      return gatePlaceholder();
    case 'distant_engine':
      return part('distant_engine');
  }
}
