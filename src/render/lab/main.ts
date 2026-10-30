/**
 * Render lab (dev only, not in the production build): exercises every renderer state with
 * either a frozen fixture (?scene=still) or an interactive presentation-only mini sim.
 * Drag anywhere and release to dash; quick tap to return. Idle for a few seconds and an
 * autopilot keeps the scene moving for screenshots.
 */
import type { DashPreview, GateStatus, SimEvent, SimState } from '../../sim/types';
import type { Vec2 } from '../../sim/vec';
import { createRenderer, type RenderOverlay } from '../renderer';
import { LAB_ROOM, makeFixtureState, makeLane } from './fixture';
import { MiniSim } from './minisim';
import { RealSim } from './realsim';
import { ROOMS, DEPARTURE_COURT } from '../../content/rooms';

const params = new URLSearchParams(location.search);
const scene = params.get('scene') ?? 'live';
const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;
const controls = document.getElementById('controls')!;

let reducedMotion = params.get('rm') === '1';
const renderer = await createRenderer(app, { reducedMotion, onContextLost: () => (hud.textContent = 'WebGL context lost') });
// ?scene=sim runs the real simulation (room via ?room=<id>); other scenes use lab fixtures.
const realRoom = ROOMS[params.get('room') ?? ''] ?? DEPARTURE_COURT;
renderer.setRoom(scene === 'sim' ? realRoom : LAB_ROOM);

const sim: MiniSim | RealSim = scene === 'sim' ? new RealSim(realRoom) : new MiniSim(makeFixtureState());
const still = makeFixtureState();
let state: SimState = scene === 'still' ? still : sim.state;
const overlay: RenderOverlay = { dashPreview: null, aimCancel: false, returnPreview: null, queued: false };

// --- frozen preview variants for the still scene --------------------------------
const variants: { name: string; make(s: SimState): Partial<RenderOverlay> }[] = [
  { name: 'return marker', make: () => ({ dashPreview: null, returnPreview: { valid: true, meetAt: { x: 4, y: 3.2 }, seconds: 0.4 } }) },
  { name: 'range', make: (s) => ({ dashPreview: fake(s, { x: 6.2, y: 7.1 }, { x: 6.6, y: 7.5 }, 'range') }) },
  { name: 'wall', make: (s) => ({ dashPreview: fake(s, { x: 4.6, y: 7.68 }, { x: 5.0, y: 8.4 }, 'wall') }) },
  { name: 'capacity', make: (s) => ({ dashPreview: fake(s, { x: 1.9, y: 5.5 }, { x: 0.8, y: 5.7 }, 'capacity') }) },
  {
    name: 'contact',
    make: (s) => ({ dashPreview: { ...fake(s, { x: 3.9, y: 2.6 }, { x: 4.2, y: 1.6 }, 'contact'), contact: { at: { x: 3.9, y: 2.6 }, soulAt: { x: 4, y: 2.2 } } } }),
  },
  { name: 'invalid', make: (s) => ({ dashPreview: { ...fake(s, { x: 3.6, y: 5.5 }, { x: 3.6, y: 5.5 }, 'none'), valid: false, reason: 'tooShort' } }) },
  { name: 'cancel', make: () => ({ dashPreview: null, aimCancel: true }) },
  { name: 'queued', make: (s) => ({ dashPreview: fake(s, { x: 5.8, y: 6.2 }, { x: 5.8, y: 6.2 }, 'none'), queued: true }) },
];
let variant = 1;

function fake(s: SimState, end: Vec2, requestedEnd: Vec2, limitedBy: DashPreview['limitedBy']): DashPreview {
  return {
    valid: true,
    from: s.body.pos,
    requestedEnd,
    end,
    limitedBy,
    contact: null,
    capacityAfter: 1.2,
    soulArrivalSeconds: 2,
    queued: false,
  };
}

function applyVariant(): void {
  overlay.dashPreview = null;
  overlay.aimCancel = false;
  overlay.returnPreview = null;
  overlay.queued = false;
  Object.assign(overlay, variants[variant]!.make(state));
}
if (scene === 'still') applyVariant();

// --- controls ------------------------------------------------------------------
function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  controls.appendChild(b);
  return b;
}
const gates: GateStatus[] = ['sealed', 'ready', 'open'];
let gateIndex = 0;
let gateOverride = false;
button('gate', () => {
  gateIndex = (gateIndex + 1) % gates.length;
  gateOverride = true;
  pending.push({ type: 'gate', t: state.time, status: gates[gateIndex]! });
});
button('motion', () => {
  reducedMotion = !reducedMotion;
  renderer.setReducedMotion(reducedMotion);
});
if (scene === 'still') {
  button('preview', () => {
    variant = (variant + 1) % variants.length;
    applyVariant();
  });
  button('lane', () => {
    const lane = state.lanes[0];
    if (lane) state.lanes[0] = makeLane(lane.id, LAB_ROOM, lane.status === 'active' ? 'idle' : lane.status === 'idle' ? 'warning' : 'active');
  });
}
button('hit', () => pending.push({ type: 'hit', t: state.time, endpoint: 'soul', attackId: 1, at: state.soul.pos, health: 3, source: 'bolt' }));
button('kill', () => pending.push({ type: 'kill', t: state.time, enemyId: 1, role: 'needler', at: { x: 2, y: 9 } }));
button('cut', () => pending.push({ type: 'cut', t: state.time, projectileId: 10, at: { x: 3, y: 6 } }));
button('reunion', () => pending.push({ type: 'reunion', t: state.time, at: state.body.pos, cause: 'contact' }));
button('defeat', () => {
  state.outcome = state.outcome === 'defeat' ? 'playing' : 'defeat';
  state.body.mode = state.outcome === 'defeat' ? 'dead' : 'ready';
});

const pending: SimEvent[] = [];

// --- interactive input (lab-only gesture approximation) ------------------------
let down: { id: number; x: number; y: number; t: number; armed: boolean } | null = null;
let lastInput = performance.now();
const canvas = renderer.canvas;
function aimFrom(x: number, y: number): Vec2 | null {
  if (!down) return null;
  const a = renderer.screenToGround(down.x, down.y);
  const b = renderer.screenToGround(x, y);
  if (!a || !b) return null;
  return { x: (b.x - a.x) * 1.6, y: (b.y - a.y) * 1.6 };
}
canvas.addEventListener('pointerdown', (e) => {
  if (down || scene === 'still') return;
  canvas.setPointerCapture(e.pointerId);
  down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), armed: false };
  lastInput = performance.now();
});
canvas.addEventListener('pointermove', (e) => {
  if (!down || e.pointerId !== down.id) return;
  const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (dist > 14) down.armed = true;
  if (!down.armed) return;
  const aim = aimFrom(e.clientX, e.clientY);
  overlay.aimCancel = dist < 16;
  overlay.dashPreview = aim && !overlay.aimCancel ? sim.previewDash(aim) : null;
  lastInput = performance.now();
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || e.pointerId !== down.id) return;
  const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 230;
  if (!down.armed && quick) sim.ret(pending);
  else if (down.armed && dist >= 16) {
    const aim = aimFrom(e.clientX, e.clientY);
    if (aim) sim.dash(aim, pending);
  }
  down = null;
  overlay.dashPreview = null;
  overlay.aimCancel = false;
  lastInput = performance.now();
});
canvas.addEventListener('pointercancel', () => {
  down = null;
  overlay.dashPreview = null;
  overlay.aimCancel = false;
});

// --- autopilot keeps the scene alive when idle ----------------------------------
let autoTimer = 0;
let autoAim: Vec2 | null = null;
let autoAimTime = 0;
function autopilot(dt: number): void {
  if (performance.now() - lastInput < 3000) return;
  const s = sim.state;
  if (autoAim) {
    autoAimTime += dt;
    overlay.dashPreview = sim.previewDash(autoAim);
    if (autoAimTime > 0.55) {
      sim.dash(autoAim, pending);
      autoAim = null;
      overlay.dashPreview = null;
    }
    return;
  }
  autoTimer -= dt;
  if (autoTimer > 0 || s.body.mode !== 'ready') return;
  autoTimer = 0.9 + Math.random() * 0.8;
  const separated = s.route.points.length > 1;
  if (separated && (s.route.length > 4.2 || Math.random() < 0.25)) {
    sim.ret(pending);
    return;
  }
  const alive = s.enemies.filter((e) => e.phase !== 'dead');
  const target =
    alive.length && Math.random() < 0.5
      ? alive[Math.floor(Math.random() * alive.length)]!.pos
      : { x: 1 + Math.random() * 6, y: 1 + Math.random() * 9.5 };
  autoAim = { x: target.x - s.body.pos.x, y: target.y - s.body.pos.y };
  autoAimTime = 0;
}

// --- loop ----------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let frames = 0;
let fpsTime = 0;
let fps = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  tick(dt);
  requestAnimationFrame(frame);
}

function tick(dt: number): void {
  if (scene !== 'still') {
    autopilot(dt);
    acc += dt;
    while (acc >= 1 / 120) {
      sim.step(pending);
      acc -= 1 / 120;
    }
    state = sim.state;
    if (scene !== 'sim') state.gate = gateOverride ? gates[gateIndex]! : 'sealed';
    overlay.returnPreview = down || autoAim ? null : sim.previewReturn();
  } else {
    state.gate = gates[gateIndex]!;
  }
  if (pending.length) {
    renderer.handleEvents(pending.splice(0), state);
  }
  renderer.render(state, scene === 'still' ? 1 : acc * 120, overlay, dt);
  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = frames / fpsTime;
    frames = 0;
    fpsTime = 0;
    const st = renderer.stats();
    const glbs = Object.entries(st.models)
      .filter(([, v]) => v === 'glb')
      .map(([k]) => k);
    hud.textContent = `${scene}${scene === 'still' ? ` [${variants[variant]!.name}]` : ''} · ${fps.toFixed(0)} fps · calls ${st.calls} · tris ${st.triangles} · dpr ${st.pixelRatio} · glb: ${glbs.join(',') || 'none'}${reducedMotion ? ' · reduced motion' : ''}`;
  }
}
requestAnimationFrame(frame);

/** Drive frames synchronously (the lab may run in a hidden pane where rAF is paused). */
function labAdvance(seconds: number, frameRate = 60): string {
  const n = Math.max(1, Math.round(seconds * frameRate));
  for (let i = 0; i < n; i++) tick(1 / frameRate);
  return hud.textContent ?? '';
}

function labVariant(i: number): string {
  variant = ((i % variants.length) + variants.length) % variants.length;
  applyVariant();
  return variants[variant]!.name;
}

Object.assign(window, { renderer, sim, still, labAdvance, labVariant });
