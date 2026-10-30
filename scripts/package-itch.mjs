#!/usr/bin/env node
// Package the Vite build (dist/) into the itch.io HTML5 upload ZIP.
//
//   npm run package                 (vite build, then this script)
//   node scripts/package-itch.mjs [--dist dist] [--out release] [--json]
//
// Refuses to write a ZIP when the package violates itch.io's documented HTML5 rules
// (https://itch.io/docs/creators/html5) or this project's packaging policy. After
// writing, it re-reads the archive and re-checks the exact bytes that would be
// uploaded. Prints the ZIP name, byte size and SHA-256 and writes a JSON manifest.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkPackage, ITCH_LIMITS, PROJECT_TARGETS } from './lib/dist-check.mjs';
import { formatBytes, readTree, sha256 } from './lib/files.mjs';
import { buildZip, readZip, zipEntryNames } from './lib/zip.mjs';

const args = parseArgs(process.argv.slice(2));
const root = process.cwd();
const distDir = resolve(root, args.dist ?? 'dist');
const outDir = resolve(root, args.out ?? 'release');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

function git(...gitArgs) {
  try {
    return execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function packageVersion(name) {
  try {
    return JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return 'not installed';
  }
}

function printFindings(label, list) {
  if (list.length === 0) return;
  console.log(`\n${label} (${list.length}):`);
  for (const f of list) console.log(`  - [${f.code}]${f.path ? ` ${f.path}:` : ''} ${f.message}`);
}

if (!existsSync(join(distDir, 'index.html'))) {
  console.error(`FAIL: ${join(distDir, 'index.html')} not found. Run "npm run build" (or "npm run package", which builds first).`);
  process.exit(1);
}

const files = readTree(distDir);
const report = checkPackage(files);
console.log(`Checked ${report.totals.files} files, ${formatBytes(report.totals.bytes)} extracted, in ${distDir}`);
printFindings('ERRORS', report.errors);
printFindings('Warnings', report.warnings);
for (const note of report.notes) console.log(`  note: ${note}`);
if (!report.ok) {
  console.error('\nFAIL: package violates itch.io HTML5 rules or project policy; no ZIP written.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const commit = git('rev-parse', 'HEAD') ?? 'unknown';
const short = git('rev-parse', '--short=7', 'HEAD') ?? 'nogit';
const porcelain = git('status', '--porcelain', '--untracked-files=normal');
const dirtyFiles = porcelain ? porcelain.split('\n').filter(Boolean) : [];
const dirty = porcelain === null || dirtyFiles.length > 0;
// A dirty tree is marked in the file name so a ZIP can never be mistaken for the clean commit build.
const stem = `${pkg.name}-${pkg.version}-${short}${dirty ? '-dirty' : ''}`;
const zipName = `${stem}.zip`;

const zip = buildZip(files);
const zipHash = sha256(zip);

// Verify the exact archive bytes: forward-slash names, identical content, same checks pass.
const names = zipEntryNames(zip);
const badNames = names.filter((n) => n.includes('\\') || n.startsWith('/'));
if (badNames.length > 0) {
  console.error(`FAIL: archive contains non-POSIX entry names: ${badNames.join(', ')}`);
  process.exit(1);
}
const extracted = readZip(zip);
const sourceHashes = new Map(files.map((f) => [f.path, f.sha256]));
const mismatched = extracted.filter((f) => sourceHashes.get(f.path) !== sha256(f.data));
if (extracted.length !== files.length || mismatched.length > 0) {
  console.error('FAIL: archive contents differ from dist/ after round trip');
  process.exit(1);
}
const zipReport = checkPackage(extracted);
if (!zipReport.ok) {
  printFindings('ARCHIVE ERRORS', zipReport.errors);
  console.error('FAIL: extracted archive does not pass package checks');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const zipPath = join(outDir, zipName);
writeFileSync(zipPath, zip);
const manifest = {
  name: zipName,
  zip: { file: zipName, bytes: zip.byteLength, sha256: zipHash },
  version: pkg.version,
  git: { commit, short, dirty, dirtyFiles },
  tools: {
    node: process.version,
    vite: packageVersion('vite'),
    typescript: packageVersion('typescript'),
    three: packageVersion('three'),
    fflate: packageVersion('fflate'),
  },
  itchLimits: ITCH_LIMITS,
  projectTargets: PROJECT_TARGETS,
  totals: { files: files.length, extractedBytes: report.totals.bytes, zipBytes: zip.byteLength },
  warnings: report.warnings,
  unreferencedStatically: report.unreferenced,
  files: files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })),
  createdAt: new Date().toISOString(),
};
const manifestPath = join(outDir, `${stem}.json`);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const pct = (n, d) => `${((100 * n) / d).toFixed(2)}%`;
console.log(`
itch.io HTML5 limits (${ITCH_LIMITS.source}, fetched ${ITCH_LIMITS.fetched}):
  files            ${String(files.length).padStart(12)} / ${ITCH_LIMITS.maxFiles} (${pct(files.length, ITCH_LIMITS.maxFiles)})
  extracted bytes  ${String(report.totals.bytes).padStart(12)} / ${ITCH_LIMITS.maxTotalBytes} (${pct(report.totals.bytes, ITCH_LIMITS.maxTotalBytes)})
  largest file     ${String(Math.max(...files.map((f) => f.size))).padStart(12)} / ${ITCH_LIMITS.maxFileBytes}
  longest path     ${String(Math.max(...files.map((f) => f.path.length))).padStart(12)} / ${ITCH_LIMITS.maxPathLength} chars
Project target (unmeasured proposal): ZIP ${formatBytes(zip.byteLength)} vs ${formatBytes(PROJECT_TARGETS.fullPayloadBytes)} full-payload target

PACKAGED ${dirty ? '(DIRTY WORKING TREE — not a releasable commit build)' : ''}
  ZIP     ${zipPath}
  name    ${zipName}
  bytes   ${zip.byteLength}
  sha256  ${zipHash}
  commit  ${commit}${dirty ? ' + uncommitted changes' : ''}
  manifest ${manifestPath}`);
if (args.json) console.log(JSON.stringify({ zip: zipPath, name: zipName, bytes: zip.byteLength, sha256: zipHash, commit, dirty }));
