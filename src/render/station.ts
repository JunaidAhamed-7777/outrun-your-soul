/**
 * Station backdrop ("Signal House"): a small 6 x 5 platform between rooms, composed after
 * art/previews/station-composite-game-camera.png: kiosk at (2.6, 3.0) facing south, lamps and
 * urns on the parapet, a threshold inlay at the departure edge and the distant engine placed so
 * its great gear haloes the house. The bell swings when a draft choice is confirmed; the
 * semaphore arm lowers ~40 degrees to "clear" on departure. Presentation only.
 */
import { Box3, Color, Group, Matrix4, Mesh, MeshToonMaterial, PlaneGeometry, type Object3D } from 'three';
import type { Vec2 } from '../sim/vec';
import type { ModelLibrary } from './assets';
import { instanceTemplate, type Placement } from './instancing';
import { PERIMETER_SCALE } from './kit';
import { toon } from './materials';
import { findPart } from './placeholders';
import { stoneTile } from './textures';

export const STATION_SIZE = { width: 6, height: 5 } as const;
/** Where the reunited courier stands at the station (simulation-plane coordinates). */
export const STATION_SPOT: Vec2 = { x: 2.1, y: 1.5 };

export interface StationView {
  readonly group: Group;
  update(time: number, dt: number, reducedMotion: boolean): void;
  /** 'pick': draft choice confirmed (bell swings). 'depart': signal lowers to clear. */
  signal(kind: 'pick' | 'depart'): void;
  reset(): void;
  dispose(): void;
}

export function buildStation(lib: ModelLibrary): StationView {
  const group = new Group();
  group.name = 'station';
  const disposables: { dispose(): void }[] = [];
  const { width, height } = STATION_SIZE;

  // Platform floor and parapet.
  const floor: Placement[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) floor.push({ matrix: new Matrix4().makeTranslation(x, 0, -y) });
  const stone = stoneTile(128, 5, lib.source('floor_tile') !== 'glb');
  const floorMat = toon('cobalt');
  floorMat.map = lib.source('floor_tile') === 'glb' ? null : stone;
  disposables.push(stone, floorMat);
  group.add(instanceTemplate(lib.template('floor_tile'), floor, 'station_floor', floorMat));
  const walls: Placement[] = [];
  const rim = new Color(0.6, 0.64, 0.8);
  const at = (x: number, y: number, s: number) => {
    const m = new Matrix4().makeTranslation(x, 0, -y).multiply(new Matrix4().makeScale(1, s, 1));
    walls.push({ matrix: m, tint: rim });
  };
  for (let y = -1; y <= height; y++) {
    at(-1, y, PERIMETER_SCALE.side);
    at(width, y, PERIMETER_SCALE.side);
  }
  for (let x = 0; x < width; x++) {
    at(x, height, PERIMETER_SCALE.north);
    if (x < 2 || x > 3) at(x, -1, PERIMETER_SCALE.south);
  }
  group.add(instanceTemplate(lib.template('wall_block'), walls, 'station_walls'));
  const wallTop = new Box3().setFromObject(lib.template('wall_block')).max.y;

  // Departure inlay on the open south edge, lamps and urns on the parapet.
  group.add(instanceTemplate(lib.template('threshold_inlay'), [{ matrix: new Matrix4().makeTranslation(2, 0, 1) }], 'station_inlay'));
  const onWall = (x: number, y: number, scale: number) => ({ matrix: new Matrix4().makeTranslation(x + 0.5, wallTop * scale, -(y + 0.5)) });
  group.add(instanceTemplate(lib.template('urn'), [onWall(-1, height, PERIMETER_SCALE.side), onWall(width, height, PERIMETER_SCALE.side)], 'station_urns'));
  group.add(instanceTemplate(lib.template('lamp_post'), [onWall(-1, 1, PERIMETER_SCALE.side), onWall(width, 1, PERIMETER_SCALE.side)], 'station_lamps'));

  // Plaza beneath the platform, ending behind the north parapet so the engine shows beyond it.
  const plazaGeo = new PlaneGeometry(60, 40);
  plazaGeo.rotateX(-Math.PI / 2);
  const plazaMat = toon('cobalt_deep');
  const plaza = new Mesh(plazaGeo, plazaMat);
  plaza.position.set(width / 2, -0.1, -(height + 1 - 20));
  group.add(plaza);
  disposables.push(plazaGeo, plazaMat);

  // The Signal House.
  const kiosk = lib.instance('station_kiosk', true);
  kiosk.position.set(2.6, 0, -3.0);
  group.add(kiosk);
  const bell: Object3D | undefined = findPart(kiosk, 'station_kiosk', 'bell');
  const arm: Object3D | undefined = findPart(kiosk, 'station_kiosk', 'signal_arm');
  const armRest = arm?.rotation.z ?? 0;

  // Distant engine haloing the house (art composite placement).
  let gearA: Object3D | undefined;
  let gearB: Object3D | undefined;
  let train: Object3D | undefined;
  if (lib.source('distant_engine') === 'glb') {
    const engine = lib.instance('distant_engine', true);
    engine.position.set(9.4, -3.1, -8.5);
    const haze = new Color('#f2c08f');
    engine.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
        if (m instanceof MeshToonMaterial) {
          m.emissive.copy(haze);
          m.emissiveIntensity = 0.3;
          disposables.push(m);
        }
      }
    });
    gearA = engine.getObjectByName('distant_engine_gear_a');
    gearB = engine.getObjectByName('distant_engine_gear_b');
    train = engine.getObjectByName('distant_engine_train');
    group.add(engine);
  }

  let bellSwing = 0;
  let armTarget = 0;
  let armNow = 0;

  return {
    group,
    update(time, dt, reducedMotion) {
      bellSwing = Math.max(0, bellSwing - dt * 0.9);
      if (bell) bell.rotation.x = reducedMotion ? 0 : Math.sin(time * 9) * 0.45 * bellSwing;
      armNow += (armTarget - armNow) * Math.min(1, dt * (reducedMotion ? 60 : 4));
      if (arm) arm.rotation.z = armRest - armNow * ((40 * Math.PI) / 180);
      if (!reducedMotion) {
        gearA?.rotateZ(dt * 0.12);
        gearB?.rotateZ(-dt * 0.16);
        if (train) {
          train.position.x += dt * 0.6;
          if (train.position.x > 17) train.position.x -= 34;
        }
      }
    },
    signal(kind) {
      if (kind === 'pick') bellSwing = 1;
      else armTarget = 1;
    },
    reset() {
      bellSwing = 0;
      armTarget = 0;
      armNow = 0;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      kiosk.traverse((node) => {
        if (node instanceof Mesh) (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => m.dispose());
      });
      group.removeFromParent();
    },
  };
}

