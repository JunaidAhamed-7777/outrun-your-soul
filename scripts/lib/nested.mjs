// Local stand-in for itch.io HTML5 hosting: the game is served from a nested,
// case-sensitive path on its own origin and embedded by an iframe from a second
// origin, like itch.io's project page + CDN. Root-absolute URLs, wrong case and
// directory URLs fail here the way the itch.io docs say they fail there
// (https://itch.io/docs/creators/html5: absolute paths fail, paths ending in "/"
// return 403, hosting is case-sensitive). Not a substitute for testing the real upload.
import { createServer } from 'node:http';
import { contentTypeFor, extensionOf } from './files.mjs';
import { cssRefs, htmlRefs, inlineScripts, isExternalOrInline, jsRefs } from './refs.mjs';

export const DEFAULT_PREFIX = '/html/1234567/';

function listen(handler) {
  return new Promise((resolveListen, reject) => {
    const server = createServer(handler);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen(server));
  });
}

/**
 * @param {Map<string, Uint8Array>} files package-relative POSIX path -> bytes
 * @param {{ prefix?: string }} [options]
 */
export async function startNestedServers(files, options = {}) {
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const log = [];
  const game = await listen((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let status = 404;
    let body = 'Not found';
    let type = 'text/plain; charset=utf-8';
    if (url.pathname.startsWith(prefix)) {
      let rel;
      try {
        rel = decodeURIComponent(url.pathname.slice(prefix.length));
      } catch {
        rel = null;
      }
      if (rel === null) {
        status = 400;
        body = 'Bad request';
      } else if (rel === '' || rel.endsWith('/')) {
        status = 403; // itch.io: "paths ending in / return a 403 error"
        body = 'Forbidden';
      } else if (files.has(rel)) {
        status = 200;
        body = files.get(rel);
        type = contentTypeFor(rel);
      }
    }
    log.push({ path: url.pathname, status });
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  const gameOrigin = `http://127.0.0.1:${game.address().port}`;
  const gameUrl = `${gameOrigin}${prefix}index.html`;
  const embedHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Nested embed check</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#222;display:grid;place-items:center;height:100vh}iframe{border:0;width:360px;height:640px;background:#000}</style>
</head><body><iframe id="game_drop" src="${gameUrl}" allow="autoplay; fullscreen *; gamepad; accelerometer; gyroscope" allowfullscreen scrolling="no"></iframe></body></html>`;
  const page = await listen((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const ok = url.pathname === '/' || url.pathname === '/index.html';
    res.writeHead(ok ? 200 : 404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(ok ? embedHtml : 'Not found');
  });
  const embedUrl = `http://127.0.0.1:${page.address().port}/`;
  return {
    prefix,
    gameOrigin,
    gameUrl,
    embedUrl,
    log,
    close: () => Promise.all([game, page].map((s) => new Promise((r) => s.close(() => r(undefined))))),
  };
}

const JS_TYPES = /^(text|application)\/(javascript|ecmascript)\b/;

/**
 * Crawl from the embed page through the iframe into the game, following every static
 * reference, then request every packaged file. Fails on any non-200 reference.
 * @param {{ embedUrl: string, gameUrl: string, prefix: string, gameOrigin: string }} servers
 * @param {string[]} packagePaths every file in the package
 */
export async function crawlNested(servers, packagePaths) {
  const results = new Map(); // url -> { url, status, type, via, kind }
  const failures = [];
  const queue = [];
  const enqueue = (url, via, kind) => {
    const key = url.split('#')[0];
    if (!results.has(key) && !queue.some((q) => q.url === key)) queue.push({ url: key, via, kind });
  };

  const embed = await fetch(servers.embedUrl);
  const embedHtml = await embed.text();
  if (embed.status !== 200) failures.push({ url: servers.embedUrl, problem: `embed page returned ${embed.status}` });
  const iframe = htmlRefs(embedHtml).find((r) => r.tag === 'iframe');
  if (!iframe) failures.push({ url: servers.embedUrl, problem: 'embed page has no iframe' });
  else enqueue(new URL(iframe.url, servers.embedUrl).href, servers.embedUrl, 'iframe');

  const gameBase = servers.gameUrl; // document base for BASE_URL-relative literals
  while (queue.length > 0) {
    const item = queue.shift();
    const response = await fetch(item.url);
    const type = response.headers.get('content-type') ?? '';
    const bytes = new Uint8Array(await response.arrayBuffer());
    const entry = { ...item, status: response.status, type };
    results.set(item.url, entry);
    if (response.status !== 200) {
      failures.push({ url: item.url, problem: `HTTP ${response.status}`, via: item.via });
      continue;
    }
    if ((item.kind === 'module' || item.kind === 'script') && !JS_TYPES.test(type)) {
      failures.push({ url: item.url, problem: `script served as "${type}" (module scripts need a JavaScript MIME type)`, via: item.via });
    }
    const path = new URL(item.url).pathname;
    const ext = extensionOf(path);
    const text = ['.html', '.htm', '.js', '.mjs', '.css'].includes(ext) ? new TextDecoder().decode(bytes) : null;
    if (text === null) continue;
    if (ext === '.html' || ext === '.htm') {
      for (const ref of htmlRefs(text)) {
        if (ref.tag === 'a' || isExternalOrInline(ref.url)) continue;
        const kind = ref.tag === 'script' ? 'module' : ref.rel === 'modulepreload' ? 'module' : ref.tag;
        enqueue(new URL(ref.url, item.url).href, item.url, kind);
      }
      for (const script of inlineScripts(text)) followJs(script, item.url);
    } else if (ext === '.css') {
      for (const ref of cssRefs(text)) if (!isExternalOrInline(ref)) enqueue(new URL(ref, item.url).href, item.url, 'css-ref');
    } else {
      followJs(text, item.url);
    }
  }

  function followJs(js, moduleUrl) {
    const refs = jsRefs(js);
    for (const spec of refs.moduleImports) enqueue(new URL(spec, moduleUrl).href, moduleUrl, 'module');
    for (const spec of refs.urlRefs) if (!isExternalOrInline(spec)) enqueue(new URL(spec, moduleUrl).href, moduleUrl, 'url-ref');
    // Root-absolute literals resolve against the origin root, outside the nested prefix -> 404 -> FAIL.
    for (const lit of refs.rootAbsolute) enqueue(new URL(lit, moduleUrl).href, moduleUrl, 'root-absolute-literal');
    for (const lit of refs.assetLiterals) {
      // Base is ambiguous for plain literals: prefer the document, accept the module directory.
      const viaDoc = new URL(lit, gameBase).href;
      const viaModule = new URL(lit, moduleUrl).href;
      const docPath = viaDoc.slice(servers.gameOrigin.length + servers.prefix.length);
      const modulePath = viaModule.slice(servers.gameOrigin.length + servers.prefix.length);
      const chosen = packagePaths.includes(decodeURIComponent(docPath)) || !packagePaths.includes(decodeURIComponent(modulePath)) ? viaDoc : viaModule;
      enqueue(chosen, moduleUrl, 'asset-literal');
    }
  }

  // Every packaged file must also be servable at its document-relative nested URL
  // (covers runtime-constructed URLs such as BASE_URL + "assets/models/" + id + ".glb").
  const discovered = new Set([...results.keys()]);
  const packageChecks = [];
  for (const path of packagePaths) {
    const url = new URL(path.split('/').map(encodeURIComponent).join('/'), gameBase).href;
    if (discovered.has(url)) continue;
    const response = await fetch(url, { method: 'HEAD' });
    packageChecks.push({ path, url, status: response.status, type: response.headers.get('content-type') ?? '' });
    if (response.status !== 200) failures.push({ url, problem: `packaged file not servable: HTTP ${response.status}` });
  }

  return {
    ok: failures.length === 0,
    failures,
    crawled: [...results.values()],
    packageChecks,
  };
}
