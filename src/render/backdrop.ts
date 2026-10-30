/**
 * Distant scenery north of the courtyard: warm sky, hazy cliffs, golden funeral machinery
 * with slowly turning gears, a viaduct carrying a funeral train, and a mist band. These are
 * camera-facing "cards": a group rotated to face the fixed orthographic camera, so its local
 * XY maps 1:1 to screen units. Placed north of the terrace, everything in the room is
 * always nearer to the camera, so scenery can never cover gameplay.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Path,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RoomDef } from '../sim/types';
import type { ModelLibrary } from './assets';
import { instanceTemplate, type Placement } from './instancing';
import { sharedToon } from './materials';
import { faceted } from './placeholders';
import { radialSpot, verticalGradient } from './textures';

export interface Backdrop {
  readonly group: Group;
  readonly background: Texture;
  update(time: number, dt: number, reducedMotion: boolean): void;
  dispose(): void;
}

/** Decorative-only PRNG (never the rules RNG). */
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

function gearShape(radius: number, teeth: number, hole: number): Shape {
  const shape = new Shape();
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const phase = i % 4;
    const r = phase === 1 || phase === 2 ? radius * 1.12 : radius;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const inner = new Path();
  inner.absarc(0, 0, hole, 0, Math.PI * 2, true);
  shape.holes.push(inner);
  // Spoke windows.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const win = new Path();
    win.absarc(Math.cos(a) * radius * 0.6, Math.sin(a) * radius * 0.6, radius * 0.17, 0, Math.PI * 2, true);
    shape.holes.push(win);
  }
  return shape;
}

function box(w: number, h: number, x: number, y: number): BufferGeometry {
  const g = new PlaneGeometry(w, h);
  g.translate(x, y, 0);
  return g;
}

function dome(r: number, x: number, y: number): BufferGeometry {
  const s = new Shape();
  s.absarc(0, 0, r, 0, Math.PI, false);
  s.lineTo(r, 0);
  const g = new ShapeGeometry(s, 8);
  g.translate(x, y, 0);
  return g;
}

function spire(w: number, h: number, x: number, y: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  const g = new ShapeGeometry(s);
  g.translate(x, y, 0);
  return g;
}

/** Hazy cliff silhouette spanning [x0, x1], base at y = 0. */
function ridge(x0: number, x1: number, rand: () => number, baseH: number, amp: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(x0, -3);
  let x = x0;
  while (x < x1) {
    s.lineTo(x, baseH + rand() * amp);
    x += 0.6 + rand() * 1.4;
  }
  s.lineTo(x1, baseH);
  s.lineTo(x1, -3);
  s.lineTo(x0, -3);
  return new ShapeGeometry(s);
}

export function buildBackdrop(room: RoomDef, pitch: number, lib: ModelLibrary): Backdrop {
  const rand = decorRng(0x5eed + room.width * 31 + room.height);
  const group = new Group();
  group.name = 'backdrop';
  const disposables: { dispose(): void }[] = [];
  // The courtyard ends behind the north perimeter row; scenery lies beyond that edge.
  const edgeY = room.height + 1;
  const cx = room.width / 2;

  const background = verticalGradient(
    [
      [0, '#f3d6a6'],
      [0.35, '#f4c992'],
      [0.62, '#eeaf7c'],
      [1, '#d98b6c'],
    ],
    512,
  );
  disposables.push(background);

  // Camera-facing card stack, anchored just beyond the courtyard edge.
  const cards = new Group();
  cards.name = 'cards';
  cards.position.set(cx, 0, -(edgeY + 0.4));
  cards.rotation.x = -pitch;
  // Card content is authored at ~1.6x; scaling it down reads as distance.
  cards.scale.setScalar(0.62);
  group.add(cards);

  const basic = (hex: string, opacity = 1): MeshBasicMaterial => {
    const m = new MeshBasicMaterial({ color: new Color(hex), transparent: opacity < 1, opacity, depthWrite: false });
    disposables.push(m);
    return m;
  };
  const addCard = (geo: BufferGeometry, mat: MeshBasicMaterial, z: number, name: string): Mesh => {
    const mesh = new Mesh(geo, mat);
    mesh.position.z = z;
    mesh.name = name;
    mesh.renderOrder = -10 + z;
    cards.add(mesh);
    disposables.push(geo);
    return mesh;
  };

  // Sun glow behind everything.
  const sunTex = radialSpot(0.1);
  disposables.push(sunTex);
  const sunMat = new MeshBasicMaterial({
    map: sunTex,
    color: new Color('#fff1c8'),
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  disposables.push(sunMat);
  addCard(new PlaneGeometry(5, 5), sunMat, -6, 'sun').position.set(room.width * 0.22, 3.0, -6);
  const sunDisc = new MeshBasicMaterial({ color: new Color('#fff6dc'), transparent: true, opacity: 0.85, depthWrite: false });
  disposables.push(sunDisc);
  const discShape = new Shape();
  discShape.absarc(0, 0, 0.55, 0, Math.PI * 2, false);
  addCard(new ShapeGeometry(discShape, 24), sunDisc, -5.9, 'sun_disc').position.set(room.width * 0.22, 3.0, -5.9);

  // Far cliffs, two hazy layers (the Blender engine brings its own misty far layer instead).
  if (lib.source('distant_engine') !== 'glb') {
    addCard(ridge(-18, room.width + 18, rand, 1.9, 1.3), basic('#cfa59a'), -5, 'ridge_far').position.x = -cx;
    addCard(ridge(-18, room.width + 18, rand, 1.0, 1.0), basic('#b98f98'), -4.5, 'ridge_near').position.x = -cx;
  }

  function buildProceduralMachinery(): (dt: number) => void {
    // Golden funeral machinery: towers, domes, spires, chimneys (merged per tone).
    const far: BufferGeometry[] = [];
    const near: BufferGeometry[] = [];
    const towerXs = [-7.5, -4.2, -1.2, 2.6, 5.4, 8.8];
    towerXs.forEach((tx, i) => {
      const h = 2.6 + rand() * 2.4;
      const w = 0.7 + rand() * 0.6;
      const target = i % 2 === 0 ? far : near;
      target.push(box(w, h, tx, h / 2 - 0.4));
      target.push(box(w * 1.3, 0.16, tx, h - 0.4));
      if (i % 3 === 0) target.push(dome(w * 0.62, tx, h - 0.32));
      else target.push(spire(w * 0.7, 1.1 + rand(), tx, h - 0.32));
      // Chimney rings.
      target.push(box(w * 1.12, 0.08, tx, h * 0.55));
    });
    // Viaduct deck and arches.
    const deckY = 1.15;
    near.push(box(40, 0.22, 0, deckY));
    for (let x = -19; x <= 19; x += 1.6) {
      near.push(box(0.26, deckY + 1.5, x, (deckY - 1.5) / 2));
    }
    addCard(mergeGeometries(far)!, basic('#e7bf7f'), -3.5, 'machinery_far');
    addCard(mergeGeometries(near)!, basic('#d9a24f'), -2.5, 'machinery_near');
    far.forEach((g) => g.dispose());
    near.forEach((g) => g.dispose());

    // Turning gears.
    const gearDefs = [
      { r: 1.25, teeth: 14, x: -5.6, y: 3.0, z: -3.2, hex: '#e2b56a', speed: 0.09 },
      { r: 0.7, teeth: 10, x: -4.05, y: 2.15, z: -3.1, hex: '#e2b56a', speed: -0.16 },
      { r: 0.95, teeth: 12, x: 6.7, y: 2.7, z: -2.4, hex: '#d29a45', speed: -0.11 },
    ];
    for (const def of gearDefs) {
      const gear = addCard(new ShapeGeometry(gearShape(def.r, def.teeth, def.r * 0.18)), basic(def.hex), def.z, 'gear');
      gear.position.set(def.x, def.y, def.z);
      gear.userData.speed = def.speed;
      gears.push(gear);
    }

    // Funeral train crossing the viaduct: dark carriages with gold lanterns, looping slowly.
    const carriageGeo = mergeGeometries([box(0.9, 0.34, 0, 0.17 + deckY + 0.11), box(0.96, 0.08, 0, 0.38 + deckY + 0.11)])!;
    disposables.push(carriageGeo);
    const train = new InstancedMesh(carriageGeo, basic('#3a2b52'), 7);
    train.name = 'train';
    train.renderOrder = -12;
    train.position.z = -2.3;
    cards.add(train);
    const lanternGeo = box(0.12, 0.12, 0, 0.55 + deckY + 0.11);
    disposables.push(lanternGeo);
    const lanterns = new InstancedMesh(lanternGeo, basic('#ffe2a0'), 7);
    lanterns.renderOrder = -11.9;
    lanterns.position.z = -2.28;
    cards.add(lanterns);
    let trainX = -14;

    const m = new Matrix4();
    const updateTrain = (): void => {
      for (let i = 0; i < 7; i++) {
        m.makeTranslation(trainX - i * 1.05, 0, 0);
        train.setMatrixAt(i, m);
        lanterns.setMatrixAt(i, m);
      }
      train.instanceMatrix.needsUpdate = true;
      lanterns.instanceMatrix.needsUpdate = true;
    };
    updateTrain();
    return (dt: number) => {
      for (const gear of gears) gear.rotation.z += (gear.userData.speed as number) * dt;
      trainX += dt * 0.32;
      if (trainX > 24) trainX = -18;
      updateTrain();
    };
  }

  // The Blender distant engine (if exported) replaces the procedural machinery cards.
  const engineGlb = lib.source('distant_engine') === 'glb';
  const gears: Mesh[] = [];
  let updateMachinery: (dt: number) => void = () => undefined;
  if (!engineGlb) updateMachinery = buildProceduralMachinery();

  // Mist band hiding the machinery bases and softening the terrace line.
  const mistTex = verticalGradient([
    [0, 'rgba(240,190,140,0)'],
    [0.55, 'rgba(236,178,128,0.65)'],
    [1, 'rgba(232,170,122,1)'],
  ]);
  disposables.push(mistTex);
  const mistMat = new MeshBasicMaterial({ map: mistTex, transparent: true, depthWrite: false });
  disposables.push(mistMat);
  addCard(new PlaneGeometry(60, 2.4), mistMat, -1.5, 'mist').position.set(0, 0.25, -1.5);
  const floorHaze = new MeshBasicMaterial({ color: new Color('#e8aa7a'), depthWrite: false });
  disposables.push(floorHaze);
  addCard(new PlaneGeometry(60, 6), floorHaze, -1.4, 'haze_floor').position.set(0, -3.3, -1.4);

  if (engineGlb) {
    // Placement and animation per art/environment-kit.md.
    const engine = lib.instance('distant_engine', true);
    engine.position.set(cx, -3.1, -(room.height + 3.5));
    // Aerial perspective: lift the distant engine toward the warm sky so it sits behind play.
    const haze = new Color('#f2c08f');
    engine.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material instanceof MeshToonMaterial) {
          material.emissive.copy(haze);
          material.emissiveIntensity = 0.3;
          disposables.push(material);
        }
      }
    });
    group.add(engine);
    const gearA = engine.getObjectByName('distant_engine_gear_a');
    const gearB = engine.getObjectByName('distant_engine_gear_b');
    const train = engine.getObjectByName('distant_engine_train');
    updateMachinery = (dt) => {
      gearA?.rotateZ(dt * 0.12);
      gearB?.rotateZ(-dt * 0.16);
      if (train) {
        train.position.x += dt * 0.6;
        if (train.position.x > 17) train.position.x -= 34;
      }
    };
  }

  return {
    group,
    background,
    update(_time, dt, reducedMotion) {
      if (reducedMotion) return;
      updateMachinery(dt);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
}
