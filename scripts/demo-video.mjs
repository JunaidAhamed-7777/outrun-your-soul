#!/usr/bin/env node
/**
 * Record a short demo video of the real game: title -> story line -> Departure Court
 * played with real drag gestures (aim preview visible) -> victory -> end card, with the
 * game's CC0 music. Frame-exact: the game's real-time loop is frozen and every video frame
 * advances the game by exactly 1/FPS through the ?debug hook, so motion is smooth no matter
 * how slow the capture is. Uses the installed Edge and system ffmpeg; downloads nothing.
 *
 *   node scripts/demo-video.mjs            -> art/video/outrun-your-soul-demo.mp4
 *
 * The planning bot (src/bot) chooses the moves; each move is then performed as a real
 * pointer drag (or tap for RETURN), exactly as a player would.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const FPS = 30;
const W = 390;
const H = 844;
const OUT = resolve('art/video/outrun-your-soul-demo.mp4');
const work = join(tmpdir(), `oys-demo-${Date.now()}`);
const framesDir = join(work, 'frames');
mkdirSync(framesDir, { recursive: true });
mkdirSync('art/video', { recursive: true });

const vite = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await chromium.launch({ channel: process.env.DEMO_BROWSER ?? 'msedge' });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/** Concat list entries: [file, seconds]. */
const timeline = [];
let n = 0;
async function frame(seconds = 1 / FPS) {
  const file = join(framesDir, `${String(++n).padStart(5, '0')}.png`);
  await page.screenshot({ path: file });
  timeline.push([file, seconds]);
}
const advance = (s) => page.evaluate((x) => window.__oys.advance(x, x), s);

// Fresh player who has finished the tutorial, so Begin opens level 2 with its story line.
await page.goto('http://localhost:5198/?debug');
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('oys.levels.v1', JSON.stringify({ cleared: ['first_light'] }));
  localStorage.setItem('oys.tutorialDone', '1');
});
await page.reload();
const begin = page.getByRole('button', { name: 'Continue' });
await begin.waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await frame(2.8); // title

await begin.tap();
await page.waitForTimeout(1900);
await frame(2.6); // the story line, fully faded in
await page.waitForFunction(() => window.__oys?.phase() === 'playing', null, { timeout: 20000 });
await page.evaluate(() => window.__oys.freeze());

// The planner runs in the page (served by Vite) on the live state.
await page.evaluate(async () => {
  const bot = await import('/src/bot/bot.ts');
  window.__demoDecide = (s) => bot.decide(s, { ...bot.NOVICE_BOT, aimDelay: 0.25 }, 1.5);
});

const AIM_GAIN = 1.6;
const DRAG_FRAMES = 9;
let since = 99;
for (let i = 0; i < FPS * 40; i++) {
  const st = await page.evaluate(() => ({ phase: window.__oys.phase(), outcome: window.__oys.state().outcome }));
  if (st.phase === 'result') break;
  since += 1;
  if (st.outcome === 'playing' && since >= 8) {
    const cmd = await page.evaluate(() => window.__demoDecide(window.__oys.state()));
    if (cmd?.kind === 'dash') {
      since = 0;
      // Relative drag from the lower middle of the screen: same aim the planner chose.
      const geo = await page.evaluate((aim) => {
        const s = window.__oys.state();
        const b = s.body.pos;
        const a = window.__oys.toScreen(b);
        const z = window.__oys.toScreen({ x: b.x + aim.x / 1.6, y: b.y + aim.y / 1.6 });
        return { dx: z.x - a.x, dy: z.y - a.y };
      }, cmd.aim);
      const sx = W / 2;
      const sy = H * 0.78;
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      for (let k = 1; k <= DRAG_FRAMES; k++) {
        const t = Math.min(1, k / (DRAG_FRAMES - 2));
        await page.mouse.move(sx + geo.dx * t, sy + geo.dy * t);
        await advance(1 / FPS);
        await frame();
      }
      await page.mouse.up();
    } else if (cmd?.kind === 'return') {
      since = 0;
      await page.mouse.move(W / 2, H * 0.78);
      await page.mouse.down();
      await advance(1 / FPS);
      await frame();
      await page.mouse.up();
    }
  }
  await advance(1 / FPS);
  await frame();
}
void AIM_GAIN;
// Let the ending beat and result panel play out, then hold on it.
for (let i = 0; i < FPS * 1.6; i++) {
  await advance(1 / FPS);
  await frame();
}
await page.waitForTimeout(500);
await frame(2.4);

// End card: the stacked logo on the brand background.
const logo = readFileSync('art/brand/logo-stacked.png').toString('base64');
await page.setContent(
  `<body style="margin:0;width:${W}px;height:${H}px;display:grid;place-items:center;background:radial-gradient(120% 70% at 50% 40%,#2443a3,#14215a 70%,#0b1236)">
     <div style="text-align:center;font:600 13px 'Segoe UI',sans-serif;letter-spacing:.2em;color:#f4ecd8">
       <img src="data:image/png;base64,${logo}" style="width:340px;border-radius:24px;display:block;margin:0 auto 22px">
       PLAY IN YOUR BROWSER<br><span style="color:#d9a43c">outrun-your-soul.vercel.app</span>
     </div></body>`,
);
await frame(3.2);

await browser.close();
await vite.close();

// Encode: concat demuxer with per-frame durations, the CC0 loop as soundtrack with fades.
const list = timeline.map(([f, d]) => `file '${f.replace(/\\/g, '/')}'\nduration ${d.toFixed(5)}`).join('\n');
writeFileSync(join(work, 'list.txt'), `${list}\nfile '${timeline.at(-1)[0].replace(/\\/g, '/')}'\n`);
const total = timeline.reduce((a, [, d]) => a + d, 0);
execFileSync(
  'ffmpeg',
  [
    '-y', '-v', 'error',
    '-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'),
    '-i', 'public/assets/audio/cathedral_in_the_forest.ogg',
    '-filter_complex',
    `[0:v]fps=${FPS},scale=720:-2:flags=lanczos,format=yuv420p[v];[1:a]atrim=0:${total.toFixed(2)},afade=t=in:d=1.2,afade=t=out:st=${(total - 2.2).toFixed(2)}:d=2.2,volume=0.9[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '128k', '-t', total.toFixed(2),
    OUT,
  ],
  { stdio: 'inherit' },
);
rmSync(work, { recursive: true, force: true });
console.log(`wrote ${OUT} (${total.toFixed(1)} s, ${n} captured frames)`);
