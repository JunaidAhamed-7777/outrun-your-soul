#!/usr/bin/env node
/**
 * itch.io cover image (630x500 layout, rendered at 2x = 1260x1000 for sharp display).
 * Built from a real gameplay frame (art/brand/cover-hero.png: a locked amber shot on the
 * body, the thread bent back to the trailing soul) plus the wordmark and mark. Uses the
 * installed Edge; downloads nothing.
 *
 *   node scripts/itch-cover.mjs   -> art/brand/itch-cover.png
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const uri = (p, type) => `data:${type};base64,${readFileSync(p).toString('base64')}`;
const hero = uri('art/brand/cover-hero.png', 'image/png');
const mark = uri('art/brand/mark.svg', 'image/svg+xml');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 630px; height: 500px; overflow: hidden; background: #0b1236; }
  .shot {
    position: absolute; inset: 0;
    background: url(${hero}) no-repeat;
    /* Frame the action: body, bent thread, soul and the locked amber shot. */
    background-size: 700px auto; background-position: 30px -420px;
  }
  .vignette { position: absolute; inset: 0;
    background:
      linear-gradient(90deg, rgba(9,15,48,0.97) 0%, rgba(11,18,54,0.88) 30%, rgba(14,24,72,0.35) 46%, rgba(14,24,72,0) 58%),
      linear-gradient(0deg, rgba(9,15,48,0.85) 0%, rgba(9,15,48,0) 26%),
      radial-gradient(120% 90% at 85% 40%, rgba(0,0,0,0) 55%, rgba(5,8,30,0.55) 100%); }
  .glow { position: absolute; left: -120px; top: -60px; width: 520px; height: 420px;
    background: radial-gradient(closest-side, rgba(63,102,204,0.55), rgba(63,102,204,0)); }
  .copy { position: absolute; left: 30px; top: 34px; width: 330px; }
  .mark { width: 62px; height: 62px; filter: drop-shadow(0 6px 14px rgba(5,8,30,.6)); }
  .k { margin-top: 16px; font: 700 11px/1 'Segoe UI', system-ui, sans-serif; letter-spacing: .34em; text-transform: uppercase; color: #d9a43c; }
  .w1 { margin-top: 12px; font: 400 66px/0.9 'Palatino Linotype', Palatino, Georgia, serif; letter-spacing: .03em; color: #f4ecd8;
        text-shadow: 0 4px 22px rgba(5,8,30,.75); }
  .w2 { margin-top: 6px; font: 400 32px/1 'Palatino Linotype', Palatino, Georgia, serif; letter-spacing: .3em; color: #ffd27a;
        text-shadow: 0 3px 16px rgba(5,8,30,.75); }
  /* The motif: body racing ahead on the thread, soul trailing. */
  .thread { position: relative; margin: 18px 0 16px; width: 220px; height: 14px; }
  .thread i { position: absolute; left: 0; right: 14px; top: 6px; height: 3px; border-radius: 3px;
              background: linear-gradient(90deg, rgba(232,65,31,0.15), #e8411f); }
  .thread .soul { position: absolute; left: 0; top: 1px; width: 12px; height: 12px; border-radius: 50%; background: #c9f2ff;
                  box-shadow: 0 0 10px 4px rgba(92,200,255,.75); }
  .thread .body { position: absolute; right: 0; top: -1px; width: 16px; height: 16px; border-radius: 50%; background: #f4ecd8;
                  box-shadow: 0 0 0 2px #14215a; }
  .hook { font: italic 21px/1.28 'Palatino Linotype', Palatino, Georgia, serif; color: #f4ecd8; text-shadow: 0 2px 10px rgba(5,8,30,.8); }
  .hook b { font-weight: 400; color: #9fe3ff; }
  .pill { position: absolute; left: 30px; bottom: 26px; padding: 9px 14px 8px; border-radius: 999px;
          border: 1.5px solid #d9a43c; background: rgba(9,15,48,0.75);
          font: 700 11px/1 'Segoe UI', system-ui, sans-serif; letter-spacing: .2em; text-transform: uppercase; color: #f4ecd8; }
  .pill span { color: #d9a43c; }
</style></head><body>
  <div class="shot"></div><div class="vignette"></div><div class="glow"></div>
  <div class="copy">
    <img class="mark" src="${mark}">
    <div class="k">A funeral-railway escape</div>
    <div class="w1">OUTRUN</div>
    <div class="w2">YOUR SOUL</div>
    <div class="thread"><i></i><div class="soul"></div><div class="body"></div></div>
    <div class="hook">Your body is fast.<br><b>Your soul is not.</b></div>
  </div>
  <div class="pill">▶ Play in browser <span>·</span> touch &amp; mouse</div>
</body></html>`;

const browser = await chromium.launch({ channel: process.env.BRAND_BROWSER ?? 'msedge' });
const page = await browser.newPage({ viewport: { width: 630, height: 500 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve('art/brand/itch-cover.png') });
await browser.close();
console.log('wrote art/brand/itch-cover.png (1260x1000, 630x500 layout)');
