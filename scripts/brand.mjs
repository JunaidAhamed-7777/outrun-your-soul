#!/usr/bin/env node
/**
 * Render the brand kit from art/brand/mark.svg (and mark-small.svg for tab-size icons) with the installed Edge/Chrome (no
 * downloads, no online services). Reproducible: rerun after editing the mark.
 *
 *   node scripts/brand.mjs
 *
 * Outputs
 *   public/favicon.svg, public/favicon-32.png, public/favicon-16.png,
 *   public/apple-touch-icon.png (180), public/icon-192.png, public/icon-512.png,
 *   public/icon-maskable-512.png, public/og.jpg (1200x630 social card)
 *   art/brand/banner.png (README header), art/brand/logo-stacked.png, art/brand/mark-1024.png
 *   (the itch.io cover is made by scripts/itch-cover.mjs)
 */
import { chromium } from 'playwright-core';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MARK = readFileSync('art/brand/mark.svg', 'utf8');
const MARK_URI = `data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`;
// Simplified mark for tab-size icons (bolder strokes, no hairlines).
const SMALL_URI = `data:image/svg+xml;base64,${readFileSync('art/brand/mark-small.svg').toString('base64')}`;
const shotUri = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`;

const FONTS = `
  --display: 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
  --ui: 'Segoe UI', system-ui, sans-serif;`;
const PAGE = (w, h, body, extraCss = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
  :root { ${FONTS} }
  html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
  .bg { position: absolute; inset: 0; background: radial-gradient(120% 90% at 30% 35%, #3f66cc 0%, #2443a3 38%, #14215a 78%, #0b1236 100%); }
  .grain { position: absolute; inset: 0; background: repeating-linear-gradient(115deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 7px); }
  .k { font: 700 22px/1 var(--ui); letter-spacing: 0.34em; text-transform: uppercase; color: #d9a43c; }
  .w1 { font: 400 120px/0.95 var(--display); letter-spacing: 0.05em; color: #f4ecd8; }
  .w2 { font: 400 62px/1 var(--display); letter-spacing: 0.32em; color: #f4ecd8; }
  .tag { font: italic 30px/1.3 var(--display); color: rgba(244,236,216,0.82); }
  .thread { height: 4px; border-radius: 4px; background: linear-gradient(90deg, rgba(232,65,31,0) 0%, #e8411f 30%, #e8411f 100%); }
  .credit { font: 700 16px/1 var(--ui); letter-spacing: 0.3em; text-transform: uppercase; color: rgba(217,164,60,0.9); }
  ${extraCss}
</style></head><body>${body}</body></html>`;

const jobs = [];
const icon = (size, out, { maskable = false, small = false } = {}) =>
  jobs.push({
    out,
    w: size,
    h: size,
    transparent: !maskable,
    html: PAGE(
      size,
      size,
      maskable
        ? `<div style="position:absolute;inset:0;background:#2443a3"></div><img src="${MARK_URI}" style="position:absolute;left:${size * 0.1}px;top:${size * 0.1}px;width:${size * 0.8}px;height:${size * 0.8}px">`
        : `<img src="${small ? SMALL_URI : MARK_URI}" style="width:${size}px;height:${size}px;display:block">`,
    ),
  });

icon(16, 'public/favicon-16.png', { small: true });
icon(32, 'public/favicon-32.png', { small: true });
icon(48, 'art/brand/favicon-48.png', { small: true });
icon(180, 'public/apple-touch-icon.png', { maskable: true });
icon(192, 'public/icon-192.png');
icon(512, 'public/icon-512.png');
icon(512, 'public/icon-maskable-512.png', { maskable: true });
icon(1024, 'art/brand/mark-1024.png');

// README header banner: mark, wordmark, tagline. Opaque so it reads on light and dark themes.
jobs.push({
  out: 'art/brand/banner.png',
  w: 1600,
  h: 560,
  html: PAGE(
    1600,
    560,
    `<div class="bg"></div><div class="grain"></div>
    <img src="${MARK_URI}" style="position:absolute;left:110px;top:100px;width:360px;height:360px;filter:drop-shadow(0 18px 40px rgba(5,8,30,.55))">
    <div style="position:absolute;left:540px;top:118px">
      <div class="k">A funeral-railway escape</div>
      <div class="w1" style="margin-top:26px">OUTRUN</div>
      <div class="w2" style="margin-top:10px">YOUR SOUL</div>
      <div class="thread" style="width:520px;margin:30px 0 22px"></div>
      <div class="tag">Your body can outrun death. Your soul cannot.</div>
    </div>
    <div class="credit" style="position:absolute;right:56px;bottom:40px">Made by Junaid</div>`,
  ),
});

// Stacked logo (square-ish) for profile/cover use.
jobs.push({
  out: 'art/brand/logo-stacked.png',
  w: 1000,
  h: 1000,
  html: PAGE(
    1000,
    1000,
    `<div class="bg"></div><div class="grain"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
      <img src="${MARK_URI}" style="width:420px;height:420px;filter:drop-shadow(0 18px 40px rgba(5,8,30,.55))">
      <div class="k" style="margin-top:44px">A funeral-railway escape</div>
      <div class="w1" style="margin-top:22px;font-size:112px">OUTRUN</div>
      <div class="w2" style="margin-top:8px;font-size:58px">YOUR SOUL</div>
      <div class="credit" style="margin-top:46px">Made by Junaid</div>
    </div>`,
  ),
});

// Social card (Open Graph / Twitter): brand left, real gameplay on the right.
const play = shotUri('art/previews/e2e-telegraph.png');
const phone = (left, top, h) =>
  `<div style="position:absolute;left:${left}px;top:${top}px;width:${h * 0.462}px;height:${h}px;border-radius:34px;padding:10px;background:#0b1236;box-shadow:0 24px 60px rgba(5,8,30,.6),0 0 0 2px rgba(217,164,60,.55)">
     <img src="${play}" style="width:100%;height:100%;object-fit:cover;object-position:top;border-radius:26px;display:block">
   </div>`;
jobs.push({
  out: 'public/og.jpg',
  w: 1200,
  h: 630,
  html: PAGE(
    1200,
    630,
    `<div class="bg"></div><div class="grain"></div>
    <img src="${MARK_URI}" style="position:absolute;left:70px;top:70px;width:150px;height:150px">
    <div style="position:absolute;left:70px;top:262px">
      <div class="k" style="font-size:18px">A funeral-railway escape</div>
      <div class="w1" style="margin-top:18px;font-size:92px">OUTRUN</div>
      <div class="w2" style="margin-top:6px;font-size:48px">YOUR SOUL</div>
      <div class="thread" style="width:400px;margin:22px 0 16px"></div>
      <div class="tag" style="font-size:24px">Your body can outrun death.<br>Your soul cannot.</div>
    </div>
    ${phone(790, 40, 550)}
    <div class="credit" style="position:absolute;left:70px;bottom:34px;font-size:13px">Made by Junaid</div>`,
  ),
});

// The itch.io cover has its own script: scripts/itch-cover.mjs.

const channel = process.env.BRAND_BROWSER ?? 'msedge';
const browser = await chromium.launch({ channel });
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 1 });
  await page.setContent(job.html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const jpeg = job.out.endsWith('.jpg');
  await page.screenshot({ path: resolve(job.out), ...(jpeg ? { type: 'jpeg', quality: 88 } : { omitBackground: !!job.transparent }) });
  await page.close();
  console.log('wrote', job.out);
}
await browser.close();

copyFileSync('art/brand/mark-small.svg', 'public/favicon.svg');
writeFileSync(
  'public/site.webmanifest',
  JSON.stringify(
    {
      name: 'Outrun Your Soul',
      short_name: 'Outrun',
      description: 'Your body can outrun death. Your soul cannot.',
      start_url: './',
      display: 'fullscreen',
      orientation: 'portrait',
      background_color: '#14215a',
      theme_color: '#14215a',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log('wrote public/favicon.svg, public/site.webmanifest');
