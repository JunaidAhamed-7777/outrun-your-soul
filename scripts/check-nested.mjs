#!/usr/bin/env node
// Serve the built game under an itch.io-like nested, case-sensitive URL inside a
// cross-origin iframe and crawl every reference. Fails on any non-200.
//
//   npm run check:nested                      (checks dist/)
//   node scripts/check-nested.mjs --zip latest   (checks the newest release/*.zip — the exact upload bytes)
//   node scripts/check-nested.mjs --zip release/<name>.zip
//   node scripts/check-nested.mjs --serve        (keep serving; open the printed embed URL in a browser)
//
// A fetch-based crawler: it proves URLs resolve and serve, not that the game runs.
// Runtime behaviour in the iframe still needs a browser (and the real itch.io upload).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { formatBytes, readTree } from './lib/files.mjs';
import { crawlNested, startNestedServers } from './lib/nested.mjs';
import { readZip } from './lib/zip.mjs';

const args = parseArgs(process.argv.slice(2));
const root = process.cwd();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--serve' || a === '--json') out[a.slice(2)] = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

function latestZip() {
  const dir = join(root, 'release');
  if (!existsSync(dir)) return null;
  const zips = readdirSync(dir)
    .filter((n) => n.endsWith('.zip'))
    .map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return zips[0] ? join(dir, zips[0].n) : null;
}

/** MODEL_IDS from the renderer contract, so optional runtime models can be reported. */
function runtimeModelIds() {
  const contract = join(root, 'src', 'render', 'contract.ts');
  if (!existsSync(contract)) return [];
  const match = /MODEL_IDS\s*=\s*\[([\s\S]*?)\]/.exec(readFileSync(contract, 'utf8'));
  return match ? [...match[1].matchAll(/['"]([\w-]+)['"]/g)].map((m) => m[1]) : [];
}

let source;
let files;
if (args.zip) {
  const zipPath = args.zip === 'latest' ? latestZip() : resolve(root, args.zip);
  if (!zipPath || !existsSync(zipPath)) {
    console.error(`FAIL: ZIP not found (${args.zip}). Run "npm run package" first.`);
    process.exit(1);
  }
  source = `ZIP ${zipPath}`;
  files = readZip(new Uint8Array(readFileSync(zipPath)));
} else {
  const dir = resolve(root, args.dir ?? 'dist');
  if (!existsSync(join(dir, 'index.html'))) {
    console.error(`FAIL: ${join(dir, 'index.html')} not found. Run "npm run build" first.`);
    process.exit(1);
  }
  source = `directory ${dir}`;
  files = readTree(dir);
}

const map = new Map(files.map((f) => [f.path, f.data]));
const servers = await startNestedServers(map);
let report;
try {
  report = await crawlNested(servers, files.map((f) => f.path));
} catch (error) {
  await servers.close();
  console.error(`FAIL: crawl error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

console.log(`Nested itch-style check of ${source}`);
console.log(`  ${files.length} files, ${formatBytes(files.reduce((s, f) => s + f.size, 0))}`);
console.log(`  embed page (origin A): ${servers.embedUrl}`);
console.log(`  game URL   (origin B): ${servers.gameUrl}\n`);
console.log('Crawled from the embed iframe:');
for (const c of report.crawled) {
  const rel = c.url.startsWith(servers.gameOrigin) ? c.url.slice(servers.gameOrigin.length) : c.url;
  console.log(`  ${c.status === 200 ? 'ok ' : 'ERR'} ${c.status} ${rel}  [${c.kind}; ${c.type || 'no type'}]`);
}
if (report.packageChecks.length > 0) {
  console.log('\nPackaged files not statically referenced (requested directly; runtime-constructed URLs):');
  for (const p of report.packageChecks) console.log(`  ${p.status === 200 ? 'ok ' : 'ERR'} ${p.status} ${p.path}  [${p.type}]`);
}
const modelIds = runtimeModelIds();
if (modelIds.length > 0) {
  const packaged = modelIds.filter((id) => map.has(`assets/models/${id}.glb`));
  const absent = modelIds.filter((id) => !map.has(`assets/models/${id}.glb`));
  console.log(`\nRuntime MODEL_IDS (src/render/contract.ts): ${packaged.length}/${modelIds.length} packaged as assets/models/<id>.glb`);
  if (absent.length > 0) console.log(`  not packaged (renderer uses placeholders by contract): ${absent.join(', ')}`);
}

if (args.json) console.log(JSON.stringify(report, null, 2));
if (report.ok) console.log(`\nPASS: ${report.crawled.length} crawled + ${report.packageChecks.length} direct requests, all HTTP 200 under ${servers.prefix}`);
else {
  console.log(`\nFAIL: ${report.failures.length} problem(s)`);
  for (const f of report.failures) console.log(`  - ${f.url}: ${f.problem}${f.via ? ` (referenced by ${f.via})` : ''}`);
}

if (args.serve) {
  console.log('\nServing until Ctrl+C. Open the embed page URL above in a browser to play inside the nested iframe.');
} else {
  await servers.close();
  process.exit(report.ok ? 0 : 1);
}
