import { afterEach, describe, expect, it } from 'vitest';
import { crawlNested, startNestedServers, type NestedServers } from '../../scripts/lib/nested.mjs';

const enc = new TextEncoder();
let servers: NestedServers | null = null;

afterEach(async () => {
  await servers?.close();
  servers = null;
});

function pkg(entries: Record<string, string>): Map<string, Uint8Array> {
  return new Map(Object.entries(entries).map(([k, v]) => [k, enc.encode(v)]));
}

const goodIndex = `<!doctype html><html><head>
<script type="module" crossorigin src="./assets/index-1.js"></script>
<link rel="stylesheet" href="./assets/index-1.css"></head><body></body></html>`;

describe('nested itch-style hosting check', () => {
  it('passes a relative package and also requests runtime-constructed files', async () => {
    const files = pkg({
      'index.html': goodIndex,
      'assets/index-1.js': 'import "./chunk-2.js";const u=new URL("pic.png",import.meta.url);const m="./"+"assets/models/"+id+".glb";',
      'assets/chunk-2.js': 'export {}',
      'assets/pic.png': 'png',
      'assets/index-1.css': 'a{background:url(./bg.png)}',
      'assets/bg.png': 'png',
      'assets/models/courier_body.glb': 'glb',
    });
    servers = await startNestedServers(files);
    const report = await crawlNested(servers, [...files.keys()]);
    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.crawled.map((c) => c.kind)).toEqual(expect.arrayContaining(['iframe', 'module', 'link', 'url-ref', 'css-ref']));
    expect(report.packageChecks.map((p) => p.path)).toEqual(['assets/models/courier_body.glb']);
    expect(report.packageChecks[0]?.type).toBe('model/gltf-binary');
  });

  it('fails a root-absolute script that works at localhost root but not on itch', async () => {
    const files = pkg({
      'index.html': '<script type="module" src="/assets/index-1.js"></script>',
      'assets/index-1.js': 'export {}',
    });
    servers = await startNestedServers(files);
    const report = await crawlNested(servers, [...files.keys()]);
    expect(report.ok).toBe(false);
    expect(report.failures[0]?.problem).toBe('HTTP 404');
  });

  it('fails a root-absolute string literal inside the bundle', async () => {
    const files = pkg({ 'index.html': goodIndex.replace('<link rel="stylesheet" href="./assets/index-1.css">', ''), 'assets/index-1.js': 'fetch("/assets/models/x.glb")', 'assets/models/x.glb': 'g' });
    servers = await startNestedServers(files);
    const report = await crawlNested(servers, [...files.keys()]);
    expect(report.ok).toBe(false);
    expect(report.failures.some((f) => f.url.endsWith('/assets/models/x.glb') && !f.url.includes('/html/'))).toBe(true);
  });

  it('is case-sensitive like the itch.io file host', async () => {
    const files = pkg({ 'index.html': '<script type="module" src="./assets/Index-1.js"></script>', 'assets/index-1.js': 'export {}' });
    servers = await startNestedServers(files);
    const report = await crawlNested(servers, [...files.keys()]);
    expect(report.ok).toBe(false);
  });

  it('returns 403 for directory URLs and serves the iframe from a different origin', async () => {
    servers = await startNestedServers(pkg({ 'index.html': '' }));
    expect((await fetch(`${servers.gameOrigin}${servers.prefix}`)).status).toBe(403);
    expect(new URL(servers.embedUrl).origin).not.toBe(servers.gameOrigin);
  });

  it('fails when a module script is served with a non-JavaScript MIME type', async () => {
    const files = pkg({ 'index.html': '<script type="module" src="./assets/game.data"></script>', 'assets/game.data': 'x' });
    servers = await startNestedServers(files);
    const report = await crawlNested(servers, [...files.keys()]);
    expect(report.failures.map((f) => f.problem).join()).toMatch(/MIME/);
  });
});
