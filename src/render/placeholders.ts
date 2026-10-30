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

/**
 * Warden: broad armoured sentry. Parts follow warden.glb: warden_base (static plinth),
 * warden_body (turns to the guard facing) holding warden_shield (hinged at its lower front
 * edge; positive local-X rotation lowers it forward), warden_core (glows when exposed) and
 * warden_muzzle (sweep origin).
 */
export function wardenPlaceholder(): Group {
  const root = part('warden');
  const plinth = piece(new CylinderGeometry(0.5, 0.56, 0.14, 8), 'cobalt_deep', 0, 0.07, 0);
  const trim = piece(new CylinderGeometry(0.47, 0.5, 0.05, 8), 'gold', 0, 0.165, 0);
  const base = part('warden_base', plinth, trim);

  const torso = piece(new CylinderGeometry(0.27, 0.36, 0.5, 6), 'ivory', 0, 0.3, -0.04);
  const belt = piece(new CylinderGeometry(0.33, 0.34, 0.07, 6), 'gold', 0, 0.16, -0.04);
  const pauldronL = piece(new OctahedronGeometry(0.15, 0), 'gold', -0.36, 0.52, -0.04);
  const pauldronR = piece(new OctahedronGeometry(0.15, 0), 'gold', 0.36, 0.52, -0.04);
  pauldronL.scale.set(1.2, 0.8, 1);
  pauldronR.scale.set(1.2, 0.8, 1);
  const helm = piece(new IcosahedronGeometry(0.16, 0), 'ivory', 0, 0.72, -0.04);
  helm.scale.set(1, 1.15, 1);
  const visor = piece(new BoxGeometry(0.22, 0.04, 0.05), 'mask_black', 0, 0.73, 0.1);
  const crest = piece(new ConeGeometry(0.06, 0.24, 4), 'gold', 0, 0.94, -0.06);

  const core = piece(new OctahedronGeometry(0.11, 0), 'gold', 0, 0, 0);
  const coreGroup = part('warden_core', core);
  coreGroup.position.set(0, 0.34, 0.2);

  const plate = piece(new BoxGeometry(0.86, 0.66, 0.07), 'ivory_shadow', 0, 0.33, 0);
  const rimTop = piece(new BoxGeometry(0.9, 0.06, 0.09), 'gold', 0, 0.66, 0);
  const rimL = piece(new BoxGeometry(0.06, 0.66, 0.09), 'gold', -0.43, 0.33, 0);
  const rimR = piece(new BoxGeometry(0.06, 0.66, 0.09), 'gold', 0.43, 0.33, 0);
  const boss = piece(new OctahedronGeometry(0.1, 0), 'gold', 0, 0.36, 0.05);
  boss.scale.set(1, 1.3, 0.5);
  const shield = part('warden_shield', plate, rimTop, rimL, rimR, boss);
  shield.position.set(0, -0.08, 0.37);

  const muzzle = new Object3D();
  muzzle.name = 'warden_muzzle';
  muzzle.position.set(0, 0.12, 0.5);
  const body = part('warden_body', torso, belt, pauldronL, pauldronR, helm, visor, crest, coreGroup, shield, muzzle);
  body.position.set(0, 0.14, 0);

  root.add(base, body);
  return root;
}

/** Last Warden body: tall gilded mirror of the courier. Parts follow last_warden_body.glb. */
export function bossBodyPlaceholder(): Group {
  const root = part('last_warden_body');
  const robe = piece(new ConeGeometry(0.34, 0.72, 8), 'gold', 0, -0.24, 0);
  const sash = piece(new BoxGeometry(0.4, 0.06, 0.36), 'vermilion_dark', 0, -0.05, 0);
  const mantleCape = piece(new ConeGeometry(0.42, 0.3, 8), 'gold_dark', 0, 0, -0.02);
  const mantle = part('last_warden_body_mantle', mantleCape);
  mantle.position.set(0, 0.4, 0);
  const hood = piece(new ConeGeometry(0.2, 0.34, 6), 'ivory', 0, 0.1, -0.03);
  const plate = piece(new SphereGeometry(0.13, 7, 5), 'ivory', 0, 0, 0);
  plate.scale.set(1, 1.2, 0.42);
  const eyeL = piece(new BoxGeometry(0.06, 0.02, 0.02), 'vermilion_dark', -0.05, 0.02, 0.05);
  const eyeR = piece(new BoxGeometry(0.06, 0.02, 0.02), 'vermilion_dark', 0.05, 0.02, 0.05);
  const mask = part('last_warden_body_mask', plate, eyeL, eyeR);
  mask.position.set(0, 0.0, 0.12);
  const head = part('last_warden_body_head', hood, mask);
  head.position.set(0, 0.48, 0);
  const body = part('last_warden_body_body', robe, sash, mantle, head);
  body.position.set(0, 0.6, 0);
  root.add(body);
  return root;
}

/** Last Warden heart: a floating cage with a core on a chain to its true ground position. */
export function bossHeartPlaceholder(): Group {
  const root = part('last_warden_heart');
  const chain = piece(new CylinderGeometry(0.012, 0.012, 0.6, 4), 'gold_dark', 0, 0.3, 0);
  const ringA = piece(new TorusGeometry(0.2, 0.018, 4, 14), 'gold', 0, 0, 0);
  const ringB = piece(new TorusGeometry(0.2, 0.018, 4, 14), 'gold', 0, 0, 0);
  ringB.rotation.y = Math.PI / 2;
  const coreGem = piece(new IcosahedronGeometry(0.12, 0), 'vermilion', 0, 0, 0);
  const core = part('last_warden_heart_core', coreGem);
  const cage = part('last_warden_heart_cage', ringA, ringB, core);
  cage.position.set(0, 0.7, 0);
  root.add(chain, cage);
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

/** Lane emitter: replaces a perimeter wall tile; aperture on the -Y (Three +Z) face, 0.2 m up. */
export function laneEmitterPlaceholder(): Group {
  const root = part('lane_emitter');
  const block = piece(new BoxGeometry(1, 0.5, 1), 'gold_dark', 0.5, 0.25, -0.5);
  const rod = piece(new CylinderGeometry(0.08, 0.08, 0.8, 6), 'lane_violet', 0.5, 0.56, -0.5);
  rod.rotation.z = Math.PI / 2;
  const body = part('lane_emitter_body', block, rod);
  const aperture = new Object3D();
  aperture.name = 'lane_emitter_aperture';
  aperture.position.set(0.5, 0.2, 0);
  root.add(body, aperture);
  return root;
}

/** 2 x 1 exit-zone inlay, origin lower-left, top just above the floor. */
export function thresholdInlayPlaceholder(): Group {
  const root = part('threshold_inlay');
  const slab = piece(new BoxGeometry(1.96, 0.02, 0.96), 'ivory_shadow', 1, -0.008, -0.5);
  const rim = piece(new BoxGeometry(1.7, 0.024, 0.08), 'gold', 1, -0.006, -0.5);
  root.add(part('threshold_inlay_inlay', slab, rim));
  return root;
}

export function urnPlaceholder(): Group {
  const root = part('urn');
  root.add(part('urn_vessel', piece(new CylinderGeometry(0.14, 0.1, 0.32, 7), 'ivory', 0, 0.16, 0), piece(new CylinderGeometry(0.15, 0.15, 0.04, 7), 'gold', 0, 0.33, 0)));
  return root;
}

export function bannerPostPlaceholder(): Group {
  const root = part('banner_post');
  const post = part('banner_post_post', piece(new CylinderGeometry(0.03, 0.04, 1.9, 5), 'gold', 0, 0.95, 0), piece(new BoxGeometry(0.7, 0.04, 0.04), 'gold', 0.33, 1.82, 0));
  const cloth = part('banner_post_cloth', piece(new BoxGeometry(0.5, 0.8, 0.02), 'cobalt', 0, -0.42, 0));
  cloth.position.set(0.33, 1.8, 0);
  root.add(post, cloth);
  return root;
}

export function lampPostPlaceholder(): Group {
  const root = part('lamp_post');
  root.add(part('lamp_post_lamp', piece(new CylinderGeometry(0.035, 0.05, 1.3, 5), 'gold_dark', 0, 0.65, 0), piece(new IcosahedronGeometry(0.12, 0), 'ivory', 0, 1.4, 0)));
  return root;
}

/** "Signal House" station kiosk: house, swinging bell, semaphore arm on a mast at x = +1.2. */
export function stationKioskPlaceholder(): Group {
  const root = part('station_kiosk');
  const house = part(
    'station_kiosk_house',
    piece(new BoxGeometry(1.6, 1.2, 1.2), 'ivory', 0, 0.6, 0),
    piece(new ConeGeometry(1.2, 0.9, 4), 'cobalt', 0, 1.65, 0),
    piece(new CylinderGeometry(0.04, 0.05, 2.6, 5), 'gold_dark', 1.2, 1.3, 0.07),
  );
  const bell = part('station_kiosk_bell', piece(new ConeGeometry(0.16, 0.24, 7), 'gold', 0, -0.12, 0));
  bell.position.set(0, 2.84, 0);
  const arm = part('station_kiosk_signal_arm', piece(new BoxGeometry(0.7, 0.07, 0.04), 'ivory', 0.35, 0, 0));
  arm.position.set(1.2, 2.62, 0.07);
  root.add(house, bell, arm);
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
    case 'warden':
      return wardenPlaceholder();
    case 'last_warden_body':
      return bossBodyPlaceholder();
    case 'last_warden_heart':
      return bossHeartPlaceholder();
    case 'floor_tile':
      return floorTilePlaceholder();
    case 'wall_block':
      return wallBlockPlaceholder();
    case 'exit_gate':
      return gatePlaceholder();
    case 'distant_engine':
      return part('distant_engine');
    case 'lane_emitter':
      return laneEmitterPlaceholder();
    case 'threshold_inlay':
      return thresholdInlayPlaceholder();
    case 'urn':
      return urnPlaceholder();
    case 'banner_post':
      return bannerPostPlaceholder();
    case 'lamp_post':
      return lampPostPlaceholder();
    case 'station_kiosk':
      return stationKioskPlaceholder();
  }
}
