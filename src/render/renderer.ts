/**
 * Three.js presentation of the simulation. Reads SimState and SimEvents; never decides
 * gameplay. Fixed portrait orthographic camera over the 2D gameplay plane.
 */
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { DashPreview, ReturnPreview, RoomDef, SimEvent, SimState } from '../sim/types';
import { TUNING } from '../sim/tuning';
import type { Vec2 } from '../sim/vec';
import { BodyView, GateView, SentryView, SoulView, approach, lerpVec } from './actors';
import { BossBodyView, BossLayer, HeartView } from './boss';
import { RelicLayer } from './relics';
import { buildStation, STATION_SIZE, STATION_SPOT, type StationView } from './station';
import { loose, relicView, roleKind, type LooseEvent } from './simext';
import { WardenView } from './warden';
import { loadModels, type ModelLibrary } from './assets';
import { buildBackdrop, type Backdrop } from './backdrop';
import { fitCamera, type CameraFit } from './camera';
import { MODEL_IDS, worldToSim } from './contract';
import { EffectSystem } from './effects';
import { GroundBatch } from './groundBatch';
import { BOLT_HEIGHT, BoltLayer, LaneLayer } from './hazards';
import { disposeSharedMaterials } from './materials';
import { PreviewView, RibbonView, TelegraphView } from './overlays';
import { buildRoomView, type RoomView } from './room';
import { radialSpot, starSpot } from './textures';

export interface RenderOverlay {
  /** From sim previewDash while aiming. */
  dashPreview: DashPreview | null;
  /** Gesture in cancel zone: show a cancel state instead of the preview. */
  aimCancel: boolean;
  /** Subtle meet-point marker on the ribbon when separated. */
  returnPreview: ReturnPreview | null;
  /** One buffered intent waiting: pulse the preview/endpoint. */
  queued: boolean;
}

export interface RendererOptions {
  reducedMotion: boolean;
  maxPixelRatio?: number;
  /** Called once when the WebGL context is lost; rendering stops until it is restored. */
  onContextLost?: () => void;
  /** Model loading progress for the boot screen (models parsed so far, total). */
  onLoadProgress?: (loaded: number, total: number) => void;
}

export interface RenderStats {
  /** Average CPU time of render() in milliseconds (exponential moving average). */
  cpuMs: number;
  /** Worst render() CPU time in the last ~2 seconds, milliseconds. */
  cpuMsMax: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  models: Record<string, 'glb' | 'placeholder'>;
}

export interface GameRenderer {
  readonly canvas: HTMLCanvasElement;
  setRoom(room: RoomDef): void;
  render(state: SimState, alpha: number, overlay: RenderOverlay, realDt: number): void;
  handleEvents(events: readonly SimEvent[], state: SimState): void;
  /** Raycast client (viewport CSS px) coordinates to the ground plane; simulation coords. */
  screenToGround(clientX: number, clientY: number): Vec2 | null;
  /** Ground point to CSS px relative to the canvas's top-left corner. */
  groundToScreen(p: Vec2): { x: number; y: number } | null;
  resize(): void;
  setReducedMotion(on: boolean): void;
  dispose(): void;
  /** True while the WebGL context is lost. */
  readonly contextLost: boolean;
  /** Draw-call/triangle numbers from the last frame (dev diagnostics). */
  stats(): RenderStats;
  /** Dev diagnostics only: visible renderables grouped by top-level scene child. */
  drawBreakdown(): Record<string, number>;
  /** Dev diagnostics only: magnify around a ground point (null restores the game framing). */
  debugCloseUp(center: Vec2 | null, zoom?: number): void;
  /** Dev diagnostics only: the live scene graph. */
  debugScene(): Scene;
  /** Quick iris close on the body (<= 0.35 s; instant in reduced motion). Resolves when covered. */
  transitionOut(): Promise<void>;
  /** Quick iris open on the body (<= 0.35 s; instant in reduced motion). Resolves when clear. */
  transitionIn(): Promise<void>;
  /** Swap the room for the "Signal House" station backdrop (courier and soul stand reunited). */
  showStation(): void;
  /** Return to the current room view. */
  hideStation(): void;
  /** Station feedback: 'pick' swings the bell (draft confirmed), 'depart' lowers the signal arm. */
  stationSignal(kind: 'pick' | 'depart'): void;
}

export function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

const CAMERA_DISTANCE = 60;
const EMPTY_OVERLAY: RenderOverlay = { dashPreview: null, aimCancel: false, returnPreview: null, queued: false };

export async function createRenderer(container: HTMLElement, options: RendererOptions): Promise<GameRenderer> {
  if (!isWebGL2Available()) throw new Error('WebGL2 is not available on this device/browser.');

  const gl = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
  const maxPixelRatio = options.maxPixelRatio ?? 2;
  gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  const canvas = gl.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

  const hemi = new HemisphereLight(new Color('#dfe6ff'), new Color('#3a2d5e'), 1.55);
  const sun = new DirectionalLight(new Color('#fff0d6'), 2.6);
  scene.add(hemi, sun, sun.target);

  const lib: ModelLibrary = await loadModels(undefined, options.onLoadProgress);
  const spot = radialSpot(0.0);
  const star = starSpot();

  let reducedMotion = options.reducedMotion;
  let contextLost = false;
  let room: RoomDef | null = null;
  let roomView: RoomView | null = null;
  let backdrop: Backdrop | null = null;
  let gate: GateView | null = null;
  let fit: CameraFit | null = null;
  let time = 0;
  let defeat = 0;
  let closeUp: { center: Vec2; zoom: number } | null = null;
  let station: StationView | null = null;
  let stationMode = false;

  const body = new BodyView(lib, spot);
  const soul = new SoulView(lib, spot);
  const ribbon = new RibbonView();
  const preview = new PreviewView();
  const bolts = new BoltLayer(spot);
  const lanes = new LaneLayer();
  const effects = new EffectSystem(spot, star);
  effects.reducedMotion = reducedMotion;
  const sentries = new Map<number, SentryView | WardenView | HeartView | BossBodyView>();
  const relicLayer = new RelicLayer(lib);
  const ground = new GroundBatch(spot);
  const bossLayer = new BossLayer(lib, spot);
  let cpuMs = 0;
  let cpuMsMax = 0;
  let cpuWindowMax = 0;
  let cpuWindowStart = 0;
  const telegraphs = new Map<number, TelegraphView>();
  scene.add(ground.shadows, ground.rings, lanes.group, ribbon.group, relicLayer.group, bossLayer.group, soul.root, body.root, bolts.group, preview.group, effects.group);

  const raycaster = new Raycaster();
  const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  const ndc = new Vector2();
  const hitPoint = new Vector3();
  const projected = new Vector3();
  const seenEnemies = new Set<number>();

  function onContextLost(event: Event): void {
    event.preventDefault();
    if (contextLost) return;
    contextLost = true;
    options.onContextLost?.();
  }
  function onContextRestored(): void {
    contextLost = false;
  }
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  function applyCamera(): void {
    if (!room) return;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    const size = stationMode ? STATION_SIZE : room;
    fit = fitCamera({ roomWidth: size.width, roomHeight: size.height, viewportWidth: w, viewportHeight: h });
    const z = closeUp?.zoom ?? 1;
    camera.left = -fit.viewWidth / 2 / z;
    camera.right = fit.viewWidth / 2 / z;
    camera.top = fit.viewHeight / 2 / z;
    camera.bottom = -fit.viewHeight / 2 / z;
    camera.updateProjectionMatrix();
    placeCamera();
  }

  function placeCamera(): void {
    if (!fit) return;
    const [x, y, z] = fit.position(CAMERA_DISTANCE);
    const o = effects.cameraOffset;
    const dx = closeUp ? closeUp.center.x - fit.target.x : 0;
    const dy = closeUp ? closeUp.center.y - fit.target.y : 0;
    camera.position.set(x + o.x + dx, y + o.y, z + o.z - dy);
    camera.lookAt(fit.target.x + o.x + dx, o.y, -fit.target.y + o.z - dy);
    camera.updateMatrixWorld();
  }

  function resize(): void {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    gl.setSize(w, h, false);
    applyCamera();
  }

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  observer?.observe(container);
  window.addEventListener('resize', resize);

  function clearDynamic(): void {
    for (const view of sentries.values()) view.dispose();
    sentries.clear();
    for (const view of telegraphs.values()) view.dispose();
    telegraphs.clear();
    bolts.clear();
    lanes.clear();
    effects.clear();
    bossLayer.clear();
    defeat = 0;
  }

  function setRoom(next: RoomDef): void {
    clearDynamic();
    if (room !== next) {
      roomView?.dispose();
      backdrop?.dispose();
      gate?.dispose();
      room = next;
      roomView = buildRoomView(next, lib, spot);
      scene.add(roomView.group);
      const pitch = fitCamera({ roomWidth: next.width, roomHeight: next.height, viewportWidth: 1, viewportHeight: 1 }).pitch;
      backdrop = buildBackdrop(next, pitch, lib);
      scene.background = backdrop.background;
      scene.add(backdrop.group);
      gate = new GateView(lib, spot, roomView.gateAnchor, roomView.exitGlow, roomView.thresholdMaterials);
      scene.add(gate.root);
      // Warm low sun from the south-east so the camera sees lit faces.
      sun.position.set(next.width / 2 + 6, 9, -next.height / 2 + 7);
      sun.target.position.set(next.width / 2, 0, -next.height / 2);
    }
    if (roomView) lanes.setApertures(roomView.laneApertures, spot);
    resize();
    // A room built while the station is showing stays hidden until hideStation().
    if (stationMode) setStationMode(true);
  }

  function enemyById(state: SimState, id: number) {
    return state.enemies.find((e) => e.id === id);
  }

  function exitCentre(): Vec2 | null {
    return room ? { x: room.exit.x + room.exit.w / 2, y: room.exit.y + room.exit.h / 2 } : null;
  }

  function handleEvents(events: readonly SimEvent[], state: SimState): void {
    for (const e of events) {
      switch (e.type) {
        case 'dashStart': {
          const d = Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y);
          effects.dash(e.from, e.to, d / TUNING.dashSpeed);
          break;
        }
        case 'separated':
          soul.separatedPulse();
          break;
        case 'reunion':
          effects.reunion(e.at, e.cause === 'contact');
          break;
        case 'cut':
          effects.cut(e.at);
          break;
        case 'kill':
          effects.kill(e.at);
          if (e.cause === 'burst') effects.sparkle(e.at, new Color('#d9a43c'), 0.9);
          break;
        case 'hit':
          effects.hit(e.at);
          if (e.endpoint === 'body') body.hit();
          else soul.hit();
          break;
        case 'shielded':
          effects.shielded(e.at, e.reason);
          break;
        case 'wake': {
          const enemy = enemyById(state, e.enemyId);
          if (enemy) effects.alert(enemy.pos, enemy.radius);
          break;
        }
        case 'telegraph': {
          const enemy = enemyById(state, e.enemyId);
          if (enemy && e.phase === 'locked') effects.ring(enemy.pos, new Color('#ffb21e'), enemy.radius, enemy.radius * 1.6, 0.25, { thickness: 0.25 });
          break;
        }
        case 'fire':
          effects.muzzle(e.at, BOLT_HEIGHT + 0.25);
          break;
        case 'projectileGone':
          if (e.reason !== 'endpoint') effects.fizzle(e.at);
          break;
        case 'gate': {
          const at = exitCentre();
          if (at && e.status === 'open') effects.gate(at);
          break;
        }
        case 'roomCleared': {
          const at = exitCentre();
          if (at) effects.ring(at, new Color('#d9a43c'), 0.5, 3.2, 0.9, { thickness: 0.08 });
          break;
        }
        case 'boss':
          handleBossEvent(e);
          break;
        case 'knotMarked':
          effects.sparkle({ x: body.pos.x, y: body.pos.y - 0.46 }, new Color('#e8411f'), 0.6);
          break;
        case 'decoyClaimed': {
          // The claiming sentry's aim snaps onto the decoy: amber pulse on the ghost.
          effects.ring(e.at, new Color('#ffb21e'), 0.15, 0.6, 0.3, { thickness: 0.3 });
          const enemy = enemyById(state, e.enemyId);
          if (enemy) effects.streak(enemy.pos, e.at, new Color('#ffb21e'), 0.12);
          break;
        }
        case 'victory':
          gate?.victory();
          break;
        case 'rejected':
        case 'queueExpired':
          effects.invalid(state.body.pos);
          break;
        default:
          handleExtraEvent(loose(e), state);
          break;
      }
    }
  }

  function render(state: SimState, alpha: number, overlay: RenderOverlay, realDt: number): void {
    if (contextLost || !room) return;
    const cpuStart = performance.now();
    if (stationMode && station) {
      renderStation(state, Math.min(0.1, Math.max(0, realDt)), cpuStart);
      return;
    }
    const dt = Math.min(0.1, Math.max(0, realDt));
    time += dt;

    body.update(state, alpha, dt, time, reducedMotion);
    soul.update(state, alpha, dt, time, reducedMotion, body.pos);
    ground.begin();
    if (state.body.mode !== 'exited') ground.shadow(body.pos, 0.85, 0.9);
    if (soul.separation > 0.3) ground.shadow(soul.pos, 0.6, 0.45 * soul.separation);

    const seen = seenEnemies;
    seen.clear();
    for (const enemy of state.enemies) {
      if (enemy.hidden) continue; // not arrived yet: its 'wake' event plays the spawn-in effect
      seen.add(enemy.id);
      const kind = roleKind(enemy);
      if (enemy.phase !== 'dead') {
        if (kind === 'boss_heart') ground.shadow(enemy.pos, 0.5, 0.4);
        else {
          ground.shadow(enemy.pos, kind === 'warden' ? 1.3 : kind === 'boss_body' ? 1.4 : 1.0, 0.8);
          if (kind === 'needler' || kind === 'keeper' || kind === 'unknown') ground.ring(enemy.pos, enemy.radius);
        }
      }
      let view = sentries.get(enemy.id);
      if (!view) {
        if (kind === 'warden') view = new WardenView(lib, spot, enemy);
        else if (kind === 'boss_body') view = new BossBodyView(lib, enemy.radius);
        else if (kind === 'boss_heart') view = new HeartView(lib, spot, enemy.radius);
        else view = new SentryView(lib, spot, enemy);
        sentries.set(enemy.id, view);
        scene.add(view.root);
      }
      if (view instanceof HeartView) {
        view.root.visible = enemy.phase !== 'dead';
        view.update(enemy.pos, time, reducedMotion);
      } else if (view instanceof BossBodyView) {
        view.root.visible = enemy.phase !== 'dead';
        view.update(enemy.pos, enemy.facing, body.pos, dt, time, reducedMotion);
      } else {
        view.update(enemy, dt, time, reducedMotion);
      }
      // Line telegraphs belong to the bolt roles; wardens draw their own sweep sector.
      if (kind === 'needler' || kind === 'keeper' || kind === 'unknown') {
        let tele = telegraphs.get(enemy.id);
        if (!tele) {
          tele = new TelegraphView(enemy.target);
          telegraphs.set(enemy.id, tele);
          scene.add(tele.group);
        }
        tele.update(enemy, room, enemy.target === 'body' ? body.pos : soul.pos, dt, reducedMotion);
      }
    }
    for (const [id, view] of sentries) {
      if (seen.has(id)) continue;
      view.dispose();
      sentries.delete(id);
      telegraphs.get(id)?.dispose();
      telegraphs.delete(id);
    }

    // The Last Warden's parts cast shadows too (positions straight from the simulation).
    const boss = state.boss;
    if (boss && boss.phase !== 'dead') {
      ground.shadow(lerpVec(boss.body.prevPos, boss.body.pos, alpha), 1.5, 0.9);
      ground.shadow(lerpVec(boss.heart.prevPos, boss.heart.pos, alpha), 0.6, 0.45);
    }
    ground.end(time, reducedMotion);
    const relics = relicView(state);
    ribbon.update(state, soul.pos, body.pos, dt, reducedMotion, relics.boosting);
    relicLayer.update(state, relics, soul.pos, body.pos, dt, reducedMotion);
    bossLayer.update(state, alpha, dt, reducedMotion, body.pos, room);
    preview.update(
      state,
      body.pos,
      { dash: overlay.dashPreview, cancel: overlay.aimCancel, queued: overlay.queued, ret: overlay.returnPreview },
      dt,
      reducedMotion,
    );
    bolts.update(state.projectiles, alpha, time, soul.pos, relics.haloRadius);
    lanes.update(state.lanes, dt, reducedMotion);
    gate?.update(state.gate, dt, time, reducedMotion);
    effects.update(dt, body.pos);
    backdrop?.update(time, dt, reducedMotion);
    roomView?.update(time, reducedMotion);

    defeat = approach(defeat, state.outcome === 'defeat' ? 1 : 0, 2.5, dt);
    hemi.intensity = 1.55 * (1 - defeat * 0.45);
    sun.intensity = 2.6 * (1 - defeat * 0.6);

    placeCamera();
    gl.render(scene, camera);

    const spent = performance.now() - cpuStart;
    cpuMs = cpuMs === 0 ? spent : cpuMs * 0.95 + spent * 0.05;
    cpuWindowMax = Math.max(cpuWindowMax, spent);
    if (cpuStart - cpuWindowStart > 2000) {
      cpuMsMax = cpuWindowMax;
      cpuWindowMax = 0;
      cpuWindowStart = cpuStart;
    }
  }

  /** Station frame: the pair stands reunited at the kiosk; room-only layers are hidden. */
  function renderStation(state: SimState, dt: number, cpuStart: number): void {
    time += dt;
    const posed: SimState = {
      ...state,
      body: { ...state.body, pos: STATION_SPOT, prevPos: STATION_SPOT, mode: 'ready', dash: null, facing: { x: 0.35, y: -1 } },
      soul: { ...state.soul, pos: STATION_SPOT, prevPos: STATION_SPOT },
      route: { points: [], length: 0 },
      graceLeft: 0,
      outcome: 'playing',
    };
    body.update(posed, 1, dt, time, reducedMotion);
    soul.update(posed, 1, dt, time, reducedMotion, body.pos);
    ground.begin();
    ground.shadow(STATION_SPOT, 0.85, 0.9);
    ground.end(time, reducedMotion);
    station!.update(time, dt, reducedMotion);
    effects.update(dt, body.pos);
    placeCamera();
    gl.render(scene, camera);
    const spent = performance.now() - cpuStart;
    cpuMs = cpuMs === 0 ? spent : cpuMs * 0.95 + spent * 0.05;
  }

  function setStationMode(on: boolean): void {
    if (on && !station) {
      station = buildStation(lib);
      scene.add(station.group);
    }
    stationMode = on;
    if (station) {
      station.group.visible = on;
      if (on) station.reset();
    }
    const roomLayers = [roomView?.group, backdrop?.group, gate?.root, lanes.group, bolts.group, ribbon.group, preview.group, relicLayer.group, bossLayer.group, ground.rings];
    for (const layer of roomLayers) if (layer) layer.visible = !on;
    for (const view of sentries.values()) view.root.visible = !on;
    for (const tele of telegraphs.values()) tele.group.visible = !on;
    effects.clear();
    applyCamera();
  }

  function handleBossEvent(e: Extract<SimEvent, { type: 'boss' }>): void {
    switch (e.what) {
      case 'wake':
        effects.alert(e.at, 0.9);
        effects.addShake(0.06);
        break;
      case 'telegraph':
        effects.ring(e.at, new Color('#ffb21e'), 0.7, 1.4, 0.3, { thickness: 0.2 });
        break;
      case 'charge':
        effects.dash(e.at, e.path?.[e.path.length - 1] ?? e.at, 0.3);
        effects.addShake(0.05);
        break;
      case 'fan':
        effects.muzzle(e.at, 1.0);
        break;
      case 'heartHit':
        bossLayer.heartHit();
        effects.hit(e.at);
        effects.bellBurst(e.at, 0.9);
        effects.addShake(0.12);
        break;
      case 'stagger':
        effects.clang(e.at);
        break;
      case 'reunited':
        effects.ring(e.at, new Color('#d9a43c'), 0.3, 1.0, 0.4, { thickness: 0.2 });
        break;
      case 'defeated': {
        // A satisfying end: gold and ivory shatter, a wide double ring and a flare.
        effects.kill(e.at);
        effects.burst(e.at, 0.9, new Color('#f4ecd8'), 24, 3.2, 0.09, 0.9);
        effects.burst(e.at, 0.8, new Color('#d9a43c'), 24, 2.8, 0.08, 0.9);
        effects.burst(e.at, 0.6, new Color('#e8411f'), 12, 2.2, 0.06, 0.8);
        effects.ring(e.at, new Color('#d9a43c'), 0.4, 3.4, 0.9, { thickness: 0.06 });
        effects.ring(e.at, new Color('#fff1c8'), 0.2, 2.2, 0.7, { thickness: 0.1 });
        effects.sparkle(e.at, new Color('#fff1c8'), 2.6);
        effects.addShake(0.22);
        break;
      }
      default:
        break;
    }
  }

  function handleExtraEvent(e: LooseEvent, state: SimState): void {
    const enemyView = e.enemyId !== undefined ? sentries.get(e.enemyId) : undefined;
    switch (e.type) {
      case 'guarded':
        if (enemyView instanceof WardenView) enemyView.guarded();
        if (e.at) effects.clang(e.at);
        break;
      case 'sweep':
        if (enemyView instanceof WardenView) enemyView.swept();
        break;
      case 'boost':
        soul.separatedPulse();
        effects.ring(e.at ?? soul.pos, new Color('#dff6ff'), 0.3, 0.9, 0.3, { thickness: 0.2 });
        break;
      case 'charge':
        effects.sparkle(e.at ?? body.pos, new Color('#d9a43c'), 0.7);
        break;
      case 'burst':
        effects.bellBurst(e.at ?? body.pos, e.radius ?? relicView(state).burstRadius ?? 1.5);
        break;
      case 'decoyPlaced':
        if (e.at) {
          effects.ring(e.at, new Color('#d9f1ff'), 0.2, 0.8, 0.4, { thickness: 0.2 });
          effects.sparkle(e.at, new Color('#d9f1ff'));
        }
        break;
      case 'decoyTaken':
        if (e.at) {
          effects.ring(e.at, new Color('#ffb21e'), 0.6, 0.15, 0.3, { thickness: 0.35 });
          effects.burst(e.at, 0.45, new Color('#d9f1ff'), 8, 1.6, 0.04, 0.4);
        }
        break;
      case 'haloEnter':
      case 'haloExit':
        if (e.at) effects.ring(e.at, new Color('#59b8ff'), 0.1, 0.35, 0.2, { thickness: 0.3, opacity: 0.7 });
        break;
      default:
        break;
    }
  }

  // Room transition iris: a transparent hole whose huge box-shadow covers the rest. CSS
  // transitions plus timer-based resolution, so a throttled background tab never hangs.
  const iris = document.createElement('div');
  iris.style.cssText =
    'position:absolute;left:50%;top:50%;width:300vmax;height:300vmax;border-radius:50%;pointer-events:none;' +
    'transform:translate(-50%,-50%);box-shadow:0 0 0 300vmax #0b1233;opacity:0;z-index:5;';
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(iris);
  const IRIS_MS = 320;
  function irisTo(open: boolean): Promise<void> {
    const at = groundToScreen(body.pos) ?? { x: container.clientWidth / 2, y: container.clientHeight / 2 };
    iris.style.left = `${at.x}px`;
    iris.style.top = `${at.y}px`;
    const big = '300vmax';
    if (reducedMotion) {
      iris.style.transition = 'none';
      iris.style.opacity = open ? '0' : '1';
      iris.style.width = iris.style.height = open ? big : '0px';
      return Promise.resolve();
    }
    iris.style.transition = 'none';
    iris.style.opacity = '1';
    iris.style.width = iris.style.height = open ? '0px' : big;
    void iris.offsetWidth;
    iris.style.transition = `width ${IRIS_MS}ms ease-in-out, height ${IRIS_MS}ms ease-in-out`;
    iris.style.width = iris.style.height = open ? big : '0px';
    return new Promise((resolve) =>
      setTimeout(() => {
        if (open) iris.style.opacity = '0';
        resolve();
      }, IRIS_MS + 20),
    );
  }

  function screenToGround(clientX: number, clientY: number): Vec2 | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
    return hit ? worldToSim(hit.x, hit.z) : null;
  }

  function groundToScreen(p: Vec2): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    projected.set(p.x, 0, -p.y).project(camera);
    return { x: ((projected.x + 1) / 2) * rect.width, y: ((1 - projected.y) / 2) * rect.height };
  }

  return {
    canvas,
    setRoom,
    render,
    handleEvents,
    screenToGround,
    groundToScreen,
    resize,
    setReducedMotion(on: boolean) {
      reducedMotion = on;
      effects.reducedMotion = on;
    },
    get contextLost() {
      return contextLost;
    },
    stats() {
      const models: Record<string, 'glb' | 'placeholder'> = {};
      for (const id of MODEL_IDS) {
        models[id] = lib.source(id);
      }
      return {
        cpuMs,
        cpuMsMax: Math.max(cpuMsMax, cpuWindowMax),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        pixelRatio: gl.getPixelRatio(),
        models,
      };
    },
    debugScene() {
      return scene;
    },
    transitionOut() {
      return irisTo(false);
    },
    showStation() {
      setStationMode(true);
    },
    hideStation() {
      setStationMode(false);
    },
    stationSignal(kind: 'pick' | 'depart') {
      station?.signal(kind);
    },
    transitionIn() {
      return irisTo(true);
    },
    debugCloseUp(center: Vec2 | null, zoom = 3) {
      closeUp = center ? { center, zoom } : null;
      applyCamera();
    },
    drawBreakdown() {
      const out: Record<string, number> = {};
      for (const child of scene.children) {
        let n = 0;
        child.traverseVisible((node) => {
          if ((node as { isMesh?: boolean; isSprite?: boolean }).isMesh || (node as { isSprite?: boolean }).isSprite) n++;
        });
        if (n) out[child.name || child.type] = (out[child.name || child.type] ?? 0) + n;
      }
      return out;
    },
    dispose() {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      clearDynamic();
      relicLayer.dispose();
      bossLayer.dispose();
      ground.dispose();
      station?.dispose();
      iris.remove();
      body.dispose();
      soul.dispose();
      ribbon.dispose();
      preview.dispose();
      bolts.dispose();
      lanes.dispose();
      effects.dispose();
      gate?.dispose();
      roomView?.dispose();
      backdrop?.dispose();
      spot.dispose();
      star.dispose();
      disposeSharedMaterials();
      gl.dispose();
      canvas.remove();
    },
  };
}

export { EMPTY_OVERLAY };
