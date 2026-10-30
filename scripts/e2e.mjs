#!/usr/bin/env node
// End-to-end browser check of the BUILT game under an itch.io-like nested URL.
//
//   npm run e2e                         (vite build, then test dist/)
//   node scripts/e2e.mjs --no-build     (test the existing dist/)
//   node scripts/e2e.mjs --zip latest   (test the newest release ZIP: the exact upload bytes)
//   node scripts/e2e.mjs --browser chrome --headed
//
// Uses pinned playwright-core with an ALREADY-INSTALLED system browser (Edge, then
// Chrome). It never downloads a browser. Exit codes: 0 pass, 1 fail, 2 blocked (no browser).
//
// What it covers (emulated phone viewport 375x812, DPR 2, touch, isMobile):
//  - production URL exposes no debug hook; title + Begin render; no console errors
//  - WebGL2 canvas present; real touch tap on Begin
//  - one REAL touch drag (CDP touch events -> Pointer Events) dashes; a REAL short tap RETURNs
//  - visibilitychange(hidden) and window blur pause, freeze simulation time and show the pause panel
//  - a scripted Departure Court clear (tests/sim/bot.ts greedy bot planning in Node from
//    page state, commands sent through the ?debug hook) to victory and the result panel
//  - load timing, JS heap, and WebGL draw calls/frame measured by instrumenting the context
// Numbers come from a desktop browser (headless, desktop GPU or SwiftShader): they are
// NOT phone evidence. Real-device checks belong in docs/EVIDENCE.md layer C.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';
import { readTree } from './lib/files.mjs';
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

const servers = await startNestedServers(new Map(files.map((f) => [f.path, f.data])));
mkdirSync(previewsDir, { recursive: true });
mkdirSync(join(root, 'art', 'reports'), { recursive: true });

/** Counts WebGL draw calls between animation frames and stamps the first draw. */
const INSTRUMENT = () => {
  const stats = { firstDrawMs: null, frames: [], current: { calls: 0, triangles: 0 } };
  window.__e2e = stats;
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
  const problems = { console: [], pageErrors: [], failedRequests: [], aborted: [], finishedOk: new Set() };
  page.on('console', (m) => {
    if (m.type() === 'error') problems.console.push(m.text());
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

/**
 * Console/page/network problems for one context. A top-level page load makes the browser
 * request /favicon.ico from the origin root (outside the nested game path); itch.io runs
 * the game in an iframe, which does not fetch favicons. Exactly those console 404s are
 * exempted, and only when the server log shows no other non-200 response.
 */
function problemsOf(problems, logStart) {
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
  const benign = problems.aborted.filter((url) => problems.finishedOk.has(url));
  const realAborts = problems.aborted.filter((url) => !problems.finishedOk.has(url)).map((url) => `${url} net::ERR_ABORTED`);
  if (benign.length > 0) note = [note, `noted ${benign.length} net::ERR_ABORTED report(s) for URLs that also finished with HTTP 200: ${benign.map((u) => u.split('/').pop()).join(', ')}`].filter(Boolean).join('; ');
  return { list: [...consoleErrors, ...problems.pageErrors, ...problems.failedRequests, ...realAborts, ...other.map((l) => `${l.path} HTTP ${l.status}`)], note };
}

async function shot(page, name) {
  const path = join(previewsDir, `e2e-${name}.png`);
  await page.screenshot({ path });
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
    const errs = problemsOf(problems, logStart);
    if (errs.note) report.notes = [...(report.notes ?? []), errs.note];
    record('A4 no console errors, page errors or failed requests (production load)', errs.list.length === 0, errs.list.join(' | ') || errs.note || '');
    await context.close();
  }

  // --- B. Debug session: real touch input, pause, scripted clear ----------------------------
  const { context, page, problems, logStart } = await newPhoneContext();
  const cdp = await context.newCDPSession(page);
  await page.goto(`${servers.gameUrl}?debug`, { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Begin' }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForFunction(() => typeof window.__oys?.advance === 'function');
  await page.evaluate(`window.__e2eSerialise = ${SERIALISE}`);
  const state = async () => revive(await page.evaluate(() => window.__e2eSerialise(window.__oys.state())));
  const phase = () => page.evaluate(() => window.__oys.phase());

  await page.getByRole('button', { name: 'Begin' }).tap();
  await page.waitForFunction(() => window.__oys.phase() === 'playing', null, { timeout: 5000 });
  record('B1 real tap on Begin starts the room', true);

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

  // Scripted clear: the tested greedy bot decides in Node; commands go through the debug hook.
  const startHealth = (await state()).health;
  const playStart = Date.now();
  let s = await state();
  let telegraphShot = false;
  let iterations = 0;
  const lockedSeen = new Set();
  while (s.outcome === 'playing' && s.time < SIM_LIMIT_SECONDS && iterations < 5000) {
    iterations += 1;
    const command = botCommand(s);
    const json = await page.evaluate((cmd) => {
      if (cmd) window.__oys.push(cmd);
      window.__oys.advance(0.05, 0.05);
      return window.__e2eSerialise(window.__oys.state());
    }, command);
    s = revive(json);
    for (const e of s.enemies) if (e.phase === 'locked') lockedSeen.add(e.key);
    if (!telegraphShot && s.enemies.some((e) => e.phase === 'locked')) {
      telegraphShot = true;
      report.screenshots.push(await shot(page, 'telegraph'));
    }
  }
  const outcome = s.outcome;
  await page.evaluate(() => window.__oys.advance(1.8, 0.05));
  const victoryText = page.getByText('The gate opens.');
  const victoryVisible = await victoryText.isVisible();
  if (victoryVisible) report.screenshots.push(await shot(page, 'victory'));
  report.playthrough = {
    method: 'tests/sim/bot.ts botCommand() run in Node on page state each 0.05 s sim; commands via window.__oys.push; time via __oys.advance(0.05) plus the live rAF loop',
    outcome,
    simSeconds: round(s.time),
    wallSeconds: round((Date.now() - playStart) / 1000),
    healthStartOfScript: startHealth,
    healthLeft: s.health,
    stats: s.stats,
    lockedTelegraphsSeen: [...lockedSeen],
  };
  record('B8 scripted Departure Court clear reaches victory', outcome === 'victory', `sim ${round(s.time)} s, health ${s.health}/${s.maxHealth}, stats ${JSON.stringify(s.stats)}`);
  record('B9 result panel shows "The gate opens."', victoryVisible);
  record('B10 a locked telegraph was rendered during play', telegraphShot, [...lockedSeen].join(', '));

  const metrics = await cdp.send('Performance.enable').then(() => cdp.send('Performance.getMetrics'));
  const metric = (name) => metrics.metrics.find((m) => m.name === name)?.value ?? null;
  const heap = await page.evaluate(() => (performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null));
  report.measurements.afterPlaythrough = {
    label: 'desktop Chromium-family metrics after one full clear; not phone memory evidence',
    jsHeapUsedBytes: metric('JSHeapUsedSize') ?? heap?.used ?? null,
    jsHeapTotalBytes: metric('JSHeapTotalSize') ?? heap?.total ?? null,
    domNodes: metric('Nodes'),
    jsEventListeners: metric('JSEventListeners'),
  };
  const errs = problemsOf(problems, logStart);
  if (errs.note) report.notes = [...(report.notes ?? []), errs.note];
  record('B11 no console errors, page errors or failed requests (debug session)', errs.list.length === 0, errs.list.slice(0, 5).join(' | ') || errs.note || '');
  await context.close();
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
