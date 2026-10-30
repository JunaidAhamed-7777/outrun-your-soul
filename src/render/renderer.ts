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
import { BodyView, GateView, SentryView, SoulView, approach } from './actors';
import { loadModels, type ModelLibrary } from './assets';
import { buildBackdrop, type Backdrop } from './backdrop';
import { fitCamera, type CameraFit } from './camera';
import { worldToSim } from './contract';
import { EffectSystem } from './effects';
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
}

export interface RenderStats {
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

  const lib: ModelLibrary = await loadModels();
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

  const body = new BodyView(lib, spot);
  const soul = new SoulView(lib, spot);
  const ribbon = new RibbonView();
  const preview = new PreviewView();
  const bolts = new BoltLayer(spot);
  const lanes = new LaneLayer();
  const effects = new EffectSystem(spot, star);
  effects.reducedMotion = reducedMotion;
  const sentries = new Map<number, SentryView>();
  const telegraphs = new Map<number, TelegraphView>();
  scene.add(lanes.group, ribbon.group, soul.root, body.root, bolts.group, preview.group, effects.group);

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
    fit = fitCamera({ roomWidth: room.width, roomHeight: room.height, viewportWidth: w, viewportHeight: h });
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
    defeat = 0;
  }

  function setRoom(next: RoomDef): void {
    clearDynamic();
    if (room !== next) {
      roomView?.dispose();
      backdrop?.dispose();
      gate?.dispose();
      room = next;
      roomView = buildRoomView(next, lib);
      scene.add(roomView.group);
      const pitch = fitCamera({ roomWidth: next.width, roomHeight: next.height, viewportWidth: 1, viewportHeight: 1 }).pitch;
      backdrop = buildBackdrop(next, pitch, lib);
      scene.background = backdrop.background;
      scene.add(backdrop.group);
      gate = new GateView(lib, spot, roomView.gateAnchor, roomView.exitGlow);
      scene.add(gate.root);
      // Warm low sun from the south-east so the camera sees lit faces.
      sun.position.set(next.width / 2 + 6, 9, -next.height / 2 + 7);
      sun.target.position.set(next.width / 2, 0, -next.height / 2);
    }
    resize();
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
        case 'victory':
          gate?.victory();
          break;
        case 'rejected':
        case 'queueExpired':
          effects.invalid(state.body.pos);
          break;
        default:
          break;
      }
    }
  }

  function render(state: SimState, alpha: number, overlay: RenderOverlay, realDt: number): void {
    if (contextLost || !room) return;
    const dt = Math.min(0.1, Math.max(0, realDt));
    time += dt;

    body.update(state, alpha, dt, time, reducedMotion);
    soul.update(state, alpha, dt, time, reducedMotion, body.pos);

    const seen = seenEnemies;
    seen.clear();
    for (const enemy of state.enemies) {
      seen.add(enemy.id);
      let view = sentries.get(enemy.id);
      if (!view) {
        view = new SentryView(lib, spot, enemy);
        sentries.set(enemy.id, view);
        scene.add(view.root);
      }
      view.update(enemy, dt, time, reducedMotion);
      let tele = telegraphs.get(enemy.id);
      if (!tele) {
        tele = new TelegraphView(enemy.target);
        telegraphs.set(enemy.id, tele);
        scene.add(tele.group);
      }
      tele.update(enemy, room, enemy.target === 'body' ? body.pos : soul.pos, dt, reducedMotion);
    }
    for (const [id, view] of sentries) {
      if (seen.has(id)) continue;
      view.dispose();
      sentries.delete(id);
      telegraphs.get(id)?.dispose();
      telegraphs.delete(id);
    }

    ribbon.update(state, soul.pos, body.pos, dt, reducedMotion);
    preview.update(
      state,
      body.pos,
      { dash: overlay.dashPreview, cancel: overlay.aimCancel, queued: overlay.queued, ret: overlay.returnPreview },
      dt,
      reducedMotion,
    );
    bolts.update(state.projectiles, alpha, time);
    lanes.update(state.lanes, dt, reducedMotion);
    gate?.update(state.gate, dt, time, reducedMotion);
    effects.update(dt, body.pos);
    backdrop?.update(time, dt, reducedMotion);

    defeat = approach(defeat, state.outcome === 'defeat' ? 1 : 0, 2.5, dt);
    hemi.intensity = 1.55 * (1 - defeat * 0.45);
    sun.intensity = 2.6 * (1 - defeat * 0.6);

    placeCamera();
    gl.render(scene, camera);
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
      for (const id of ['courier_body', 'soul_mask', 'needler', 'keeper', 'floor_tile', 'wall_block', 'exit_gate', 'distant_engine'] as const) {
        models[id] = lib.source(id);
      }
      return {
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
