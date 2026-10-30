#!/usr/bin/env node
// End-to-end browser check of the BUILT game under an itch.io-like nested URL.
//
//   npm run e2e                         (vite build, then test dist/)
//   node scripts/e2e.mjs --no-build     (test the existing dist/)
//   node scripts/e2e.mjs --zip latest   (test the newest release ZIP: the exact upload bytes)
//   node scripts/e2e.mjs --browser chrome --headed
//   node scripts/e2e.mjs --seed 7       (run seed for the UI session; the full expedition uses seed + 4)
//
// Uses pinned playwright-core with an ALREADY-INSTALLED system browser (Edge, then
// Chrome). It never downloads a browser. Exit codes: 0 pass, 1 fail, 2 blocked (no browser).
//
// What it covers (emulated phone viewport 375x812, DPR 2, touch, isMobile):
//  A production URL exposes no debug hook; WebGL2 canvas; title + Begin; no console errors
//  B the real UI path with taps: Begin -> starter select -> room 1 (intro card); one REAL touch
//    drag dash (CDP touch events -> Pointer Events) and a REAL short tap RETURN; pause on
//    visibilitychange(hidden) and window blur; a scripted clear of room 1 (tests/sim/bot.ts
//    planning in Node from page state, commands through the ?debug hook) -> Onward -> route
//    choice -> room 2; reload -> Continue restarts that room at entry health; a deliberate
//    defeat -> Retry room restarts it as attempt 2
//  C a full expedition from __oys.start() through every route/draft panel (DOM taps, first
//    offered relic) to the ending, then the lateral Long Reach unlock on the starter panel
//  - load timing, JS heap, and WebGL draw calls/frame measured by instrumenting the context
// Numbers come from a desktop browser (headless, desktop GPU or SwiftShader): they are
// NOT phone evidence. Real-device checks belong in docs/EVIDENCE.md layer C.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';
import { readTree } from './lib/files.mjs';
import { analyzeGltf, parseGlb } from './lib/glb.mjs';
import { startNestedServers } from './lib/nested.mjs';
import { readZip } from './lib/zip.mjs';

const root = process.cwd();
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const previewsDir = join(root, 'art', 'previews');
const VIEWPORT = { width: 375, height: 812 };
const SIM_LIMIT_SECONDS = 150;
/** Run seeds (?seed=N) for the UI-path session and the full expedition; override with --seed. */
const SEED_UI = Number(option('seed') ?? 7) >>> 0;
const SEED_RUN = (SEED_UI + 4) >>> 0;

const checks = [];
const record = (id, ok, detail) => {
  checks.push({ id, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? ` — ${detail}` : ''}`);
};

// ---------------------------------------------------------------------------------
// Package to test
// ---------------------------------------------------------------------------------
let files;
let source;
const zipOption = option('zip');
if (zipOption) {
  let zipPath = zipOption === 'latest' ? null : resolve(root, zipOption);
  if (zipOption === 'latest' && existsSync(join(root, 'release'))) {
    const zips = readdirSync(join(root, 'release')).filter((n) => n.endsWith('.zip'));
    zips.sort((a, b) => statSync(join(root, 'release', b)).mtimeMs - statSync(join(root, 'release', a)).mtimeMs);
    zipPath = zips[0] ? join(root, 'release', zips[0]) : null;
  }
  if (!zipPath || !existsSync(zipPath)) {
    console.error('FAIL: ZIP not found; run "npm run package" first.');
    process.exit(1);
  }
  files = readZip(new Uint8Array(readFileSync(zipPath)));
  source = `ZIP ${zipPath}`;
} else {
  if (!flag('no-build')) {
    console.log('Building (vite build)...');
    execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  }
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    console.error('FAIL: dist/index.html missing; run "npm run build".');
    process.exit(1);
  }
  files = readTree(join(root, 'dist'));
  source = `directory ${join(root, 'dist')}`;
}

// ---------------------------------------------------------------------------------
// Browser (system install only)
// ---------------------------------------------------------------------------------
const wanted = option('browser');
const channels = wanted ? [wanted] : ['msedge', 'chrome'];
let browser = null;
let launchedChannel = null;
const launchErrors = [];
for (const channel of channels) {
  try {
    browser = await chromium.launch({ channel, headless: !flag('headed') });
    launchedChannel = channel;
    break;
  } catch (error) {
    launchErrors.push(`${channel}: ${String(error?.message ?? error).split('\n')[0]}`);
  }
}
if (!browser) {
  console.error('BLOCKED: no installed system browser found for playwright-core (no browser is downloaded by design).');
  for (const e of launchErrors) console.error(`  ${e}`);
  console.error('Install Microsoft Edge or Google Chrome, or pass --browser <msedge|chrome|chrome-beta|msedge-dev>.');
  process.exit(2);
}

// The planner runs in Node on page state: the tested greedy bot, loaded through Vite SSR.
const vite = await createViteServer({
  root,
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
const { botCommand } = await vite.ssrLoadModule('/tests/sim/bot.ts');
// Boss rooms need the boss-aware planner (src/bot): the greedy bot ignores the armoured body.
const { decide: plannerDecide } = await vite.ssrLoadModule('/src/bot/bot.ts');
const { previewDash, TUNING } = await vite.ssrLoadModule('/src/sim/index.ts');

/**
 * Walls-aware distance to `goal` on a 0.25-tile grid (4-neighbour BFS over cells whose
 * centre keeps the body radius clear of walls and bounds). Used only by the e2e stall
 * fallback below; the greedy test bot steers by straight-line distance and can park
 * behind a wall (observed: below Departure Court's plinth with the gate open).
 */
function distanceField(room, goal) {
  const cell = 0.25;
  const r = TUNING.bodyRadius + 0.02;
  const cols = Math.ceil(room.width / cell);
  const rows = Math.ceil(room.height / cell);
  const centre = (i, j) => ({ x: (i + 0.5) * cell, y: (j + 0.5) * cell });
  const free = (p) =>
    p.x >= r && p.y >= r && p.x <= room.width - r && p.y <= room.height - r &&
    !room.walls.some((w) => p.x > w.x - r && p.x < w.x + w.w + r && p.y > w.y - r && p.y < w.y + w.h + r);
  const dist = new Float64Array(cols * rows).fill(Infinity);
  const clampIdx = (v, n) => Math.max(0, Math.min(n - 1, v));
  const gi = clampIdx(Math.floor(goal.x / cell), cols);
  const gj = clampIdx(Math.floor(goal.y / cell), rows);
  const queue = [[gi, gj]];
  dist[gj * cols + gi] = 0;
  for (let q = 0; q < queue.length; q++) {
    const [i, j] = queue[q];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || dist[nj * cols + ni] !== Infinity || !free(centre(ni, nj))) continue;
      dist[nj * cols + ni] = dist[j * cols + i] + cell;
      queue.push([ni, nj]);
    }
  }
  return (p) => dist[clampIdx(Math.floor(p.y / cell), rows) * cols + clampIdx(Math.floor(p.x / cell), cols)];
}

/** Fallback when the greedy bot idles: the previewed dash that best shortens the walls-aware path to its goal. */
function fallbackCommand(s) {
  const alive = s.enemies.filter((e) => e.phase !== 'dead');
  const exit = s.room.exit;
  const goal = alive.length
    ? alive.reduce((a, b) => (Math.hypot(a.pos.x - s.body.pos.x, a.pos.y - s.body.pos.y) <= Math.hypot(b.pos.x - s.body.pos.x, b.pos.y - s.body.pos.y) ? a : b)).pos
    : { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2 };
  const field = distanceField(s.room, goal);
  const here = field(s.body.pos);
  let best = null;
  for (let k = 0; k < 24; k++) {
    for (const d of [1, 2, 3]) {
      const a = (k / 24) * Math.PI * 2;
      const aim = { x: Math.cos(a) * d, y: Math.sin(a) * d };
      const preview = previewDash(s, aim);
      if (!preview.valid) continue;
      const score = field(preview.end);
      if (!best || score < best.score) best = { score, aim };
    }
  }
  if (best && best.score < here - 0.2) return { kind: 'dash', aim: best.aim };
  return s.route.points.length > 0 ? { kind: 'return' } : null;
}

const servers = await startNestedServers(new Map(files.map((f) => [f.path, f.data])));
mkdirSync(previewsDir, { recursive: true });
mkdirSync(join(root, 'art', 'reports'), { recursive: true });

/** Counts WebGL draw calls between animation frames and stamps the first draw. */
const INSTRUMENT = () => {
  const stats = { firstDrawMs: null, frames: [], current: { calls: 0, triangles: 0 } };
  window.__e2e = stats;
  // three.js announces every Scene to __THREE_DEVTOOLS__ ('observe'); keep them for model checks.
  window.__e2eScenes = [];
  const devtools = new EventTarget();
  devtools.addEventListener('observe', (e) => {
    if (e.detail?.isScene) window.__e2eScenes.push(e.detail);
  });
  window.__THREE_DEVTOOLS__ = devtools;
  const wrap = (proto, name, trianglesOf) => {
    const original = proto[name];
    if (!original) return;
    proto[name] = function (...args) {
      if (stats.firstDrawMs === null) stats.firstDrawMs = performance.now();
      stats.current.calls += 1;
      stats.current.triangles += trianglesOf(args);
      return original.apply(this, args);
    };
  };
  const tri = (mode, count, instances = 1) => (mode === 4 ? Math.floor(count / 3) * instances : 0);
  for (const proto of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype].filter(Boolean)) {
    wrap(proto, 'drawArrays', (a) => tri(a[0], a[2]));
    wrap(proto, 'drawElements', (a) => tri(a[0], a[1]));
    wrap(proto, 'drawArraysInstanced', (a) => tri(a[0], a[2], a[3]));
    wrap(proto, 'drawElementsInstanced', (a) => tri(a[0], a[1], a[4]));
  }
  const tick = (t) => {
    if (stats.current.calls > 0) stats.frames.push({ t, calls: stats.current.calls, triangles: stats.current.triangles });
    if (stats.frames.length > 600) stats.frames.shift();
    stats.current = { calls: 0, triangles: 0 };
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** Serialise SimState across the protocol boundary (Set and Infinity survive). */
const SERIALISE = `(s) => JSON.stringify(s, (k, v) => v instanceof Set ? { __set: [...v] } : typeof v === 'number' && !Number.isFinite(v) ? { __num: String(v) } : v)`;
const revive = (json) =>
  JSON.parse(json, (k, v) => {
    if (v && typeof v === 'object' && Array.isArray(v.__set)) return new Set(v.__set);
    if (v && typeof v === 'object' && typeof v.__num === 'string') return Number(v.__num);
    return v;
  });

async function newPhoneContext() {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const problems = { console: [], warnings: [], pageErrors: [], failedRequests: [], aborted: [], finishedOk: new Set() };
  page.on('console', (m) => {
    if (m.type() === 'error') problems.console.push(m.text());
    else if (m.type() === 'warning') problems.warnings.push(m.text());
  });
  page.on('pageerror', (e) => problems.pageErrors.push(String(e?.message ?? e)));
  page.on('requestfailed', (r) => {
    const error = r.failure()?.errorText ?? '';
    if (error === 'net::ERR_ABORTED') problems.aborted.push(r.url());
    else problems.failedRequests.push(`${r.url()} ${error}`);
  });
  page.on('requestfinished', async (r) => {
    const response = await r.response().catch(() => null);
    if (response?.status() === 200) problems.finishedOk.add(r.url());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) problems.failedRequests.push(`${r.url()} HTTP ${r.status()}`);
  });
  await page.addInitScript(INSTRUMENT);
  return { context, page, problems, logStart: servers.log.length };
}

/** Triangle counts of the packaged GLBs, parsed from the exact bytes under test. */
const glbTriangles = new Map(
  files
    .filter((f) => /^assets\/models\/[a-z0-9_]+\.glb$/.test(f.path))
    .map((f) => {
      const id = f.path.slice('assets/models/'.length, -'.glb'.length);
      try {
        return [id, analyzeGltf(parseGlb(f.data).json, id).triangles];
      } catch {
        return [id, null];
      }
    }),
);

/**
 * Which models the live scene renders from their GLB: every scene root named after a
 * packaged model must carry exactly that GLB's triangle count (a primitive placeholder
 * does not). Instanced meshes count their geometry once; modules instanced without a named
 * root (floor, walls, decor) are not visible to this check.
 */
async function sceneModels(page) {
  const ids = [...glbTriangles.keys()];
  const found = await page.evaluate((names) => {
    const out = [];
    for (const scene of window.__e2eScenes ?? []) {
      scene.traverse((o) => {
        if (!names.includes(o.name) || o.parent?.name === o.name) return;
        let tris = 0;
        o.traverse((m) => {
          if (m.isMesh) tris += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
        });
        out.push({ name: o.name, tris });
      });
    }
    return out;
  }, ids);
  const verified = new Set();
  const mismatched = [];
  for (const f of found) {
    if (f.tris === glbTriangles.get(f.name)) verified.add(f.name);
    else mismatched.push(`${f.name} ${f.tris} tris (GLB ${glbTriangles.get(f.name)})`);
  }
  return { verified, mismatched, roots: found.length };
}

/**
 * Console/page/network problems for one context. A top-level page load makes the browser
 * request /favicon.ico from the origin root (outside the nested game path); itch.io runs
 * the game in an iframe, which does not fetch favicons. Exactly those console 404s are
 * exempted, and only when the server log shows no other non-200 response.
 */
function problemsOf(problems, logStart, verifiedModels = new Set()) {
  const served = servers.log.slice(logStart).filter((l) => l.status !== 200);
  const favicon = served.filter((l) => l.path === '/favicon.ico');
  const other = served.filter((l) => l.path !== '/favicon.ico');
  let consoleErrors = problems.console;
  let note = null;
  if (favicon.length > 0 && other.length === 0) {
    const is404 = (m) => /Failed to load resource: .*404/.test(m);
    const n404 = consoleErrors.filter(is404).length;
    if (n404 <= favicon.length) {
      consoleErrors = consoleErrors.filter((m) => !is404(m));
      note = `ignored ${n404} browser-initiated /favicon.ico 404(s) at the origin root (no <link rel="icon"> in index.html; not requested inside the itch iframe)`;
    }
  }
  // Chrome intermittently reports net::ERR_ABORTED for a URL whose request already
  // finished with HTTP 200 (observed on the 400 KB distant_engine.glb, 1 of 3 Chrome runs,
  // never in Edge). Such an abort is noted, not failed; an abort without a successful
  // completion of the same URL is a real failure.
  // Since the iris-transition build, every load also reports courier_body.glb aborted after
  // its 200 response while the scene demonstrably renders that GLB (triangles match). An
  // abort is excused only when the URL finished OK or its model is verified in the scene.
  const modelOf = (url) => /\/assets\/models\/([a-z0-9_]+)\.glb$/.exec(url)?.[1] ?? null;
  const excused = (url) => problems.finishedOk.has(url) || verifiedModels.has(modelOf(url));
  const benign = problems.aborted.filter(excused);
  const realAborts = problems.aborted.filter((url) => !excused(url)).map((url) => `${url} net::ERR_ABORTED`);
  if (benign.length > 0) note = [note, `noted ${benign.length} net::ERR_ABORTED report(s) for resources that finished with HTTP 200 or render from their GLB: ${benign.map((u) => u.split('/').pop()).join(', ')}`].filter(Boolean).join('; ');
  return { list: [...consoleErrors, ...problems.pageErrors, ...problems.failedRequests, ...realAborts, ...other.map((l) => `${l.path} HTTP ${l.status}`)], note };
}

async function shot(page, name) {
  const path = join(previewsDir, `e2e-${name}.png`);
  // Finish CSS fades/transitions so panels are captured in their settled state.
  await page.screenshot({ path, animations: 'disabled' });
  return `art/previews/e2e-${name}.png`;
}

const report = {
  note: 'Desktop browser with phone emulation. Not phone evidence: no real touch hardware, mobile GPU, iOS Safari or itch.io page involved.',
  source,
  gameUrl: servers.gameUrl,
  viewport: { ...VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  checks,
  measurements: {},
  screenshots: [],
  playthrough: null,
};

/** Debug-hook helpers for one page (re-run install() after every navigation or reload). */
function hooks(page) {
  return {
    install: async () => {
      await page.waitForFunction(() => typeof window.__oys?.advance === 'function', null, { timeout: 20000 });
      await page.evaluate(`window.__e2eSerialise = ${SERIALISE}`);
    },
    state: async () => revive(await page.evaluate(() => window.__e2eSerialise(window.__oys.state()))),
    run: () => page.evaluate(() => JSON.parse(JSON.stringify(window.__oys.run()))),
    phase: () => page.evaluate(() => window.__oys.phase()),
    /** Settles when the latest room entry (iris out -> build -> iris in) has finished. */
    ready: () => page.evaluate(() => window.__oys.ready()),
  };
}

/**
 * Play the current room with the tested greedy bot (tests/sim/bot.ts) until the room ends,
 * then advance past the ending beat so the result panel is shown.
 */
async function botPlayRoom(page, onState) {
  let s = revive(await page.evaluate(() => window.__e2eSerialise(window.__oys.state())));
  const startHealth = s.health;
  const wallStart = Date.now();
  let iterations = 0;
  let lastCommandAt = s.time;
  let fallbacks = 0;
  const inExit = (st) => st.body.pos.x >= st.room.exit.x && st.body.pos.x <= st.room.exit.x + st.room.exit.w && st.body.pos.y >= st.room.exit.y && st.body.pos.y <= st.room.exit.y + st.room.exit.h;
  while (s.outcome === 'playing' && s.time < SIM_LIMIT_SECONDS && iterations < 6000) {
    iterations += 1;
    // The planner is expensive: in boss rooms consult it a few times per sim second, not every tick.
    let command = s.boss ? (iterations % 4 === 0 ? plannerDecide(s, undefined, 1 + Math.max(0, s.time - lastCommandAt - 2)) : null) : botCommand(s);
    if (!command && !s.boss && s.body.mode === 'ready' && !inExit(s) && s.time - lastCommandAt > 1) {
      command = fallbackCommand(s);
      if (command) fallbacks += 1;
    }
    if (command) lastCommandAt = s.time;
    const json = await page.evaluate((cmd) => {
      if (cmd) window.__oys.push(cmd);
      window.__oys.advance(0.05, 0.05);
      return window.__e2eSerialise(window.__oys.state());
    }, command);
    s = revive(json);
    if (onState) await onState(s);
  }
  await page.evaluate(() => window.__oys.advance(1.8, 0.05));
  return {
    outcome: s.outcome,
    roomData: s.room.id,
    simSeconds: round(s.time),
    wallSeconds: round((Date.now() - wallStart) / 1000),
    healthStart: startHealth,
    healthLeft: s.health,
    stats: s.stats,
    fallbackCommands: fallbacks,
  };
}

/** Shortest distance from point p to segment ab. */
function segmentDistance(a, b, p) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2)) : 0;
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y);
}

/**
 * Deliberately lose the current room, independent of its layout: walk (walls-aware) toward
 * a sentry without ever sweeping close enough to kill one, then stand exposed in the open.
 * If no damage lands for 8 s, move on to the next sentry. Standing still at spawn is not
 * enough: some authored rooms (Silk Cloister) cover the spawn from every firing line.
 */
async function loseRoom(page) {
  let s = revive(await page.evaluate(() => window.__e2eSerialise(window.__oys.state())));
  let targetIndex = 0;
  let lastHurtAt = s.time;
  let lastHealth = s.health;
  let dashes = 0;
  while (s.outcome === 'playing' && s.time < SIM_LIMIT_SECONDS) {
    if (s.health < lastHealth) {
      lastHealth = s.health;
      lastHurtAt = s.time;
    }
    const alive = s.enemies.filter((e) => e.phase !== 'dead');
    alive.sort((a, b) => Math.hypot(a.pos.x - s.body.pos.x, a.pos.y - s.body.pos.y) - Math.hypot(b.pos.x - s.body.pos.x, b.pos.y - s.body.pos.y));
    if (s.time - lastHurtAt > 8) {
      targetIndex += 1;
      lastHurtAt = s.time;
    }
    const target = alive.length ? alive[targetIndex % alive.length] : null;
    let command = null;
    if (target && s.body.mode === 'ready' && Math.hypot(target.pos.x - s.body.pos.x, target.pos.y - s.body.pos.y) > 2.2) {
      const field = distanceField(s.room, target.pos);
      let best = null;
      for (let k = 0; k < 24; k++) {
        for (const d of [1, 2, 3]) {
          const a = (k / 24) * Math.PI * 2;
          const aim = { x: Math.cos(a) * d, y: Math.sin(a) * d };
          const preview = previewDash(s, aim);
          if (!preview.valid) continue;
          // Never sweep through a sentry (kill radius 0.72) and never end on top of one.
          if (alive.some((e) => segmentDistance(preview.from, preview.end, e.pos) < 0.9)) continue;
          if (Math.hypot(target.pos.x - preview.end.x, target.pos.y - preview.end.y) < 1.4) continue;
          const score = field(preview.end);
          if (!best || score < best.score) best = { score, aim };
        }
      }
      if (best && best.score < field(s.body.pos) - 0.2) {
        command = { kind: 'dash', aim: best.aim };
        dashes += 1;
      }
    }
    const json = await page.evaluate((cmd) => {
      if (cmd) window.__oys.push(cmd);
      window.__oys.advance(0.1, 0.1);
      return window.__e2eSerialise(window.__oys.state());
    }, command);
    s = revive(json);
  }
  await page.evaluate(() => window.__oys.advance(1.8, 0.05));
  return { outcome: s.outcome, t: s.time, health: s.health, kills: s.stats.kills, dashes };
}

/** Which run panel is showing. */
async function panelKind(page) {
  if (await page.locator('.oys-card--route').first().isVisible().catch(() => false)) return 'route';
  if (await page.locator('.oys-card--relic').first().isVisible().catch(() => false)) return 'draft';
  if (await page.getByRole('heading', { name: /^(Escaped\.|Lost on the line\.)$/ }).isVisible().catch(() => false)) return 'ending';
  if (await page.getByRole('heading', { name: 'Who carries the thread?' }).isVisible().catch(() => false)) return 'starter';
  return 'unknown';
}

/** Room intro card text, if shown. */
async function introText(page) {
  return page.evaluate(() => {
    const intro = document.querySelector('.oys-intro');
    return intro ? { on: intro.classList.contains('is-on'), text: intro.textContent?.trim() ?? '' } : null;
  });
}

let failed = false;
try {
  console.log(`\nE2E: ${source}\n  browser ${browser.version()} (${launchedChannel}) via playwright-core; game ${servers.gameUrl}\n`);

  // --- A. Cold production load (no ?debug) -------------------------------------------------
  {
    const { context, page, problems, logStart } = await newPhoneContext();
    const t0 = Date.now();
    await page.goto(servers.gameUrl, { waitUntil: 'load' });
    const begin = page.getByRole('button', { name: 'Begin' });
    await begin.waitFor({ state: 'visible', timeout: 20000 });
    const beginVisibleMs = Date.now() - t0;
    await page.waitForFunction(() => window.__e2e?.firstDrawMs !== null, null, { timeout: 20000 });
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const c = document.querySelector('canvas');
      let renderer = null;
      // Reading the existing context: returns null if the canvas is not WebGL2.
      const gl = c ? c.getContext('webgl2') : null;
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      }
      return {
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadMs: Math.round(nav.loadEventEnd),
        firstWebGLDrawMs: Math.round(window.__e2e.firstDrawMs),
        transferBytes: performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), nav.transferSize || 0),
        canvas: !!c,
        webgl2: !!gl,
        renderer,
        debugHook: 'window.__oys' in window && window.__oys !== undefined,
      };
    });
    report.browser = { channel: launchedChannel, version: browser.version() };
    report.measurements.coldLoad = { ...timing, beginVisibleMs, label: 'desktop headless browser, local server, cold cache; not phone evidence' };
    record('A1 production URL has no debug hook', !timing.debugHook);
    record('A2 WebGL2 canvas present', timing.canvas && timing.webgl2, timing.renderer ?? 'no renderer');
    record('A3 title Begin button visible', true, `${beginVisibleMs} ms after navigation start`);
    report.screenshots.push(await shot(page, 'title'));
    const titleModels = await sceneModels(page);
    record(
      'A5 title scene renders packaged GLBs, not placeholders (triangle counts match)',
      titleModels.roots > 0 && titleModels.mismatched.length === 0,
      `verified ${[...titleModels.verified].sort().join(', ')}${titleModels.mismatched.length ? `; MISMATCH ${titleModels.mismatched.join(', ')}` : ''}`,
    );
    const errs = problemsOf(problems, logStart, titleModels.verified);
    if (errs.note) report.notes = [...(report.notes ?? []), errs.note];
    record('A4 no console errors, page errors or failed requests (production load)', errs.list.length === 0, errs.list.join(' | ') || errs.note || '');
    await context.close();
  }

  // --- B. Real UI path: Begin -> starter -> room 1 -> Onward -> route -> room 2 ----------------
  const { context, page, problems, logStart } = await newPhoneContext();
  const cdp = await context.newCDPSession(page);
  const h = hooks(page);
  await page.goto(`${servers.gameUrl}?debug&seed=${SEED_UI}`, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Begin' }).waitFor({ state: 'visible', timeout: 20000 });
  await h.install();
  const state = h.state;
  const phase = h.phase;

  await page.getByRole('button', { name: 'Begin' }).tap();
  await page.getByRole('heading', { name: 'Who carries the thread?' }).waitFor({ state: 'visible', timeout: 5000 });
  const threadkeeper = page.locator('.oys-card').filter({ hasText: 'Threadkeeper' });
  const longReach = page.locator('.oys-card').filter({ hasText: 'Long Reach' });
  const starterState = { threadkeeperEnabled: await threadkeeper.isEnabled(), longReachEnabled: await longReach.isEnabled() };
  report.screenshots.push(await shot(page, 'starter'));
  await threadkeeper.tap();
  await h.ready();
  await page.waitForFunction(() => window.__oys.phase() === 'playing', null, { timeout: 5000 });
  const room1 = await state();
  const run1 = await h.run();
  const intro1 = await introText(page);
  const roomModels = await sceneModels(page);
  record(
    'B1b room 1 scene renders packaged GLBs for every named model root (courier, soul, sentries, gate, engine)',
    roomModels.verified.has('courier_body') && roomModels.verified.has('soul_mask') && roomModels.mismatched.length === 0,
    `verified ${[...roomModels.verified].sort().join(', ')} across ${roomModels.roots} roots${roomModels.mismatched.length ? `; MISMATCH ${roomModels.mismatched.join(', ')}` : ''}`,
  );
  record(
    'B1 Begin -> starter select (Threadkeeper open, Long Reach locked on fresh storage) -> room 1 with intro card',
    starterState.threadkeeperEnabled && !starterState.longReachEnabled && room1.room.id === 'departure_court' && run1.at === 'n0' && !!intro1?.on,
    `starters ${JSON.stringify(starterState)}; room ${room1.room.id} at ${run1.at}; loadout ${JSON.stringify(run1.loadout)}; intro "${intro1?.text}"`,
  );

  // Frame pacing and draw calls in live play (n1 is dormant: nothing can attack yet).
  await page.evaluate(() => {
    window.__e2e.frames.length = 0;
  });
  await page.waitForTimeout(2000);
  const frames = await page.evaluate(() => window.__e2e.frames.slice());
  const intervals = frames.slice(1).map((f, i) => f.t - frames[i].t).sort((a, b) => a - b);
  const pct = (list, p) => (list.length ? list[Math.min(list.length - 1, Math.floor(p * list.length))] : null);
  const calls = frames.map((f) => f.calls).sort((a, b) => a - b);
  const tris = frames.map((f) => f.triangles).sort((a, b) => a - b);
  report.measurements.livePlay = {
    label: 'desktop headless browser rAF over 2 s of live play; not phone frame pacing',
    frames: frames.length,
    frameIntervalMs: { p50: round(pct(intervals, 0.5)), p95: round(pct(intervals, 0.95)), max: round(intervals.at(-1)) },
    drawCallsPerFrame: { p50: pct(calls, 0.5), max: calls.at(-1) },
    trianglesPerFrame: { p50: pct(tris, 0.5), max: tris.at(-1), note: 'TRIANGLES-mode draws only, counted from draw call arguments' },
  };
  record('B2 draw calls per frame within the 60-call room budget', (calls.at(-1) ?? 0) <= 60, `p50 ${pct(calls, 0.5)}, max ${calls.at(-1)}`);

  // Real touch drag on the canvas: CDP touch events become Pointer Events (pointerType touch).
  const before = await state();
  const startPt = { x: 187, y: 640 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startPt.x, y: startPt.y, id: 1 }] });
  for (let i = 1; i <= 10; i++) {
    await page.waitForTimeout(16);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startPt.x, y: startPt.y - 13 * i, id: 1 }] });
  }
  await page.waitForTimeout(16);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction((n) => window.__oys.state().stats.dashes > n, before.stats.dashes, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(120);
  const afterDash = await state();
  report.screenshots.push(await shot(page, 'first-dash'));
  record(
    'B3 real touch drag (130 px up) dashes',
    afterDash.stats.dashes === before.stats.dashes + 1,
    `dashes ${before.stats.dashes} -> ${afterDash.stats.dashes}; body (${fmt(before.body.pos)}) -> (${fmt(afterDash.body.pos)}); kills ${afterDash.stats.kills}`,
  );

  // Real short tap to RETURN while separated.
  await page.waitForFunction(() => {
    const s = window.__oys.state();
    return s.body.mode === 'ready' || s.route.points.length === 0;
  }, null, { timeout: 3000 });
  const preTap = await state();
  const separated = preTap.route.points.length > 0;
  await page.touchscreen.tap(187, 560);
  await page.waitForTimeout(150);
  const postTap = await state();
  record(
    'B4 real short tap RETURNs when separated',
    separated && postTap.stats.returns === preTap.stats.returns + 1,
    separated ? `returns ${preTap.stats.returns} -> ${postTap.stats.returns}, body mode ${postTap.body.mode}` : 'pair was not separated before the tap',
  );
  await page.waitForFunction(() => window.__oys.state().route.points.length === 0, null, { timeout: 5000 }).catch(() => {});

  // Pause on visibilitychange (document reported hidden) freezes simulation time.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const pausedPanel = page.getByRole('dialog').filter({ hasText: 'Paused' });
  const panelShown = await pausedPanel.isVisible();
  const tPause0 = (await state()).time;
  await page.waitForTimeout(1000);
  const tPause1 = (await state()).time;
  report.screenshots.push(await shot(page, 'paused'));
  record('B5 visibilitychange(hidden) pauses, shows the pause panel and freezes sim time', (await phase()) === 'paused' && panelShown && tPause1 === tPause0, `phase ${await phase()}, panel ${panelShown}, sim t ${tPause0} -> ${tPause1} over 1 s`);
  await page.evaluate(() => {
    delete document.visibilityState;
    delete document.hidden;
  });
  await page.getByRole('button', { name: 'Resume' }).tap();
  await page.waitForTimeout(300);
  const tResume = (await state()).time;
  record('B6 explicit Resume continues the same in-memory state', (await phase()) === 'playing' && tResume > tPause1, `sim t ${tPause1} -> ${tResume}`);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const tBlur0 = (await state()).time;
  await page.waitForTimeout(500);
  const tBlur1 = (await state()).time;
  record('B7 window blur pauses and freezes sim time', (await phase()) === 'paused' && tBlur0 === tBlur1, `phase ${await phase()}, sim t ${tBlur0} -> ${tBlur1}`);
  await page.getByRole('button', { name: 'Resume' }).tap();
  await page.waitForFunction(() => window.__oys.phase() === 'playing');

  // Scripted clear of room 1: the tested greedy bot decides in Node; commands go through the debug hook.
  let telegraphShot = false;
  const lockedSeen = new Set();
  const clear1 = await botPlayRoom(page, async (s) => {
    for (const e of s.enemies) if (e.phase === 'locked') lockedSeen.add(e.key);
    if (!telegraphShot && s.enemies.some((e) => e.phase === 'locked')) {
      telegraphShot = true;
      report.screenshots.push(await shot(page, 'telegraph'));
    }
  });
  const victoryVisible = await page.getByText('The gate opens.').isVisible();
  const onward = page.getByRole('button', { name: 'Onward' });
  const onwardVisible = await onward.isVisible();
  if (victoryVisible) report.screenshots.push(await shot(page, 'victory'));
  report.playthrough = {
    method: 'tests/sim/bot.ts botCommand() run in Node on page state each 0.05 s sim; commands via window.__oys.push; time via __oys.advance(0.05) plus the live rAF loop',
    ...clear1,
    lockedTelegraphsSeen: [...lockedSeen],
  };
  record('B8 scripted Departure Court clear reaches victory', clear1.outcome === 'victory', `sim ${clear1.simSeconds} s, health ${clear1.healthLeft}, stats ${JSON.stringify(clear1.stats)}`);
  record('B9 result panel shows "The gate opens." with an Onward button', victoryVisible && onwardVisible);
  record('B10 a locked telegraph was rendered during play', telegraphShot, [...lockedSeen].join(', '));

  const metrics = await cdp.send('Performance.enable').then(() => cdp.send('Performance.getMetrics'));
  const metric = (name) => metrics.metrics.find((m) => m.name === name)?.value ?? null;
  report.measurements.afterPlaythrough = {
    label: 'desktop Chromium-family metrics after clearing room 1; not phone memory evidence',
    jsHeapUsedBytes: metric('JSHeapUsedSize'),
    jsHeapTotalBytes: metric('JSHeapTotalSize'),
    domNodes: metric('Nodes'),
    jsEventListeners: metric('JSEventListeners'),
  };

  // Onward -> route choice -> room 2.
  await onward.tap();
  await page.getByRole('heading', { name: 'Choose your line' }).waitFor({ state: 'visible', timeout: 5000 });
  const routeCards = page.locator('.oys-card--route');
  const routeNames = await page.locator('.oys-card--route .oys-card-title').allTextContents();
  report.screenshots.push(await shot(page, 'route'));
  await routeCards.first().tap();
  await h.ready();
  await page.waitForFunction(() => window.__oys.phase() === 'playing', null, { timeout: 5000 });
  const run2 = await h.run();
  const room2 = await state();
  const intro2 = await introText(page);
  report.screenshots.push(await shot(page, 'room2-intro'));
  const template2 = run2.graph.nodes[run2.at]?.roomId;
  record(
    'B11 Onward -> "Choose your line" with two cards -> first card starts room 2 with its intro card',
    routeNames.length === 2 && run2.at !== run1.at && run2.history.includes(run2.at) && !!intro2?.on,
    `cards ${JSON.stringify(routeNames)}; at ${run1.at} -> ${run2.at} (template ${template2}, room data ${room2.room.id}); intro "${intro2?.text}"`,
  );

  // Persistence: reload in room 2 -> Continue restarts this room from its entry state.
  const entry2 = { at: run2.at, roomId: room2.room.id, health: room2.health, attempts: run2.attempts[run2.at] ?? 0, history: run2.history };
  await page.reload({ waitUntil: 'load' });
  const cont = page.getByRole('button', { name: 'Continue' });
  await cont.waitFor({ state: 'visible', timeout: 20000 });
  await h.install();
  const caption = (await page.locator('#oys-continue-cap').textContent())?.trim();
  const detail = (await page.locator('.oys-continue-detail').textContent().catch(() => null))?.trim() ?? null;
  const newExpeditionVisible = await page.getByRole('button', { name: 'New expedition' }).isVisible();
  report.screenshots.push(await shot(page, 'continue'));
  record(
    'B12 after a reload the title offers Continue with "Continue restarts this room."',
    caption === 'Continue restarts this room.' && newExpeditionVisible,
    `caption "${caption}"; detail "${detail}"; New expedition button ${newExpeditionVisible}`,
  );
  await cont.tap();
  await h.ready();
  await page.waitForFunction(() => window.__oys.phase() === 'playing', null, { timeout: 5000 });
  const runC = await h.run();
  const roomC = await state();
  record(
    'B13 Continue restarts the same room (node, room, entry health) from its start',
    runC.at === entry2.at && roomC.room.id === entry2.roomId && roomC.health === entry2.health && roomC.time < 1 && JSON.stringify(runC.history) === JSON.stringify(entry2.history),
    `at ${entry2.at} -> ${runC.at}; room ${entry2.roomId} -> ${roomC.room.id}; health ${entry2.health} -> ${roomC.health}; sim t ${round(roomC.time)} s after Continue`,
  );

  // Defeat path: deliberately lose the room -> Retry room restarts it as attempt 2.
  const lost = await loseRoom(page);
  const retry = page.getByRole('button', { name: 'Retry room' });
  const retryVisible = await retry.isVisible();
  const abandonVisible = await page.getByRole('button', { name: 'Abandon expedition' }).isVisible();
  if (retryVisible) report.screenshots.push(await shot(page, 'defeat'));
  record(
    'B14 deliberately walking into firing lines (no kills) loses the room and offers Retry room / Abandon expedition',
    lost.outcome === 'defeat' && lost.kills === 0 && retryVisible && abandonVisible,
    `outcome ${lost.outcome} at sim ${round(lost.t)} s after ${lost.dashes} dashes, health ${lost.health}, kills ${lost.kills}`,
  );
  if (retryVisible) {
    await retry.tap();
    await h.ready();
    await page.waitForFunction(() => window.__oys.phase() === 'playing', null, { timeout: 5000 });
    const runR = await h.run();
    const roomR = await state();
    const introR = await introText(page);
    record(
      'B15 Retry room restarts the same room as attempt 2 at entry health',
      runR.at === entry2.at && roomR.room.id === entry2.roomId && (runR.attempts[runR.at] ?? 0) === entry2.attempts + 1 && roomR.health === entry2.health && /Attempt 2/.test(introR?.text ?? ''),
      `at ${runR.at}; failed attempts ${entry2.attempts} -> ${runR.attempts[runR.at]}; health ${roomR.health}; intro "${introR?.text}"`,
    );
  }

  const errs = problemsOf(problems, logStart, roomModels.verified);
  if (errs.note) report.notes = [...(report.notes ?? []), errs.note];
  record('B16 no console errors, page errors or failed requests (UI session incl. reload)', errs.list.length === 0, errs.list.slice(0, 5).join(' | ') || errs.note || '');
  report.consoleWarnings = [...(report.consoleWarnings ?? []), ...problems.warnings];
  await context.close();

  // --- C. Full expedition: __oys.start() + bot + DOM clicks through every panel ---------------
  {
    const { context: ctx, page: p, problems: probs, logStart: start } = await newPhoneContext();
    const hc = hooks(p);
    await p.goto(`${servers.gameUrl}?debug&seed=${SEED_RUN}`, { waitUntil: 'load' });
    await p.getByRole('button', { name: 'Begin' }).waitFor({ state: 'visible', timeout: 20000 });
    await hc.install();
    await p.evaluate(() => window.__oys.start('threadkeeper'));
    const runModels = await sceneModels(p);
    const expedition = { seed: SEED_RUN, starter: 'threadkeeper', rooms: [], choices: [], relicsTaken: [], failures: [], ending: null, totalSimSeconds: 0 };
    const wallStart = Date.now();
    for (let guard = 0; guard < 40 && !expedition.ending; guard++) {
      const ph = await hc.phase();
      if (ph === 'playing') {
        const runBefore = await hc.run();
        const node = runBefore.graph.nodes[runBefore.at];
        const result = await botPlayRoom(p);
        expedition.totalSimSeconds += result.simSeconds;
        expedition.rooms.push({ node: node.id, kind: node.kind, template: node.roomId, attempt: (runBefore.attempts[node.id] ?? 0) + 1, ...result });
        if (result.outcome === 'victory') {
          const next = p.getByRole('button', { name: /^(Onward|Pass the last gate)$/ });
          await next.waitFor({ state: 'visible', timeout: 5000 });
          await next.tap();
          await hc.ready();
        } else if (result.outcome === 'playing') {
          // The greedy bot ran out of sim time without winning or losing: a stall, not a defeat.
          const s = await hc.state();
          const alive = s.enemies.filter((e) => e.phase !== 'dead').map((e) => `${e.key}@${fmt(e.pos)}:${e.phase}`);
          expedition.failures.push(
            `${node.id} (${node.roomId}, data ${result.roomData}): bot stalled at ${result.simSeconds} s sim; body (${fmt(s.body.pos)}) ${s.body.mode}, soul (${fmt(s.soul.pos)}), route ${round(s.route.length)}, health ${s.health}, alive ${alive.join(' ') || 'none'}, gate ${s.gate}`,
          );
          report.screenshots.push(await shot(p, 'expedition-stall'));
          break;
        } else {
          expedition.failures.push(`${node.id} (${node.roomId}) attempt ${(runBefore.attempts[node.id] ?? 0) + 1}: ${result.outcome}`);
          const attempts = (runBefore.attempts[node.id] ?? 0) + 1;
          const button = p.getByRole('button', { name: attempts < 3 ? 'Retry room' : 'Abandon expedition' });
          await button.waitFor({ state: 'visible', timeout: 5000 });
          await button.tap();
          await hc.ready();
        }
      } else if (ph === 'choosing') {
        // A room entry irises out/in with no panel showing; give it a moment before judging.
        let kind = await panelKind(p);
        for (let wait = 0; kind === 'unknown' && wait < 30; wait++) {
          await p.waitForTimeout(100);
          if ((await hc.phase()) !== 'choosing') break;
          kind = await panelKind(p);
        }
        if ((await hc.phase()) !== 'choosing') continue;
        if (kind === 'route') {
          const names = await p.locator('.oys-card--route .oys-card-title').allTextContents();
          await p.locator('.oys-card--route').first().tap();
          await hc.ready();
          expedition.choices.push({ panel: 'route', offered: names, picked: names[0] });
        } else if (kind === 'draft') {
          if (!report.screenshots.includes('art/previews/e2e-station.png')) {
            // The Signal House scene irises in behind the draft panel (~0.35 s each way).
            await p.waitForTimeout(900);
            report.screenshots.push(await shot(p, 'station'));
          }
          const offered = await p.locator('.oys-card--relic .oys-card-title').allTextContents();
          const first = p.locator('.oys-card--relic:not([disabled])').first();
          let picked = null;
          let action = 'Keep my relics';
          if ((await first.count()) > 0) {
            picked = (await first.locator('.oys-card-title').textContent())?.trim() ?? null;
            await first.tap();
            const act = p.locator('.oys-draft-actions button:not([disabled])').first();
            action = (await act.textContent())?.trim() ?? '';
            await act.tap();
          } else {
            await p.getByRole('button', { name: 'Keep my relics' }).tap();
          }
          await hc.ready();
          const runAfter = await hc.run();
          expedition.choices.push({ panel: 'draft', offered, picked, action, loadoutAfter: runAfter.loadout });
          if (picked && action !== 'Keep my relics') expedition.relicsTaken.push(picked);
        } else if (kind === 'ending') {
          expedition.ending = (await p.locator('.oys-choice h2').first().textContent())?.trim() ?? null;
          report.screenshots.push(await shot(p, 'ending'));
        } else {
          expedition.failures.push(`unrecognised panel while choosing (guard ${guard})`);
          break;
        }
      } else if (ph === 'ending' || ph === 'result') {
        await p.evaluate(() => window.__oys.advance(0.5, 0.05));
      } else {
        expedition.failures.push(`unexpected phase ${ph}`);
        break;
      }
    }
    const finalRun = await hc.run();
    expedition.totalSimSeconds = round(expedition.totalSimSeconds);
    expedition.wallSeconds = round((Date.now() - wallStart) / 1000);
    expedition.history = finalRun.history;
    expedition.finalLoadout = finalRun.loadout;
    expedition.runOutcome = finalRun.outcome;
    expedition.runTotals = finalRun.totals;
    expedition.notAuthoredWarnings = probs.warnings.filter((w) => w.includes('[rooms]'));
    report.expedition = expedition;
    record(
      'C1 full expedition via __oys.start() + bot + DOM panel clicks reaches "Escaped."',
      expedition.ending === 'Escaped.',
      `${expedition.rooms.length} room attempts over nodes ${finalRun.history.join(' > ')}; relics taken ${JSON.stringify(expedition.relicsTaken)}; final loadout ${JSON.stringify(finalRun.loadout)}; ${expedition.totalSimSeconds} s sim; failures ${expedition.failures.length}`,
    );

    // Lateral unlock: having reached a station, the next starter panel offers Long Reach.
    if (expedition.ending) {
      await p.getByRole('button', { name: 'Again' }).tap();
      const begin = p.getByRole('button', { name: 'Begin' });
      await begin.waitFor({ state: 'visible', timeout: 5000 });
      await begin.tap();
      await p.getByRole('heading', { name: 'Who carries the thread?' }).waitFor({ state: 'visible', timeout: 5000 });
      const lr = p.locator('.oys-card').filter({ hasText: 'Long Reach' });
      const unlocked = await lr.isEnabled();
      record('C2 after the run, the title offers Begin again and Long Reach is unlocked on the starter panel', unlocked, `Long Reach enabled ${unlocked}`);
    }
    const errsC = problemsOf(probs, start, runModels.verified);
    if (errsC.note) report.notes = [...(report.notes ?? []), errsC.note];
    record('C3 no console errors, page errors or failed requests (full expedition)', errsC.list.length === 0, errsC.list.slice(0, 5).join(' | ') || errsC.note || '');
    report.consoleWarnings = [...(report.consoleWarnings ?? []), ...probs.warnings];
    await ctx.close();
  }
} catch (error) {
  failed = true;
  console.error(`\nE2E crashed: ${error instanceof Error ? error.stack : String(error)}`);
} finally {
  await browser.close();
  await servers.close();
  await vite.close();
}

function round(n) {
  return n === null || n === undefined ? null : Math.round(n * 100) / 100;
}
function fmt(p) {
  return `${p.x.toFixed(2)}, ${p.y.toFixed(2)}`;
}

report.result = !failed && checks.every((c) => c.ok) ? 'PASS' : 'FAIL';
const reportName = `e2e-report-${launchedChannel}.json`;
writeFileSync(join(root, 'art', 'reports', reportName), `${JSON.stringify(report, null, 2)}\n`);
console.log('\nMeasurements (desktop browser, NOT phone evidence):');
console.log(JSON.stringify(report.measurements, null, 2));
console.log(`\nScreenshots: ${report.screenshots.join(', ')}`);
console.log(`Report: art/reports/${reportName} (one report per browser channel; screenshots are from the latest run)`);
console.log(`\nE2E ${report.result}: ${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);
process.exit(report.result === 'PASS' ? 0 : 1);
